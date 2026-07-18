'use client';
import { useState, useEffect } from 'react';
import { UserPlus, X, Loader2, GraduationCap, Search, BookOpen, Phone, Mail, KeyRound, Copy, Trash2, Pencil, Crown, UserX, UserCheck, Share2, MessageCircle, Check, RefreshCw } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, isHoi } from '@/lib/hooks/useAuth';
import { LEARNING_AREAS, learningAreasFor } from '@/lib/cbc/constants';
import toast from 'react-hot-toast';

// Fallback senior pathway subjects + all CBC learning areas → one big de-duplicated list.
// Actual school-selected senior school learning areas (from Subject Allocation) are
// fetched at runtime and merged in — see loadSubjectAllocations().
const FALLBACK_SUBJECTS = Array.from(new Set([
  ...Object.values(LEARNING_AREAS).flat(),
  'Biology','Chemistry','Physics','Computer Science','Business Studies','Economics',
  'History & Citizenship','Geography','Literature in English','Fasihi ya Kiswahili',
  'Christian Religious Education','Islamic Religious Education','French','German','Music',
  'Sports & Recreation','Fine Art','Agriculture','Home Science','Pre-Technical Studies',
])).sort();

export default function TeachersPage() {
  const { user } = useAuth();
  const [teachers, setTeachers] = useState<any[]>([]);
  const [streams, setStreams]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showNew, setShowNew]   = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareData, setShareData] = useState<any>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadShareLink = async (regenerate = false) => {
    setShareLoading(true);
    try {
      const res = await apiClient.post('/teacher-onboard/generate', { regenerate });
      setShareData(res.data);
    } catch { toast.error('Could not generate onboarding link'); }
    finally { setShareLoading(false); }
  };
  useEffect(() => { if (showShare && !shareData) loadShareLink(false); }, [showShare]);
  const copyLink = () => {
    if (!shareData?.inviteUrl) return;
    navigator.clipboard?.writeText(shareData.inviteUrl);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [newCreds, setNewCreds] = useState<{name:string;username:string;password:string}|null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmHoi, setConfirmHoi] = useState<any>(null);
  const [editTeacher, setEditTeacher] = useState<any>(null);

  const toggleActive = async (t:any) => {
    try {
      await apiClient.patch(`/academic/teachers/${t.id}/active`, { active: t.isActive === false });
      toast.success(t.isActive === false ? 'Teacher reactivated' : 'Teacher deactivated');
      load();
    } catch (e:any) { toast.error(e?.response?.data?.message || 'Could not update'); }
  };
  const openEdit = async (t:any) => {
    setEditTeacher({
      id: t.id, fullName: `${t.firstName||''} ${t.lastName||''}`.trim(),
      email: t.email||'', phone: t.phone||'', gender: t.gender||'', role: t.role,
      streamSubjects: [{ streamId:'', subjects:[] }],
      // Streams this teacher is already the class teacher of.
      classTeacherStreamIds: streams.filter((s:any)=>s.classTeacherId===t.id).map((s:any)=>String(s.id)),
    });
    try {
      const r = await apiClient.get(`/academic/teachers/${t.id}/stream-subjects`);
      const ss = (r.data || []);
      setEditTeacher((prev:any)=> prev && prev.id===t.id
        ? { ...prev, streamSubjects: ss.length ? ss : [{ streamId:'', subjects:[] }] } : prev);
    } catch {}
  };
  const editToggleClassTeacher = (streamId:string) => setEditTeacher((f:any)=>{
    const cur = new Set<string>(f.classTeacherStreamIds||[]);
    if (cur.has(streamId)) cur.delete(streamId); else cur.add(streamId);
    return { ...f, classTeacherStreamIds: Array.from(cur) };
  });
  const editAddRow = () => setEditTeacher((f:any)=>({ ...f, streamSubjects:[...(f.streamSubjects||[]), {streamId:'',subjects:[]}] }));
  const editRemoveRow = (i:number) => setEditTeacher((f:any)=>({ ...f, streamSubjects: f.streamSubjects.filter((_:any,x:number)=>x!==i) }));
  const editUpdateRow = (i:number,k:string,v:any) => setEditTeacher((f:any)=>({ ...f, streamSubjects: f.streamSubjects.map((r:any,x:number)=> x===i ? {...r,[k]:v,...(k==='streamId'?{subjects:[]}:{})} : r) }));
  const editToggleSubj = (i:number,s:string) => setEditTeacher((f:any)=>({ ...f, streamSubjects: f.streamSubjects.map((r:any,x:number)=> x===i ? {...r, subjects: r.subjects.includes(s)?r.subjects.filter((y:string)=>y!==s):[...r.subjects,s]} : r) }));
  const saveEdit = async () => {
    try {
      const cleanSS = (editTeacher.streamSubjects||[]).filter((r:any)=>r.streamId && r.subjects.length);
      await apiClient.patch(`/academic/teachers/${editTeacher.id}`, {
        fullName: editTeacher.fullName, email: editTeacher.email, phone: editTeacher.phone,
        gender: editTeacher.gender, role: editTeacher.role, streamSubjects: cleanSS,
        classTeacherStreamIds: editTeacher.classTeacherStreamIds || [],
      });
      toast.success('Teacher updated'); setEditTeacher(null); load();
    } catch (e:any) { toast.error(e?.response?.data?.message || 'Could not update'); }
  };
  const doTransferHoi = async () => {
    try {
      await apiClient.post('/academic/teachers/transfer-hoi', { newHoiTeacherId: confirmHoi.id });
      toast.success('HOI role transferred'); setConfirmHoi(null); load();
    } catch (e:any) { toast.error(e?.response?.data?.message || 'Could not transfer'); }
  };

  const [form, setForm] = useState<any>({
    fullName:'', email:'', phone:'', gender:'', idNumber:'', tscNumber:'',
    role:'subject_teacher', streamId:'', streamName:'', subjects:[] as string[],
    streamSubjects: [{ streamId:'', subjects:[] as string[] }],
  });

  // Full fallback list — used only for the flat "Learning Areas They Teach" chip picker,
  // which intentionally spans all bands since one teacher can span grades.
  const [allSubjects, setAllSubjects] = useState<string[]>(FALLBACK_SUBJECTS);
  // Just the senior-school electives this school actually selected via Subject
  // Allocation — used to scope the per-stream picker to grade 10-12 only.
  const [seniorAllocatedSubjects, setSeniorAllocatedSubjects] = useState<string[]>([]);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get('/academic/teachers').catch(()=>({data:[]})),
      apiClient.get('/academic/streams').catch(()=>({data:[]})),
      apiClient.get('/academic/subject-allocations').catch(()=>({data:[]})),
    ]).then(([t,s,sa])=>{
      setTeachers(t.data); setStreams(s.data);
      const allocated = (sa.data||[]).map((r:any)=>r.subject);
      setAllSubjects(Array.from(new Set([...FALLBACK_SUBJECTS, ...allocated])).sort());
      setSeniorAllocatedSubjects(Array.from(new Set(allocated)).sort());
    }).finally(()=>setLoading(false));
  };
  useEffect(()=>{ load(); }, []);

  const set = (k:string) => (e:any) => setForm((f:any)=>({...f,[k]:e.target.value}));
  const toggleSubject = (s:string) =>
    setForm((f:any)=>({ ...f, subjects: f.subjects.includes(s) ? f.subjects.filter((x:string)=>x!==s) : [...f.subjects, s] }));

  // Per-stream assignment helpers
  // Senior school grades only have 4 compulsory subjects baked into learningAreasFor;
  // the pathway-specific electives a school actually selected (subject_allocations) must
  // be merged in — but only those, not the full cross-band fallback list, otherwise
  // ECD/primary subjects leak into the senior school picker.
  const areasForGrade = (grade:string) => {
    const base = learningAreasFor(grade || 'grade_4');
    if (['grade_10','grade_11','grade_12'].includes(grade)) {
      return Array.from(new Set([...base, ...seniorAllocatedSubjects])).sort();
    }
    return base;
  };
  const addStreamRow = () => setForm((f:any)=>({ ...f, streamSubjects: [...(f.streamSubjects||[]), { streamId:'', subjects:[] }] }));
  const removeStreamRow = (idx:number) => setForm((f:any)=>({ ...f, streamSubjects: f.streamSubjects.filter((_:any,i:number)=>i!==idx) }));
  const updateStreamRow = (idx:number, key:string, val:any) => setForm((f:any)=>({
    ...f, streamSubjects: f.streamSubjects.map((r:any,i:number)=> i===idx ? { ...r, [key]: val, ...(key==='streamId'?{subjects:[]}:{}) } : r),
  }));
  const toggleStreamSubject = (idx:number, s:string) => setForm((f:any)=>({
    ...f, streamSubjects: f.streamSubjects.map((r:any,i:number)=> i===idx
      ? { ...r, subjects: r.subjects.includes(s) ? r.subjects.filter((x:string)=>x!==s) : [...r.subjects, s] } : r),
  }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subjects || form.subjects.length === 0) { toast.error('Select at least one learning area they teach'); return; }
    const parts = (form.fullName || '').trim().split(/\s+/);
    if (parts.length < 2) { toast.error('Enter first and last name'); return; }
    const firstName = parts.shift() as string;
    const lastName  = parts.join(' ');
    setSaving(true);
    try {
      const res = await apiClient.post('/academic/teachers', { ...form, firstName, lastName, subjects: form.subjects });
      const creds = res.data?.credentials;
      toast.success(`${firstName} ${lastName} onboarded`);
      setShowNew(false);
      setForm({ fullName:'', email:'', phone:'', gender:'', idNumber:'', tscNumber:'', role:'subject_teacher', streamId:'', streamName:'', subjects:[], streamSubjects:[{ streamId:'', subjects:[] }] });
      if (creds) setNewCreds({ name: `${res.data.teacher.firstName} ${res.data.teacher.lastName}`, ...creds });
      load();
    } catch (err:any) {
      toast.error(err?.response?.data?.message || 'Could not onboard teacher');
    } finally { setSaving(false); }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/academic/teachers/${confirmDelete.id}`);
      toast.success(`${confirmDelete.firstName} ${confirmDelete.lastName} removed`);
      setConfirmDelete(null);
      load();
    } catch (err:any) {
      toast.error(err?.response?.data?.message || 'Could not remove teacher');
    } finally { setDeleting(false); }
  };

  const filtered = teachers.filter(t =>
    !search || `${t.firstName} ${t.lastName} ${(t.subjects||[]).join(' ')}`.toLowerCase().includes(search.toLowerCase()));

  const roleLabel: Record<string,string> = {
    class_teacher:'Class Teacher', subject_teacher:'Subject Teacher',
    overall_class_teacher:'Overall Class Teacher', hoi:'HOI', dhois:'Deputy HOI',
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Teachers</h1>
          <p className="text-sm text-theme-muted">Onboard teachers with the subjects they teach — the timetable picks them up automatically</p>
        </div>
        {isHoi(user?.role || '') && (
          <div className="flex gap-2">
            <button onClick={()=>setShowShare(true)} className="btn-ghost"><Share2 size={16}/> Share Onboarding Link</button>
            <button onClick={()=>setShowNew(true)} className="btn-primary"><UserPlus size={16}/> Onboard Teacher</button>
          </div>
        )}
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted"/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or subject…" className="input pl-8"/>
      </div>

      {loading ? <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-20 shimmer rounded-xl"/>)}</div>
      : filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <GraduationCap size={36} className="mx-auto text-[#e2e6f0] mb-2"/>
          <p className="text-theme-muted">No teachers onboarded yet</p>
          {isHoi(user?.role || '') && <button onClick={()=>setShowNew(true)} className="btn-primary mt-4"><UserPlus size={16}/> Onboard First Teacher</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((t:any)=>(
            <div key={t.id} className="card p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#1a2e5a] flex items-center justify-center text-[#d4af37] font-bold flex-shrink-0">
                  {t.firstName?.[0]}{t.lastName?.[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-theme-heading truncate">{t.firstName} {t.lastName}</div>
                  <div className="text-[10px] text-theme-muted">{roleLabel[t.role] || t.role}{t.tscNumber ? ` · TSC ${t.tscNumber}` : ''}</div>
                </div>
                {isHoi(user?.role || '') && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={()=>openEdit(t)} title="Edit teacher"
                      className="text-theme-muted hover:text-[#2563eb] p-1"><Pencil size={14}/></button>
                    {t.id !== user?.id && (<>
                      {t.role !== 'hoi' && (
                        <button onClick={()=>setConfirmHoi(t)} title="Make HOI"
                          className="text-theme-muted hover:text-[#d4af37] p-1"><Crown size={14}/></button>
                      )}
                      <button onClick={()=>toggleActive(t)} title={t.isActive===false?'Reactivate':'Deactivate'}
                        className="text-theme-muted hover:text-amber-600 p-1">{t.isActive===false ? <UserCheck size={14}/> : <UserX size={14}/>}</button>
                      <button onClick={()=>setConfirmDelete(t)} title="Remove teacher"
                        className="text-theme-muted hover:text-red-600 p-1"><Trash2 size={15}/></button>
                    </>)}
                  </div>
                )}
              </div>
              {(t.subjects && t.subjects.length > 0) ? (
                <div className="flex flex-wrap gap-1">
                  {t.subjects.map((s:string)=>(
                    <span key={s} className="text-[10px] bg-surface-2 text-theme rounded px-1.5 py-0.5">{s}</span>
                  ))}
                </div>
              ) : <div className="text-[10px] text-theme-muted italic">No subjects assigned</div>}
              {t.streamName && <div className="text-[10px] text-theme-muted mt-2">Class: {t.streamName}</div>}
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-5 border-b border-theme sticky top-0 bg-surface">
              <h3 className="text-lg font-bold text-theme-heading">Onboard Teacher</h3>
              <button onClick={()=>setShowNew(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><label className="label">Full Name *</label><input required value={form.fullName} onChange={set('fullName')} className="input" placeholder="e.g. Jane Wanjiku Kamau"/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Email * <span className="text-theme-muted font-normal">(used as login username)</span></label><input type="email" required value={form.email} onChange={set('email')} className="input"/></div>
                <div><label className="label">Phone</label><input value={form.phone} onChange={set('phone')} className="input" placeholder="+254…"/></div>
                <div><label className="label">Gender</label>
                  <select value={form.gender} onChange={set('gender')} className="input">
                    <option value="">Select…</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Role</label>
                  <select value={form.role} onChange={set('role')} className="input">
                    <option value="subject_teacher">Subject Teacher</option>
                    <option value="class_teacher">Class Teacher</option>
                    <option value="overall_class_teacher">Overall Class Teacher</option>
                    <option value="dhois">Deputy HOI</option>
                    <option value="games_dept">Games Department</option>
                    <option value="bursar">Bursar</option>
                  </select>
                </div>
              </div>

              {/* Learning areas the teacher takes — simple chip picker (matches self-onboarding) */}
              <div>
                <label className="label">Learning Areas They Teach *</label>
                <p className="text-[11px] text-theme-muted mb-2">Tick the learning areas this teacher takes.</p>
                <div className="flex flex-wrap gap-1.5">
                  {allSubjects.map((s:string)=>(
                    <button type="button" key={s} onClick={()=>toggleSubject(s)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors
                        ${form.subjects.includes(s) ? 'bg-[#1a2e5a] text-white border-transparent' : 'border-theme text-theme-muted hover:bg-surface-2'}`}>
                      {form.subjects.includes(s) && '✓ '}{s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={()=>setShowNew(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? <><Loader2 size={14} className="animate-spin"/> Onboarding…</> : 'Onboard Teacher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generated credentials — shown once after onboarding */}
      {newCreds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md" style={{ border: '1px solid var(--border)' }}>
            <div className="p-5 text-center" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-2">
                <KeyRound size={22} className="text-green-600"/>
              </div>
              <h3 className="text-lg font-bold text-theme-heading">{newCreds.name} can now log in</h3>
              <p className="text-xs text-theme-muted mt-1">Share these credentials with the teacher. The password is shown only once.</p>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-surface-2 rounded-xl p-3" style={{ border: '1px solid var(--border)' }}>
                <div className="text-xs text-theme-muted mb-0.5">Username</div>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm font-semibold text-theme-heading break-all">{newCreds.username}</code>
                  <button onClick={() => { navigator.clipboard?.writeText(newCreds.username); toast.success('Username copied'); }}
                    className="text-theme-muted hover:text-theme-heading flex-shrink-0"><Copy size={15}/></button>
                </div>
              </div>
              <div className="bg-surface-2 rounded-xl p-3" style={{ border: '1px solid var(--border)' }}>
                <div className="text-xs text-theme-muted mb-0.5">Password</div>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm font-semibold text-theme-heading">{newCreds.password}</code>
                  <button onClick={() => { navigator.clipboard?.writeText(newCreds.password); toast.success('Password copied'); }}
                    className="text-theme-muted hover:text-theme-heading flex-shrink-0"><Copy size={15}/></button>
                </div>
              </div>
              <button
                onClick={() => { navigator.clipboard?.writeText(`ZARODA login\nUsername: ${newCreds.username}\nPassword: ${newCreds.password}\nLogin at your school's ZARODA link.`); toast.success('Both copied to share'); }}
                className="btn-ghost w-full justify-center text-xs"><Copy size={13}/> Copy both to share</button>
              <button onClick={() => setNewCreds(null)} className="btn-primary w-full justify-center">Done</button>
            </div>
          </div>
        </div>
      )}
      {/* Delete teacher confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-sm" style={{ border: '1px solid var(--border)' }}>
            <div className="p-5 text-center">
              <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-3">
                <Trash2 size={22} className="text-red-600"/>
              </div>
              <h3 className="text-lg font-bold text-theme-heading">Remove {confirmDelete.firstName} {confirmDelete.lastName}?</h3>
              <p className="text-sm text-theme-muted mt-1">This deletes their account and login access. This cannot be undone.</p>
              <div className="flex gap-3 mt-5">
                <button onClick={()=>setConfirmDelete(null)} className="btn-ghost flex-1">Cancel</button>
                <button onClick={doDelete} disabled={deleting} className="btn-danger flex-1 justify-center">
                  {deleting ? <Loader2 size={14} className="animate-spin"/> : 'Remove'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit teacher modal */}
      {editTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md max-h-[90vh] flex flex-col" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-bold text-theme-heading">Edit Teacher</h3>
              <button onClick={()=>setEditTeacher(null)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto flex-1">
              <div><label className="label">Full Name</label><input value={editTeacher.fullName} onChange={e=>setEditTeacher({...editTeacher, fullName:e.target.value})} className="input"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Email</label><input value={editTeacher.email} onChange={e=>setEditTeacher({...editTeacher, email:e.target.value})} className="input"/></div>
                <div><label className="label">Phone</label><input value={editTeacher.phone} onChange={e=>setEditTeacher({...editTeacher, phone:e.target.value})} className="input"/></div>
                <div><label className="label">Gender</label>
                  <select value={editTeacher.gender||''} onChange={e=>setEditTeacher({...editTeacher, gender:e.target.value})} className="input">
                    <option value="">Select…</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Role</label>
                  <select value={editTeacher.role} onChange={e=>setEditTeacher({...editTeacher, role:e.target.value})} className="input">
                    <option value="subject_teacher">Subject Teacher</option>
                    <option value="class_teacher">Class Teacher</option>
                    <option value="overall_class_teacher">Overall Class Teacher</option>
                    <option value="dhois">Deputy HOI</option>
                    <option value="games_dept">Games Department</option>
                    <option value="bursar">Bursar</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Learning Areas per Class/Stream</label>
                <div className="space-y-2">
                  {(editTeacher.streamSubjects||[]).map((row:any, idx:number)=>{
                    const grade = streams.find((s:any)=>s.id===row.streamId)?.gradeLevel || '';
                    return (
                      <div key={idx} className="border border-theme rounded-xl p-2.5">
                        <div className="flex items-center gap-2 mb-2">
                          <select value={row.streamId} onChange={e=>editUpdateRow(idx,'streamId',e.target.value)} className="input flex-1">
                            <option value="">Select class…</option>
                            {streams.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                          <button type="button" onClick={()=>editRemoveRow(idx)} className="btn-ghost p-1.5"><Trash2 size={14}/></button>
                        </div>
                        {row.streamId && (
                          <>
                          <div className="flex flex-wrap gap-1">
                            {areasForGrade(grade).map((s:string)=>(
                              <button type="button" key={s} onClick={()=>editToggleSubj(idx,s)}
                                className={`text-[11px] px-2 py-1 rounded-full border transition-colors
                                  ${row.subjects.includes(s) ? 'bg-[#1a2e5a] text-white border-transparent' : 'border-theme text-theme-muted hover:bg-surface-2'}`}>
                                {row.subjects.includes(s) && '✓ '}{s}
                              </button>
                            ))}
                          </div>
                          <label className="flex items-center gap-2 mt-2 text-xs text-theme cursor-pointer">
                            <input type="checkbox"
                              checked={(editTeacher.classTeacherStreamIds||[]).includes(String(row.streamId))}
                              onChange={()=>editToggleClassTeacher(String(row.streamId))}/>
                            Class teacher of this stream (full mark-list rights for this class)
                          </label>
                          </>
                        )}
                      </div>
                    );
                  })}
                  <button type="button" onClick={editAddRow} className="btn-ghost text-sm w-full">+ Add another class</button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={()=>setEditTeacher(null)} className="btn-ghost flex-1">Cancel</button>
              <button onClick={saveEdit} className="btn-primary flex-1">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer HOI modal */}
      {confirmHoi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-sm" style={{ border: '1px solid var(--border)' }}>
            <div className="p-5 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-3">
                <Crown size={22} className="text-[#d4af37]"/>
              </div>
              <h3 className="text-lg font-bold text-theme-heading">Make {confirmHoi.firstName} {confirmHoi.lastName} the HOI?</h3>
              <p className="text-sm text-theme-muted mt-1">They become Head of Institution. The current HOI becomes a class teacher. You can transfer it again later.</p>
              <div className="flex gap-3 mt-5">
                <button onClick={()=>setConfirmHoi(null)} className="btn-ghost flex-1">Cancel</button>
                <button onClick={doTransferHoi} className="btn-primary flex-1 justify-center">Transfer HOI</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showShare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={()=>setShowShare(false)}>
          <div className="card p-6 max-w-lg w-full" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-black text-theme-heading flex items-center gap-2"><Share2 size={18}/> Teacher Onboarding Link</h3>
              <button onClick={()=>setShowShare(false)} className="btn-ghost p-1"><X size={18}/></button>
            </div>
            <p className="text-sm text-theme-muted mb-4">
              Share this link with your teachers (e.g. on a staff WhatsApp group). They open it and set up
              their own accounts in {shareData?.schoolName || 'your school'} — no need to add each one manually.
            </p>

            {shareLoading && !shareData ? (
              <div className="flex items-center gap-2 text-theme-muted py-6 justify-center"><Loader2 size={16} className="animate-spin"/> Generating link…</div>
            ) : shareData ? (
              <>
                <div className="flex items-center gap-2 bg-surface-2 rounded-xl p-3 mb-3">
                  <input readOnly value={shareData.inviteUrl} className="flex-1 bg-transparent text-sm text-theme-heading outline-none"/>
                  <button onClick={copyLink} className="btn-ghost p-2" title="Copy link">
                    {copied ? <Check size={16} className="text-green-600"/> : <Copy size={16}/>}
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <a href={shareData.whatsappUrl} target="_blank" rel="noopener noreferrer"
                     className="btn-primary flex-1 justify-center" style={{ background:'#25D366', borderColor:'#25D366' }}>
                    <MessageCircle size={16}/> Share via WhatsApp
                  </a>
                  <button onClick={copyLink} className="btn-ghost flex-1 justify-center">
                    {copied ? <><Check size={16}/> Copied</> : <><Copy size={16}/> Copy Link</>}
                  </button>
                </div>

                <div className="flex items-center justify-between mt-4 text-xs text-theme-muted">
                  <span>{shareData.usesCount ?? 0} teacher(s) onboarded · expires {shareData.expiresAt ? new Date(shareData.expiresAt).toLocaleDateString() : '—'}</span>
                  <button onClick={()=>loadShareLink(true)} className="flex items-center gap-1 hover:text-theme-heading" title="Generate a new link (disables the old one)">
                    <RefreshCw size={12}/> New link
                  </button>
                </div>
              </>
            ) : (
              <div className="text-sm text-theme-muted py-4">Could not load the link. <button onClick={()=>loadShareLink(false)} className="text-teal-600 underline">Try again</button></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
