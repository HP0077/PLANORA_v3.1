import { useEffect, useMemo, useRef, useState } from 'react'
import Navbar from '../components/Navbar'
import { Stage, Layer, Line, Text as KText, Rect, Image as KImage, Transformer, Circle, RegularPolygon } from 'react-konva'
import { posterApi } from '../services/posterApi'

const PRESETS = {
  // Instagram
  instagram_post: { label: 'Instagram Post 1:1 (1080×1080)', width: 1080, height: 1080 },
  instagram_portrait: { label: 'Instagram Portrait 4:5 (1080×1350)', width: 1080, height: 1350 },
  instagram_story: { label: 'Instagram Story/Reel 9:16 (1080×1920)', width: 1080, height: 1920 },
  // Facebook
  facebook_square: { label: 'Facebook Post Square (1200×1200)', width: 1200, height: 1200 },
  facebook_landscape: { label: 'Facebook Post Landscape (1200×630)', width: 1200, height: 630 },
  facebook_cover: { label: 'Facebook Cover (1640×624)', width: 1640, height: 624 },
  // X (Twitter)
  x_post: { label: 'X/Twitter Post 16:9 (1200×675)', width: 1200, height: 675 },
  twitter_banner: { label: 'X/Twitter Header (1500×500)', width: 1500, height: 500 },
  // LinkedIn
  linkedin_post: { label: 'LinkedIn Post (1200×627)', width: 1200, height: 627 },
  linkedin_banner: { label: 'LinkedIn Cover (1584×396)', width: 1584, height: 396 },
  // YouTube / TikTok / Pinterest
  youtube_thumb: { label: 'YouTube Thumbnail (1280×720)', width: 1280, height: 720 },
  tiktok_video: { label: 'TikTok Video 9:16 (1080×1920)', width: 1080, height: 1920 },
  pinterest_pin: { label: 'Pinterest Pin (1000×1500)', width: 1000, height: 1500 },
}

function Poster(){
  // Canvas size & preset
  const [presetKey, setPresetKey] = useState('instagram_post')
  const [STAGE_W, setSTAGE_W] = useState(PRESETS.instagram_post.width)
  const [STAGE_H, setSTAGE_H] = useState(PRESETS.instagram_post.height)

  // View
  const [zoom, setZoom] = useState(1)

  // Background
  const [bgColor, setBgColor] = useState('#ffffff')
  const [bgImageUrl, setBgImageUrl] = useState(null)
  const [bgImage, setBgImage] = useState(null)

  // Objects
  const [lines, setLines] = useState([])
  const [texts, setTexts] = useState([])
  const [images, setImages] = useState([])
  const [shapes, setShapes] = useState([]) // rect|circle|triangle

  // Tools & selection
  const [tool, setTool] = useState('select') // select|draw|erase
  const [isDrawing, setIsDrawing] = useState(false)
  const [isDrawingNow, setIsDrawingNow] = useState(false)
  const [brushColor, setBrushColor] = useState('#111827')
  const [brushWidth, setBrushWidth] = useState(4)
  const [brushOpacity, setBrushOpacity] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [exportStatus, setExportStatus] = useState('')

  // Derived
  const selectedText = useMemo(() => texts.find(t => t.id === selectedId) || null, [texts, selectedId])
  const selectedShape = useMemo(() => shapes.find(s => s.id === selectedId) || null, [shapes, selectedId])

  // Refs
  const stageRef = useRef(null)
  const trRef = useRef(null)
  const historyRef = useRef({ stack: [], idx: -1 })

  // Drafts
  const [draftId, setDraftId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')

  // Helpers
  function nextZ(){
    const all = [
      ...lines.map(o=>o.z||0),
      ...texts.map(o=>o.z||0),
      ...images.map(o=>o.z||0),
      ...shapes.map(o=>o.z||0),
    ]
    return (all.length ? Math.max(...all) : 0) + 1
  }

  function getSnapshot(){
    return {
      presetKey,
      size: { w: STAGE_W, h: STAGE_H },
      bg: { color: bgColor, imageUrl: bgImageUrl },
      lines,
      texts,
      shapes,
      images: images.map(i => ({
        id: i.id, x: i.x, y: i.y, width: i.width, height: i.height, rotation: i.rotation || 0,
        z: i.z||0, dataUrl: i._dataUrl || null, natW: i.natW||null, natH: i.natH||null
      })),
    }
  }

  function applySnapshot(snap){
    try{
      setPresetKey(snap.presetKey || 'instagram_post')
      const sz = snap.size || { w: PRESETS.instagram_post.width, h: PRESETS.instagram_post.height }
      setSTAGE_W(Number(sz.w)||PRESETS.instagram_post.width)
      setSTAGE_H(Number(sz.h)||PRESETS.instagram_post.height)
      const bg = snap.bg || {}
      setBgColor(bg.color || '#ffffff')
      setBgImageUrl(bg.imageUrl || null)
      if(bg.imageUrl){
        const img = new window.Image()
        img.crossOrigin = 'anonymous'
        img.onload = ()=> setBgImage(img)
        img.src = bg.imageUrl
      } else { setBgImage(null) }

      setLines(Array.isArray(snap.lines)? snap.lines : [])
      setTexts(Array.isArray(snap.texts)? snap.texts : [])
      setShapes(Array.isArray(snap.shapes)? snap.shapes : [])
      const imgs = Array.isArray(snap.images)? snap.images : []
      const hydrated = imgs.map(d => {
        const im = new window.Image()
        im.crossOrigin = 'anonymous'
        if(d.dataUrl){ im.src = d.dataUrl }
        return {
          id: d.id, x: d.x, y: d.y, width: d.width, height: d.height, rotation: d.rotation||0,
          z: d.z||0, image: im, _dataUrl: d.dataUrl||null, natW: d.natW||null, natH: d.natH||null
        }
      })
      setImages(hydrated)
      setSelectedId(null)
    }catch(err){ console.error('applySnapshot failed', err) }
  }

  function pushHistory(){
    const snap = getSnapshot()
    const h = historyRef.current
    if(h.idx < h.stack.length - 1){ h.stack = h.stack.slice(0, h.idx + 1) }
    h.stack.push(snap)
    if(h.stack.length > 50){ h.stack.shift(); h.idx = h.stack.length - 1 } else { h.idx++ }
  }

  function undo(){
    const h = historyRef.current
    if(h.idx <= 0) return
    h.idx--
    applySnapshot(h.stack[h.idx])
  }

  function redo(){
    const h = historyRef.current
    if(h.idx >= h.stack.length - 1) return
    h.idx++
    applySnapshot(h.stack[h.idx])
  }

  // Keyboard shortcuts
  useEffect(()=>{
    const onKey = (e)=>{
      const el = e.target && e.target.nodeType === 1 ? e.target : null
      const tag = el ? el.tagName.toLowerCase() : ''
      const isEditable = (el && (el.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select'))
      if(isEditable) return
      const ctrl = e.ctrlKey || e.metaKey
      const k = (e.key || '').toLowerCase()
      if(ctrl && k==='z' && !e.shiftKey){ e.preventDefault(); undo() }
      else if((ctrl && (k==='y' || (k==='z' && e.shiftKey)))){ e.preventDefault(); redo() }
      else if(k==='delete' || k==='backspace'){ if(selectedId){ e.preventDefault(); removeSelected() } }
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  }, [selectedId])

  // Transformer selection
  useEffect(()=>{
    const tr = trRef.current
    const stage = stageRef.current
    if(!tr || !stage){ return }
    if(!selectedId){ tr.nodes([]); tr.getLayer()?.batchDraw(); return }
    const node = stage.findOne('#'+selectedId)
    if(node){ tr.nodes([node]); tr.getLayer()?.batchDraw() } else { tr.nodes([]); tr.getLayer()?.batchDraw() }
  }, [selectedId, lines, texts, images, shapes])

  // Init history and drafts
  useEffect(()=>{ setTimeout(()=> pushHistory(), 0) }, [])
  useEffect(()=>{ loadLatestDraft() }, [])
  useEffect(()=>{
    if(!draftId) return
    const t = setInterval(()=>{ saveDraft({ silent: true }) }, 15000)
    return ()=> clearInterval(t)
  }, [draftId, bgColor, bgImageUrl, lines, texts, images, shapes, STAGE_W, STAGE_H, presetKey])

  // Mouse drawing
  function handleMouseDown(e){
    const stage = e.target.getStage()
    const clickedOnEmpty = e.target === stage
  if(tool === 'select' && clickedOnEmpty){ setSelectedId(null) }
    const activeDraw = tool === 'draw' || tool === 'erase' || isDrawing
    if(!activeDraw) return
    // Do not start drawing when interacting with existing draggable nodes (images, shapes, text)
    try{
      const tgt = e.target
      const isDraggable = typeof tgt.draggable === 'function' ? tgt.draggable() : Boolean(tgt?.attrs?.draggable)
      if(!clickedOnEmpty && isDraggable){ return }
    }catch{}
    const p = stage.getPointerPosition() || { x: 0, y: 0 }
    const scaleX = stage.scaleX() || 1
    const scaleY = stage.scaleY() || 1
    const pos = { x: (p.x - (stage.x()||0)) / scaleX, y: (p.y - (stage.y()||0)) / scaleY }
    const id = `line-${Date.now()}`
    const color = tool === 'erase' ? '#000000' : brushColor
    const mode = tool === 'erase' ? 'erase' : 'draw'
  setLines(prev => prev.concat([{ id, x:0, y:0, points: [pos.x, pos.y], color, width: brushWidth, opacity: brushOpacity, mode, z: nextZ() }]))
    setIsDrawingNow(true)
  }

  function handleMouseMove(e){
    const activeDraw = tool === 'draw' || tool === 'erase' || isDrawing
    if(!activeDraw || !isDrawingNow) return
    const stage = e.target.getStage()
    const p = stage.getPointerPosition() || { x: 0, y: 0 }
    const scaleX = stage.scaleX() || 1
    const scaleY = stage.scaleY() || 1
    const point = { x: (p.x - (stage.x()||0)) / scaleX, y: (p.y - (stage.y()||0)) / scaleY }
    setLines(prev => {
      if(prev.length === 0) return prev
      const last = prev[prev.length - 1]
      const newPoints = last.points.concat([point.x, point.y])
      const updated = prev.slice()
      updated[updated.length - 1] = { ...last, points: newPoints }
      return updated
    })
  }

  function handleMouseUp(){
    const wasDrawing = isDrawingNow
    setIsDrawingNow(false)
    const activeDraw = tool === 'draw' || tool === 'erase' || isDrawing
    if(activeDraw && wasDrawing){ setTimeout(()=> pushHistory(), 0) }
  }

  // Touch
  function handleTouchStart(e){ handleMouseDown(e) }
  function handleTouchMove(e){ handleMouseMove(e) }
  function handleTouchEnd(){ const wasDrawing = isDrawingNow; setIsDrawingNow(false); if(wasDrawing){ setTimeout(()=> pushHistory(), 0) } }

  // Actions
  function addText(){
    const id = `text-${Date.now()}`
    const t = { id, text: 'Edit me', x: 100, y: 100, fontSize: 28, fill: '#111827', fontFamily: 'Inter, Arial, Helvetica, sans-serif', fontStyle: 'normal', align: 'left', z: nextZ() }
    setTexts(prev => prev.concat([t]))
    setSelectedId(id)
    setTimeout(()=> pushHistory(), 0)
  }

  function updateSelectedText(patch){
    if(!selectedId) return
    setTexts(prev => prev.map(t => t.id===selectedId ? { ...t, ...patch } : t))
    setTimeout(()=> pushHistory(), 0)
  }

  function updateSelectedShape(patch){
    if(!selectedId) return
    setShapes(prev => prev.map(s => s.id===selectedId ? { ...s, ...patch } : s))
    setTimeout(()=> pushHistory(), 0)
  }

  function addImageFile(file){
    const id = `img-${Date.now()}`
    try{
      const fr = new FileReader()
      fr.onload = ()=>{
        const dataUrl = String(fr.result || '')
        const img = new window.Image()
        img.crossOrigin = 'anonymous'
        img.onload = ()=>{
          const natW = img.width || 1
          const natH = img.height || 1
          const width = Math.max(1, natW * 0.5)
          const height = Math.max(1, natH * 0.5)
          setImages(prev => prev.concat([{ id, image: img, x: 120, y: 120, width, height, rotation: 0, _dataUrl: dataUrl, natW, natH, z: nextZ() }]))
          setSelectedId(id)
          setTimeout(()=> pushHistory(), 0)
        }
        img.src = dataUrl
      }
      fr.readAsDataURL(file)
    }catch{}
  }

  function setBackgroundImageFile(file){
    const fr = new FileReader()
    fr.onload = ()=>{
      const dataUrl = String(fr.result || '')
      const img = new window.Image()
      img.crossOrigin = 'anonymous'
      img.onload = ()=>{ setBgImage(img); setBgImageUrl(dataUrl); setTimeout(()=> pushHistory(), 0) }
      img.src = dataUrl
    }
    fr.readAsDataURL(file)
  }

  function replaceSelectedImageFile(file){
    if(!selectedId || !selectedId.startsWith('img-')) return
    try{
      const fr = new FileReader()
      fr.onload = ()=>{
        const dataUrl = String(fr.result || '')
        const img = new window.Image()
        img.crossOrigin = 'anonymous'
        img.onload = ()=>{
          setImages(prev => prev.map(i => i.id===selectedId ? { ...i, image: img, _dataUrl: dataUrl, natW: img.width, natH: img.height } : i))
          setTimeout(()=> pushHistory(), 0)
        }
        img.src = dataUrl
      }
      fr.readAsDataURL(file)
    }catch{}
  }

  function removeSelected(){
    if(!selectedId) return
    if(selectedId.startsWith('line-')) setLines(prev => prev.filter(l => l.id !== selectedId))
    else if(selectedId.startsWith('text-')) setTexts(prev => prev.filter(t => t.id !== selectedId))
    else if(selectedId.startsWith('img-')) setImages(prev => prev.filter(i => i.id !== selectedId))
    else if(selectedId.startsWith('shape-')) setShapes(prev => prev.filter(s => s.id !== selectedId))
    setSelectedId(null)
    setTimeout(()=> pushHistory(), 0)
  }

  function exportPNG(){
    const uri = stageRef.current?.toDataURL({ pixelRatio: 2 })
    if(!uri) return
    const a = document.createElement('a')
    a.href = uri
    a.download = 'poster.png'
    a.click()
  }

  function exportJPG(){
    const uri = stageRef.current?.toDataURL({ pixelRatio: 2, mimeType: 'image/jpeg' })
    if(!uri) return
    const a = document.createElement('a')
    a.href = uri
    a.download = 'poster.jpg'
    a.click()
  }

  async function exportPDF(){
    setExportStatus('Preparing PDF…')
    try{
      const id = await saveDraft({ silent: true })
      if(!id){ setExportStatus('Save failed'); return }
      let blob = null
      try{
        blob = await posterApi.exportDraft(id, 'pdf')
      }catch(primaryErr){
        // Fallback: try GET in case POST is blocked
        try{
          const res = await fetch(`${posterApi.baseUrl()}/api/poster/drafts/${id}/export/?format=pdf`, { method: 'GET', credentials: 'include', headers: posterApi.authHeaders() })
          if(!res.ok) throw new Error(`HTTP ${res.status}`)
          blob = await res.blob()
        }catch(fallbackErr){
          console.error('PDF export failed', primaryErr, fallbackErr)
          setExportStatus('PDF export failed')
          return
        }
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'poster.pdf'
      a.click()
      setTimeout(()=> URL.revokeObjectURL(url), 1000)
      setExportStatus('Downloaded')
    }catch(err){
      console.error('PDF export failed', err)
      setExportStatus('PDF export failed')
    }
  }

  async function saveDraft({ silent=false } = {}){
    try{
      if(!silent){ setSaving(true); setSaveStatus('Saving') }
      const payload = { name: 'Untitled', state: getSnapshot() }
      let id = draftId
      if(!draftId){
        const created = await posterApi.createDraft(payload)
        id = created.id
        setDraftId(id)
      } else {
        await posterApi.updateDraft(draftId, payload)
      }
      if(!silent) setSaveStatus('Saved')
      return id
    }catch(err){
      console.error('Save draft failed', err)
      try {
        const backup = { at: Date.now(), state: getSnapshot() }
        localStorage.setItem('poster_draft_backup', JSON.stringify(backup))
        if(!silent) setSaveStatus(`Error (local backup saved${err?.status?`; HTTP ${err.status}`:''})`)
      } catch {
        if(!silent) setSaveStatus(`Error${err?.status?` (HTTP ${err.status})`:''}`)
      }
      return null
    }finally{ if(!silent) setSaving(false) }
  }

  async function loadLatestDraft(){
    try{
      const res = await posterApi.listDrafts()
      const list = Array.isArray(res) ? res : (res?.results || [])
      if(list.length){
        const d = list[0]
        setDraftId(d.id)
        if(d.state) applySnapshot(d.state)
      } else {
        // No server drafts; try local backup
        try {
          const raw = localStorage.getItem('poster_draft_backup')
          if(raw){
            const backup = JSON.parse(raw)
            if(backup?.state) applySnapshot(backup.state)
          }
        } catch {}
      }
    }catch(err){
      // On failure, attempt local backup restore
      try {
        const raw = localStorage.getItem('poster_draft_backup')
        if(raw){
          const backup = JSON.parse(raw)
          if(backup?.state) applySnapshot(backup.state)
        }
      } catch {}
    }
  }

  async function reloadCurrentDraft(){
    try{
      if(draftId){
        const d = await posterApi.getDraft(draftId)
        if(d?.state) applySnapshot(d.state)
      } else {
        await loadLatestDraft()
      }
      setSaveStatus('Loaded')
    }catch(err){
      setSaveStatus(`Load failed${err?.status?` (HTTP ${err.status})`:''}`)
    }
  }

  function loadLocalBackup(){
    try{
      const raw = localStorage.getItem('poster_draft_backup')
      if(raw){
        const backup = JSON.parse(raw)
        if(backup?.state){ applySnapshot(backup.state); setSaveStatus('Loaded (local backup)') }
      }
    }catch{}
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar/>
      <div className="p-6 pb-0">
        <div className="max-w-screen-2xl mx-auto">
          <div className="section p-4 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Poster Designer 🎨</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Create beautiful posters for your events</p>
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-sm text-slate-500 dark:text-slate-400">{saveStatus}</span>
                <button className="btn-primary" disabled={saving} onClick={saveDraft}>{saving ? 'Saving…' : 'Save Draft'}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 flex">
        <div className="w-72 border-r p-3 flex flex-col gap-3 overflow-auto max-h-screen bg-white/40 backdrop-blur-sm dark:bg-slate-900/30 dark:border-white/10">
          <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Tools</div>
          <div className="flex w-full items-center rounded-2xl bg-white/70 p-1 ring-1 ring-fuchsia-300/50 dark:bg-slate-900/40 dark:ring-fuchsia-900/40">
            {['select','draw','erase'].map((k, i) => (
              <button
                key={k}
                className={`flex-1 h-9 rounded-xl text-sm font-medium transition inline-flex items-center justify-center ${tool===k ? 'bg-fuchsia-600 text-white shadow' : 'text-slate-700 hover:bg-white/60 dark:text-slate-200 dark:hover:bg-slate-800/40'}`}
                onClick={()=> { setTool(k); setIsDrawing(k!=='select') }}
              >{k==='select'?'Select':k==='draw'?'Draw':'Eraser'}</button>
            ))}
          </div>

          <div className="text-sm mt-2 text-slate-700 dark:text-slate-200">Shapes</div>
          <div className="grid grid-cols-3 gap-2">
            <button className="btn-outline text-sm h-9 justify-center" onClick={()=>{ const id=`shape-${Date.now()}`; setShapes(p=>p.concat([{ id, type:'rect', x:120,y:120,width:200,height:140,rotation:0, fill:'#ffffff00', stroke:'#111827', strokeWidth:2, z: nextZ() }])); setSelectedId(id); setTimeout(()=> pushHistory(), 0) }}>Rect</button>
            <button className="btn-outline text-sm h-9 justify-center" onClick={()=>{ const id=`shape-${Date.now()}`; setShapes(p=>p.concat([{ id, type:'circle', x:200,y:200,radius:80,rotation:0, fill:'#ffffff00', stroke:'#111827', strokeWidth:2, z: nextZ() }])); setSelectedId(id); setTimeout(()=> pushHistory(), 0) }}>Circle</button>
            <button className="btn-outline text-sm h-9 justify-center" onClick={()=>{ const id=`shape-${Date.now()}`; setShapes(p=>p.concat([{ id, type:'triangle', x:250,y:250,width:160,height:140,rotation:0, fill:'#ffffff00', stroke:'#111827', strokeWidth:2, z: nextZ() }])); setSelectedId(id); setTimeout(()=> pushHistory(), 0) }}>Triangle</button>
          </div>

          <div className="text-sm mt-2 text-slate-700 dark:text-slate-200">Brush</div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <span className="w-16">Color</span>
            <input type="color" className="h-10 w-16 p-0 input" value={brushColor} onChange={(e)=> setBrushColor(e.target.value)} />
          </label>
          <input type="range" min="1" max="50" value={brushWidth} onChange={(e)=> setBrushWidth(Number(e.target.value)||1)} className="w-full accent-fuchsia-600" />
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <span>Opacity</span>
            <input type="range" min="0.1" max="1" step="0.1" value={brushOpacity} onChange={(e)=> setBrushOpacity(Number(e.target.value)||1)} className="w-full accent-fuchsia-600" />
          </label>

          <button className="btn-outline justify-center text-center" onClick={addText}>Add Text</button>
          <label className="btn-outline cursor-pointer justify-center text-center">Add Image
            <input type="file" className="hidden" accept="image/*" onChange={(e)=>{ const f=e.target.files?.[0]; if(f) addImageFile(f); e.target.value='' }} />
          </label>

          <div className="text-sm mt-2 text-slate-700 dark:text-slate-200">Background</div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <span className="w-16">Color</span>
            <input type="color" className="h-10 w-16 p-0 input" value={bgColor} onChange={(e)=> { setBgColor(e.target.value); setTimeout(()=> pushHistory(), 0) }} />
          </label>
          <label className="btn-outline cursor-pointer text-sm justify-center text-center">Set Background Image
            <input type="file" className="hidden" accept="image/*" onChange={(e)=>{ const f=e.target.files?.[0]; if(f) setBackgroundImageFile(f); e.target.value='' }} />
          </label>

          <div className="text-sm mt-2 text-slate-700 dark:text-slate-200">Preset</div>
          <select className="select" value={presetKey} onChange={(e)=>{
            const k = e.target.value
            setPresetKey(k)
            const p = PRESETS[k]
            setSTAGE_W(p.width); setSTAGE_H(p.height)
            setTimeout(()=> pushHistory(), 0)
          }}>
            {Object.entries(PRESETS).map(([k,v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          <div className="text-sm mt-2 text-slate-700 dark:text-slate-200">View</div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary px-3 py-1" onClick={()=> setZoom(z => Math.max(0.25, Number((z-0.1).toFixed(2))))}>-</button>
            <input type="range" min="0.25" max="2" step="0.05" className="flex-1" value={zoom} onChange={(e)=> setZoom(Number(e.target.value)||1)} />
            <button className="btn-secondary px-3 py-1" onClick={()=> setZoom(z => Math.min(2, Number((z+0.1).toFixed(2))))}>+</button>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary flex-1" onClick={()=> setZoom(1)}>100%</button>
            <button className="btn-secondary flex-1" onClick={()=> setZoom(0.75)}>75%</button>
          </div>

          <div className="mt-2 flex flex-col gap-2">
            {selectedText && (
              <div className="card p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Text</div>
                <label className="block text-sm mb-2">
                  <span className="text-slate-700 dark:text-slate-200">Content</span>
                  <textarea
                    className="input mt-1 h-28"
                    value={selectedText.text}
                    onChange={(e)=>{
                      const value = e.target.value.replace(/\r\n/g,'\n')
                      setTexts(prev => prev.map(t => t.id===selectedText.id ? { ...t, text: value } : t))
                      setTimeout(()=> pushHistory(), 0)
                    }}
                    placeholder="Type text here"
                  />
                </label>
                <label className="block text-sm mb-2">
                  <span className="text-slate-700 dark:text-slate-200">Font Family</span>
                  <select
                    className="select mt-1"
                    value={selectedText.fontFamily}
                    onChange={(e)=> updateSelectedText({ fontFamily: e.target.value })}
                  >
                    <option>Inter, Arial, Helvetica, sans-serif</option>
                    <option>Roboto, Arial, Helvetica, sans-serif</option>
                    <option>Open Sans, Arial, Helvetica, sans-serif</option>
                    <option>Poppins, Arial, Helvetica, sans-serif</option>
                    <option>Lato, Arial, Helvetica, sans-serif</option>
                    <option>Montserrat, Arial, Helvetica, sans-serif</option>
                    <option>Arial, Helvetica, sans-serif</option>
                    <option>Verdana, Geneva, sans-serif</option>
                    <option>Tahoma, Geneva, sans-serif</option>
                    <option>Georgia, serif</option>
                    <option>Times New Roman, Times, serif</option>
                    <option>Courier New, Courier, monospace</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <label className="text-sm">
                    <span className="text-slate-700 dark:text-slate-200">Size</span>
                    <input
                      type="number"
                      className="input mt-1"
                      value={Math.round(selectedText.fontSize || 0)}
                      onChange={(e)=> updateSelectedText({ fontSize: Math.max(8, Math.round(Number(e.target.value)||12)) })}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="text-slate-700 dark:text-slate-200">Color</span>
                    <input
                      type="color"
                      className="input mt-1 h-10 p-1"
                      value={selectedText.fill}
                      onChange={(e)=> updateSelectedText({ fill: e.target.value })}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Style</div>
                    <div className="inline-flex items-center overflow-hidden rounded-xl border border-fuchsia-200/60 dark:border-fuchsia-900/40 bg-white/60 dark:bg-slate-900/40 p-0.5 w-full h-10">
                      <button
                        className={`h-9 px-3 rounded-lg text-sm leading-none transition flex-1 flex items-center justify-center ${selectedText.fontStyle?.includes('bold') ? 'bg-fuchsia-600 text-white shadow' : 'text-slate-700 dark:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/40'}`}
                        onClick={()=>{
                          const fs = new Set((selectedText.fontStyle||'').split(' ').filter(Boolean))
                          fs.has('bold') ? fs.delete('bold') : fs.add('bold')
                          updateSelectedText({ fontStyle: Array.from(fs).join(' ') || 'normal' })
                        }}
                      >B</button>
                      <button
                        className={`h-9 px-3 rounded-lg text-sm leading-none transition flex-1 flex items-center justify-center ${selectedText.fontStyle?.includes('italic') ? 'bg-fuchsia-600 text-white shadow' : 'text-slate-700 dark:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/40'}`}
                        onClick={()=>{
                          const fs = new Set((selectedText.fontStyle||'').split(' ').filter(Boolean))
                          fs.has('italic') ? fs.delete('italic') : fs.add('italic')
                          updateSelectedText({ fontStyle: Array.from(fs).join(' ') || 'normal' })
                        }}
                      >I</button>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Align</div>
                    <div className="inline-flex items-center overflow-hidden rounded-xl border border-fuchsia-200/60 dark:border-fuchsia-900/40 bg-white/60 dark:bg-slate-900/40 p-0.5 w-full h-10">
                      {['left','center','right'].map(al => (
                        <button
                          key={al}
                          className={`h-9 px-3 rounded-lg text-sm leading-none transition flex-1 flex items-center justify-center ${selectedText.align===al ? 'bg-fuchsia-600 text-white shadow' : 'text-slate-700 dark:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/40'}`}
                          onClick={()=> updateSelectedText({ align: al })}
                        >{al[0].toUpperCase()}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedShape && (
              <div className="card p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Shape</div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-sm">
                    <span className="text-slate-700 dark:text-slate-200">Fill</span>
                    <input type="color" className="input mt-1 h-10 p-1" value={selectedShape.fill || '#00000000'} onChange={(e)=> updateSelectedShape({ fill: e.target.value })} />
                  </label>
                  <label className="text-sm">
                    <span className="text-slate-700 dark:text-slate-200">Stroke</span>
                    <input type="color" className="input mt-1 h-10 p-1" value={selectedShape.stroke || '#111827'} onChange={(e)=> updateSelectedShape({ stroke: e.target.value })} />
                  </label>
                </div>
                <label className="block text-sm mt-2">
                  <span className="text-slate-700 dark:text-slate-200">Stroke Width</span>
                  <input type="range" min="0" max="20" step="1" className="w-full accent-fuchsia-600 mt-1" value={Math.round(selectedShape.strokeWidth || 0)} onChange={(e)=> updateSelectedShape({ strokeWidth: Math.max(0, Number(e.target.value)||0) })} />
                </label>
              </div>
            )}

            {selectedId && selectedId.startsWith('img-') && (
              <div className="card p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Image</div>
                <label className="block text-sm">
                  <span className="text-slate-700 dark:text-slate-200">Replace Image (keep size)</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="mt-1 block w-full text-sm"
                    onChange={(e)=>{ const f=e.target.files?.[0]; if(f) replaceSelectedImageFile(f); e.target.value='' }}
                  />
                </label>
              </div>
            )}

            {selectedId && (
              <div className="card p-2">
                <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 mb-1">Layer</div>
                <div className="flex gap-2">
                  <button className="btn-secondary flex-1" onClick={()=>{
                    const maxZ = Math.max(
                      -Infinity,
                      ...lines.map(o=>o.z||0),
                      ...texts.map(o=>o.z||0),
                      ...images.map(o=>o.z||0),
                      ...shapes.map(o=>o.z||0)
                    )
                    if(selectedId.startsWith('line-')) setLines(prev => prev.map(o => o.id===selectedId? { ...o, z: maxZ + 1 } : o))
                    else if(selectedId.startsWith('text-')) setTexts(prev => prev.map(o => o.id===selectedId? { ...o, z: maxZ + 1 } : o))
                    else if(selectedId.startsWith('img-')) setImages(prev => prev.map(o => o.id===selectedId? { ...o, z: maxZ + 1 } : o))
                    else if(selectedId.startsWith('shape-')) setShapes(prev => prev.map(o => o.id===selectedId? { ...o, z: maxZ + 1 } : o))
                    setTimeout(()=> pushHistory(), 0)
                  }}>Bring Front</button>
                  <button className="btn-secondary flex-1" onClick={()=>{
                    const minZ = Math.min(
                      Infinity,
                      ...lines.map(o=>o.z??0),
                      ...texts.map(o=>o.z??0),
                      ...images.map(o=>o.z??0),
                      ...shapes.map(o=>o.z??0)
                    )
                    if(selectedId.startsWith('line-')) setLines(prev => prev.map(o => o.id===selectedId? { ...o, z: minZ - 1 } : o))
                    else if(selectedId.startsWith('text-')) setTexts(prev => prev.map(o => o.id===selectedId? { ...o, z: minZ - 1 } : o))
                    else if(selectedId.startsWith('img-')) setImages(prev => prev.map(o => o.id===selectedId? { ...o, z: minZ - 1 } : o))
                    else if(selectedId.startsWith('shape-')) setShapes(prev => prev.map(o => o.id===selectedId? { ...o, z: minZ - 1 } : o))
                    setTimeout(()=> pushHistory(), 0)
                  }}>Send Back</button>
                </div>
              </div>
            )}

            <div className="text-sm text-slate-700 dark:text-slate-200">Drafts</div>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={reloadCurrentDraft}>Load Last Saved</button>
            </div>

            <div className="text-sm mt-1 text-slate-700 dark:text-slate-200">Export</div>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={exportPNG}>PNG</button>
              <button className="btn-secondary flex-1" onClick={exportJPG}>JPG</button>
              <button className="btn-primary flex-1" onClick={exportPDF}>PDF</button>
            </div>
            {exportStatus && <div className="text-xs mt-1 text-slate-600 dark:text-slate-300">{exportStatus}</div>}
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={undo}>Undo</button>
              <button className="btn-secondary flex-1" onClick={redo}>Redo</button>
            </div>
            <button className="btn-outline disabled:opacity-50 text-left" disabled={!selectedId} onClick={removeSelected}>Delete Selected</button>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-slate-100/50 dark:bg-slate-900/40">
          <div className="relative">
            <Stage
              id="poster-stage"
              width={STAGE_W * zoom}
              height={STAGE_H * zoom}
              scaleX={zoom}
              scaleY={zoom}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              ref={stageRef}
            >
              <Layer listening={false}>
                <Rect x={0} y={0} width={STAGE_W} height={STAGE_H} fill={bgColor} />
                {bgImage && (
                  <KImage image={bgImage} x={0} y={0} width={STAGE_W} height={STAGE_H} />
                )}
              </Layer>

              <Layer>
                {[
                  ...lines.map(l => ({ kind:'line',  z: l.z??0, data: l })),
                  ...shapes.map(s => ({ kind:'shape', z: s.z??0, data: s })),
                  ...images.map(i => ({ kind:'image', z: i.z??0, data: i })),
                  ...texts.map(t => ({ kind:'text',  z: t.z??0, data: t })),
                ].sort((a,b)=> (a.z||0) - (b.z||0)).map(obj => {
                  if(obj.kind==='line'){
                    const l = obj.data
                    return (
                      <Line
                        key={l.id}
                        id={l.id}
                        x={l.x || 0}
                        y={l.y || 0}
                        points={l.points}
                        stroke={l.color}
                        opacity={l.opacity ?? 1}
                        strokeWidth={l.width}
                        hitStrokeWidth={Math.max(12, (l.width || 2) * 3)}
                        tension={0.4}
                        lineCap="round"
                        lineJoin="round"
                        globalCompositeOperation={l.mode === 'erase' ? 'destination-out' : 'source-over'}
                        draggable={tool==='select'}
                        onClick={()=> setSelectedId(l.id)}
                        onMouseDown={()=> setSelectedId(l.id)}
                        onTap={()=> setSelectedId(l.id)}
                        onDragEnd={e=> {
                          const nx = e.target.x(); const ny = e.target.y();
                          setLines(prev => prev.map(li => li.id===l.id ? { ...li, x: nx, y: ny } : li))
                          setTimeout(()=> pushHistory(), 0)
                        }}
                      />
                    )
                  }
                  if(obj.kind==='image'){
                    const img = obj.data
                    return (
                      <KImage
                        key={img.id}
                        id={img.id}
                        image={img.image}
                        x={img.x}
                        y={img.y}
                        width={img.width}
                        height={img.height}
                        rotation={img.rotation}
                        draggable
                        onClick={()=> setSelectedId(img.id)}
                        onDragEnd={e=> { setImages(prev => prev.map(i => i.id===img.id ? { ...i, x: e.target.x(), y: e.target.y() } : i)); setTimeout(()=> pushHistory(), 0) }}
                        onTransformEnd={e=>{
                          const node = e.target
                          const scaleX = node.scaleX() || 1
                          const scaleY = node.scaleY() || 1
                          node.scaleX(1); node.scaleY(1)
                          const newW = Math.max(5, (node.width() || img.width || 1) * scaleX)
                          const newH = Math.max(5, (node.height() || img.height || 1) * scaleY)
                          setImages(prev => prev.map(i => i.id===img.id ? { ...i, x: node.x(), y: node.y(), width: newW, height: newH, rotation: node.rotation() } : i))
                          setTimeout(()=> pushHistory(), 0)
                        }}
                      />
                    )
                  } else if(obj.kind==='text'){
                    const t = obj.data
                    return (
                      <KText
                        key={t.id}
                        id={t.id}
                        text={t.text}
                        x={t.x}
                        y={t.y}
                        fontSize={t.fontSize}
                        fill={t.fill}
                        fontFamily={t.fontFamily}
                        fontStyle={t.fontStyle}
                        align={['left','center','right'].includes(t.align) ? t.align : 'left'}
                        width={typeof t.width === 'number' ? t.width : undefined}
                        wrap="word"
                        lineHeight={1.2}
                        draggable
                        onClick={()=> setSelectedId(t.id)}
                        onDragEnd={e=> { setTexts(prev => prev.map(tt => tt.id===t.id ? { ...tt, x: e.target.x(), y: e.target.y() } : tt)); setTimeout(()=> pushHistory(), 0) }}
                        onTransformEnd={e=>{
                          const node=e.target
                          const scaleX=node.scaleX()||1
                          const scaleY=node.scaleY()||1
                          node.scaleX(1); node.scaleY(1)
                          const newW=Math.max(20,(node.width() || t.width || 300) * scaleX)
                          const newFont=Math.max(6,(t.fontSize||24) * scaleY)
                          setTexts(prev => prev.map(tt => tt.id===t.id ? { ...tt, x: node.x(), y: node.y(), width: newW, fontSize: Math.round(newFont) } : tt))
                          setTimeout(()=> pushHistory(), 0)
                        }}
                      />
                    )
                  } else {
                    const s = obj.data
                    return (
                      s.type==='rect' ? (
                        <Rect key={s.id} id={s.id} x={s.x} y={s.y} width={s.width} height={s.height} rotation={s.rotation}
                          fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth}
                          draggable onClick={()=> setSelectedId(s.id)}
                          onDragEnd={e=> { setShapes(prev => prev.map(sp => sp.id===s.id? { ...sp, x:e.target.x(), y:e.target.y() } : sp)); setTimeout(()=> pushHistory(), 0) }}
                          onTransformEnd={e=>{
                            const node=e.target; const scaleX=node.scaleX()||1; const scaleY=node.scaleY()||1; node.scaleX(1); node.scaleY(1)
                            const newW=Math.max(5,(node.width()||s.width)*scaleX); const newH=Math.max(5,(node.height()||s.height)*scaleY)
                            setShapes(prev => prev.map(sp => sp.id===s.id? { ...sp, x:node.x(), y:node.y(), width:newW, height:newH, rotation:node.rotation() } : sp))
                            setTimeout(()=> pushHistory(), 0)
                          }}
                        />
                      ) : s.type==='circle' ? (
                        <Circle key={s.id} id={s.id} x={s.x} y={s.y} radius={s.radius} rotation={s.rotation}
                          fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth}
                          draggable onClick={()=> setSelectedId(s.id)}
                          onDragEnd={e=> { setShapes(prev => prev.map(sp => sp.id===s.id? { ...sp, x:e.target.x(), y:e.target.y() } : sp)); setTimeout(()=> pushHistory(), 0) }}
                          onTransformEnd={e=>{
                            const node=e.target; const scale=node.scaleX()||1; node.scaleX(1); node.scaleY(1)
                            const newR=Math.max(5,(node.radius()||s.radius)*scale)
                            setShapes(prev => prev.map(sp => sp.id===s.id? { ...sp, x:node.x(), y:node.y(), radius:newR, rotation:node.rotation() } : sp))
                            setTimeout(()=> pushHistory(), 0)
                          }}
                        />
                      ) : (
                        <RegularPolygon key={s.id} id={s.id} x={s.x} y={s.y} sides={3} radius={Math.max(s.width||80, s.height||80)/2}
                          rotation={s.rotation} fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth}
                          draggable onClick={()=> setSelectedId(s.id)}
                          onDragEnd={e=> { setShapes(prev => prev.map(sp => sp.id===s.id? { ...sp, x:e.target.x(), y:e.target.y() } : sp)); setTimeout(()=> pushHistory(), 0) }}
                          onTransformEnd={e=>{
                            const node=e.target; const scale=node.scaleX()||1; node.scaleX(1); node.scaleY(1)
                            const newW=Math.max(10,(s.width||160)*scale); const newH=Math.max(10,(s.height||140)*scale)
                            setShapes(prev => prev.map(sp => sp.id===s.id? { ...sp, x:node.x(), y:node.y(), width:newW, height:newH, rotation:node.rotation() } : sp))
                            setTimeout(()=> pushHistory(), 0)
                          }}
                        />
                      )
                    )
                  }
                })}
                <Transformer
                  ref={trRef}
                  rotateEnabled={true}
                  enabledAnchors={[
                    'top-left', 'top-center', 'top-right',
                    'middle-left',              'middle-right',
                    'bottom-left', 'bottom-center', 'bottom-right',
                  ]}
                  anchorSize={8}
                  anchorStroke="#2563eb"
                  anchorFill="#ffffff"
                  borderStroke="#2563eb"
                />
              </Layer>
            </Stage>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Poster