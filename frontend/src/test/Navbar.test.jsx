/**
 * Tests for the Navbar component.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock api
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { unread_count: 3 } }),
    post: vi.fn(),
  },
}))

// Mock ThemeContext
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    isDarkMode: false,
    toggleTheme: vi.fn(),
  }),
}))

// Mock auth store
vi.mock('../stores/authStore', () => {
  const state = {
    user: { id: 1, username: 'alice', profile: { role: 'manager' } },
    isReady: true,
    isLoggedIn: () => true,
    logout: vi.fn(),
    hydrate: vi.fn(),
  }
  const store = Object.assign(
    (selector) => (selector ? selector(state) : state),
    {
      getState: () => state,
      setState: vi.fn(),
      subscribe: vi.fn(),
      destroy: vi.fn(),
    },
  )
  return { default: store }
})

import Navbar from '../components/Navbar'

function renderNavbar(props = {}) {
  return render(
    <MemoryRouter>
      <Navbar {...props} />
    </MemoryRouter>,
  )
}

describe('Navbar', () => {
  it('renders navigation links', () => {
    renderNavbar()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.getByText('Budget')).toBeInTheDocument()
    expect(screen.getByText('Analytics')).toBeInTheDocument()
  })

  it('renders Planora brand', () => {
    renderNavbar()
    expect(screen.getByText('Planora')).toBeInTheDocument()
  })

  it('hides navigation links when compact', () => {
    renderNavbar({ compact: true })
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
    expect(screen.queryByText('Tasks')).not.toBeInTheDocument()
  })

  it('shows logout when authenticated', () => {
    renderNavbar()
    expect(screen.getByText('Logout')).toBeInTheDocument()
  })
})
