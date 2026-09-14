'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, X, Trash2 } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

const CATEGORIES = ['Conduct', 'Attendance', 'Performance', 'Policy Violation', 'Other'];
const SEVERITIES = [
  { v: 'minor',    label: 'Minor',    className: 'bg-gray-100 text-gray-700' },
  { v: 'moderate', label: 'Moderate', className: 'bg-amber-100 text-amber-700' },
  { v: 'serious',  label: 'Serious',  className: 'bg-red-100 text-red-700' },
];
const STATUSES = ['open', 'resolved', 'escalated'];
const emptyForm = { category: 'Conduct', severity: 'minor', description: '', actionTaken: '' };

export default function HrIncidentsPage() {
  const [staffList, setStaffList] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [staffKey, setStaffKey] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get('/hr/staff').catch(() => ({ data: [] })),
      apiClient.get('/hr/incidents').catch(() => ({ data: [] })),
    ]).then(([s, i]) => { setStaffList(s.data || []); setRows(i.data || []); }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const staffOptions = staffList.filter((s: any) => !s.noDetailsYet || s.linkedUserId);
  const keyFor = (s: any) => s.linkedUserId ? `user:${s.linkedUserId}` : `hr:${s.id}`;

  const openNew = () => { setForm(emptyForm); setStaffKey(''); setShowNew(true); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffKey) { toast.error('Select a staff member'); return; }
    if (!form.description.trim()) { toast.error('Describe the incident'); return; }
    setSaving(true);
    try {
      const [type, id] = staffKey.split(':');
      await apiClient.post('/hr/incidents', { ...form, staffUserId: type === 'user' ? id : undefined, hrStaffId: type === 'hr' ? id : undefined });
      toast.success('Incident recorded');
      setShowNew(false);
      load();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not save incident'); }
    finally { setSaving(false); }
  };

  const setStatus = async (id: string, status: string) => {
    setUpdating(id);
    try { await apiClient.patch(`/hr/incidents/${id}`, { status }); load(); }
    catch { toast.error('Could not update status'); }
    finally { setUpdating(null); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this record?')) return;
    try { await apiClient.delete(`/hr/incidents/${id}`); toast.success('Deleted'); load(); }
    catch { toast.error('Could not delete'); }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/hr/staff" className="btn-ghost p-2"><ArrowLeft size={16}/></Link>
          <div>
            <h1 className="text-2xl font-black text-theme-heading">Staff Disciplinary Records</h1>
            <p className="text-sm text-theme-muted">Visible only to HOI/administrators</p>
          </div>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus size={16}/> Log Incident</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-theme-muted" size={24}/></div>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center text-theme-muted">No incidents recorded.</div>
      ) : (
        <div className="card divide-y divide-theme">
          {rows.map((r: any) => (
            <div key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-theme-heading text-sm">{r.staffName}</span>
                    <span className="badge bg-surface-2 text-theme-muted text-[10px]">{r.category}</span>
                    <span className={`badge text-[10px] ${SEVERITIES.find(s => s.v === r.severity)?.className || ''}`}>{r.severity}</span>
                    <select value={r.status} onChange={e => setStatus(r.id, e.target.value)} disabled={updating === r.id}
                      className="text-[10px] uppercase bg-surface-2 rounded-lg px-1.5 py-0.5 border-0 text-theme-muted">
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <p className="text-sm text-theme mt-1.5">{r.description}</p>
                  {r.actionTaken && <p className="text-sm text-theme-muted mt-1"><b>Action taken:</b> {r.actionTaken}</p>}
                  <p className="text-xs text-theme-muted mt-1.5">Reported by {r.reportedByName} · {r.reportedAt}</p>
                </div>
                <button onClick={() => remove(r.id)} className="btn-ghost text-xs py-1.5 px-2 text-red-600 flex-shrink-0"><Trash2 size={13}/></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg my-8 mt-16" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-lg font-bold text-theme-heading">Log Incident</h3>
              <button onClick={() => setShowNew(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-4">
              <div>
                <label className="label">Staff Member *</label>
                <select required value={staffKey} onChange={e => setStaffKey(e.target.value)} className="input">
                  <option value="">Select…</option>
                  {staffOptions.map((s: any) => (
                    <option key={keyFor(s)} value={keyFor(s)}>{s.firstName} {s.lastName}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="input">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Severity</label>
                  <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))} className="input">
                    {SEVERITIES.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="label">Description *</label><textarea required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input resize-y" rows={3}/></div>
              <div><label className="label">Action Taken</label><textarea value={form.actionTaken} onChange={e => setForm(f => ({ ...f, actionTaken: e.target.value }))} className="input resize-y" rows={2}/></div>
              <div className="flex gap-3 pt-1 border-t border-theme">
                <button type="button" onClick={() => setShowNew(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? <Loader2 size={14} className="animate-spin"/> : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
