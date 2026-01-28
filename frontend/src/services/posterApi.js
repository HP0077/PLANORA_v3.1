// Simple API wrapper for Poster Draft operations
// Auth: Uses JWT stored in sessionStorage under key 'access'.
// Note: credentials: 'include' retained for flexibility, but JWT is primary.

const jsonHeaders = { 'Content-Type': 'application/json' };
const withCreds = { credentials: 'include' };

function inferApiBase() {
  try {
    const envBase = (import.meta && import.meta.env && (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE)) || '';
    if (envBase) {
      // Normalize: remove trailing slash and trailing '/api' to prevent double '/api'
      let base = String(envBase).replace(/\/$/, '');
      base = base.replace(/\/api$/i, '');
      return base;
    }
  } catch {}
  const loc = (typeof window !== 'undefined') ? window.location : null;
  // When running on Vite dev server, default backend to 8000
  if (loc && (loc.port === '5173' || loc.port === '5174')) {
    return `${loc.protocol}//${loc.hostname}:8000`;
  }
  return '';
}

const API_BASE = inferApiBase();

function getAuthHeaders() {
  try {
    const token = sessionStorage.getItem('access') || localStorage.getItem('access');
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {}
  return {};
}

function readRefreshToken() {
  try { return sessionStorage.getItem('refresh') || localStorage.getItem('refresh') || ''; } catch { return ''; }
}

function storeAccessToken(token) {
  try {
    if (sessionStorage.getItem('access') != null) sessionStorage.setItem('access', token);
    else localStorage.setItem('access', token);
  } catch {}
}

let refreshingPromise = null;
async function refreshAccessToken() {
  const refresh = readRefreshToken();
  if (!refresh) return null;
  if (refreshingPromise) return refreshingPromise;
  refreshingPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users/token/refresh/`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ refresh }),
        ...withCreds,
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      const newAccess = data && (data.access || data?.access_token);
      if (newAccess) {
        storeAccessToken(newAccess);
        return newAccess;
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshingPromise = null;
    }
  })();
  return refreshingPromise;
}

async function authFetch(url, options = {}, retry = true) {
  const baseHeaders = (options && options.headers) || {};
  const headers = { ...baseHeaders, ...getAuthHeaders() };
  const res = await fetch(url, { ...options, headers, ...withCreds });
  if (res.status !== 401 || !retry) return res;
  const newAccess = await refreshAccessToken();
  if (!newAccess) return res; // re-auth required
  const headers2 = { ...baseHeaders, Authorization: `Bearer ${newAccess}` };
  return fetch(url, { ...options, headers: headers2, ...withCreds });
}

async function handle(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status}: ${text || res.statusText}`);
    err.status = res.status;
    throw err;
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.blob();
}

export const posterApi = {
  baseUrl(){ return API_BASE },
  authHeaders(){ return getAuthHeaders() },
  async listDrafts(params = {}) {
    const usp = new URLSearchParams(params);
    const res = await authFetch(`${API_BASE}/api/poster/drafts/${usp.toString() ? `?${usp.toString()}` : ''}`);
    return handle(res);
  },
  async getDraft(id) {
    const res = await authFetch(`${API_BASE}/api/poster/drafts/${id}/`);
    return handle(res);
  },
  async createDraft(payload) {
    const res = await authFetch(`${API_BASE}/api/poster/drafts/`, {
      method: 'POST',
      headers: { ...jsonHeaders },
      body: JSON.stringify(payload),
    });
    return handle(res);
  },
  async updateDraft(id, payload) {
    const res = await authFetch(`${API_BASE}/api/poster/drafts/${id}/`, {
      method: 'PATCH',
      headers: { ...jsonHeaders },
      body: JSON.stringify(payload),
    });
    return handle(res);
  },
  async exportDraft(id, format = 'pdf') {
    const res = await authFetch(`${API_BASE}/api/poster/drafts/${id}/export/?format=${encodeURIComponent(format)}`, {
      method: 'POST',
    });
    return handle(res);
  },
};
