// lib/api/client.ts
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const apiClient: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// ── Request interceptor: inject JWT token ──────────────────
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('zaroda_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: handle 401, refresh token ────────
// Single-flight refresh: when several requests 401 at once (e.g. a tab firing parallel
// calls right as the 15-min access token expires), only ONE refresh runs. The others wait
// for it and reuse the new token — preventing a refresh-token race that would otherwise
// rotate the token multiple times, invalidate it, and wrongly log the user out.
let refreshPromise: Promise<string> | null = null;

function runRefresh(): Promise<string> {
  if (!refreshPromise) {
    const refreshToken = localStorage.getItem('zaroda_refresh');
    if (!refreshToken) return Promise.reject(new Error('no refresh token'));
    refreshPromise = axios
      .post(`${BASE_URL}/api/v1/auth/refresh`, { refreshToken })
      .then(({ data }) => {
        localStorage.setItem('zaroda_token',   data.accessToken);
        localStorage.setItem('zaroda_refresh', data.refreshToken);
        return data.accessToken as string;
      })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const url = original?.url || '';
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/refresh');
    if (error.response?.status === 401 && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        const newToken = await runRefresh();   // shared across all concurrent 401s
        original.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(original);
      } catch {
        localStorage.removeItem('zaroda_token');
        localStorage.removeItem('zaroda_refresh');
        localStorage.removeItem('zaroda_user');
        if (typeof window !== 'undefined') window.location.href = '/auth/login';
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;
