import { useEffect, useMemo, useState } from 'react'
import Navbar from '../components/Navbar'
import api from '../services/api'

const TRIGGERS = [
  { value: 'event_risk_high', label: 'Event Risk High' },
  { value: 'certificates_generated', label: 'Certificates Generated' },
]

const ACTION_TYPES = [
  { value: 'post_chat', label: 'Post Chat (system message)' },
  { value: 'create_task', label: 'Create Task' },
  { value: 'change_status', label: 'Change Event Status' },
  { value: 'notify_owner', label: 'Notify Owner (stub)' },
]

function ActionBuilder({ onAdd }){
  const [type, setType] = useState('post_chat')
  const [payload, setPayload] = useState({ message: 'Automated message' })

  useEffect(()=>{
    // Reset payload defaults when type changes
    if(type === 'post_chat') setPayload({ message: 'Automated message' })
    if(type === 'create_task') setPayload({ title: 'Automation Task', assignee: '' })
    if(type === 'change_status') setPayload({ status: 'PLANNING' })
    if(type === 'notify_owner') setPayload({ subject: 'Notification', body: 'Automated notice' })
  }, [type])

  function add(){
    const action = { type, ...payload }
    if(type === 'create_task' && payload.assignee === '') delete action.assignee
    onAdd(action)
  }

  return (
    <div className="card p-3 space-y-2">
      <div className="flex gap-2 items-center">
        <select className="input" value={type} onChange={e=>setType(e.target.value)}>
          {ACTION_TYPES.map(a=> <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <button type="button" className="btn-primary" onClick={add}>Add action</button>
      </div>
      {type === 'post_chat' && (
        <input className="input w-full" placeholder="Message" value={payload.message||''} onChange={e=>setPayload(p=>({...p, message:e.target.value}))} />
      )}
      {type === 'create_task' && (
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="Task title" value={payload.title||''} onChange={e=>setPayload(p=>({...p, title:e.target.value}))} />
          <input className="input w-40" placeholder="Assignee ID (optional)" value={payload.assignee||''} onChange={e=>setPayload(p=>({...p, assignee:e.target.value}))} />
        </div>
      )}
      {type === 'change_status' && (
        <select className="input" value={payload.status||'PLANNING'} onChange={e=>setPayload(p=>({...p, status:e.target.value}))}>
          {['DRAFT','PLANNING','LIVE','COMPLETED','ARCHIVED'].map(s=>(<option key={s} value={s}>{s}</option>))}
        </select>
      )}
      {type === 'notify_owner' && (
        <div className="space-y-2">
          <input className="input w-full" placeholder="Subject" value={payload.subject||''} onChange={e=>setPayload(p=>({...p, subject:e.target.value}))} />
          <textarea className="input w-full" placeholder="Body" value={payload.body||''} onChange={e=>setPayload(p=>({...p, body:e.target.value}))} />
        </div>
      )}
    </div>
  )}

export default function AutomationRules(){
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    name: '',
    trigger: TRIGGERS[0].value,
    conditionsText: '{"risk_score": {">": 0.7}}',
    actions: [],
    event: '',
    is_active: true,
    requires_confirmation: true,
  })
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadRules(){
    setLoading(true)
    try{
      const { data } = await api.get('/automation/rules/', { auth: true })
      setRules(data?.results ?? data ?? [])
      setError('')
    }catch(err){
      const msg = err?.response?.data?.error?.message || err?.response?.data?.detail || err?.message || 'Unknown error'
      setError(`Failed to load rules: ${msg}`)
    }finally{ setLoading(false) }
  }

  useEffect(()=>{ loadRules() }, [])

  function addAction(action){
    setForm(f=> ({ ...f, actions: [...f.actions, action] }))
  }

  async function toggleActive(rule){
    try{
      await api.patch(`/automation/rules/${rule.id}/`, { is_active: !rule.is_active }, { auth: true })
      await loadRules()
    }catch{ setError('Failed to toggle rule') }
  }

  async function deleteRule(rule){
    if(!window.confirm('Delete this rule?')) return
    try{
      await api.delete(`/automation/rules/${rule.id}/`, { auth: true })
      await loadRules()
      if(editingId === rule.id){ setEditingId(null) }
    }catch{ setError('Failed to delete rule') }
  }

  function startEdit(rule){
    setEditingId(rule.id)
    setForm({
      name: rule.name,
      trigger: rule.trigger,
      conditionsText: JSON.stringify(rule.conditions || {}, null, 2),
      actions: Array.isArray(rule.actions) ? rule.actions : [],
      event: rule.event || '',
      is_active: rule.is_active,
      requires_confirmation: rule.requires_confirmation ?? true,
    })
  }

  async function saveRule(e){
    e.preventDefault()
    setSaving(true)
    setError('')
    try{
      let conditions
      try{ conditions = JSON.parse(form.conditionsText || '{}') }catch(parseErr){ throw new Error('Invalid JSON in conditions') }
      const payload = {
        name: form.name || 'Untitled Rule',
        trigger: form.trigger,
        conditions,
        actions: form.actions,
        is_active: form.is_active,
        requires_confirmation: form.requires_confirmation,
      }
      if(form.event){ payload.event = Number(form.event) }
      if(editingId){
        await api.patch(`/automation/rules/${editingId}/`, payload, { auth: true })
      }else{
        await api.post('/automation/rules/', payload, { auth: true })
      }
      await loadRules()
      setForm(f=> ({ ...f, name:'', actions: [], conditionsText:'{}', event:'', requires_confirmation: true }))
      setEditingId(null)
    }catch(err){
      setError(err?.message || 'Failed to save rule')
    }finally{ setSaving(false) }
  }

  return (
    <div>
      <Navbar />
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="section space-y-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Automation Rules</h2>
            {error && <div className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</div>}
          </div>
          <form onSubmit={saveRule} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <input className="input" placeholder="Rule name" value={form.name} onChange={e=>setForm(f=>({...f, name:e.target.value}))} required />
              <select className="input" value={form.trigger} onChange={e=>setForm(f=>({...f, trigger:e.target.value}))}>
                {TRIGGERS.map(t=> <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <textarea className="input min-h-[140px]" placeholder="Conditions JSON" value={form.conditionsText} onChange={e=>setForm(f=>({...f, conditionsText:e.target.value}))} />
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Actions ({form.actions.length})</div>
                <div className="max-h-40 overflow-auto text-xs border rounded-xl p-2 bg-white/60 dark:bg-slate-900/30 dark:border-white/10">
                  <pre className="whitespace-pre-wrap break-words">{JSON.stringify(form.actions, null, 2) || '[]'}</pre>
                </div>
                <ActionBuilder onAdd={addAction} />
              </div>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <input className="input w-48" placeholder="Event ID (optional)" value={form.event} onChange={e=>setForm(f=>({...f, event:e.target.value}))} />
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input type="checkbox" checked={form.is_active} onChange={e=>setForm(f=>({...f, is_active:e.target.checked}))} className="rounded" />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200" title="Destructive actions (tasks/status) require confirm flag at runtime">
                <input type="checkbox" checked={form.requires_confirmation} onChange={e=>setForm(f=>({...f, requires_confirmation:e.target.checked}))} className="rounded" />
                Require confirmation for destructive actions
              </label>
              <button className="btn-primary" disabled={saving}>{saving ? 'Saving...' : (editingId ? 'Save changes' : 'Save rule')}</button>
              {editingId && <button type="button" className="btn-secondary" onClick={()=>{setEditingId(null); setForm(f=> ({ ...f, name:'', actions: [], conditionsText:'{}', event:'', requires_confirmation: true }))}}>Cancel</button>}
            </div>
          </form>
        </div>

        <div className="section space-y-4">
          <div className="font-semibold text-slate-900 dark:text-slate-100">Existing Rules</div>
          {loading && <div className="text-sm opacity-70">Loading…</div>}
          {!loading && !(rules?.length) && <div className="text-sm opacity-70">No rules yet.</div>}
          <div className="space-y-3">
            {rules?.map(rule => (
              <div key={rule.id} className="card p-4">
                <div className="flex justify-between items-center gap-3">
                  <div className="flex flex-col">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{rule.name}</div>
                    <div className="text-xs opacity-80 text-slate-700 dark:text-slate-300">{rule.event ? `Event: ${rule.event}` : 'Scope: global'} • Active: {String(rule.is_active)} • Confirm: {String(rule.requires_confirmation)}</div>
                  </div>
                  <div className="flex gap-2 items-center flex-wrap">
                    <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-100">{rule.trigger}</span>
                    <button className="btn-secondary text-xs" onClick={()=>startEdit(rule)}>Edit</button>
                    <button className="btn-secondary text-xs" onClick={()=>toggleActive(rule)}>{rule.is_active ? 'Disable' : 'Enable'}</button>
                    <button className="text-xs text-rose-700 dark:text-rose-300 hover:underline" onClick={()=>deleteRule(rule)}>Delete</button>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-2 mt-3 text-xs">
                  <div>
                    <div className="font-semibold text-slate-700 dark:text-slate-200 mb-1">Conditions</div>
                    <pre className="whitespace-pre-wrap break-words bg-white/70 dark:bg-slate-800/60 p-2 rounded-xl border dark:border-white/10">{JSON.stringify(rule.conditions, null, 2)}</pre>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-700 dark:text-slate-200 mb-1">Actions</div>
                    <pre className="whitespace-pre-wrap break-words bg-white/70 dark:bg-slate-800/60 p-2 rounded-xl border dark:border-white/10">{JSON.stringify(rule.actions, null, 2)}</pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
