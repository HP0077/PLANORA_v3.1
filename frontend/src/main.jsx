import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import App from './pages/App'
import Planora from './pages/Planora'
import Login from './pages/Auth/Login'
import Register from './pages/Auth/Register'
import Dashboard from './pages/Dashboard'
import Tasks from './pages/Tasks'
import Budget from './pages/Budget'
import Chat from './pages/Chat'
import Certificates from './pages/Certificates'
import AutomationRules from './pages/AutomationRules'
import Activity from './pages/Activity'
import AiAssistant from './pages/AiAssistant'
import ProtectedRoute from './components/ProtectedRoute'
import Poster from './pages/Poster'
import ErrorBoundary from './components/ErrorBoundary'

const root = createRoot(document.getElementById('root'))
root.render(
  <BrowserRouter>
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Planora/>} />
        <Route path="/login" element={<Login/>} />
        <Route path="/register" element={<Register/>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard/></ProtectedRoute>} />
        <Route path="/tasks" element={<ProtectedRoute><Tasks/></ProtectedRoute>} />
        <Route path="/budget" element={<ProtectedRoute><Budget/></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><Chat/></ProtectedRoute>} />
        <Route path="/poster" element={<ProtectedRoute><Poster/></ProtectedRoute>} />
        <Route path="/certificates" element={<ProtectedRoute><Certificates/></ProtectedRoute>} />
        <Route path="/automation-rules" element={<ProtectedRoute><AutomationRules/></ProtectedRoute>} />
        <Route path="/activity" element={<ProtectedRoute><Activity/></ProtectedRoute>} />
        <Route path="/ai-assistant" element={<ProtectedRoute><AiAssistant/></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace/>} />
      </Routes>
    </ErrorBoundary>
  </BrowserRouter>
)
