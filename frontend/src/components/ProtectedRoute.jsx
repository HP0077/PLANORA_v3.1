import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'

function isTokenExpired(token) {
  if (!token) return true
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    // exp is in seconds, Date.now() in ms
    return payload.exp * 1000 < Date.now()
  } catch {
    return true
  }
}

export default function ProtectedRoute({ children }){
  const { user, isReady, hydrate } = useAuthStore()

  useEffect(() => {
    if (!isReady) hydrate()
  }, [isReady, hydrate])

  const token = localStorage.getItem('access') || sessionStorage.getItem('access')

  // No token at all → redirect immediately
  if (!token) return <Navigate to="/login" replace />

  // Token exists but expired → clear and redirect
  if (isTokenExpired(token)) {
    useAuthStore.getState().logout()
    return <Navigate to="/login" replace />
  }

  // Still loading user profile → show nothing (avoids flash)
  if (!isReady) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-sm opacity-60">Loading…</div>
      </div>
    )
  }

  return children
}
