/**
 * Tests for the Login page.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// Mock api
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

// Mock auth store
const loginMock = vi.fn()
vi.mock('../stores/authStore', () => ({
  default: Object.assign(
    (selector) => {
      const state = {
        login: loginMock,
        user: null,
        isReady: true,
        isLoggedIn: () => false,
        logout: vi.fn(),
        hydrate: vi.fn(),
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({
        login: loginMock,
        user: null,
        isReady: true,
        isLoggedIn: () => false,
        logout: vi.fn(),
        hydrate: vi.fn(),
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
      destroy: vi.fn(),
    },
  ),
}))

// Mock ThemeContext
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    isDarkMode: false,
    toggleTheme: vi.fn(),
  }),
}))

import api from '../services/api'
import Login from '../pages/Auth/Login'

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Login page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders the login form', () => {
    renderLogin()
    expect(screen.getByText('Login')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Email or Username')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
  })

  it('calls api and authStore.login on submit', async () => {
    api.post.mockResolvedValueOnce({
      data: { access: 'tok', refresh: 'ref' },
    })
    loginMock.mockResolvedValueOnce({ id: 1, username: 'alice' })

    renderLogin()
    fireEvent.change(screen.getByPlaceholderText('Email or Username'), {
      target: { value: 'alice' },
    })
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'pass123' },
    })
    fireEvent.click(screen.getByText('Sign in'))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/users/token/', {
        username: 'alice',
        password: 'pass123',
      })
    })
    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({ access: 'tok', refresh: 'ref' })
    })
  })

  it('shows error on failed login', async () => {
    api.post.mockRejectedValueOnce({
      response: { data: { detail: 'Bad credentials' } },
    })

    renderLogin()
    fireEvent.change(screen.getByPlaceholderText('Email or Username'), {
      target: { value: 'alice' },
    })
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'wrong' },
    })
    fireEvent.click(screen.getByText('Sign in'))

    await waitFor(() => {
      expect(screen.getByText('Bad credentials')).toBeInTheDocument()
    })
  })
})
