'use client';
import { useState, useEffect } from 'react';
import { UserPlus, X, Loader2, Trash2, Users, Search, Pencil, UserX, UserCheck } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

export default function TeacherLearners() {
  const { user } = useAuth();
  const [streams, setStreams]   = useState<any[]>([]);
  const [streamId, setStreamId] = useState('');
  const [learners, setLearners] = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [showNew, setShowNew]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({ firstName:'', lastName:'', admissionNumber:'', gender:'', guardianName:'', guardianPhone:'' });

  // Only the teacher's own class(es)
  useEffect(() => {
    if (!user) return;
    apiClient.get('/academic/streams').then(r => {
      const mine = (r.data||[]).filter((x:any) => x.id === user.streamId || x.classTeacherId === user.id);
      setStreams(mine);
      setStreamId(mine[0]?.id || '');
    });
  }, [user]);

  const load = () => {
    if (!streamId) return;
    setLoading(true);
    apiClient.get(`/academic/streams/${streamId}/learners`).then(r=>setLearners(r.data)).catch(()=>{}).finally(()=>setLoading(false));
  };
  useEffect(() => { load(); }, [streamId]);

  const [editLearner, setEditLearner] = useState<any>(null);
  const openEdit = (l:any) => setEditLearner({
    id: l.id, fullName: l.fullName || `${l.firstName||''} ${l.lastName||''}`.trim(),
    admissionNumber: l.admissionNumber || '', guardianPhone: l.guardianPhone || '',
  });
  const saveEdit = async () => {
    try {
      await apiClient.patch(`/academic/learners/${editLearner.id}`, editLearner);
      toast.success('Learner updated'); setEditLearner(null); load();
    } catch (e:any) { toast.error(e?.response?.data?.message || 'Could not update'); }
  };
  const toggleActive = async (l:any) => {
    try {
      await apiClient.patch(`/academic/learners/${l.id}/active`, { active: l.isActive === false });
      toast.success(l.isActive === false ? 'Learner reactivated' : 'Learner deactivated'); load();
    } catch (e:any) { toast.error(e?.response?.data?.message || 'Could not update'); }
  };

  const set = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}));

  const addLearner = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.post('/academic/learners', { ...form, streamId });
      toast.success('Learner added to your class');
      setShowNew(false);
      setForm({ firstName:'', lastName:'', admissionNumber:'', gender:'', guardianName:'', guardianPhone:'' });
      load();
    } catch (err:any) {
      toast.error(err?.response?.data?.message || 'Could not add learner');
    } finally { setSaving(false); }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/academic/learners/${confirmDelete.id}`);
      toast.success('Learner removed');
      setConfirmDelete(null);
      load();
    } catch (err:any) {
      toast.error(err?.response?.data?.message || 'Could not remove learner');
    } finally { setDeleting(false); }
  };

  const filtered = learners.filter(l =>
    !search || `${l.firstName} ${l.lastName} ${l.admissionNumber}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">My Learners</h1>
          <p className="text-sm text-theme-muted">Add or remove learners in your class</p>
        </div>
        {streams.length > 0 && (
          <button onClick={()=>setShowNew(true)} className="btn-primary"><UserPlus size={16}/> Add Learner</button>
        )}
      </div>

      {streams.length === 0 ? (
        <div className="card p-10 text-center text-theme-muted">
          You are not assigned as a class teacher, so you cannot manage a class roster.
        </div>
      ) : (
        <>
          <div className="card p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="label">Class</label>
              <select value={streamId} onChange={e=>setStreamId(e.target.value)} className="input w-44">
                {streams.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="label">Search</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted"/>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or admission no…" className="input pl-8"/>
              </div>
            </div>
            <div className="text-xs text-theme-muted bg-surface-2 rounded-lg px-3 py-2"><Users size={12} className="inline mr-1"/>{learners.length} learners</div>
          </div>

          {loading ? <div className="h-64 shimmer rounded-2xl"/> : filtered.length === 0 ? (
            <div className="card p-10 text-center text-theme-muted">No learners in this class yet</div>
          ) : (
            <div className="card overflow-hidden">
              {filtered.map((l:any, i:number) => (
                <div key={l.id} className="flex items-center gap-3 p-3" style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
                  <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center text-xs font-bold text-theme-heading flex-shrink-0">
                    {l.firstName?.[0]}{l.lastName?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-theme-heading text-sm truncate">
                      {l.fullName || `${l.firstName} ${l.lastName}`}
                      {l.isActive === false && <span className="ml-2 text-[9px] bg-surface-2 text-amber-600 rounded px-1 py-0.5">Inactive</span>}
                    </div>
                    <div className="text-[10px] text-theme-muted">{l.admissionNumber || 'No adm. no.'}{l.gender ? ` · ${l.gender}` : ''}</div>
                  </div>
                  <button onClick={()=>openEdit(l)} title="Edit learner"
                    className="text-theme-muted hover:text-[#2563eb] p-1.5"><Pencil size={14}/></button>
                  <button onClick={()=>toggleActive(l)} title={l.isActive===false?'Reactivate':'Deactivate'}
                    className="text-theme-muted hover:text-amber-600 p-1.5">{l.isActive===false ? <UserCheck size={14}/> : <UserX size={14}/>}</button>
                  <button onClick={()=>setConfirmDelete(l)} title="Remove learner"
                    className="text-theme-muted hover:text-red-600 p-1.5"><Trash2 size={15}/></button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add learner modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-lg font-bold text-theme-heading">Add Learner</h3>
              <button onClick={()=>setShowNew(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={addLearner} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">First Name *</label><input required value={form.firstName} onChange={set('firstName')} className="input"/></div>
                <div><label className="label">Last Name *</label><input required value={form.lastName} onChange={set('lastName')} className="input"/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Admission No.</label><input value={form.admissionNumber} onChange={set('admissionNumber')} className="input"/></div>
                <div><label className="label">Gender</label>
                  <select value={form.gender} onChange={set('gender')} className="input">
                    <option value="">Select</option><option value="male">Male</option><option value="female">Female</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Guardian Name</label><input value={form.guardianName} onChange={set('guardianName')} className="input"/></div>
                <div><label className="label">Guardian Phone</label><input value={form.guardianPhone} onChange={set('guardianPhone')} className="input" placeholder="+254…"/></div>
              </div>
              <div className="text-xs text-theme-muted bg-surface-2 rounded-lg p-2">Adding to: <strong className="text-theme-heading">{streams.find(s=>s.id===streamId)?.name}</strong></div>
              <div className="flex gap-3">
                <button type="button" onClick={()=>setShowNew(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? <Loader2 size={14} className="animate-spin"/> : 'Add Learner'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-sm" style={{ border: '1px solid var(--border)' }}>
            <div className="p-5 text-center">
              <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-3"><Trash2 size={22} className="text-red-600"/></div>
              <h3 className="text-lg font-bold text-theme-heading">Remove {confirmDelete.firstName} {confirmDelete.lastName}?</h3>
              <p className="text-sm text-theme-muted mt-1">This removes the learner from your class roster.</p>
              <div className="flex gap-3 mt-5">
                <button onClick={()=>setConfirmDelete(null)} className="btn-ghost flex-1">Cancel</button>
                <button onClick={doDelete} disabled={deleting} className="btn-danger flex-1 justify-center">{deleting ? <Loader2 size={14} className="animate-spin"/> : 'Remove'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editLearner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-bold text-theme-heading">Edit Learner</h3>
              <button onClick={()=>setEditLearner(null)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className="label">Full Name</label><input value={editLearner.fullName} onChange={e=>setEditLearner({...editLearner, fullName:e.target.value})} className="input"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Admission No.</label><input value={editLearner.admissionNumber} onChange={e=>setEditLearner({...editLearner, admissionNumber:e.target.value})} className="input"/></div>
                <div><label className="label">Guardian Phone</label><input value={editLearner.guardianPhone} onChange={e=>setEditLearner({...editLearner, guardianPhone:e.target.value})} className="input"/></div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={()=>setEditLearner(null)} className="btn-ghost flex-1">Cancel</button>
                <button onClick={saveEdit} className="btn-primary flex-1">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
