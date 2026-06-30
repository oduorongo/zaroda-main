'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

function ResetInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';
  const email = params.get('email') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => { if (!token || !email) setInvalid(true); }, [token, email]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (password !== confirm) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      await apiClient.post('/auth/reset-password', { email, token, password });
      setDone(true);
      setTimeout(() => router.push('/auth/login'), 2500);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'This reset link is invalid or has expired.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#f4f6fb]">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-7">
        {done ? (
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={28} className="text-green-600"/>
            </div>
            <h1 className="text-xl font-black text-[#1a2e5a]">Password reset!</h1>
            <p className="text-sm text-[#7a82a8] mt-2">You can now sign in with your new password. Redirecting…</p>
          </div>
        ) : invalid ? (
          <div className="text-center py-4">
            <h1 className="text-xl font-black text-[#1a2e5a]">Invalid reset link</h1>
            <p className="text-sm text-[#7a82a8] mt-2">This link is missing information or has expired.</p>
            <Link href="/auth/forgot-password" className="btn-primary inline-flex mt-4">Request a new link</Link>
          </div>
        ) : (
          <>
            <div className="w-12 h-12 rounded-xl bg-[#1a2e5a]/10 flex items-center justify-center mb-3">
              <Lock size={22} className="text-[#1a2e5a]"/>
            </div>
            <h1 className="text-xl font-black text-[#1a2e5a]">Set a new password</h1>
            <p className="text-sm text-[#7a82a8] mt-1 mb-5">For <b>{email}</b></p>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="label">New password</label>
                <div className="relative">
                  <input type={show ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="At least 6 characters" className="input pr-10"/>
                  <button type="button" onClick={() => setShow(!show)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7a82a8] hover:text-[#1a2e5a]">
                    {show ? <EyeOff size={16}/> : <Eye size={16}/>}
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Confirm new password</label>
                <input type={show ? 'text' : 'password'} required value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="Re-enter password" className="input"/>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
                {loading ? <><Loader2 size={16} className="animate-spin"/> Resetting…</> : 'Reset password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin"/></div>}>
      <ResetInner/>
    </Suspense>
  );
}
