/**
 * Tests for ProtectedRoute component.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// Mock the auth store
const mockStore = {
  user: null,
  isReady: true,
  hydrate: vi.fn(),
}

vi.mock('../stores/authStore', () => {
  const store = Object.assign(
    (selector) => (selector ? selector(mockStore) : mockStore),
    {
      getState: () => ({
        ...mockStore,
        isLoggedIn: () => !!localStorage.getItem('access'),
        logout: vi.fn(() => {
          localStorage.removeItem('access')
          localStorage.removeItem('refresh')
        }),
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
      destroy: vi.fn(),
    },
  )
  return { default: store }
})

import ProtectedRoute from '../components/ProtectedRoute'

function renderWithRouter(token) {
  if (token) localStorage.setItem('access', token)

  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route
          path="/protected"
          element={
            <ProtectedRoute>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

// Helper: create a non-expired JWT-like token
function makeToken(expiresInSec = 3600) {
  const header = btoa(JSON.stringify({ alg: 'HS256' }))
  const payload = btoa(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSec }),
  )
  return `${header}.${payload}.signature`
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    mockStore.user = { id: 1, username: 'alice' }
    mockStore.isReady = true
  })

  it('redirects to /login when no token', () => {
    renderWithRouter(null)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('renders children when token is valid', () => {
    const token = makeToken(3600)
    renderWithRouter(token)
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('redirects when token is expired', () => {
    const expired = makeToken(-100) // expired 100s ago
    renderWithRouter(expired)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })
})
