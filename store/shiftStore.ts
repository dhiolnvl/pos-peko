import { create } from 'zustand';
import type { Shift } from '@/lib/shiftQueries';

interface ShiftState {
  activeShift: Shift | null;
  setActiveShift: (shift: Shift | null) => void;
}

export const useShiftStore = create<ShiftState>((set) => ({
  activeShift: null,
  setActiveShift: (shift) => set({ activeShift: shift }),
}));
