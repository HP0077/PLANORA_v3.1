import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Navbar from '../../components/Navbar'
import api from '../../services/api'
import Toast from '../../components/Toast'
import useAuthStore from '../../stores/authStore'

export default function Login(){
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()
  const [toast, setToast] = useState('')
  const login = useAuthStore(s => s.login)

  async function submit(e){
    e.preventDefault()
    setError('')
    setLoading(true)
    try{
  const payload = { username: username.trim(), password }
  const { data } = await api.post('/users/token/', payload)
  await login(data)
  setToast('Welcome back!')
  setTimeout(()=> nav('/dashboard'), 250)
    }catch(err){
      if (err?.response) {
        const detail = err.response.data?.detail || Object.values(err.response.data)[0]?.[0]
        setError(detail || 'Invalid credentials')
      } else {
        setError('Cannot reach server. Is the backend running at VITE_API_BASE?')
      }
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen grid place-items-center p-6 relative">
  <Navbar compact/>
      <form onSubmit={submit} className="w-full max-w-sm section space-y-4">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Login</h2>
        <input className="input" placeholder="Email or Username" value={username} onChange={e=>setUsername(e.target.value)} />
        <input className="input" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        {error && <div className="text-rose-600 dark:text-rose-400 text-sm">{error}</div>}
        <button disabled={loading} className={`btn-primary w-full ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="flex items-center justify-between">
          <Link to="/" className="btn-secondary"><ArrowLeft className="w-4 h-4" /><span>Back</span></Link>
          <p className="text-sm text-slate-700 dark:text-slate-300">No account? <Link className="text-fuchsia-700 dark:text-fuchsia-300" to="/register">Register</Link></p>
        </div>
      </form>
      <Toast message={toast} onClose={()=>setToast('')} type="success" />
    </div>
  )
}
