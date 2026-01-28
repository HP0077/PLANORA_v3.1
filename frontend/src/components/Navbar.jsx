import { Link, useNavigate } from 'react-router-dom'
import { Sparkles, Sun, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function Navbar({ compact = false }){
  const nav = useNavigate()
  const [isAuthed, setIsAuthed] = useState(()=>{
    try{
      return !!(sessionStorage.getItem('access') || localStorage.getItem('access'))
    }catch{return false}
  })
  const [isManager, setIsManager] = useState(true)
  const [isDarkMode, setIsDarkMode] = useState(()=>{
    try{ const saved = localStorage.getItem('planora:isDarkMode'); return saved? JSON.parse(saved) : false }catch{return false}
  })

  useEffect(()=>{
    try{ localStorage.setItem('planora:isDarkMode', JSON.stringify(isDarkMode)) }catch{}
    const root = document.documentElement
    if(isDarkMode) root.classList.add('dark'); else root.classList.remove('dark')
  }, [isDarkMode])

  function logout(){
    sessionStorage.clear()
    try{ localStorage.removeItem('access'); localStorage.removeItem('refresh') }catch{}
    setIsAuthed(false)
    nav('/login')
  }

  useEffect(()=>{
    try{
      const me = JSON.parse(sessionStorage.getItem('me') || 'null')
      setIsManager((me?.profile?.role || '').toLowerCase() === 'manager')
    }catch{ setIsManager(true) }
  }, [])
  return (
    <div className="sticky top-0 z-40 px-6 py-4 pointer-events-none">
      <div className={`max-w-7xl mx-auto backdrop-blur-xl rounded-2xl border shadow-2xl px-6 py-3 pointer-events-auto ${isDarkMode ? 'bg-white/5 border-white/10 ring-1 ring-white/10' : 'bg-white/80 border-rose-100/60 ring-1 ring-rose-200/60'}`}>
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 via-pink-500 to-blue-500 rounded-xl grid place-items-center shadow-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className={`text-2xl font-black bg-gradient-to-r bg-clip-text text-transparent ${isDarkMode ? 'from-white via-purple-200 to-pink-200' : 'from-slate-800 via-purple-600 to-pink-600'}`}>Planora</span>
          </Link>
          <div className="flex gap-4 items-center">
            {!compact && (
              <>
                <Link to="/dashboard" className="hover:opacity-100 opacity-80 transition">Dashboard</Link>
                <Link to="/tasks" className="hover:opacity-100 opacity-80 transition">Tasks</Link>
                <Link to="/budget" className="hover:opacity-100 opacity-80 transition">Budget</Link>
                <Link to="/chat" className="hover:opacity-100 opacity-80 transition">Chat</Link>
                <Link to="/poster" className="hover:opacity-100 opacity-80 transition">Poster</Link>
                <Link to="/certificates" className="hover:opacity-100 opacity-80 transition">Certificates</Link>
                <Link to="/automation-rules" className="hover:opacity-100 opacity-80 transition">Automation</Link>
                <Link to="/ai-assistant" className="hover:opacity-100 opacity-80 transition">AI Assistant 🤖</Link>
              </>
            )}
            <button onClick={()=>setIsDarkMode(d=>!d)} className={`p-2 rounded-xl transition ${isDarkMode ? 'bg-white/10 hover:bg-white/20 text-yellow-400' : 'bg-rose-100/70 hover:bg-rose-200/80 text-slate-700'}`} aria-label="Toggle theme">{isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}</button>
            {!compact && isAuthed && (
              <button className="btn-secondary" onClick={logout}>Logout</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
