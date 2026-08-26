'use client';
import { useState, useEffect } from 'react';
import { FileText, Sparkles, CheckCircle, Clock, XCircle, Loader2, X, ChevronRight, ChevronLeft, BookOpen } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, isHoi, isTeacher } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

const STATUS_CONF: Record<string, { label: string; className: string; icon: any }> = {
  draft:              { label:'Draft',              className:'bg-gray-100 text-gray-600',   icon: FileText       },
  submitted:          { label:'Submitted',          className:'bg-blue-100 text-blue-700',   icon: Clock          },
  approved:           { label:'Approved',           className:'bg-green-100 text-green-700', icon: CheckCircle    },
  rejected:           { label:'Rejected',           className:'bg-red-100 text-red-700',     icon: XCircle        },
  revision_requested: { label:'Needs Revision',     className:'bg-amber-100 text-amber-700', icon: Clock          },
};

const GRADES = ['pp1','pp2','grade_1','grade_2','grade_3','grade_4','grade_5','grade_6','grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'];
const gradeLabel = (g: string) => g.replace('_',' ').replace(/\b\w/g, (c) => c.toUpperCase());

function StatusBadge({ status }: { status: string }) {
  const conf = STATUS_CONF[status] || STATUS_CONF.draft;
  const Icon = conf.icon;
  return <span className={`badge ${conf.className}`}><Icon size={10} className="mr-1"/> {conf.label}</span>;
}

export default function ProfessionalRecordsPage() {
  const { user } = useAuth();
  const teacher = isTeacher(user?.role || '');
  const hoi = isHoi(user?.role || '');

  const [tab, setTab] = useState<'schemes'|'plans'|'notes'|'pending'>('schemes');
  const [streams, setStreams] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [myAssignments, setMyAssignments] = useState<{ streamId: string; subjects: string[] }[]>([]);

  const [schemes, setSchemes] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [pending, setPending] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [openScheme, setOpenScheme] = useState<any>(null); // scheme + weeks, when drilled in
  const [showNewScheme, setShowNewScheme] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [form, setForm] = useState({
    streamId: '', subjectId: '', gradeLevel: 'grade_4',
    term: 'term_1', academicYear: '2025/2026', totalWeeks: 12, periodsPerWeek: 5,
    phone: '',
  });
  const [payStep, setPayStep] = useState<'form'|'waiting'>('form');

  useEffect(() => {
    if (!user) return;
    apiClient.get('/professional-records/subjects').then(r => setSubjects(r.data || [])).catch(() => setSubjects([]));
    Promise.all([
      apiClient.get('/academic/streams').catch(() => ({ data: [] })),
      teacher ? apiClient.get(`/academic/teachers/${user.id}/stream-subjects`).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
    ]).then(([allStreams, assignments]) => {
      const all = allStreams.data || [];
      const mine: { streamId: string; subjects: string[] }[] = assignments.data || [];
      setMyAssignments(mine);
      if (!teacher) { setStreams(all); return; }
      const assignedIds = new Set(mine.map(r => String(r.streamId)));
      const mineStreams = all.filter((s: any) => assignedIds.has(String(s.id)) || s.classTeacherId === user.id);
      setStreams(mineStreams.length ? mineStreams : all);
    });
  }, [user, teacher]);

  // Subjects a teacher may pick for the currently-selected stream — the full assignment
  // list if they're that stream's class teacher (no per-subject record), otherwise only
  // subjects they're explicitly assigned to teach there.
  const allowedSubjectNames = (() => {
    if (!teacher || !form.streamId) return null;
    const stream = streams.find((s: any) => s.id === form.streamId);
    if (stream?.classTeacherId === user?.id) return null;
    const row = myAssignments.find(r => String(r.streamId) === String(form.streamId));
    return row ? row.subjects : [];
  })();
  const availableSubjects = allowedSubjectNames
    ? subjects.filter((s: any) => allowedSubjectNames.some(a => a.toLowerCase() === String(s.name).toLowerCase()))
    : subjects;

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get('/professional-records/schemes').catch(() => ({ data: [] })),
      apiClient.get('/professional-records/lesson-plans').catch(() => ({ data: [] })),
      apiClient.get('/professional-records/lesson-notes').catch(() => ({ data: [] })),
      hoi ? apiClient.get('/professional-records/pending-approvals').catch(() => ({ data: null })) : Promise.resolve({ data: null }),
    ]).then(([s, p, n, pend]) => {
      setSchemes(s.data || []);
      setPlans(p.data || []);
      setNotes(n.data || []);
      setPending(pend.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  // Pay-per-flow: KES 50 via M-Pesa unlocks one Scheme of Work plus every lesson
  // plan and lesson notes record generated from it. No subscription involved.
  const payAndGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.streamId || !form.subjectId) { toast.error('Select a stream and subject.'); return; }
    if (!form.phone) { toast.error('Enter the M-Pesa phone number to pay with.'); return; }

    setGenerating(true);
    try {
      const { data } = await apiClient.post('/professional-records/purchase/initiate', { phone: form.phone });
      toast.success(data.message || 'Check your phone for the M-Pesa prompt.');
      setPayStep('waiting');

      const purchaseId = data.purchaseId;
      let paid = false;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const { data: s } = await apiClient.get(`/professional-records/purchase/status/${purchaseId}`);
        if (s.status === 'paid') { paid = true; break; }
        if (s.status === 'failed') { toast.error('Payment failed or was cancelled.'); break; }
      }
      if (!paid) {
        if (payStep === 'waiting') toast.error('Payment not confirmed in time. Please try again.');
        setPayStep('form');
        setGenerating(false);
        return;
      }

      const subject = subjects.find((s: any) => s.id === form.subjectId);
      await apiClient.post('/professional-records/schemes/generate', {
        streamId: form.streamId,
        subjectId: form.subjectId,
        subjectName: subject?.name || 'Subject',
        gradeLevel: form.gradeLevel,
        academicYear: form.academicYear,
        term: form.term,
        totalWeeks: Number(form.totalWeeks) || 12,
        periodsPerWeek: Number(form.periodsPerWeek) || 5,
      });
      toast.success('Payment confirmed — scheme of work generated! Review and submit when ready.');
      setShowNewScheme(false);
      setPayStep('form');
      load();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not complete payment/generation.'); }
    finally { setGenerating(false); }
  };

  const openSchemeDetail = async (id: string) => {
    try {
      const { data } = await apiClient.get(`/professional-records/schemes/${id}`);
      setOpenScheme(data);
    } catch { toast.error('Could not load scheme.'); }
  };

  const submitScheme = async (id: string) => {
    try { await apiClient.post(`/professional-records/schemes/${id}/submit`); toast.success('Submitted for HOI approval!'); load(); if (openScheme?.id === id) openSchemeDetail(id); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Could not submit.'); }
  };
  const reviewScheme = async (id: string, action: 'approved'|'rejected'|'revision_requested') => {
    const comment = action === 'approved' ? undefined : (prompt('Comment for the teacher:') || undefined);
    try { await apiClient.patch(`/professional-records/schemes/${id}/review`, { action, comment }); toast.success(`Scheme ${action}.`); load(); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Could not review.'); }
  };

  const generateLessonPlan = async (schemeId: string, schemeWeekId: string) => {
    try {
      const { data } = await apiClient.post('/professional-records/lesson-plans/generate', { schemeId, schemeWeekId });
      toast.success('Lesson plan generated.');
      load();
      return data;
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not generate lesson plan.'); }
  };

  const submitLessonPlan = async (id: string) => {
    try { await apiClient.post(`/professional-records/lesson-plans/${id}/submit`); toast.success('Lesson plan submitted!'); load(); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Could not submit.'); }
  };
  const reviewLessonPlan = async (id: string, action: 'approved'|'rejected'|'revision_requested') => {
    const comment = action === 'approved' ? undefined : (prompt('Comment for the teacher:') || undefined);
    try { await apiClient.patch(`/professional-records/lesson-plans/${id}/review`, { action, comment }); toast.success(`Lesson plan ${action}.`); load(); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Could not review.'); }
  };

  const generateLessonNotes = async (lessonPlanId: string) => {
    try { await apiClient.post('/professional-records/lesson-notes/generate', { lessonPlanId }); toast.success('Lesson notes generated.'); load(); setTab('notes'); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Could not generate lesson notes.'); }
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Professional Records</h1>
          <p className="text-sm text-theme-muted">AI-generated · KICD CBC aligned · HOI approval workflow</p>
        </div>
        {teacher && !openScheme && (
          <button onClick={() => setShowNewScheme(true)} className="btn-primary">
            <Sparkles size={16}/> Generate Scheme of Work
          </button>
        )}
      </div>

      {/* Tabs */}
      {!openScheme && (
        <div className="flex border-b border-theme gap-1 overflow-x-auto">
          {[
            { key:'schemes', label:'📋 Schemes of Work' },
            { key:'plans',   label:'📝 Lesson Plans'   },
            { key:'notes',   label:'🗒️ Lesson Notes'   },
            ...(hoi ? [{ key:'pending', label:`⏳ Pending Approval${pending?.total ? ` (${pending.total})` : ''}` }] : []),
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${tab===t.key?'border-[#1a2e5a] text-theme-heading':'border-transparent text-theme-muted hover:text-theme-heading'}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 shimmer rounded-xl"/>)}</div>
      ) : openScheme ? (
        <SchemeDetail
          scheme={openScheme}
          teacher={teacher}
          hoi={hoi}
          onBack={() => setOpenScheme(null)}
          onSubmit={() => submitScheme(openScheme.id)}
          onReview={(a: any) => reviewScheme(openScheme.id, a)}
          onGenerateLessonPlan={generateLessonPlan}
        />
      ) : tab === 'schemes' ? (
        schemes.length === 0 ? (
          <EmptyState label="No schemes of work yet" cta={teacher ? { label: 'Generate First Scheme', onClick: () => setShowNewScheme(true) } : undefined}/>
        ) : (
          <div className="space-y-3">
            {schemes.map((s: any) => (
              <div key={s.id} className="card p-4 cursor-pointer hover:shadow-md" onClick={() => openSchemeDetail(s.id)}>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#1a2e5a] flex items-center justify-center flex-shrink-0">
                    <FileText size={18} className="text-[#d4af37]"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-theme-heading">{s.title}</span>
                      <StatusBadge status={s.status}/>
                      {s.aiGenerated && <span className="badge bg-purple-100 text-purple-700"><Sparkles size={10} className="mr-1"/> AI Generated</span>}
                    </div>
                    <p className="text-xs text-theme-muted mt-1">{gradeLabel(s.gradeLevel)} · {s.term?.replace('_',' ')} · {s.academicYear}</p>
                    {s.reviewComment && (
                      <p className="text-xs mt-1.5 bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1 rounded">HOI: {s.reviewComment}</p>
                    )}
                  </div>
                  <ChevronRight size={18} className="text-theme-muted flex-shrink-0 mt-2"/>
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === 'plans' ? (
        plans.length === 0 ? <EmptyState label="No lesson plans yet — generate one from a scheme week"/> : (
          <div className="space-y-3">
            {plans.map((p: any) => (
              <div key={p.id} className="card p-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#1a2e5a] flex items-center justify-center flex-shrink-0"><BookOpen size={18} className="text-[#d4af37]"/></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-theme-heading">{p.strand} — {p.subStrand}</span>
                      <StatusBadge status={p.status}/>
                    </div>
                    <p className="text-xs text-theme-muted mt-1">{gradeLabel(p.gradeLevel)} · {p.durationMinutes} min{p.lessonDate ? ` · ${String(p.lessonDate).slice(0,10)}` : ''}</p>
                    {p.reviewComment && <p className="text-xs mt-1.5 bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1 rounded">HOI: {p.reviewComment}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                    {p.status === 'draft' && teacher && <button onClick={() => submitLessonPlan(p.id)} className="btn-ghost text-xs py-1.5 px-3">Submit →</button>}
                    {p.status === 'approved' && teacher && <button onClick={() => generateLessonNotes(p.id)} className="btn-ghost text-xs py-1.5 px-3"><Sparkles size={12}/> Notes</button>}
                    {p.status === 'submitted' && hoi && (
                      <>
                        <button onClick={() => reviewLessonPlan(p.id,'approved')} className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg hover:bg-green-700">Approve</button>
                        <button onClick={() => reviewLessonPlan(p.id,'rejected')} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg hover:bg-red-200">Reject</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === 'notes' ? (
        notes.length === 0 ? <EmptyState label="No lesson notes yet — generate one from an approved lesson plan"/> : (
          <div className="space-y-3">
            {notes.map((n: any) => (
              <div key={n.id} className="card p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-theme-heading">{n.topic}</span>
                  {n.subTopic && <span className="text-xs text-theme-muted">— {n.subTopic}</span>}
                  <StatusBadge status={n.status}/>
                </div>
                <p className="text-xs text-theme-muted mt-1">{gradeLabel(n.gradeLevel)} · {String(n.lessonDate).slice(0,10)}</p>
              </div>
            ))}
          </div>
        )
      ) : tab === 'pending' && hoi ? (
        <PendingApprovals pending={pending} onReviewScheme={reviewScheme} onReviewPlan={reviewLessonPlan} onOpenScheme={openSchemeDetail}/>
      ) : null}

      {/* Generate Scheme Modal */}
      {showNewScheme && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <div>
                <h3 className="text-lg font-bold text-theme-heading">Generate Scheme of Work</h3>
                <p className="text-xs text-theme-muted mt-0.5">ZARODA will generate a full KICD-aligned scheme</p>
              </div>
              <button onClick={() => setShowNewScheme(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={payAndGenerate} className="p-5 space-y-4">
              <div>
                <label className="label">Stream / Class *</label>
                <select required value={form.streamId}
                  onChange={(e) => setForm(f => ({ ...f, streamId: e.target.value, subjectId: '' }))}
                  className="input">
                  <option value="">Select a stream…</option>
                  {streams.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Subject *</label>
                <select required value={form.subjectId} onChange={set('subjectId')} className="input" disabled={!form.streamId}>
                  <option value="">{form.streamId ? 'Select a subject…' : 'Select a stream first…'}</option>
                  {availableSubjects.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {form.streamId && availableSubjects.length === 0 && (
                  <p className="text-xs text-red-600 mt-1">You are not assigned to teach any subject for this class.</p>
                )}
              </div>
              <div>
                <label className="label">Grade Level *</label>
                <select required value={form.gradeLevel} onChange={set('gradeLevel')} className="input">
                  {GRADES.map(g => <option key={g} value={g}>{gradeLabel(g)}</option>)}
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Total Weeks</label>
                  <input type="number" min={1} max={16} value={form.totalWeeks} onChange={set('totalWeeks')} className="input"/>
                </div>
                <div>
                  <label className="label">Periods / Week</label>
                  <input type="number" min={1} max={10} value={form.periodsPerWeek} onChange={set('periodsPerWeek')} className="input"/>
                </div>
              </div>
              <div>
                <label className="label">M-Pesa Phone Number *</label>
                <input required type="tel" placeholder="07XXXXXXXX" value={form.phone}
                  onChange={set('phone')} className="input" disabled={payStep === 'waiting'}/>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-700">
                <Sparkles size={12} className="inline mr-1"/>
                KES 50 via M-Pesa unlocks this Scheme of Work plus every lesson plan and lesson
                notes record you generate from it — no subscription, pay once per scheme.
              </div>
              {payStep === 'waiting' && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin flex-shrink-0"/>
                  Waiting for M-Pesa confirmation on your phone…
                </div>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowNewScheme(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={generating} className="btn-primary flex-1">
                  {generating
                    ? <><Loader2 size={14} className="animate-spin"/> {payStep === 'waiting' ? 'Confirming payment…' : 'Starting payment…'}</>
                    : <><Sparkles size={14}/> Pay KES 50 &amp; Generate</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ label, cta }: { label: string; cta?: { label: string; onClick: () => void } }) {
  return (
    <div className="card p-10 text-center">
      <FileText size={36} className="mx-auto text-[#e2e6f0] mb-2"/>
      <p className="text-theme-muted font-medium">{label}</p>
      {cta && <button onClick={cta.onClick} className="btn-primary mt-4"><Sparkles size={16}/> {cta.label}</button>}
    </div>
  );
}

function SchemeDetail({ scheme, teacher, hoi, onBack, onSubmit, onReview, onGenerateLessonPlan }: any) {
  const [busyWeek, setBusyWeek] = useState<string | null>(null);
  const weeks = [...(scheme.weeks || [])].sort((a: any, b: any) => a.weekNumber - b.weekNumber);

  const handleGenPlan = async (weekId: string) => {
    setBusyWeek(weekId);
    await onGenerateLessonPlan(scheme.id, weekId);
    setBusyWeek(null);
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="btn-ghost text-xs"><ChevronLeft size={14}/> Back to schemes</button>
      <div className="card p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-theme-heading">{scheme.title}</h2>
              <StatusBadge status={scheme.status}/>
            </div>
            <p className="text-xs text-theme-muted mt-1">{gradeLabel(scheme.gradeLevel)} · {scheme.term?.replace('_',' ')} · {scheme.academicYear} · {weeks.length} weeks</p>
            {scheme.reviewComment && <p className="text-xs mt-2 bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1 rounded">HOI: {scheme.reviewComment}</p>}
          </div>
          <div className="flex gap-2">
            {(scheme.status === 'draft' || scheme.status === 'revision_requested') && teacher && (
              <button onClick={onSubmit} className="btn-primary text-sm">Submit for Approval</button>
            )}
            {scheme.status === 'submitted' && hoi && (
              <>
                <button onClick={() => onReview('approved')} className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700">Approve</button>
                <button onClick={() => onReview('rejected')} className="text-sm bg-red-100 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-200">Reject</button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {weeks.map((w: any) => (
          <div key={w.id} className="card p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-theme-heading">Week {w.weekNumber} — {w.strand} / {w.subStrand}</div>
                {w.dates && <p className="text-xs text-theme-muted">{w.dates}</p>}
                <p className="text-sm mt-2"><span className="font-semibold">SLOs:</span> {w.specificLearningOutcomes}</p>
                {w.keyInquiryQuestions && <p className="text-sm mt-1"><span className="font-semibold">Key Inquiry Questions:</span> {w.keyInquiryQuestions}</p>}
                {w.learningExperiences && <p className="text-sm mt-1"><span className="font-semibold">Learning Experiences:</span> {w.learningExperiences}</p>}
                {w.learningResources && <p className="text-sm mt-1"><span className="font-semibold">Resources:</span> {w.learningResources}</p>}
                {w.assessmentMethods && <p className="text-sm mt-1"><span className="font-semibold">Assessment:</span> {w.assessmentMethods}</p>}
              </div>
              {teacher && (
                <button onClick={() => handleGenPlan(w.id)} disabled={busyWeek === w.id} className="btn-ghost text-xs py-1.5 px-3 flex-shrink-0">
                  {busyWeek === w.id ? <><Loader2 size={12} className="animate-spin"/> Generating…</> : <><Sparkles size={12}/> Lesson Plan</>}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PendingApprovals({ pending, onReviewScheme, onReviewPlan, onOpenScheme }: any) {
  if (!pending) return <div className="card p-10 text-center text-theme-muted">Loading…</div>;
  if (pending.total === 0) {
    return <div className="card p-10 text-center"><CheckCircle size={36} className="mx-auto text-green-300 mb-2"/><p className="text-theme-muted font-medium">Nothing pending — you're all caught up.</p></div>;
  }
  return (
    <div className="space-y-5">
      {pending.schemesOfWork?.length > 0 && (
        <div>
          <h3 className="font-bold text-theme-heading mb-2">Schemes of Work</h3>
          <div className="space-y-2">
            {pending.schemesOfWork.map((s: any) => (
              <div key={s.id} className="card p-3 flex items-center justify-between gap-3">
                <button onClick={() => onOpenScheme(s.id)} className="text-left flex-1 min-w-0">
                  <span className="font-semibold text-theme-heading">{s.title}</span>
                  <p className="text-xs text-theme-muted">{s.term?.replace('_',' ')} · {s.academicYear}</p>
                </button>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => onReviewScheme(s.id,'approved')} className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg hover:bg-green-700">Approve</button>
                  <button onClick={() => onReviewScheme(s.id,'rejected')} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg hover:bg-red-200">Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {pending.lessonPlans?.length > 0 && (
        <div>
          <h3 className="font-bold text-theme-heading mb-2">Lesson Plans</h3>
          <div className="space-y-2">
            {pending.lessonPlans.map((p: any) => (
              <div key={p.id} className="card p-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-theme-heading">{p.strand} — {p.subStrand}</span>
                  <p className="text-xs text-theme-muted">{gradeLabel(p.gradeLevel)}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => onReviewPlan(p.id,'approved')} className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg hover:bg-green-700">Approve</button>
                  <button onClick={() => onReviewPlan(p.id,'rejected')} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg hover:bg-red-200">Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {pending.lessonNotes?.length > 0 && (
        <div>
          <h3 className="font-bold text-theme-heading mb-2">Lesson Notes</h3>
          <div className="space-y-2">
            {pending.lessonNotes.map((n: any) => (
              <div key={n.id} className="card p-3">
                <span className="font-semibold text-theme-heading">{n.topic}</span>
                <p className="text-xs text-theme-muted">{n.subTopic}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
