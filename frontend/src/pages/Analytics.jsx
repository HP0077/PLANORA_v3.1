import { useEffect, useState, useCallback } from 'react'
import Navbar from '../components/Navbar'
import api from '../services/api'
import { useTheme } from '../context/ThemeContext'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts'

/* ──────────── palette ──────────── */
const PIE_PALETTE  = ['#d946ef','#ec4899','#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6']
const STATUS_COLOR = { pending:'#f59e0b', in_progress:'#6366f1', done:'#10b981' }
const PRIORITY_CLR = { low:'#10b981', medium:'#f59e0b', high:'#ef4444' }
const EVT_STATUS_CLR = { DRAFT:'#94a3b8', PLANNING:'#d946ef', LIVE:'#10b981', COMPLETED:'#6366f1', ARCHIVED:'#64748b' }

const INR = v => `₹${Number(v || 0).toLocaleString('en-IN')}`

/* ──────────── reusable bits ──────────── */
const statusBadge = {
  OK:        'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  WARNING:   'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  OVERSPENT: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card px-3 py-2 text-xs !shadow-lg">
      {label && <p className="font-semibold mb-1 text-slate-800 dark:text-slate-200">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  )
}

/* ──────────── main page ──────────── */
export default function Analytics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedEvent, setSelectedEvent] = useState('')
  const { isDarkMode } = useTheme()

  const fetchData = useCallback(async (eventId) => {
    setLoading(true)
    setError('')
    try {
      const params = eventId ? { event_id: eventId } : {}
      const { data: d } = await api.get('/analytics/summary/', { params, auth: true })
      setData(d)
    } catch {
      setError('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData(selectedEvent) }, [selectedEvent, fetchData])

  const axisStyle = { fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 11 }

  /* ─── loading / error ─── */
  if (loading) return (
    <div><Navbar />
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-center h-64 opacity-70">Loading analytics…</div>
      </div>
    </div>
  )
  if (error || !data) return (
    <div><Navbar />
      <div className="p-6 max-w-5xl mx-auto">
        <div className="text-sm text-rose-600 dark:text-rose-400">{error || 'No data'}</div>
      </div>
    </div>
  )

  /* ─── transform ─── */
  const taskStatusData   = Object.entries(data.task_by_status || {}).map(([k, v]) => ({ name: k.replace('_', ' '), value: v, key: k }))
  const taskPriorityData = Object.entries(data.task_by_priority || {}).map(([k, v]) => ({ name: k, value: v }))
  const eventStatusData  = Object.entries(data.event_by_status || {}).map(([k, v]) => ({ name: k, value: v }))
  const completionData   = (data.completion_trend || []).map(e => ({ day: e.day?.slice(5), completed: e.count }))
  const evtInfo          = data.selected_event
  const budget           = data.budget || {}

  return (
    <div>
      <Navbar />
      <div className="p-6 max-w-5xl mx-auto space-y-6">

        {/* ═══════════ HEADER ═══════════ */}
        <div className="section space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {evtInfo ? evtInfo.name : 'Analytics'}
              </h2>
              {evtInfo && (
                <p className="text-sm opacity-70 mt-0.5">
                  {evtInfo.date} · {evtInfo.status} · {evtInfo.mode}
                </p>
              )}
              {!evtInfo && (
                <p className="text-sm opacity-70 mt-0.5">Aggregated metrics across all your events</p>
              )}
            </div>
            <div className="flex flex-col gap-1 w-full sm:w-72">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Event</label>
              <select className="input" value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}>
                <option value="">All Events</option>
                {(data.event_list || []).map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.name} — {ev.status} ({ev.date})</option>
                ))}
              </select>
            </div>
          </div>

          {evtInfo?.description && (
            <div className="text-sm opacity-80">{evtInfo.description}</div>
          )}
        </div>

        {/* ═══════════ KPI CARDS ═══════════ */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="card p-4 text-center">
            <div className="text-3xl font-black text-slate-900 dark:text-slate-100">{data.total_events}</div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Events</div>
            <div className="text-xs opacity-70 mt-1">{eventStatusData.map(e => `${e.value} ${e.name}`).join(' · ')}</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-3xl font-black text-slate-900 dark:text-slate-100">{data.total_tasks}</div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Tasks</div>
            <div className="text-xs opacity-70 mt-1">{data.completion_pct}% completed</div>
          </div>
          <div className="card p-4 text-center">
            <div className={`text-3xl font-black ${data.overdue_tasks > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{data.overdue_tasks}</div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Overdue</div>
            <div className="text-xs opacity-70 mt-1">{data.overdue_tasks === 0 ? 'All on track!' : 'Need attention'}</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-3xl font-black text-slate-900 dark:text-slate-100">{data.total_participants}</div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Participants</div>
          </div>
          <div className="card p-4 text-center">
            <div className={`text-2xl font-black ${budget.variance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{INR(budget.total_actual)}</div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Expenses</div>
            <div className="text-xs opacity-70 mt-1">of {INR(budget.total_estimated)} est.</div>
          </div>
        </div>

        {/* ═══════════ CHARTS ═══════════ */}
        <div className="grid md:grid-cols-2 gap-6">

          {/* Tasks by Status */}
          <div className="section p-4">
            <h3 className="font-semibold mb-3 text-slate-900 dark:text-slate-100">Tasks by Status</h3>
            {taskStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={taskStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                       innerRadius={50} outerRadius={85} paddingAngle={3}
                       label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                       labelLine={false}>
                    {taskStatusData.map((e, i) => <Cell key={i} fill={STATUS_COLOR[e.key] || PIE_PALETTE[i % PIE_PALETTE.length]} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </div>

          {/* Tasks by Priority */}
          <div className="section p-4">
            <h3 className="font-semibold mb-3 text-slate-900 dark:text-slate-100">Tasks by Priority</h3>
            {taskPriorityData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={taskPriorityData} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={axisStyle} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Tasks" radius={[6, 6, 0, 0]}>
                    {taskPriorityData.map((e, i) => <Cell key={i} fill={PRIORITY_CLR[e.name] || PIE_PALETTE[i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </div>

          {/* Events by Status */}
          <div className="section p-4">
            <h3 className="font-semibold mb-3 text-slate-900 dark:text-slate-100">{selectedEvent ? 'Event Status' : 'Events by Status'}</h3>
            {eventStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={eventStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                       innerRadius={50} outerRadius={85} paddingAngle={3}
                       label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                       labelLine={false}>
                    {eventStatusData.map((e, i) => <Cell key={i} fill={EVT_STATUS_CLR[e.name] || PIE_PALETTE[i]} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </div>

          {/* Completion trend */}
          <div className="section p-4">
            <h3 className="font-semibold mb-3 text-slate-900 dark:text-slate-100">Task Completion (30 days)</h3>
            {completionData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={completionData}>
                  <defs>
                    <linearGradient id="gradComplete" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#d946ef" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#d946ef" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="day" tick={axisStyle} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={axisStyle} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="completed" stroke="#d946ef" strokeWidth={2}
                        fill="url(#gradComplete)" dot={{ fill: '#d946ef', r: 3 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyChart text="No completions in the last 30 days" />}
          </div>
        </div>

        {/* ═══════════ BUDGET ═══════════ */}
        <div className="grid md:grid-cols-3 gap-6">

          {/* Budget Summary */}
          <div className="section p-4 md:col-span-1">
            <h3 className="font-semibold mb-3 text-slate-900 dark:text-slate-100">Budget Summary</h3>
            <div className="space-y-3 text-sm">
              <div className="text-xs uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">Expenses</div>
              <Row label="Estimated" value={INR(budget.total_estimated)} />
              <Row label="Actual Spent" value={INR(budget.total_actual)} />
              <Row label="Variance"
                   value={`${budget.variance > 0 ? '+' : ''}${INR(budget.variance)}`}
                   valueClass={budget.variance > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'} />

              {/* progress bar */}
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${budget.utilisation_pct > 100 ? 'bg-rose-500' : budget.utilisation_pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                     style={{ width: `${Math.min(budget.utilisation_pct || 0, 100)}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${budget.variance > 0 ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200' : budget.variance < 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                  {budget.variance > 0 ? 'Over Budget' : budget.variance < 0 ? 'Under Budget' : 'On Track'}
                </span>
                <span className="text-xs opacity-70">{budget.utilisation_pct || 0}% used</span>
              </div>

              <div className="border-t border-white/30 dark:border-white/10 pt-2" />

              <div className="text-xs uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">Income</div>
              <Row label="Estimated" value={INR(budget.income_estimated)} valueClass="text-emerald-600 font-semibold" />
              <Row label="Actual" value={INR(budget.income_actual)} valueClass="text-emerald-600 font-semibold" />

              <div className="border-t border-white/30 dark:border-white/10 pt-2" />

              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800 dark:text-slate-200">Net (Income − Expenses)</span>
                <span className={`text-lg font-bold ${(budget.net_actual ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {INR(budget.net_actual)}
                </span>
              </div>
            </div>
          </div>

          {/* Budget by Event table */}
          <div className="section p-4 md:col-span-2">
            <h3 className="font-semibold mb-3 text-slate-900 dark:text-slate-100">Budget by Event</h3>
            {(budget.by_event || []).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b dark:border-white/10">
                      <th className="pb-2">Event</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2 text-right">Estimated</th>
                      <th className="pb-2 text-right">Actual</th>
                      <th className="pb-2 text-right">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budget.by_event.map((b, i) => (
                      <tr key={i} className="border-b dark:border-white/5">
                        <td className="py-2 font-medium text-slate-900 dark:text-slate-100">
                          {b.event__name || `Event #${b.event_id}`}
                        </td>
                        <td className="py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusBadge[b.status] || 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100'}`}>
                            {b.status}
                          </span>
                        </td>
                        <td className="py-2 text-right">{INR(b.total_estimated)}</td>
                        <td className="py-2 text-right">{INR(b.total_actual)}</td>
                        <td className={`py-2 text-right font-semibold ${Number(b.variance) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {Number(b.variance) > 0 ? '+' : ''}{INR(b.variance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="opacity-70 text-sm">No budget data yet.</div>}
          </div>
        </div>

      </div>
    </div>
  )
}

function Row({ label, value, valueClass = 'font-semibold text-slate-900 dark:text-slate-100' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  )
}

function EmptyChart({ text = 'No data yet' }) {
  return <div className="h-[250px] flex items-center justify-center text-sm opacity-70">{text}</div>
}
