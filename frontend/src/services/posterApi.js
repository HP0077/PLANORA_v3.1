// Poster Draft API — delegates to the shared axios `api` instance
// so auth, token refresh, and base URL are handled in one place.
import api from './api'

export const posterApi = {
  baseUrl() {
    return api.defaults.baseURL?.replace(/\/api\/?$/, '') || ''
  },
  authHeaders() {
    const token = localStorage.getItem('access') || sessionStorage.getItem('access')
    return token ? { Authorization: `Bearer ${token}` } : {}
  },
  async listDrafts(params = {}) {
    const { data } = await api.get('/poster/drafts/', { params, auth: true })
    return data
  },
  async getDraft(id) {
    const { data } = await api.get(`/poster/drafts/${id}/`, { auth: true })
    return data
  },
  async createDraft(payload) {
    const { data } = await api.post('/poster/drafts/', payload, { auth: true })
    return data
  },
  async updateDraft(id, payload) {
    const { data } = await api.patch(`/poster/drafts/${id}/`, payload, { auth: true })
    return data
  },
  async exportDraft(id, format = 'pdf') {
    const res = await api.post(
      `/poster/drafts/${id}/export/?format=${encodeURIComponent(format)}`,
      {},
      { auth: true, responseType: format === 'pdf' ? 'blob' : 'json' }
    )
    return res.data
  },
}
