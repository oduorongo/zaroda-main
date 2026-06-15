'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Grid, Plus, X, Loader2, Users, GraduationCap, ChevronRight } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, isHoi } from '@/lib/hooks/useAuth';
import { GRADE_LEVELS, EDUCATION_BANDS } from '@/lib/cbc/constants';
import toast from 'react-hot-toast';

export default function StreamsPage() {
  const { user } = useAuth();
  const [streams,  setStreams]  = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showNew,  setShowNew]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [form, setForm] = useState({
    name: '', gradeLevel: '', classTeacherId: '', academicYear: '2025/2026',
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get('/academic/streams').catch(() => ({ data: [] })),
      apiClient.get('/academic/teachers').catch(() => ({ data: [] })),
    ]).then(([s, t]) => { setStreams(s.data); setTeachers(t.data); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }));

  // Auto-suggest a stream name from grade if name left blank
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.gradeLevel) { toast.error('Select a grade level'); return; }
    setSaving(true);
    try {
      const teacher = teachers.find(t => t.id === form.classTeacherId);
      const gradeLabel = GRADE_LEVELS.find(g => g.value === form.gradeLevel)?.label || '';
      await apiClient.post('/academic/streams', {
        name:             form.name || gradeLabel,
        gradeLevel:       form.gradeLevel,
        classTeacherId:   form.classTeacherId || null,
        classTeacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : null,
        academicYear:     form.academicYear,
      });
      toast.success('Stream created');
      setShowNew(false);
      setForm({ name: '', gradeLevel: '', classTeacherId: '', academicYear: '2025/2026' });
      load();
    } catch { toast.error('Could not create stream'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Streams / Classes</h1>
          <p className="text-sm text-theme-muted">Create classes and assign class teachers</p>
        </div>
        {isHoi(user?.role || '') && (
          <button onClick={() => setShowNew(true)} className="btn-primary"><Plus size={16}/> New Stream</button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1,2,3].map(i => <div key={i} className="h-28 shimmer"/>)}
        </div>
      ) : streams.length === 0 ? (
        <div className="card p-10 text-center">
          <Grid size={36} className="mx-auto text-theme-muted opacity-40 mb-2"/>
          <p className="text-theme-muted font-medium">No streams yet</p>
          <p className="text-xs text-theme-muted mt-1">Create your first class to start admitting learners</p>
          {isHoi(user?.role || '') && (
            <button onClick={() => setShowNew(true)} className="btn-primary mt-4 inline-flex"><Plus size={16}/> Create First Stream</button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {streams.map((s: any) => (
            <div key={s.id} className="card p-4 hover:shadow-md transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#1a2e5a] flex items-center justify-center text-[#d4af37] font-black text-xs">
                  {s.gradeLevel?.replace('grade_','G').replace('_','').toUpperCase().slice(0,3) || '—'}
                </div>
                <span className="badge bg-surface-2 text-theme-muted">{s.academicYear || '2025/2026'}</span>
              </div>
              <div className="font-bold text-theme-heading">{s.name}</div>
              <div className="text-xs text-theme-muted mt-1 flex items-center gap-1">
                <Users size={11}/> {s.learnersCount || 0} learners
              </div>
              {s.classTeacherName && (
                <div className="text-xs text-theme-muted mt-1 flex items-center gap-1">
                  <GraduationCap size={11}/> {s.classTeacherName}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md border-theme" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-lg font-bold text-theme-heading">New Stream / Class</h3>
              <button onClick={() => setShowNew(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-4">
              <div>
                <label className="label">Grade Level *</label>
                <select value={form.gradeLevel} onChange={set('gradeLevel')} className="input">
                  <option value="">Select grade</option>
                  {EDUCATION_BANDS.map(band => (
                    <optgroup key={band} label={band}>
                      {GRADE_LEVELS.filter(g => g.band === band).map(g => (
                        <option key={g.value} value={g.value}>{g.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Stream Name</label>
                <input value={form.name} onChange={set('name')} className="input"
                  placeholder="e.g. Grade 4 North (blank = grade name)"/>
              </div>
              <div>
                <label className="label">Class Teacher</label>
                <select value={form.classTeacherId} onChange={set('classTeacherId')} className="input">
                  <option value="">Assign later</option>
                  {teachers.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                  ))}
                </select>
                {teachers.length === 0 && (
                  <p className="text-xs text-amber-500 mt-1">
                    No teachers yet — onboard them under <Link href="/dashboard/academic/teachers" className="underline font-semibold">Teachers</Link> to assign a class teacher.
                  </p>
                )}
              </div>
              <div>
                <label className="label">Academic Year</label>
                <input value={form.academicYear} onChange={set('academicYear')} className="input"/>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowNew(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? <><Loader2 size={14} className="animate-spin"/> Creating…</> : 'Create Stream'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
