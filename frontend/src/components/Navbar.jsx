import { Link, useNavigate } from 'react-router-dom'
import { Sparkles, Sun, Moon, Bell } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTheme } from '../context/ThemeContext'
import useAuthStore from '../stores/authStore'
import api from '../services/api'

export default function Navbar({ compact = false }){
  const nav = useNavigate()
  const { isDarkMode, toggleTheme } = useTheme()
  const user = useAuthStore(s => s.user)
  const storeLogout = useAuthStore(s => s.logout)
  const isAuthed = useAuthStore(s => s.isLoggedIn())
  const [isManager, setIsManager] = useState(true)
  const [unread, setUnread] = useState(0)

  function logout(){
    storeLogout()
    nav('/login')
  }

  useEffect(()=>{
    if (user?.profile?.role) {
      setIsManager(user.profile.role.toLowerCase() === 'manager')
    }
  }, [user])

  // Poll unread notification count
  useEffect(()=>{
    if(!isAuthed) return
    let cancelled = false
    async function fetchUnread(){
      try{
        const { data } = await api.get('/notifications/unread_count/', { auth: true })
        if(!cancelled) setUnread(data?.unread_count || 0)
      }catch{}
    }
    fetchUnread()
    const id = setInterval(fetchUnread, 15000)
    return ()=>{ cancelled = true; clearInterval(id) }
  }, [isAuthed])
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
                <Link to="/ai-tools" className="hover:opacity-100 opacity-80 transition">AI Tools 🧠</Link>
                <Link to="/analytics" className="hover:opacity-100 opacity-80 transition">Analytics</Link>
                <Link to="/notifications" className="relative hover:opacity-100 opacity-80 transition">
                  <Bell className="w-5 h-5 inline" />
                  {unread > 0 && <span className="absolute -top-1.5 -right-2.5 bg-rose-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
                </Link>
              </>
            )}
            <button onClick={toggleTheme} className={`p-2 rounded-xl transition ${isDarkMode ? 'bg-white/10 hover:bg-white/20 text-yellow-400' : 'bg-rose-100/70 hover:bg-rose-200/80 text-slate-700'}`} aria-label="Toggle theme">{isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}</button>
            {!compact && isAuthed && (
              <button className="btn-secondary" onClick={logout}>Logout</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
