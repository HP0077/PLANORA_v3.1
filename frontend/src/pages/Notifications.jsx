import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import api from '../services/api'

const TYPE_STYLES = {
  info: 'bg-sky-50 border-sky-200 dark:bg-sky-900/30 dark:border-sky-800',
  warning: 'bg-amber-50 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800',
  success: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800',
  error: 'bg-rose-50 border-rose-200 dark:bg-rose-900/30 dark:border-rose-800',
  automation: 'bg-purple-50 border-purple-200 dark:bg-purple-900/30 dark:border-purple-800',
  system: 'bg-slate-50 border-slate-200 dark:bg-slate-900/30 dark:border-slate-700',
}

export default function Notifications(){
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadNotifications(){
    try{
      const { data } = await api.get('/notifications/', { auth: true })
      setNotifications(data?.results ?? data ?? [])
    }catch(e){
      setError('Failed to load notifications')
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{ loadNotifications() }, [])

  async function markRead(id){
    try{
      await api.post(`/notifications/${id}/mark_read/`, {}, { auth: true })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    }catch{}
  }

  async function markAllRead(){
    try{
      await api.post('/notifications/mark_all_read/', {}, { auth: true })
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    }catch{}
  }

  return (
    <div>
      <Navbar />
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Notifications</h2>
          <button className="btn-secondary text-sm" onClick={markAllRead}>Mark all read</button>
        </div>
        {error && <div className="text-sm text-rose-600 dark:text-rose-400">{error}</div>}
        {loading ? (
          <div className="opacity-70">Loading…</div>
        ) : notifications.length === 0 ? (
          <div className="text-sm opacity-70">No notifications yet.</div>
        ) : (
          <div className="space-y-2">
            {notifications.map(n => (
              <div
                key={n.id}
                className={`p-4 rounded-xl border transition cursor-pointer ${TYPE_STYLES[n.type] || TYPE_STYLES.info} ${!n.is_read ? 'ring-2 ring-purple-300 dark:ring-purple-700' : 'opacity-80'}`}
                onClick={()=> !n.is_read && markRead(n.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{n.title}</div>
                    {n.body && <div className="text-sm text-slate-700 dark:text-slate-300 mt-1">{n.body}</div>}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/60 dark:bg-white/10 font-medium">{n.type}</span>
                  {!n.is_read && <span className="text-xs text-purple-600 dark:text-purple-300">● unread</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
