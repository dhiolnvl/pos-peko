import { useCallback, useEffect, useRef, useState } from 'react';
import { useNetworkStatus } from './useNetworkStatus';
import { offlineQueue } from '@/lib/offlineQueue';
import { offlineCache } from '@/lib/offlineCache';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useShiftStore } from '@/store/shiftStore';
import { calcPoints, getPointsPerRupiah } from '@/lib/memberQueries';
import { calcItemDiscountAmount } from '@/store/posStore';

const MAX_RETRIES = 3;

export const useOfflineSync = () => {
  const { isOnline } = useNetworkStatus();
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const wasPreviouslyOffline = useRef<boolean | null>(null);
  const isSyncingRef = useRef(false);

  // Update pending count
  useEffect(() => {
    const refresh = async () => {
      const count = await offlineQueue.count();
      setPendingCount(count);
    };
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, []);

  const flushQueue = useCallback(async () => {
    if (isSyncingRef.current) return;

    // Sync pending shift dulu sebelum transaksi
    const pendingShift = await offlineCache.getPendingShift();
    if (pendingShift) {
      try {
        const { error } = await supabase.from('shifts').insert({
          id: pendingShift.id,
          branch_id: pendingShift.branch_id,
          cashier_id: pendingShift.cashier_id,
          cashier_name: pendingShift.cashier_name,
          opening_cash: pendingShift.opening_cash,
          opened_at: pendingShift.opened_at,
          status: pendingShift.status,
          notes: pendingShift.notes,
          created_at: pendingShift.created_at,
        });
        if (!error) {
          await offlineCache.savePendingShift(null);
          // Update shiftStore supaya halaman kasir langsung tahu shift sudah aktif
          const currentShift = useShiftStore.getState().activeShift;
          if (!currentShift || currentShift.id === pendingShift.id) {
            useShiftStore.getState().setActiveShift(pendingShift);
          }
        }
      } catch {}
    }

    const queue = await offlineQueue.getAll();
    if (queue.length === 0) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    setLastSyncError(null);

    const authState = useAuthStore.getState();
    const cashierId = authState.user?.id;
    const branchId = authState.currentBranch?.id;
    const shiftId = useShiftStore.getState().activeShift?.id ?? null;

    if (!cashierId || !branchId) {
      isSyncingRef.current = false;
      setIsSyncing(false);
      return;
    }

    for (const order of queue) {
      if (order.retries >= MAX_RETRIES) {
        await offlineQueue.remove(order.localId);
        continue;
      }

      try {
        const { input } = order;
        const { cart, discount, paymentMethod, note, paymentAmount, subtotal, discountAmount, taxAmount, total, member } = input;

        const pointsPerRupiah = member ? await getPointsPerRupiah() : 0;
        const pointsEarned = member ? calcPoints(total, pointsPerRupiah) : 0;
        const changeAmount = Math.max(0, paymentAmount - total);

        const items = cart.map((item) => ({
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

        const { error } = await supabase.rpc('process_transaction', {
          p_transaction_id:  order.transactionId,
          p_branch_id:       branchId,
          p_cashier_id:      cashierId,
          p_shift_id:        shiftId,
          p_subtotal:        subtotal,
          p_discount_amount: discountAmount,
          p_discount_type:   discount.type,
          p_tax_amount:      taxAmount,
          p_total:           total,
          p_payment_method:  paymentMethod,
          p_payment_amount:  paymentAmount,
          p_change_amount:   changeAmount,
          p_notes:           note || null,
          p_member_id:       member?.id ?? null,
          p_points_earned:   pointsEarned,
          p_items:           items,
          p_created_at:      order.queuedAt,
        });

        if (error) throw new Error(error.message);

        await offlineQueue.remove(order.localId);
        useAuthStore.setState({ lastSyncAt: Date.now() });
      } catch (err: any) {
        await offlineQueue.incrementRetry(order.localId);
        setLastSyncError(err.message);
      }
    }

    const remaining = await offlineQueue.count();
    setPendingCount(remaining);
    isSyncingRef.current = false;
    setIsSyncing(false);
  }, []);

  // Flush queue saat koneksi kembali atau saat pertama kali online dengan queue ada
  useEffect(() => {
    const shouldSync =
      isOnline &&
      (wasPreviouslyOffline.current === true || wasPreviouslyOffline.current === null);

    if (shouldSync) {
      flushQueue();
    }
    wasPreviouslyOffline.current = !isOnline;

    // Update offline mode flag di authStore
    const authState = useAuthStore.getState();
    if (isOnline && authState.isOfflineMode) {
      useAuthStore.setState({ isOfflineMode: false });
    }
  }, [isOnline, flushQueue]);

  return { isOnline, isSyncing, pendingCount, lastSyncError, flushQueue };
};
