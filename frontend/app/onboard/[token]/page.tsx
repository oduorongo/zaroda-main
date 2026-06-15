// app/onboard/[token]/page.tsx
// Public page: a teacher self-onboards into a school via an admin's link.
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle, XCircle, GraduationCap, Copy, Check } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { LEARNING_AREAS } from '@/lib/cbc/constants';

const ALL_SUBJECTS = Array.from(new Set(Object.values(LEARNING_AREAS).flat())).sort();

export default function OnboardPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [status, setStatus]   = useState<'loading'|'valid'|'invalid'>('loading');
  const [schoolName, setSchoolName] = useState('');
  const [reason, setReason]   = useState('');
  const [form, setForm] = useState({ fullName:'', email:'', phone:'', role:'subject_teacher', subjects:[] as string[] });
  const [saving, setSaving]   = useState(false);
  const [done, setDone]       = useState<any>(null);
  const [copied, setCopied]   = useState(false);

  useEffect(() => {
    apiClient.get(`/teacher-onboard/validate/${params.token}`)
      .then(r => {
        if (r.data?.valid) { setSchoolName(r.data.schoolName || 'this school'); setStatus('valid'); }
        else { setReason(r.data?.reason || 'This link is invalid.'); setStatus('invalid'); }
      })
      .catch(() => { setReason('This link is invalid or has expired.'); setStatus('invalid'); });
  }, [params.token]);

  const toggleSubject = (s: string) =>
    setForm(f => ({ ...f, subjects: f.subjects.includes(s) ? f.subjects.filter(x=>x!==s) : [...f.subjects, s] }));

  const submit = async () => {
    if (form.fullName.trim().split(/\s+/).length < 2) return alert('Enter your first and last name');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return alert('Enter a valid email');
    if (form.subjects.length === 0) return alert('Select at least one learning area you teach');
    setSaving(true);
    try {
      const res = await apiClient.post('/teacher-onboard/accept', { token: params.token, ...form });
      setDone(res.data);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not create your account');
    } finally { setSaving(false); }
  };

  const copyCreds = () => {
    if (!done?.credentials) return;
    navigator.clipboard?.writeText(`Username: ${done.credentials.username}\nPassword: ${done.credentials.password}`);
    setCopied(true); setTimeout(()=>setCopied(false), 1500);
  };

  if (status === 'loading') return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="animate-spin text-teal-600" size={28}/>
    </div>
  );

  if (status === 'invalid') return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card p-8 max-w-md text-center">
        <XCircle className="mx-auto text-red-500 mb-3" size={40}/>
        <h1 className="text-xl font-black text-theme-heading mb-1">Link unavailable</h1>
        <p className="text-sm text-theme-muted mb-4">{reason}</p>
        <Link href="/auth/login" className="btn-ghost">Go to login</Link>
      </div>
    </div>
  );

  if (done) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card p-8 max-w-md w-full text-center">
        <CheckCircle className="mx-auto text-green-500 mb-3" size={40}/>
        <h1 className="text-xl font-black text-theme-heading mb-1">You're in!</h1>
        <p className="text-sm text-theme-muted mb-4">Your account at {done.schoolName} is ready. Save these login details — you'll set a new password on first login.</p>
        <div className="bg-surface-2 rounded-xl p-4 text-sm text-left space-y-2 mb-4">
          <div className="flex justify-between gap-3"><span className="text-theme-muted">Username</span><span className="font-mono font-semibold break-all">{done.credentials.username}</span></div>
          <div className="flex justify-between gap-3"><span className="text-theme-muted">Password</span><span className="font-mono font-semibold">{done.credentials.password}</span></div>
        </div>
        <div className="flex gap-2">
          <button onClick={copyCreds} className="btn-ghost flex-1">{copied ? <><Check size={16}/> Copied</> : <><Copy size={16}/> Copy</>}</button>
          <button onClick={()=>router.push('/auth/login')} className="btn-primary flex-1">Log in</button>
        </div>
      </div>
    </div>
  );

  const inp = 'w-full rounded-lg border border-theme bg-surface px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-teal-600';
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface-2">
      <div className="card p-6 max-w-lg w-full">
        <div className="flex items-center gap-2 mb-1">
          <GraduationCap className="text-teal-600" size={22}/>
          <h1 className="text-xl font-black text-theme-heading">Join {schoolName}</h1>
        </div>
        <p className="text-sm text-theme-muted mb-5">Set up your teacher account. It takes about a minute.</p>

        <div className="space-y-3">
          <div>
            <label className="label">Full Name *</label>
            <input value={form.fullName} onChange={e=>setForm(f=>({...f,fullName:e.target.value}))} className={inp} placeholder="e.g. Jane Wanjiku Kamau"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Email *</label><input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} className={inp} placeholder="you@example.com"/></div>
            <div><label className="label">Phone</label><input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} className={inp} placeholder="07…"/></div>
          </div>
          <div>
            <label className="label">Role</label>
            <select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} className={inp}>
              <option value="subject_teacher">Subject Teacher</option>
              <option value="class_teacher">Class Teacher</option>
              <option value="overall_class_teacher">Overall Class Teacher</option>
            </select>
          </div>
          <div>
            <label className="label">Learning Areas You Teach *</label>
            <div className="flex flex-wrap gap-1.5 max-h-44 overflow-auto p-1">
              {ALL_SUBJECTS.map(s => (
                <button key={s} type="button" onClick={()=>toggleSubject(s)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    form.subjects.includes(s) ? 'bg-teal-600 text-white border-transparent' : 'bg-surface-2 text-theme-muted border-theme'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button onClick={submit} disabled={saving} className="btn-primary w-full mt-5 justify-center">
          {saving ? <><Loader2 size={16} className="animate-spin"/> Creating your account…</> : 'Create My Account'}
        </button>
        <p className="text-center text-xs text-theme-muted mt-3">Already have an account? <Link href="/auth/login" className="text-teal-600">Log in</Link></p>
      </div>
    </div>
  );
}
