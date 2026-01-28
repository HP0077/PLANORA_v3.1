import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import Navbar from '../components/Navbar'
import ActivityFeed from '../components/ActivityFeed'

const STATUS_OPTIONS = ['DRAFT', 'PLANNING', 'LIVE', 'COMPLETED', 'ARCHIVED']
const RISK_COLORS = {
  low: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  high: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
}

export default function Dashboard(){
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [me, setMe] = useState(null)
  const [manageOpen, setManageOpen] = useState(null) // event id
  const [userQuery, setUserQuery] = useState('')
  const [userResults, setUserResults] = useState([])
  const [intel, setIntel] = useState({}) // eventId -> intelligence
  const [deletingId, setDeletingId] = useState(null)
  const [activityOpen, setActivityOpen] = useState({})
  const nav = useNavigate()

  async function fetchEvents(){
    try{
      const evRes = await api.get('/events/', { auth: true })
      const data = evRes.data
      const items = Array.isArray(data) ? data : (data?.results ?? [])
      setEvents(items)
      seedIntelFromEvents(items)
      await loadIntelligenceBulk()
    }catch(e){
      if(e.response?.status === 401){
        nav('/login')
      }
    }
  }

  useEffect(()=>{(async()=>{
    try{
      const [meRes, evRes] = await Promise.all([
        api.get('/users/me/', { auth: true }),
        api.get('/events/', { auth: true })
      ])
      setMe(meRes.data || null)
      const data = evRes.data
      const items = Array.isArray(data) ? data : (data?.results ?? [])
      setEvents(items)
      seedIntelFromEvents(items)
      await loadIntelligenceBulk()
    }catch(e){
      if(e.response?.status === 401){
        nav('/login')
      }else{
        setError('Failed to load events. Check API base and server logs.')
      }
    }finally{
      setLoading(false)
    }
  })()},[])

  // lightweight realtime: refresh events periodically
  useEffect(()=>{
    const id = setInterval(()=>{ fetchEvents() }, 10000)
    return ()=> clearInterval(id)
  },[])

  function logout(){
    localStorage.clear()
    nav('/login')
  }

  const [form, setForm] = useState({ name:'', description:'', date:'', time:'', mode:'offline' })

  async function createEvent(e){
    e.preventDefault()
    try{
      const { data } = await api.post('/events/', form, { auth: true })
      setEvents(prev => Array.isArray(prev) ? [data, ...prev] : [data])
      setForm({ name:'', description:'', date:'', time:'', mode:'offline' })
      await loadIntelligenceBulk()
    }catch(e){
      setError('Failed to create event. Please check required fields.')
    }
  }

  async function deleteEvent(eventId){
    if(!eventId) return
    const target = events.find(ev=> ev.id===eventId)
    if(!me || target?.owner_id !== me.id){
      alert('Only the event owner can delete')
      return
    }
    if(!window.confirm('Delete this event? This cannot be undone.')) return
    setDeletingId(eventId)
    const prev = events
    setEvents(prev.filter(e=> e.id!==eventId))
    try{
      await api.delete(`/events/${eventId}/`, { auth: true })
      setIntel(prev => { const { [eventId]:_, ...rest } = prev; return rest })
    }catch(e){
      setEvents(prev)
      alert('Failed to delete event')
    }finally{
      setDeletingId(null)
    }
  }

  async function loadIntelligenceBulk(){
    try{
      const { data } = await api.get('/events/intelligence/', { auth: true })
      const map = {}
      (data || []).forEach(item => { if(item?.event) map[item.event] = item })
      setIntel(prev => ({ ...prev, ...map }))
    }catch{
      // best-effort; ignore failures
    }
  }

  function seedIntelFromEvents(items){
    if(!Array.isArray(items)) return
    const next = {}
    items.forEach(ev => {
      if(ev?.intelligence){
        next[ev.id] = ev.intelligence
      }
    })
    if(Object.keys(next).length){
      setIntel(prev => ({ ...prev, ...next }))
    }
  }

  async function updateStatus(eventId, nextStatus, previousStatus){
    setEvents(prev => prev.map(ev => ev.id===eventId ? { ...ev, status: nextStatus } : ev))
    try{
      const { data } = await api.patch(`/events/${eventId}/`, { status: nextStatus }, { auth: true })
      setEvents(prev => prev.map(ev => ev.id===eventId ? data : ev))
      await loadIntelligenceBulk()
    }catch(err){
      setEvents(prev => prev.map(ev => ev.id===eventId ? { ...ev, status: previousStatus } : ev))
      const msg = err?.response?.data ? JSON.stringify(err.response.data) : 'Failed to update status'
      alert(msg)
    }
  }

  function riskLevel(score){
    if(score >= 0.66) return 'high'
    if(score >= 0.33) return 'medium'
    return 'low'
  }

  function toggleActivity(eventId){
    setActivityOpen(prev => ({ ...prev, [eventId]: !prev[eventId] }))
  }

  return (
    <div>
      <Navbar/>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="section space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Your Events</h2>
            <button onClick={logout} className="btn-secondary">Logout</button>
          </div>
          {error && <div className="text-rose-600 dark:text-rose-400 text-sm">{error}</div>}
          <form onSubmit={createEvent} className="grid md:grid-cols-5 gap-3 items-end">
            <input className="input md:col-span-2" placeholder="Name" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} required />
            <input className="input md:col-span-3" placeholder="Description" value={form.description} onChange={e=>setForm({...form, description:e.target.value})} />
            <input className="input" type="date" value={form.date} onChange={e=>setForm({...form, date:e.target.value})} required />
            <input className="input" type="time" value={form.time} onChange={e=>setForm({...form, time:e.target.value})} required />
            <select className="input" value={form.mode} onChange={e=>setForm({...form, mode:e.target.value})}>
              <option value="offline">Offline</option>
              <option value="online">Online</option>
            </select>
            <button className="btn-primary">Create</button>
          </form>
        </div>
      {loading ? (
        <div className="opacity-70">Loading events…</div>
      ) : (
      <div className="grid md:grid-cols-2 gap-4">
        {events.map(e => (
          <div key={e.id} className="card p-4">
            <div className="flex justify-between gap-3">
              <div className="font-semibold">{e.name}</div>
              {(me && e.owner_id===me.id) && (
                <button
                  className="text-sm text-rose-700 dark:text-rose-300 hover:underline disabled:opacity-60"
                  disabled={deletingId===e.id}
                  onClick={()=>deleteEvent(e.id)}
                >{deletingId===e.id ? 'Deleting…' : 'Delete'}</button>
              )}
            </div>
            <div className="opacity-70 text-sm">{e.date} {e.time} • {e.mode}</div>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span className="px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-800 dark:bg-slate-800 dark:text-slate-100 text-xs">{e.status || 'DRAFT'}</span>
              {me && e.owner_id===me.id && (
                <select
                  className="input text-xs h-8"
                  value={e.status || 'DRAFT'}
                  onChange={(ev)=>updateStatus(e.id, ev.target.value, e.status || 'DRAFT')}
                >
                  {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              )}
              <button className="text-xs px-2 py-1 rounded border dark:border-white/10" onClick={()=>toggleActivity(e.id)}>
                {activityOpen[e.id] ? 'Hide activity' : 'Show activity'}
              </button>
            </div>
            {/* Intelligence panel */}
            {intel[e.id] && (
              <div className="mt-3 p-3 rounded border dark:border-white/10 bg-white/60 dark:bg-slate-900/30">
                {(() => {
                  const data = intel[e.id]
                  const level = riskLevel(data.risk_score)
                  const badgeClass = RISK_COLORS[level]
                  const readinessPct = Math.round((data.readiness_score || 0) * 100)
                  return (
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${badgeClass}`}>Risk: {level.toUpperCase()}</span>
                        <span className="text-xs opacity-80">Readiness: {readinessPct}%</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between"><span>Overdue tasks</span><span className="font-semibold">{data.overdue_tasks}</span></div>
                        <div className="flex justify-between"><span>Budget variance</span><span className="font-semibold">{data.budget_variance}</span></div>
                        <div className="flex justify-between"><span>Inactivity days</span><span className="font-semibold">{data.inactivity_days}</span></div>
                        <div className="flex justify-between"><span>Engagement</span><span className="font-semibold">{data.engagement_score}</span></div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
            {/* Show join link only to owner or participants */}
            {(e.meeting_link && (me && (e.owner_id===me.id || (e.participants||[]).some(p=>p===me.id)))) && (
              <div className="flex items-center gap-3 mt-2">
                <a className="text-fuchsia-700 dark:text-fuchsia-300 text-sm underline" href={e.meeting_link} target="_blank" rel="noreferrer">Join link</a>
                <button className="text-sm px-2 py-1 rounded border dark:border-white/10" onClick={async()=>{
                  try{ await navigator.clipboard.writeText(e.meeting_link); alert('Link copied'); }catch{ alert('Copy failed'); }
                }}>Copy</button>
                <button className="text-sm px-2 py-1 rounded border dark:border-white/10" onClick={async()=>{
                  try{
                    const { data } = await api.get(`/events/${e.id}/whatsapp_share/`, { auth: true })
                    const url = data?.url || `https://wa.me/?text=${encodeURIComponent(`Join my event ${e.name}: ${e.meeting_link}`)}`
                    window.open(url, '_blank')
                  }catch{ window.open(`https://wa.me/?text=${encodeURIComponent(`Join my event ${e.name}: ${e.meeting_link}`)}`, '_blank') }
                }}>Share via WhatsApp</button>
              </div>
            )}
            {/* Generate link only for owner on online events without link */}
            {!e.meeting_link && e.mode==='online' && me && e.owner_id===me.id && (
              <button className="mt-2 px-2 py-1 rounded border text-sm dark:border-white/10" onClick={async()=>{
                try{
                  const { data } = await api.post(`/events/${e.id}/generate_meeting/`, {}, { auth: true })
                  setEvents(prev => prev.map(x => x.id===e.id ? data : x))
                }catch(err){ alert('Failed to generate meeting link') }
              }}>Generate meeting link</button>
            )}
            {/* Participants management (owner only) */}
            {me && e.owner_id===me.id && (
              <div className="mt-3">
                <button className="px-2 py-1 rounded border text-sm dark:border-white/10" onClick={()=>{
                  setManageOpen(manageOpen===e.id? null : e.id);
                  setUserQuery(''); setUserResults([]);
                }}>{manageOpen===e.id? 'Close participants' : 'Manage participants'}</button>
                {manageOpen===e.id && (
                  <div className="mt-2 space-y-2">
                    <div className="text-sm font-medium">Participants</div>
                    <div className="flex flex-wrap gap-2">
                      {(e.participants_detail||[]).map(p => (
                        <span key={p.id} className="text-xs px-2 py-1 bg-neutral-200 rounded flex items-center gap-1 dark:bg-slate-800/70">
                          {p.username || p.email}
                          <button title="Remove" className="ml-1" onClick={async()=>{
                            const remaining = (e.participants||[]).filter(id=>id!==p.id)
                            try{
                              const { data } = await api.patch(`/events/${e.id}/`, { participants: remaining }, { auth: true })
                              setEvents(prev => prev.map(x => x.id===e.id ? data : x))
                            }catch(err){
                              // Fallback: fetch and PUT full payload
                              try{
                                const evRes = await api.get(`/events/${e.id}/`, { auth: true })
                                const full = evRes.data
                                // Only include writable fields
                                const payload = {
                                  name: full.name,
                                  description: full.description || '',
                                  date: full.date,
                                  time: full.time,
                                  mode: full.mode,
                                  participants: remaining,
                                }
                                const { data } = await api.put(`/events/${e.id}/`, payload, { auth: true })
                                setEvents(prev => prev.map(x => x.id===e.id ? data : x))
                              }catch(e2){
                                const msg = e2?.response?.data ? JSON.stringify(e2.response.data) : (err?.message || 'Unknown error')
                                alert(`Failed to remove participant: ${msg}`)
                              }
                            }
                          }}>✕</button>
                        </span>
                      ))}
                      {!(e.participants_detail||[]).length && <div className="text-xs opacity-70">No participants</div>}
                    </div>
                    <div className="relative">
                      <input className="input w-full" placeholder="Add participant (type to search)" value={userQuery} onChange={async (ev)=>{
                        const q = ev.target.value; setUserQuery(q)
                        if(q.trim().length<2){ setUserResults([]); return }
                        try{ const { data } = await api.get(`/users/search/?q=${encodeURIComponent(q)}`, { auth: true }); setUserResults(data?.results||[]) }catch{}
                      }} />
                      {!!userResults.length && (
                        <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow max-h-44 overflow-auto dark:bg-slate-900 dark:border-white/10">
                          {userResults.map(u => (
                            <button key={u.id} type="button" className="w-full text-left px-3 py-2 hover:bg-neutral-100 text-sm dark:hover:bg-slate-800" onClick={async()=>{
                              const next = Array.from(new Set([...(e.participants||[]), u.id]))
                              try{
                                const { data } = await api.patch(`/events/${e.id}/`, { participants: next }, { auth: true })
                                setEvents(prev => prev.map(x => x.id===e.id ? data : x))
                                setUserQuery(''); setUserResults([])
                              }catch(err){
                                // Fallback: fetch and PUT full payload
                                try{
                                  const evRes = await api.get(`/events/${e.id}/`, { auth: true })
                                  const full = evRes.data
                                  const payload = {
                                    name: full.name,
                                    description: full.description || '',
                                    date: full.date,
                                    time: full.time,
                                    mode: full.mode,
                                    participants: next,
                                  }
                                  const { data } = await api.put(`/events/${e.id}/`, payload, { auth: true })
                                  setEvents(prev => prev.map(x => x.id===e.id ? data : x))
                                  setUserQuery(''); setUserResults([])
                                }catch(e2){
                                  const msg = e2?.response?.data ? JSON.stringify(e2.response.data) : (err?.message || 'Unknown error')
                                  alert(`Failed to add participant: ${msg}`)
                                }
                              }
                            }}>{u.username || u.email}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <ActivityFeed eventId={e.id} visible={!!activityOpen[e.id]} />
          </div>
        ))}
        {!events.length && <div className="opacity-70">No events yet.</div>}
      </div>
      )}
      </div>
    </div>
  )
}
