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
    } catch {
      set({ isLoading: false, error: 'Login failed. Please try again.' })
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
