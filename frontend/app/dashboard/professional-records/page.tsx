'use client';
import { useState, useEffect } from 'react';
import { FileText, Sparkles, CheckCircle, Clock, XCircle, Loader2, X, ChevronRight, ChevronLeft, BookOpen, Star } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, isHoi, isTeacher, isIndividualAccount } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

const STATUS_CONF: Record<string, { label: string; className: string; icon: any }> = {
  draft:              { label:'Draft',              className:'bg-gray-100 text-gray-600',   icon: FileText       },
  submitted:          { label:'Submitted',          className:'bg-blue-100 text-blue-700',   icon: Clock          },
  approved:           { label:'Approved',           className:'bg-green-100 text-green-700', icon: CheckCircle    },
  rejected:           { label:'Rejected',           className:'bg-red-100 text-red-700',     icon: XCircle        },
  revision_requested: { label:'Needs Revision',     className:'bg-amber-100 text-amber-700', icon: Clock          },
};

// Kept in sync with ITEM_PRICE_KES in the backend's wallet.service.ts.
const ITEM_PRICES = { scheme: 30, lesson_plan: 2, lesson_notes: 2 };

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
  const individual = isIndividualAccount(user?.accountType);
  // An admin who also teaches a learning area can generate/submit their own
  // records exactly like a teacher — the backend already allows this.
  const canGenerate = teacher || hoi;

  const [tab, setTab] = useState<'schemes'|'plans'|'notes'|'pending'>('schemes');
  const [streams, setStreams] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [myAssignments, setMyAssignments] = useState<{ streamId: string; subjects: string[] }[]>([]);

  const [schemes, setSchemes] = useState<any[]>([]);
  const [guideDismissed, setGuideDismissed] = useState(true);
  useEffect(() => {
    if (user?.id) setGuideDismissed(localStorage.getItem(`pr-guide-dismissed:${user.id}`) === '1');
  }, [user?.id]);
  const dismissGuide = () => {
    setGuideDismissed(true);
    if (user?.id) localStorage.setItem(`pr-guide-dismissed:${user.id}`, '1');
  };

  // Individual accounts never see the main /dashboard (they're redirected straight
  // here), so this is where they get the "share your experience" testimonial prompt
  // that school-account users see on their dashboard home instead.
  const [testimonialDismissed, setTestimonialDismissed] = useState(true);
  const [showTestimonialForm, setShowTestimonialForm] = useState(false);
  const [myTestimonial, setMyTestimonial] = useState<any>(null);
  const [testimonialForm, setTestimonialForm] = useState({ message: '', rating: 5, allowPublicUse: true });
  const [submittingTestimonial, setSubmittingTestimonial] = useState(false);
  useEffect(() => {
    if (!individual || !user) return;
    if (localStorage.getItem(`testimonial-dismissed:${user.id}`) === '1') { setTestimonialDismissed(true); return; }
    apiClient.get('/testimonials/mine').then(r => {
      setMyTestimonial(r.data?.testimonial || null);
      setTestimonialDismissed(false);
    }).catch(() => {});
  }, [individual, user]);
  const dismissTestimonial = () => {
    setTestimonialDismissed(true);
    if (user) localStorage.setItem(`testimonial-dismissed:${user.id}`, '1');
  };
  const submitTestimonial = async () => {
    if (!testimonialForm.message.trim()) return;
    setSubmittingTestimonial(true);
    try {
      const { data } = await apiClient.post('/testimonials', testimonialForm);
      toast.success('Thank you — your experience has been recorded!');
      setShowTestimonialForm(false);
      setMyTestimonial({ id: data?.id, message: testimonialForm.message, rating: testimonialForm.rating });
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Could not submit — try again.'); }
    finally { setSubmittingTestimonial(false); }
  };
  const deleteMyTestimonial = async () => {
    if (!myTestimonial?.id) return;
    try { await apiClient.delete(`/testimonials/${myTestimonial.id}`); toast.success('Testimonial removed.'); setMyTestimonial(null); }
    catch { toast.error('Could not remove — try again.'); }
  };
  const [plans, setPlans] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [pending, setPending] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [openScheme, setOpenScheme] = useState<any>(null); // scheme + weeks, when drilled in
  const [openPlan, setOpenPlan] = useState<any>(null);
  const [openNotes, setOpenNotes] = useState<any>(null);
  const [showNewScheme, setShowNewScheme] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [wallet, setWallet] = useState<{ balance: number } | null>(null);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [topUpForm, setTopUpForm] = useState({ phone: '', amount: 100 });
  const [topUpStep, setTopUpStep] = useState<'form'|'waiting'>('form');
  const [toppingUp, setToppingUp] = useState(false);

  const loadWallet = () => apiClient.get('/professional-records/wallet').then(r => setWallet(r.data)).catch(() => {});

  const [form, setForm] = useState({
    schoolName: '', teacherName: '', tscNumber: '', signOffLine: 'Checked by D.H.O.I.',
    streamId: '', subjectId: '', streamName: '', subjectName: '', gradeLevel: 'grade_4', curriculumEdition: '',
    term: 'term_1', academicYear: '2025/2026', startWeek: 1, totalWeeks: 12, periodsPerWeek: 5, doubleLessonSlots: '',
    strands: '', notes: '', specialWeeks: '',
    columns: { keyInquiry: true, learningExperiences: true, resources: true, assessment: true, reflection: true, corePV: false },
    format: 'preview' as 'pdf' | 'doc' | 'preview',
    font: 'Times New Roman',
  });

  useEffect(() => {
    if (!user) return;
    setForm(f => ({ ...f, teacherName: f.teacherName || `${user.firstName || ''} ${user.lastName || ''}`.trim() }));
    // An individual account has no real streams/subject_catalogue to pick from — the
    // generate form uses free-text inputs for it instead, so skip these lookups.
    if (individual) return;
    apiClient.get('/schools/settings').then(r => {
      const name = r.data?.schoolName;
      if (name) setForm(f => ({ ...f, schoolName: f.schoolName || name }));
    }).catch(() => {});
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
  }, [user, teacher, individual]);

  // Re-scope the Learning Area list to exactly what's taught in the selected stream —
  // since a stream is a single grade, this is also an automatic grade filter, and it
  // covers HOI/admin (who otherwise saw every subject school-wide with no stream picked).
  useEffect(() => {
    if (individual) return;
    const params = form.streamId ? { streamId: form.streamId } : undefined;
    apiClient.get('/professional-records/subjects', { params }).then(r => setSubjects(r.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.streamId, individual]);

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

  useEffect(() => { load(); loadWallet(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));
  const toggleColumn = (k: keyof typeof form.columns) =>
    setForm(f => ({ ...f, columns: { ...f.columns, [k]: !f.columns[k] } }));

  // Opens the printable scheme document — 'preview' just drills into the in-app
  // detail view (already a live preview), 'pdf' opens a print-ready tab, 'doc'
  // triggers a Word (.doc) download. Same server-rendered HTML underneath.
  //
  // Navigates directly to a blob URL rather than opening a blank tab and
  // document.write()-ing into it — some embedded/sandboxed browser contexts
  // silently block document.write into a fresh window with no visible error,
  // which looked like the Export button "doing nothing".
  const exportScheme = async (schemeId: string, format: 'pdf' | 'doc' | 'preview', font: string) => {
    if (format === 'preview') { openSchemeDetail(schemeId); return; }
    try {
      const res = await apiClient.get(`/professional-records/schemes/${schemeId}/html`, {
        params: { font, ...(format === 'doc' ? { download: 'doc' } : {}) },
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: format === 'doc' ? 'application/msword' : 'text/html' });
      const url = URL.createObjectURL(blob);

      if (format === 'doc') {
        const a = document.createElement('a');
        a.href = url; a.download = `scheme-of-work-${schemeId}.doc`;
        document.body.appendChild(a); a.click(); a.remove();
      } else {
        const win = window.open(url, '_blank');
        if (!win) toast.error('Please allow pop-ups to open the print view.');
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not open the document.');
    }
  };

  // Generic version of the same export flow, used by Lesson Plan / Lesson Notes
  // detail modals (both PDF-print and Word .doc, watermarked server-side).
  const exportDocument = async (
    url: string, filenamePrefix: string, format: 'pdf' | 'doc', font: string, extraParams: Record<string, string> = {},
  ) => {
    try {
      const res = await apiClient.get(url, {
        params: { font, ...(format === 'doc' ? { download: 'doc' } : {}), ...extraParams },
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: format === 'doc' ? 'application/msword' : 'text/html' });
      const objUrl = URL.createObjectURL(blob);
      if (format === 'doc') {
        const a = document.createElement('a');
        a.href = objUrl; a.download = `${filenamePrefix}.doc`;
        document.body.appendChild(a); a.click(); a.remove();
      } else {
        const win = window.open(objUrl, '_blank');
        if (!win) toast.error('Please allow pop-ups to open the print view.');
      }
      setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not open the document.');
    }
  };

  // Wallet-based, per-item: the wallet is topped up separately (see topUpWallet
  // below); generating a scheme just debits ITEM_PRICES.scheme from the balance.
  const generateScheme = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.schoolName.trim()) { toast.error('Enter the school name — it is stamped as a watermark on the document.'); return; }
    if (individual) {
      if (!form.streamName || !form.subjectName) { toast.error('Enter a class/stream name and subject.'); return; }
    } else if (!form.streamId || !form.subjectId) {
      toast.error('Select a stream and subject.'); return;
    }

    setGenerating(true);
    try {
      const subject = subjects.find((s: any) => s.id === form.subjectId);
      const selectedColumns = Object.entries(form.columns).filter(([, on]) => on).map(([k]) => k);
      const specialWeeks = form.specialWeeks.split('\n').map(line => {
        const m = line.match(/^\D*(\d+)\D+(.+)$/);
        return m ? { week: Number(m[1]), label: m[2].trim() } : null;
      }).filter(Boolean);
      const { data: gen } = await apiClient.post('/professional-records/schemes/generate', {
        ...(individual
          ? { streamName: form.streamName, subjectName: form.subjectName }
          : { streamId: form.streamId, subjectId: form.subjectId, subjectName: subject?.name || 'Subject' }),
        gradeLevel: form.gradeLevel,
        academicYear: form.academicYear,
        term: form.term,
        startWeek: Number(form.startWeek) || 1,
        totalWeeks: Number(form.totalWeeks) || 12,
        periodsPerWeek: Number(form.periodsPerWeek) || 5,
        doubleLessonSlots: form.doubleLessonSlots.split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0),
        strandFocus: form.strands.split('\n').map(s => s.trim()).filter(Boolean),
        specialWeeks,
        schoolContext: form.notes || undefined,
        schoolName: form.schoolName || undefined,
        teacherName: form.teacherName || undefined,
        tscNumber: form.tscNumber || undefined,
        signOffLine: form.signOffLine || undefined,
        curriculumEdition: form.curriculumEdition || undefined,
        columns: selectedColumns,
        defaultFont: form.font,
      }, { timeout: 300000 }); // a full-term scheme is generated in several sequential AI calls (2 weeks at a time) and can take minutes
      toast.success(`Scheme of work generated (KES ${ITEM_PRICES.scheme} deducted from wallet). Review and submit when ready.`);
      setShowNewScheme(false);
      load();
      loadWallet();
      if (gen?.schemeId) exportScheme(gen.schemeId, form.format, form.font);
    } catch (err: any) {
      // A client-side timeout doesn't mean generation failed server-side — it may
      // well have completed after the response took too long to come back. Refresh
      // the list/wallet so a successful generation shows up instead of looking lost.
      if (err?.code === 'ECONNABORTED') {
        toast.error('Taking longer than expected — check the Schemes list, it may have completed.');
        load();
        loadWallet();
      } else {
        toast.error(err?.response?.data?.message || 'Could not generate scheme.');
      }
    }
    finally { setGenerating(false); }
  };

  // ── WALLET TOP-UP (M-Pesa STK push) ───────────────────────
  const topUpWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topUpForm.phone) { toast.error('Enter the M-Pesa phone number to pay with.'); return; }
    if (!topUpForm.amount || topUpForm.amount < 10) { toast.error('Enter an amount of at least KES 10.'); return; }

    setToppingUp(true);
    try {
      const { data } = await apiClient.post('/professional-records/wallet/topup', topUpForm);
      toast.success(data.message || 'Check your phone for the M-Pesa prompt.');
      setTopUpStep('waiting');

      const transactionId = data.transactionId;
      let paid = false;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const { data: s } = await apiClient.get(`/professional-records/wallet/topup/status/${transactionId}`);
        if (s.status === 'paid') { paid = true; break; }
        if (s.status === 'failed') { toast.error('Payment failed or was cancelled.'); break; }
      }
      if (!paid) {
        toast.error('Payment not confirmed in time. Please try again.');
        setTopUpStep('form');
        setToppingUp(false);
        return;
      }

      toast.success('Wallet topped up!');
      setShowTopUp(false);
      setTopUpStep('form');
      setTopUpForm(f => ({ ...f, phone: f.phone }));
      loadWallet();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not complete top-up.'); }
    finally { setToppingUp(false); }
  };

  const openSchemeDetail = async (id: string) => {
    try {
      const { data } = await apiClient.get(`/professional-records/schemes/${id}`);
      setOpenScheme(data);
    } catch { toast.error('Could not load scheme.'); }
  };

  const openPlanDetail = async (p: { id: string }) => {
    try {
      const { data } = await apiClient.get(`/professional-records/lesson-plans/${p.id}`);
      setOpenPlan(data);
    } catch { toast.error('Could not load lesson plan.'); }
  };

  // Edit-and-resubmit (free) for a scheme week that's a draft or was sent back for revision.
  const editSchemeWeek = async (weekId: string, fields: Record<string, any>) => {
    try {
      await apiClient.patch(`/professional-records/scheme-weeks/${weekId}`, fields);
      toast.success('Week updated.');
      if (openScheme) openSchemeDetail(openScheme.id);
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not save changes.'); }
  };

  const editLessonPlan = async (planId: string, fields: Record<string, any>) => {
    try {
      await apiClient.patch(`/professional-records/lesson-plans/${planId}`, fields);
      toast.success('Lesson plan updated.');
      openPlanDetail({ id: planId });
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not save changes.'); }
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

  const generateLessonPlan = async (schemeId: string, schemeWeekId: string, lessonSlot: number) => {
    try {
      const { data } = await apiClient.post('/professional-records/lesson-plans/generate', { schemeId, schemeWeekId, lessonSlot }, { timeout: 120000 });
      toast.success('Lesson plan generated.');
      load();
      loadWallet();
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
    try { await apiClient.post('/professional-records/lesson-notes/generate', { lessonPlanId }, { timeout: 120000 }); toast.success('Lesson notes generated.'); load(); loadWallet(); setTab('notes'); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Could not generate lesson notes.'); }
  };

  // Skips the lesson plan step entirely — notes generated straight from a scheme week.
  const generateLessonNotesFromWeek = async (schemeId: string, schemeWeekId: string, lessonSlot: number) => {
    try { await apiClient.post('/professional-records/lesson-notes/generate', { schemeId, schemeWeekId, lessonSlot }, { timeout: 120000 }); toast.success('Lesson notes generated.'); load(); loadWallet(); setTab('notes'); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Could not generate lesson notes.'); }
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Professional Records</h1>
          <p className="text-sm text-theme-muted">AI-generated · CBE KICD aligned · HOI approval workflow</p>
        </div>
        {canGenerate && !openScheme && (
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="text-center rounded-xl px-3 py-1.5 bg-[#1a2e5a] text-white">
              <div className="text-[10px] text-[#d4af37] uppercase tracking-wide leading-none">Wallet</div>
              <div className="font-bold text-sm leading-tight">KES {wallet?.balance ?? '…'}</div>
            </div>
            <button onClick={() => setShowTopUp(true)} className="btn-primary text-xs px-2.5 py-1.5">Top Up</button>
            <button onClick={() => setShowReferral(true)} className="btn-primary text-xs px-2.5 py-1.5">Refer &amp; Earn</button>
            <button onClick={() => setShowNewScheme(true)} className="btn-primary text-xs px-3 py-1.5 w-full sm:w-auto justify-center">
              <Sparkles size={14}/> Generate Scheme of Work
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      {!openScheme && (
        <div className="flex flex-wrap border-b border-theme gap-1">
          {[
            { key:'schemes', label:'📋 Schemes of Work' },
            { key:'plans',   label:'📝 Lesson Plans'   },
            { key:'notes',   label:'🗒️ Lesson Notes'   },
            ...(hoi ? [{ key:'pending', label:`⏳ Pending Approval${pending?.total ? ` (${pending.total})` : ''}` }] : []),
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${tab===t.key?'border-[#1a2e5a] text-theme-heading':'border-transparent text-theme-muted hover:text-theme-heading'}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Getting started guide for individual accounts ── */}
      {individual && !openScheme && schemes.length === 0 && !guideDismissed && (
        <div className="card p-5 border border-purple-200/60 bg-purple-50/40 relative">
          <button onClick={dismissGuide} className="absolute top-4 right-4 text-theme-muted hover:text-theme-heading"><X size={16}/></button>
          <h3 className="font-bold text-theme-heading mb-1">New here? Here's how to get your first documents</h3>
          <p className="text-sm text-theme-muted mb-3">
            Your individual account works differently from a school account — there's no HOI, so everything you generate is self-certified and approved automatically. Follow these 3 steps:
          </p>
          <ol className="space-y-2 text-sm text-theme-heading">
            <li className="flex gap-2"><span className="font-black text-purple-700">1.</span> Tap <b>Generate Scheme of Work</b> above, pick your subject, grade and term — you'll have a full term's scheme in seconds.</li>
            <li className="flex gap-2"><span className="font-black text-purple-700">2.</span> Open the scheme, pick a week/lesson, and tap <b>Lesson Plan</b> to generate that lesson's plan.</li>
            <li className="flex gap-2"><span className="font-black text-purple-700">3.</span> From the plan (or straight from the week), tap <b>Lesson Notes</b> for the content you'll actually teach from.</li>
          </ol>
          <p className="text-xs text-theme-muted mt-3">A scheme costs KES {ITEM_PRICES.scheme}, a lesson plan KES {ITEM_PRICES.lesson_plan}, and lesson notes KES {ITEM_PRICES.lesson_notes} — top up your wallet above first.</p>
        </div>
      )}

      {/* ── Share your experience (individual accounts only — they don't see /dashboard) ── */}
      {individual && !testimonialDismissed && (
        <div className="card p-5 border border-blue-200/60 bg-blue-50/40 relative">
          <button onClick={dismissTestimonial} className="absolute top-4 right-4 text-theme-muted hover:text-theme-heading"><X size={16}/></button>
          {myTestimonial ? (
            <>
              <h3 className="font-bold text-theme-heading mb-1">Your testimonial</h3>
              <p className="text-sm text-theme-muted italic mb-3">&ldquo;{myTestimonial.message}&rdquo;</p>
              <button onClick={deleteMyTestimonial} className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-200">Delete</button>
            </>
          ) : !showTestimonialForm ? (
            <>
              <h3 className="font-bold text-theme-heading mb-1">Share your experience with Zaroda</h3>
              <p className="text-sm text-theme-muted mb-3">A short testimonial helps us understand and showcase the real impact this system has on teaching and learning in Kenya.</p>
              <button onClick={() => setShowTestimonialForm(true)} className="btn-primary text-sm">Write a testimonial</button>
            </>
          ) : (
            <div className="space-y-3">
              <textarea
                value={testimonialForm.message}
                onChange={(e) => setTestimonialForm(f => ({ ...f, message: e.target.value }))}
                className="input resize-y" rows={4}
                placeholder="How has Zaroda changed the way you plan lessons or teach?"
              />
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} type="button" onClick={() => setTestimonialForm(f => ({ ...f, rating: n }))}>
                      <Star size={18} className={n <= testimonialForm.rating ? 'fill-[#d4af37] text-[#d4af37]' : 'text-theme-muted'}/>
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 text-xs text-theme-muted">
                  <input type="checkbox" checked={testimonialForm.allowPublicUse} onChange={(e) => setTestimonialForm(f => ({ ...f, allowPublicUse: e.target.checked }))}/>
                  OK to use publicly (with my name)
                </label>
              </div>
              <div className="flex gap-2">
                <button onClick={submitTestimonial} disabled={submittingTestimonial || !testimonialForm.message.trim()} className="btn-primary text-sm">
                  {submittingTestimonial ? 'Submitting…' : 'Submit'}
                </button>
                <button onClick={() => setShowTestimonialForm(false)} className="btn-ghost text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 shimmer rounded-xl"/>)}</div>
      ) : openScheme ? (
        <SchemeDetail
          scheme={openScheme}
          teacher={canGenerate}
          hoi={hoi}
          onBack={() => setOpenScheme(null)}
          onSubmit={() => submitScheme(openScheme.id)}
          onReview={(a: any) => reviewScheme(openScheme.id, a)}
          onGenerateLessonPlan={generateLessonPlan}
          onGenerateLessonNotes={generateLessonNotesFromWeek}
          onExport={(format: 'pdf' | 'doc' | 'preview', font: string) => exportScheme(openScheme.id, format, font)}
          onEditWeek={editSchemeWeek}
        />
      ) : tab === 'schemes' ? (
        schemes.length === 0 ? (
          <EmptyState label="No schemes of work yet" cta={canGenerate ? { label: 'Generate First Scheme', onClick: () => setShowNewScheme(true) } : undefined}/>
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
              <div key={p.id} className="card p-4 cursor-pointer hover:shadow-md" onClick={() => openPlanDetail(p)}>
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
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
                    {p.status === 'draft' && canGenerate && <button onClick={() => submitLessonPlan(p.id)} className="btn-ghost text-xs py-1.5 px-3">Submit →</button>}
                    {p.status === 'approved' && canGenerate && <button onClick={() => generateLessonNotes(p.id)} className="btn-ghost text-xs py-1.5 px-3"><Sparkles size={12}/> Notes</button>}
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
              <div key={n.id} className="card p-4 cursor-pointer hover:shadow-md" onClick={() => setOpenNotes(n)}>
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
        <PendingApprovals pending={pending} onReviewScheme={reviewScheme} onReviewPlan={reviewLessonPlan} onOpenScheme={openSchemeDetail} onOpenPlan={openPlanDetail} onOpenNotes={setOpenNotes}/>
      ) : null}

      {/* Generate Scheme Modal */}
      {showNewScheme && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-2xl my-8 mt-12">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <div>
                <h3 className="text-lg font-bold text-theme-heading">Generate Scheme of Work</h3>
                <p className="text-xs text-theme-muted mt-0.5">KICD-aligned CBC scheme, term-by-term</p>
              </div>
              <button onClick={() => setShowNewScheme(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={generateScheme} className="p-5 space-y-6">

              <fieldset className="space-y-3">
                <legend className="text-xs font-black uppercase tracking-wide text-[#1a2e5a] border-l-2 border-[#d4af37] pl-2 mb-1">Document header</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">School *</label>
                    <input required value={form.schoolName} onChange={set('schoolName')} className="input" placeholder="Stamped as a watermark on the document"/>
                  </div>
                  <div>
                    <label className="label">Teacher</label>
                    <input value={form.teacherName} onChange={set('teacherName')} className="input" placeholder="Full name as it appears on the record"/>
                  </div>
                  <div>
                    <label className="label">TSC number</label>
                    <input value={form.tscNumber} onChange={set('tscNumber')} className="input" placeholder="Optional"/>
                  </div>
                  <div>
                    <label className="label">Sign-off line</label>
                    <input value={form.signOffLine} onChange={set('signOffLine')} className="input"/>
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-xs font-black uppercase tracking-wide text-[#1a2e5a] border-l-2 border-[#d4af37] pl-2 mb-1">Class and learning area</legend>
                <div className="grid grid-cols-2 gap-3">
                  {individual ? (
                    <>
                      <div>
                        <label className="label">Stream / Class *</label>
                        <input required value={form.streamName} onChange={set('streamName')} className="input" placeholder="e.g. Grade 4 East"/>
                      </div>
                      <div>
                        <label className="label">Learning area *</label>
                        <input required value={form.subjectName} onChange={set('subjectName')} className="input" placeholder="e.g. Mathematics"/>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="label">Stream / Class *</label>
                        <select required value={form.streamId}
                          onChange={(e) => {
                            const streamId = e.target.value;
                            const stream = streams.find((s: any) => s.id === streamId);
                            setForm(f => ({ ...f, streamId, subjectId: '', gradeLevel: stream?.gradeLevel || f.gradeLevel }));
                          }}
                          className="input">
                          <option value="">Select a stream…</option>
                          {streams.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Learning area *</label>
                        <select required value={form.subjectId} onChange={set('subjectId')} className="input" disabled={!form.streamId}>
                          <option value="">{form.streamId ? 'Select a subject…' : 'Select a stream first…'}</option>
                          {availableSubjects.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        {form.streamId && availableSubjects.length === 0 && (
                          <p className="text-xs text-red-600 mt-1">You are not assigned to teach any subject for this class.</p>
                        )}
                      </div>
                    </>
                  )}
                  <div>
                    <label className="label">Grade *</label>
                    <select required value={form.gradeLevel} onChange={set('gradeLevel')} className="input">
                      {GRADES.map(g => <option key={g} value={g}>{gradeLabel(g)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Term *</label>
                    <select value={form.term} onChange={set('term')} className="input">
                      <option value="term_1">Term 1</option>
                      <option value="term_2">Term 2</option>
                      <option value="term_3">Term 3</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Academic Year *</label>
                    <select value={form.academicYear} onChange={set('academicYear')} className="input">
                      <option>2025/2026</option>
                      <option>2026/2027</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Curriculum design edition</label>
                    <input value={form.curriculumEdition} onChange={set('curriculumEdition')} className="input" placeholder="KICD design + approved course book"/>
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-xs font-black uppercase tracking-wide text-[#1a2e5a] border-l-2 border-[#d4af37] pl-2 mb-1">Coverage</legend>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label">Start week *</label>
                    <input type="number" min={1} max={14} value={form.startWeek} onChange={set('startWeek')} className="input"/>
                  </div>
                  <div>
                    <label className="label">Number of weeks *</label>
                    <input type="number" min={1} max={16} value={form.totalWeeks} onChange={set('totalWeeks')} className="input"/>
                    <p className="hint text-[11px] text-theme-muted mt-1">Opening and exam weeks included.</p>
                  </div>
                  <div>
                    <label className="label">Lessons / week *</label>
                    <input type="number" min={1} max={10} value={form.periodsPerWeek} onChange={set('periodsPerWeek')} className="input"/>
                  </div>
                </div>
                <div>
                  <label className="label">Double lesson slot(s)</label>
                  <input value={form.doubleLessonSlots} onChange={set('doubleLessonSlots')} className="input" placeholder="e.g. 2 or 2,4 — leave blank if none"/>
                  <p className="hint text-[11px] text-theme-muted mt-1">Which lesson number(s) each week run as a double period (2 lessons combined). Each of the {form.periodsPerWeek} lessons/week gets its own column in the scheme — a double lesson merges two of them into one.</p>
                </div>
                <div>
                  <label className="label">Strands and sub-strands to cover</label>
                  <textarea value={form.strands} onChange={set('strands')} className="input" rows={3}
                    placeholder="One strand per line, sub-strands after a colon. Leave blank to follow the KICD sequence for the term."/>
                  <p className="hint text-[11px] text-theme-muted mt-1">Example — Living Things: Plants; Animals</p>
                </div>
                <div>
                  <label className="label">Notes for the generator</label>
                  <textarea value={form.notes} onChange={set('notes')} className="input" rows={2}
                    placeholder="Local context, available resources, weeks lost to school events."/>
                </div>
                <div>
                  <label className="label">Mid-term breaks &amp; summative assessment weeks</label>
                  <textarea value={form.specialWeeks} onChange={set('specialWeeks')} className="input" rows={2}
                    placeholder="One per line: week number, then a colon, then the label."/>
                  <p className="hint text-[11px] text-theme-muted mt-1">Example — 3: Mid-Term Break · 7: Summative Assessment 1 · 13: End Term Exam. These weeks are marked accordingly instead of new content.</p>
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-xs font-black uppercase tracking-wide text-[#1a2e5a] border-l-2 border-[#d4af37] pl-2 mb-1">Columns and output</legend>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {([
                    ['keyInquiry', 'Key inquiry questions'],
                    ['learningExperiences', 'Learning experiences'],
                    ['resources', 'Learning resources'],
                    ['assessment', 'Assessment methods'],
                    ['reflection', 'Reflection'],
                    ['corePV', 'Values, PCIs'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-start gap-2 border border-theme rounded-lg p-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={form.columns[key]} onChange={() => toggleColumn(key)} className="mt-0.5"/>
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Export format</label>
                    <select value={form.format} onChange={set('format')} className="input">
                      <option value="preview">Preview in app</option>
                      <option value="doc">Word (.doc)</option>
                      <option value="pdf">Print / Save as PDF</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Font</label>
                    <select value={form.font} onChange={set('font')} className="input">
                      <option>Times New Roman</option>
                      <option>Arial</option>
                    </select>
                    <p className="hint text-[11px] text-theme-muted mt-1">Plain black borders, no colour fills.</p>
                  </div>
                </div>
              </fieldset>

              <div className={`rounded-xl border p-3 text-xs flex items-center justify-between gap-3 ${
                (wallet?.balance ?? 0) < ITEM_PRICES.scheme ? 'bg-red-50 border-red-200 text-red-700' : 'bg-purple-50 border-purple-200 text-purple-700'
              }`}>
                <div>
                  <Sparkles size={12} className="inline mr-1"/>
                  Generating a scheme costs KES {ITEM_PRICES.scheme} from your wallet. Wallet balance: <b>KES {wallet?.balance ?? '…'}</b>.
                  {(wallet?.balance ?? 0) < ITEM_PRICES.scheme && ' Top up to continue.'}
                </div>
                <button type="button" onClick={() => setShowTopUp(true)} className="btn-ghost text-xs py-1 px-2 flex-shrink-0">Top Up</button>
              </div>
              <div className="flex gap-3 border-t border-theme pt-4">
                <button type="button" onClick={() => setShowNewScheme(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={generating} className="btn-primary flex-1">
                  {generating
                    ? <><Loader2 size={14} className="animate-spin"/> Generating…</>
                    : <><Sparkles size={14}/> Generate (KES {ITEM_PRICES.scheme})</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTopUp && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md my-8 mt-24">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <div>
                <h3 className="text-lg font-bold text-theme-heading">Top Up Wallet</h3>
                <p className="text-xs text-theme-muted mt-0.5">Pay via M-Pesa, then spend per item you generate.</p>
              </div>
              <button onClick={() => setShowTopUp(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={topUpWallet} className="p-5 space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-700">
                Scheme of Work: KES {ITEM_PRICES.scheme} each &middot; Lesson Plan: KES {ITEM_PRICES.lesson_plan} each &middot; Lesson Notes: KES {ITEM_PRICES.lesson_notes} each.
              </div>
              <div>
                <label className="label">Amount (KES) *</label>
                <input required type="number" min={10} value={topUpForm.amount}
                  onChange={(e) => setTopUpForm(f => ({ ...f, amount: Number(e.target.value) }))}
                  className="input" disabled={topUpStep === 'waiting'}/>
              </div>
              <div>
                <label className="label">M-Pesa Phone Number *</label>
                <input required type="tel" placeholder="07XXXXXXXX" value={topUpForm.phone}
                  onChange={(e) => setTopUpForm(f => ({ ...f, phone: e.target.value }))}
                  className="input" disabled={topUpStep === 'waiting'}/>
              </div>
              {topUpStep === 'waiting' && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin flex-shrink-0"/>
                  Waiting for M-Pesa confirmation on your phone…
                </div>
              )}
              <div className="flex gap-3 border-t border-theme pt-4">
                <button type="button" onClick={() => setShowTopUp(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={toppingUp} className="btn-primary flex-1">
                  {toppingUp
                    ? <><Loader2 size={14} className="animate-spin"/> {topUpStep === 'waiting' ? 'Confirming…' : 'Starting…'}</>
                    : <><Sparkles size={14}/> Pay KES {topUpForm.amount || 0}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReferral && user && <ReferralModal userId={user.id} onClose={() => setShowReferral(false)}/>}

      {openPlan && <LessonPlanModal plan={openPlan} teacher={canGenerate} onClose={() => setOpenPlan(null)} onExport={exportDocument} onEdit={editLessonPlan}/>}
      {openNotes && <LessonNotesModal notes={openNotes} onClose={() => setOpenNotes(null)} onExport={exportDocument}/>}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: any }) {
  if (!value || (Array.isArray(value) && value.length === 0)) return null;
  return (
    <div>
      <div className="text-xs font-black uppercase tracking-wide text-[#1a2e5a]">{label}</div>
      <p className="text-sm mt-0.5 whitespace-pre-wrap">{Array.isArray(value) ? value.join(', ') : value}</p>
    </div>
  );
}

function ExportBar({ format, setFormat, font, setFont, onExport }: {
  format: 'pdf' | 'doc'; setFormat: (f: 'pdf' | 'doc') => void;
  font: string; setFont: (f: string) => void;
  onExport: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 p-5 pt-0">
      <select value={format} onChange={(e) => setFormat(e.target.value as any)} className="input text-xs py-1.5 w-auto">
        <option value="doc">Word (.doc)</option>
        <option value="pdf">Print / Save as PDF</option>
      </select>
      <select value={font} onChange={(e) => setFont(e.target.value)} className="input text-xs py-1.5 w-auto">
        <option>Times New Roman</option>
        <option>Arial</option>
      </select>
      <button type="button" onClick={onExport} className="btn-ghost text-xs py-1.5 px-3">Export</button>
    </div>
  );
}

function ReferralModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const link = typeof window !== 'undefined' ? `${window.location.origin}/auth/signup-individual?ref=${userId}` : '';
  const copy = () => { navigator.clipboard?.writeText(link); toast.success('Referral link copied'); };
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Generate CBC schemes, lesson plans & notes with AI on Zaroda — sign up with my link: ${link}`)}`;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md my-8 mt-24">
        <div className="flex items-center justify-between p-5 border-b border-theme">
          <div>
            <h3 className="text-lg font-bold text-theme-heading">Refer &amp; Earn</h3>
            <p className="text-xs text-theme-muted mt-0.5">Get KES 30 (one free scheme) when a teacher you refer generates their first item.</p>
          </div>
          <button onClick={onClose}><X size={20} className="text-theme-muted"/></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-700">
            Share your link below. The reward is credited to your wallet automatically once the teacher you referred pays for their first scheme, lesson plan, or lesson notes — not just for signing up.
          </div>
          <div>
            <label className="label">Your referral link</label>
            <div className="flex gap-2">
              <input readOnly value={link} className="input flex-1 text-xs"/>
              <button type="button" onClick={copy} className="btn-ghost text-xs px-3 flex-shrink-0">Copy</button>
            </div>
          </div>
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-primary w-full justify-center">
            Share on WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}

const EDITABLE_PLAN_FIELDS = [
  ['specificLearningOutcomes', 'Specific Learning Outcomes'],
  ['keyInquiryQuestions', 'Key Inquiry Questions'],
  ['pertinentIssues', 'Pertinent Issues'],
  ['linkToOtherSubjects', 'Link to Other Subjects'],
  ['introduction', 'Introduction'],
  ['lessonDevelopment', 'Lesson Development'],
  ['conclusion', 'Conclusion'],
  ['assessment', 'Assessment'],
  ['extendedActivities', 'Extended Activities'],
  ['supportActivities', 'Support Activities'],
  ['learningMaterials', 'Learning Materials'],
  ['referenceBooks', 'Reference Books'],
] as const;

function LessonPlanModal({ plan, teacher, onClose, onExport, onEdit }: { plan: any; teacher?: boolean; onClose: () => void; onExport: (url: string, prefix: string, format: 'pdf'|'doc', font: string) => void; onEdit?: (id: string, fields: Record<string, any>) => Promise<void> }) {
  const [format, setFormat] = useState<'pdf'|'doc'>('pdf');
  const [font, setFont] = useState('Times New Roman');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const canEdit = teacher && onEdit && ['draft', 'revision_requested'].includes(plan.status);

  const startEdit = () => {
    const f: Record<string, string> = {};
    for (const [key] of EDITABLE_PLAN_FIELDS) f[key] = plan[key] || '';
    setForm(f);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    await onEdit!(plan.id, form);
    setSaving(false);
    setEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-2xl my-8 mt-12">
        <div className="flex items-center justify-between p-5 border-b border-theme">
          <div>
            <h3 className="text-lg font-bold text-theme-heading">{plan.strand} — {plan.subStrand}</h3>
            <p className="text-xs text-theme-muted mt-0.5">{gradeLabel(plan.gradeLevel)} · {plan.durationMinutes} min{plan.lessonDate ? ` · ${String(plan.lessonDate).slice(0,10)}` : ''}</p>
            {plan.status === 'approved' && plan.reviewerName && (
              <p className="text-xs mt-1 text-green-700">✓ Approved by {plan.reviewerName}{plan.reviewedAt ? ` on ${new Date(plan.reviewedAt).toLocaleDateString('en-KE')}` : ''}</p>
            )}
            {plan.reviewComment && <p className="text-xs mt-1 bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1 rounded">HOI: {plan.reviewComment}</p>}
          </div>
          <button onClick={onClose}><X size={20} className="text-theme-muted"/></button>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
          {canEdit && !editing && <button onClick={startEdit} className="btn-ghost text-xs py-1.5 px-3">Edit</button>}
          {editing && (
            <>
              <button onClick={save} disabled={saving} className="btn-primary text-xs py-1.5 px-3">{saving ? 'Saving…' : 'Save changes'}</button>
              <button onClick={() => setEditing(false)} className="btn-ghost text-xs py-1.5 px-3">Cancel</button>
            </>
          )}
        </div>
        <ExportBar format={format} setFormat={setFormat} font={font} setFont={setFont}
          onExport={() => onExport(`/professional-records/lesson-plans/${plan.id}/html`, `lesson-plan-${plan.id}`, format, font)}/>
        <div className="p-5 pt-0 space-y-4 max-h-[70vh] overflow-y-auto">
          {editing ? (
            EDITABLE_PLAN_FIELDS.map(([key, label]) => (
              <div key={key}>
                <label className="label">{label}</label>
                <textarea value={form[key]} onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))} className="input resize-y" rows={key === 'lessonDevelopment' ? 6 : 3}/>
              </div>
            ))
          ) : (
            <>
              <DetailField label="Specific Learning Outcomes" value={plan.specificLearningOutcomes}/>
              <DetailField label="Key Inquiry Questions" value={plan.keyInquiryQuestions}/>
              <DetailField label="Core Competencies" value={plan.coreCompetencies}/>
              <DetailField label="Values" value={plan.values}/>
              <DetailField label="Pertinent Issues" value={plan.pertinentIssues}/>
              <DetailField label="Link to Other Subjects" value={plan.linkToOtherSubjects}/>
              <DetailField label="Introduction" value={plan.introduction}/>
              <DetailField label="Lesson Development" value={plan.lessonDevelopment}/>
              <DetailField label="Conclusion" value={plan.conclusion}/>
              <DetailField label="Assessment" value={plan.assessment}/>
              <DetailField label="Extended Activities" value={plan.extendedActivities}/>
              <DetailField label="Support Activities" value={plan.supportActivities}/>
              <DetailField label="Learning Materials" value={plan.learningMaterials}/>
              <DetailField label="Reference Books" value={plan.referenceBooks}/>
              {plan.reviewComment && <DetailField label="HOI Comment" value={plan.reviewComment}/>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LessonNotesModal({ notes, onClose, onExport }: { notes: any; onClose: () => void; onExport: (url: string, prefix: string, format: 'pdf'|'doc', font: string, extra?: Record<string,string>) => void }) {
  const [format, setFormat] = useState<'pdf'|'doc'>('pdf');
  const [font, setFont] = useState('Times New Roman');
  const [variant, setVariant] = useState<'teacher'|'learner'>('teacher');
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-2xl my-8 mt-12">
        <div className="flex items-center justify-between p-5 border-b border-theme">
          <div>
            <h3 className="text-lg font-bold text-theme-heading">{notes.topic}{notes.subTopic ? ` — ${notes.subTopic}` : ''}</h3>
            <p className="text-xs text-theme-muted mt-0.5">{gradeLabel(notes.gradeLevel)} · {String(notes.lessonDate).slice(0,10)}</p>
          </div>
          <button onClick={onClose}><X size={20} className="text-theme-muted"/></button>
        </div>
        <div className="flex flex-wrap items-center gap-2 p-5 pb-0">
          <select value={variant} onChange={(e) => setVariant(e.target.value as any)} className="input text-xs py-1.5 w-auto">
            <option value="teacher">Teacher copy</option>
            <option value="learner">Learner copy</option>
          </select>
        </div>
        <ExportBar format={format} setFormat={setFormat} font={font} setFont={setFont}
          onExport={() => onExport(`/professional-records/lesson-notes/${notes.id}/html`, `lesson-notes-${variant}-${notes.id}`, format, font, { variant })}/>
        <div className="p-5 pt-0 space-y-4 max-h-[70vh] overflow-y-auto">
          {variant === 'learner' ? (
            <DetailField label="Lesson Content (Learner Copy)" value={notes.learnerContent || notes.teacherContent}/>
          ) : (
            <>
              <DetailField label="Specific Learning Outcomes Covered" value={notes.slosCovered}/>
              <DetailField label="Introduction" value={notes.introduction}/>
              <DetailField label="Content" value={notes.teacherContent}/>
              <DetailField label="Key Vocabulary" value={notes.keyVocabulary}/>
              <DetailField label="Summary" value={notes.summary}/>
              <DetailField label="Review Questions (with answers)" value={notes.reviewQuestions}/>
              <DetailField label="References" value={notes.referenceMaterials}/>
            </>
          )}
        </div>
      </div>
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

function SchemeDetail({ scheme, teacher, hoi, onBack, onSubmit, onReview, onGenerateLessonPlan, onGenerateLessonNotes, onExport, onEditWeek }: any) {
  // Tracks which button on which week is busy, e.g. "week123:plan" — keyed by
  // action too, not just week id, so generating a plan doesn't also show the
  // Notes button on the same week as busy/disabled (and vice versa).
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'pdf'|'doc'|'preview'>('pdf');
  const [exportFont, setExportFont] = useState(scheme.defaultFont || 'Times New Roman');
  const weeks = [...(scheme.weeks || [])].sort((a: any, b: any) => a.weekNumber - b.weekNumber);
  const canEdit = teacher && onEditWeek && ['draft', 'revision_requested'].includes(scheme.status);

  // Which lesson (or legacy week) is currently being edited, keyed "weekId:lessonNumber".
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ slo: '', kiq: '', exp: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const startEditLesson = (weekId: string, lessonNumber: number, lesson: any) => {
    setEditForm({ slo: lesson.specificLearningOutcomes || '', kiq: lesson.keyInquiryQuestions || '', exp: lesson.learningExperiences || '' });
    setEditingKey(`${weekId}:${lessonNumber}`);
  };

  const startEditLegacyWeek = (w: any) => {
    setEditForm({ slo: w.specificLearningOutcomes || '', kiq: w.keyInquiryQuestions || '', exp: w.learningExperiences || '' });
    setEditingKey(`${w.id}:1`);
  };

  const saveLessonEdit = async (weekId: string, lessonNumber: number) => {
    setSavingEdit(true);
    await onEditWeek(weekId, {
      lessonNumber,
      lessonSpecificLearningOutcomes: editForm.slo,
      lessonKeyInquiryQuestions: editForm.kiq,
      lessonLearningExperiences: editForm.exp,
    });
    setSavingEdit(false);
    setEditingKey(null);
  };

  const saveLegacyWeekEdit = async (weekId: string) => {
    setSavingEdit(true);
    await onEditWeek(weekId, {
      specificLearningOutcomes: editForm.slo,
      keyInquiryQuestions: editForm.kiq,
      learningExperiences: editForm.exp,
    });
    setSavingEdit(false);
    setEditingKey(null);
  };

  const handleGenNotes = async (weekId: string, lessonSlot: number) => {
    setBusyAction(`${weekId}:${lessonSlot}:notes`);
    await onGenerateLessonNotes(scheme.id, weekId, lessonSlot);
    setBusyAction(null);
  };

  const handleGenPlan = async (weekId: string, lessonSlot: number) => {
    setBusyAction(`${weekId}:${lessonSlot}:plan`);
    await onGenerateLessonPlan(scheme.id, weekId, lessonSlot);
    setBusyAction(null);
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
            {scheme.status === 'approved' && scheme.reviewerName && (
              <p className="text-xs mt-2 text-green-700">✓ Approved by {scheme.reviewerName}{scheme.reviewedAt ? ` on ${new Date(scheme.reviewedAt).toLocaleDateString('en-KE')}` : ''}</p>
            )}
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
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-theme">
          <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value as any)} className="input text-xs py-1.5 w-auto">
            <option value="preview">Preview in app</option>
            <option value="doc">Word (.doc)</option>
            <option value="pdf">Print / Save as PDF</option>
          </select>
          <select value={exportFont} onChange={(e) => setExportFont(e.target.value)} className="input text-xs py-1.5 w-auto">
            <option>Times New Roman</option>
            <option>Arial</option>
          </select>
          <button onClick={() => onExport(exportFormat, exportFont)} className="btn-ghost text-xs py-1.5 px-3">Export</button>
        </div>
      </div>

      <div className="space-y-3">
        {weeks.map((w: any) => {
          const isSpecial = /^n\/a\b/i.test(String(w.specificLearningOutcomes || '').trim());
          const lessons = !isSpecial && w.lessons?.length ? w.lessons : null;
          return (
          <div key={w.id} className="card p-4">
            <div className="font-bold text-theme-heading mb-2">Week {w.weekNumber} — {w.strand} / {w.subStrand}</div>
            {isSpecial ? (
              <p className="text-sm text-theme-muted italic">{w.strand} — no lesson plan/notes for this week.</p>
            ) : lessons ? (
              <div className="space-y-3">
                {lessons.map((lesson: any) => {
                  const key = `${w.id}:${lesson.lessonNumber}`;
                  const isEditing = editingKey === key;
                  return (
                    <div key={key} className="flex items-start justify-between gap-3 flex-wrap border-t border-theme pt-3 first:border-0 first:pt-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-theme-heading uppercase tracking-wide">Lesson {lesson.lessonNumber}{lesson.isDouble ? ' (Double)' : ''}</div>
                        {isEditing ? (
                          <div className="space-y-2 mt-2">
                            <div><label className="label">SLOs</label><textarea value={editForm.slo} onChange={(e) => setEditForm(f => ({ ...f, slo: e.target.value }))} className="input resize-y" rows={2}/></div>
                            <div><label className="label">Key Inquiry Questions</label><textarea value={editForm.kiq} onChange={(e) => setEditForm(f => ({ ...f, kiq: e.target.value }))} className="input resize-y" rows={2}/></div>
                            <div><label className="label">Learning Experiences</label><textarea value={editForm.exp} onChange={(e) => setEditForm(f => ({ ...f, exp: e.target.value }))} className="input resize-y" rows={3}/></div>
                            <div className="flex gap-2">
                              <button onClick={() => saveLessonEdit(w.id, lesson.lessonNumber)} disabled={savingEdit} className="btn-primary text-xs py-1.5 px-3">{savingEdit ? 'Saving…' : 'Save'}</button>
                              <button onClick={() => setEditingKey(null)} className="btn-ghost text-xs py-1.5 px-3">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm mt-1"><span className="font-semibold">SLOs:</span> {lesson.specificLearningOutcomes}</p>
                            {lesson.keyInquiryQuestions && <p className="text-sm mt-1"><span className="font-semibold">Key Inquiry Questions:</span> {lesson.keyInquiryQuestions}</p>}
                            {lesson.learningExperiences && <p className="text-sm mt-1"><span className="font-semibold">Learning Experiences:</span> {lesson.learningExperiences}</p>}
                          </>
                        )}
                      </div>
                      {teacher && !isEditing && (
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          {canEdit && <button onClick={() => startEditLesson(w.id, lesson.lessonNumber, lesson)} className="btn-ghost text-xs py-1.5 px-3">Edit</button>}
                          <button onClick={() => handleGenPlan(w.id, lesson.lessonNumber)} disabled={busyAction?.startsWith(`${key}:`)} className="btn-ghost text-xs py-1.5 px-3">
                            {busyAction === `${key}:plan` ? <><Loader2 size={12} className="animate-spin"/> Generating…</> : <><Sparkles size={12}/> Lesson Plan</>}
                          </button>
                          <button onClick={() => handleGenNotes(w.id, lesson.lessonNumber)} disabled={busyAction?.startsWith(`${key}:`)} className="btn-ghost text-xs py-1.5 px-3">
                            {busyAction === `${key}:notes` ? <><Loader2 size={12} className="animate-spin"/> Generating…</> : <><Sparkles size={12}/> Lesson Notes</>}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              // Legacy week with no per-lesson breakdown — one plan/notes pair for the whole week (slot 1).
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  {editingKey === `${w.id}:1` ? (
                    <div className="space-y-2">
                      <div><label className="label">SLOs</label><textarea value={editForm.slo} onChange={(e) => setEditForm(f => ({ ...f, slo: e.target.value }))} className="input resize-y" rows={2}/></div>
                      <div><label className="label">Key Inquiry Questions</label><textarea value={editForm.kiq} onChange={(e) => setEditForm(f => ({ ...f, kiq: e.target.value }))} className="input resize-y" rows={2}/></div>
                      <div><label className="label">Learning Experiences</label><textarea value={editForm.exp} onChange={(e) => setEditForm(f => ({ ...f, exp: e.target.value }))} className="input resize-y" rows={3}/></div>
                      <div className="flex gap-2">
                        <button onClick={() => saveLegacyWeekEdit(w.id)} disabled={savingEdit} className="btn-primary text-xs py-1.5 px-3">{savingEdit ? 'Saving…' : 'Save'}</button>
                        <button onClick={() => setEditingKey(null)} className="btn-ghost text-xs py-1.5 px-3">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm"><span className="font-semibold">SLOs:</span> {w.specificLearningOutcomes}</p>
                      {w.keyInquiryQuestions && <p className="text-sm mt-1"><span className="font-semibold">Key Inquiry Questions:</span> {w.keyInquiryQuestions}</p>}
                      {w.learningExperiences && <p className="text-sm mt-1"><span className="font-semibold">Learning Experiences:</span> {w.learningExperiences}</p>}
                    </>
                  )}
                </div>
                {teacher && editingKey !== `${w.id}:1` && (
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {canEdit && <button onClick={() => startEditLegacyWeek(w)} className="btn-ghost text-xs py-1.5 px-3">Edit</button>}
                    <button onClick={() => handleGenPlan(w.id, 1)} disabled={busyAction?.startsWith(`${w.id}:1:`)} className="btn-ghost text-xs py-1.5 px-3">
                      {busyAction === `${w.id}:1:plan` ? <><Loader2 size={12} className="animate-spin"/> Generating…</> : <><Sparkles size={12}/> Lesson Plan</>}
                    </button>
                    <button onClick={() => handleGenNotes(w.id, 1)} disabled={busyAction?.startsWith(`${w.id}:1:`)} className="btn-ghost text-xs py-1.5 px-3">
                      {busyAction === `${w.id}:1:notes` ? <><Loader2 size={12} className="animate-spin"/> Generating…</> : <><Sparkles size={12}/> Lesson Notes</>}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

function PendingApprovals({ pending, onReviewScheme, onReviewPlan, onOpenScheme, onOpenPlan, onOpenNotes }: any) {
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
                <button onClick={() => onOpenPlan(p)} className="text-left flex-1 min-w-0">
                  <span className="font-semibold text-theme-heading">{p.strand} — {p.subStrand}</span>
                  <p className="text-xs text-theme-muted">{gradeLabel(p.gradeLevel)}</p>
                </button>
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
              <button key={n.id} onClick={() => onOpenNotes(n)} className="card p-3 text-left w-full block">
                <span className="font-semibold text-theme-heading">{n.topic}</span>
                <p className="text-xs text-theme-muted">{n.subTopic}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
