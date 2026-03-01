import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Navbar from '../components/Navbar'
import { connectChat } from '../services/websocket'
import api from '../services/api'
import useAuthStore from '../stores/authStore'

export default function Chat(){
  const [rooms, setRooms] = useState([])
  const [activeRoom, setActiveRoom] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [pendingAssets, setPendingAssets] = useState([]) // [{id, name}]
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const me = useAuthStore(s => s.user)
  const [groupFilter, setGroupFilter] = useState('')
  const [events, setEvents] = useState([])
  const [roomForm, setRoomForm] = useState({ name:'', event:'' })
  const [roomError, setRoomError] = useState('')
  const [creatingRoom, setCreatingRoom] = useState(false)
  const [memberQuery, setMemberQuery] = useState('')
  const [memberResults, setMemberResults] = useState([])
  const [memberError, setMemberError] = useState('')
  const [addingMember, setAddingMember] = useState(false)
  const [typingUsers, setTypingUsers] = useState({}) // { userId: timestamp }
  const [uploadError, setUploadError] = useState('')
  const listRef = useRef(null)
  const wsRef = useRef(null)
  const draftTimerRef = useRef(null)
  const [assetCache, setAssetCache] = useState({}) // id -> { id, file, mime, size }
  const [reads, setReads] = useState({}) // messageId -> Set(userId)
  const [showInfo, setShowInfo] = useState(false)
  const [roomDetail, setRoomDetail] = useState(null)
  const [roomMembers, setRoomMembers] = useState([])
  const [tasks, setTasks] = useState([])

  const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:8000/api')

  // Helper: forcefully pin to the bottom with multiple passes (handles images/layout delays)
  function scrollToBottom(retries = 6){
    const el = listRef.current
    if(!el) return
    const doScroll = () => {
      el.scrollTop = el.scrollHeight
    }
    const run = (left) => {
      doScroll()
      if(left > 0){
        setTimeout(()=> run(left - 1), 70)
      }
    }
    requestAnimationFrame(()=> run(retries))
  }

  // Always land on the latest messages (WhatsApp-style)
  useLayoutEffect(()=>{
    if(!activeRoom) return
    scrollToBottom()
  }, [messages, activeRoom?.id])

  // Mark messages as read when visible
  useEffect(()=>{
    if(!listRef.current || !activeRoom || !me) return
    const el = listRef.current
    const observer = new IntersectionObserver((entries)=>{
      entries.forEach(async (entry)=>{
        if(entry.isIntersecting){
          const messageId = entry.target.getAttribute('data-mid')
          if(!messageId) return
          try{
            await api.post(`/chats/messages/${messageId}/mark_read/`, {}, { auth: true })
          }catch{ /* ignore */ }
        }
      })
    }, { root: el, threshold: 0.6 })
    // Observe current message nodes
    const nodes = el.querySelectorAll('[data-mid]')
    nodes.forEach(n => observer.observe(n))
    return ()=> observer.disconnect()
  }, [messages, activeRoom?.id, me?.id])

  // Load profile + rooms, restore last-viewed
  useEffect(()=>{
    let cancelled = false
    async function init(){
      try{
        const [roomsRes, eventsRes] = await Promise.all([
          api.get('/chats/rooms/', { auth: true }),
          api.get('/events/', { auth: true }),
        ])
        if(cancelled) return
        const fetchedRooms = roomsRes.data?.results ?? roomsRes.data ?? []
        const roomsArr = Array.isArray(fetchedRooms) ? fetchedRooms : []
        setRooms(roomsArr)
        const evData = eventsRes.data?.results ?? eventsRes.data ?? []
        setEvents(Array.isArray(evData) ? evData : [])
        if(!roomsArr.length) return
        const lastId = me?.profile?.last_viewed_group_id
        const found = roomsArr.find(r=>String(r.id) === String(lastId))
        setActiveRoom(found || roomsArr[0])
      }catch(e){
        console.error('init chat failed', e)
        setError('Failed to load chat groups. Please check your login and API base URL.')
      }
    }
    init()
    return ()=>{ cancelled = true }
  }, [])

  // When activeRoom changes: connect WS, fetch messages, persist last-viewed
  useEffect(()=>{
    if(!activeRoom) return

    // Persist last viewed
  api.put('/users/me/', { profile: { last_viewed_group_id: activeRoom.id } }, { auth: true }).catch(()=>{})

    // Close any existing ws
    if(wsRef.current) wsRef.current.close()
    wsRef.current = connectChat(activeRoom.id, {
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
      onMessage: (msg) => {
        // typing indicator
        if(msg?.type === 'typing' && msg?.user?.id){
          const uid = msg.user.id
          setTypingUsers(prev => ({ ...prev, [uid]: Date.now() }))
          return
        }
        if(msg?.type === 'read' && msg?.message_id){
          setReads(prev => {
            const setFor = new Set(prev[msg.message_id] || [])
            if(msg.user_id) setFor.add(msg.user_id)
            return { ...prev, [msg.message_id]: setFor }
          })
          return
        }
        if(msg?.type === 'deleted' && msg?.message_id){
          setMessages(prev => prev.filter(m => String(m.id) !== String(msg.message_id)))
          return
        }
        // Normalize message shape for display
        const normalized = normalizeMessage(msg)
        setMessages(prev => [...prev, normalized])
        // Prefetch attachment metadata only for valid asset ids
        const renderableAttachments = (Array.isArray(normalized.attachments) ? normalized.attachments : []).filter(a=> typeof a === 'number' || typeof a === 'string')
        if(renderableAttachments.length){
          renderableAttachments.forEach(aid=> ensureAsset(aid))
        }
        scrollToBottom()
      }
    })

    // Fetch initial messages via REST (oldest first)
    setLoading(true)
    api.get(`/chats/messages/?room=${activeRoom.id}`, { auth: true })
      .then(({data})=>{
        const arr = Array.isArray(data) ? data : data?.results || []
        // API returns newest first; reverse for UI
        const normalized = arr.slice().reverse().map(normalizeMessage)
        setMessages(normalized)
        // Prefetch attachments for existing messages (only numeric/string ids)
        normalized.forEach(m=> Array.isArray(m.attachments) && m.attachments.filter(a=> typeof a === 'number' || typeof a === 'string').forEach(aid=> ensureAsset(aid)))
        // ensure we land at bottom after initial load
        scrollToBottom()
      })
      .finally(()=> setLoading(false))

    // hydrate draft & scroll for this room if available
    try{
      const draftMap = me?.profile?.drafts?.chat || {}
      if(draftMap && draftMap[String(activeRoom.id)]){
        setInput(draftMap[String(activeRoom.id)])
      }else{
        setInput('')
      }
    }catch{ /* ignore */ }

    return ()=>{
      wsRef.current && wsRef.current.close()
    }
  }, [activeRoom?.id])

  // If the list resizes (e.g., images load), keep it pinned to latest
  useEffect(()=>{
    const el = listRef.current
    if(!el) return
    const ro = new ResizeObserver(()=> scrollToBottom())
    ro.observe(el)
    return ()=> ro.disconnect()
  }, [activeRoom?.id])

  // Load room detail, members, tasks (read-only) when info panel opens
  useEffect(()=>{
    if(!activeRoom || !showInfo) return
    let cancelled = false
    ;(async()=>{
      try{
        const [{data: rd}, {data: tk}] = await Promise.all([
          api.get(`/chats/rooms/${activeRoom.id}/`, { auth: true }),
          api.get(`/tasks/?room=${activeRoom.id}`, { auth: true })
        ])
        if(cancelled) return
        setRoomDetail(rd)
        setRoomMembers(rd?.members || [])
        setTasks(tk?.results || tk || [])
      }catch(e){ /* ignore */ }
    })()
    return ()=>{ cancelled = true }
  }, [activeRoom?.id, showInfo])

  function normalizeMessage(m){
    // Expected fields: id, room, sender, content, attachments (array of ids), created_at
    // WebSocket payload may not match exactly; keep generic fallback
    return {
      id: m.id || m.message_id || `${Date.now()}-${Math.random()}`,
      content: m.content || m.text || '',
      sender: m.sender || (m.sender_id ? { id: m.sender_id } : null),
      attachments: m.attachments || [],
      created_at: m.created_at || new Date().toISOString()
    }
  }

  function ensureAsset(id){
    if(!id) return
    setAssetCache(prev=>{
      if(prev[id]) return prev
      // lazy fetch out of band
      ensureAssetFetch(id, setAssetCache)
      return prev
    })
  }

  async function createRoom(e){
    e?.preventDefault()
    setRoomError('')
    if(!roomForm.name.trim()) { setRoomError('Enter a group name'); return }
    if(!roomForm.event) { setRoomError('Select an event'); return }
    try{
      setCreatingRoom(true)
  const { data } = await api.post('/chats/rooms/', { name: roomForm.name.trim(), event: roomForm.event }, { auth: true })
  setRooms(prev => [data, ...prev])
  setActiveRoom(data)
      setRoomForm({ name:'', event:'' })
    }catch(e){
      setRoomError('Failed to create group')
    }finally{
      setCreatingRoom(false)
    }
  }

  async function searchMembers(e){
    e?.preventDefault()
    setMemberError('')
    setMemberResults([])
    const q = memberQuery.trim()
    if(!q) return
    try{
      const { data } = await api.get(`/users/search/?q=${encodeURIComponent(q)}`, { auth: true })
      setMemberResults(data?.results ?? [])
    }catch(err){
      setMemberError('Search failed')
    }
  }

  async function addMember(userId){
    if(!activeRoom) return
    setMemberError('')
    try{
      setAddingMember(true)
      await api.post(`/chats/rooms/${activeRoom.id}/add_member/`, { user_id: userId }, { auth: true })
      // Optional: indicate success next to user
      setMemberResults(prev => prev.map(u => u.id === userId ? { ...u, _added: true } : u))
    }catch(err){
      setMemberError('Failed to add member (are you the event owner?)')
    }finally{
      setAddingMember(false)
    }
  }

  async function handleSend(){
    if(!activeRoom) return
    const text = input.trim()
    const attachments = pendingAssets.map(a=>a.id)
    if(!text && attachments.length === 0) return

    // Try WS first
    try{
      if(wsRef.current && wsRef.current.isOpen && wsRef.current.isOpen()){
        // Rely on server echo to avoid duplicates
        wsRef.current.send({ content: text, attachments })
      }else{
        await api.post('/chats/messages/', { room: activeRoom.id, content: text, attachments }, { auth: true })
        // After REST, refetch messages list quickly
        const { data } = await api.get(`/chats/messages/?room=${activeRoom.id}`, { auth: true })
        const arr = Array.isArray(data) ? data : data?.results || []
        const normalized = arr.slice().reverse().map(normalizeMessage)
        setMessages(normalized)
        scrollToBottom()
      }
    }catch(e){
      // Final fallback: try REST once if WS path failed
      try{ await api.post('/chats/messages/', { room: activeRoom.id, content: text, attachments }, { auth: true }) }catch(_){ /* show toast? */ }
    }
    setInput('')
    setPendingAssets([])
  }

  async function handleDeleteMessage(messageId){
    // Optimistic removal
    setMessages(prev => prev.filter(m => String(m.id) !== String(messageId)))
    try{
      if(wsRef.current && wsRef.current.isOpen && wsRef.current.isOpen()){
        wsRef.current.send({ type: 'delete', message_id: messageId })
      }
      await api.delete(`/chats/messages/${messageId}/`, { auth: true })
    }catch(err){
      // On failure, refresh messages to resync
      try{
        const { data } = await api.get(`/chats/messages/?room=${activeRoom.id}`, { auth: true })
        const arr = Array.isArray(data) ? data : data?.results || []
        const normalized = arr.slice().reverse().map(normalizeMessage)
        setMessages(normalized)
      }catch{}
    }
  }

  function handleInputChange(e){
    setInput(e.target.value)
    // fire typing event (debounced by server broadcast + client timeout display)
    try{
      if(wsRef.current && wsRef.current.isOpen && wsRef.current.isOpen()){
        wsRef.current.send({ type: 'typing' })
      }
    }catch{ /* ignore */ }

    // persist draft to /users/me (debounced)
    if(!activeRoom) return
    clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(async ()=>{
      try{
        const currentUser = useAuthStore.getState().user || {}
        const profile = currentUser.profile || {}
        const drafts = { ...(profile.drafts||{}), chat: { ...(profile.drafts?.chat||{}), [String(activeRoom.id)]: e.target.value } }
        await api.put('/users/me/', { profile: { last_viewed_group_id: activeRoom.id, drafts } }, { auth: true })
      }catch{ /* ignore */ }
    }, 400)
  }

  // Removed scroll position persistence so users always land on the latest message

  function handleKeyDown(e){
    if(e.key === 'Enter' && !e.shiftKey){
      e.preventDefault()
      handleSend()
    }
  }

  async function handleFilePick(e){
    const file = e.target.files?.[0]
    if(!file || !activeRoom) return
    const form = new FormData()
    form.append('room', activeRoom.id)
    form.append('file', file)
    try{
      // Do not force Content-Type; let axios set boundary
      const { data } = await api.post('/files/', form, { auth: true })
      // cache the uploaded asset for previews
      setAssetCache(prev=> ({ ...prev, [data.id]: data }))
      setPendingAssets(prev=>[...prev, { id: data.id, name: data.filename || file.name, file: data.file, mime: data.mime }])
    }catch(err){
      console.error('upload failed', err)
      const detail = err?.response?.data?.detail || err?.response?.data?.file?.[0] || err?.message || 'File upload failed. Ensure the server is running and you are a member of this room.'
      setError(detail)
      setUploadError(detail)
    }finally{
      e.target.value = ''
    }
  }

  async function handleDownload(assetId){
    try{
      const res = await api.get(`/files/${assetId}/download/`, { auth: true, responseType: 'blob' })
      // Try to extract filename from Content-Disposition
      let fileName = `file-${assetId}`
      const dispo = res.headers?.['content-disposition'] || res.headers?.['Content-Disposition']
      if(dispo){
        const match = /filename="?([^";]+)"?/i.exec(dispo)
        if(match && match[1]) fileName = match[1]
      }
      const contentType = res.headers?.['content-type'] || res.headers?.['Content-Type'] || 'application/octet-stream'
      const blob = new Blob([res.data], { type: contentType })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    }catch(e){
      console.error('download failed', e)
    }
  }

  function ensureAsset(id){
    if(!id) return
    setAssetCache(prev=>{
      if(prev[id]) return prev
      // lazy fetch out of band
      ensureAssetFetch(id, setAssetCache)
      return prev
    })
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Navbar/>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar: Rooms */}
        <div className="w-80 border-r min-h-0 overflow-auto p-4 bg-white/80 dark:bg-slate-900/60 backdrop-blur-md h-full thin-scrollbar">
          <div className="mb-1">
            <div className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">Chats</div>
            <h3 className="font-semibold text-lg">Groups</h3>
          </div>
          {/* Search groups */}
          <div className="mb-3">
            <input className="input" placeholder="Search groups" value={groupFilter} onChange={e=>setGroupFilter(e.target.value)} />
          </div>
          {/* Create Group */}
          <details className="mb-4 rounded-2xl border border-white/50 bg-white/70 p-3 shadow-sm dark:bg-slate-900/60 dark:border-white/10" open>
            <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-100 mb-2">New group</summary>
            <form onSubmit={createRoom} className="space-y-2">
              <input
                className="input"
                placeholder="Group name"
                value={roomForm.name}
                onChange={e=>setRoomForm(f=>({...f, name:e.target.value}))}
              />
              <select
                className="input"
                value={roomForm.event}
                onChange={e=>setRoomForm(f=>({...f, event:e.target.value}))}
              >
                <option value="">Select event</option>
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
              <button disabled={creatingRoom} className="btn-primary w-full disabled:opacity-50">
                {creatingRoom ? 'Creating…' : 'Create Group'}
              </button>
              {roomError && <div className="text-xs text-red-600">{roomError}</div>}
            </form>
          </details>
          <div className="space-y-2">
            {rooms
              .filter(r => !groupFilter || (r.name||'').toLowerCase().includes(groupFilter.toLowerCase()))
              .map(r=> (
              <button key={r.id}
                onClick={()=> setActiveRoom(r)}
                className={`w-full text-left px-3 py-2 rounded-2xl flex items-center gap-3 transition shadow-sm border border-transparent
                 ${activeRoom?.id===r.id? 'bg-white shadow-md border-fuchsia-200/60 dark:bg-slate-800/70 dark:border-fuchsia-800/40' : 'bg-white/60 hover:bg-white dark:bg-slate-900/40 dark:hover:bg-slate-800/60 dark:border-white/5'}`}>
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-fuchsia-500 to-rose-500 text-white grid place-items-center text-sm font-semibold shadow">
                  {(r.name||'?').slice(0,1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{r.name}</div>
                  <div className="text-xs opacity-70 truncate">Event #{r.event}</div>
                </div>
                <span className={`h-2 w-2 rounded-full ${activeRoom?.id===r.id ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-slate-600'}`}></span>
              </button>
            ))}
            {!rooms.length && (
              <div className="text-sm opacity-70">No groups yet</div>
            )}
            {error && (
              <div className="text-sm text-red-600">{error}</div>
            )}
          </div>

          {/* Add People (owner-only on backend; UI available but actions will be 403 for non-owners) */}
          {activeRoom && (
            <div className="mt-4 space-y-2">
              <h4 className="font-semibold text-sm text-slate-700 dark:text-slate-100">Add people</h4>
              <div className="relative">
                <input className="input" placeholder="Search users to add" value={memberQuery} onChange={async (e)=>{
                  const q = e.target.value; setMemberQuery(q)
                  if(q.trim().length<2){ setMemberResults([]); return }
                  try{ const { data } = await api.get(`/users/search/?q=${encodeURIComponent(q)}`, { auth: true }); setMemberResults(data?.results||[]) }catch{}
                }} />
                {!!memberResults.length && (
                  <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow max-h-44 overflow-auto dark:bg-slate-900 dark:border-white/10">
                    {memberResults.map(u => (
                        <button key={u.id} className="w-full text-left px-3 py-2 hover:bg-neutral-100 text-sm disabled:opacity-50 dark:hover:bg-slate-800" disabled={roomMembers.some(m=>m.id===u.id) || u._added} onClick={()=>addMember(u.id)}>
                        {(u.username || u.email)} {roomMembers.some(m=>m.id===u.id) && '(member)'} {u._added && '(added)'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {memberError && <div className="text-xs text-red-600">{memberError}</div>}
              {!memberResults.length && <div className="text-xs opacity-70">Search users to add</div>}
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-h-0">
          {uploadError && (
            <div className="mx-4 mt-3 mb-1 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-sm flex items-center justify-between dark:border-amber-600/50 dark:bg-amber-900/40 dark:text-amber-100">
              <span>{uploadError}</span>
              <button className="text-xs underline" onClick={()=> setUploadError('')}>Dismiss</button>
            </div>
          )}
          <div className="p-4 border-b flex items-center justify-between bg-white/80 backdrop-blur-md dark:bg-slate-900/60">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-rose-200 to-pink-100 text-rose-800 grid place-items-center font-semibold shadow">
                {(activeRoom?.name || 'C').slice(0,1).toUpperCase()}
              </div>
              <div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-50">{activeRoom ? activeRoom.name : 'Chat'}</div>
                {activeRoom && (
                  <div className="text-xs flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <span className={`inline-block h-2 w-2 rounded-full ${connected? 'bg-emerald-500' : 'bg-neutral-400'}`}></span>
                    <span>{connected? 'Online' : 'Offline'}</span>
                    <span className="h-1 w-1 rounded-full bg-slate-300"></span>
                    <span>{events.find(ev => String(ev.id) === String(activeRoom?.event))?.name || 'Event'}</span>
                    {Object.values(typingUsers).some(ts => Date.now() - ts < 3000) && (
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">typing…</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeRoom && (
                <button title="Group info" className="btn-outline px-3 py-1 text-xs" onClick={()=> setShowInfo(s=>!s)}>Info</button>
              )}
              <button title="Call" className="btn-outline px-3 py-1 text-xs">Call</button>
              <button title="Video" className="btn-outline px-3 py-1 text-xs">Video</button>
              <button title="Notifications" className="btn-outline px-3 py-1 text-xs">Mute</button>
              {me && activeRoom && (Number(activeRoom.created_by) === Number(me.id)) && (
                <button title="Delete group" className="text-red-600 btn-outline px-3 py-1 text-xs" onClick={async()=>{
                  if(!confirm('Delete this group? This cannot be undone.')) return
                  try{
                    await api.delete(`/chats/rooms/${activeRoom.id}/`, { auth: true })
                    setRooms(prev => prev.filter(r => r.id !== activeRoom.id))
                    setActiveRoom(null)
                  }catch(e){ alert('Failed to delete group') }
                }}>Delete</button>
              )}
            </div>
          </div>
          <div ref={listRef} className="flex-1 overflow-auto p-4 space-y-3 chat-wallpaper thin-scrollbar">
            {loading && <div className="text-sm opacity-60">Loading...</div>}
            {messages.map((m, idx)=> {
              const senderId = typeof m.sender === 'object' ? m.sender?.id : m.sender
              const isSelf = me && (senderId === me.id)
              const eventOwnerId = events.find(ev => String(ev.id) === String(activeRoom?.event))?.owner_id
              const within15 = (()=>{
                const dt = new Date(m.created_at)
                return (Date.now() - dt.getTime()) <= (15*60*1000)
              })()
              const canDelete = (!!eventOwnerId && Number(eventOwnerId) === Number(me?.id)) || (isSelf && within15)
              const readSet = reads[m.id] || new Set()
              const attachmentIds = Array.isArray(m.attachments) ? m.attachments.filter(a=> typeof a === 'number' || typeof a === 'string') : []
              return (
                <div key={m.id || idx} data-mid={m.id} className={`flex ${isSelf ? 'justify-end' : 'justify-start'} px-1`}>
                  {!isSelf && (
                    <div className="mr-2 h-9 w-9 rounded-full bg-white/80 dark:bg-slate-800/80 border border-white/60 dark:border-white/10 text-neutral-700 dark:text-slate-100 grid place-items-center text-xs shadow">
                      {(m.sender?.username || m.sender?.email || 'U').slice(0,1).toUpperCase()}
                    </div>
                  )}
                  <div className={`relative max-w-[75%] rounded-2xl px-3 py-2 shadow-lg transition ${isSelf ? 'bg-gradient-to-br from-rose-200 to-pink-100 text-rose-900 rounded-br-sm' : 'bg-white/90 border border-white/60 dark:bg-slate-900/70 dark:border-white/10'} `}>
                    {canDelete && (
                      <button
                        onClick={()=>handleDeleteMessage(m.id)}
                        className={`absolute -right-2 -top-2 text-[10px] px-2 py-0.5 rounded-full shadow ${isSelf ? 'bg-white/30 text-white' : 'bg-neutral-200 text-neutral-700'}`}
                        title="Delete message"
                      >
                        ✕
                      </button>
                    )}
                    {m.content && <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>}
                    {!!attachmentIds.length && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {attachmentIds.map((aid,i)=>{
                          const meta = assetCache[aid]
                          const fileUrl = meta?.file || ''
                          const absUrl = fileUrl?.startsWith('http') ? fileUrl : `${API_BASE.replace('/api','')}${fileUrl || ''}`
                          const isImg = (meta?.mime || '').startsWith('image/')
                          const isPdf = (meta?.mime || '').toLowerCase()==='application/pdf' || (meta?.filename||'').toLowerCase().endsWith('.pdf')
                          return (
                            <div key={i} className={`border rounded overflow-hidden ${isSelf ? 'border-rose-200/80 bg-white/70' : 'border-slate-200 dark:border-white/10 bg-white/60 dark:bg-slate-900/70'}`}>
                              {isImg && absUrl ? (
                                <img src={absUrl} alt={`attachment ${aid}`} className="w-full h-24 object-cover cursor-pointer" onClick={()=>handleDownload(aid)} />
                              ) : (
                                <div className="p-2 text-xs">
                                  <div className={`truncate ${isSelf ? 'text-rose-900' : 'text-neutral-800 dark:text-slate-100'}`}>{meta?.filename || `Attachment #${aid}`}</div>
                                  <div className="flex gap-3 mt-1">
                                    {isPdf && absUrl && (
                                      <a className={`${isSelf ? 'text-rose-900 underline' : 'text-blue-700 underline dark:text-blue-300'}`} href={absUrl} target="_blank" rel="noreferrer">Open</a>
                                    )}
                                    <button className={`${isSelf ? 'text-rose-900 underline' : 'text-blue-700 underline dark:text-blue-300'}`} onClick={()=>handleDownload(aid)}>Download</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <div className={`text-[11px] mt-1 flex items-center gap-2 ${isSelf ? 'opacity-90 justify-end' : 'opacity-70'}`}>
                      <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {isSelf && (
                        <span title={readSet.size ? 'Read' : 'Sent'} className={readSet.size ? 'text-rose-800 font-semibold' : 'text-rose-700'}>
                          {readSet.size ? '✓✓' : '✓'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {/* Composer */}
          <div className="p-3 border-t sticky bottom-0 bg-white/90 dark:bg-slate-900/70 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <label className="h-11 w-11 grid place-items-center rounded-full border border-white/60 bg-white shadow cursor-pointer hover:scale-105 transition dark:bg-slate-800/70 dark:border-white/10">
                📎
                <input type="file" className="hidden" onChange={handleFilePick}/>
              </label>
              <input
                className="input flex-1 h-11 rounded-full px-4"
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={activeRoom? 'Type a message' : 'Select a group to start chatting'}
                disabled={!activeRoom}
              />
              <button className="h-11 px-5 rounded-full bg-gradient-to-r from-rose-200 to-pink-200 text-rose-900 shadow-md hover:from-rose-300 hover:to-pink-300 disabled:opacity-60" onClick={handleSend} disabled={!activeRoom}>Send</button>
            </div>
            {!!pendingAssets.length && (
              <div className="mt-2 flex gap-2 flex-wrap">
                {pendingAssets.map((a,i)=>{
                  const isImg = (a.mime||'').startsWith('image/')
                  const absUrl = (a.file||'').startsWith('http') ? a.file : `${API_BASE.replace('/api','')}${a.file||''}`
                  return isImg && absUrl ? (
                    <img key={i} src={absUrl} alt={a.name||`Attachment ${a.id}`} className="h-14 w-14 object-cover rounded border dark:border-white/10" />
                  ) : (
                    <span key={i} className="text-xs px-2 py-1 rounded bg-neutral-200 dark:bg-slate-800/70">{a.name || `Attachment ${a.id}`}</span>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        {/* Right panel: Group info (WhatsApp-like) */}
        {showInfo && (
          <div className="w-80 border-l p-3 bg-neutral-50 dark:bg-slate-900/40 flex flex-col gap-3">
            <div className="font-semibold">Group info</div>
            <div className="text-sm">
              <div><span className="opacity-70">Group:</span> <span className="font-medium">{activeRoom?.name || '-'}</span></div>
              <div><span className="opacity-70">Event:</span> <span className="font-medium">{(()=>{
                const ev = events.find(ev => String(ev.id)===String(activeRoom?.event))
                return ev?.name || `#${activeRoom?.event || '-'}`
              })()}</span></div>
            </div>
            <div>
              <div className="text-sm font-medium mb-1">Members</div>
              <div className="space-y-1 max-h-48 overflow-auto pr-1">
                {roomMembers.map(m => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{m.username || m.email}</div>
                      <div className="text-xs opacity-70 truncate">{m.email}</div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-neutral-200">{m.role || 'member'}</span>
                  </div>
                ))}
                {!roomMembers.length && <div className="text-xs opacity-60">No members</div>}
              </div>
            </div>
            <div className="border-t pt-2">
              <div className="text-sm font-medium mb-2">Tasks (read-only)</div>
              <div className="mt-2 space-y-2 max-h-64 overflow-auto pr-1">
                {tasks.map(t => (
                  <div key={t.id} className="card p-2 bg-white/80 dark:bg-slate-900/40">
                    <div className="font-medium text-sm">{t.title}</div>
                    <div className="text-xs opacity-70">{t.description}</div>
                    <div className="text-xs opacity-70">Due: {t.due_date || '-'}</div>
                    <div className="text-xs opacity-70">Status: {t.status}</div>
                  </div>
                ))}
                {!tasks.length && <div className="text-xs opacity-60">No tasks</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Fetch and cache file asset metadata
async function ensureAssetFetch(id, setAssetCache){
  try{
    const { default: api } = await import('../services/api')
    const { data } = await api.get(`/files/${id}/`, { auth: true })
    setAssetCache(prev => (prev[id] ? prev : { ...prev, [id]: data }))
  }catch{ /* ignore */ }
}
