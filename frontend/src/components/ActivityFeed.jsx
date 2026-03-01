import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'

function describeEntry(entry){
  const payload = entry.payload || {}
  switch(entry.type){
    case 'event_status':
      return `Status changed ${payload.from || 'unknown'} -> ${payload.to || 'unknown'}`
    case 'task_created':
      return `Task created: ${payload.title || 'Untitled'}`
    case 'task_updated':
      return `Task updated: ${payload.title || 'Untitled'}${payload.from ? ` (${payload.from} -> ${payload.to || payload.status})` : ''}`
    case 'task_completed':
      return `Task completed: ${payload.title || 'Task'}`
    case 'budget_item_created':
      return `Budget item added: ${payload.title}`
    case 'budget_item_updated':
      return `Budget item updated: ${payload.title}`
    case 'budget_item_deleted':
      return `Budget item deleted: ${payload.title}`
    case 'automation':
    case 'automation_rule':
      return `Automation fired: ${payload.trigger}`
    case 'chat_system':
      return `System message: ${payload.content || ''}`
    case 'file_uploaded':
      return `File uploaded: ${payload.name || 'file'}`
    case 'poster_edit':
      return `Poster change: ${payload.action || 'edit'}`
    case 'certificate_generated':
      return `Certificate generated for user ${payload.user}`
    case 'user_joined':
      return `Participant joined`
    case 'user_left':
      return `Participant left`
    default:
      return entry.type.replace('_', ' ')
  }
}

export default function ActivityFeed({ eventId, visible }){
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchFeed = useCallback(async ()=>{
    if(!visible) return
    setLoading(true)
    setError('')
    try{
      const { data } = await api.get(`/events/${eventId}/timeline/`, { auth: true, params: { limit: 40 } })
      const list = Array.isArray(data) ? data : (data?.results ?? [])
      setItems(list)
    }catch(err){
      setError('Failed to load activity')
    }finally{
      setLoading(false)
    }
  }, [eventId, visible])

  useEffect(()=>{
    if(!visible) return
    fetchFeed()
    const id = setInterval(fetchFeed, 30000)
    return ()=> clearInterval(id)
  }, [fetchFeed, visible])

  if(!visible) return null

  return (
    <div className="mt-3 rounded border dark:border-white/10 bg-white/60 dark:bg-slate-900/40 p-3 space-y-2">
      <div className="text-sm font-semibold">Activity</div>
      {loading && <div className="text-xs opacity-70">Loading…</div>}
      {error && <div className="text-xs text-rose-600 dark:text-rose-300">{error}</div>}
      {!loading && !items.length && <div className="text-xs opacity-70">No activity yet.</div>}
      {!!items.length && (
        <div className="max-h-80 overflow-y-auto pr-1">
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {items.map(entry => {
              const actor = entry.actor?.username || 'System'
              const ts = entry.created_at ? new Date(entry.created_at).toLocaleString() : ''
              return (
                <li key={entry.id} className="py-2">
                  <div className="text-sm">{describeEntry(entry)}</div>
                  <div className="text-xs opacity-70 flex items-center gap-2">
                    <span>{actor}</span>
                    <span>•</span>
                    <span>{ts}</span>
                    {entry.payload?.matched_conditions?.length ? (
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200 text-[11px]">why: {entry.payload.matched_conditions.join(', ')}</span>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
