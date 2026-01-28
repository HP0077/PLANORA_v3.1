import { Link } from 'react-router-dom'

export default function App(){
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="max-w-xl text-center space-y-4">
        <h1 className="text-4xl font-bold">Planora</h1>
        <p className="opacity-80">All-in-One Event Management Platform</p>
        <div className="flex gap-4 justify-center">
          <Link className="px-4 py-2 rounded bg-blue-600 text-white" to="/login">Login</Link>
          <Link className="px-4 py-2 rounded bg-neutral-200 dark:bg-neutral-800" to="/register">Register</Link>
        </div>
      </div>
    </div>
  )
}
