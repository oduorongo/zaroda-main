'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Users, Plus, X, Save, Trash2, Star, ShieldAlert } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

const DEPARTMENTS = [
  { v: 'teaching', label: 'Teaching' },
  { v: 'admin',    label: 'Admin' },
  { v: 'support',   label: 'Support (cooks, drivers, security, …)' },
];
const EMPLOYMENT_TYPES = [
  { v: 'permanent', label: 'Permanent' },
  { v: 'contract',  label: 'Contract' },
  { v: 'casual',    label: 'Casual' },
];

const emptyForm = {
  firstName: '', lastName: '', jobTitle: '', department: 'support', employmentType: 'permanent',
  idNumber: '', staffNumber: '', tscNumber: '', phone: '', email: '', startDate: '',
  nextOfKinName: '', nextOfKinPhone: '',
};

export default function HrStaffPage() {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null); // full record being edited, or null
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    apiClient.get('/hr/staff').then(r => setStaff(r.data || [])).catch(() => setStaff([])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }));

  const openNew = () => { setForm(emptyForm); setEditing('new'); setShowNew(true); };
  const openEdit = (s: any) => {
    setForm({
      firstName: s.firstName || '', lastName: s.lastName || '', jobTitle: s.jobTitle || '',
      department: s.department || 'support', employmentType: s.employmentType || 'permanent',
      idNumber: s.idNumber || '', staffNumber: s.staffNumber || '', tscNumber: s.tscNumber || '',
      phone: s.phone || '', email: s.email || '', startDate: (s.startDate || '').slice(0, 10),
      nextOfKinName: s.nextOfKinName || '', nextOfKinPhone: s.nextOfKinPhone || '',
    });
    setEditing(s);
    setShowNew(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) { toast.error('First and last name are required'); return; }
    setSaving(true);
    try {
      if (editing === 'new') {
        await apiClient.post('/hr/staff', form);
        toast.success('Staff record created');
      } else if (editing?.noDetailsYet) {
        // First time filling in details for an existing teaching/admin login — create
        // the hr_staff row linked to their user account.
        await apiClient.post('/hr/staff', { ...form, linkedUserId: editing.linkedUserId });
        toast.success('Employment details saved');
      } else {
        await apiClient.patch(`/hr/staff/${editing.id}`, form);
        toast.success('Staff record updated');
      }
      setShowNew(false);
      setEditing(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not save staff record');
    } finally { setSaving(false); }
  };

  const deactivate = async (s: any) => {
    if (!confirm(`Remove "${s.firstName} ${s.lastName}" from staff records? This does not delete their ZARODA login if they have one.`)) return;
    setDeactivating(s.id);
    try {
      await apiClient.delete(`/hr/staff/${s.id}`);
      toast.success('Removed');
      load();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not remove'); }
    finally { setDeactivating(null); }
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="btn-ghost p-2"><ArrowLeft size={16}/></Link>
          <div>
            <h1 className="text-2xl font-black text-theme-heading">Staff Records</h1>
            <p className="text-sm text-theme-muted">Employment details for teaching and non-teaching staff</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/hr/appraisals" className="btn-ghost text-sm"><Star size={14}/> Appraisals</Link>
          <Link href="/dashboard/hr/incidents" className="btn-ghost text-sm"><ShieldAlert size={14}/> Disciplinary</Link>
          <button onClick={openNew} className="btn-primary"><Plus size={16}/> Add Non-Teaching Staff</button>
        </div>
      </div>

      <p className="text-xs text-theme-muted bg-surface-2/60 rounded-lg px-3 py-2">
        Teachers and admins already have a ZARODA login — they show up below automatically. Use "Add Non-Teaching Staff" for cooks, drivers, security and other staff who don't need to log in.
      </p>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-theme-muted" size={24}/></div>
      ) : staff.length === 0 ? (
        <div className="card p-10 text-center text-theme-muted">No staff found.</div>
      ) : (
        <div className="card divide-y divide-theme">
          {staff.map((s: any) => (
            <div key={s.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-semibold text-theme-heading text-sm flex items-center gap-2">
                  {s.firstName} {s.lastName}
                  {s.role && <span className="badge bg-surface-2 text-theme-muted text-[10px] capitalize">{s.role.replace(/_/g,' ')}</span>}
                </div>
                <div className="text-xs text-theme-muted mt-0.5">
                  {s.noDetailsYet ? (
                    <span className="text-amber-600">No employment details yet</span>
                  ) : (
                    <>
                      {s.jobTitle || DEPARTMENTS.find(d => d.v === s.department)?.label} · {EMPLOYMENT_TYPES.find(t => t.v === s.employmentType)?.label || s.employmentType}
                      {s.phone ? ` · ${s.phone}` : ''}
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => openEdit(s)} className="btn-ghost text-xs py-1.5 px-3">
                  {s.noDetailsYet ? 'Add details' : 'Edit'}
                </button>
                {!s.noDetailsYet && (
                  <button onClick={() => deactivate(s)} disabled={deactivating === s.id} className="btn-ghost text-xs py-1.5 px-3 text-red-600">
                    {deactivating === s.id ? <Loader2 size={12} className="animate-spin"/> : <Trash2 size={12}/>}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg my-8 mt-16" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-lg font-bold text-theme-heading">
                {editing === 'new' ? 'Add Non-Teaching Staff' : `Employment Details — ${form.firstName} ${form.lastName}`}
              </h3>
              <button onClick={() => { setShowNew(false); setEditing(null); }}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-4">
              {editing === 'new' && (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">First Name *</label><input required value={form.firstName} onChange={set('firstName')} className="input"/></div>
                  <div><label className="label">Last Name *</label><input required value={form.lastName} onChange={set('lastName')} className="input"/></div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Job Title</label><input value={form.jobTitle} onChange={set('jobTitle')} className="input" placeholder="e.g. Cook, Driver, Security Guard"/></div>
                <div>
                  <label className="label">Department</label>
                  <select value={form.department} onChange={set('department')} className="input">
                    {DEPARTMENTS.map(d => <option key={d.v} value={d.v}>{d.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Employment Type</label>
                  <select value={form.employmentType} onChange={set('employmentType')} className="input">
                    {EMPLOYMENT_TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
                  </select>
                </div>
                <div><label className="label">Start Date</label><input type="date" value={form.startDate} onChange={set('startDate')} className="input"/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">National ID No.</label><input value={form.idNumber} onChange={set('idNumber')} className="input"/></div>
                <div><label className="label">Staff Number</label><input value={form.staffNumber} onChange={set('staffNumber')} className="input"/></div>
              </div>
              {form.department === 'teaching' && (
                <div><label className="label">TSC Number</label><input value={form.tscNumber} onChange={set('tscNumber')} className="input"/></div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Phone</label><input value={form.phone} onChange={set('phone')} className="input"/></div>
                <div><label className="label">Email</label><input type="email" value={form.email} onChange={set('email')} className="input"/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Next of Kin Name</label><input value={form.nextOfKinName} onChange={set('nextOfKinName')} className="input"/></div>
                <div><label className="label">Next of Kin Phone</label><input value={form.nextOfKinPhone} onChange={set('nextOfKinPhone')} className="input"/></div>
              </div>
              <div className="flex gap-3 pt-1 border-t border-theme">
                <button type="button" onClick={() => { setShowNew(false); setEditing(null); }} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? <><Loader2 size={14} className="animate-spin"/> Saving…</> : <><Save size={14}/> Save</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
