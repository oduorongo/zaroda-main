'use client';
import { useState, useEffect } from 'react';
import { Scale, Plus, AlertTriangle, AlertCircle, ShieldAlert, X, Loader2, FileBarChart } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, isHoi } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

const SEVERITY_CONF: Record<string, { label: string; className: string; icon: any }> = {
  minor:    { label:'Minor',    className:'bg-blue-100   text-blue-700',   icon: AlertCircle  },
  moderate: { label:'Moderate', className:'bg-amber-100  text-amber-700',  icon: AlertTriangle},
  major:    { label:'Major',    className:'bg-orange-100 text-orange-700', icon: ShieldAlert  },
  critical: { label:'Critical', className:'bg-red-100    text-red-700',    icon: Scale        },
};
const STATUS_CONF: Record<string, string> = {
  open:         'bg-blue-100   text-blue-700',
  action_taken: 'bg-amber-100  text-amber-700',
  closed:       'bg-green-100  text-green-700',
  appeal:       'bg-purple-100 text-purple-700',
};
const CATEGORIES = ['Late coming','Uniform violation','Incomplete homework','Truancy','Bullying','Cheating','Disrespect','Vandalism','Theft','Fighting','Drug possession','Other'];

export default function DisciplinePage() {
  const { user }  = useAuth();
  const [tab,     setTab]      = useState<'incidents'|'counselling'|'qaso'>('incidents');
  const [incidents,setIncidents]= useState<any[]>([]);
  const [loading,  setLoading] = useState(true);
  const [showNew,  setShowNew] = useState(false);
  const [saving,   setSaving]  = useState(false);
  const [form,     setForm]    = useState<any>({
    learnerQuery:'', learnerId:'', learnerName:'', learnerClass:'',
    category:'Late coming', severity:'minor',
    description:'', actionTaken:'', parentNotified:false,
  });

  // Class-based learner picker
  const [streams, setStreams] = useState<any[]>([]);
  const [pickStream, setPickStream] = useState('');
  const [learners, setLearners] = useState<any[]>([]);
  const [learnerSearch, setLearnerSearch] = useState('');

  useEffect(() => { apiClient.get('/academic/streams').then(r => setStreams(r.data||[])).catch(()=>{}); }, []);
  useEffect(() => {
    if (!showNew || !pickStream) { setLearners([]); return; }
    apiClient.get(`/library/borrowers?type=learner&streamId=${pickStream}`).then(r => setLearners(r.data||[])).catch(()=>setLearners([]));
  }, [showNew, pickStream]);

  const load = () => {
    setLoading(true);
    apiClient.get('/discipline/incidents')
      .then(r => setIncidents(r.data))
      .catch(() => toast.error('Could not load incidents'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) =>
    setForm((f: any) => ({ ...f, [k]: (e.target as HTMLInputElement).type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.learnerName) { toast.error('Select the learner'); return; }
    setSaving(true);
    try {
      await apiClient.post('/discipline/incidents', form);
      toast.success('Incident recorded');
      setShowNew(false);
      setForm({ learnerQuery:'', learnerId:'', learnerName:'', learnerClass:'', category:'Late coming', severity:'minor', description:'', actionTaken:'', parentNotified:false });
      setPickStream(''); setLearners([]); setLearnerSearch('');
      load();
    } catch { toast.error('Could not record incident'); }
    finally { setSaving(false); }
  };

  const downloadQaso = async () => {
    toast.success('Generating QASO report…');
    try {
      const { data } = await apiClient.get('/discipline/qaso-report', { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a'); a.href = url; a.download = 'qaso-report.pdf';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch { toast.error('QASO report failed'); }
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Discipline & Guidance</h1>
          <p className="text-sm text-theme-muted">Incident recording · Counselling · Behaviour · QASO reports</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadQaso} className="btn-ghost text-sm">
            <FileBarChart size={14}/> QASO Report
          </button>
          <button onClick={() => setShowNew(true)} className="btn-primary">
            <Plus size={16}/> Record Incident
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-theme gap-1">
        {[{k:'incidents',l:'⚖️ Incidents'},{k:'counselling',l:'💙 Counselling'},{k:'qaso',l:'📊 Analytics'}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${tab===t.k?'border-[#1a2e5a] text-theme-heading':'border-transparent text-theme-muted hover:text-theme-heading'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'incidents' && (
        loading ? <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-20 shimmer rounded-xl"/>)}</div> : (
          incidents.length === 0 ? (
            <div className="card p-10 text-center">
              <Scale size={36} className="mx-auto text-[#e2e6f0] mb-2"/>
              <p className="text-theme-muted">No incidents recorded</p>
            </div>
          ) : (
            <div className="space-y-3">
              {incidents.map((inc: any) => {
                const sc = SEVERITY_CONF[inc.severity] || SEVERITY_CONF.minor;
                const Icon = sc.icon;
                return (
                  <div key={inc.id} className="card p-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${sc.className}`}>
                        <Icon size={16}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-theme-heading text-sm">{inc.learner?.firstName} {inc.learner?.lastName}</span>
                          <span className={`badge ${sc.className}`}>{sc.label}</span>
                          <span className={`badge ${STATUS_CONF[inc.status] || 'bg-gray-100 text-gray-600'}`}>{inc.status?.replace('_',' ')}</span>
                        </div>
                        <p className="text-xs text-theme-muted mt-0.5">{inc.category} · {inc.reportedAt ? new Date(inc.reportedAt).toLocaleDateString('en-KE') : ''}</p>
                        <p className="text-sm text-theme mt-1 line-clamp-2">{inc.description}</p>
                        {inc.actionTaken && (
                          <p className="text-xs text-green-700 mt-1 bg-green-50 border border-green-200 px-2 py-0.5 rounded">Action: {inc.actionTaken}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )
      )}

      {tab === 'counselling' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            <strong>Confidential.</strong> Session notes are visible only to the counsellor and HOI. No other role can access this content.
          </div>
          <div className="card p-8 text-center text-theme-muted">
            Counselling sessions load from <code className="bg-surface-2 px-1 rounded">/api/v1/discipline/counselling</code>
          </div>
        </div>
      )}

      {tab === 'qaso' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label:'Total Incidents', value: incidents.length },
              { label:'This Month',      value: incidents.filter(i => new Date(i.reportedAt).getMonth() === new Date().getMonth()).length },
              { label:'Open Cases',      value: incidents.filter(i => i.status === 'open').length },
              { label:'Resolved',        value: incidents.filter(i => i.status === 'closed').length },
            ].map(s => (
              <div key={s.label} className="card p-4 text-center">
                <div className="text-2xl font-black text-theme-heading">{s.value}</div>
                <div className="text-xs text-theme-muted mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="card p-6 text-center">
            <FileBarChart size={36} className="mx-auto text-[#e2e6f0] mb-3"/>
            <p className="text-theme font-medium">Download full QASO report</p>
            <p className="text-xs text-theme-muted mt-1 mb-4">Formatted for submission to the Sub-County Quality Assurance and Standards Officer</p>
            <button onClick={downloadQaso} className="btn-primary">
              <FileBarChart size={14}/> Download QASO Report PDF
            </button>
          </div>
        </div>
      )}

      {/* Record Incident Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <h3 className="text-lg font-bold text-theme-heading">Record Incident</h3>
              <button onClick={() => setShowNew(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-4">
              <div><label className="label">Class *</label>
                <select value={pickStream} onChange={e=>{setPickStream(e.target.value); setForm((f:any)=>({...f,learnerId:'',learnerName:'',learnerClass:''}));}} className="input">
                  <option value="">Select class…</option>
                  {streams.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {pickStream && (
                <div><label className="label">Learner * <span className="text-theme-muted font-normal">(search within class)</span></label>
                  <input value={learnerSearch} onChange={e=>setLearnerSearch(e.target.value)} className="input mb-1" placeholder="Type learner name or admission no…"/>
                  <div className="max-h-44 overflow-y-auto border border-theme rounded-xl divide-y divide-theme/30">
                    {learners.filter((l:any)=>{const q=learnerSearch.toLowerCase(); return !q || l.name.toLowerCase().includes(q) || (l.adm||'').toLowerCase().includes(q);}).length === 0 ? (
                      <div className="p-3 text-sm text-theme-muted">No learners found</div>
                    ) : learners.filter((l:any)=>{const q=learnerSearch.toLowerCase(); return !q || l.name.toLowerCase().includes(q) || (l.adm||'').toLowerCase().includes(q);}).slice(0,60).map((l:any)=>(
                      <button type="button" key={l.id} onClick={()=>setForm((f:any)=>({...f,learnerId:l.id,learnerName:l.name,learnerClass:l.stream||l.sub||''}))}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-surface-2 ${form.learnerId===l.id?'bg-surface-2 font-semibold':''}`}>
                        <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-[9px] ${form.learnerId===l.id?'bg-[#1a2e5a] text-white border-[#1a2e5a]':'border-theme'}`}>{form.learnerId===l.id?'✓':''}</span>
                        {l.name} <span className="text-theme-muted text-xs">{l.sub}</span>
                      </button>
                    ))}
                  </div>
                  {form.learnerName && <p className="text-[11px] text-green-600 mt-1">Selected: {form.learnerName}</p>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Category *</label>
                  <select required value={form.category} onChange={set('category')} className="input">
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Severity *</label>
                  <select required value={form.severity} onChange={set('severity')} className="input">
                    <option value="minor">Minor</option>
                    <option value="moderate">Moderate</option>
                    <option value="major">Major</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
              <div><label className="label">Description *</label><textarea required value={form.description} onChange={set('description') as any} rows={3} className="input resize-none" placeholder="Factual description of what happened…"/></div>
              <div><label className="label">Action Taken</label><input value={form.actionTaken} onChange={set('actionTaken')} className="input" placeholder="Verbal warning, detention, parent call…"/></div>
              <label className="flex items-center gap-2 text-sm text-theme cursor-pointer">
                <input type="checkbox" checked={form.parentNotified} onChange={set('parentNotified') as any} className="accent-[#1a2e5a]"/>
                Parent has been notified
              </label>
              {(form.severity === 'major' || form.severity === 'critical') && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                  ⚠ Suspensions and expulsions for major/critical incidents require HOI approval before taking effect.
                </div>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowNew(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? <><Loader2 size={14} className="animate-spin"/> Saving…</> : 'Record Incident'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
