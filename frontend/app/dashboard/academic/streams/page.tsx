'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Grid, Plus, X, Loader2, Users, GraduationCap, ChevronRight, Pencil } from 'lucide-react';
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
  // A class = one grade level split into one or more streams (Blue, Red, …).
  const [gradeLevel, setGradeLevel]   = useState('');
  const [academicYear, setAcademicYear] = useState('2025/2026');
  const [streamRows, setStreamRows]   = useState<{ name: string; classTeacherId: string }[]>([
    { name: '', classTeacherId: '' },
  ]);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get('/academic/streams').catch(() => ({ data: [] })),
      apiClient.get('/academic/teachers').catch(() => ({ data: [] })),
    ]).then(([s, t]) => { setStreams(s.data); setTeachers(t.data); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setGradeLevel(''); setAcademicYear('2025/2026');
    setStreamRows([{ name: '', classTeacherId: '' }]);
  };

  // Edit an existing stream (rename + class teacher), e.g. fix "Grade 7" → "Grade 7 Blue".
  const [editStream, setEditStream] = useState<any>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const saveStreamEdit = async () => {
    if (!editStream?.name?.trim()) { toast.error('Enter a stream name'); return; }
    setSavingEdit(true);
    try {
      await apiClient.patch(`/academic/streams/${editStream.id}`, {
        name: editStream.name.trim(),
        classTeacherId: editStream.classTeacherId || null,
      });
      toast.success('Stream updated');
      setEditStream(null);
      load();
    } catch (e:any) {
      toast.error(e?.response?.data?.message || 'Could not update stream');
    } finally { setSavingEdit(false); }
  };
  const addStreamRow    = () => setStreamRows(r => [...r, { name: '', classTeacherId: '' }]);
  const removeStreamRow = (i: number) => setStreamRows(r => r.length > 1 ? r.filter((_, idx) => idx !== i) : r);
  const setStreamRow    = (i: number, k: string, v: string) =>
    setStreamRows(r => r.map((row, idx) => idx === i ? { ...row, [k]: v } : row));

  // Create the grade with all its streams in one action.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradeLevel) { toast.error('Select a grade level'); return; }
    const streamsPayload = streamRows
      .filter(r => r.name.trim())
      .map(r => ({ name: r.name.trim(), classTeacherId: r.classTeacherId || null }));
    if (!streamsPayload.length) { toast.error('Add at least one stream (e.g. Blue, Red)'); return; }
    setSaving(true);
    try {
      const res = await apiClient.post('/academic/classes', {
        gradeLevel, academicYear, streams: streamsPayload,
      });
      toast.success(res.data?.message || `${streamsPayload.length} stream(s) created`);
      setShowNew(false);
      resetForm();
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not create class');
    } finally { setSaving(false); }
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
                <div className="flex items-center gap-2">
                  <span className="badge bg-surface-2 text-theme-muted">{s.academicYear || '2025/2026'}</span>
                  {isHoi(user?.role || '') && (
                    <button
                      onClick={() => setEditStream({ id: s.id, name: s.name, classTeacherId: s.classTeacherId || '' })}
                      className="btn-ghost p-1.5" title="Rename / set class teacher"
                    ><Pencil size={14}/></button>
                  )}
                </div>
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
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg border-theme" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-lg font-bold text-theme-heading">New Class & Streams</h3>
              <button onClick={() => { setShowNew(false); resetForm(); }}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <p className="text-xs text-theme-muted">
                A class (grade) is split into streams (e.g. Blue, Red, Green) when one room can't hold all learners. Pick the grade, then add each stream below.
              </p>
              <div>
                <label className="label">Grade Level *</label>
                <select value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} className="input">
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
                <label className="label">Streams *</label>
                <div className="space-y-2">
                  {streamRows.map((row, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <input
                        value={row.name}
                        onChange={e => setStreamRow(i, 'name', e.target.value)}
                        className="input flex-1"
                        placeholder="Stream name e.g. Blue"
                      />
                      <select
                        value={row.classTeacherId}
                        onChange={e => setStreamRow(i, 'classTeacherId', e.target.value)}
                        className="input flex-1"
                      >
                        <option value="">Class teacher (optional)</option>
                        {teachers.map((t: any) => (
                          <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeStreamRow(i)}
                        disabled={streamRows.length === 1}
                        className="btn-ghost px-2 disabled:opacity-30"
                        title="Remove stream"
                      ><X size={16}/></button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addStreamRow} className="btn-ghost mt-2 text-sm">
                  <Plus size={14}/> Add another stream
                </button>
                {teachers.length === 0 && (
                  <p className="text-xs text-amber-500 mt-2">
                    No teachers yet — onboard them under <Link href="/dashboard/academic/teachers" className="underline font-semibold">Teachers</Link> to assign class teachers (you can also assign later).
                  </p>
                )}
              </div>

              <div>
                <label className="label">Academic Year</label>
                <input value={academicYear} onChange={e => setAcademicYear(e.target.value)} className="input"/>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowNew(false); resetForm(); }} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? <><Loader2 size={14} className="animate-spin"/> Creating…</> : 'Create Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {editStream && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md border-theme" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-lg font-bold text-theme-heading">Edit Stream</h3>
              <button onClick={() => setEditStream(null)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Stream Name</label>
                <input value={editStream.name} onChange={e=>setEditStream({...editStream, name:e.target.value})}
                  className="input" placeholder="e.g. Grade 7 Blue"/>
                <p className="text-xs text-theme-muted mt-1">Tip: give each stream a distinct name like "Grade 7 Blue" or "Grade 7 Red".</p>
              </div>
              <div>
                <label className="label">Class Teacher</label>
                <select value={editStream.classTeacherId} onChange={e=>setEditStream({...editStream, classTeacherId:e.target.value})} className="input">
                  <option value="">No class teacher</option>
                  {teachers.map((t:any)=>(
                    <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditStream(null)} className="btn-ghost flex-1">Cancel</button>
                <button type="button" onClick={saveStreamEdit} disabled={savingEdit} className="btn-primary flex-1">
                  {savingEdit ? <><Loader2 size={14} className="animate-spin"/> Saving…</> : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
