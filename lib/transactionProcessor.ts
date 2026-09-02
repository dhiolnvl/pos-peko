import { supabase } from './supabase';
import { useAuthStore } from '@/store/authStore';
import { useShiftStore } from '@/store/shiftStore';
import { calcPoints, getPointsPerRupiah } from './memberQueries';
import type { CartItem, Discount, PaymentMethod } from '@/store/posStore';
import { calcItemDiscountAmount } from '@/store/posStore';
import type { Member } from './memberQueries';
import { offlineQueue } from './offlineQueue';
import { offlineCache } from './offlineCache';

export interface TransactionInput {
  cart: CartItem[];
  discount: Discount;
  paymentMethod: PaymentMethod;
  note: string;
  paymentAmount: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  member?: Member | null;
  // snapshot shift saat transaksi dibuat — dipakai saat replay dari offline queue
  shiftSnapshot?: import('./shiftQueries').Shift | null;
  // untuk split payment: nominal tunai + metode kedua + nominal kedua
  splitPayment?: {
    cashAmount: number;
    secondMethod: 'transfer' | 'qris';
    secondAmount: number;
  } | null;
  deliveryFee?: number;
}

export interface TransactionResult {
  transaction: {
    id: string;
    invoice_number: string;
    total: number;
    payment_amount: number;
    change_amount: number;
    payment_method: PaymentMethod;
    created_at: string;
    splitPayment?: { cashAmount: number; secondMethod: 'transfer' | 'qris'; secondAmount: number } | null;
  };
  lowStockItems: { id: string; name: string; stock: number; min_stock: number }[];
  pointsEarned: number;
  member: Member | null;
  isOffline?: boolean;
}

const generateUUID = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

export const processTransaction = async (
  input: TransactionInput
): Promise<TransactionResult> => {
  const {
    cart,
    discount,
    paymentMethod,
    note,
    paymentAmount,
    subtotal,
    discountAmount,
    taxAmount,
    total,
    member = null,
  } = input;

  const authState = useAuthStore.getState();
  const cashierId = authState.user?.id;
  const branchId = authState.currentBranch?.id;

  // Gunakan shiftSnapshot dari input jika ada (saat replay dari offline queue),
  // fallback ke activeShift dari store (saat transaksi baru)
  const shiftSource = input.shiftSnapshot ?? useShiftStore.getState().activeShift ?? null;
  let shiftId = shiftSource?.id ?? null;

  if (!cashierId || !branchId) throw new Error('User atau cabang tidak ditemukan');
  if (cart.length === 0) throw new Error('Keranjang kosong');

  // Pastikan shift benar-benar ada di Supabase sebelum digunakan sebagai FK.
  // Selalu upsert (ignoreDuplicates) agar shift offline yang belum sync bisa masuk.
  // Jika upsert gagal (network), set shiftId = null agar tidak FK violation.
  if (shiftId && shiftSource) {
    try {
      const { error: upsertErr } = await supabase.from('shifts').upsert({
        id: shiftSource.id,
        branch_id: shiftSource.branch_id,
        cashier_id: shiftSource.cashier_id,
        cashier_name: shiftSource.cashier_name,
        opening_cash: shiftSource.opening_cash,
        opened_at: shiftSource.opened_at,
        status: shiftSource.status,
        notes: shiftSource.notes,
        created_at: shiftSource.created_at ?? new Date().toISOString(),
      }, { onConflict: 'id', ignoreDuplicates: true });
      if (upsertErr) {
        shiftId = null;
      } else {
        await offlineCache.savePendingShift(null);
      }
    } catch {
      shiftId = null;
    }
  }

  // Untuk split payment: payment_amount = total tunai, change = kembalian dari tunai
  const isSplit = paymentMethod === 'split' && input.splitPayment != null;
  const effectivePaymentMethod = isSplit ? 'split' : paymentMethod;
  const effectivePaymentAmount = isSplit ? input.splitPayment!.cashAmount : paymentAmount;

  const now = new Date().toISOString();
  const transactionId = generateUUID();
  const changeAmount = isSplit
    ? Math.max(0, input.splitPayment!.cashAmount - (total - input.splitPayment!.secondAmount))
    : Math.max(0, paymentAmount - total);

  const pointsPerRupiah = member ? await getPointsPerRupiah() : 0;
  const pointsEarned = member ? calcPoints(total, pointsPerRupiah) : 0;

  const items = cart.map((item) => ({
    // productId di cart bisa berformat "uuid__unitId" — ambil product_id asli
    product_id: item.unitId ? item.productId.split('__')[0] : item.productId,
    product_name: item.productName,
    product_barcode: item.productBarcode ?? null,
    quantity: item.quantity,
    price: item.price,
    discount_amount: calcItemDiscountAmount(item.quantity, item.price, item.discount ?? { type: 'nominal', value: 0 }),
    discount_type: item.discount?.type ?? 'nominal',
    unit_label: item.unitLabel ?? null,
    unit_multiplier: item.unitMultiplier ?? 1,
    subtotal: item.subtotal,
  }));

  try {
    const { data, error } = await supabase.rpc('process_transaction', {
      p_transaction_id:        transactionId,
      p_branch_id:             branchId,
      p_cashier_id:            cashierId,
      p_shift_id:              shiftId,
      p_subtotal:              subtotal,
      p_discount_amount:       discountAmount,
      p_discount_type:         discount.type,
      p_tax_amount:            taxAmount,
      p_total:                 total,
      p_payment_method:        effectivePaymentMethod,
      p_payment_amount:        effectivePaymentAmount,
      p_change_amount:         changeAmount,
      p_notes:                 note || null,
      p_member_id:             member?.id ?? null,
      p_points_earned:         pointsEarned,
      p_items:                 items,
      p_created_at:            now,
      p_split_payment_detail:  isSplit ? input.splitPayment : null,
      p_delivery_fee:          input.deliveryFee ?? 0,
    });

    if (error) throw new Error(error.message);

    const result = data as {
      invoice_number: string;
      low_stock_items: { id: string; name: string; stock: number; min_stock: number }[];
    };

    return {
      transaction: {
        id: transactionId,
        invoice_number: result.invoice_number,
        total,
        payment_amount: effectivePaymentAmount,
        change_amount: changeAmount,
        payment_method: effectivePaymentMethod,
        created_at: now,
        splitPayment: isSplit ? input.splitPayment : null,
      },
      lowStockItems: result.low_stock_items ?? [],
      pointsEarned,
      member,
      isOffline: false,
    };
  } catch (err: any) {
    const msg: string = err?.message ?? '';

    // Hanya simpan ke offline queue jika benar-benar network error.
    // Error dari Supabase/DB (ada message spesifik) langsung dilempar ke caller.
    const isNetworkError =
      msg.includes('Failed to fetch') ||
      msg.includes('Network request failed') ||
      msg.includes('fetch') ||
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('ERR_NETWORK') ||
      msg === '' ||
      err?.code === 'ECONNABORTED';

    if (!isNetworkError) {
      throw err;
    }

    const { localId, transactionId } = await offlineQueue.enqueue(input);
    const invoiceNumber = `OFF-${now.slice(0, 10).replace(/-/g, '')}-${localId.slice(-6).toUpperCase()}`;

    return {
      transaction: {
        id: transactionId,
        invoice_number: invoiceNumber,
        total,
        payment_amount: paymentAmount,
        change_amount: changeAmount,
        payment_method: paymentMethod,
        created_at: now,
      },
      lowStockItems: [],
      pointsEarned: 0,
      member,
      isOffline: true,
    };
  }
};
