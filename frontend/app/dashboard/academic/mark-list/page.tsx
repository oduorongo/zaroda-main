'use client';
import { useState, useEffect, useMemo } from 'react';
import { Save, Loader2, Trophy, Download, Calculator, Printer } from 'lucide-react';
import { LearnerSearch, matchesLearner } from '@/components/LearnerSearch';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  LEARNING_AREAS, GRADE_LEVELS, percentToLevel, isSeniorScale, levelsFor, levelFromPointsTotal,
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
  const [apiAreas, setApiAreas] = useState<string[]>([]);
  const [apiComputed, setApiComputed] = useState<Record<string, { rank: number; averagePercent: number; totalPoints: number | null }>>({});
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
      // Authoritative learning-area list from the API (seeded rubric) — same set the PDF uses.
      setApiAreas(Array.isArray(ml.data?.areas) ? ml.data.areas : []);
      // Read-only: capture each subject's STORED percent/level (from entry time), PLUS the
      // API's own computed rank & average % so the screen shows EXACTLY what the PDF ranks on.
      const meta: Record<string, Record<string, { percent: number; level: string }>> = {};
      const computed: Record<string, { rank: number; averagePercent: number; totalPoints: number | null }> = {};
      const mlLearners = Array.isArray(ml.data) ? ml.data : (ml.data?.learners || []);
      mlLearners.forEach((row: any) => {
        meta[row.learnerId] = {};
        Object.entries(row.subjects || {}).forEach(([subj, v]: any) => {
          if (v.percent != null) meta[row.learnerId][subj] = { percent: Number(v.percent), level: v.level };
        });
        computed[row.learnerId] = { rank: row.rank, averagePercent: row.averagePercent, totalPoints: row.totalPoints ?? null };
      });
      setSavedMeta(meta);
      setApiComputed(computed);
    }).catch(() => toast.error('Could not load class mark list'))
      .finally(() => setLoading(false));
  }, [streamId, term, examId]);

  // Learning-area columns: use the API's authoritative rubric list; fall back to the KICD
  // constant only if the rubric isn't seeded for this grade.
  const subjects = useMemo(() => {
    const fromApi = (apiAreas || []).filter(a => !/indigenous|indeg/i.test(a));
    if (fromApi.length) return fromApi;
    return learningAreasFor(stream?.gradeLevel || 'grade_4').filter(a => !/indigenous/i.test(a));
  }, [apiAreas, stream]);
  const band = useMemo(() => levelBandLabel(stream?.gradeLevel || 'grade_4'), [stream]);

  // Points apply only to grades 7-12 (8-point KNEC scale)
  const isSenior = ['grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'].includes(stream?.gradeLevel || '');
  const pctToPoints = (pct: number) => {
    if (pct >= 90) return 8; if (pct >= 75) return 7; if (pct >= 58) return 6;
    if (pct >= 41) return 5; if (pct >= 31) return 4; if (pct >= 21) return 3;
    if (pct >= 11) return 2; return 1;
  };

  // Read-only ranking — MUST match the PDF exactly. Ranking basis is the TOTAL PERFORMANCE
  // LEVEL (sum of each learning area's performance points) for ALL classes, so the Points
  // column always agrees with the rank. Average % breaks ties only. The screen consumes the
  // API's computed rank directly (single source of truth).
  // Points come from each subject's % via the same KNEC cutoffs the report PDF uses (pctToPoints).
  const ranked = useMemo(() => {
    const grade = stream?.gradeLevel || 'grade_4';
    const areaKey = (x: string) => String(x || '').toLowerCase().trim();
    const colByKey = new Map(subjects.map(s => [areaKey(s), s]));
    const rows = learners.map(l => {
      const meta = savedMeta[l.id] || {};
      const subjectPct: Record<string, number> = {};
      const subjectLvl: Record<string, string> = {};
      Object.entries(meta).forEach(([s, m]: any) => {
        if (isNaN(Number(m.percent))) return;
        const col = colByKey.get(areaKey(s)) || s;   // land on the canonical column
        subjectPct[col] = Number(m.percent);
        // Recompute each subject's level from its % with the band-aware scale (so senior uses
        // the 8-level codes), rather than trusting a possibly-stale stored level.
        subjectLvl[col] = percentToLevel(Number(m.percent), grade).code;
      });
      const hasScores = Object.keys(subjectPct).length > 0;
      const c = apiComputed[l.id] || { rank: 0, averagePercent: 0, totalPoints: null };
      const percent = c.averagePercent || 0;
      const totalPoints = c.totalPoints ?? 0;
      // Overall level = the points total mapped directly to a level (total ÷ max, mapped to the
      // band scale). Same points ⇒ same level, and the level always tracks the Points column.
      const areaCount = subjects.length || 1;
      const avgLevel = hasScores ? levelFromPointsTotal(totalPoints, areaCount, grade).code : '';
      return { learner: l, subjectPct, subjectLvl, percent, totalPoints, avgLevel, hasScores, rank: c.rank };
    });
    // Order by the API rank (already computed with the shared criteria + tie-breakers).
    const withScores = rows.filter(r => r.hasScores).sort((a, b) => (a.rank || 9999) - (b.rank || 9999));
    return [...withScores, ...rows.filter(r => !r.hasScores)];
  }, [learners, savedMeta, subjects, stream, apiComputed]);

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

  const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error('load failed'));
    document.head.appendChild(s);
  });

  // True download-to-device PDF (client-side render, no server PDF engine needed).
  const downloadPdf = async () => {
    const filename = `mark-list-${(stream?.name || 'class').replace(/\s+/g, '-')}-${term}.pdf`;
    const toastId = toast.loading('Preparing PDF…');
    try {
      const res = await apiClient.get('/pdf/mark-list/html', {
        params: { streamId, term, examType, examId, academicYear: '2025/2026' }, responseType: 'text',
      });
      const html = typeof res.data === 'string' ? res.data : String(res.data);
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      const html2canvas = (window as any).html2canvas;
      const JsPDF = (window as any).jspdf?.jsPDF;
      if (!html2canvas || !JsPDF) throw new Error('pdf libs unavailable');
      const holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:1000px;background:#fff';
      holder.innerHTML = html;
      document.body.appendChild(holder);
      holder.querySelectorAll('script').forEach(s => s.remove());
      const canvas = await html2canvas(holder, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      document.body.removeChild(holder);
      const pdf = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const M = 24;  // ~0.33in printable margin all around
      const imgW = pageW - M * 2;
      const imgH = (canvas.height * imgW) / canvas.width;
      const img = canvas.toDataURL('image/png');
      const usableH = pageH - M * 2;
      if (imgH <= usableH) {
        pdf.addImage(img, 'PNG', M, M, imgW, imgH);
      } else {
        let offset = 0;
        while (offset < imgH) {
          pdf.addImage(img, 'PNG', M, M - offset, imgW, imgH);
          offset += usableH;
          if (offset < imgH) pdf.addPage();
        }
      }
      pdf.save(filename);
      toast.success('PDF downloaded', { id: toastId });
    } catch {
      toast.dismiss(toastId);
      printMarkList();  // fallback to print page
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
          {streamId && (<>
            <button onClick={downloadPdf} className="btn-primary">
              <Download size={16}/> Download PDF
            </button>
            <button onClick={printMarkList} className="btn-ghost">
              <Printer size={16}/> Print
            </button>
          </>)}
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
                <th className="px-3 py-3 text-center">
                  Points
                  <div className="text-[10px] font-normal opacity-90 mt-0.5">
                    Class: {ranked.filter((r:any)=>r.hasScores).reduce((s:number,r:any)=>s+(r.totalPoints||0),0)}
                  </div>
                </th>
                <th className="px-3 py-3 text-center">Level</th>
              </tr>
            </thead>
            <tbody>
              {ranked.filter((row:any)=>matchesLearner(row.learner, search)).map((row, i) => {
                const lvl = row.hasScores && row.avgLevel ? levelsFor(stream?.gradeLevel || 'grade_4').find(l => l.code === row.avgLevel) : null;
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
                      {row.hasScores ? row.totalPoints : '—'}
                    </td>
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
