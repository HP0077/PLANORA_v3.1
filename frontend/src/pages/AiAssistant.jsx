import { useEffect, useState, useMemo } from 'react'
import Navbar from '../components/Navbar'
import api from '../services/api'

function Message({ role, text }){
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} text-sm`}>
      <div className={`max-w-xl whitespace-pre-wrap break-words px-3 py-2 rounded-2xl shadow-sm ${isUser ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white' : 'bg-white dark:bg-slate-900/60 border dark:border-white/10'}`}>
        {text}
      </div>
    </div>
  )
}

export default function AiAssistant(){
  const [events, setEvents] = useState([])
  const [eventId, setEventId] = useState('')
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [conversationId, setConversationId] = useState(null)

  useEffect(()=>{
    (async()=>{
      try{
        const { data } = await api.get('/events/', { auth: true })
        const evs = data?.results ?? data ?? []
        setEvents(evs)
        if(!eventId && evs.length){ setEventId(String(evs[0].id)) }
      }catch(err){
        setError('Failed to load events')
      }
    })()
  }, [])

  // Reset conversation when event changes
  useEffect(()=>{
    setMessages([])
    setConversationId(null)
  }, [eventId])

  const canSend = useMemo(()=> question.trim().length>0 && eventId && !loading, [question, eventId, loading])

  async function sendQuestion(){
    if(!canSend) return
    const trimmed = question.trim().slice(0,500)
    const nextMessages = [...messages, { role:'user', text: trimmed }]
    setMessages(nextMessages)
    setQuestion('')
    setLoading(true)
    setError('')
    try{
      const payload = { event_id: Number(eventId), question: trimmed }
      if(conversationId) payload.conversation_id = conversationId
      const { data } = await api.post('/ai/ask/', payload, { auth: true })
      const answer = data?.answer || 'No answer returned.'
      if(data?.conversation_id) setConversationId(data.conversation_id)
      setMessages(msgs => [...msgs, { role:'assistant', text: answer }])
    }catch(err){
      // Surface any available error detail to the user; fall back to a readable message.
      const detail = err?.response?.data?.detail
        || err?.response?.data?.error
        || err?.response?.data?.message
        || err?.message
        || 'Request failed'
      setError(detail)
    }finally{
      setLoading(false)
    }
  }

  return (
    <div>
      <Navbar />
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="section space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">AI Assistant 🤖</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Ask about risk, budget, tasks, and next steps. Non-destructive suggestions only.</p>
            </div>
            <div className="flex flex-col gap-1 w-full sm:w-auto sm:min-w-[200px]">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Event</label>
              <select className="input" value={eventId} onChange={e=>setEventId(e.target.value)}>
                <option value="">Select event</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </div>
          </div>
          {error && <div className="text-sm text-rose-600 dark:text-rose-400">{error}</div>}
        </div>

        <div className="section p-4 space-y-3">
          <div className="h-[50vh] overflow-y-auto flex flex-col gap-3 pr-1">
            {!messages.length && (
              <div className="text-sm opacity-70">Try questions like: "Why is my event risky?", "What should I do next?", "Is my budget healthy?", "Which tasks are overdue?"</div>
            )}
            {messages.map((m, idx) => <Message key={idx} role={m.role} text={m.text} />)}
            {loading && <div className="text-sm opacity-70">Thinking…</div>}
          </div>

          <div className="flex flex-col gap-2">
            <textarea
              className="input min-h-[90px]"
              placeholder="Ask about your event (max 500 characters)"
              maxLength={500}
              value={question}
              onChange={e=>setQuestion(e.target.value)}
              onKeyDown={(e)=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendQuestion(); } }}
            />
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{question.length}/500</span>
              <span>Rate limit: 20 queries/hour</span>
            </div>
            <button className="btn-primary self-end" disabled={!canSend} onClick={sendQuestion}>{loading ? 'Sending…' : 'Ask'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
