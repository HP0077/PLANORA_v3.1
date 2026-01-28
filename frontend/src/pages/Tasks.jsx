import { useEffect, useState } from 'react'
import api from '../services/api'
import Navbar from '../components/Navbar'

export default function Tasks(){
  const [events, setEvents] = useState([])
  const [tasks, setTasks] = useState([])
  const [selectedEvent, setSelectedEvent] = useState('')
  const [form, setForm] = useState({ title:'', description:'', due_date:'', status:'pending', priority:'medium', assignee:'' })
  const [error, setError] = useState('')
  const [assigneeQuery, setAssigneeQuery] = useState('')
  const [assigneeResults, setAssigneeResults] = useState([])
  const [me, setMe] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(()=>{(async()=>{
    try{
      const [meRes, ev] = await Promise.all([
        api.get('/users/me/', { auth: true }),
        api.get('/events/', { auth: true })
      ])
      setMe(meRes.data || null)
      setEvents(ev.data?.results ?? ev.data ?? [])
      const t = await api.get('/tasks/', { auth: true })
      const list = t.data?.results ?? t.data ?? []
      const arr = Array.isArray(list) ? list : []
      const order = { high: 0, medium: 1, low: 2 }
      arr.sort((a,b)=> (order[a.priority||'medium'] - order[b.priority||'medium']) || (new Date(b.created_at) - new Date(a.created_at)))
      setTasks(arr)
    }catch(e){ setError('Failed to load tasks/events') }
  })()},[])

  async function createTask(e){
    e.preventDefault()
    setError('')
    if(!selectedEvent){ setError('Select an event first'); return }
    try{
      const payload = { ...form, assignee: form.assignee || null, event: selectedEvent }
      const { data } = await api.post('/tasks/', payload, { auth: true })
      setTasks(prev=> [data, ...prev])
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

        <div className="grid gap-3">
          {tasks.map(t=> (
            <div key={t.id} className="card p-4">
              <div className="flex justify-between gap-3">
                <div className="font-semibold text-slate-900 dark:text-slate-100">{t.title} <span className="text-xs opacity-60">[{t.status}]</span></div>
                {(me && events.find(ev=> String(ev.id) === String(t.event || t.event_id || t.event?.id))?.owner_id === me.id) && (
                  <button
                    className="text-sm text-rose-700 dark:text-rose-300 hover:underline disabled:opacity-60"
                    disabled={deletingId===t.id}
                    onClick={()=>deleteTask(t.id)}
                  >{deletingId===t.id ? 'Deleting…' : 'Delete'}</button>
                )}
              </div>
              <div className="text-sm text-slate-700 dark:text-slate-300 opacity-90">Due: {t.due_date || '\u2014'}</div>
              <div className="text-sm text-slate-700 dark:text-slate-300 opacity-90">Priority: {t.priority}</div>
              <div className="text-sm text-slate-700 dark:text-slate-300 opacity-90">Assignee: {t.assignee_detail?.username || t.assignee_detail?.email || (t.assignee ? `#${t.assignee}` : '\u2014')}</div>
            </div>
          ))}
          {!tasks.length && <div className="opacity-70">No tasks yet.</div>}
        </div>
      </div>
    </div>
  )
}
