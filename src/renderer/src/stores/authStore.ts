import { create } from 'zustand'
import type { UserPublic } from '../../../shared/types'

interface AuthState {
  user: UserPublic | null
  isLoggedIn: boolean
  isLoading: boolean
  error: string | null
  login: (username: string, pin: string) => Promise<boolean>
  logout: () => Promise<void>
  checkSession: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoggedIn: false,
  isLoading: false,
  error: null,

  login: async (username, pin) => {
    set({ isLoading: true, error: null })
    try {
      const user = await window.api.login(username, pin)
      if (user) {
        set({ user, isLoggedIn: true, isLoading: false, error: null })
        return true
      }
      set({ isLoading: false, error: 'Invalid username or PIN' })
      return false
    } catch (e: any) {
      // Surface a specific message from the main process when it's meaningful
      // (e.g. the cross-terminal session lock), otherwise show a generic line.
      const raw = e?.message || 'Login failed. Please try again.'
      const cleaned = raw.replace(/^Error invoking remote method '[^']+':\s*Error:\s*/, '').replace(/^Error:\s*/, '')
      set({ isLoading: false, error: cleaned })
      return false
    }
  },

  logout: async () => {
    await window.api.logout()
    set({ user: null, isLoggedIn: false, error: null })
  },

  checkSession: async () => {
    const user = await window.api.getCurrentUser()
    if (user) {
      set({ user, isLoggedIn: true })
    }
  }
}))
