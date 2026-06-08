import { create } from 'zustand'

// Tracks which TouchInput currently owns the on-screen keyboard, so only one
// keyboard is shown at a time across the whole app (tapping another field
// hands the keyboard over to it).
interface KeyboardState {
  activeId: string | null
  setActive: (id: string | null) => void
}

export const useKeyboardStore = create<KeyboardState>((set) => ({
  activeId: null,
  setActive: (id) => set({ activeId: id })
}))
