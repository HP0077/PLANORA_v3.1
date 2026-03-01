import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import api from '../services/api'

export default function Certificates(){
  const [events, setEvents] = useState([])
  const [eventId, setEventId] = useState('')
  const [file, setFile] = useState(null)
  const [records, setRecords] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const baseUrl = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api'
  const token = localStorage.getItem('access') || sessionStorage.getItem('access')

  useEffect(()=>{(async()=>{
    try{
      const ev = await api.get('/events/', { auth: true })
      const data = ev.data?.results ?? ev.data ?? []
      setEvents(data)
      if(data.length && !eventId){ setEventId(String(data[0].id)) }
    }catch(e){ setError('Failed to load events') }
  })()},[])

  useEffect(()=>{ loadRecords(eventId) }, [eventId])

  async function loadRecords(evId){
    if(!evId){ setRecords([]); return }
    try{
      const resp = await api.get('/poster/certificates/', { auth: true, params: { event: evId } })
      setRecords(resp.data?.results ?? resp.data ?? [])
    }catch(e){ setRecords([]) }
  }

  async function openPreview(){
    const resp = await fetch(baseUrl + '/poster/certificate/preview/', {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    })
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  async function generateCertificates(e){
    e.preventDefault()
    setError('')
    setMessage('')
    if(!eventId){ setError('Select an event first'); return }
    if(!file){ setError('Upload a CSV or XLSX file with recipient names'); return }
    setLoading(true)
    try{
      const form = new FormData()
      form.append('event', eventId)
      form.append('file', file)
      const resp = await fetch(baseUrl + '/poster/certificates/generate/', {
        method: 'POST',
        headers: token ? { 'Authorization': 'Bearer ' + token } : {},
        body: form,
      })
      if(!resp.ok){
        let detail = 'Failed to generate certificates'
        try{ const data = await resp.json(); detail = data?.detail || detail }catch(_){ /* ignore */ }
        throw new Error(detail)
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'certificates.zip'
      a.click()
      URL.revokeObjectURL(url)
      setMessage('Certificates generated and downloaded')
      await loadRecords(eventId)
    }catch(err){ setError(err.message || 'Failed to generate certificates') }
    finally{ setLoading(false) }
  }

  const selectedEvent = events.find(ev=> String(ev.id) === String(eventId))

  return (
    <div>
      <Navbar/>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="section space-y-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Certificates</h2>
            <p className="mt-1 text-slate-600 dark:text-slate-300">Generate attendee certificates once an event is LIVE. Preview remains available.</p>
            {error && <div className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</div>}
            {message && <div className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">{message}</div>}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <form onSubmit={generateCertificates} className="card p-4 space-y-3 border border-slate-200 dark:border-slate-700">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Event</label>
                <select className="input mt-1" value={eventId} onChange={e=>setEventId(e.target.value)}>
                  <option value="">Select event</option>
                  {events.map(ev=> <option key={ev.id} value={ev.id}>{ev.name} ({ev.status || 'DRAFT'})</option>)}
                </select>
                {selectedEvent && <p className="text-xs text-slate-500 mt-1">Status: {selectedEvent.status || 'DRAFT'} • Certificates can be generated only when LIVE.</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Upload recipients (CSV or XLSX)</label>
                <input className="input mt-1" type="file" accept=".csv,.xlsx" onChange={e=>setFile(e.target.files?.[0] || null)} />
              </div>
              <div className="flex gap-2">
                <button className="btn-primary" type="submit" disabled={loading}>{loading ? 'Generating…' : 'Generate & Download ZIP'}</button>
                <button type="button" onClick={openPreview} className="btn-secondary">Open Preview PDF</button>
              </div>
            </form>

              <div className="card p-4 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-900 dark:text-slate-100">Recent certificates</div>
                {selectedEvent && <span className="text-xs text-slate-500">{selectedEvent.name}</span>}
              </div>
              {records.length === 0 && <div className="text-sm text-slate-600 dark:text-slate-300">No certificates generated yet.</div>}
              <div className="space-y-2">
                {records.slice(0,5).map(r=> (
                  <div key={r.id} className="border border-slate-200 dark:border-slate-700 rounded p-2 text-sm">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{r.recipient_name || 'Recipient'}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-300">{r.event_name}</div>
                    <div className="text-xs text-slate-500">Status: {r.status}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
