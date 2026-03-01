/**
 * Tests for the Zustand auth store.
 */

// Mock api before importing the store — vi.mock is hoisted
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import api from '../services/api'
import useAuthStore from '../stores/authStore'

describe('authStore', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
    // Reset store state
    useAuthStore.setState({ user: null, isReady: false })
  })

  it('starts with user=null', () => {
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
  })

  it('login stores tokens and fetches user', async () => {
    api.get.mockResolvedValueOnce({ data: { id: 1, username: 'alice' } })

    await useAuthStore.getState().login({
      access: 'fake-access-token',
      refresh: 'fake-refresh-token',
    })

    expect(localStorage.getItem('access')).toBe('fake-access-token')
    expect(localStorage.getItem('refresh')).toBe('fake-refresh-token')
    expect(useAuthStore.getState().user).toEqual({ id: 1, username: 'alice' })
    expect(useAuthStore.getState().isReady).toBe(true)
  })

  it('logout clears tokens and user', () => {
    localStorage.setItem('access', 'tok')
    localStorage.setItem('refresh', 'ref')

    useAuthStore.getState().logout()

    expect(localStorage.getItem('access')).toBeNull()
    expect(localStorage.getItem('refresh')).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('isLoggedIn returns true when access token exists', () => {
    localStorage.setItem('access', 'tok')
    expect(useAuthStore.getState().isLoggedIn()).toBe(true)
  })

  it('isLoggedIn returns false when no token', () => {
    expect(useAuthStore.getState().isLoggedIn()).toBe(false)
  })
})
