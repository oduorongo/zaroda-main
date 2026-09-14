'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, X, Copy, Check, Trash2, Users, ChevronRight } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

const DEPARTMENTS = [
  { v: 'teaching', label: 'Teaching' },
  { v: 'admin',    label: 'Admin' },
  { v: 'support',  label: 'Support' },
];
const EMPLOYMENT_TYPES = [
  { v: 'permanent', label: 'Permanent' },
  { v: 'contract',  label: 'Contract' },
  { v: 'casual',    label: 'Casual' },
];
const APP_STATUSES = ['new', 'shortlisted', 'interviewed', 'offered', 'rejected', 'hired'];
const APP_STATUS_CONF: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700', shortlisted: 'bg-amber-100 text-amber-700',
  interviewed: 'bg-purple-100 text-purple-700', offered: 'bg-cyan-100 text-cyan-700',
  rejected: 'bg-red-100 text-red-700', hired: 'bg-green-100 text-green-700',
};
const emptyForm = { title: '', department: 'teaching', employmentType: 'permanent', location: '', description: '', requirements: '', closesOn: '' };

export default function HrJobsPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openJob, setOpenJob] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    apiClient.get('/hr/jobs').then(r => setJobs(r.data || [])).catch(() => setJobs([])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const careersUrl = (typeof window !== 'undefined' ? window.location.origin : '') + `/careers/${user?.tenantId}`;
  const copyLink = () => {
    navigator.clipboard?.writeText(careersUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('Enter a job title'); return; }
    setSaving(true);
    try {
      await apiClient.post('/hr/jobs', form);
      toast.success('Job posting created');
      setShowNew(false);
      setForm(emptyForm);
      load();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not create job posting'); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (job: any) => {
    const next = job.status === 'open' ? 'closed' : 'open';
    try {
      await apiClient.patch(`/hr/jobs/${job.id}`, { status: next });
      toast.success(next === 'open' ? 'Reopened' : 'Closed');
      load();
    } catch { toast.error('Could not update'); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this job posting and all its applications?')) return;
    try { await apiClient.delete(`/hr/jobs/${id}`); toast.success('Deleted'); load(); }
    catch { toast.error('Could not delete'); }
  };

  const openApplications = async (job: any) => {
    setOpenJob(job);
    setLoadingApps(true);
    try {
      const { data } = await apiClient.get(`/hr/jobs/${job.id}/applications`);
      setApplications(data || []);
    } catch { setApplications([]); }
    finally { setLoadingApps(false); }
  };

  const setAppStatus = async (appId: string, status: string) => {
    setUpdating(appId);
    try {
      await apiClient.patch(`/hr/applications/${appId}`, { status });
      setApplications(rows => rows.map(r => r.id === appId ? { ...r, status } : r));
    } catch { toast.error('Could not update'); }
    finally { setUpdating(null); }
  };

  const removeApplication = async (appId: string) => {
    if (!confirm('Delete this application?')) return;
    try {
      await apiClient.delete(`/hr/applications/${appId}`);
      setApplications(rows => rows.filter(r => r.id !== appId));
    } catch { toast.error('Could not delete'); }
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/hr/staff" className="btn-ghost p-2"><ArrowLeft size={16}/></Link>
          <div>
            <h1 className="text-2xl font-black text-theme-heading">Recruitment</h1>
            <p className="text-sm text-theme-muted">Post vacancies and track applicants</p>
          </div>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary"><Plus size={16}/> New Job Posting</button>
      </div>

      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <span className="text-sm text-theme-muted">Public careers page — share this link so candidates can apply:</span>
        <code className="text-xs bg-surface-2 px-2 py-1 rounded-lg flex-1 min-w-0 truncate">{careersUrl}</code>
        <button onClick={copyLink} className="btn-ghost text-xs py-1.5 px-2">
          {copied ? <><Check size={12}/> Copied</> : <><Copy size={12}/> Copy</>}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-theme-muted" size={24}/></div>
      ) : jobs.length === 0 ? (
        <div className="card p-10 text-center text-theme-muted">No job postings yet.</div>
      ) : (
        <div className="card divide-y divide-theme">
          {jobs.map((j: any) => (
            <div key={j.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <button onClick={() => openApplications(j)} className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-theme-heading text-sm">{j.title}</span>
                  <span className={`badge text-[10px] ${j.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{j.status}</span>
                </div>
                <div className="text-xs text-theme-muted mt-0.5 flex items-center gap-1">
                  <Users size={11}/> {j.applicationCount} applicant{j.applicationCount === '1' ? '' : 's'} · {DEPARTMENTS.find(d => d.v === j.department)?.label}
                  {j.location ? ` · ${j.location}` : ''}
                </div>
              </button>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => toggleStatus(j)} className="btn-ghost text-xs py-1.5 px-2">{j.status === 'open' ? 'Close' : 'Reopen'}</button>
                <button onClick={() => openApplications(j)} className="btn-ghost text-xs py-1.5 px-2"><ChevronRight size={13}/></button>
                <button onClick={() => remove(j.id)} className="btn-ghost text-xs py-1.5 px-2 text-red-600"><Trash2 size={13}/></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg my-8 mt-16" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-lg font-bold text-theme-heading">New Job Posting</h3>
              <button onClick={() => setShowNew(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-4">
              <div><label className="label">Job Title *</label><input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="input" placeholder="e.g. Grade 5 Class Teacher"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Department</label>
                  <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} className="input">
                    {DEPARTMENTS.map(d => <option key={d.v} value={d.v}>{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Employment Type</label>
                  <select value={form.employmentType} onChange={e => setForm(f => ({ ...f, employmentType: e.target.value }))} className="input">
                    {EMPLOYMENT_TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Location</label><input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className="input" placeholder="Optional"/></div>
                <div><label className="label">Closes On</label><input type="date" value={form.closesOn} onChange={e => setForm(f => ({ ...f, closesOn: e.target.value }))} className="input"/></div>
              </div>
              <div><label className="label">Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input resize-y" rows={3}/></div>
              <div><label className="label">Requirements</label><textarea value={form.requirements} onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))} className="input resize-y" rows={3}/></div>
              <div className="flex gap-3 pt-1 border-t border-theme">
                <button type="button" onClick={() => setShowNew(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? <Loader2 size={14} className="animate-spin"/> : 'Post Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {openJob && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-2xl my-8 mt-16" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-lg font-bold text-theme-heading">Applicants — {openJob.title}</h3>
              <button onClick={() => setOpenJob(null)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <div className="p-5 space-y-2 max-h-[70vh] overflow-y-auto">
              {loadingApps ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-theme-muted" size={20}/></div>
              ) : applications.length === 0 ? (
                <p className="text-sm text-theme-muted text-center py-8">No applications yet.</p>
              ) : applications.map((a: any) => (
                <div key={a.id} className="card p-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-semibold text-theme-heading text-sm">{a.applicantName}</div>
                      <div className="text-xs text-theme-muted">{a.applicantEmail}{a.applicantPhone ? ` · ${a.applicantPhone}` : ''}</div>
                      {a.coverNote && <p className="text-sm text-theme mt-1.5">{a.coverNote}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <select value={a.status} onChange={e => setAppStatus(a.id, e.target.value)} disabled={updating === a.id}
                        className={`text-xs rounded-lg px-2 py-1 border-0 ${APP_STATUS_CONF[a.status] || 'bg-surface-2'}`}>
                        {APP_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button onClick={() => removeApplication(a.id)} className="text-theme-muted hover:text-red-600"><Trash2 size={13}/></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
