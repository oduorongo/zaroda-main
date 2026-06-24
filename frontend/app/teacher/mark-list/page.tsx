// app/teacher/mark-list/page.tsx
// Class teacher manages the FULL class mark list (all learning areas at once).
// Subject teachers use "Enter Marks" (one subject). This consolidated view is
// for the class teacher / overall class teacher of the stream.
'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Save, Loader2, Trophy, ArrowLeft, Calculator, Download, Printer, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api/client';
import { useAuth, isHoi } from '@/lib/hooks/useAuth';
import { percentToLevel, isSeniorScale, levelsFor, learningAreasFor, levelBandLabel, matchLearningArea, pointsForLevel } from '@/lib/cbc/constants';
import { LearnerSearch, matchesLearner } from '@/components/LearnerSearch';
import toast from 'react-hot-toast';

export default function TeacherMarkListPage() {
  const { user } = useAuth();
  const router   = useRouter();
  const [streams,  setStreams]  = useState<any[]>([]);
  const [streamId, setStreamId] = useState('');
  const [stream,   setStream]   = useState<any>(null);
  const [learners, setLearners] = useState<any[]>([]);
  const [term,     setTerm]     = useState('term_1');
  // Fetch the exams the HOI actually created (not hardcoded labels), filter by term.
  const [exams,    setExams]    = useState<any[]>([]);
  const [examId,   setExamId]   = useState('');
  const selectedExam = exams.find(e => e.id === examId);
  const examType = selectedExam?.examType || '';
  const [maxScore, setMaxScore] = useState(100);
  const [scores,   setScores]   = useState<Record<string, Record<string, number>>>({});
  // Cells that already exist in the database (saved). Key: `${learnerId}|${subject}`.
  const [savedCells, setSavedCells] = useState<Set<string>>(new Set());
  // Authoritative stored percent/maxScore/level per saved cell (from entry time), so the
  // list reflects real percentages even when subjects had different totals.
  const [savedMeta, setSavedMeta] = useState<Record<string, Record<string, { percent: number; maxScore: number; level: string }>>>({});
  // Authoritative learning areas for this class, from the assessment rubric
  const [rubricAreas, setRubricAreas] = useState<string[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [search,   setSearch]   = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  const cellKey = (l: string, s: string) => `${l}|${s}`;

  // Only this teacher's own class(es)
  useEffect(() => {
    if (!user) return;
    const seesAll = isHoi(user?.role || '') || user?.role === 'super_admin';
    Promise.all([
      apiClient.get('/academic/streams'),
      seesAll ? Promise.resolve({ data: [] }) : apiClient.get(`/academic/teachers/${user.id}/stream-subjects`).catch(() => ({ data: [] })),
    ]).then(([r, ss]) => {
      const all = r.data || [];
      const assignedIds = new Set<string>((ss.data || []).map((row: any) => String(row.streamId)));
      const mine = all.filter((x: any) => assignedIds.has(String(x.id)) || x.id === user.streamId || x.classTeacherId === user.id);
      const list = seesAll ? all : (mine.length ? mine : all);
      setStreams(list);
      const s = (user.streamId && list.find((x: any) => x.id === user.streamId)) || list[0];
      if (s) { setStreamId(s.id); setStream(s); }
    });
    apiClient.get('/academic/exams').then(r => setExams(r.data || [])).catch(() => {});
  }, [user]);

  // Default the selected exam to the first one in the chosen term.
  const termExams = exams.filter(e => !term || e.term === term);
  useEffect(() => {
    if (termExams.length && !termExams.find(e => e.id === examId)) setExamId(termExams[0].id);
  }, [term, exams]);

  useEffect(() => {
    if (!streamId) return;
    const s = streams.find(x => x.id === streamId);
    setStream(s);
    setLoading(true);
    Promise.all([
      apiClient.get(`/academic/streams/${streamId}/learners`).catch(() => ({ data: [] })),
      apiClient.get('/academic/mark-list', { params: { streamId, term, examId } }).catch(() => ({ data: null })),
      // Authoritative learning areas for this class = the assessment rubric for its grade
      s?.gradeLevel
        ? apiClient.get('/assessment/learning-areas', { params: { gradeLevel: s.gradeLevel } }).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
    ]).then(([lrn, ml, ra]) => {
      setLearners(lrn.data);
      const rubric: string[] = Array.from(new Set((ra.data || []).map((x: any) => x.learningArea).filter(Boolean)));
      const norm = (x: string) => x.toLowerCase().replace(/[^a-z]/g, '');
      // Map a saved subject name onto the matching rubric column (tolerant of spelling
      // variants, word families and extra words). Unmatched names keep their own column.
      const toColumn = (saved: string) => matchLearningArea(saved, rubric) || saved;
      // Pre-fill from marks already saved, and record which cells are saved (edit-only).
      const filled: Record<string, Record<string, number>> = {};
      const meta: Record<string, Record<string, { percent: number; maxScore: number; level: string }>> = {};
      const saved = new Set<string>();
      const extraCols = new Set<string>();
      const mlLearners = Array.isArray(ml.data) ? ml.data : (ml.data?.learners || []);
      mlLearners.forEach((row: any) => {
        filled[row.learnerId] = {};
        meta[row.learnerId] = {};
        Object.entries(row.subjects || {}).forEach(([subj, v]: any) => {
          if (v.rawScore != null) {
            const col = toColumn(subj);
            filled[row.learnerId][col] = v.rawScore;
            // Keep the authoritative stored percent/maxScore/level (computed at entry time
            // against the real "out of") so the list shows true percentages even when
            // subjects were marked out of different totals.
            meta[row.learnerId][col] = { percent: Number(v.percent), maxScore: Number(v.maxScore), level: v.level };
            saved.add(cellKey(row.learnerId, col));
            if (!rubric.some(rc => norm(rc) === norm(col))) extraCols.add(col); // saved but not in rubric
          }
        });
      });
      setScores(filled);
      setSavedMeta(meta);
      setSavedCells(saved);
      // Rubric columns + any saved subjects that aren't in the rubric (so no marks are hidden).
      setRubricAreas(Array.from(new Set([...rubric, ...extraCols])));
    }).catch(() => toast.error('Could not load class mark list'))
      .finally(() => setLoading(false));
  }, [streamId, term, examId]);

  // Learning areas come STRICTLY from this class's assessment rubric, de-duplicated.
  // Falls back to the grade band list only if the rubric has not been set up yet.
  const subjects = useMemo(() => {
    if (rubricAreas.length) return rubricAreas;
    return Array.from(new Set(learningAreasFor(stream?.gradeLevel || 'grade_4')));
  }, [stream, rubricAreas]);
  const band = useMemo(() => levelBandLabel(stream?.gradeLevel || 'grade_4'), [stream]);

  const setScore = (learnerId: string, subject: string, raw: string) => {
    if (raw === '') {
      setScores(s => {
        const next = { ...(s[learnerId] || {}) }; delete next[subject];
        return { ...s, [learnerId]: next };
      });
      return;
    }
    const val = Math.min(maxScore, Math.max(0, Number(raw) || 0));
    setScores(s => ({ ...s, [learnerId]: { ...(s[learnerId] || {}), [subject]: val } }));
  };

  const ranked = useMemo(() => {
    const grade = stream?.gradeLevel || 'grade_4';
    const rows = learners.map(l => {
      const subjectScores = scores[l.id] || {};
      const meta = savedMeta[l.id] || {};
      // Compute each subject's percentage from its OWN "out of": prefer the stored
      // percent/maxScore (authoritative, from entry time); for a freshly typed value not
      // yet saved, fall back to the page's current maxScore. This fixes wrong averages
      // when subjects were marked out of different totals.
      const perSubjectPct: number[] = [];
      const subjectPctMap: Record<string, number> = {};
      Object.entries(subjectScores).forEach(([subj, raw]) => {
        const m = meta[subj];
        let pct: number | null = null;
        if (m && !isNaN(m.percent) && savedCells.has(cellKey(l.id, subj))) {
          pct = m.percent;                                   // authoritative stored %
        } else if (maxScore > 0) {
          pct = Math.round((Number(raw) / maxScore) * 100);  // unsaved edit → page maxScore
        }
        if (pct != null && !isNaN(pct)) { perSubjectPct.push(pct); subjectPctMap[subj] = pct; }
      });
      const hasScores = perSubjectPct.length > 0;
      const percent = hasScores ? Math.round(perSubjectPct.reduce((a, b) => a + b, 0) / perSubjectPct.length) : 0;
      const totalPoints = perSubjectPct.reduce((sum, p) => sum + pointsForLevel(percentToLevel(p, grade).code, grade), 0);
      const avgPoints = hasScores ? (totalPoints / perSubjectPct.length) : 0;
      const avgLevel = hasScores ? percentToLevel(percent, grade).code : '';
      return { learner: l, subjectScores, subjectPctMap, percent, totalPoints, avgPoints, avgLevel, hasScores };
    });
    const withScores = rows.filter(r => r.hasScores).sort((a, b) => b.percent - a.percent);
    withScores.forEach((r, i) => (r as any).rank = i + 1);
    return [...withScores, ...rows.filter(r => !r.hasScores)];
  }, [learners, scores, savedMeta, savedCells, subjects, maxScore, stream]);

  const save = async () => {
    setSaving(true);
    try {
      const records = ranked.filter(r => r.hasScores).flatMap(r =>
        Object.entries(r.subjectScores).map(([subject, raw]) => {
          // Each subject keeps its OWN "out of". For a mark already saved, reuse its stored
          // maxScore (so saving the list NEVER overwrites a subject's real total with the
          // page default). Only a freshly typed, not-yet-saved mark uses the page maxScore.
          const stored = savedMeta[r.learner.id]?.[subject];
          const isSaved = savedCells.has(cellKey(r.learner.id, subject));
          const useMax = (isSaved && stored && stored.maxScore > 0) ? stored.maxScore : maxScore;
          if (!useMax || useMax <= 0) return null;  // never save against an invalid total
          const pct = Math.round((Number(raw) / useMax) * 100);
          return {
            learnerId: r.learner.id, subject, streamId,
            rawScore: raw, maxScore: useMax, percent: pct,
            level: percentToLevel(pct, stream?.gradeLevel || 'grade_4').code,
            gradeLevel: stream?.gradeLevel,
            term, examType, examId, academicYear: '2025/2026',
          };
        }).filter(Boolean)
      );
      if (!records.length) { toast.error('No scores to save'); return; }
      await apiClient.post('/academic/assessment-results/bulk', { records });
      // Everything now persisted → mark all current cells as saved (edit-only henceforth)
      const saved = new Set(savedCells);
      records.forEach(rec => saved.add(cellKey(rec.learnerId, rec.subject)));
      setSavedCells(saved);
      toast.success(`Class mark list saved — ${records.length} entries`);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not save mark list');
    } finally { setSaving(false); }
  };

  // ── Print / Save as PDF (browser-based, no server PDF engine) ────
  const downloadPdf = async () => {
    const win = window.open('', '_blank');
    try {
      const res = await apiClient.get('/pdf/mark-list/html', {
        params: { streamId, term, examType, examId, academicYear: '2025/2026' },
        responseType: 'text',
      });
      const html = typeof res.data === 'string' ? res.data : String(res.data);
      if (win) {
        win.document.open(); win.document.write(html); win.document.close();
        const fire = () => { try { win.focus(); win.print(); } catch {} };
        if (win.document.readyState === 'complete') setTimeout(fire, 500);
        else win.onload = () => setTimeout(fire, 300);
      }
      else toast.error('Allow pop-ups to print');
    } catch {
      if (win) win.close();
      toast.error('Could not open mark list');
    }
  };

  // ── Download (CSV) ───────────────────────────────────────
  const downloadCsv = () => {
    const head = ['Rank', 'Adm No', 'Learner', ...subjects, 'Avg %', 'Points Avg', 'Level'];
    const lines = [head.join(',')];
    ranked.forEach((r: any) => {
      const row = [
        r.hasScores ? r.rank : '',
        r.learner.admissionNumber || '',
        `"${r.learner.firstName} ${r.learner.lastName}"`,
        ...subjects.map(s => r.subjectScores[s] ?? ''),
        r.hasScores ? r.percent : '',
        r.hasScores ? r.avgPoints.toFixed(1) : '',
        r.hasScores ? r.avgLevel : '',
      ];
      lines.push(row.join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `mark-list-${stream?.name || 'class'}-${term}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Print (opens print dialog with a clean table) ────────
  const print = () => {
    const w = window.open('', '_blank');
    if (!w) { toast.error('Allow pop-ups to print'); return; }
    const rows = ranked.map((r: any) => `
      <tr>
        <td style="text-align:center">${r.hasScores ? r.rank : ''}</td>
        <td>${r.learner.admissionNumber || ''}</td>
        <td>${r.learner.firstName} ${r.learner.lastName}</td>
        ${subjects.map(s => `<td style="text-align:center">${r.subjectScores[s] ?? ''}</td>`).join('')}
        <td style="text-align:center;font-weight:700">${r.hasScores ? r.percent + '%' : ''}</td>
        <td style="text-align:center;font-weight:700">${r.hasScores ? r.avgPoints.toFixed(1) + ' ' + r.avgLevel : ''}</td>
      </tr>`).join('');
    w.document.write(`<!doctype html><html><head><title>Mark List — ${stream?.name || ''}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#1a2e5a}
        h2{margin:0 0 2px} p{margin:0 0 14px;color:#555;font-size:12px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #ccc;padding:4px 6px}
        th{background:#1a2e5a;color:#fff;font-size:10px}
      </style></head><body>
      <h2>${stream?.name || 'Class'} — Mark List</h2>
      <p>${term.replace('_',' ')} · ${examType.replace('_',' ')} · ${academicYearLabel()} · Out of ${maxScore}</p>
      <table><thead><tr>
        <th>#</th><th>Adm No</th><th>Learner</th>
        ${subjects.map(s => `<th>${s}</th>`).join('')}<th>Avg %</th><th>Points Avg (level)</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <script>window.onload=function(){window.print()}</script>
      </body></html>`);
    w.document.close();
  };
  const academicYearLabel = () => '2025/2026';

  const scaleLabel = stream ? (isSeniorScale(stream.gradeLevel) ? '8-level (Grade 7–12)' : '4-level (ECDE–Grade 6)') : '';

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-ghost p-2" title="Back" aria-label="Back">
            <ArrowLeft size={18}/>
          </button>
          <div>
            <h1 className="text-2xl font-black text-theme-heading">Class Mark List</h1>
            <p className="text-sm text-theme-muted">All learning areas for your class — auto % · CBC level · rank</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadPdf} disabled={learners.length === 0} className="btn-ghost text-sm" title="Download PDF"><Download size={15}/> PDF</button>
          <button onClick={downloadCsv} disabled={learners.length === 0} className="btn-ghost text-sm" title="Download CSV"><Download size={15}/> CSV</button>
          <button onClick={print} disabled={learners.length === 0} className="btn-ghost text-sm" title="Print"><Printer size={15}/> Print</button>
          <button onClick={save} disabled={saving || learners.length === 0} className="btn-primary">
            {saving ? <><Loader2 size={16} className="animate-spin"/> Saving…</> : <><Save size={16}/> Save Mark List</>}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Stream</label>
          <select value={streamId} onChange={e => setStreamId(e.target.value)} className="input w-40">
            {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Term</label>
          <select value={term} onChange={e => setTerm(e.target.value)} className="input w-28">
            <option value="term_1">Term 1</option><option value="term_2">Term 2</option><option value="term_3">Term 3</option>
          </select>
        </div>
        <div>
          <label className="label">Assessment</label>
          <select value={examId} onChange={e => setExamId(e.target.value)} className="input w-40">
            {termExams.length === 0 && <option value="">No assessments this term</option>}
            {termExams.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Out of</label>
          <input type="number" value={maxScore} onChange={e => setMaxScore(Number(e.target.value) || 100)} className="input w-20"/>
        </div>
        {stream && (
          <div className="ml-auto text-xs bg-surface-2 rounded-lg px-3 py-2 text-theme-muted">
            <Calculator size={12} className="inline mr-1"/>{scaleLabel} · {band}
          </div>
        )}
      </div>

      <div className="text-[11px] text-theme-muted flex items-center gap-1">
        <Lock size={11}/> Cells with a saved mark are highlighted — entering a value edits the existing mark.
      </div>

      {loading ? <div className="h-64 shimmer rounded-2xl"/> : learners.length === 0 ? (
        <div className="card p-10 text-center text-theme-muted">No learners in this class</div>
      ) : (
        <div className="card overflow-auto" ref={printRef}>
          <div className="p-3 no-print" style={{ borderBottom: '1px solid var(--border)' }}>
            <LearnerSearch value={search} onChange={setSearch} className="max-w-sm" />
          </div>
          <table className="w-full text-xs min-w-[760px]">
            <thead>
              <tr className="table-header">
                <th className="px-3 py-3 text-center w-10">#</th>
                <th className="px-4 py-3 text-left">Learner</th>
                {subjects.map(s => <th key={s} className="px-2 py-3 text-center">{s}</th>)}
                <th className="px-3 py-3 text-center">Avg %</th>
                <th className="px-3 py-3 text-center">Points Avg<br/><span className="text-[9px] font-normal opacity-70">(level)</span></th>
              </tr>
            </thead>
            <tbody>
              {ranked.filter((row:any)=>matchesLearner(row.learner, search)).map((row: any, i: number) => (
                <tr key={row.learner.id} className={`border-b border-theme ${i % 2 === 0 ? 'bg-surface' : 'bg-surface-2'}`}>
                  <td className="px-3 py-2 text-center">
                    <span className={`w-6 h-6 inline-flex items-center justify-center rounded-lg text-xs font-black ${row.rank === 1 ? 'bg-[#d4af37] text-[#0f1c38]' : 'bg-surface-2 text-theme-muted'}`}>
                      {row.hasScores ? (row.rank === 1 ? <Trophy size={12}/> : row.rank) : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-semibold text-theme-heading text-sm">{row.learner.firstName} {row.learner.lastName}</div>
                    <div className="text-[10px] text-theme-muted">{row.learner.admissionNumber}</div>
                  </td>
                  {subjects.map(subj => {
                    const isSaved = savedCells.has(cellKey(row.learner.id, subj));
                    const rawVal = scores[row.learner.id]?.[subj];
                    const meta = savedMeta[row.learner.id]?.[subj];
                    const hasVal = rawVal !== undefined && rawVal !== '' && !isNaN(Number(rawVal));
                    // Saved marks show their stored % (against their real "out of"); unsaved
                    // edits show a live % against the current page "Out of".
                    const cellPct = (isSaved && meta && !isNaN(meta.percent))
                      ? meta.percent
                      : (hasVal && maxScore > 0 ? Math.round((Number(rawVal) / maxScore) * 100) : null);
                    const cellLvl = cellPct != null ? percentToLevel(cellPct, stream?.gradeLevel || 'grade_4') : null;
                    return (
                      <td key={subj} className="px-1 py-2 text-center">
                        <input
                          type="number" min={0} max={maxScore}
                          value={scores[row.learner.id]?.[subj] ?? ''}
                          placeholder="—"
                          title={isSaved ? 'Saved mark — editing updates it' : 'New entry'}
                          onChange={e => setScore(row.learner.id, subj, e.target.value)}
                          className={`w-14 text-center text-sm px-1.5 py-1 rounded-lg focus:ring-1 focus:ring-[#1a2e5a] focus:outline-none ${isSaved ? 'bg-green-500/10 font-semibold text-green-700' : 'bg-surface-2'}`}
                          style={{ border: isSaved ? '1px solid rgba(34,197,94,0.4)' : '1px solid var(--border)' }}/>
                        {cellLvl && (
                          <div className="text-[10px] mt-0.5 leading-tight font-semibold" style={{ color: cellLvl.color }}>
                            {cellPct}% {cellLvl.code}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center font-black text-theme-heading">
                    {row.hasScores ? `${row.percent}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {row.hasScores
                      ? <span className="font-bold" style={{ color: percentToLevel(row.percent, stream?.gradeLevel || 'grade_4').color }}>
                          {row.avgPoints.toFixed(1)} <span className="text-[10px]">{row.avgLevel}</span>
                        </span>
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {stream && (
        <div className="card p-4">
          <p className="text-xs font-bold text-theme-muted uppercase tracking-wide mb-2">CBC Levels — {scaleLabel}</p>
          <div className="flex flex-wrap gap-2">
            {levelsFor(stream.gradeLevel).map((l: any) => (
              <span key={l.code} className="flex items-center gap-1 text-xs">
                <span className="badge text-white font-bold" style={{ backgroundColor: l.color }}>{l.code}</span>
                <span className="text-theme-muted">{l.min}–{l.max}%</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
