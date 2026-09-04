'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

// Signup runs before login so it can't use the authed client, but it must hit
// the backend origin (not the frontend) — same base URL as the school signup page.
const API = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/v1`;

export default function SignupIndividualPage() {
  return (
    <Suspense fallback={null}>
      <SignupIndividualForm/>
    </Suspense>
  );
}

function SignupIndividualForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get('ref') || undefined;
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '',
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) { toast.error('Passwords do not match'); return; }
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/signup-individual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName, lastName: form.lastName,
          email: form.email, phone: form.phone, password: form.password, ref,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message || 'Signup failed'); setLoading(false); return; }

      localStorage.setItem('zaroda_token', data.accessToken);
      localStorage.setItem('zaroda_refresh', data.refreshToken);
      localStorage.setItem('zaroda_user', JSON.stringify(data.user));

      toast.success('Account created! Let’s generate your first scheme.');
      router.push('/dashboard/professional-records');
    } catch {
      toast.error('Could not connect to server. Make sure the backend is running.');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-6">
        <img src="/zaroda-logo.png" alt="ZARODA" className="inline-block w-14 h-14 rounded-xl object-cover mb-3"/>
        <div className="text-white font-black text-sm leading-tight">ZARODA SCHOOL</div>
        <div className="text-[#fdba74] font-black text-sm leading-tight mb-2">MANAGEMENT SYSTEM</div>
        <h1 className="text-xl font-black text-white">Professional Records — no school account needed</h1>
        <p className="text-white/40 text-xs mt-1">Generate schemes, lesson plans &amp; lesson notes on your own — top up your wallet via M-Pesa, then pay KES 30 per scheme and KES 2 per lesson plan or lesson notes.</p>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-modal">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First name *</label>
              <input required value={form.firstName} onChange={set('firstName')} className="input"/>
            </div>
            <div>
              <label className="label">Last name *</label>
              <input required value={form.lastName} onChange={set('lastName')} className="input"/>
            </div>
          </div>
          <div>
            <label className="label">Email *</label>
            <input required type="email" value={form.email} onChange={set('email')} className="input"/>
          </div>
          <div>
            <label className="label">Phone</label>
            <input value={form.phone} onChange={set('phone')} placeholder="07XXXXXXXX" className="input"/>
          </div>
          <div>
            <label className="label">Password *</label>
            <div className="relative">
              <input required type={show ? 'text' : 'password'} minLength={8}
                value={form.password} onChange={set('password')} className="input pr-10"/>
              <button type="button" onClick={() => setShow(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7a82a8]">
                {show ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
          </div>
          <div>
            <label className="label">Confirm password *</label>
            <input required type={show ? 'text' : 'password'} minLength={8}
              value={form.confirmPassword} onChange={set('confirmPassword')} className="input"/>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-2">
            {loading ? <><Loader2 size={16} className="animate-spin"/> Creating account…</> : 'Create account'}
          </button>
        </form>

        <p className="text-center text-xs text-[#7a82a8] mt-4">
          Running a whole school instead?{' '}
          <Link href="/auth/signup" className="text-[#1a2e5a] font-semibold hover:underline">Sign up your school</Link>
        </p>
        <p className="text-center text-xs text-[#7a82a8] mt-1">
          Already have an account? <Link href="/auth/login" className="text-[#1a2e5a] font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
