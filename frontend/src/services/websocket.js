const WS_BASE = import.meta.env.VITE_WS_BASE || 'ws://localhost:8000'

// Simple Channels WebSocket helper
// Usage:
//   const ws = connectChat(roomId, {
//     onMessage: (msg) => console.log(msg),
//     onOpen: () => console.log('connected'),
//     onClose: () => console.log('closed')
//   })
//   ws.send({ content: 'hello' })
//   ws.close()
export function connectChat(roomId, { onMessage, onOpen, onClose } = {}){
  const token = sessionStorage.getItem('access')
  const baseUrl = `${WS_BASE}/ws/chats/${roomId}/` + (token ? `?token=${encodeURIComponent(token)}` : '')

  let ws = null
  let closedByUser = false
  let attempts = 0
  let connectTimer = null

  function scheduleReconnect(){
    if(closedByUser) return
    const delay = Math.min(30000, 500 * Math.pow(2, attempts)) // exp backoff up to 30s
    clearTimeout(connectTimer)
    connectTimer = setTimeout(()=>{
      attempts += 1
      open()
    }, delay)
  }

  function open(){
    ws = new WebSocket(baseUrl)
    ws.onopen = () => {
      attempts = 0
      onOpen && onOpen()
    }
    ws.onmessage = (event) => {
      try{
        const data = JSON.parse(event.data)
        onMessage && onMessage(data)
      }catch{ /* ignore */ }
    }
    ws.onclose = () => {
      onClose && onClose()
      scheduleReconnect()
    }
    ws.onerror = () => {
      try{ ws.close() }catch{ /* ignore */ }
    }
  }

  open()

  return {
    send: (payload) => {
      if(ws && ws.readyState === WebSocket.OPEN){
        ws.send(JSON.stringify(payload))
      }
    },
    close: () => { closedByUser = true; clearTimeout(connectTimer); ws && ws.close() },
    raw: () => ws,
    isOpen: () => ws && ws.readyState === WebSocket.OPEN
  }
}

export default { connectChat }
