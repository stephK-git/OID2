/**
 * Client API centralisé pour O.I.D.
 */

const API_BASE = ''; // Passe par le proxy Vite en dev ou même domaine en prod

export interface ApiError {
  detail: string;
}

export function getToken(): string | null {
  return localStorage.getItem('oid_token');
}

export function setToken(token: string) {
  localStorage.setItem('oid_token', token);
}

export function removeToken() {
  localStorage.removeItem('oid_token');
  localStorage.removeItem('oid_user');
}

export function getUser(): { nom: string; role: string } | null {
  const raw = localStorage.getItem('oid_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setUser(user: { nom: string; role: string }) {
  localStorage.setItem('oid_user', JSON.stringify(user));
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    removeToken();
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  if (!response.ok) {
    let errorMsg = `Erreur ${response.status}`;
    try {
      const errData = await response.json();
      if (errData.detail) {
        errorMsg = typeof errData.detail === 'string' ? errData.detail : JSON.stringify(errData.detail);
      }
    } catch {
      // Pas de JSON d'erreur
    }
    throw new Error(errorMsg);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

