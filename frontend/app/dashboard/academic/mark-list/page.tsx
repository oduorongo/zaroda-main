'use client';
import { useState, useEffect, useMemo } from 'react';
import { Save, Loader2, Trophy, Download, Calculator, Printer } from 'lucide-react';
import { LearnerSearch, matchesLearner } from '@/components/LearnerSearch';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  LEARNING_AREAS, GRADE_LEVELS, percentToLevel, isSeniorScale, levelsFor,
  learningAreasFor, levelBandLabel,
} from '@/lib/cbc/constants';
import toast from 'react-hot-toast';

export default function MarkListPage() {
  const { user } = useAuth();
  const [streams,   setStreams]   = useState<any[]>([]);
  const [streamId,  setStreamId]  = useState('');
  const [stream,    setStream]    = useState<any>(null);
  const [learners,  setLearners]  = useState<any[]>([]);
  const [term,      setTerm]      = useState('term_1');
  // The mark list fetches the exams the HOI actually created (not hardcoded labels).
  const [exams,     setExams]     = useState<any[]>([]);
  const [examId,    setExamId]    = useState('');
  const selectedExam = exams.find(e => e.id === examId);
  const examType = selectedExam?.examType || '';
  const [maxScore,  setMaxScore]  = useState(100);
  const [scores,    setScores]    = useState<Record<string, Record<string, number>>>({});
  const [savedMeta, setSavedMeta] = useState<Record<string, Record<string, { percent: number; level: string }>>>({});
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [search,    setSearch]    = useState('');

  useEffect(() => {
    apiClient.get('/academic/streams').then(r => {
      setStreams(r.data);
      const s = user?.streamId ? r.data.find((x: any) => x.id === user.streamId) : r.data[0];
      if (s) { setStreamId(s.id); setStream(s); }
    });
    apiClient.get('/academic/exams').then(r => {
      setExams(r.data || []);
      if (r.data?.[0]) setExamId(r.data[0].id);
    }).catch(() => {});
  }, [user]);

  // Exams filtered to the chosen term, so the dropdown only offers this term's assessments.
  const termExams = exams.filter(e => !term || e.term === term);
  useEffect(() => {
    // When term changes, default to the first exam of that term.
    if (termExams.length && !termExams.find(e => e.id === examId)) setExamId(termExams[0].id);
  }, [term, exams]);

  useEffect(() => {
    if (!streamId) return;
    const s = streams.find(x => x.id === streamId);
    setStream(s);
    setLoading(true);
    Promise.all([
      apiClient.get(`/academic/streams/${streamId}/learners`).catch(() => ({ data: [] })),
      apiClient.get('/academic/mark-list', { params: { streamId, term, examId } }).catch(() => ({ data: [] })),
    ]).then(([lrn, ml]) => {
      setLearners(lrn.data);
      // Read-only: capture each subject's STORED percent/level (from entry time).
      const meta: Record<string, Record<string, { percent: number; level: string }>> = {};
      const mlLearners = Array.isArray(ml.data) ? ml.data : (ml.data?.learners || []);
      mlLearners.forEach((row: any) => {
        meta[row.learnerId] = {};
        Object.entries(row.subjects || {}).forEach(([subj, v]: any) => {
          if (v.percent != null) meta[row.learnerId][subj] = { percent: Number(v.percent), level: v.level };
        });
      });
      setSavedMeta(meta);
    }).catch(() => toast.error('Could not load class mark list'))
      .finally(() => setLoading(false));
  }, [streamId, term, examId]);

  // Determine learning areas for this specific grade (KICD-accurate)
  const subjects = useMemo(() => learningAreasFor(stream?.gradeLevel || 'grade_4'), [stream]);
  const band = useMemo(() => levelBandLabel(stream?.gradeLevel || 'grade_4'), [stream]);

  // Points apply only to grades 7-12 (8-point KNEC scale)
  const isSenior = ['grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'].includes(stream?.gradeLevel || '');
  const pctToPoints = (pct: number) => {
    if (pct >= 90) return 8; if (pct >= 75) return 7; if (pct >= 58) return 6;
    if (pct >= 41) return 5; if (pct >= 31) return 4; if (pct >= 21) return 3;
    if (pct >= 11) return 2; return 1;
  };

  // Read-only ranking: average each subject's STORED percentage.
  const ranked = useMemo(() => {
    const grade = stream?.gradeLevel || 'grade_4';
    const rows = learners.map(l => {
      const meta = savedMeta[l.id] || {};
      const subjectPct: Record<string, number> = {};
      const subjectLvl: Record<string, string> = {};
      Object.entries(meta).forEach(([s, m]: any) => { if (!isNaN(Number(m.percent))) { subjectPct[s] = Number(m.percent); subjectLvl[s] = m.level; } });
      const pcts = Object.values(subjectPct);
      const hasScores = pcts.length > 0;
      const percent = hasScores ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
      const avgLevel = hasScores ? percentToLevel(percent, grade).code : '';
      return { learner: l, subjectPct, subjectLvl, percent, avgLevel, hasScores };
    });
    const withScores = rows.filter(r => r.hasScores).sort((a, b) => b.percent - a.percent);
    withScores.forEach((r, i) => (r as any).rank = i + 1);
    return [...withScores, ...rows.filter(r => !r.hasScores)];
  }, [learners, savedMeta, subjects, stream]);

  const printMarkList = async () => {
    const win = window.open('', '_blank');
    try {
      const res = await apiClient.get('/pdf/mark-list/html', {
        params: { streamId, term, examType, examId, academicYear: '2025/2026' },
        responseType: 'text',
      });
      const html = typeof res.data === 'string' ? res.data : String(res.data);
      if (win) { win.document.write(html); win.document.close(); }
      else toast.error('Allow pop-ups to print');
    } catch {
      if (win) win.close();
      toast.error('Could not open mark list');
    }
  };

  const save = async () => { /* mark list is read-only; entry happens in Enter Marks */ };

  const scaleLabel = stream ? (isSeniorScale(stream.gradeLevel) ? '8-level (Grade 7–12)' : '4-level (ECDE–Grade 6)') : '';

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Mark List & Raw Scores</h1>
          <p className="text-sm text-theme-muted">Enter raw scores — auto-converts to % and CBC level, then ranks the class</p>
        </div>
        <div className="flex items-center gap-2">
          {streamId && (
            <button onClick={printMarkList} className="btn-ghost">
              <Printer size={16}/> Print / Save PDF
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Stream</label>
          <select value={streamId} onChange={e => setStreamId(e.target.value)} className="input w-44">
            {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Term</label>
          <select value={term} onChange={e => setTerm(e.target.value)} className="input w-32">
            <option value="term_1">Term 1</option><option value="term_2">Term 2</option><option value="term_3">Term 3</option>
          </select>
        </div>
        <div>
          <label className="label">Assessment</label>
          <select value={examId} onChange={e => setExamId(e.target.value)} className="input w-44">
            {termExams.length === 0 && <option value="">No assessments this term</option>}
            {termExams.map(ex => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
          </select>
        </div>
        {stream && (
          <div className="ml-auto text-xs bg-surface-2 border border-theme rounded-lg px-3 py-2 text-theme-muted">
            <Calculator size={12} className="inline mr-1"/> Scale: <strong className="text-theme-heading">{scaleLabel}</strong> · {band}
          </div>
        )}
      </div>

      {loading ? <div className="h-64 shimmer rounded-2xl"/> : learners.length === 0 ? (
        <div className="card p-10 text-center text-theme-muted">No learners in this stream</div>
      ) : (
        <div className="card overflow-auto">
          <div className="p-3 sticky left-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <LearnerSearch value={search} onChange={setSearch} className="max-w-sm" />
          </div>
          <table className="w-full text-xs min-w-[760px]">
            <thead>
              <tr className="table-header">
                <th className="px-3 py-3 text-left sticky left-0 bg-[#1a2e5a]">Rank</th>
                <th className="px-3 py-3 text-left">Learner</th>
                {subjects.map(s => (
                  <th key={s} className="px-2 py-3 text-center" title={s}>
                    {s.length > 12 ? s.slice(0, 10) + '…' : s}
                  </th>
                ))}
                <th className="px-3 py-3 text-center">Total %</th>
                {isSenior && <th className="px-3 py-3 text-center">Points</th>}
                <th className="px-3 py-3 text-center">Level</th>
              </tr>
            </thead>
            <tbody>
              {ranked.filter((row:any)=>matchesLearner(row.learner, search)).map((row, i) => {
                const lvl = row.hasScores ? percentToLevel(row.percent, stream?.gradeLevel || 'grade_4') : null;
                return (
                  <tr key={row.learner.id} className={`border-b border-theme ${i % 2 === 0 ? 'bg-surface' : 'bg-surface-2'}`}>
                    <td className="px-3 py-2 sticky left-0 bg-inherit">
                      {row.hasScores ? (
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-black
                          ${(row as any).rank === 1 ? 'bg-[#d4af37] text-[#0f1c38]' : 'bg-surface-2 text-theme-muted'}`}>
                          {(row as any).rank}
                        </span>
                      ) : <span className="text-[#e2e6f0]">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-theme-heading whitespace-nowrap">{row.learner.firstName} {row.learner.lastName}</div>
                      <div className="text-[10px] text-theme-muted">{row.learner.admissionNumber}</div>
                    </td>
                    {subjects.map(subj => {
                      const p = row.subjectPct?.[subj];
                      const cl = p != null ? percentToLevel(p, stream?.gradeLevel || 'grade_4') : null;
                      return (
                        <td key={subj} className="px-2 py-1.5 text-center">
                          {cl ? <span className="font-bold" style={{ color: cl.color }}>{p}% <span className="text-[10px]">{cl.code}</span></span>
                              : <span className="text-theme-muted">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center font-black text-theme-heading">
                      {row.hasScores ? `${row.percent}%` : '—'}
                    </td>
                    {isSenior && (
                      <td className="px-3 py-2 text-center font-black text-theme-heading">
                        {row.hasScores ? pctToPoints(row.percent) : '—'}
                      </td>
                    )}
                    <td className="px-3 py-2 text-center">
                      {lvl && (
                        <span className="badge text-white text-[10px] font-bold" style={{ backgroundColor: lvl.color }}>
                          {lvl.code}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Level key */}
      {stream && (
        <div className="card p-4">
          <p className="text-xs font-bold text-theme-muted uppercase tracking-wide mb-3">CBC Performance Levels — {scaleLabel}</p>
          <div className="flex flex-wrap gap-2">
            {levelsFor(stream.gradeLevel).map(l => (
              <div key={l.code} className="flex items-center gap-1.5 text-xs">
                <span className="badge text-white font-bold" style={{ backgroundColor: l.color }}>{l.code}</span>
                <span className="text-theme-muted">{l.label} ({l.min}–{l.max}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
