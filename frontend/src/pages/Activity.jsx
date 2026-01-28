import { useEffect, useMemo, useState, useRef } from 'react'
import Navbar from '../components/Navbar'
import api from '../services/api'

const TYPES = [
  'event_status','task_created','task_updated','task_completed','budget_item_created','budget_item_updated','automation','automation_rule','certificate_generated','chat_system','file_uploaded','poster_edit','user_joined','user_left'
]

export default function Activity(){
  const [events, setEvents] = useState([])
  const [eventId, setEventId] = useState('')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ type:'', user:'', since:'', until:'' })
  const timerRef = useRef(null)

  async function loadEvents(){
    try{
      const { data } = await api.get('/events/', { auth: true })
      const evs = data?.results ?? data ?? []
      setEvents(evs)
      if(!eventId && evs.length){ setEventId(String(evs[0].id)) }
    }catch(err){ setError('Failed to load events') }
  }

  const queryString = useMemo(()=>{
    const params = new URLSearchParams()
    if(eventId) params.set('event', eventId)
    if(filters.type) params.set('type', filters.type)
    if(filters.user) params.set('user', filters.user)
    if(filters.since) params.set('since', filters.since)
    if(filters.until) params.set('until', filters.until)
    return params.toString()
  }, [eventId, filters])

  async function loadTimeline(){
    if(!eventId) return
    setLoading(true)
    setError('')
    try{
      const { data } = await api.get(`/timeline/?${queryString}`, { auth: true })
      setEntries(data?.results ?? data ?? [])
    }catch(err){ setError('Failed to load activity') }
    finally{ setLoading(false) }
  }

  useEffect(()=>{ loadEvents() }, [])
  useEffect(()=>{ loadTimeline() }, [queryString])

  useEffect(()=>{
    if(timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(()=>{ loadTimeline() }, 30000)
    return ()=> timerRef.current && clearInterval(timerRef.current)
  }, [queryString])

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
      <Navbar />
      <div className="max-w-6xl mx-auto px-6 pb-16 space-y-4">
        <h1 className="text-3xl font-bold">Activity Timeline</h1>
        {error && <div className="text-sm text-rose-600">{error}</div>}
        <div className="grid md:grid-cols-4 gap-3 bg-white dark:bg-slate-900/50 border dark:border-white/10 p-4 rounded-xl">
          <select className="input" value={eventId} onChange={e=>setEventId(e.target.value)}>
            <option value="">Select event</option>
            {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
          <select className="input" value={filters.type} onChange={e=>setFilters(f=>({...f, type:e.target.value}))}>
            <option value="">All types</option>
            {TYPES.map(t=> <option key={t} value={t}>{t}</option>)}
          </select>
          <input className="input" placeholder="User id" value={filters.user} onChange={e=>setFilters(f=>({...f, user:e.target.value}))} />
          <div className="flex gap-2">
            <input type="datetime-local" className="input" value={filters.since} onChange={e=>setFilters(f=>({...f, since:e.target.value}))} />
            <input type="datetime-local" className="input" value={filters.until} onChange={e=>setFilters(f=>({...f, until:e.target.value}))} />
          </div>
          <button className="btn-secondary" onClick={loadTimeline}>Refresh now</button>
        </div>

        <div className="space-y-3">
          {loading && <div className="text-sm opacity-70">Loading…</div>}
          {!loading && !entries.length && <div className="text-sm opacity-70">No activity yet.</div>}
          {entries.map(entry => {
            const actor = entry.actor?.username || 'SYSTEM'
            return (
              <div key={entry.id} className="border rounded-lg p-3 bg-white dark:bg-slate-900/50 dark:border-white/10">
                <div className="flex justify-between text-sm">
                  <div className="font-semibold">{entry.type}</div>
                  <div className="opacity-70">{new Date(entry.created_at).toLocaleString()}</div>
                </div>
                <div className="text-xs opacity-80">Source: {entry.source} • Actor: {actor}</div>
                <pre className="mt-2 text-xs whitespace-pre-wrap break-words bg-slate-50 dark:bg-slate-900/40 p-2 rounded">{JSON.stringify(entry.payload, null, 2)}</pre>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
