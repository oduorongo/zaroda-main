'use client';
import { useState, useEffect } from 'react';
import { ClipboardList, Plus, Calendar, FileText, Loader2, X, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, isHoi } from '@/lib/hooks/useAuth';
import { GRADE_LEVELS } from '@/lib/cbc/constants';
import toast from 'react-hot-toast';

const EXAM_TYPES = [
  { value: 'cat_1',    label: 'CAT 1' },
  { value: 'cat_2',    label: 'CAT 2' },
  { value: 'mid_term', label: 'Mid Term Exam' },
  { value: 'end_term', label: 'End Term Exam' },
  { value: 'mock',     label: 'Mock Exam' },
];

export default function ExamsPage() {
  const { user } = useAuth();
  const [exams,   setExams]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [form, setForm] = useState({
    name: '', examType: 'end_term', term: 'term_1',
    academicYear: '2025/2026', startDate: '', endDate: '',
  });

  const load = () => {
    setLoading(true);
    apiClient.get('/academic/exams')
      .then(r => setExams(r.data))
      .catch(() => toast.error('Could not load exams'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const deleteExam = async (ex: any) => {
    if (!confirm(`Delete the assessment "${ex.name}"?`)) return;
    try {
      const res = await apiClient.delete(`/academic/exams/${ex.id}`);
      if (res.data?.needsConfirm) {
        if (!confirm(res.data.message + '\n\nThis will also delete the entered marks for this assessment.')) return;
        await apiClient.delete(`/academic/exams/${ex.id}`, { params: { force: 'true' } });
      }
      toast.success('Assessment deleted');
      load();
    } catch { toast.error('Could not delete assessment'); }
  };

  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.post('/academic/exams', form);
      toast.success('Exam created — teachers can now enter scores');
      setShowNew(false);
      setForm({ name:'', examType:'end_term', term:'term_1', academicYear:'2025/2026', startDate:'', endDate:'' });
      load();
    } catch { toast.error('Could not create exam'); }
    finally { setSaving(false); }
  };

  const statusBadge = (s: string) => {
    const c: Record<string,string> = {
      scheduled: 'bg-blue-100 text-blue-700',
      ongoing:   'bg-amber-100 text-amber-700',
      grading:   'bg-purple-100 text-purple-700',
      published: 'bg-green-100 text-green-700',
    };
    return <span className={`badge ${c[s] || 'bg-gray-100 text-gray-600'}`}>{s || 'scheduled'}</span>;
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Exams &amp; CATs</h1>
          <p className="text-sm text-theme-muted">Create assessments, then enter scores via the Mark List</p>
        </div>
        {isHoi(user?.role || '') && (
          <button onClick={() => setShowNew(true)} className="btn-primary"><Plus size={16}/> New Exam</button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 shimmer rounded-xl"/>)}</div>
      ) : exams.length === 0 ? (
        <div className="card p-10 text-center">
          <ClipboardList size={36} className="mx-auto text-[#e2e6f0] mb-2"/>
          <p className="text-theme-muted font-medium">No exams created yet</p>
          <p className="text-xs text-theme-muted mt-1">Create a CAT, mid-term, or end-term assessment to start grading</p>
          {isHoi(user?.role || '') && (
            <button onClick={() => setShowNew(true)} className="btn-primary mt-4"><Plus size={16}/> Create First Exam</button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {exams.map((ex: any) => (
            <div key={ex.id} className="card p-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#1a2e5a] flex items-center justify-center flex-shrink-0">
                  <ClipboardList size={18} className="text-[#d4af37]"/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-theme-heading">{ex.name}</span>
                    {statusBadge(ex.status)}
                  </div>
                  <div className="text-xs text-theme-muted mt-0.5">
                    {EXAM_TYPES.find(t => t.value === ex.examType)?.label} · {ex.term?.replace('_',' ')} · {ex.academicYear}
                    {ex.startDate && <> · {new Date(ex.startDate).toLocaleDateString('en-KE')}</>}
                  </div>
                </div>
                <a href={`/dashboard/academic/mark-list?examId=${ex.id}`}
                  className="btn-ghost text-xs py-1.5 px-3">
                  <Pencil size={12}/> Enter Scores
                </a>
                {isHoi(user?.role || '') && (
                  <button onClick={() => deleteExam(ex)} className="btn-ghost text-xs py-1.5 px-2 text-red-500" title="Delete assessment">
                    <Trash2 size={14}/>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <h3 className="text-lg font-bold text-theme-heading">New Exam / CAT</h3>
              <button onClick={() => setShowNew(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-4">
              <div>
                <label className="label">Exam Name *</label>
                <input required value={form.name} onChange={set('name')} className="input" placeholder="End Term 1 Examination 2025"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Type *</label>
                  <select value={form.examType} onChange={set('examType')} className="input">
                    {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Term *</label>
                  <select value={form.term} onChange={set('term')} className="input">
                    <option value="term_1">Term 1</option><option value="term_2">Term 2</option><option value="term_3">Term 3</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Start Date</label><input type="date" value={form.startDate} onChange={set('startDate')} className="input"/></div>
                <div><label className="label">End Date</label><input type="date" value={form.endDate} onChange={set('endDate')} className="input"/></div>
              </div>
              <p className="text-xs text-theme-muted">
                Maximum score isn't set here — each grade and learning area is marked out of a different total, so teachers set the score limit per learning area when entering marks.
              </p>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowNew(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? <><Loader2 size={14} className="animate-spin"/> Creating…</> : 'Create Exam'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
