'use client';
import { useState, useEffect } from 'react';
import { FileText, Plus, Sparkles, CheckCircle, Clock, XCircle, Loader2, X, ChevronRight } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, isHoi, isTeacher } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';
import { SchemeButton } from '@/components/pdf/pdf-buttons';

const STATUS_CONF: Record<string, { label: string; className: string; icon: any }> = {
  draft:              { label:'Draft',              className:'bg-gray-100 text-gray-600',   icon: FileText       },
  submitted:          { label:'Submitted',          className:'bg-blue-100 text-blue-700',   icon: Clock          },
  approved:           { label:'Approved',           className:'bg-green-100 text-green-700', icon: CheckCircle    },
  rejected:           { label:'Rejected',           className:'bg-red-100 text-red-700',     icon: XCircle        },
  revision_requested: { label:'Needs Revision',     className:'bg-amber-100 text-amber-700', icon: Clock          },
};

const SUBJECTS = ['Mathematics','English','Kiswahili','Science & Technology','Social Studies','Creative Arts','Agriculture','Home Science','Physical & Health Education','IRE','CRE','HRE'];
const GRADES   = ['PP1','PP2','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'];

export default function ProfessionalRecordsPage() {
  const { user } = useAuth();
  const [tab,      setTab]      = useState<'schemes'|'plans'|'pending'>('schemes');
  const [schemes,  setSchemes]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showNew,  setShowNew]  = useState(false);
  const [generating,setGenerating]=useState(false);
  const [form,     setForm]     = useState({ subject:'Mathematics', grade:'Grade 4', term:'term_1', academicYear:'2025/2026' });

  const load = () => {
    setLoading(true);
    apiClient.get('/professional-records/schemes')
      .then(r => setSchemes(r.data))
      .catch(() => toast.error('Could not load schemes'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const { data } = await apiClient.post('/professional-records/schemes/generate', form);
      toast.success('Scheme of Work generated! Review and submit when ready.');
      setShowNew(false);
      load();
    } catch { toast.error('Generation failed. Please try again, or contact support if it persists.'); }
    finally { setGenerating(false); }
  };

  const approve  = async (id: string) => {
    await apiClient.patch(`/professional-records/schemes/${id}/approve`);
    toast.success('Approved!'); load();
  };
  const reject   = async (id: string) => {
    const comment = prompt('Rejection reason (will be sent to teacher):');
    if (!comment) return;
    await apiClient.patch(`/professional-records/schemes/${id}/reject`, { comment });
    toast.success('Rejected with comment.'); load();
  };
  const submit   = async (id: string) => {
    await apiClient.patch(`/professional-records/schemes/${id}/submit`);
    toast.success('Submitted for HOI approval!'); load();
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Professional Records</h1>
          <p className="text-sm text-theme-muted">AI-generated · KICD CBC aligned · HOI approval workflow</p>
        </div>
        {isTeacher(user?.role || '') && (
          <button onClick={() => setShowNew(true)} className="btn-primary">
            <Sparkles size={16}/> Generate with AI
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-theme gap-1">
        {[
          { key:'schemes', label:'📋 Schemes of Work' },
          { key:'plans',   label:'📝 Lesson Plans'   },
          ...(isHoi(user?.role||'') ? [{ key:'pending', label:'⏳ Pending Approval' }] : []),
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${tab===t.key?'border-[#1a2e5a] text-theme-heading':'border-transparent text-theme-muted hover:text-theme-heading'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 shimmer rounded-xl"/>)}</div>
      ) : schemes.length === 0 ? (
        <div className="card p-10 text-center">
          <FileText size={36} className="mx-auto text-[#e2e6f0] mb-2"/>
          <p className="text-theme-muted font-medium">No schemes of work yet</p>
          {isTeacher(user?.role||'') && (
            <button onClick={() => setShowNew(true)} className="btn-primary mt-4">
              <Sparkles size={16}/> Generate First Scheme
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {schemes.map((s: any) => {
            const conf = STATUS_CONF[s.status] || STATUS_CONF.draft;
            const Icon = conf.icon;
            return (
              <div key={s.id} className="card p-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#1a2e5a] flex items-center justify-center flex-shrink-0">
                    <FileText size={18} className="text-[#d4af37]"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-theme-heading">{s.subject} — {s.grade}</span>
                      <span className={`badge ${conf.className}`}>
                        <Icon size={10} className="mr-1"/> {conf.label}
                      </span>
                      {s.isAiGenerated && (
                        <span className="badge bg-purple-100 text-purple-700">
                          <Sparkles size={10} className="mr-1"/> AI Generated
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-theme-muted mt-1">{s.term?.replace('_',' ')} · {s.academicYear} · {s.weeks?.length || 0} weeks</p>
                    {s.hoiComment && (
                      <p className="text-xs mt-1.5 bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1 rounded">
                        HOI: {s.hoiComment}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                    <SchemeButton schemeId={s.id} title={`${s.subject} ${s.grade}`} compact/>
                    {s.status === 'draft' && isTeacher(user?.role||'') && (
                      <button onClick={() => submit(s.id)} className="btn-ghost text-xs py-1.5 px-3">Submit →</button>
                    )}
                    {s.status === 'submitted' && isHoi(user?.role||'') && (
                      <>
                        <button onClick={() => approve(s.id)} className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg hover:bg-green-700">Approve</button>
                        <button onClick={() => reject(s.id)}  className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg hover:bg-red-200">Reject</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Generate Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <div>
                <h3 className="text-lg font-bold text-theme-heading">Generate Scheme of Work</h3>
                <p className="text-xs text-theme-muted mt-0.5">ZARODA will generate a full KICD-aligned 14-week scheme</p>
              </div>
              <button onClick={() => setShowNew(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={generate} className="p-5 space-y-4">
              <div>
                <label className="label">Subject *</label>
                <select required value={form.subject} onChange={set('subject')} className="input">
                  {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Grade / Class *</label>
                <select required value={form.grade} onChange={set('grade')} className="input">
                  {GRADES.map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Term</label>
                  <select value={form.term} onChange={set('term')} className="input">
                    <option value="term_1">Term 1</option>
                    <option value="term_2">Term 2</option>
                    <option value="term_3">Term 3</option>
                  </select>
                </div>
                <div>
                  <label className="label">Academic Year</label>
                  <select value={form.academicYear} onChange={set('academicYear')} className="input">
                    <option>2025/2026</option>
                    <option>2026/2027</option>
                  </select>
                </div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-700">
                <Sparkles size={12} className="inline mr-1"/>
                AI will generate all strands, sub-strands, SLOs, Key Inquiry Questions, and learning activities for every week. Takes 15–30 seconds.
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowNew(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={generating} className="btn-primary flex-1">
                  {generating
                    ? <><Loader2 size={14} className="animate-spin"/> Generating…</>
                    : <><Sparkles size={14}/> Generate</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
