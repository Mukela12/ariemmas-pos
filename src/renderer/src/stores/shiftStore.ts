import { create } from 'zustand'
import type { Shift } from '../../../shared/types'

interface ShiftState {
  currentShift: Shift | null
  setShift: (shift: Shift | null) => void
  loadShift: (userId: string) => Promise<void>
}

export const useShiftStore = create<ShiftState>((set) => ({
  currentShift: null,

  setShift: (shift) => set({ currentShift: shift }),

  loadShift: async (userId: string) => {
    const shift = await window.api.getCurrentShift(userId)
    set({ currentShift: shift })
  }
}))
