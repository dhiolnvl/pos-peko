/**
 * POS Store
 * Manages cart state and computed values for the cashier POS interface
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Product } from './productStore';
import type { Member } from '@/lib/memberQueries';

const HELD_KEY = 'pos.held_transactions';

export interface Discount {
  type: 'nominal' | 'percent';
  value: number;
}

export interface CartItem {
  productId: string;
  productName: string;
  productBarcode: string | null;
  price: number;
  quantity: number;
  stockAvailable: number;
  unit: string | null;
  image_url: string | null;
  discount: Discount;
  subtotal: number; // (price - item_discount_per_unit) * quantity
  // Varian satuan — null berarti produk tidak punya product_units (pakai harga produk langsung)
  unitId: string | null;
  unitLabel: string | null;
  unitMultiplier: number;
}

export type PaymentMethod = 'cash' | 'transfer' | 'qris' | 'split';

export interface HeldTransaction {
  id: string;
  cart: CartItem[];
  discount: Discount;
  paymentMethod: PaymentMethod;
  note: string;
  member: Member | null;
  heldAt: string;
}

const MAX_HELD = 5;

const readHeld = async (): Promise<HeldTransaction[]> => {
  try {
    const raw = await AsyncStorage.getItem(HELD_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HeldTransaction[];
  } catch {
    return [];
  }
};

const writeHeld = async (data: HeldTransaction[]): Promise<void> => {
  await AsyncStorage.setItem(HELD_KEY, JSON.stringify(data));
};

interface PosState {
  // State
  cart: CartItem[];
  discount: Discount;
  paymentMethod: PaymentMethod;
  note: string;
  member: Member | null;
  taxRate: number;
  deliveryFee: number;

  // Actions
  addToCart: (product: Product, unit?: { id: string; label: string; price: number; multiplier: number } | null) => void;
  removeFromCart: (productId: string) => void;
  updateQty: (productId: string, qty: number) => void;
  setItemDiscount: (productId: string, discount: Discount) => void;
  clearCart: () => void;
  setDiscount: (discount: Discount) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setNote: (note: string) => void;
  setMember: (member: Member | null) => void;
  setDeliveryFee: (fee: number) => void;
  setTaxRate: (rate: number) => void;

  // Hold
  holdTransaction: () => Promise<boolean>;
  restoreHold: (id: string) => Promise<void>;
  deleteHold: (id: string) => Promise<void>;
  getHeldTransactions: () => Promise<HeldTransaction[]>;

  // Computed getters
  getSubtotal: () => number;
  getDiscountAmount: () => number;
  getTaxAmount: () => number;
  getTotal: () => number;
  getTotalItems: () => number;
  getChangeAmount: (paymentInput: number) => number;
}

export function getActivePromoPrice(product: Product): number | null {
  if (!product.promo_price || !product.promo_start || !product.promo_end) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (today >= product.promo_start && today <= product.promo_end) return product.promo_price;
  return null;
}

export const calcItemSubtotal = (qty: number, price: number, discount: Discount): number => {
  const discountPerUnit =
    discount.type === 'percent'
      ? (discount.value / 100) * price
      : Math.min(discount.value, price);
  return Math.max(0, price - discountPerUnit) * qty;
};

export const calcItemDiscountAmount = (qty: number, price: number, discount: Discount): number => {
  const discountPerUnit =
    discount.type === 'percent'
      ? (discount.value / 100) * price
      : Math.min(discount.value, price);
  return discountPerUnit * qty;
};

export const usePosStore = create<PosState>((set, get) => ({
  // Initial state
  cart: [],
  discount: { type: 'nominal', value: 0 },
  paymentMethod: 'cash',
  note: '',
  member: null,
  taxRate: 0,
  deliveryFee: 0,

  addToCart: (product: Product, unit = null) => {
    set((state) => {
      // Key unik per kombinasi produk + satuan
      const cartKey = unit ? `${product.id}__${unit.id}` : product.id;
      const existingIndex = state.cart.findIndex((item) => item.productId === cartKey);

      // Stok yang dikonsumsi oleh satuan ini = qty × multiplier
      const multiplier = unit?.multiplier ?? 1;

      // Total stok yang sudah dikonsumsi semua item produk yang sama
      const usedStock = state.cart
        .filter((item) => item.productId === cartKey)
        .reduce((s, item) => s + item.quantity * item.unitMultiplier, 0);

      if (existingIndex >= 0) {
        const updatedCart = [...state.cart];
        const existing = updatedCart[existingIndex];
        const newQty = existing.quantity + 1;
        const newUsed = usedStock - existing.quantity * multiplier + newQty * multiplier;
        if (newUsed > product.stock) return state;

        updatedCart[existingIndex] = {
          ...existing,
          quantity: newQty,
          subtotal: calcItemSubtotal(newQty, existing.price, existing.discount),
        };
        return { cart: updatedCart };
      } else {
        if (product.stock <= 0) return state;
        if (usedStock + multiplier > product.stock) return state;

        const promoPrice = !unit ? getActivePromoPrice(product) : null;
        const price = unit?.price ?? promoPrice ?? product.price;
        const discount: Discount = { type: 'nominal', value: 0 };
        const newItem: CartItem = {
          productId: cartKey,
          productName: product.name,
          productBarcode: product.barcode,
          price,
          quantity: 1,
          stockAvailable: Math.floor(product.stock / multiplier),
          unit: product.unit,
          image_url: product.image_url,
          discount,
          subtotal: price,
          unitId: unit?.id ?? null,
          unitLabel: unit?.label ?? null,
          unitMultiplier: multiplier,
        };
        return { cart: [...state.cart, newItem] };
      }
    });
  },

  removeFromCart: (productId: string) => {
    set((state) => ({
      cart: state.cart.filter((item) => item.productId !== productId),
    }));
  },

  updateQty: (productId: string, qty: number) => {
    if (qty <= 0) {
      get().removeFromCart(productId);
      return;
    }
    set((state) => ({
      cart: state.cart.map((item) => {
        if (item.productId === productId) {
          const clamped = Math.min(qty, item.stockAvailable);
          return { ...item, quantity: clamped, subtotal: calcItemSubtotal(clamped, item.price, item.discount) };
        }
        return item;
      }),
    }));
  },

  setItemDiscount: (productId: string, discount: Discount) => {
    set((state) => ({
      cart: state.cart.map((item) => {
        if (item.productId !== productId) return item;
        return { ...item, discount, subtotal: calcItemSubtotal(item.quantity, item.price, discount) };
      }),
    }));
  },

  clearCart: () => {
    set({
      cart: [],
      discount: { type: 'nominal', value: 0 },
      paymentMethod: 'cash',
      note: '',
      member: null,
      deliveryFee: 0,
    });
  },

  setDiscount: (discount: Discount) => set({ discount }),
  setPaymentMethod: (paymentMethod: PaymentMethod) => set({ paymentMethod }),
  setNote: (note: string) => set({ note }),
  setMember: (member: Member | null) => set({ member }),
  setTaxRate: (rate: number) => set({ taxRate: rate }),
  setDeliveryFee: (deliveryFee: number) => set({ deliveryFee }),

  holdTransaction: async () => {
    const { cart, discount, paymentMethod, note, member } = get();
    if (cart.length === 0) return false;

    const held = await readHeld();
    if (held.length >= MAX_HELD) return false;

    const newHold: HeldTransaction = {
      id: `hold_${Date.now()}`,
      cart,
      discount,
      paymentMethod,
      note,
      member,
      heldAt: new Date().toISOString(),
    };
    await writeHeld([...held, newHold]);
    get().clearCart();
    return true;
  },

  restoreHold: async (id: string) => {
    const held = await readHeld();
    const target = held.find((h) => h.id === id);
    if (!target) return;

    const { cart } = get();
    if (cart.length > 0) {
      await get().holdTransaction();
    }

    set({
      cart: target.cart,
      discount: target.discount,
      paymentMethod: target.paymentMethod,
      note: target.note,
      member: target.member,
    });

    await writeHeld(held.filter((h) => h.id !== id));
  },

  deleteHold: async (id: string) => {
    const held = await readHeld();
    await writeHeld(held.filter((h) => h.id !== id));
  },

  getHeldTransactions: async () => {
    return readHeld();
  },

  // Computed getters
  getSubtotal: () =>
    get().cart.reduce((sum, item) => {
      const disc = item.discount ?? { type: 'nominal' as const, value: 0 };
      return sum + calcItemSubtotal(item.quantity, item.price, disc);
    }, 0),

  getDiscountAmount: () => {
    const { discount } = get();
    const subtotal = get().getSubtotal();
    if (discount.type === 'percent') {
      return Math.min((discount.value / 100) * subtotal, subtotal);
    }
    return Math.min(discount.value, subtotal);
  },

  getTaxAmount: () => {
    const subtotal = get().getSubtotal();
    const disc = get().getDiscountAmount();
    return (subtotal - disc) * get().taxRate;
  },

  getTotal: () => {
    const subtotal = get().getSubtotal();
    const disc = get().getDiscountAmount();
    const tax = get().getTaxAmount();
    return subtotal - disc + tax + get().deliveryFee;
  },

  getTotalItems: () =>
    get().cart.reduce((sum, item) => sum + item.quantity, 0),

  getChangeAmount: (paymentInput: number) =>
    Math.max(0, paymentInput - get().getTotal()),
}));
