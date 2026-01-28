import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Sun, Moon, LogIn } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const SiteLayout = ({ children }) => {
  const navigate = useNavigate();
  const { isDarkMode, toggleTheme } = useTheme();

  return (
    <div
      className={`min-h-screen overflow-hidden relative transition-all duration-500 ${
        isDarkMode
          ? 'bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 text-white'
          : 'bg-gradient-to-br from-rose-50 via-purple-50 to-pink-50 text-slate-900'
      }`}
    >
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className={`absolute w-96 h-96 rounded-full blur-3xl top-20 left-20 animate-pulse-slow ${
            isDarkMode ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20' : 'bg-gradient-to-r from-purple-300/40 to-pink-300/40'
          }`}
        />
        <div
          className={`absolute w-80 h-80 rounded-full blur-3xl top-60 right-20 animate-pulse-slow ${
            isDarkMode ? 'bg-gradient-to-r from-blue-500/15 to-cyan-500/15' : 'bg-gradient-to-r from-rose-300/35 to-pink-300/35'
          }`}
          style={{ animationDelay: '2s' }}
        />
        <div
          className={`absolute w-72 h-72 rounded-full blur-3xl bottom-32 left-1/2 animate-pulse-slow ${
            isDarkMode ? 'bg-gradient-to-r from-emerald-500/15 to-teal-500/15' : 'bg-gradient-to-r from-purple-300/30 to-rose-300/30'
          }`}
          style={{ animationDelay: '4s' }}
        />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 px-6 py-4">
        <div
          className={`backdrop-blur-xl rounded-2xl border shadow-2xl ${
            isDarkMode
              ? 'bg-white/5 border-white/10 ring-1 ring-white/10'
              : 'bg-white/80 border-rose-100/60 ring-1 ring-rose-200/60'
          }`}
        >
          <nav className="flex items-center justify-between max-w-7xl mx-auto px-8 py-4">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 via-pink-500 to-blue-500 rounded-xl flex items-center justify-center shadow-lg cursor-pointer" onClick={() => navigate('/') }>
                <Sparkles className="w-7 h-7 text-white" />
              </div>
              <span
                className={`text-3xl font-black bg-gradient-to-r bg-clip-text text-transparent ${
                  isDarkMode ? 'from-white via-purple-200 to-pink-200' : 'from-slate-800 via-purple-600 to-pink-600'
                }`}
              >
                Planora
              </span>
            </div>

            <div className="flex items-center space-x-4">
              <button
                onClick={toggleTheme}
                className={`p-3 rounded-xl transition-all duration-300 ${
                  isDarkMode ? 'bg-white/10 hover:bg-white/20 text-yellow-400' : 'bg-rose-100/70 hover:bg-rose-200/80 text-slate-700'
                }`}
                aria-label="Toggle theme"
              >
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              <button
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-xl transition-colors duration-200 shadow-lg text-white"
                onClick={() => navigate('/login')}
              >
                <div className="flex items-center space-x-2">
                  <LogIn className="w-5 h-5" />
                  <span className="font-semibold">Login</span>
                </div>
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10">{children}</main>

      {/* Shared animations helpers */}
      <style>{`
        @keyframes gradient-x { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        @keyframes pulse-slow { 0%, 100% { opacity: 0.8; } 50% { opacity: 1; } }
        .animate-gradient-x { animation: gradient-x 3s ease infinite; }
        .animate-pulse-slow { animation: pulse-slow 4s ease-in-out infinite; }
        .bg-size-200 { background-size: 200% 200%; }
        .delay-100 { animation-delay: 0.1s; }
        .delay-200 { animation-delay: 0.2s; }
        .delay-300 { animation-delay: 0.3s; }
      `}</style>
    </div>
  );
};

export default SiteLayout;
