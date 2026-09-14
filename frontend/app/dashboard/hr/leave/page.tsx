'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, X, CalendarClock, Check, Trash2 } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, isHoi } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

const LEAVE_TYPES = ['Annual', 'Sick', 'Maternity', 'Paternity', 'Compassionate', 'Study', 'Unpaid'];
const STATUS_CONF: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};
const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export default function HrLeavePage() {
  const { user } = useAuth();
  const admin = isHoi(user?.role || '');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ leaveType: 'Annual', startDate: '', endDate: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    apiClient.get('/hr/leave', { params: admin && statusFilter ? { status: statusFilter } : {} })
      .then(r => setRows(r.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [statusFilter]);

  const days = (() => {
    if (!form.startDate || !form.endDate) return 0;
    const s = new Date(form.startDate), e = new Date(form.endDate);
    if (e < s) return 0;
    return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  })();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.startDate || !form.endDate) { toast.error('Start and end date are required'); return; }
    setSaving(true);
    try {
      await apiClient.post('/hr/leave', form);
      toast.success('Leave request submitted');
      setShowNew(false);
      setForm({ leaveType: 'Annual', startDate: '', endDate: '', reason: '' });
      load();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not submit leave request'); }
    finally { setSaving(false); }
  };

  const review = async (id: string, action: 'approved' | 'rejected') => {
    setReviewing(id);
    try {
      await apiClient.patch(`/hr/leave/${id}/review`, { action });
      toast.success(action === 'approved' ? 'Approved' : 'Rejected');
      load();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not update'); }
    finally { setReviewing(null); }
  };

  const cancel = async (row: any) => {
    if (!confirm('Cancel this leave request?')) return;
    try {
      await apiClient.delete(`/hr/leave/${row.id}`);
      toast.success('Cancelled');
      load();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not cancel'); }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="btn-ghost p-2"><ArrowLeft size={16}/></Link>
          <div>
            <h1 className="text-2xl font-black text-theme-heading">{admin ? 'Leave' : 'My Leave'}</h1>
            <p className="text-sm text-theme-muted">{admin ? 'Review and approve staff leave requests' : 'Apply for leave and track your requests'}</p>
          </div>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary"><Plus size={16}/> Apply for Leave</button>
      </div>

      {admin && (
        <div className="flex gap-1.5">
          {[['', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(([v, label]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${statusFilter===v ? 'bg-[#1a2e5a] text-white' : 'bg-surface-2 text-theme-muted'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-theme-muted" size={24}/></div>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center">
          <CalendarClock size={32} className="mx-auto text-theme-muted opacity-40 mb-2"/>
          <p className="text-theme-muted">No leave requests{statusFilter ? ` (${statusFilter})` : ''} yet.</p>
        </div>
      ) : (
        <div className="card divide-y divide-theme">
          {rows.map((r: any) => (
            <div key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {admin && <span className="font-semibold text-theme-heading text-sm">{r.staffName}</span>}
                    <span className="badge bg-surface-2 text-theme-muted text-[10px]">{r.leaveType}</span>
                    <span className={`badge ${STATUS_CONF[r.status] || ''} text-[10px] uppercase`}>{r.status}</span>
                  </div>
                  <p className="text-sm text-theme-muted mt-1">
                    {fmt(r.startDate)} – {fmt(r.endDate)} · {r.days} day{r.days === 1 ? '' : 's'}
                  </p>
                  {r.reason && <p className="text-sm text-theme mt-1">{r.reason}</p>}
                  {r.status !== 'pending' && r.reviewedByName && (
                    <p className="text-xs text-theme-muted mt-1">
                      {r.status === 'approved' ? 'Approved' : 'Rejected'} by {r.reviewedByName}
                      {r.reviewComment ? ` — ${r.reviewComment}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {admin && r.status === 'pending' && (
                    <>
                      <button onClick={() => review(r.id, 'approved')} disabled={reviewing === r.id} className="text-xs bg-green-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-green-700">
                        <Check size={12}/>
                      </button>
                      <button onClick={() => review(r.id, 'rejected')} disabled={reviewing === r.id} className="text-xs bg-red-100 text-red-700 px-2.5 py-1.5 rounded-lg hover:bg-red-200">
                        <X size={12}/>
                      </button>
                    </>
                  )}
                  {(admin || r.status === 'pending') && (
                    <button onClick={() => cancel(r)} className="text-xs text-theme-muted hover:text-red-600 px-2 py-1.5">
                      <Trash2 size={12}/>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-lg font-bold text-theme-heading">Apply for Leave</h3>
              <button onClick={() => setShowNew(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-4">
              <div>
                <label className="label">Leave Type</label>
                <select value={form.leaveType} onChange={e => setForm(f => ({ ...f, leaveType: e.target.value }))} className="input">
                  {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Start Date *</label><input required type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="input"/></div>
                <div><label className="label">End Date *</label><input required type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} className="input"/></div>
              </div>
              {days > 0 && <p className="text-xs text-theme-muted">{days} day{days === 1 ? '' : 's'}</p>}
              <div>
                <label className="label">Reason</label>
                <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className="input resize-y" rows={3}/>
              </div>
              <div className="flex gap-3 pt-1 border-t border-theme">
                <button type="button" onClick={() => setShowNew(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? <Loader2 size={14} className="animate-spin"/> : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
