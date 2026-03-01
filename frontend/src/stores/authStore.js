import { create } from 'zustand'
import api from '../services/api'

/**
 * Zustand auth store — single source of truth for user identity & tokens.
 *
 * Tokens are persisted in localStorage so they survive tab closes.
 * Legacy sessionStorage tokens are migrated automatically.
 */
const useAuthStore = create((set, get) => ({
  user: null,
  isReady: false, // true once initial hydration attempt completes

  // ---------------------------------------------------------------------------
  // Hydrate on app start — migrate legacy sessionStorage, then fetch /users/me/
  // ---------------------------------------------------------------------------
  hydrate: async () => {
    _migrateLegacyTokens()
    const access = localStorage.getItem('access')
    if (!access) {
      set({ user: null, isReady: true })
      return
    }
    try {
      const { data } = await api.get('/users/me/', { auth: true })
      set({ user: data, isReady: true })
    } catch {
      // Token invalid / expired — clear and let ProtectedRoute redirect
      localStorage.removeItem('access')
      localStorage.removeItem('refresh')
      set({ user: null, isReady: true })
    }
  },

  // ---------------------------------------------------------------------------
  // Login — stores tokens & user in one shot
  // ---------------------------------------------------------------------------
  login: async (tokenData) => {
    localStorage.setItem('access', tokenData.access)
    localStorage.setItem('refresh', tokenData.refresh)
    // Also keep in sessionStorage for posterApi compatibility during migration
    sessionStorage.setItem('access', tokenData.access)
    sessionStorage.setItem('refresh', tokenData.refresh)
    try {
      const { data } = await api.get('/users/me/', { auth: true })
      sessionStorage.setItem('me', JSON.stringify(data))
      set({ user: data, isReady: true })
      return data
    } catch (err) {
      set({ user: null })
      throw err
    }
  },

  // ---------------------------------------------------------------------------
  // Logout — clears everything
  // ---------------------------------------------------------------------------
  logout: () => {
    localStorage.removeItem('access')
    localStorage.removeItem('refresh')
    sessionStorage.removeItem('access')
    sessionStorage.removeItem('refresh')
    sessionStorage.removeItem('me')
    set({ user: null })
  },

  // ---------------------------------------------------------------------------
  // Quick accessors
  // ---------------------------------------------------------------------------
  getAccessToken: () => localStorage.getItem('access'),
  isLoggedIn: () => !!localStorage.getItem('access'),
}))

/**
 * Migrate tokens that were stored in sessionStorage (pre-refactor)
 * into localStorage so they persist across tab closes.
 */
function _migrateLegacyTokens() {
  try {
    const sa = sessionStorage.getItem('access')
    const sr = sessionStorage.getItem('refresh')
    if (sa && !localStorage.getItem('access')) {
      localStorage.setItem('access', sa)
    }
    if (sr && !localStorage.getItem('refresh')) {
      localStorage.setItem('refresh', sr)
    }
  } catch {
    // ignore storage errors (e.g. private browsing)
  }
}

export default useAuthStore
