'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, X, Star, Pencil, Trash2 } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

const emptyForm = { period: '', rating: 3, goals: '', strengths: '', areasForImprovement: '', comments: '' };

export default function HrAppraisalsPage() {
  const [staffList, setStaffList] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [staffKey, setStaffKey] = useState(''); // linkedUserId or hr_staff id, prefixed to disambiguate
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get('/hr/staff').catch(() => ({ data: [] })),
      apiClient.get('/hr/appraisals').catch(() => ({ data: [] })),
    ]).then(([s, a]) => { setStaffList(s.data || []); setRows(a.data || []); }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const staffOptions = staffList.filter((s: any) => !s.noDetailsYet || s.linkedUserId);
  const keyFor = (s: any) => s.linkedUserId ? `user:${s.linkedUserId}` : `hr:${s.id}`;

  const openNew = () => { setEditing(null); setForm(emptyForm); setStaffKey(''); setShowNew(true); };
  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      period: r.period || '', rating: r.rating || 3, goals: r.goals || '',
      strengths: r.strengths || '', areasForImprovement: r.areasForImprovement || '', comments: r.comments || '',
    });
    setShowNew(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing && !staffKey) { toast.error('Select a staff member'); return; }
    if (!form.period.trim()) { toast.error('Enter the review period'); return; }
    setSaving(true);
    try {
      if (editing) {
        await apiClient.patch(`/hr/appraisals/${editing.id}`, form);
        toast.success('Appraisal updated');
      } else {
        const [type, id] = staffKey.split(':');
        await apiClient.post('/hr/appraisals', { ...form, staffUserId: type === 'user' ? id : undefined, hrStaffId: type === 'hr' ? id : undefined });
        toast.success('Appraisal recorded');
      }
      setShowNew(false);
      load();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not save appraisal'); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this appraisal record?')) return;
    try { await apiClient.delete(`/hr/appraisals/${id}`); toast.success('Deleted'); load(); }
    catch { toast.error('Could not delete'); }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/hr/staff" className="btn-ghost p-2"><ArrowLeft size={16}/></Link>
          <div>
            <h1 className="text-2xl font-black text-theme-heading">Staff Appraisals</h1>
            <p className="text-sm text-theme-muted">Periodic performance reviews for staff</p>
          </div>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus size={16}/> New Appraisal</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-theme-muted" size={24}/></div>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center text-theme-muted">No appraisals recorded yet.</div>
      ) : (
        <div className="card divide-y divide-theme">
          {rows.map((r: any) => (
            <div key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-theme-heading text-sm">{r.staffName}</span>
                    <span className="badge bg-surface-2 text-theme-muted text-[10px]">{r.period}</span>
                    {r.rating && (
                      <span className="flex items-center gap-0.5">
                        {[1,2,3,4,5].map(n => <Star key={n} size={12} className={n <= r.rating ? 'fill-[#d4af37] text-[#d4af37]' : 'text-theme-muted'}/>)}
                      </span>
                    )}
                  </div>
                  {r.goals && <p className="text-sm text-theme mt-1.5"><b>Goals:</b> {r.goals}</p>}
                  {r.strengths && <p className="text-sm text-theme mt-1"><b>Strengths:</b> {r.strengths}</p>}
                  {r.areasForImprovement && <p className="text-sm text-theme mt-1"><b>Areas for improvement:</b> {r.areasForImprovement}</p>}
                  {r.comments && <p className="text-sm text-theme-muted mt-1">{r.comments}</p>}
                  <p className="text-xs text-theme-muted mt-1.5">Reviewed by {r.reviewedByName}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => openEdit(r)} className="btn-ghost text-xs py-1.5 px-2"><Pencil size={13}/></button>
                  <button onClick={() => remove(r.id)} className="btn-ghost text-xs py-1.5 px-2 text-red-600"><Trash2 size={13}/></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg my-8 mt-16" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-lg font-bold text-theme-heading">{editing ? `Edit Appraisal — ${editing.staffName}` : 'New Appraisal'}</h3>
              <button onClick={() => setShowNew(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-4">
              {!editing && (
                <div>
                  <label className="label">Staff Member *</label>
                  <select required value={staffKey} onChange={e => setStaffKey(e.target.value)} className="input">
                    <option value="">Select…</option>
                    {staffOptions.map((s: any) => (
                      <option key={keyFor(s)} value={keyFor(s)}>{s.firstName} {s.lastName}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="label">Review Period *</label>
                <input required value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} className="input" placeholder="e.g. Term 1 2026"/>
              </div>
              <div>
                <label className="label">Rating</label>
                <div className="flex items-center gap-1">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} type="button" onClick={() => setForm(f => ({ ...f, rating: n }))}>
                      <Star size={22} className={n <= form.rating ? 'fill-[#d4af37] text-[#d4af37]' : 'text-theme-muted'}/>
                    </button>
                  ))}
                </div>
              </div>
              <div><label className="label">Goals</label><textarea value={form.goals} onChange={e => setForm(f => ({ ...f, goals: e.target.value }))} className="input resize-y" rows={2}/></div>
              <div><label className="label">Strengths</label><textarea value={form.strengths} onChange={e => setForm(f => ({ ...f, strengths: e.target.value }))} className="input resize-y" rows={2}/></div>
              <div><label className="label">Areas for Improvement</label><textarea value={form.areasForImprovement} onChange={e => setForm(f => ({ ...f, areasForImprovement: e.target.value }))} className="input resize-y" rows={2}/></div>
              <div><label className="label">Comments</label><textarea value={form.comments} onChange={e => setForm(f => ({ ...f, comments: e.target.value }))} className="input resize-y" rows={2}/></div>
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
