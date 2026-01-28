import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Users, BarChart3, MessageCircle, Plus, UserPlus, Zap, Target, Globe, Award, TrendingUp, Star, Sparkles, Sun, Moon, LogIn } from 'lucide-react';

const Planora = () => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const toggleTheme = () => setIsDarkMode(d=>!d);
  const [loadingStates] = useState({
    login: false,
    createEvent: false,
    joinCommunity: false,
    beginJourney: false,
  });

  useEffect(() => {
    setIsVisible(true);

    const interval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % 4);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const goTo = (path) => {
    navigate(path);
  };

  const features = [
    {
      icon: Calendar,
      title: 'Intelligent Scheduling',
      description: 'AI-powered calendar orchestration with predictive timeline management',
      color: 'from-blue-600 via-blue-500 to-cyan-400',
    },
    {
      icon: Users,
      title: 'Quantum Collaboration',
      description: 'Real-time synchronization across teams with instant communication fabric',
      color: 'from-purple-600 via-purple-500 to-pink-400',
    },
    {
      icon: BarChart3,
      title: 'Neural Analytics',
      description: 'Deep insights engine with predictive success modeling and growth vectors',
      color: 'from-emerald-600 via-green-500 to-teal-400',
    },
    {
      icon: MessageCircle,
      title: 'Omni-Channel Hub',
      description: 'Unified communication matrix bridging digital and physical event spaces',
      color: 'from-orange-600 via-red-500 to-pink-400',
    },
  ];

  const stats = [
    { icon: Globe, value: 'All-in-One', label: 'Platform Solution', gradient: 'from-blue-400 to-cyan-300' },
    { icon: Users, value: 'Real-time', label: 'Collaboration', gradient: 'from-purple-400 to-pink-300' },
    { icon: Award, value: 'Free', label: 'Tier Available', gradient: 'from-green-400 to-emerald-300' },
    { icon: TrendingUp, value: 'Open Source', label: '& Scalable', gradient: 'from-orange-400 to-red-300' },
  ];

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
        <div className={`absolute w-96 h-96 rounded-full blur-3xl top-20 left-20 animate-pulse-slow ${isDarkMode ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20' : 'bg-gradient-to-r from-purple-300/40 to-pink-300/40'}`} />
        <div className={`absolute w-80 h-80 rounded-full blur-3xl top-60 right-20 animate-pulse-slow ${isDarkMode ? 'bg-gradient-to-r from-blue-500/15 to-cyan-500/15' : 'bg-gradient-to-r from-rose-300/35 to-pink-300/35'}`} style={{animationDelay:'2s'}} />
        <div className={`absolute w-72 h-72 rounded-full blur-3xl bottom-32 left-1/2 animate-pulse-slow ${isDarkMode ? 'bg-gradient-to-r from-emerald-500/15 to-teal-500/15' : 'bg-gradient-to-r from-purple-300/30 to-rose-300/30'}`} style={{animationDelay:'4s'}} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 px-6 py-4">
        <div className={`backdrop-blur-xl rounded-2xl border shadow-2xl ${isDarkMode ? 'bg-white/5 border-white/10 ring-1 ring-white/10' : 'bg-white/80 border-rose-100/60 ring-1 ring-rose-200/60'}`}>
          <nav className="flex items-center justify-between max-w-7xl mx-auto px-8 py-4">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 via-pink-500 to-blue-500 rounded-xl flex items-center justify-center shadow-lg">
                <Sparkles className="w-7 h-7 text-white" />
              </div>
              <span className={`text-3xl font-black bg-gradient-to-r bg-clip-text text-transparent ${isDarkMode ? 'from-white via-purple-200 to-pink-200' : 'from-slate-800 via-purple-600 to-pink-600'}`}>Planora</span>
            </div>
            <div className="flex items-center space-x-4">
              <button onClick={toggleTheme} className={`p-3 rounded-xl transition-all duration-300 ${isDarkMode ? 'bg-white/10 hover:bg-white/20 text-yellow-400' : 'bg-rose-100/70 hover:bg-rose-200/80 text-slate-700'}`} aria-label="Toggle theme">{isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}</button>
              <button className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-xl transition-colors duration-200 shadow-lg text-white" onClick={() => goTo('/login')}>
                <div className="flex items-center space-x-2"><LogIn className="w-5 h-5" /><span className="font-semibold">Login</span></div>
              </button>
            </div>
          </nav>
        </div>
      </header>

      <main className="relative z-10 pt-16 pb-32">
        <div className="max-w-7xl mx-auto px-6">
          <div
            className={`text-center transform transition-all duration-1000 ${
              isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
            }`}
          >
            {/* Simplified Badge */}
            <div
              className={`inline-flex items-center space-x-3 px-6 py-3 backdrop-blur-md rounded-full mb-12 border shadow-lg ${
                isDarkMode ? 'bg-white/10 border-white/20' : 'bg-white/90 border-rose-200/60'
              }`}
            >
              <Star className="w-4 h-4 text-yellow-400" fill="currentColor" />
              <span className={`text-sm font-medium ${isDarkMode ? 'text-white/90' : 'text-slate-800'}`}>
                Next-Gen Event Orchestration Platform
              </span>
              <Zap className="w-4 h-4 text-yellow-400" />
            </div>

            {/* Main Headline */}
            <h1 className="text-6xl md:text-8xl font-black mb-12 leading-tight">
              <div className="mb-4">
                <span
                  className={`bg-gradient-to-r bg-clip-text text-transparent ${
                    isDarkMode ? 'from-white to-gray-300' : 'from-slate-800 to-slate-600'
                  }`}
                >
                  Smart Event Management &
                </span>
              </div>
              <div className="relative">
                <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent animate-gradient-x bg-size-200">
                  Collaboration
                </span>
              </div>
            </h1>

            {/* Description */}
            <p
              className={`text-xl md:text-2xl mb-16 max-w-5xl mx-auto leading-relaxed font-light ${
                isDarkMode ? 'text-white/80' : 'text-slate-800'
              }`}
            >
              Orchestrate extraordinary experiences with
              <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent font-medium">
                {' '}intelligent automation
              </span>
              ,
              <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent font-medium">
                {' '}real-time collaboration
              </span>
              , and
              <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent font-medium">
                {' '}seamless coordination
              </span>
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-6 sm:space-y-0 sm:space-x-8 mb-20">
              <button
                className="group px-10 py-5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-xl hover:shadow-purple-500/30 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
                onClick={() => goTo('/register')}
              >
                <div className="flex items-center space-x-3 text-xl font-bold">
                  <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
                  <span>Create Event</span>
                </div>
              </button>

              <button
                className="px-10 py-5 bg-white/10 backdrop-blur-md hover:bg-white/20 rounded-2xl transition-all duration-300 border border-white/20 hover:border-white/40 shadow-lg transform hover:scale-105 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
                onClick={() => goTo('/register')}
              >
                <div className="flex items-center space-x-3 text-xl font-semibold">
                  <UserPlus className="w-6 h-6" />
                  <span>Join Community</span>
                </div>
              </button>
            </div>

            {/* Optimized Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-24">
              {stats.map((stat, index) => (
                <div
                  key={index}
                  className={`group transform transition-all duration-700 delay-${index * 100} ${
                    isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
                  }`}
                >
                  <div
                    className={`backdrop-blur-md rounded-2xl p-8 border transition-all duration-300 hover:scale-105 hover:-translate-y-1 shadow-lg hover:shadow-xl ${
                      isDarkMode
                        ? 'bg-white/10 border-white/10 hover:border-white/30'
                        : 'bg-white/80 border-rose-100/50 hover:border-rose-200/60'
                    }`}
                  >
                    <stat.icon
                      className={`w-12 h-12 mx-auto mb-4 transition-colors duration-300 group-hover:scale-110 ${
                        isDarkMode ? 'text-white/60 group-hover:text-white' : 'text-slate-700 group-hover:text-slate-900'
                      }`}
                    />
                    <div className={`text-2xl font-black mb-2 bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent`}>
                      {stat.value}
                    </div>
                    <div
                      className={`text-sm font-medium transition-colors duration-300 ${
                        isDarkMode ? 'text-white/60 group-hover:text-white/90' : 'text-slate-700 group-hover:text-slate-900'
                      }`}
                    >
                      {stat.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Features Section */}
          <div className="text-center mb-20">
            <h2
              className={`text-5xl md:text-6xl font-black mb-6 bg-gradient-to-r bg-clip-text text-transparent ${
                isDarkMode ? 'from-white via-purple-100 to-white' : 'from-slate-800 via-purple-600 to-slate-800'
              }`}
            >
              Everything you need to manage events
            </h2>
            <p className={`text-xl font-light max-w-3xl mx-auto mb-16 ${isDarkMode ? 'text-white/70' : 'text-slate-700'}`}>
              Comprehensive tools engineered for the future of event management
            </p>
          </div>

          {/* Optimized Feature Cards */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className={`group relative overflow-hidden rounded-2xl p-8 transition-all duration-500 transform hover:scale-105 cursor-pointer ${
                  activeFeature === index
                    ? isDarkMode
                      ? 'bg-white/15 border-2 border-purple-400/50 shadow-xl shadow-purple-500/20'
                      : 'bg-white/90 border-2 border-pink-300/60 shadow-xl shadow-pink-500/20'
                    : isDarkMode
                    ? 'bg-white/5 border border-white/10 hover:bg-white/10'
                    : 'bg-white/70 border border-rose-200/40 hover:bg-white/85'
                }`}
                onMouseEnter={() => setActiveFeature(index)}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-10 transition-opacity duration-500`} />

                <div className="relative z-10">
                  <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                    <feature.icon className="w-8 h-8 text-white" />
                  </div>

                  <h3
                    className={`text-xl font-bold mb-3 transition-colors duration-300 ${
                      isDarkMode ? 'group-hover:text-purple-300' : 'text-slate-800 group-hover:text-purple-700'
                    }`}
                  >
                    {feature.title}
                  </h3>

                  <p
                    className={`leading-relaxed transition-colors duration-300 ${
                      isDarkMode ? 'text-white/70 group-hover:text-white/90' : 'text-slate-700 group-hover:text-slate-900'
                    }`}
                  >
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Final CTA */}
          <div className="mt-32 relative">
            <div
              className={`backdrop-blur-xl rounded-3xl p-16 border max-w-4xl mx-auto shadow-2xl ${
                isDarkMode ? 'bg-white/10 border-white/20' : 'bg-white/85 border-rose-200/50'
              }`}
            >
              <div className="text-center">
                <Target className="w-16 h-16 mx-auto mb-6 text-purple-400" />
                <h3
                  className={`text-4xl md:text-5xl font-black mb-6 bg-gradient-to-r bg-clip-text text-transparent ${
                    isDarkMode ? 'from-white via-purple-200 to-pink-200' : 'from-slate-800 via-purple-600 to-pink-600'
                  }`}
                >
                  Ready to revolutionize your events?
                </h3>
                <p className={`text-xl font-light max-w-3xl mx-auto mb-12 ${isDarkMode ? 'text-white/80' : 'text-slate-800'}`}>
                  Join the future of event management and experience the power of intelligent orchestration
                </p>
                <button
                  className="px-12 py-6 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-xl hover:shadow-purple-500/30 text-xl font-bold text-white disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
                  onClick={() => goTo('/register')}
                >
                  <div className="flex items-center space-x-3">
                    {/* keeping optional loader spot for future */}
                    <span>Begin Your Journey</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
  </main>
      {/* Shared animations helpers for this page */}
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

export default Planora;
