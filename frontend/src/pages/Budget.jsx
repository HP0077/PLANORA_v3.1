import { useEffect, useState } from 'react'
import api from '../services/api'
import Navbar from '../components/Navbar'
import useAuthStore from '../stores/authStore'

export default function Budget(){
  const [events, setEvents] = useState([])
  const [items, setItems] = useState([])
  const [eventId, setEventId] = useState('')
  const [summary, setSummary] = useState(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [form, setForm] = useState({ type:'expense', title:'', estimated:0, actual:0 })
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [errorTimeoutId, setErrorTimeoutId] = useState(null)
  const me = useAuthStore(s => s.user)
  const [deletingId, setDeletingId] = useState(null)

  const selectedEvent = events.find(ev=> String(ev.id) === String(eventId))
  const isLocked = ['COMPLETED','ARCHIVED'].includes((selectedEvent?.status || summary?.event_status || '').toUpperCase())

  const statusStyles = {
    OK: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    WARNING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    OVERSPENT: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  }

  useEffect(()=>{(async()=>{
    try{
      await loadInitial()
    }catch(e){ setError('Failed to load budget') }
  })()},[])

  // Auto-dismiss errors after a short delay so stale messages clear when new actions succeed
  useEffect(()=>{
    if(error){
      if(errorTimeoutId){ clearTimeout(errorTimeoutId) }
      const id = setTimeout(()=> setError(''), 4000)
      setErrorTimeoutId(id)
    }
    return ()=>{ if(errorTimeoutId){ clearTimeout(errorTimeoutId) } }
  }, [error])

  // Clear transient messages when switching events
  useEffect(()=>{
    setError('')
    setInfo('')
  }, [eventId])

  async function loadInitial(){
    const ev = await api.get('/events/', { auth: true })
    const evList = ev.data?.results ?? ev.data ?? []
    setEvents(evList)
    const defaultEvent = evList[0]?.id ? String(evList[0].id) : ''
    if(!eventId && defaultEvent){
      setEventId(defaultEvent)
      await fetchItems(defaultEvent)
    }else{
      await fetchItems(eventId)
    }
    setError('')
  }

  async function fetchItems(targetEventId){
    if(!targetEventId){ setItems([]); return }
    const bi = await api.get(`/budget/?event=${targetEventId}`, { auth: true })
    setItems(bi.data?.results ?? bi.data ?? [])
  }

  async function refreshItems(){
    await fetchItems(eventId)
    setError('')
  }

  useEffect(()=>{(async()=>{
    if(!eventId){ setSummary(null); return }
    setLoadingSummary(true)
    try{
      const { data } = await api.get(`/budget/summary/?event_id=${eventId}`, { auth: true })
      setSummary((data && data[0]) ? data[0] : null)
    }catch(e){ setSummary(null) }
    finally{ setLoadingSummary(false) }
  })()}, [eventId, items.length])

  useEffect(()=>{(async()=>{
    if(eventId){ await fetchItems(eventId) }
  })()}, [eventId])

  async function createItem(e){
    e.preventDefault()
    setError('')
    setInfo('')
    if(!eventId){ setError('Select an event first'); return }
    if(isLocked){ setError('Budget is locked for completed/archived events'); return }
    try{
      const payload = { ...form, event: eventId }
      const { data } = await api.post('/budget/', payload, { auth: true })
      setItems(prev=> [data, ...prev])
      await refreshItems()
      setForm({ type:'expense', title:'', estimated:0, actual:0 })
      setError('')
      setInfo('Budget item added')
    }catch(e){
      const detail = e?.response?.data?.detail || e?.message || 'Failed to create budget item'
      setError(detail)
    }
  }

  async function deleteItem(itemId){
    const target = items.find(i=> i.id===itemId)
    const ownerEvent = events.find(ev=> String(ev.id) === String(target?.event || target?.event_id || target?.event?.id))
    if(!me || !ownerEvent || ownerEvent.owner_id !== me.id){
      setError('Only the event owner can delete budget items')
      return
    }
    const locked = ['COMPLETED','ARCHIVED'].includes((ownerEvent.status || '').toUpperCase())
    if(locked){ setError('Budget is locked for this event'); return }
    if(!window.confirm('Delete this budget item?')) return
    setDeletingId(itemId)
    const prev = items
    setItems(prev.filter(i=> i.id!==itemId))
    try{
      await api.delete(`/budget/${itemId}/`, { auth: true })
      await refreshItems()
    }catch(e){
      setItems(prev)
      setError('Failed to delete budget item')
    }finally{ setDeletingId(null) }
  }

  return (
    <div>
      <Navbar/>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="section space-y-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Budget</h2>
            {error && <div className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</div>}
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex flex-col gap-1 w-full max-w-sm">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Event</label>
              <select className="input" value={eventId} onChange={e=>setEventId(e.target.value)}>
                <option value="">Select event</option>
                {events.map(ev=> <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </div>
            {eventId && (
              <button
                className="btn-outline px-4 py-2 text-sm whitespace-nowrap"
                onClick={async ()=>{
                  try{
                    const res = await api.get(`/budget/export_csv/?event=${eventId}`, { auth: true })
                    const csv = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `budget_${selectedEvent?.name || eventId}.csv`
                    document.body.appendChild(a)
                    a.click()
                    a.remove()
                    URL.revokeObjectURL(url)
                    setInfo('CSV downloaded')
                  }catch(e){
                    setError('Failed to export CSV')
                  }
                }}
              >
                ⬇ Export CSV
              </button>
            )}
          </div>
          {loadingSummary && <div className="text-sm text-slate-600 dark:text-slate-300">Loading summary...</div>}
          {summary && (
            <div className="card p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{summary.event_name}</div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Status: {summary.event_status}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {summary.health_status && (
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${statusStyles[summary.health_status] || 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100'}`}>
                      {summary.health_status}
                    </span>
                  )}
                  {isLocked && <span className="text-xs text-amber-700 dark:text-amber-400">Budget locked</span>}
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3 mt-3 text-sm text-slate-800 dark:text-slate-200">
                <div>Estimated income: {summary.estimated_income}</div>
                <div>Actual income: {summary.actual_income}</div>
                <div>Estimated expenses: {summary.estimated_expense}</div>
                <div>Actual expenses: {summary.actual_expense}</div>
                <div className="font-semibold">Net (estimated): {summary.net_estimated}</div>
                <div className="font-semibold">Net (actual): {summary.net_actual}</div>
                <div className="font-semibold">Total estimated spend: {summary.total_estimated}</div>
                <div className="font-semibold">Total actual spend: {summary.total_actual}</div>
                <div className="font-semibold">Variance: {summary.variance}</div>
              </div>
            </div>
          )}
          {isLocked && !loadingSummary && summary && (
            <div className="text-sm text-amber-700 dark:text-amber-400">Event is completed/archived. Budget entries are read-only.</div>
          )}
          <form onSubmit={createItem} className="grid md:grid-cols-5 gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Type</label>
              <select className="input" value={form.type} onChange={e=>setForm({...form, type:e.target.value})}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Title</label>
              <input className="input" placeholder="Title" value={form.title} onChange={e=>setForm({...form, title:e.target.value})} required />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Estimated</label>
              <input className="input" type="number" step="0.01" placeholder="Estimated" value={form.estimated} onChange={e=>setForm({...form, estimated:e.target.value})} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Actual</label>
              <input className="input" type="number" step="0.01" placeholder="Actual" value={form.actual} onChange={e=>setForm({...form, actual:e.target.value})} />
            </div>
            <button className="btn-primary" disabled={isLocked}>Add</button>
          </form>
        </div>

        <div className="grid gap-3">
          {items.map(i=> (
            <div key={i.id} className={`card p-4 ${i.type === 'expense' && Number(i.actual) > Number(i.estimated) ? 'border-rose-400/60 dark:border-rose-500/60 shadow-rose-200/50 dark:shadow-rose-900/30' : ''}`}>
              <div className="flex justify-between gap-3">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {i.title} <span className="text-xs opacity-60">[{i.type}]</span>
                </div>
                {(me && events.find(ev=> String(ev.id) === String(i.event || i.event_id || i.event?.id))?.owner_id === me.id) && (
                  <button
                    className="text-sm text-rose-700 dark:text-rose-300 hover:underline disabled:opacity-60"
                    disabled={deletingId===i.id}
                    onClick={()=>deleteItem(i.id)}
                  >{deletingId===i.id ? 'Deleting…' : 'Delete'}</button>
                )}
              </div>
              <div className="text-sm text-slate-700 dark:text-slate-300 opacity-90">Est: {i.estimated} • Actual: {i.actual}</div>
            </div>
          ))}
          {!items.length && <div className="opacity-70">No items yet.</div>}
        </div>
      </div>
    </div>
  )
}
