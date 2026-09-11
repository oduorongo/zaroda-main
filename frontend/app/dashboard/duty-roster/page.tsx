'use client';
import { useState, useEffect } from 'react';
import { CalendarDays, ClipboardList, Plus, X, Loader2, Trash2, Pencil, RefreshCw } from 'lucide-react';
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
  const [term, setTerm] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);

  const [showPublishForm, setShowPublishForm] = useState(false);
  const [publishForm, setPublishForm] = useState({ label: '', startDate: '', totalWeeks: '12', teachersPerWeek: '1' });
  const [publishing, setPublishing] = useState(false);
  const [addingToWeek, setAddingToWeek] = useState<string | null>(null);

  const [showActivityForm, setShowActivityForm] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any>(null);
  const [activityForm, setActivityForm] = useState({ title: '', description: '', category: 'other', startDate: '', endDate: '', startTime: '', endTime: '', location: '' });
  const [savingActivity, setSavingActivity] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get('/duty-roster/term').catch(() => ({ data: null })),
      apiClient.get('/duty-roster/activities').catch(() => ({ data: [] })),
    ]).then(([t, a]) => { setTerm(t.data || null); setActivities(a.data || []); }).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    if (admin) apiClient.get('/academic/teachers').then(r => setTeachers(r.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  // ── Term duty roster ──────────────────────────────────────
  const openPublishForm = () => {
    setPublishForm({
      label: term?.label || '', startDate: term ? (term.startDate || '').slice(0, 10) : '',
      totalWeeks: String(term?.totalWeeks || 12), teachersPerWeek: String(term?.teachersPerWeek || 1),
    });
    setShowPublishForm(true);
  };
  const publishTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publishForm.label || !publishForm.startDate || !publishForm.totalWeeks) {
      toast.error('Term label, start date and number of weeks are required.'); return;
    }
    if (term && !confirm('Publishing a new term roster replaces the current one for every teacher. Continue?')) return;
    setPublishing(true);
    try {
      await apiClient.post('/duty-roster/term', publishForm);
      toast.success('Term roster published.');
      setShowPublishForm(false);
      load();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not publish term roster.'); }
    finally { setPublishing(false); }
  };
  const clearTerm = async () => {
    if (!confirm('Clear the published roster? Teachers will no longer see it until you publish a new one.')) return;
    try { await apiClient.delete('/duty-roster/term'); toast.success('Roster cleared.'); load(); }
    catch { toast.error('Could not clear roster.'); }
  };
  const addTeacherToWeek = async (weekId: string, teacherId: string) => {
    if (!teacherId) return;
    try { await apiClient.post(`/duty-roster/weeks/${weekId}/teachers`, { teacherId }); load(); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Could not assign teacher.'); }
    finally { setAddingToWeek(null); }
  };
  const removeTeacherFromWeek = async (weekId: string, teacherId: string) => {
    try { await apiClient.delete(`/duty-roster/weeks/${weekId}/teachers/${teacherId}`); load(); }
    catch { toast.error('Could not remove teacher.'); }
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
            <div className="flex gap-2">
              <button onClick={openPublishForm} className="btn-primary text-sm">
                {term ? <><RefreshCw size={15}/> Republish Term Roster</> : <><Plus size={15}/> Publish Term Roster</>}
              </button>
              {term && <button onClick={clearTerm} className="btn-ghost text-sm text-red-500"><Trash2 size={15}/> Clear</button>}
            </div>
          )}
          {!term ? (
            <div className="card p-10 text-center text-theme-muted">
              No duty roster published yet{admin ? ' — tap "Publish Term Roster" to set one up for the whole term.' : '.'}
            </div>
          ) : (
            <>
              <div className="card p-4">
                <p className="font-bold text-theme-heading">{term.label}</p>
                <p className="text-xs text-theme-muted mt-0.5">
                  {term.totalWeeks} weeks from {fmtDate(term.startDate)}
                  {term.createdByName ? ` · Published by ${term.createdByName}` : ''}
                </p>
              </div>
              <div className="space-y-2">
                {(term.weeks || []).map((w: any) => (
                  <div key={w.id} className="card p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-theme-heading">Week {w.weekNumber}</span>
                        <span className="text-xs text-theme-muted">{fmtDate(w.startDate)} – {fmtDate(w.endDate)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        {w.teachers.length === 0 && <span className="text-sm text-theme-muted">No teacher assigned.</span>}
                        {w.teachers.map((t: any) => (
                          <span key={t.id} className="badge bg-[#1a2e5a]/10 text-[#1a2e5a] flex items-center gap-1">
                            {t.teacherName || 'Unnamed'}
                            {admin && (
                              <button onClick={() => removeTeacherFromWeek(w.id, t.teacherId)} className="hover:text-red-500"><X size={12}/></button>
                            )}
                          </span>
                        ))}
                        {admin && (
                          addingToWeek === w.id ? (
                            <select autoFocus defaultValue="" onChange={e => addTeacherToWeek(w.id, e.target.value)}
                              onBlur={() => setAddingToWeek(null)} className="input !py-1 !text-xs !w-auto">
                              <option value="" disabled>Select teacher…</option>
                              {teachers.filter((t: any) => !w.teachers.some((wt: any) => wt.teacherId === t.id)).map((t: any) =>
                                <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}
                            </select>
                          ) : (
                            <button onClick={() => setAddingToWeek(w.id)} className="text-xs font-semibold text-[#1a2e5a] hover:underline flex items-center gap-0.5">
                              <Plus size={12}/> Add teacher
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
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

      {/* Publish term roster modal */}
      {showPublishForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg my-8 mt-16">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <h3 className="text-lg font-bold text-theme-heading">{term ? 'Republish Term Roster' : 'Publish Term Roster'}</h3>
              <button onClick={() => setShowPublishForm(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={publishTerm} className="p-5 space-y-4">
              {term && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5">
                  This replaces the roster every teacher currently sees. Their existing week-by-week assignments will need to be re-added.
                </p>
              )}
              <div>
                <label className="label">Term *</label>
                <input required value={publishForm.label} onChange={e => setPublishForm(f => ({ ...f, label: e.target.value }))} className="input" placeholder="e.g. Term 2, 2026"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Term start date *</label>
                  <input required type="date" value={publishForm.startDate} onChange={e => setPublishForm(f => ({ ...f, startDate: e.target.value }))} className="input"/>
                </div>
                <div>
                  <label className="label">Number of weeks *</label>
                  <input required type="number" min={1} max={20} value={publishForm.totalWeeks} onChange={e => setPublishForm(f => ({ ...f, totalWeeks: e.target.value }))} className="input"/>
                </div>
              </div>
              <div>
                <label className="label">Teachers on duty per week</label>
                <input type="number" min={1} max={10} value={publishForm.teachersPerWeek} onChange={e => setPublishForm(f => ({ ...f, teachersPerWeek: e.target.value }))} className="input"/>
                <p className="text-xs text-theme-muted mt-1">A starting point — pick more for a bigger school, fewer for a smaller one. You can still add or remove teachers on any individual week afterwards.</p>
              </div>
              <div className="flex gap-3 border-t border-theme pt-4">
                <button type="button" onClick={() => setShowPublishForm(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={publishing} className="btn-primary flex-1">
                  {publishing ? <><Loader2 size={14} className="animate-spin"/> Publishing…</> : 'Publish'}
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
