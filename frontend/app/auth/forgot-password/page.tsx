'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { toast.error('Enter your email'); return; }
    setLoading(true);
    try {
      const appUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
      await apiClient.post('/auth/forgot-password', { email: email.trim(), appUrl });
      setSent(true);
    } catch {
      // Always show the same neutral confirmation (don't reveal whether the email exists).
      setSent(true);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#f4f6fb]">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-7">
        <Link href="/auth/login" className="inline-flex items-center gap-1 text-sm text-[#7a82a8] hover:text-[#1a2e5a] mb-4">
          <ArrowLeft size={15}/> Back to sign in
        </Link>

        {!sent ? (
          <>
            <div className="w-12 h-12 rounded-xl bg-[#1a2e5a]/10 flex items-center justify-center mb-3">
              <Mail size={22} className="text-[#1a2e5a]"/>
            </div>
            <h1 className="text-xl font-black text-[#1a2e5a]">Forgot your password?</h1>
            <p className="text-sm text-[#7a82a8] mt-1 mb-5">Enter the email linked to your ZARODA account and we'll send you a link to reset your password.</p>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="label">Email address</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@school.ac.ke" className="input"/>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
                {loading ? <><Loader2 size={16} className="animate-spin"/> Sending…</> : 'Send reset link'}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={28} className="text-green-600"/>
            </div>
            <h1 className="text-xl font-black text-[#1a2e5a]">Check your email</h1>
            <p className="text-sm text-[#7a82a8] mt-2">If <b>{email}</b> is registered, a password reset link is on its way. The link expires in 1 hour.</p>
            <p className="text-xs text-[#7a82a8] mt-3">Didn't get it? Check your spam folder, or <button onClick={() => setSent(false)} className="text-[#1a2e5a] font-semibold hover:underline">try again</button>.</p>
          </div>
        )}
      </div>
    </div>
  );
}
