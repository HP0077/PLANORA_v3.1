import axios from 'axios'

// Normalize base URL so calls like `/ai/ask/` consistently hit the API namespace.
const envBase = import.meta.env.VITE_API_BASE || ''
const baseCandidate = envBase || `${window.location.origin}/api`
const baseURL = baseCandidate.endsWith('/api') ? baseCandidate : `${baseCandidate.replace(/\/$/, '')}/api`

const instance = axios.create({ baseURL })

instance.interceptors.request.use((config)=>{
  // Attach auth header only when requested
  if(config._auth){
    config.headers = config.headers || {}
    const token = localStorage.getItem('access') || sessionStorage.getItem('access')
    if(token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let refreshing = null
let refreshQueue = []
function notifyQueue(error, token){
  refreshQueue.forEach(({resolve,reject})=> error ? reject(error) : resolve(token))
  refreshQueue = []
}
async function refresh(){
  if(!refreshing){
    const refreshToken = localStorage.getItem('refresh') || sessionStorage.getItem('refresh')
    if(!refreshToken){
      throw new Error('No refresh')
    }
    refreshing = instance.post('/users/token/refresh/', { refresh: refreshToken })
      .then(({data})=>{
        localStorage.setItem('access', data.access)
        sessionStorage.setItem('access', data.access)
        notifyQueue(null, data.access)
        return data.access
      })
      .catch(err=>{
        notifyQueue(err)
        throw err
      })
      .finally(()=>{
        refreshing = null
      })
  }
  return new Promise((resolve, reject)=>{
    refreshQueue.push({resolve, reject})
    if(refreshing){ /* noop, wait for existing */ }
  })
}

instance.interceptors.response.use(r=>r, async (error)=>{
  const original = error.config
  if(error.response?.status === 401 && !original._retry){
    original._retry = true
    try{
      const token = await refresh()
      original.headers = original.headers || {}
      original.headers.Authorization = `Bearer ${token}`
      return instance(original)
    }catch(e){
      localStorage.clear()
      sessionStorage.clear()
      window.location.href = '/login'
    }
  }
  return Promise.reject(error)
})

const api = {
  get: (url, { auth=false, ...config }={}) => instance.get(url, { ...config, _auth: auth }),
  post: (url, data, { auth=false, ...config }={}) => instance.post(url, data, { ...config, _auth: auth }),
  put: (url, data, { auth=false, ...config }={}) => instance.put(url, data, { ...config, _auth: auth }),
  patch: (url, data, { auth=false, ...config }={}) => instance.patch(url, data, { ...config, _auth: auth }),
  delete: (url, { auth=false, ...config }={}) => instance.delete(url, { ...config, _auth: auth }),
}

export default api
