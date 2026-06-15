'use client';
import { useState, useEffect } from 'react';
import {
  UserPlus, ChevronRight, ChevronLeft, Check, Loader2, Search,
  FileText, Users, Clock, CheckCircle2, X,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  GRADE_LEVELS, EDUCATION_BANDS, SENIOR_PATHWAYS, isSeniorScale,
} from '@/lib/cbc/constants';
import toast from 'react-hot-toast';

const STEPS = ['Learner Details', 'Placement', 'Guardian', 'Review'];

export default function AdmissionsPage() {
  const { user } = useAuth();
  const [view,    setView]    = useState<'list'|'new'>('list');
  const [admissions, setAdmissions] = useState<any[]>([]);
  const [streams, setStreams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [step,    setStep]    = useState(0);
  const [saving,  setSaving]  = useState(false);
  const [search,  setSearch]  = useState('');
  const [parentCreds, setParentCreds] = useState<any>(null);

  const [form, setForm] = useState<any>({
    fullName: '', gender: '', dateOfBirth: '',
    birthCertNo: '', upiNumber: '', previousSchool: '',
    gradeLevel: '', streamId: '', pathway: '', track: '',
    guardianName: '', guardianRelation: 'Parent', guardianPhone: '', guardianEmail: '',
    guardianIdNo: '', residence: '', admissionNumber: '', admissionDate: new Date().toISOString().split('T')[0],
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get('/academic/admissions').catch(() => ({ data: [] })),
      apiClient.get('/academic/streams').catch(() => ({ data: [] })),
    ]).then(([a, s]) => { setAdmissions(a.data); setStreams(s.data); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const set = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }));
  const isSenior = isSeniorScale(form.gradeLevel);

  const canProceed = () => {
    if (step === 0) return form.fullName && form.gender;
    if (step === 1) return form.gradeLevel && form.streamId && (!isSenior || (form.pathway && form.track));
    if (step === 2) return form.guardianName && form.guardianPhone;
    return true;
  };

  const submit = async () => {
    setSaving(true);
    try {
      const res = await apiClient.post('/academic/admissions', form);
      toast.success(`${form.fullName} admitted successfully`);
      const creds = res.data?.parentCredentials;
      if (creds) {
        setParentCreds({ name: form.guardianName, ...creds });
      } else {
        setView('list'); setStep(0);
      }
      setForm({
        fullName:'', gender:'', dateOfBirth:'',
        birthCertNo:'', upiNumber:'', previousSchool:'', gradeLevel:'', streamId:'',
        pathway:'', track:'', guardianName:'', guardianRelation:'Parent', guardianPhone:'',
        guardianEmail:'', guardianIdNo:'', residence:'', admissionNumber:'',
        admissionDate: new Date().toISOString().split('T')[0],
      });
      load();
    } catch { toast.error('Could not complete admission'); }
    finally { setSaving(false); }
  };

  const tracksForPathway = SENIOR_PATHWAYS.find(p => p.pathway === form.pathway)?.tracks || [];
  const filteredStreams = streams.filter(s => !form.gradeLevel || s.gradeLevel === form.gradeLevel);
  const filtered = admissions.filter(a =>
    !search || `${a.fullName||a.firstName+' '+a.lastName} ${a.admissionNumber}`.toLowerCase().includes(search.toLowerCase()));

  // ─────────────────── LIST VIEW ───────────────────
  if (view === 'list') {
    return (
      <div className="space-y-5">
        <div className="page-header">
          <div>
            <h1 className="text-2xl font-black text-theme-heading">Admissions</h1>
            <p className="text-sm text-theme-muted">Full learner intake — by class teacher or admin</p>
          </div>
          <button onClick={() => setView('new')} className="btn-primary"><UserPlus size={16}/> New Admission</button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4 text-center">
            <Users size={18} className="mx-auto text-theme-heading mb-1"/>
            <div className="text-xl font-black text-theme-heading">{admissions.length}</div>
            <div className="text-xs text-theme-muted">Total Admitted</div>
          </div>
          <div className="card p-4 text-center">
            <Clock size={18} className="mx-auto text-amber-500 mb-1"/>
            <div className="text-xl font-black text-theme-heading">{admissions.filter(a=>a.status==='pending').length}</div>
            <div className="text-xs text-theme-muted">Pending</div>
          </div>
          <div className="card p-4 text-center">
            <CheckCircle2 size={18} className="mx-auto text-green-600 mb-1"/>
            <div className="text-xl font-black text-theme-heading">{admissions.filter(a=>a.status==='enrolled').length}</div>
            <div className="text-xs text-theme-muted">Enrolled</div>
          </div>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or admission number…" className="input pl-8"/>
        </div>

        {loading ? <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-14 shimmer rounded-xl"/>)}</div>
        : filtered.length === 0 ? (
          <div className="card p-10 text-center">
            <UserPlus size={36} className="mx-auto text-[#e2e6f0] mb-2"/>
            <p className="text-theme-muted">No admissions recorded yet</p>
            <button onClick={()=>setView('new')} className="btn-primary mt-4"><UserPlus size={16}/> Admit First Learner</button>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead><tr className="table-header">
                <th className="px-4 py-3 text-left text-xs">Adm No.</th>
                <th className="px-4 py-3 text-left text-xs">Learner</th>
                <th className="px-4 py-3 text-left text-xs hidden sm:table-cell">Grade</th>
                <th className="px-4 py-3 text-left text-xs hidden md:table-cell">Guardian</th>
                <th className="px-4 py-3 text-center text-xs">Status</th>
              </tr></thead>
              <tbody>
                {filtered.map((a:any,i:number)=>(
                  <tr key={a.id||i} className={`border-b border-theme ${i%2===0?'bg-surface':'bg-surface-2'}`}>
                    <td className="px-4 py-3 text-sm font-mono text-theme-muted">{a.admissionNumber||'—'}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-theme-heading">{a.fullName || (a.firstName+' '+a.lastName)}</td>
                    <td className="px-4 py-3 text-sm text-theme-muted hidden sm:table-cell">{GRADE_LEVELS.find(g=>g.value===a.gradeLevel)?.label||'—'}</td>
                    <td className="px-4 py-3 text-sm text-theme-muted hidden md:table-cell">{a.guardianName||'—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`badge ${a.status==='enrolled'?'bg-green-100 text-green-700':'bg-amber-100 text-amber-700'}`}>{a.status||'enrolled'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────── NEW ADMISSION WIZARD ───────────────────
  return (
    <div className="space-y-5 max-w-2xl">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">New Admission</h1>
          <p className="text-sm text-theme-muted">Step {step+1} of {STEPS.length} — {STEPS[step]}</p>
        </div>
        <button onClick={()=>{setView('list');setStep(0);}} className="btn-ghost text-sm"><X size={14}/> Cancel</button>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1">
        {STEPS.map((s,i)=>(
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
              ${i<step?'bg-green-600 text-white':i===step?'bg-[#1a2e5a] text-white':'bg-surface-2 text-theme-muted'}`}>
              {i<step ? <Check size={14}/> : i+1}
            </div>
            {i<STEPS.length-1 && <div className={`flex-1 h-0.5 mx-1 ${i<step?'bg-green-600':'bg-[#e2e6f0]'}`}/>}
          </div>
        ))}
      </div>

      <div className="card p-6">
        {/* STEP 0 — Learner details */}
        {step===0 && (
          <div className="space-y-4">
            <div><label className="label">Full Name *</label><input value={form.fullName} onChange={set('fullName')} className="input" placeholder="Learner's full name"/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Gender *</label>
                <select value={form.gender} onChange={set('gender')} className="input">
                  <option value="">Select</option><option value="male">Male</option><option value="female">Female</option>
                </select>
              </div>
              <div><label className="label">Date of Birth</label><input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} className="input"/></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Birth Cert. No.</label><input value={form.birthCertNo} onChange={set('birthCertNo')} className="input"/></div>
              <div><label className="label">UPI Number</label><input value={form.upiNumber} onChange={set('upiNumber')} className="input" placeholder="Unique Pupil Identifier"/></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Previous School</label><input value={form.previousSchool} onChange={set('previousSchool')} className="input"/></div>
              <div></div>
            </div>
          </div>
        )}

        {/* STEP 1 — Placement */}
        {step===1 && (
          <div className="space-y-4">
            <div>
              <label className="label">Grade Level *</label>
              <select value={form.gradeLevel} onChange={e=>{set('gradeLevel')(e); setForm((f:any)=>({...f,streamId:'',pathway:'',track:''}));}} className="input">
                <option value="">Select grade</option>
                {EDUCATION_BANDS.map(band=>(
                  <optgroup key={band} label={band}>
                    {GRADE_LEVELS.filter(g=>g.band===band).map(g=>(
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Senior school: pathway + track */}
            {isSenior && (
              <div className="p-3 bg-surface-2 rounded-xl space-y-3">
                <p className="text-xs font-bold text-theme-heading uppercase tracking-wide">Senior School Pathway</p>
                <div>
                  <label className="label">Pathway *</label>
                  <select value={form.pathway} onChange={e=>{set('pathway')(e); setForm((f:any)=>({...f,track:''}));}} className="input">
                    <option value="">Select pathway</option>
                    {SENIOR_PATHWAYS.map(p=><option key={p.pathway} value={p.pathway}>{p.pathway}</option>)}
                  </select>
                </div>
                {form.pathway && (
                  <div>
                    <label className="label">Track *</label>
                    <select value={form.track} onChange={set('track')} className="input">
                      <option value="">Select track</option>
                      {tracksForPathway.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="label">Stream / Class *</label>
              <select value={form.streamId} onChange={set('streamId')} className="input">
                <option value="">Select stream</option>
                {filteredStreams.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {form.gradeLevel && filteredStreams.length===0 && (
                <p className="text-xs text-amber-600 mt-1">No streams for this grade yet — create one in Streams first.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Admission No.</label><input value={form.admissionNumber} onChange={set('admissionNumber')} className="input" placeholder="Auto if blank"/></div>
              <div><label className="label">Admission Date</label><input type="date" value={form.admissionDate} onChange={set('admissionDate')} className="input"/></div>
            </div>
          </div>
        )}

        {/* STEP 2 — Guardian */}
        {step===2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Guardian Name *</label><input value={form.guardianName} onChange={set('guardianName')} className="input"/></div>
              <div><label className="label">Relationship</label>
                <select value={form.guardianRelation} onChange={set('guardianRelation')} className="input">
                  <option>Parent</option><option>Guardian</option><option>Grandparent</option><option>Sibling</option><option>Other</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Phone *</label><input value={form.guardianPhone} onChange={set('guardianPhone')} className="input" placeholder="+254…"/></div>
              <div><label className="label">ID Number</label><input value={form.guardianIdNo} onChange={set('guardianIdNo')} className="input"/></div>
            </div>
            <div><label className="label">Email <span className="text-theme-muted font-normal">(optional — parent login credentials are sent here)</span></label><input type="email" value={form.guardianEmail} onChange={set('guardianEmail')} className="input" placeholder="parent@example.com"/></div>
            <div><label className="label">Residence / Area</label><input value={form.residence} onChange={set('residence')} className="input" placeholder="Town / estate / village"/></div>
          </div>
        )}

        {/* STEP 3 — Review */}
        {step===3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-theme-heading font-bold"><FileText size={16}/> Review Admission</div>
            {[
              ['Learner', form.fullName],
              ['Gender', form.gender || '—'],
              ['Grade', GRADE_LEVELS.find(g=>g.value===form.gradeLevel)?.label || '—'],
              ['Stream', streams.find(s=>s.id===form.streamId)?.name || '—'],
              ...(isSenior ? [['Pathway', form.pathway||'—'],['Track', form.track||'—']] : []),
              ['Guardian', `${form.guardianName} (${form.guardianRelation})`],
              ['Phone', form.guardianPhone || '—'],
            ].map(([k,v])=>(
              <div key={k} className="flex justify-between text-sm py-1.5 border-b border-theme">
                <span className="text-theme-muted">{k}</span>
                <span className="font-semibold text-theme-heading">{v}</span>
              </div>
            ))}
          </div>
        )}

        {/* Nav buttons */}
        <div className="flex gap-3 mt-6 pt-4 border-t border-theme">
          {step>0 && <button onClick={()=>setStep(step-1)} className="btn-ghost"><ChevronLeft size={15}/> Back</button>}
          <div className="flex-1"/>
          {step<STEPS.length-1 ? (
            <button onClick={()=>canProceed()?setStep(step+1):toast.error('Fill required fields (*)')} className="btn-primary">
              Next <ChevronRight size={15}/>
            </button>
          ) : (
            <button onClick={submit} disabled={saving} className="btn-primary">
              {saving ? <><Loader2 size={15} className="animate-spin"/> Admitting…</> : <><Check size={15}/> Complete Admission</>}
            </button>
          )}
        </div>
      </div>

      {parentCreds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={()=>{ setParentCreds(null); setView('list'); setStep(0); }}>
          <div className="card p-6 max-w-md w-full" onClick={e=>e.stopPropagation()}>
            <h3 className="text-lg font-black text-theme-heading mb-1">Parent Login Created</h3>
            <p className="text-sm text-theme-muted mb-4">Share these one-time credentials with {parentCreds.name || 'the parent'}. The password is shown only once.</p>
            <div className="space-y-2 bg-surface-2 rounded-xl p-4 text-sm">
              <div className="flex justify-between gap-3"><span className="text-theme-muted">Username</span><span className="font-mono font-semibold text-theme-heading break-all">{parentCreds.username}</span></div>
              <div className="flex justify-between gap-3"><span className="text-theme-muted">Password</span><span className="font-mono font-semibold text-theme-heading">{parentCreds.password}</span></div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={()=>{ navigator.clipboard?.writeText(`Username: ${parentCreds.username}\nPassword: ${parentCreds.password}`); toast.success('Copied'); }}
                className="btn-ghost flex-1">Copy</button>
              <button onClick={()=>{ setParentCreds(null); setView('list'); setStep(0); }} className="btn-primary flex-1">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
