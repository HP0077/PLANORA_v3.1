import { useEffect, useState, useMemo } from 'react'
import Navbar from '../components/Navbar'
import api from '../services/api'

const TABS = [
  { key: 'description', label: '✏️ Description Generator' },
  { key: 'tasks',       label: '📋 Task Suggestions' },
  { key: 'summary',     label: '📊 Event Report' },
  { key: 'risk',        label: '🛡️ Risk Mitigation' },
  { key: 'email',       label: '✉️ Email Drafter' },
]

/* ─── Shared event selector ─── */
function EventSelector({ events, eventId, setEventId }) {
  return (
    <div className="flex flex-col gap-1 w-full sm:w-auto sm:min-w-[220px]">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Event</label>
      <select className="input" value={eventId} onChange={e => setEventId(e.target.value)}>
        <option value="">Select event</option>
        {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
      </select>
    </div>
  )
}

/* ─── Result display ─── */
function ResultBox({ title, content, loading, error }) {
  return (
    <div className="section p-4 space-y-2 min-h-[180px]">
      {title && <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">{title}</h3>}
      {error && <div className="text-sm text-rose-600 dark:text-rose-400">{error}</div>}
      {loading && <div className="text-sm opacity-70 animate-pulse">Generating with AI…</div>}
      {!loading && content && (
        <div className="whitespace-pre-wrap text-sm bg-white dark:bg-slate-900/60 border dark:border-white/10 rounded-xl p-4 shadow-sm">
          {content}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Tab 1: Description Generator
   ═══════════════════════════════════════════════════════════════════════════ */
function DescriptionTab() {
  const [eventName, setEventName] = useState('')
  const [eventType, setEventType] = useState('')
  const [audience, setAudience] = useState('')
  const [keywords, setKeywords] = useState('')
  const [tone, setTone] = useState('professional')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const canSend = eventName.trim().length > 0 && !loading

  async function generate() {
    if (!canSend) return
    setLoading(true); setError(''); setResult('')
    try {
      const { data } = await api.post('/ai/generate-description/', {
        event_name: eventName.trim(),
        event_type: eventType.trim(),
        audience: audience.trim(),
        keywords: keywords.trim(),
        tone,
      }, { auth: true })
      setResult(data?.description || 'No description returned.')
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Request failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Event Name *</label>
          <input className="input" placeholder="e.g. Annual Tech Summit 2026" value={eventName} onChange={e => setEventName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Event Type</label>
          <input className="input" placeholder="e.g. Conference, Workshop, Meetup" value={eventType} onChange={e => setEventType(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Target Audience</label>
          <input className="input" placeholder="e.g. Software developers, Students" value={audience} onChange={e => setAudience(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Tone</label>
          <select className="input" value={tone} onChange={e => setTone(e.target.value)}>
            <option value="professional">Professional</option>
            <option value="casual">Casual</option>
            <option value="exciting">Exciting</option>
            <option value="formal">Formal</option>
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Keywords / Highlights</label>
        <input className="input" placeholder="e.g. networking, AI, hands-on labs" value={keywords} onChange={e => setKeywords(e.target.value)} />
      </div>
      <button className="btn-primary" disabled={!canSend} onClick={generate}>{loading ? 'Generating…' : 'Generate Description'}</button>
      <ResultBox title="Generated Description" content={result} loading={loading} error={error} />
      {result && (
        <button className="btn-secondary text-xs" onClick={() => { navigator.clipboard.writeText(result) }}>
          Copy to Clipboard
        </button>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Tab 2: Task Suggestions
   ═══════════════════════════════════════════════════════════════════════════ */
function TasksTab({ events, eventId, setEventId }) {
  const [context, setContext] = useState('')
  const [result, setResult] = useState('')
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const canSend = eventId && !loading

  async function suggest() {
    if (!canSend) return
    setLoading(true); setError(''); setResult(''); setTasks([])
    try {
      const { data } = await api.post('/ai/suggest-tasks/', {
        event_id: Number(eventId),
        additional_context: context.trim(),
      }, { auth: true })
      setResult(data?.raw_answer || '')
      setTasks(data?.tasks || [])
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Request failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <EventSelector events={events} eventId={eventId} setEventId={setEventId} />
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Additional Context (optional)</label>
        <input className="input" placeholder="e.g. Focus on marketing tasks, venue is outdoor" value={context} onChange={e => setContext(e.target.value)} maxLength={300} />
      </div>
      <button className="btn-primary" disabled={!canSend} onClick={suggest}>{loading ? 'Generating…' : 'Suggest Tasks'}</button>

      {error && <div className="text-sm text-rose-600 dark:text-rose-400">{error}</div>}
      {loading && <div className="text-sm opacity-70 animate-pulse">Generating with AI…</div>}

      {tasks.length > 0 && (
        <div className="section p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Suggested Tasks</h3>
          <div className="space-y-2">
            {tasks.map((t, i) => (
              <div key={i} className="bg-white dark:bg-slate-900/60 border dark:border-white/10 rounded-xl p-3 shadow-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{t.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${t.priority === 'high' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' : t.priority === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'}`}>
                    {t.priority}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{t.days_before} days before event</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{t.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!tasks.length && result && (
        <ResultBox title="AI Response" content={result} loading={false} error="" />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Tab 3: Event Summary / Report
   ═══════════════════════════════════════════════════════════════════════════ */
function SummaryTab({ events, eventId, setEventId }) {
  const [fmt, setFmt] = useState('brief')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const canSend = eventId && !loading

  async function generate() {
    if (!canSend) return
    setLoading(true); setError(''); setResult('')
    try {
      const { data } = await api.post('/ai/event-summary/', {
        event_id: Number(eventId),
        format: fmt,
      }, { auth: true })
      setResult(data?.summary || 'No summary returned.')
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Request failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <EventSelector events={events} eventId={eventId} setEventId={setEventId} />
        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Format</label>
          <select className="input" value={fmt} onChange={e => setFmt(e.target.value)}>
            <option value="brief">Brief (80-120 words)</option>
            <option value="detailed">Detailed (150-250 words)</option>
          </select>
        </div>
      </div>
      <button className="btn-primary" disabled={!canSend} onClick={generate}>{loading ? 'Generating…' : 'Generate Report'}</button>
      <ResultBox title="Event Status Report" content={result} loading={loading} error={error} />
      {result && (
        <button className="btn-secondary text-xs" onClick={() => { navigator.clipboard.writeText(result) }}>
          Copy to Clipboard
        </button>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Tab 4: Risk Mitigation
   ═══════════════════════════════════════════════════════════════════════════ */
function RiskTab({ events, eventId, setEventId }) {
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const canSend = eventId && !loading

  async function generate() {
    if (!canSend) return
    setLoading(true); setError(''); setResult('')
    try {
      const { data } = await api.post('/ai/risk-mitigation/', {
        event_id: Number(eventId),
      }, { auth: true })
      setResult(data?.mitigation_plan || 'No plan returned.')
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Request failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <EventSelector events={events} eventId={eventId} setEventId={setEventId} />
      <button className="btn-primary" disabled={!canSend} onClick={generate}>{loading ? 'Generating…' : 'Get Mitigation Plan'}</button>
      <ResultBox title="Risk Mitigation Plan" content={result} loading={loading} error={error} />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Tab 5: Email / Invitation Drafter
   ═══════════════════════════════════════════════════════════════════════════ */
function EmailTab({ events, eventId, setEventId }) {
  const [templateType, setTemplateType] = useState('invitation')
  const [recipientName, setRecipientName] = useState('')
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [tone, setTone] = useState('professional')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  const canSend = eventId && !loading

  async function generate() {
    if (!canSend) return
    setLoading(true); setError(''); setSubject(''); setBody(''); setCopied('')
    try {
      const { data } = await api.post('/ai/draft-email/', {
        event_id: Number(eventId),
        template_type: templateType,
        recipient_name: recipientName.trim(),
        additional_notes: additionalNotes.trim(),
        tone,
      }, { auth: true })
      setSubject(data?.subject || '')
      setBody(data?.body || data?.raw_output || 'No email generated.')
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Request failed')
    } finally { setLoading(false) }
  }

  function copyAll() {
    const text = subject ? `Subject: ${subject}\n\n${body}` : body
    navigator.clipboard.writeText(text)
    setCopied('all')
    setTimeout(() => setCopied(''), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <EventSelector events={events} eventId={eventId} setEventId={setEventId} />
        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Email Type *</label>
          <select className="input" value={templateType} onChange={e => setTemplateType(e.target.value)}>
            <option value="invitation">📨 Invitation</option>
            <option value="reminder">⏰ Reminder</option>
            <option value="thank_you">🙏 Thank You</option>
            <option value="follow_up">🔄 Follow Up</option>
            <option value="cancellation">❌ Cancellation</option>
            <option value="update">📢 Event Update</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Recipient Name (optional)</label>
          <input className="input" placeholder="e.g. John Doe, Team" value={recipientName} onChange={e => setRecipientName(e.target.value)} maxLength={100} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Tone</label>
          <select className="input" value={tone} onChange={e => setTone(e.target.value)}>
            <option value="professional">Professional</option>
            <option value="casual">Casual</option>
            <option value="formal">Formal</option>
            <option value="friendly">Friendly</option>
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Additional Notes (optional)</label>
        <input className="input" placeholder="e.g. Mention the keynote speaker, Include dress code" value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)} maxLength={300} />
      </div>
      <button className="btn-primary" disabled={!canSend} onClick={generate}>{loading ? 'Drafting…' : 'Draft Email'}</button>

      {error && <div className="text-sm text-rose-600 dark:text-rose-400">{error}</div>}
      {loading && <div className="text-sm opacity-70 animate-pulse">Drafting your email with AI…</div>}

      {(subject || body) && !loading && (
        <div className="section p-4 space-y-3">
          {subject && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Subject Line</h3>
              <div className="mt-1 bg-gradient-to-r from-indigo-50 to-fuchsia-50 dark:from-indigo-950/30 dark:to-fuchsia-950/30 border dark:border-white/10 rounded-xl px-4 py-2 text-sm font-medium">
                {subject}
              </div>
            </div>
          )}
          {body && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Email Body</h3>
              <div className="mt-1 whitespace-pre-wrap text-sm bg-white dark:bg-slate-900/60 border dark:border-white/10 rounded-xl p-4 shadow-sm">
                {body}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn-secondary text-xs" onClick={copyAll}>
              {copied === 'all' ? '✓ Copied!' : 'Copy Full Email'}
            </button>
            {subject && (
              <button className="btn-secondary text-xs" onClick={() => { navigator.clipboard.writeText(subject); setCopied('subj'); setTimeout(() => setCopied(''), 2000) }}>
                {copied === 'subj' ? '✓ Copied!' : 'Copy Subject Only'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════════════════════ */
export default function AiTools() {
  const [tab, setTab] = useState('description')
  const [events, setEvents] = useState([])
  const [eventId, setEventId] = useState('')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/events/', { auth: true })
        const evs = data?.results ?? data ?? []
        setEvents(evs)
        if (!eventId && evs.length) setEventId(String(evs[0].id))
      } catch {
        setLoadError('Failed to load events')
      }
    })()
  }, [])

  return (
    <div>
      <Navbar />
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="section space-y-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">AI Tools 🧠</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              Generative AI tools to help you plan, write, and manage your events faster.
            </p>
          </div>
          {loadError && <div className="text-sm text-rose-600 dark:text-rose-400">{loadError}</div>}
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                tab === t.key
                  ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-lg'
                  : 'bg-white dark:bg-slate-900/60 border dark:border-white/10 text-slate-700 dark:text-slate-200 hover:shadow-md'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="section p-5">
          {tab === 'description' && <DescriptionTab />}
          {tab === 'tasks' && <TasksTab events={events} eventId={eventId} setEventId={setEventId} />}
          {tab === 'summary' && <SummaryTab events={events} eventId={eventId} setEventId={setEventId} />}
          {tab === 'risk' && <RiskTab events={events} eventId={eventId} setEventId={setEventId} />}
          {tab === 'email' && <EmailTab events={events} eventId={eventId} setEventId={setEventId} />}
        </div>
      </div>
    </div>
  )
}
