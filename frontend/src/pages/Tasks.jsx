import { useEffect, useState, useCallback, useRef } from 'react'
import api from '../services/api'
import Navbar from '../components/Navbar'
import useAuthStore from '../stores/authStore'

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
]

const STATUS_STYLES = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  in_progress: 'bg-sky-50 text-sky-700 ring-sky-200',
  done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

const STATUS_DOTS = {
  pending: 'bg-amber-500',
  in_progress: 'bg-sky-500',
  done: 'bg-emerald-500',
}

export default function Tasks(){
  const [events, setEvents] = useState([])
  const [tasks, setTasks] = useState([])
  const [selectedEvent, setSelectedEvent] = useState('')
  const [form, setForm] = useState({ title:'', description:'', due_date:'', status:'pending', priority:'medium', assignee:'' })
  const [error, setError] = useState('')
  const [assigneeQuery, setAssigneeQuery] = useState('')
  const [assigneeResults, setAssigneeResults] = useState([])
  const me = useAuthStore(s => s.user)
  const [deletingId, setDeletingId] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)
  const [sortBy, setSortBy] = useState('priority')
  const POLL_INTERVAL_MS = 10000
  const socketsRef = useRef(new Map())

  const sortTasks = (list, mode = sortBy, evList = events)=>{
    const order = { high: 0, medium: 1, low: 2 }
    const copy = Array.isArray(list) ? [...list] : []
    if(mode === 'event'){
      copy.sort((a,b)=>{
        const nameA = (evList.find(ev=> String(ev.id)===String(taskEventId(a)))?.name || '').toLowerCase()
        const nameB = (evList.find(ev=> String(ev.id)===String(taskEventId(b)))?.name || '').toLowerCase()
        return nameA.localeCompare(nameB) || (order[a.priority||'medium'] - order[b.priority||'medium']) || (new Date(b.created_at) - new Date(a.created_at))
      })
    }else{
      copy.sort((a,b)=> (order[a.priority||'medium'] - order[b.priority||'medium']) || (new Date(b.created_at) - new Date(a.created_at)))
    }
    return copy
  }

  const fetchTasks = useCallback(async ()=>{
    try{
      const t = await api.get('/tasks/', { auth: true })
      const list = t.data?.results ?? t.data ?? []
      const arr = Array.isArray(list) ? list : []
      setTasks(prev=> sortTasks(arr, sortBy, events))
    }catch(e){ setError('Failed to load tasks') }
  }, [events, sortBy])

  useEffect(()=>{(async()=>{
    try{
      const ev = await api.get('/events/', { auth: true })
      setEvents(ev.data?.results ?? ev.data ?? [])
    }catch(e){ setError('Failed to load tasks/events') }
  })()},[])

  useEffect(()=>{
    fetchTasks()
    const id = setInterval(fetchTasks, POLL_INTERVAL_MS)
    return ()=> clearInterval(id)
  }, [fetchTasks])

  // Real-time websocket subscription per event
  useEffect(()=>{
    const token = localStorage.getItem('access') || sessionStorage.getItem('access')
    if(!token) return
    const wsBase = (import.meta.env.VITE_WS_BASE || window.location.origin).replace(/^http/, 'ws').replace(/\/$/, '')
    const neededEventIds = new Set()
    events.forEach(ev=> neededEventIds.add(String(ev.id)))
    tasks.forEach(t=>{ const id = taskEventId(t); if(id) neededEventIds.add(String(id)) })

    // Open missing sockets
    neededEventIds.forEach(eventId=>{
      const key = String(eventId)
      if(socketsRef.current.has(key)) return
      const ws = new WebSocket(`${wsBase}/ws/tasks/${key}/?token=${encodeURIComponent(token)}`)
      ws.onmessage = (ev)=>{
        try{
          const msg = JSON.parse(ev.data)
          if(msg?.type === 'task'){
            if(msg.action === 'deleted'){
              const id = msg.task_id || msg.task?.id
              setTasks(prev=> sortTasks(prev.filter(x=> x.id !== id), sortBy, events))
            }else if(msg.task){
              const task = msg.task
              setTasks(prev=>{
                const without = prev.filter(x=> x.id !== task.id)
                return sortTasks([...without, task], sortBy, events)
              })
            }
          }
        }catch(err){ /* ignore parse errors */ }
      }
      ws.onclose = ()=>{ socketsRef.current.delete(key) }
      socketsRef.current.set(key, ws)
    })

    // Close sockets no longer needed
    Array.from(socketsRef.current.keys()).forEach(key=>{
      if(!neededEventIds.has(key)){
        const ws = socketsRef.current.get(key)
        ws?.close()
        socketsRef.current.delete(key)
      }
    })

    return ()=>{
      Array.from(socketsRef.current.values()).forEach(ws=> ws?.close())
      socketsRef.current.clear()
    }
  }, [events, tasks, sortBy])

  async function createTask(e){
    e.preventDefault()
    setError('')
    if(!selectedEvent){ setError('Select an event first'); return }
    try{
      const payload = { ...form, assignee: form.assignee || null, event: selectedEvent }
      const { data } = await api.post('/tasks/', payload, { auth: true })
      setTasks(prev=> sortTasks([data, ...prev]))
      setForm({ title:'', description:'', due_date:'', status:'pending', priority:'medium', assignee:'' })
    }catch(e){ setError('Failed to create task') }
  }

  async function deleteTask(taskId){
    if(!taskId) return
    const target = tasks.find(t=>t.id===taskId)
    const ownerEvent = events.find(ev=> String(ev.id) === String(target?.event || target?.event_id || target?.event?.id))
    if(!me || !ownerEvent || ownerEvent.owner_id !== me.id){
      setError('Only the event owner can delete tasks')
      return
    }
    if(!window.confirm('Delete this task?')) return
    setDeletingId(taskId)
    const prev = tasks
    setTasks(prev.filter(t=> t.id!==taskId))
    try{
      await api.delete(`/tasks/${taskId}/`, { auth: true })
    }catch(e){
      setTasks(prev)
      setError('Failed to delete task')
    }finally{ setDeletingId(null) }
  }

  const taskEventId = (t)=> t?.event?.id ?? t?.event_id ?? t?.event
  const taskOwnerId = (t)=>{
    const evId = taskEventId(t)
    return events.find(ev=> String(ev.id) === String(evId))?.owner_id
  }

  const canEditStatus = (t)=>{
    if(!me) return false
    const isOwner = taskOwnerId(t) === me.id
    const isAssignee = String(t.assignee || t.assignee_id) === String(me.id)
    return isOwner || isAssignee
  }

  const formatStatusLabel = (status)=> STATUS_OPTIONS.find(o=>o.value===status)?.label || status

  async function updateTaskStatus(taskId, nextStatus){
    if(!taskId || !nextStatus) return
    const target = tasks.find(t=> t.id === taskId)
    if(!target || target.status === nextStatus) return
    const prevStatus = target.status
    setError('')
    setUpdatingId(taskId)
    setTasks(prev=> sortTasks(prev.map(t=> t.id===taskId ? { ...t, status: nextStatus } : t)))
    try{
      await api.patch(`/tasks/${taskId}/`, { status: nextStatus }, { auth: true })
    }catch(e){
      setTasks(prev=> sortTasks(prev.map(t=> t.id===taskId ? { ...t, status: prevStatus } : t)))
      setError('Failed to update status')
    }finally{ setUpdatingId(null) }
  }

  return (
    <div>
      <Navbar/>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="section space-y-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Tasks</h2>
            {error && <div className="mt-1 text-sm text-rose-600 dark:text-rose-400">{error}</div>}
          </div>
          <div className="flex gap-2 items-center">
            <select className="input max-w-sm" value={selectedEvent} onChange={e=>setSelectedEvent(e.target.value)}>
              <option value="">Select event</option>
              {events.map(ev=> <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          </div>
  {/* PM-only create: show only if current user is owner of selected event */}
  {(selectedEvent && me && events.find(e=>String(e.id)===String(selectedEvent))?.owner_id === me.id) && (
  <form onSubmit={createTask} className="grid md:grid-cols-6 gap-3 items-end">
          <input className="input md:col-span-2" placeholder="Title" value={form.title} onChange={e=>setForm({...form, title:e.target.value})} required />
          <input className="input md:col-span-2" placeholder="Description" value={form.description} onChange={e=>setForm({...form, description:e.target.value})} />
          <input className="input" type="date" value={form.due_date} onChange={e=>setForm({...form, due_date:e.target.value})} />
          <select className="input" value={form.status} onChange={e=>setForm({...form, status:e.target.value})}>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>
          <select className="input" value={form.priority} onChange={e=>setForm({...form, priority:e.target.value})}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          {/* Assignee combobox */}
          <div className="md:col-span-2">
            <div className="relative overflow-visible z-50">
              <input className="input w-full" placeholder="Assign to (type to search)" value={assigneeQuery} onBlur={()=> setTimeout(()=> setAssigneeResults([]), 150)} onKeyDown={(e)=>{ if(e.key==='Escape'){ setAssigneeResults([]) } }} onChange={async (e)=>{
                const q = e.target.value; setAssigneeQuery(q)
                if(q.trim().length<2){ setAssigneeResults([]); return }
                try{ const { data } = await api.get(`/users/search/?q=${encodeURIComponent(q)}`, { auth: true }); setAssigneeResults(data?.results||[]) }catch{}
              }} />
              {!!assigneeResults.length && (
                <div className="absolute z-50 w-full bg-white border rounded-xl shadow-lg ring-1 ring-fuchsia-200/60 max-h-40 overflow-auto dark:bg-slate-900 dark:border-white/10 dark:ring-fuchsia-900/30"
                     style={{ top: 'auto', bottom: 'calc(100% + 0.25rem)' }}>
                  {assigneeResults.map(u => (
                    <button key={u.id} type="button" className="w-full text-left px-3 py-2 hover:bg-neutral-100 text-sm dark:hover:bg-slate-800" onClick={()=>{ setForm({...form, assignee: u.id}); setAssigneeQuery(u.username||u.email||`${u.id}`); setAssigneeResults([]) }}>{u.username || u.email}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button className="btn-primary">Create Task</button>
        </form>
  )}
        </div>

        <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
          <span className="uppercase tracking-wide text-xs text-slate-500">Sort</span>
          <select className="input w-48" value={sortBy} onChange={e=>{ const val = e.target.value; setSortBy(val); setTasks(prev=> sortTasks(prev, val)) }}>
            <option value="priority">Priority (High → Low)</option>
            <option value="event">Event name (A → Z)</option>
          </select>
        </div>

        <div className="grid gap-3">
          {tasks.map(t=> (
            <div key={t.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="font-semibold text-slate-900 dark:text-slate-100">{t.title}</div>
                <div className="flex items-center gap-3">
                  {canEditStatus(t) ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase tracking-wide text-slate-500">Status</span>
                      <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOTS[t.status] || 'bg-slate-400'}`}></span>
                      <select
                        className="input text-sm w-36"
                        value={t.status}
                        onChange={e=>updateTaskStatus(t.id, e.target.value)}
                        disabled={updatingId===t.id}
                      >
                        {STATUS_OPTIONS.map(opt=> <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>
                  ) : (
                    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ring-1 ${STATUS_STYLES[t.status] || 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
                      <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOTS[t.status] || 'bg-slate-400'}`}></span>
                      {formatStatusLabel(t.status)}
                    </span>
                  )}
                  {(me && taskOwnerId(t) === me.id) && (
                    <button
                      className="text-sm text-rose-700 dark:text-rose-300 hover:underline disabled:opacity-60"
                      disabled={deletingId===t.id}
                      onClick={()=>deleteTask(t.id)}
                    >{deletingId===t.id ? 'Deleting…' : 'Delete'}</button>
                  )}
                </div>
              </div>
              <div className="text-sm text-slate-700 dark:text-slate-300 opacity-90">Due: {t.due_date || '\u2014'}</div>
              <div className="text-sm text-slate-700 dark:text-slate-300 opacity-90">Priority: {t.priority}</div>
              {t.status === 'done' && t.completed_at && (
                <div className="text-sm text-emerald-600 dark:text-emerald-400 opacity-90">Completed: {new Date(t.completed_at).toLocaleString()}</div>
              )}
              <div className="text-sm text-slate-700 dark:text-slate-300 opacity-90">Assignee: {t.assignee_detail?.username || t.assignee_detail?.email || (t.assignee ? `#${t.assignee}` : '\u2014')}</div>
              <div className="text-sm text-slate-700 dark:text-slate-300 opacity-90">Event: {events.find(ev=> String(ev.id)===String(taskEventId(t)))?.name || 'Unknown event'}</div>
            </div>
          ))}
          {!tasks.length && <div className="opacity-70">No tasks yet.</div>}
        </div>
      </div>
    </div>
  )
}
