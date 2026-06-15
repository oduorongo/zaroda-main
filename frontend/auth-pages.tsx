// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// MODULE 01: Auth + Tenant Onboarding — Next.js Frontend
// Stack: Next.js 14 · TypeScript · Tailwind CSS
// ============================================================
// Files covered:
//   app/(auth)/login/page.tsx
//   app/(auth)/register/page.tsx          ← school self-onboarding
//   app/(auth)/self-register/page.tsx     ← teacher invite registration
//   app/(auth)/forgot-password/page.tsx
//   lib/api/auth.ts
//   lib/api/tenant.ts
//   lib/hooks/useAuth.ts
//   middleware.ts                          ← subdomain-aware routing
// ============================================================

// ─────────────────────────────────────────────────────────────
// middleware.ts  (Next.js App Router)
// Handles subdomain routing: starlight.zarodasms.app → /[tenant]
// ─────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const subdomain = hostname.split('.')[0];

  // Bypass for www, admin, localhost, Vercel preview
  const bypassed = ['www','admin','localhost','vercel'];
  if (bypassed.some(b => subdomain.startsWith(b))) {
    return NextResponse.next();
  }

  // Inject subdomain as a header for SSR pages to read
  const response = NextResponse.next();
  response.headers.set('x-tenant-subdomain', subdomain);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};


// ─────────────────────────────────────────────────────────────
// lib/api/client.ts
// ─────────────────────────────────────────────────────────────
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Attach access token from localStorage
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('zaroda_access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh on 401
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem('zaroda_refresh_token');
        const { data } = await axios.post(`${API_URL}/api/v1/auth/refresh`, { refreshToken });
        localStorage.setItem('zaroda_access_token',  data.accessToken);
        localStorage.setItem('zaroda_refresh_token', data.refreshToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return apiClient(original);
      } catch {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);


// ─────────────────────────────────────────────────────────────
// lib/api/auth.ts
// ─────────────────────────────────────────────────────────────
import { apiClient } from './client';

export interface LoginPayload   { email: string; password: string; mfaCode?: string; }
export interface LoginResponse  { accessToken: string; refreshToken: string; user: User; requiresMfa?: boolean; }
export interface User {
  id: string; tenantId: string; schoolId: string;
  firstName: string; lastName: string; email: string; phone: string;
  role: string; status: string; profilePhotoUrl?: string;
}

export const AuthAPI = {
  login: (data: LoginPayload) =>
    apiClient.post<LoginResponse>('/api/v1/auth/login', data),

  logout: (refreshToken: string) =>
    apiClient.post('/api/v1/auth/logout', { refreshToken }),

  forgotPassword: (email: string) =>
    apiClient.post('/api/v1/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    apiClient.post('/api/v1/auth/reset-password', { token, newPassword }),

  me: () =>
    apiClient.get<User>('/api/v1/auth/me'),

  selfRegister: (data: SelfRegisterPayload) =>
    apiClient.post('/api/v1/auth/register', data),

  setupMfa: () =>
    apiClient.get('/api/v1/auth/mfa/setup'),

  confirmMfa: (code: string) =>
    apiClient.post('/api/v1/auth/mfa/confirm', { code }),
};

// ─────────────────────────────────────────────────────────────
// lib/api/tenant.ts
// ─────────────────────────────────────────────────────────────
export const TenantAPI = {
  onboard: (data: OnboardPayload) =>
    apiClient.post('/api/v1/onboard', data),

  addStream: (schoolId: string, data: StreamPayload) =>
    apiClient.post(`/api/v1/schools/${schoolId}/streams`, data),

  generateInvite: (schoolId: string, data: InvitePayload) =>
    apiClient.post(`/api/v1/schools/${schoolId}/invite`, data),
};


// ─────────────────────────────────────────────────────────────
// lib/hooks/useAuth.ts
// ─────────────────────────────────────────────────────────────
'use client';
import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { AuthAPI, type User } from '../api/auth';
import { useRouter } from 'next/navigation';

interface AuthState {
  user: User | null;
  loading: boolean;
  login:  (email: string, password: string, mfaCode?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('zaroda_access_token');
    if (token) {
      AuthAPI.me()
        .then(res => setUser(res.data))
        .catch(() => { localStorage.clear(); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string, mfaCode?: string) => {
    const { data } = await AuthAPI.login({ email, password, mfaCode });
    localStorage.setItem('zaroda_access_token',  data.accessToken);
    localStorage.setItem('zaroda_refresh_token', data.refreshToken);
    setUser(data.user);
    // Route by role
    const roleRoutes: Record<string, string> = {
      super_admin:    '/admin',
      tenant_owner:   '/dashboard',
      school_admin:   '/dashboard',
      hoi:            '/dashboard',
      dhois:          '/dashboard',
      class_teacher:  '/my-class',
      subject_teacher:'/my-subjects',
      bursar:         '/finance',
      parent:         '/parent',
      learner:        '/learner',
    };
    router.push(roleRoutes[data.user.role] || '/dashboard');
  }, [router]);

  const logout = useCallback(async () => {
    const token = localStorage.getItem('zaroda_refresh_token');
    if (token) await AuthAPI.logout(token).catch(() => {});
    localStorage.clear();
    setUser(null);
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);


// ─────────────────────────────────────────────────────────────
// app/(auth)/login/page.tsx
// ─────────────────────────────────────────────────────────────
'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const { login } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode,  setMfaCode]  = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, needsMfa ? mfaCode : undefined);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Login failed. Please try again.';
      if (msg.includes('MFA') || err?.response?.data?.requiresMfa) {
        setNeedsMfa(true);
        setError('Please enter your 6-digit authenticator code.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-[#1a2e5a] rounded-2xl flex items-center justify-center mb-3 shadow-lg">
            <ZarodaIcon />
          </div>
          <h1 className="text-xl font-semibold text-[#1a2e5a]">ZARODA SMS</h1>
          <p className="text-sm text-gray-500 mt-1">School Management System</p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7">
          <h2 className="text-lg font-semibold text-gray-800 mb-5">Sign in to your school</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!needsMfa ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    required autoComplete="email" autoFocus
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a] focus:border-transparent"
                    placeholder="your@email.com"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-gray-700">Password</label>
                    <Link href="/forgot-password" className="text-xs text-[#1a2e5a] hover:underline">Forgot password?</Link>
                  </div>
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)}
                    required autoComplete="current-password"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a] focus:border-transparent"
                    placeholder="••••••••"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Authenticator Code</label>
                <input
                  type="text" value={mfaCode} onChange={e => setMfaCode(e.target.value)}
                  required maxLength={6} autoFocus pattern="[0-9]{6}"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-center tracking-widest text-xl focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"
                  placeholder="000000"
                />
                <p className="text-xs text-gray-500 mt-1">Enter the 6-digit code from your authenticator app</p>
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full py-2.5 bg-[#1a2e5a] hover:bg-[#142347] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Signing in...' : needsMfa ? 'Verify Code' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">
          Powered by <span className="text-[#d4af37] font-medium">ZARODA SOLUTIONS</span> · +254781230805
        </p>
      </div>
    </div>
  );
}

function ZarodaIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path d="M7 21L14 7L21 21" stroke="#d4af37" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 16L18 16" stroke="#d4af37" strokeWidth="2" strokeLinecap="round"/>
      <path d="M14 21L14 25" stroke="#d4af37" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}


// ─────────────────────────────────────────────────────────────
// app/(auth)/register/page.tsx  — School Self-Onboarding
// ─────────────────────────────────────────────────────────────
'use client';
import { useState } from 'react';
import { TenantAPI } from '@/lib/api/tenant';
import Link from 'next/link';

const SCHOOL_TYPES = [
  { value: 'ecde',     label: 'ECDE (Playgroup, PP1, PP2)' },
  { value: 'primary',  label: 'Primary School (Grade 1–6)' },
  { value: 'junior',   label: 'Junior School (Grade 7–9)' },
  { value: 'senior',   label: 'Senior School (Grade 10–12)' },
  { value: 'combined', label: 'Combined (Multiple levels)' },
];

const KENYA_COUNTIES = [
  'Nairobi','Mombasa','Kisumu','Nakuru','Eldoret','Thika','Nyeri','Meru','Kisii','Kakamega',
  'Machakos','Kitale','Malindi','Garissa','Isiolo','Embu','Murang\'a','Kiambu','Kajiado',
  'Narok','Bomet','Kericho','Nandi','Uasin Gishu','Trans Nzoia','West Pokot','Turkana',
  'Marsabit','Wajir','Mandera','Tana River','Lamu','Taita Taveta','Kilifi','Kwale',
  'Siaya','Homa Bay','Migori','Nyamira','Vihiga','Bungoma','Busia','Elgeyo Marakwet',
  'Laikipia','Samburu','Baringo','Nyandarua','Kirinyaga','Tharaka Nithi','Makueni',
  'Kitui','Mwingi','Machakos'
].sort();

export default function RegisterPage() {
  const [step, setStep]     = useState(1);  // 1: school info | 2: director account | 3: success
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [result, setResult] = useState<any>(null);

  const [form, setForm] = useState({
    schoolName: '', knecCode: '', schoolType: '', county: '', subCounty: '',
    phone: '', email: '', address: '',
    ownerFirstName: '', ownerLastName: '', ownerEmail: '', ownerPassword: '', ownerPhone: '',
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  async function submit() {
    setError('');
    setLoading(true);
    try {
      const { data } = await TenantAPI.onboard(form);
      setResult(data);
      setStep(3);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (step === 3 && result) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">School Registered!</h2>
          <p className="text-sm text-gray-500 mb-6">{result.message}</p>
          <div className="bg-[#f4f6fb] rounded-xl p-4 text-left space-y-2 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Portal URL</span>
              <a href={result.portalUrl} className="text-[#1a2e5a] font-medium hover:underline">{result.portalUrl}</a>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Trial ends</span>
              <span className="font-medium">{new Date(result.trialEndsAt).toLocaleDateString('en-KE',{day:'numeric',month:'long',year:'numeric'})}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Invoice</span>
              <span className="text-green-600 font-medium">{result.invoice.status}</span>
            </div>
          </div>
          <a href={result.portalUrl}
            className="block w-full py-3 bg-[#1a2e5a] text-white rounded-xl text-sm font-medium hover:bg-[#142347] transition-colors">
            Go to Your Portal →
          </a>
          <p className="text-xs text-gray-400 mt-4">A welcome email and SMS have been sent to your registered contacts.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb] py-10 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-[#1a2e5a] rounded-xl flex items-center justify-center mb-3">
            <ZarodaIcon />
          </div>
          <h1 className="text-xl font-semibold text-[#1a2e5a]">Register Your School</h1>
          <p className="text-sm text-gray-500">Start your 14-day free trial — no payment required</p>
        </div>

        {/* Progress */}
        <div className="flex gap-2 mb-6">
          {[1,2].map(s => (
            <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${step >= s ? 'bg-[#1a2e5a]' : 'bg-gray-200'}`}/>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800">Step 1 — School Information</h3>
              <Field label="School Name *" value={form.schoolName} onChange={set('schoolName')} placeholder="e.g. Starlight Academy" required />
              <Field label="KNEC Code" value={form.knecCode} onChange={set('knecCode')} placeholder="e.g. 12345678" />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">School Type *</label>
                <select value={form.schoolType} onChange={set('schoolType')} required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]">
                  <option value="">Select type...</option>
                  {SCHOOL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">County *</label>
                <select value={form.county} onChange={set('county')} required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]">
                  <option value="">Select county...</option>
                  {KENYA_COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <Field label="Sub-County" value={form.subCounty} onChange={set('subCounty')} placeholder="e.g. Westlands" />
              <Field label="School Phone *" value={form.phone} onChange={set('phone')} placeholder="+254..." type="tel" required />
              <Field label="School Email *" value={form.email} onChange={set('email')} placeholder="school@email.com" type="email" required />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea value={form.address} onChange={set('address')} rows={2}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a] resize-none"
                  placeholder="Physical address"/>
              </div>
              <button onClick={() => {
                if (!form.schoolName || !form.schoolType || !form.county || !form.phone || !form.email)
                  return setError('Please fill all required fields.');
                setError(''); setStep(2);
              }} className="w-full py-2.5 bg-[#1a2e5a] text-white rounded-lg text-sm font-medium hover:bg-[#142347] transition-colors mt-2">
                Continue →
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800">Step 2 — Director / Owner Account</h3>
              <p className="text-xs text-gray-500">This account will be the school owner with full system access.</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="First Name *" value={form.ownerFirstName} onChange={set('ownerFirstName')} required />
                <Field label="Last Name *" value={form.ownerLastName}  onChange={set('ownerLastName')}  required />
              </div>
              <Field label="Email Address *" value={form.ownerEmail} onChange={set('ownerEmail')} type="email" required />
              <Field label="Phone *" value={form.ownerPhone} onChange={set('ownerPhone')} type="tel" placeholder="+254..." required />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input type="password" value={form.ownerPassword} onChange={set('ownerPassword')} required minLength={8}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"
                  placeholder="Minimum 8 characters"/>
                <p className="text-xs text-gray-400 mt-1">Use a strong password — this is your admin account.</p>
              </div>
              <div className="flex gap-3 mt-2">
                <button onClick={() => setStep(1)}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                  ← Back
                </button>
                <button onClick={submit} disabled={loading}
                  className="flex-1 py-2.5 bg-[#1a2e5a] text-white rounded-lg text-sm font-medium hover:bg-[#142347] transition-colors disabled:opacity-60">
                  {loading ? 'Registering...' : 'Register School'}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Already registered? <Link href="/login" className="text-[#1a2e5a] hover:underline">Sign in</Link>
          <br/>Powered by <span className="text-[#d4af37]">ZARODA SOLUTIONS</span> · www.zarodasolutions.app
        </p>
      </div>
    </div>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        {...props}
        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a] focus:border-transparent"
      />
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// app/(auth)/self-register/page.tsx  — Teacher Invite Registration
// ─────────────────────────────────────────────────────────────
'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthAPI } from '@/lib/api/auth';

export default function SelfRegisterPage() {
  const params = useSearchParams();
  const token  = params.get('token') || '';
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', password:'', phone:'', nationalId:'', tscNumber:'' });
  const [loading, setLoading]   = useState(false);
  const [success, setSuccess]   = useState(false);
  const [error, setError]       = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({...prev, [k]: e.target.value}));

  if (!token) return (
    <div className="min-h-screen bg-[#f4f6fb] flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-600 font-medium">Invalid or missing invite link.</p>
        <p className="text-sm text-gray-500 mt-1">Contact your school administrator or WhatsApp +254781230805</p>
      </div>
    </div>
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await AuthAPI.selfRegister({ ...form, token });
      setSuccess(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  if (success) return (
    <div className="min-h-screen bg-[#f4f6fb] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center max-w-sm">
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Account Created!</h2>
        <p className="text-sm text-gray-500 mb-5">Your account is ready. You can now sign in to ZARODA SMS.</p>
        <a href="/login" className="block w-full py-2.5 bg-[#1a2e5a] text-white rounded-xl text-sm font-medium hover:bg-[#142347]">
          Go to Login →
        </a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f4f6fb] py-10 px-4">
      <div className="max-w-md mx-auto">
        <div className="flex flex-col items-center mb-7">
          <div className="w-12 h-12 bg-[#1a2e5a] rounded-xl flex items-center justify-center mb-3">
            <ZarodaIcon />
          </div>
          <h1 className="text-xl font-semibold text-[#1a2e5a]">Complete Registration</h1>
          <p className="text-sm text-gray-500">You have been invited to join your school on ZARODA SMS</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name *" value={form.firstName} onChange={set('firstName')} required />
              <Field label="Last Name *"  value={form.lastName}  onChange={set('lastName')}  required />
            </div>
            <Field label="Email *" value={form.email} onChange={set('email')} type="email" required />
            <Field label="Phone *" value={form.phone} onChange={set('phone')} type="tel" placeholder="+254..." required />
            <Field label="Password *" value={form.password} onChange={set('password')} type="password" minLength={8} required />
            <Field label="National ID" value={form.nationalId} onChange={set('nationalId')} />
            <Field label="TSC Number" value={form.tscNumber} onChange={set('tscNumber')} placeholder="For teachers" />
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-[#1a2e5a] text-white rounded-lg text-sm font-medium hover:bg-[#142347] disabled:opacity-60 mt-2">
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
