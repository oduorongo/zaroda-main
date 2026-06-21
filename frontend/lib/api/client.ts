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
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const url = original?.url || '';
    // Never run the refresh/redirect dance for the auth endpoints themselves — a failed
    // login should surface its error to the form, not trigger a refresh + page redirect
    // (which causes a confusing "flash back to login" instead of showing the message).
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/refresh');
    if (error.response?.status === 401 && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem('zaroda_refresh');
        if (!refreshToken) throw new Error('no refresh token');
        const { data } = await axios.post(`${BASE_URL}/api/v1/auth/refresh`, { refreshToken });
        localStorage.setItem('zaroda_token',   data.accessToken);
        localStorage.setItem('zaroda_refresh', data.refreshToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return apiClient(original);
      } catch {
        // Refresh failed — clear storage and redirect to login
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
