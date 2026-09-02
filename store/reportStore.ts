/**
 * Report Store
 * Manages sales and stock report state.
 */

import { create } from 'zustand';
import {
  getSalesReport, getStockValue, getLast7DaysSales,
  type SalesReportResult, type StockValueResult, type SalesByDay,
  todayRange, weekRange, monthRange,
} from '@/lib/reportQueries';

export type DateRangePreset = 'today' | 'week' | 'month' | 'custom';

export interface DateRange {
  from: string;
  to: string;
}

interface ReportState {
  salesReport: SalesReportResult | null;
  stockReport: StockValueResult | null;
  last7Days: SalesByDay[];
  dateRange: DateRange;
  preset: DateRangePreset;
  isLoadingSales: boolean;
  isLoadingStock: boolean;
  error: string | null;

  setPreset: (preset: DateRangePreset, custom?: DateRange) => void;
  loadSalesReport: (branchId: string, from?: string, to?: string) => Promise<void>;
  loadStockReport: (branchId: string) => Promise<void>;
  loadLast7Days: (branchId: string) => Promise<void>;
  clearError: () => void;
}

function rangeForPreset(preset: DateRangePreset, custom?: DateRange): DateRange {
  if (preset === 'today') return todayRange();
  if (preset === 'week') return weekRange();
  if (preset === 'month') return monthRange();
  return custom ?? todayRange();
}

export const useReportStore = create<ReportState>((set, get) => ({
  salesReport: null,
  stockReport: null,
  last7Days: [],
  dateRange: todayRange(),
  preset: 'today',
  isLoadingSales: false,
  isLoadingStock: false,
  error: null,

  setPreset: (preset, custom) => {
    const dateRange = rangeForPreset(preset, custom);
    set({ preset, dateRange });
  },

  loadSalesReport: async (branchId, from, to) => {
    const { dateRange } = get();
    const f = from ?? dateRange.from;
    const t = to ?? dateRange.to;
    set({ isLoadingSales: true, error: null });
    try {
      const result = await getSalesReport(f, t, branchId);
      set({ salesReport: result, isLoadingSales: false });
    } catch (e: any) {
      set({ error: e.message || 'Gagal memuat laporan penjualan', isLoadingSales: false });
    }
  },

  loadStockReport: async (branchId) => {
    set({ isLoadingStock: true, error: null });
    try {
      const result = await getStockValue(branchId);
      set({ stockReport: result, isLoadingStock: false });
    } catch (e: any) {
      set({ error: e.message || 'Gagal memuat laporan stok', isLoadingStock: false });
    }
  },

  loadLast7Days: async (branchId) => {
    try {
      const data = await getLast7DaysSales(branchId);
      set({ last7Days: data });
    } catch {
      set({ last7Days: [] });
    }
  },

  clearError: () => set({ error: null }),
}));
