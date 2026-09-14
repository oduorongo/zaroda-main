// app/careers/[tenantId]/page.tsx — Public careers page (no login required).
// A school shares this link so external candidates can browse open
// vacancies and apply. Mirrors app/retooling/page.tsx: own header/footer,
// explicit light colors (the site defaults every visitor to dark mode —
// see app/layout.tsx — and this is public marketing surface, always light).
'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Briefcase, Loader2, ArrowLeft, MapPin, Send, CheckCircle } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

export default function PublicCareersPage() {
  const params = useParams();
  const tenantId = String(params?.tenantId || '');
  const [schoolName, setSchoolName] = useState('');
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyJob, setApplyJob] = useState<any>(null);
  const [form, setForm] = useState({ applicantName: '', applicantEmail: '', applicantPhone: '', coverNote: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    apiClient.get(`/public/careers/${tenantId}`)
      .then(r => { setSchoolName(r.data?.schoolName || ''); setJobs(r.data?.jobs || []); })
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const openApply = (job: any) => {
    setApplyJob(job);
    setSubmitted(false);
    setForm({ applicantName: '', applicantEmail: '', applicantPhone: '', coverNote: '' });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.applicantName.trim()) { toast.error('Enter your name'); return; }
    if (!form.applicantEmail.trim() && !form.applicantPhone.trim()) { toast.error('Enter an email or phone number'); return; }
    setSubmitting(true);
    try {
      await apiClient.post(`/public/careers/${tenantId}/${applyJob.id}/apply`, form);
      setSubmitted(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not submit application');
    } finally { setSubmitting(false); }
  };

  return (
    <div style={{ background: '#f7f8fb', minHeight: '100vh', color: '#1a2e5a' }}>
      <header style={{ background: '#0f1c38' }} className="px-4 sm:px-8 py-4 flex items-center gap-3">
        <Link href="/" className="text-white/80 hover:text-white flex items-center gap-1.5 text-sm">
          <ArrowLeft size={15}/> ZARODA
        </Link>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-10">
        <div className="flex items-center gap-2 mb-1">
          <Briefcase size={20} style={{ color: '#f5820a' }}/>
          <h1 className="text-2xl font-black">Careers{schoolName ? ` at ${schoolName}` : ''}</h1>
        </div>
        <p className="text-sm" style={{ color: '#5a6a8a' }}>Open positions — apply directly below, no account needed.</p>

        <div className="mt-6 space-y-3">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={24} style={{ color: '#5a6a8a' }}/></div>
          ) : jobs.length === 0 ? (
            <div className="rounded-2xl p-10 text-center" style={{ background: '#fff', border: '1px solid #e2e6f0' }}>
              <p style={{ color: '#5a6a8a' }}>No open positions right now — check back later.</p>
            </div>
          ) : jobs.map((j: any) => (
            <div key={j.id} className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e2e6f0' }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-bold text-lg">{j.title}</h2>
                  <div className="flex items-center gap-3 text-sm mt-1" style={{ color: '#5a6a8a' }}>
                    <span className="capitalize">{j.department} · {j.employmentType}</span>
                    {j.location && <span className="flex items-center gap-1"><MapPin size={12}/> {j.location}</span>}
                  </div>
                </div>
                <button onClick={() => openApply(j)}
                  className="px-4 py-2 rounded-xl font-semibold text-sm text-white flex items-center gap-1.5 flex-shrink-0"
                  style={{ background: '#f5820a' }}>
                  <Send size={14}/> Apply
                </button>
              </div>
              {j.description && <p className="text-sm mt-3" style={{ color: '#33415e' }}>{j.description}</p>}
              {j.requirements && (
                <div className="mt-2 text-sm" style={{ color: '#33415e' }}>
                  <b>Requirements:</b> {j.requirements}
                </div>
              )}
              {j.closesOn && <p className="text-xs mt-2" style={{ color: '#5a6a8a' }}>Applications close {new Date(j.closesOn).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
            </div>
          ))}
        </div>
      </div>

      {applyJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,28,56,0.6)' }} onClick={() => setApplyJob(null)}>
          <div className="rounded-2xl w-full max-w-md" style={{ background: '#fff' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid #e2e6f0' }}>
              <h3 className="font-bold">Apply — {applyJob.title}</h3>
              <button onClick={() => setApplyJob(null)} style={{ color: '#5a6a8a' }}>✕</button>
            </div>
            {submitted ? (
              <div className="p-8 text-center">
                <CheckCircle size={36} className="mx-auto mb-2" style={{ color: '#16a34a' }}/>
                <p className="font-semibold">Application submitted</p>
                <p className="text-sm mt-1" style={{ color: '#5a6a8a' }}>The school will reach out if you're shortlisted.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="p-5 space-y-3">
                <div>
                  <label className="text-xs font-semibold" style={{ color: '#33415e' }}>Full Name *</label>
                  <input required value={form.applicantName} onChange={e => setForm(f => ({ ...f, applicantName: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 rounded-xl text-sm" style={{ border: '1px solid #e2e6f0' }}/>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold" style={{ color: '#33415e' }}>Email</label>
                    <input type="email" value={form.applicantEmail} onChange={e => setForm(f => ({ ...f, applicantEmail: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 rounded-xl text-sm" style={{ border: '1px solid #e2e6f0' }}/>
                  </div>
                  <div>
                    <label className="text-xs font-semibold" style={{ color: '#33415e' }}>Phone</label>
                    <input value={form.applicantPhone} onChange={e => setForm(f => ({ ...f, applicantPhone: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 rounded-xl text-sm" style={{ border: '1px solid #e2e6f0' }}/>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold" style={{ color: '#33415e' }}>Cover Note</label>
                  <textarea value={form.coverNote} onChange={e => setForm(f => ({ ...f, coverNote: e.target.value }))} rows={4}
                    className="w-full mt-1 px-3 py-2 rounded-xl text-sm resize-y" style={{ border: '1px solid #e2e6f0' }}
                    placeholder="Tell them why you're a good fit…"/>
                </div>
                <button type="submit" disabled={submitting}
                  className="w-full py-2.5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-1.5"
                  style={{ background: '#f5820a' }}>
                  {submitting ? <Loader2 size={15} className="animate-spin"/> : <Send size={15}/>} Submit Application
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
