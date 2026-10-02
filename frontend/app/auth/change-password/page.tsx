'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock, Eye, EyeOff } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, homePathForRole } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

// Signed-in password change. Users holding a temporary password from an admin
// (mustChangePassword) are sent here and can't use the rest of the app until done.
export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('zaroda_token')) router.replace('/auth/login');
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (password !== confirm) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      const { data } = await apiClient.post('/auth/change-password', { currentPassword: current, newPassword: password });
      localStorage.setItem('zaroda_token',   data.accessToken);
      localStorage.setItem('zaroda_refresh', data.refreshToken);
      if (user) useAuth.setState({ user: { ...user, mustChangePassword: false } });
      toast.success('Password changed.');
      router.replace(homePathForRole(user?.role));
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg || 'Could not change your password.');
    } finally { setLoading(false); }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-7">
      <div className="w-12 h-12 rounded-xl bg-[#1a2e5a]/10 flex items-center justify-center mb-3">
        <Lock size={22} className="text-[#1a2e5a]"/>
      </div>
      <h1 className="text-xl font-black text-[#1a2e5a]">Change your password</h1>
      <p className="text-sm text-[#7a82a8] mt-1 mb-5">
        {user?.mustChangePassword
          ? 'You signed in with a temporary password. Choose your own to continue.'
          : 'Enter your current password, then choose a new one.'}
      </p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Current password</label>
          <input type={show ? 'text' : 'password'} required value={current} onChange={e => setCurrent(e.target.value)}
            autoComplete="current-password" className="input"/>
        </div>
        <div>
          <label className="label">New password</label>
          <div className="relative">
            <input type={show ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters" autoComplete="new-password" className="input pr-10"/>
            <button type="button" onClick={() => setShow(!show)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7a82a8] hover:text-[#1a2e5a]">
              {show ? <EyeOff size={16}/> : <Eye size={16}/>}
            </button>
          </div>
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input type={show ? 'text' : 'password'} required value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="Re-enter password" autoComplete="new-password" className="input"/>
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
          {loading ? <><Loader2 size={16} className="animate-spin"/> Saving…</> : 'Change password'}
        </button>
        <button type="button" onClick={logout} className="w-full text-sm text-[#7a82a8] hover:text-[#1a2e5a]">
          Sign out instead
        </button>
      </form>
    </div>
  );
}
