import { useEffect, useRef, useState } from 'react'
import Navbar from '../components/Navbar'
import api from '../services/api'

export default function Poster(){
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const fabricRef = useRef(null)
  const fabricLibRef = useRef(null)
  const [drafts, setDrafts] = useState([])
  const [templates, setTemplates] = useState([])
  const [assets, setAssets] = useState([])
  const [roomId, setRoomId] = useState('')
  const [eventId, setEventId] = useState('')
  const [draftId, setDraftId] = useState(null)
  const [draftName, setDraftName] = useState('My Poster')
  const [saving, setSaving] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [preset, setPreset] = useState('Custom')
  const dragRef = useRef({ isDragging: false, lastPosX: 0, lastPosY: 0, keyPan: false })
  const [initError, setInitError] = useState('')
  const [apiError, setApiError] = useState('')
  const autosaveTimerRef = useRef(null)
  const [autosaveEnabled] = useState(true)
  const [gridOn, setGridOn] = useState(true)
  const historyRef = useRef({ stack: [], idx: -1, lock:false })
  const [drawOn, setDrawOn] = useState(false)
  const [brushColor, setBrushColor] = useState('#111827')
  const [brushWidth, setBrushWidth] = useState(3)
  // Selection & text properties (from attached editor spec)
  const [selectedObjects, setSelectedObjects] = useState([])
  const [textProperties, setTextProperties] = useState({
    fontSize: 28,
    fontFamily: 'Arial',
    fontWeight: 'normal',
    textAlign: 'left',
    fill: '#111827'
  })
  const [skipFabric] = useState(()=>{
    try { return new URLSearchParams(window.location.search).has('noFabric') } catch { return false }
  })
  const keyDownRef = useRef(null)
  const keyUpRef = useRef(null)

  useEffect(()=>{
    (async ()=>{
      try{
        if(skipFabric){
          // Skip fabric init to verify UI mounts; helpful for debugging blank screens
          return
        }
        const mod = await import('fabric')
        const F = mod.fabric || mod.default || mod
        if(!F || !F.Canvas){
          throw new Error('Fabric library failed to load.')
        }
        fabricLibRef.current = F
  const el = document.createElement('canvas')
  el.style.border = '1px solid #e5e7eb' // visible boundary
  el.style.background = '#fff'
  canvasRef.current = el
  const c = new F.Canvas(el, { preserveObjectStacking: true, backgroundColor: '#ffffff', selection:true })
        fabricRef.current = c
        c.setWidth(1000); c.setHeight(700)
        // grid
        const grid = 20
        function drawGrid(){
          if(!gridOn) return
          for (let i = 0; i < (c.width / grid); i++) {
            const line = new F.Line([ i * grid, 0, i * grid, c.height], { stroke: '#f3f4f6', selectable: false, evented:false })
            line._isGridLine = true
            c.add(line)
            if(typeof line.sendToBack === 'function'){ line.sendToBack() } else if(typeof line.moveTo === 'function'){ line.moveTo(0) }
          }
          for (let i = 0; i < (c.height / grid); i++) {
            const line = new F.Line([ 0, i * grid, c.width, i * grid], { stroke: '#f3f4f6', selectable: false, evented:false })
            line._isGridLine = true
            c.add(line)
            if(typeof line.sendToBack === 'function'){ line.sendToBack() } else if(typeof line.moveTo === 'function'){ line.moveTo(0) }
          }
        }
        drawGrid()
        c.on('object:moving', (e)=>{
          const obj = e.target; if(!obj) return
          obj.set({ left: Math.round(obj.left / grid) * grid, top: Math.round(obj.top / grid) * grid })
        })
        c.on('mouse:wheel', (opt)=>{
          const delta = opt.e.deltaY
          let z = c.getZoom()
          const pointer = c.getPointer(opt.e)
          z *= 0.999 ** delta
          z = Math.min(4, Math.max(0.1, z))
          c.zoomToPoint(new F.Point(pointer.x, pointer.y), z)
          setZoom(parseFloat(z.toFixed(2)))
          opt.e.preventDefault(); opt.e.stopPropagation()
        })
        c.on('mouse:down', (opt)=>{
          if(opt.e.altKey || dragRef.current.keyPan){
            dragRef.current.isDragging = true
            dragRef.current.lastPosX = opt.e.clientX
            dragRef.current.lastPosY = opt.e.clientY
            c.setCursor('grab')
          }
        })
        c.on('mouse:move', (opt)=>{
          if(dragRef.current.isDragging){
            const v = c.viewportTransform
            v[4] += opt.e.clientX - dragRef.current.lastPosX
            v[5] += opt.e.clientY - dragRef.current.lastPosY
            c.requestRenderAll()
            dragRef.current.lastPosX = opt.e.clientX
            dragRef.current.lastPosY = opt.e.clientY
          }
        })
  c.on('mouse:up', ()=>{ dragRef.current.isDragging = false; c.setCursor('default') })
  // Selection events for toolbar state & text properties
  c.on('selection:created', ()=>{ updateSelectedObjects() })
  c.on('selection:updated', ()=>{ updateSelectedObjects() })
  c.on('selection:cleared', ()=>{ setSelectedObjects([]) })
  // keyboard pan with Space
  const keyDown = (e)=>{ if(e.code==='Space'){ dragRef.current.keyPan = true; e.preventDefault() } }
  const keyUp = (e)=>{ if(e.code==='Space'){ dragRef.current.keyPan = false } }
  keyDownRef.current = keyDown
  keyUpRef.current = keyUp
  window.addEventListener('keydown', keyDownRef.current)
  window.addEventListener('keyup', keyUpRef.current)
        const wrap = containerRef.current
        if(wrap){ wrap.innerHTML=''; wrap.appendChild(el) }
        await loadDrafts(); await loadTemplates();
        // autosave hooks
        const pushHistory = ()=>{
          if(historyRef.current.lock) return
          const state = JSON.stringify(getState())
          const h = historyRef.current
          // truncate forward
          if(h.idx < h.stack.length - 1) h.stack = h.stack.slice(0, h.idx+1)
          h.stack.push(state); h.idx++
          if(h.stack.length > 100) { h.stack.shift(); h.idx-- } // cap size
        }
        const scheduleSave = ()=>{
          if(!autosaveEnabled) return
          if(autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
          autosaveTimerRef.current = setTimeout(()=>{ if(draftId) saveDraft().catch(()=>{}) }, 800)
        }
  c.on('object:modified', (e)=>{ if(e?.target?._isGridLine) return; pushHistory(); scheduleSave() })
  c.on('object:added', (e)=>{ if(e?.target?._isGridLine) return; pushHistory(); scheduleSave() })
  c.on('object:removed', (e)=>{ if(e?.target?._isGridLine) return; pushHistory(); scheduleSave() })
  c.on('path:created', ()=>{ pushHistory(); scheduleSave() })
      }catch(err){
        console.error('Fabric init error:', err)
        setInitError(String(err?.message || err))
      }
    })()
  return ()=>{ try{ fabricRef.current?.dispose?.() }catch{}; if(keyDownRef.current){ window.removeEventListener('keydown', keyDownRef.current) } if(keyUpRef.current){ window.removeEventListener('keyup', keyUpRef.current) } }
  }, [])

  // Keep selected objects in sync and reflect text props
  function updateSelectedObjects(){
    const c = fabricRef.current
    if(!c) return
    const activeObjects = c.getActiveObjects ? c.getActiveObjects() : (c.getActiveObject ? [c.getActiveObject()].filter(Boolean) : [])
    setSelectedObjects(activeObjects)
    if(activeObjects.length === 1 && activeObjects[0].type === 'i-text'){
      const t = activeObjects[0]
      setTextProperties({
        fontSize: t.fontSize ?? 28,
        fontFamily: t.fontFamily ?? 'Arial',
        fontWeight: t.fontWeight ?? 'normal',
        textAlign: t.textAlign ?? 'left',
        fill: t.fill ?? '#111827'
      })
    }
  }

  async function loadDrafts(){
    setApiError('')
    try{
      const { data } = await api.get('/poster/drafts/', { auth: true })
      setDrafts(data?.results || data || [])
    }catch(err){ setApiError('Failed to load drafts. Are you logged in?') }
  }
  async function loadTemplates(){
    setApiError('')
    try{
      const { data } = await api.get('/poster/templates/', { auth: true })
      setTemplates(data?.results || data || [])
    }catch(err){ setApiError('Failed to load templates.') }
  }
  async function loadAssets(){
    const params = new URLSearchParams()
    if(roomId) params.set('room', roomId)
    params.set('type','image')
    const { data } = await api.get(`/files/?${params.toString()}`, { auth: true })
    setAssets(data?.results || data || [])
  }

  function addText(){
    const c = fabricRef.current
    const F = fabricLibRef.current
    const t = new F.IText('Add text', { left: 100, top: 100, fontSize: 28, fill: '#111827' })
    c.add(t).setActiveObject(t)
  }
  function addRect(){ const c = fabricRef.current; const F = fabricLibRef.current; const r = new F.Rect({ left: 120, top: 120, width: 160, height: 100, fill:'#93c5fd', rx: 8, ry:8 }); c.add(r).setActiveObject(r) }
  function addCircle(){ const c = fabricRef.current; const F = fabricLibRef.current; const circ = new F.Circle({ left: 130, top: 130, radius: 60, fill:'#fca5a5' }); c.add(circ).setActiveObject(circ) }
  function addTriangle(){ const c = fabricRef.current; const F = fabricLibRef.current; const t = new F.Triangle({ left: 140, top: 140, width: 120, height: 100, fill:'#a7f3d0' }); c.add(t).setActiveObject(t) }

  function applyPreset(name){
    const sizes = {
      'A4 Portrait': { w: 793, h: 1122 }, // ~ 210x297mm @96dpi approx
      'A4 Landscape': { w: 1122, h: 793 },
      'Poster (1080x1350)': { w: 1080, h: 1350 },
      'Instagram (1080x1080)': { w: 1080, h: 1080 },
      'Banner (1920x500)': { w: 1920, h: 500 },
      'Certificate (1754x1240)': { w: 1754, h: 1240 },
    }
    const s = sizes[name]
    if(!s) return
    const c = fabricRef.current
    c.setWidth(s.w); c.setHeight(s.h); c.requestRenderAll()
    setPreset(name)
  }
  function addImageFromUrl(url){
    const c = fabricRef.current
    const F = fabricLibRef.current
    F.Image.fromURL(url, (img)=>{ img.set({ left: 120, top: 120, scaleX: 0.5, scaleY:0.5 }); c.add(img).setActiveObject(img) }, { crossOrigin: 'anonymous' })
  }
  function bringToFront(){ const o = fabricRef.current.getActiveObject(); if(o){ o.bringToFront(); fabricRef.current.requestRenderAll() } }
  function sendToBack(){ const o = fabricRef.current.getActiveObject(); if(o){ o.sendToBack(); fabricRef.current.requestRenderAll() } }
  function group(){
    const c = fabricRef.current
    const F = fabricLibRef.current
    const sel = c.getActiveObjects()
    if(sel.length>1){
      const g = new F.Group(sel)
      c.discardActiveObject()
      sel.forEach(o=>c.remove(o))
      c.add(g).setActiveObject(g)
    }
  }
  function ungroup(){ const c = fabricRef.current; const o = c.getActiveObject(); if(o && o.type==='group'){ const items = o._objects; o._restoreObjectsState(); c.remove(o); items.forEach(i=>c.add(i)); } }
  function lock(){ const o = fabricRef.current.getActiveObject(); if(o){ o.selectable=false; o.evented=false; o.opacity = 0.6; fabricRef.current.requestRenderAll() } }
  function unlock(){ const o = fabricRef.current.getActiveObject(); if(o){ o.selectable=true; o.evented=true; o.opacity = 1; fabricRef.current.requestRenderAll() } }
  function remove(){ const c = fabricRef.current; const o = c.getActiveObject(); if(o){ c.remove(o) } }

  // Update text properties on selected IText
  function updateTextProperty(property, value){
    const c = fabricRef.current
    if(!c) return
    const active = c.getActiveObject?.()
    if(active && active.type === 'i-text'){
      active.set({ [property]: value })
      c.requestRenderAll()
      setTextProperties(prev => ({ ...prev, [property]: value }))
    }
  }

  function getState(){
    const c = fabricRef.current
    return {
      width: c.getWidth(), height: c.getHeight(), bg: c.backgroundColor,
      objects: c.getObjects().map(o=> o.toObject(['selectable','evented']))
    }
  }

  async function saveDraft(){
    setSaving(true)
    try{
      if(draftId){
        await api.put(`/poster/drafts/${draftId}/`, { name: draftName, state: getState(), event: eventId||null, room: roomId||null }, { auth:true })
      }else{
        const { data } = await api.post('/poster/drafts/', { name: draftName, state: getState(), event: eventId||null, room: roomId||null }, { auth:true })
        setDraftId(data.id)
      }
      await loadDrafts()
    } catch(err){ setApiError('Failed to save draft.') } finally { setSaving(false) }
  }

  async function openDraft(id){
    const { data } = await api.get(`/poster/drafts/${id}/`, { auth: true })
    setDraftId(data.id); setDraftName(data.name||'My Poster'); setEventId(data.event||''); setRoomId(data.room||'')
    const c = fabricRef.current
    c.clear(); c.setBackgroundColor(data.state?.bg || '#ffffff', ()=>{})
    c.setWidth(data.state?.width || 1000); c.setHeight(data.state?.height || 700)
    const objs = data.state?.objects || []
    const F = fabricLibRef.current
    F.util.enlivenObjects(objs, (enlivened)=>{ enlivened.forEach(o=>c.add(o)); c.requestRenderAll() })
  }

  function download(fmt='png'){
    const c = fabricRef.current
    const dataURL = c.toDataURL({ format: fmt==='jpg'?'jpeg':fmt, quality: 1 })
    const a = document.createElement('a'); a.href=dataURL; a.download=`poster.${fmt}`; a.click()
  }

  // Zoom helpers
  function zoomIn(){ const c = fabricRef.current; let z = Math.min(4, c.getZoom()*1.2); c.zoomToPoint(new (fabricLibRef.current).Point(c.getWidth()/2, c.getHeight()/2), z); setZoom(parseFloat(z.toFixed(2))) }
  function zoomOut(){ const c = fabricRef.current; let z = Math.max(0.1, c.getZoom()/1.2); c.zoomToPoint(new (fabricLibRef.current).Point(c.getWidth()/2, c.getHeight()/2), z); setZoom(parseFloat(z.toFixed(2))) }
  function zoomReset(){ const c = fabricRef.current; c.setViewportTransform([1,0,0,1,0,0]); c.setZoom(1); setZoom(1) }
  function zoomFit(){
    const c = fabricRef.current
    if(!c || !containerRef.current) return
    const wrap = containerRef.current.getBoundingClientRect()
    const margin = 40
    const availW = Math.max(100, wrap.width - margin)
    const availH = Math.max(100, wrap.height - margin)
    const scaleX = availW / c.getWidth()
    const scaleY = availH / c.getHeight()
    const z = Math.max(0.1, Math.min(4, Math.min(scaleX, scaleY)))
    c.setViewportTransform([z,0,0,z,(availW - c.getWidth()*z)/2, (availH - c.getHeight()*z)/2])
    setZoom(parseFloat(z.toFixed(2)))
  }

  async function serverExport(fmt='pdf'){
    if(!draftId){ setApiError('Save the draft first to export.'); return }
    try{
      const res = await api.post(`/poster/drafts/${draftId}/export/?format=${fmt}`, {}, { auth:true, responseType:'blob' })
      const blob = new Blob([res.data], { type: fmt==='pdf'?'application/pdf':(fmt==='png'?'image/png':'image/jpeg') })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href=url; a.download=`poster.${fmt}`; a.click(); URL.revokeObjectURL(url)
    }catch(err){ setApiError('Export failed.') }
  }

  async function lockDraft(){ if(!draftId) return; try{ await api.post(`/poster/drafts/${draftId}/lock/`, {}, { auth:true }); await loadDrafts() }catch(err){ setApiError('Lock failed.') } }
  async function unlockDraft(){ if(!draftId) return; try{ await api.post(`/poster/drafts/${draftId}/unlock/`, {}, { auth:true }); await loadDrafts() }catch(err){ setApiError('Unlock failed.') } }

  function applyTemplateJson(json){
    const c = fabricRef.current
    const F = fabricLibRef.current
    c.clear(); c.setBackgroundColor(json?.bg || '#ffffff', ()=>{})
    c.setWidth(json?.width || 1000); c.setHeight(json?.height || 700)
    const objs = json?.objects || []
    F.util.enlivenObjects(objs, (enlivened)=>{ enlivened.forEach(o=>c.add(o)); c.requestRenderAll(); const h = historyRef.current; h.stack=[]; h.idx=-1; })
  }

  function newDraft(){
    setDraftId(null); setDraftName('My Poster'); setEventId(''); setRoomId(''); setApiError('')
    applyTemplateJson({ bg:'#ffffff', width:1000, height:700, objects:[] })
  }

  function undo(){
    const h = historyRef.current; const c = fabricRef.current; const F = fabricLibRef.current
    if(h.idx <= 0) return
    h.idx--
    const prev = JSON.parse(h.stack[h.idx])
    historyRef.current.lock = true
    c.clear(); c.setBackgroundColor(prev.bg || '#ffffff', ()=>{})
    c.setWidth(prev.width || 1000); c.setHeight(prev.height || 700)
    F.util.enlivenObjects(prev.objects||[], (enlivened)=>{ enlivened.forEach(o=>c.add(o)); c.requestRenderAll(); historyRef.current.lock=false })
  }
  function redo(){
    const h = historyRef.current; const c = fabricRef.current; const F = fabricLibRef.current
    if(h.idx >= h.stack.length - 1) return
    h.idx++
    const nxt = JSON.parse(h.stack[h.idx])
    historyRef.current.lock = true
    c.clear(); c.setBackgroundColor(nxt.bg || '#ffffff', ()=>{})
    c.setWidth(nxt.width || 1000); c.setHeight(nxt.height || 700)
    F.util.enlivenObjects(nxt.objects||[], (enlivened)=>{ enlivened.forEach(o=>c.add(o)); c.requestRenderAll(); historyRef.current.lock=false })
  }

  // keyboard shortcuts
  useEffect(()=>{
    const h = (e)=>{
      const ctrl = e.ctrlKey || e.metaKey
      if(ctrl && e.key.toLowerCase()==='z'){ e.preventDefault(); undo() }
      if(ctrl && (e.key.toLowerCase()==='y' || (e.shiftKey && e.key.toLowerCase()==='z'))){ e.preventDefault(); redo() }
      if(e.key==='Delete'){ remove() }
    }
    window.addEventListener('keydown', h)
    return ()=> window.removeEventListener('keydown', h)
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar/>
      <div className="p-3 border-b flex flex-wrap items-center gap-2">
        <div className="font-semibold mr-2">Poster Editor</div>
        <div className="flex items-center gap-1">
          <button className="px-2 py-1 border rounded" onClick={zoomOut} title="Zoom Out">-</button>
          <button className="px-2 py-1 border rounded" onClick={zoomIn} title="Zoom In">+</button>
          <button className="px-2 py-1 border rounded" onClick={zoomReset} title="100%">100%</button>
          <button className="px-2 py-1 border rounded" onClick={zoomFit} title="Fit">Fit</button>
          <button className={`px-2 py-1 border rounded ${gridOn?'bg-neutral-100':''}`} onClick={()=>{ setGridOn(g=>!g); const c = fabricRef.current; const lines = c.getObjects().filter(o=>o._isGridLine); lines.forEach(l=>c.remove(l)); if(!gridOn){ /* turning on */ const F = fabricLibRef.current; const grid=20; for (let i = 0; i < (c.width / grid); i++) { const line = new F.Line([ i * grid, 0, i * grid, c.height], { stroke: '#f3f4f6', selectable: false, evented:false }); line._isGridLine=true; c.add(line); if(typeof line.sendToBack==='function'){ line.sendToBack() } else if(typeof line.moveTo==='function'){ line.moveTo(0) } } for (let i = 0; i < (c.height / grid); i++) { const line = new F.Line([ 0, i * grid, c.width, i * grid], { stroke: '#f3f4f6', selectable: false, evented:false }); line._isGridLine=true; c.add(line); if(typeof line.sendToBack==='function'){ line.sendToBack() } else if(typeof line.moveTo==='function'){ line.moveTo(0) } } c.requestRenderAll() } }} title="Grid">Grid</button>
          <button className={`px-2 py-1 border rounded ${drawOn?'bg-neutral-100':''}`} onClick={()=>{
            const next = !drawOn; setDrawOn(next); const c = fabricRef.current; if(!c) return; c.isDrawingMode = next; if(next){ c.freeDrawingBrush = new (fabricLibRef.current).PencilBrush(c); c.freeDrawingBrush.color = brushColor; c.freeDrawingBrush.width = brushWidth; }
          }} title="Draw">Draw</button>
          {drawOn && (
            <>
              <input type="color" aria-label="Brush color" className="h-8 w-10 p-0 border rounded" value={brushColor} onChange={(e)=>{ setBrushColor(e.target.value); const c = fabricRef.current; if(c && c.freeDrawingBrush){ c.freeDrawingBrush.color = e.target.value } }} />
              <input type="range" aria-label="Brush width" min="1" max="50" value={brushWidth} onChange={(e)=>{ const w = Number(e.target.value)||1; setBrushWidth(w); const c = fabricRef.current; if(c && c.freeDrawingBrush){ c.freeDrawingBrush.width = w } }} />
            </>
          )}
          <button className="px-2 py-1 border rounded" onClick={undo} title="Undo">Undo</button>
          <button className="px-2 py-1 border rounded" onClick={redo} title="Redo">Redo</button>
        </div>
        <input value={draftName} onChange={e=>setDraftName(e.target.value)} className="px-2 py-1 border rounded" placeholder="Draft name"/>
        <select className="px-2 py-1 border rounded" value={preset} onChange={(e)=> applyPreset(e.target.value)}>
          <option>Custom</option>
          <option>A4 Portrait</option>
          <option>A4 Landscape</option>
          <option>Poster (1080x1350)</option>
          <option>Instagram (1080x1080)</option>
          <option>Banner (1920x500)</option>
          <option>Certificate (1754x1240)</option>
        </select>
        <input value={eventId} onChange={e=>setEventId(e.target.value)} className="px-2 py-1 border rounded w-28" placeholder="Event ID"/>
        <input value={roomId} onChange={e=>setRoomId(e.target.value)} className="px-2 py-1 border rounded w-28" placeholder="Room ID"/>
        <button className="px-3 py-1 border rounded" onClick={addText}>Text</button>
        <div className="flex items-center gap-1">
          <button className="px-2 py-1 border rounded" onClick={addRect} title="Rectangle">▭</button>
          <button className="px-2 py-1 border rounded" onClick={addCircle} title="Circle">◯</button>
          <button className="px-2 py-1 border rounded" onClick={addTriangle} title="Triangle">▲</button>
        </div>
        <label className="px-3 py-1 border rounded cursor-pointer">Add Image
          <input type="file" className="hidden" accept="image/*" onChange={(e)=>{
            const file = e.target.files?.[0]; if(!file) return
            const url = URL.createObjectURL(file)
            const F = fabricLibRef.current
            const c = fabricRef.current
            F.Image.fromURL(url, (img)=>{ img.set({ left: 120, top: 120 }); c.add(img).setActiveObject(img); URL.revokeObjectURL(url) }, { crossOrigin: 'anonymous' })
            e.target.value=''
          }} />
        </label>
  <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={group} disabled={selectedObjects.length < 2}>Group</button>
  <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={ungroup} disabled={selectedObjects.length !== 1 || selectedObjects[0]?.type !== 'group'}>Ungroup</button>
  <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={bringToFront} disabled={selectedObjects.length === 0}>Front</button>
  <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={sendToBack} disabled={selectedObjects.length === 0}>Back</button>
  <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={lock} disabled={selectedObjects.length === 0}>Lock</button>
  <button className="px-3 py-1 border rounded" onClick={unlock}>Unlock</button>
  <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={remove} disabled={selectedObjects.length === 0}>Delete</button>
        <button className="px-3 py-1 border rounded" onClick={()=>download('png')}>Export PNG</button>
        <button className="px-3 py-1 border rounded" onClick={()=>download('jpg')}>Export JPG</button>
        <button className="px-3 py-1 border rounded" onClick={()=>serverExport('pdf')}>Server PDF</button>
        <button className="px-3 py-1 border rounded" onClick={saveDraft} disabled={saving}>{saving? 'Saving…':'Save Draft'}</button>
        <button className="px-3 py-1 border rounded" onClick={newDraft}>New Draft</button>
        <button className="px-3 py-1 border rounded" onClick={lockDraft} disabled={!draftId}>Lock</button>
        <button className="px-3 py-1 border rounded" onClick={unlockDraft} disabled={!draftId}>Unlock</button>
        <select className="px-2 py-1 border rounded" onChange={e=> e.target.value && openDraft(e.target.value)}>
          <option value="">Open draft…</option>
          {drafts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <div className="ml-auto">Zoom: {zoom}x</div>
      </div>
      {/* Text Properties Toolbar */}
      {selectedObjects.length === 1 && selectedObjects[0]?.type === 'i-text' && (
        <div className="p-2 border-b bg-blue-50 flex items-center gap-2">
          <div className="text-sm font-medium text-blue-800">Text Properties:</div>
          <select 
            value={textProperties.fontFamily}
            onChange={e => updateTextProperty('fontFamily', e.target.value)}
            className="px-2 py-1 border rounded text-sm"
          >
            <option value="Arial">Arial</option>
            <option value="Helvetica">Helvetica</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Georgia">Georgia</option>
            <option value="Verdana">Verdana</option>
            <option value="Monaco">Monaco</option>
          </select>
          <input 
            type="number"
            value={textProperties.fontSize}
            onChange={e => updateTextProperty('fontSize', parseInt(e.target.value)||8)}
            className="px-2 py-1 border rounded w-16 text-sm"
            min="8"
            max="200"
          />
          <select 
            value={textProperties.fontWeight}
            onChange={e => updateTextProperty('fontWeight', e.target.value)}
            className="px-2 py-1 border rounded text-sm"
          >
            <option value="normal">Normal</option>
            <option value="bold">Bold</option>
          </select>
          <select 
            value={textProperties.textAlign}
            onChange={e => updateTextProperty('textAlign', e.target.value)}
            className="px-2 py-1 border rounded text-sm"
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
          <input 
            type="color"
            value={textProperties.fill}
            onChange={e => updateTextProperty('fill', e.target.value)}
            className="h-8 w-10 p-0 border rounded cursor-pointer"
            title="Text Color"
          />
        </div>
      )}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-56 border-r p-2 overflow-y-auto space-y-3">
          <div className="font-semibold">Templates</div>
          <button className="w-full px-2 py-1 border rounded" onClick={loadTemplates}>Refresh</button>
          {templates.map(t=> (
            <button key={t.id} className="w-full text-left px-2 py-1 hover:bg-neutral-100 rounded" onClick={async()=> applyTemplateJson(t.json)}>{t.name}</button>
          ))}
          <div className="font-semibold mt-4">Assets</div>
          <div className="flex gap-1">
            <input className="flex-1 px-2 py-1 border rounded" placeholder="Room ID" value={roomId} onChange={e=>setRoomId(e.target.value)} />
            <button className="px-2 border rounded" onClick={loadAssets}>Go</button>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {assets.map(a=> (
              <img key={a.id} src={a.file} className="w-full h-20 object-cover rounded cursor-pointer" onClick={()=>addImageFromUrl(a.file)} />
            ))}
          </div>
        </div>
        <div className="flex-1 grid place-items-center p-4 bg-neutral-50" ref={containerRef}>
          {!initError ? <div className="text-sm opacity-60">Canvas will appear here. Use mouse wheel to zoom, hold Space and drag to pan.</div> : (
            <div className="text-red-600 text-sm">Failed to load editor: {initError}</div>
          )}
          {apiError && <div className="absolute top-16 right-4 bg-red-50 text-red-700 border border-red-200 px-3 py-1 rounded text-sm">{apiError}</div>}
        </div>
      </div>
    </div>
  )
}
