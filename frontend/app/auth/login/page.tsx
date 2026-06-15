'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router   = useRouter();
  const { login, loading } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [show,     setShow]     = useState(false);
  const [error,    setError]    = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      toast.success('Welcome back!');
      // Route by role — teachers get their own independent portal
      const role = useAuth.getState().user?.role || '';
      if (['class_teacher','subject_teacher','overall_class_teacher'].includes(role)) {
        router.push('/teacher');
      } else if (role === 'parent') {
        router.push('/dashboard/parent');
      } else if (role === 'learner') {
        router.push('/dashboard/learner');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  };

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="text-center mb-8">
        <img src="/zaroda-logo.png" alt="ZARODA" className="inline-block w-20 h-20 rounded-2xl object-cover mb-4 shadow-lg"/>
        <h1 className="text-lg font-black text-white leading-tight">ZARODA SCHOOL</h1>
        <h1 className="text-lg font-black text-[#fdba74] leading-tight">MANAGEMENT SYSTEM</h1>
        <p className="text-white/40 text-[10px] mt-1 tracking-widest uppercase">INNOVATIVE. RELIABLE. FORWARD.</p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl p-6 shadow-modal">
        <h2 className="text-lg font-bold text-[#1a2e5a] mb-1">Welcome back</h2>
        <p className="text-sm text-[#7a82a8] mb-6">Sign in to your school account</p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email address</label>
            <input
              type="email" required value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="principal@school.ac.ke"
              className="input"
            />
          </div>

          <div>
            <label className="label">Password</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'} required value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Your password"
                className="input pr-10"
              />
              <button type="button" onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7a82a8] hover:text-[#1a2e5a]">
                {show ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
            {loading ? <><Loader2 size={16} className="animate-spin"/> Signing in…</> : 'Sign In'}
          </button>
        </form>

        <div className="mt-5 pt-5 border-t border-[#e2e6f0] text-center">
          <p className="text-sm text-[#7a82a8]">
            No account?{' '}
            <Link href="/auth/signup" className="text-[#1a2e5a] font-semibold hover:text-[#f5820a]">
              Start free trial →
            </Link>
          </p>
        </div>
      </div>

      <p className="text-center mt-4 text-white/30 text-xs">
        Need help?{' '}
        <a href="https://wa.me/254781230805" target="_blank" rel="noopener noreferrer"
          className="text-[#d4af37] hover:underline">
          WhatsApp +254 781 230 805
        </a>
      </p>
    </div>
  );
}
