import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Navbar from '../../components/Navbar'
import api from '../../services/api'
import Toast from '../../components/Toast'

export default function Register(){
  const [form, setForm] = useState({ username:'', email:'', password:'', first_name:'', last_name:'', role:'attendee' })
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const nav = useNavigate()

  function set(k,v){ setForm(prev=>({ ...prev, [k]: v })) }

  async function submit(e){
    e.preventDefault()
    setError('')
    try{
      await api.post('/users/register/', form)
      // auto login
  const { data } = await api.post('/users/token/', { username: form.username || form.email, password: form.password })
  sessionStorage.setItem('access', data.access)
  sessionStorage.setItem('refresh', data.refresh)
      const me = await api.get('/users/me/', { auth: true })
  sessionStorage.setItem('me', JSON.stringify(me.data))
  setToast('Account created! Welcome to Planora')
  setTimeout(()=> nav('/dashboard'), 300)
    }catch(err){
      const data = err?.response?.data
      if(data){
        // Prefer first human-friendly error
        const first = typeof data === 'string' ? data : Object.values(data)[0]?.[0] || 'Registration failed'
        setError(first)
      } else {
        setError('Registration failed')
      }
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-6">
  <Navbar compact/>
      <form onSubmit={submit} className="w-full max-w-sm section space-y-3">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Create account</h2>
        <input className="input" placeholder="Username" value={form.username} onChange={e=>set('username', e.target.value)} />
        <input className="input" placeholder="Email" value={form.email} onChange={e=>set('email', e.target.value)} />
        <input className="input" placeholder="Password" type="password" value={form.password} onChange={e=>set('password', e.target.value)} />
        <select className="select" value={form.role} onChange={e=>set('role', e.target.value)}>
          <option value="attendee">Attendee</option>
          <option value="manager">Event Manager</option>
        </select>
        {error && <div className="text-rose-600 dark:text-rose-400 text-sm">{error}</div>}
        <button className="btn-primary w-full">Register</button>
        <div className="flex items-center justify-between">
          <Link to="/" className="btn-secondary"><ArrowLeft className="w-4 h-4" /><span>Back</span></Link>
          <p className="text-sm text-slate-700 dark:text-slate-300">Have an account? <Link className="text-fuchsia-700 dark:text-fuchsia-300" to="/login">Login</Link></p>
        </div>
      </form>
      <Toast message={toast} onClose={()=>setToast('')} type="success" />
    </div>
  )
}
