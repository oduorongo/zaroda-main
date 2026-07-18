'use client';
import { useState, useEffect } from 'react';
import {
  BookOpen, UserCheck, Plus, X, Loader2, Layers, GraduationCap, Trash2,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, runsSenior } from '@/lib/hooks/useAuth';
import { SENIOR_PATHWAYS, LEARNING_AREAS, GRADE_LEVELS } from '@/lib/cbc/constants';
import toast from 'react-hot-toast';

// Senior school subject menu by pathway (CBC senior school learning areas)
const PATHWAY_SUBJECTS: Record<string, string[]> = {
  'STEM': ['Mathematics','Biology','Chemistry','Physics','General Science','Agriculture','Computer Science','Home Science','Drawing & Design','Aviation Technology','Building & Construction','Electrical Technology','Metal Technology','Power Mechanics','Woodwork','Media Technology','Marine & Fisheries'],
  'Arts & Sports Science': ['Sports & Recreation','Physical Education','Music & Dance','Theatre & Film','Fine Art','Sculpture','Textile & Fashion Design','Crafts'],
  'Social Sciences': ['English','Literature in English','Kiswahili','Fasihi ya Kiswahili','Kenya Sign Language','Arabic','French','German','Mandarin','History & Citizenship','Geography','Christian Religious Education','Islamic Religious Education','Hindu Religious Education','Business Studies','Economics'],
};

export default function AllocationPage() {
  const { user } = useAuth();
  // Senior-school pathway/track allocation is meaningless for a school that
  // doesn't run Senior School — default straight to Teacher Allocation for them.
  const showSeniorTab = runsSenior(user?.schoolLevels);
  const [tab, setTab] = useState<'subjects'|'teachers'>(showSeniorTab ? 'subjects' : 'teachers');
  const [streams, setStreams]   = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Subject allocation form (senior)
  const [pathway, setPathway] = useState('');
  const [track, setTrack]     = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  // What's actually saved for this school — { id, pathway, track, subject }[]
  const [subjectAllocations, setSubjectAllocations] = useState<any[]>([]);

  // Teacher allocation form
  const [showAlloc, setShowAlloc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [alloc, setAlloc] = useState({ teacherId:'', subject:'', streamId:'' });

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get('/academic/streams').catch(()=>({data:[]})),
      apiClient.get('/academic/teachers').catch(()=>({data:[]})),
      apiClient.get('/academic/allocations').catch(()=>({data:[]})),
      apiClient.get('/academic/subject-allocations').catch(()=>({data:[]})),
    ]).then(([s,t,a,sa])=>{ setStreams(s.data); setTeachers(t.data); setAllocations(a.data); setSubjectAllocations(sa.data||[]); })
      .finally(()=>setLoading(false));
  };
  useEffect(()=>{ load(); }, []);

  const tracks = SENIOR_PATHWAYS.find(p=>p.pathway===pathway)?.tracks || [];
  const availableSubjects = pathway ? (PATHWAY_SUBJECTS[pathway]||[]) : [];

  // Subjects already allocated for the currently selected pathway/track — used to
  // pre-tick the chip picker so opening a track shows what's already offered.
  const allocatedForCurrent = subjectAllocations.filter(a => a.pathway===pathway && a.track===track);

  // Re-sync the chip picker whenever the pathway/track selection changes, so it
  // reflects what's actually saved (lets HOI see + edit the existing allocation).
  useEffect(() => {
    if (pathway && track) setSelectedSubjects(allocatedForCurrent.map(a => a.subject));
    else setSelectedSubjects([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathway, track, subjectAllocations]);

  const toggleSubject = (s: string) =>
    setSelectedSubjects(cur => cur.includes(s) ? cur.filter(x=>x!==s) : [...cur, s]);

  const saveSubjects = async () => {
    if (!pathway || !track) { toast.error('Select pathway and track'); return; }
    setSaving(true);
    try {
      const existing = allocatedForCurrent.map(a => a.subject);
      const toAdd    = selectedSubjects.filter(s => !existing.includes(s));
      const toRemove = allocatedForCurrent.filter(a => !selectedSubjects.includes(a.subject));
      if (toAdd.length) await apiClient.post('/academic/subject-allocations', { pathway, track, subjects: toAdd });
      await Promise.all(toRemove.map(a => apiClient.delete(`/academic/subject-allocations/${a.id}`)));
      toast.success(`${track} now offers ${selectedSubjects.length} subject${selectedSubjects.length===1?'':'s'}`);
      load();
    } catch { toast.error('Could not save allocation'); }
    finally { setSaving(false); }
  };

  const removeAllocation = async (id: string) => {
    try {
      await apiClient.delete(`/academic/subject-allocations/${id}`);
      setSubjectAllocations(cur => cur.filter(a => a.id !== id));
      toast.success('Subject removed');
    } catch { toast.error('Could not remove subject'); }
  };

  const saveTeacherAlloc = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      await apiClient.post('/academic/allocations', alloc);
      toast.success('Teacher allocated to subject');
      setShowAlloc(false); setAlloc({teacherId:'',subject:'',streamId:''}); load();
    } catch { toast.error('Could not allocate teacher'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Subject & Teacher Allocation</h1>
          <p className="text-sm text-theme-muted">Assign learning areas per pathway, then allocate teachers</p>
        </div>
      </div>

      <div className="flex border-b border-theme gap-1">
        {[{k:'subjects',l:'Subject Allocation'},{k:'teachers',l:'Teacher Allocation'}]
          .filter(t => t.k!=='subjects' || showSeniorTab)
          .map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k as any)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${tab===t.k?'border-[#1a2e5a] text-theme-heading':'border-transparent text-theme-muted hover:text-theme-heading'}`}>
            {t.k==='subjects'?'📚 Subject Allocation':'🧑‍🏫 Teacher Allocation'}
          </button>
        ))}
      </div>

      {/* ── SUBJECT ALLOCATION (senior school) ── */}
      {tab==='subjects' && showSeniorTab && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Layers size={18} className="text-theme-heading"/>
              <h2 className="font-bold text-theme-heading">Senior School Learning Areas</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="label">Pathway</label>
                <select value={pathway} onChange={e=>{setPathway(e.target.value); setTrack(''); setSelectedSubjects([]);}} className="input">
                  <option value="">Select pathway</option>
                  {SENIOR_PATHWAYS.map(p=><option key={p.pathway} value={p.pathway}>{p.pathway}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Track</label>
                <select value={track} onChange={e=>setTrack(e.target.value)} disabled={!pathway} className="input">
                  <option value="">Select track</option>
                  {tracks.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {pathway && track && (
              <>
                <p className="text-xs font-bold text-theme-muted uppercase tracking-wide mb-2">
                  Select subjects for {track}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  {availableSubjects.map(s=>(
                    <button key={s} onClick={()=>toggleSubject(s)}
                      className={`text-left text-xs px-3 py-2 rounded-xl border transition-all
                        ${selectedSubjects.includes(s)
                          ? 'bg-[#1a2e5a] text-white border-[#1a2e5a]'
                          : 'bg-surface text-theme border-theme hover:border-[#1a2e5a]'}`}>
                      {selectedSubjects.includes(s) && <span className="mr-1">✓</span>}{s}
                    </button>
                  ))}
                </div>
                <button onClick={saveSubjects} disabled={saving} className="btn-primary">
                  {saving ? <><Loader2 size={14} className="animate-spin"/> Saving…</> : <><Plus size={14}/> Save {selectedSubjects.length} Subject{selectedSubjects.length===1?'':'s'} for {track}</>}
                </button>
              </>
            )}
            {!pathway && <p className="text-sm text-theme-muted text-center py-6">Select a pathway and track to allocate learning areas</p>}
          </div>

          {/* ── What's currently offered — view + edit ── */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen size={18} className="text-theme-heading"/>
              <h2 className="font-bold text-theme-heading">Learning Areas Currently Offered</h2>
            </div>
            {subjectAllocations.length === 0 ? (
              <p className="text-sm text-theme-muted text-center py-6">No learning areas allocated yet — pick a pathway and track above to get started.</p>
            ) : (
              <div className="space-y-4">
                {SENIOR_PATHWAYS.map(p => {
                  const rows = subjectAllocations.filter(a => a.pathway === p.pathway);
                  if (rows.length === 0) return null;
                  const byTrack: Record<string, any[]> = {};
                  rows.forEach(r => { (byTrack[r.track] = byTrack[r.track] || []).push(r); });
                  return (
                    <div key={p.pathway}>
                      <p className="text-xs font-bold text-theme-heading uppercase tracking-wide mb-2">{p.pathway}</p>
                      <div className="space-y-2">
                        {Object.entries(byTrack).map(([trk, subs]) => (
                          <div key={trk} className="p-3 bg-surface-2 rounded-xl">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-semibold text-theme">{trk}</span>
                              <button onClick={()=>{ setPathway(p.pathway); setTrack(trk); }}
                                className="text-[11px] text-[#1a2e5a] font-semibold hover:underline">Edit</button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {subs.map((s:any)=>(
                                <span key={s.id} className="flex items-center gap-1 text-[11px] bg-surface text-theme border border-theme rounded-full pl-2.5 pr-1 py-0.5">
                                  {s.subject}
                                  <button onClick={()=>removeAllocation(s.id)} title="Remove" className="text-theme-muted hover:text-red-600 p-0.5">
                                    <X size={11}/>
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card p-4 bg-surface-2">
            <p className="text-xs text-theme-muted">
              <strong className="text-theme-heading">Note:</strong> Subject allocation applies to Senior School (Grade 10–12). Primary and Junior School follow the fixed CBC learning areas automatically — no manual allocation needed.
            </p>
          </div>
        </div>
      )}

      {/* ── TEACHER ALLOCATION ── */}
      {tab==='teachers' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={()=>setShowAlloc(true)} className="btn-primary"><Plus size={16}/> Allocate Teacher</button>
          </div>

          {loading ? <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-14 shimmer rounded-xl"/>)}</div>
          : allocations.length===0 ? (
            <div className="card p-10 text-center">
              <UserCheck size={36} className="mx-auto text-[#e2e6f0] mb-2"/>
              <p className="text-theme-muted">No teacher allocations yet</p>
              <button onClick={()=>setShowAlloc(true)} className="btn-primary mt-4"><Plus size={16}/> Allocate First Teacher</button>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead><tr className="table-header">
                  <th className="px-4 py-3 text-left text-xs">Teacher</th>
                  <th className="px-4 py-3 text-left text-xs">Subject</th>
                  <th className="px-4 py-3 text-left text-xs hidden sm:table-cell">Stream</th>
                </tr></thead>
                <tbody>
                  {allocations.map((a:any,i:number)=>(
                    <tr key={a.id||i} className={`border-b border-theme ${i%2===0?'bg-surface':'bg-surface-2'}`}>
                      <td className="px-4 py-3 text-sm font-semibold text-theme-heading">{a.teacherName||a.teacher?.firstName+' '+a.teacher?.lastName||'—'}</td>
                      <td className="px-4 py-3"><span className="badge bg-surface-2 text-theme">{a.subject}</span></td>
                      <td className="px-4 py-3 text-sm text-theme-muted hidden sm:table-cell">{a.streamName||a.stream?.name||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Teacher allocation modal */}
      {showAlloc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <h3 className="text-lg font-bold text-theme-heading">Allocate Teacher to Subject</h3>
              <button onClick={()=>setShowAlloc(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={saveTeacherAlloc} className="p-5 space-y-4">
              <div>
                <label className="label">Teacher *</label>
                <select required value={alloc.teacherId} onChange={e=>setAlloc(a=>({...a,teacherId:e.target.value}))} className="input">
                  <option value="">Select teacher</option>
                  {teachers.map((t:any)=><option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}
                </select>
                {teachers.length===0 && <p className="text-xs text-amber-600 mt-1">No teachers found — add teachers first.</p>}
              </div>
              <div>
                <label className="label">Subject *</label>
                <input required value={alloc.subject} onChange={e=>setAlloc(a=>({...a,subject:e.target.value}))} className="input" placeholder="e.g. Mathematics" list="subj-list"/>
                <datalist id="subj-list">
                  {Object.values(PATHWAY_SUBJECTS).flat().concat(Object.values(LEARNING_AREAS).flat())
                    .filter((v,i,arr)=>arr.indexOf(v)===i).map(s=><option key={s} value={s}/>)}
                </datalist>
              </div>
              <div>
                <label className="label">Stream *</label>
                <select required value={alloc.streamId} onChange={e=>setAlloc(a=>({...a,streamId:e.target.value}))} className="input">
                  <option value="">Select stream</option>
                  {streams.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={()=>setShowAlloc(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? <Loader2 size={14} className="animate-spin"/> : 'Allocate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
