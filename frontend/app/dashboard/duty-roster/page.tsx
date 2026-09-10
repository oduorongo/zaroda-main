'use client';
import { useState, useEffect } from 'react';
import { CalendarDays, ClipboardList, Plus, X, Loader2, Trash2, Pencil } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, isHoi } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

const CATEGORIES = [
  { value: 'academic',  label: 'Academic',   className: 'bg-blue-100 text-blue-700' },
  { value: 'sports',    label: 'Sports',     className: 'bg-green-100 text-green-700' },
  { value: 'holiday',   label: 'Holiday',    className: 'bg-amber-100 text-amber-700' },
  { value: 'meeting',   label: 'Meeting',    className: 'bg-purple-100 text-purple-700' },
  { value: 'other',     label: 'Other',      className: 'bg-gray-100 text-gray-700' },
];
const categoryConf = (v: string) => CATEGORIES.find(c => c.value === v) || CATEGORIES[CATEGORIES.length - 1];

const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';

export default function DutyRosterPage() {
  const { user } = useAuth();
  const admin = isHoi(user?.role || '');

  const [tab, setTab] = useState<'duties' | 'activities'>('duties');
  const [loading, setLoading] = useState(true);
  const [duties, setDuties] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);

  const [showDutyForm, setShowDutyForm] = useState(false);
  const [editingDuty, setEditingDuty] = useState<any>(null);
  const [dutyForm, setDutyForm] = useState({ teacherId: '', dutyName: '', location: '', startDate: '', endDate: '', notes: '' });
  const [savingDuty, setSavingDuty] = useState(false);

  const [showActivityForm, setShowActivityForm] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any>(null);
  const [activityForm, setActivityForm] = useState({ title: '', description: '', category: 'other', startDate: '', endDate: '', startTime: '', endTime: '', location: '' });
  const [savingActivity, setSavingActivity] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get('/duty-roster/duties').catch(() => ({ data: [] })),
      apiClient.get('/duty-roster/activities').catch(() => ({ data: [] })),
    ]).then(([d, a]) => { setDuties(d.data || []); setActivities(a.data || []); }).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    if (admin) apiClient.get('/academic/teachers').then(r => setTeachers(r.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  // ── Duty roster ──────────────────────────────────────────
  const openNewDuty = () => {
    setEditingDuty(null);
    setDutyForm({ teacherId: '', dutyName: '', location: '', startDate: '', endDate: '', notes: '' });
    setShowDutyForm(true);
  };
  const openEditDuty = (d: any) => {
    setEditingDuty(d);
    setDutyForm({
      teacherId: d.teacherId || '', dutyName: d.dutyName || '', location: d.location || '',
      startDate: (d.startDate || '').slice(0, 10), endDate: (d.endDate || '').slice(0, 10), notes: d.notes || '',
    });
    setShowDutyForm(true);
  };
  const saveDuty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dutyForm.teacherId || !dutyForm.dutyName || !dutyForm.startDate) {
      toast.error('Teacher, duty name and start date are required.'); return;
    }
    setSavingDuty(true);
    try {
      if (editingDuty) await apiClient.patch(`/duty-roster/duties/${editingDuty.id}`, dutyForm);
      else await apiClient.post('/duty-roster/duties', dutyForm);
      toast.success(editingDuty ? 'Duty updated.' : 'Duty assigned.');
      setShowDutyForm(false);
      load();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not save duty.'); }
    finally { setSavingDuty(false); }
  };
  const deleteDuty = async (id: string) => {
    if (!confirm('Remove this duty assignment?')) return;
    try { await apiClient.delete(`/duty-roster/duties/${id}`); toast.success('Duty removed.'); load(); }
    catch { toast.error('Could not remove duty.'); }
  };

  // ── Activities calendar ──────────────────────────────────
  const openNewActivity = () => {
    setEditingActivity(null);
    setActivityForm({ title: '', description: '', category: 'other', startDate: '', endDate: '', startTime: '', endTime: '', location: '' });
    setShowActivityForm(true);
  };
  const openEditActivity = (a: any) => {
    setEditingActivity(a);
    setActivityForm({
      title: a.title || '', description: a.description || '', category: a.category || 'other',
      startDate: (a.startDate || '').slice(0, 10), endDate: (a.endDate || '').slice(0, 10),
      startTime: a.startTime || '', endTime: a.endTime || '', location: a.location || '',
    });
    setShowActivityForm(true);
  };
  const saveActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activityForm.title || !activityForm.startDate) { toast.error('Title and start date are required.'); return; }
    setSavingActivity(true);
    try {
      if (editingActivity) await apiClient.patch(`/duty-roster/activities/${editingActivity.id}`, activityForm);
      else await apiClient.post('/duty-roster/activities', activityForm);
      toast.success(editingActivity ? 'Activity updated.' : 'Activity added.');
      setShowActivityForm(false);
      load();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not save activity.'); }
    finally { setSavingActivity(false); }
  };
  const deleteActivity = async (id: string) => {
    if (!confirm('Remove this activity?')) return;
    try { await apiClient.delete(`/duty-roster/activities/${id}`); toast.success('Activity removed.'); load(); }
    catch { toast.error('Could not remove activity.'); }
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Duty Roster &amp; School Activities</h1>
          <p className="text-sm text-theme-muted">
            {admin ? 'Set up teacher duty assignments and the school activities calendar — visible to every teacher.' : 'View your duty assignments and upcoming school activities.'}
          </p>
        </div>
      </div>

      <div className="flex border-b border-theme gap-1">
        <button onClick={() => setTab('duties')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 ${tab === 'duties' ? 'border-[#1a2e5a] text-theme-heading' : 'border-transparent text-theme-muted hover:text-theme-heading'}`}>
          <ClipboardList size={15}/> Duty Roster
        </button>
        <button onClick={() => setTab('activities')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 ${tab === 'activities' ? 'border-[#1a2e5a] text-theme-heading' : 'border-transparent text-theme-muted hover:text-theme-heading'}`}>
          <CalendarDays size={15}/> Activities Calendar
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 shimmer rounded-xl"/>)}</div>
      ) : tab === 'duties' ? (
        <div className="space-y-3">
          {admin && (
            <button onClick={openNewDuty} className="btn-primary text-sm"><Plus size={15}/> Assign Duty</button>
          )}
          {duties.length === 0 ? (
            <div className="card p-10 text-center text-theme-muted">No duty assignments yet{admin ? ' — tap "Assign Duty" to add one.' : '.'}</div>
          ) : (
            <div className="space-y-2">
              {duties.map((d: any) => (
                <div key={d.id} className="card p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-theme-heading">{d.dutyName}</span>
                      <span className="badge bg-[#1a2e5a]/10 text-[#1a2e5a]">{d.teacherName || 'Unassigned'}</span>
                    </div>
                    <p className="text-xs text-theme-muted mt-1">
                      {fmtDate(d.startDate)}{d.endDate && d.endDate !== d.startDate ? ` – ${fmtDate(d.endDate)}` : ''}
                      {d.location ? ` · ${d.location}` : ''}
                    </p>
                    {d.notes && <p className="text-sm text-theme-muted mt-1.5">{d.notes}</p>}
                  </div>
                  {admin && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => openEditDuty(d)} className="p-2 rounded-lg text-theme-muted hover:bg-surface-2 hover:text-theme-heading"><Pencil size={15}/></button>
                      <button onClick={() => deleteDuty(d.id)} className="p-2 rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={15}/></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {admin && (
            <button onClick={openNewActivity} className="btn-primary text-sm"><Plus size={15}/> Add Activity</button>
          )}
          {activities.length === 0 ? (
            <div className="card p-10 text-center text-theme-muted">No activities scheduled yet{admin ? ' — tap "Add Activity" to add one.' : '.'}</div>
          ) : (
            <div className="space-y-2">
              {activities.map((a: any) => (
                <div key={a.id} className="card p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-theme-heading">{a.title}</span>
                      <span className={`badge ${categoryConf(a.category).className}`}>{categoryConf(a.category).label}</span>
                    </div>
                    <p className="text-xs text-theme-muted mt-1">
                      {fmtDate(a.startDate)}{a.endDate && a.endDate !== a.startDate ? ` – ${fmtDate(a.endDate)}` : ''}
                      {a.startTime ? ` · ${a.startTime}${a.endTime ? `–${a.endTime}` : ''}` : ''}
                      {a.location ? ` · ${a.location}` : ''}
                    </p>
                    {a.description && <p className="text-sm text-theme-muted mt-1.5">{a.description}</p>}
                  </div>
                  {admin && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => openEditActivity(a)} className="p-2 rounded-lg text-theme-muted hover:bg-surface-2 hover:text-theme-heading"><Pencil size={15}/></button>
                      <button onClick={() => deleteActivity(a.id)} className="p-2 rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={15}/></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Duty form modal */}
      {showDutyForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg my-8 mt-16">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <h3 className="text-lg font-bold text-theme-heading">{editingDuty ? 'Edit Duty' : 'Assign Duty'}</h3>
              <button onClick={() => setShowDutyForm(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={saveDuty} className="p-5 space-y-4">
              <div>
                <label className="label">Teacher *</label>
                <select required value={dutyForm.teacherId} onChange={e => setDutyForm(f => ({ ...f, teacherId: e.target.value }))} className="input">
                  <option value="">Select a teacher…</option>
                  {teachers.map((t: any) => <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Duty *</label>
                <input required value={dutyForm.dutyName} onChange={e => setDutyForm(f => ({ ...f, dutyName: e.target.value }))} className="input" placeholder="e.g. Gate Duty, Assembly, Dining Hall"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start date *</label>
                  <input required type="date" value={dutyForm.startDate} onChange={e => setDutyForm(f => ({ ...f, startDate: e.target.value }))} className="input"/>
                </div>
                <div>
                  <label className="label">End date</label>
                  <input type="date" value={dutyForm.endDate} onChange={e => setDutyForm(f => ({ ...f, endDate: e.target.value }))} className="input" placeholder="Same as start if left blank"/>
                </div>
              </div>
              <div>
                <label className="label">Location</label>
                <input value={dutyForm.location} onChange={e => setDutyForm(f => ({ ...f, location: e.target.value }))} className="input" placeholder="Optional"/>
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea value={dutyForm.notes} onChange={e => setDutyForm(f => ({ ...f, notes: e.target.value }))} className="input" rows={2}/>
              </div>
              <div className="flex gap-3 border-t border-theme pt-4">
                <button type="button" onClick={() => setShowDutyForm(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={savingDuty} className="btn-primary flex-1">
                  {savingDuty ? <><Loader2 size={14} className="animate-spin"/> Saving…</> : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Activity form modal */}
      {showActivityForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg my-8 mt-16">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <h3 className="text-lg font-bold text-theme-heading">{editingActivity ? 'Edit Activity' : 'Add Activity'}</h3>
              <button onClick={() => setShowActivityForm(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={saveActivity} className="p-5 space-y-4">
              <div>
                <label className="label">Title *</label>
                <input required value={activityForm.title} onChange={e => setActivityForm(f => ({ ...f, title: e.target.value }))} className="input" placeholder="e.g. Inter-house Sports Day"/>
              </div>
              <div>
                <label className="label">Category</label>
                <select value={activityForm.category} onChange={e => setActivityForm(f => ({ ...f, category: e.target.value }))} className="input">
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start date *</label>
                  <input required type="date" value={activityForm.startDate} onChange={e => setActivityForm(f => ({ ...f, startDate: e.target.value }))} className="input"/>
                </div>
                <div>
                  <label className="label">End date</label>
                  <input type="date" value={activityForm.endDate} onChange={e => setActivityForm(f => ({ ...f, endDate: e.target.value }))} className="input" placeholder="Same as start if left blank"/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start time</label>
                  <input type="time" value={activityForm.startTime} onChange={e => setActivityForm(f => ({ ...f, startTime: e.target.value }))} className="input"/>
                </div>
                <div>
                  <label className="label">End time</label>
                  <input type="time" value={activityForm.endTime} onChange={e => setActivityForm(f => ({ ...f, endTime: e.target.value }))} className="input"/>
                </div>
              </div>
              <div>
                <label className="label">Location</label>
                <input value={activityForm.location} onChange={e => setActivityForm(f => ({ ...f, location: e.target.value }))} className="input" placeholder="Optional"/>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea value={activityForm.description} onChange={e => setActivityForm(f => ({ ...f, description: e.target.value }))} className="input" rows={2}/>
              </div>
              <div className="flex gap-3 border-t border-theme pt-4">
                <button type="button" onClick={() => setShowActivityForm(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={savingActivity} className="btn-primary flex-1">
                  {savingActivity ? <><Loader2 size={14} className="animate-spin"/> Saving…</> : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
