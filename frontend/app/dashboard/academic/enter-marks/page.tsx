// app/dashboard/academic/enter-marks/page.tsx
// Admin/HOI marks entry — mobile friendly. Two modes:
//   • By Learning Area: pick one subject, enter that mark for every learner (one column)
//   • By Learner: pick one learner, enter all their learning-area marks (one form)
// Tied to a created assessment (exam), like the teacher flow. Lets an admin fill in
// marks when a teacher can't — without the unusable wide grid on a phone.
'use client';
import { useState, useEffect, useMemo } from 'react';
import { Save, Loader2, Calculator, User, BookOpen, Download, Printer } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { percentToLevel, learningAreasFor, levelsFor, isSeniorScale } from '@/lib/cbc/constants';
import { LearnerSearch, matchesLearner } from '@/components/LearnerSearch';
import toast from 'react-hot-toast';

const TERMS = [
  { v: 'term_1', label: 'Term 1' }, { v: 'term_2', label: 'Term 2' }, { v: 'term_3', label: 'Term 3' },
];

export default function AdminEnterMarksPage() {
  const { user } = useAuth();
  const [mode, setMode]         = useState<'area' | 'learner'>('area');
  const [streams, setStreams]   = useState<any[]>([]);
  const [streamId, setStreamId] = useState('');
  const stream = streams.find(s => s.id === streamId);
  const [learners, setLearners] = useState<any[]>([]);
  const [term, setTerm]         = useState('term_1');
  const [exams, setExams]       = useState<any[]>([]);
  const [examId, setExamId]     = useState('');
  const [maxScore, setMaxScore] = useState<string>(""); // blank & mandatory
  const maxScoreNum = Number(maxScore);
  const maxScoreReady = maxScore !== "" && !isNaN(maxScoreNum) && maxScoreNum > 0;
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);

  // By-area mode: chosen learning area + { learnerId: rawScore }
  const [area, setArea]         = useState('');
  const [areaScores, setAreaScores] = useState<Record<string, string>>({});
  const [areaScoresP2, setAreaScoresP2] = useState<Record<string, string>>({});  // Paper 2, only used when hasPapers(area)
  // Paper 1 & Paper 2 usually have DIFFERENT totals (e.g. Paper 1 /40, Paper 2 /60), so each
  // gets its own "out of" in area mode — they never share maxScore.
  const [areaMaxP1, setAreaMaxP1] = useState<string>('');
  const [areaMaxP2, setAreaMaxP2] = useState<string>('');
  const areaMaxP1Num = Number(areaMaxP1), areaMaxP2Num = Number(areaMaxP2);
  const areaPapersReady = areaMaxP1 !== '' && !isNaN(areaMaxP1Num) && areaMaxP1Num > 0
                        && areaMaxP2 !== '' && !isNaN(areaMaxP2Num) && areaMaxP2Num > 0;

  // By-learner mode: chosen learner + { subject: rawScore }
  const [learnerId, setLearnerId]   = useState('');
  const [learnerScores, setLearnerScores] = useState<Record<string, string>>({});
  const [learnerScoresP2, setLearnerScoresP2] = useState<Record<string, string>>({});  // Paper 2, keyed by subject
  // Per-subject "out of" for Paper 1 / Paper 2 in learner mode, since several multi-paper
  // subjects can be on screen at once and each may have a different total.
  const [learnerPaperMax, setLearnerPaperMax] = useState<Record<string, { p1: string; p2: string }>>({});
  const getLearnerPaperMax = (a: string) => learnerPaperMax[a] || { p1: '', p2: '' };

  // Learning areas that are examined as Paper 1 + Paper 2 for this class's grade (e.g.
  // English, Kiswahili in Junior/Senior School) — entered separately, summed on the mark list.
  const [paperConfig, setPaperConfig] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!stream?.gradeLevel) { setPaperConfig({}); return; }
    apiClient.get('/academic/subject-paper-config', { params: { gradeLevel: stream.gradeLevel } })
      .then(r => setPaperConfig(r.data || {})).catch(() => setPaperConfig({}));
  }, [stream?.gradeLevel]);
  const hasPapers = (a: string) => (paperConfig[a.toLowerCase()] || 1) >= 2;

  const areas = useMemo(() => stream ? learningAreasFor(stream.gradeLevel) : [], [stream]);
  const termExams = exams.filter(e => !term || e.term === term);
  const selectedExam = exams.find(e => e.id === examId);

  useEffect(() => {
    apiClient.get('/academic/streams').then(r => {
      setStreams(r.data || []);
      if (r.data?.[0]) setStreamId(r.data[0].id);
    }).catch(() => {});
    apiClient.get('/academic/exams').then(r => setExams(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (termExams.length && !termExams.find(e => e.id === examId)) setExamId(termExams[0].id);
  }, [term, exams]);

  useEffect(() => { if (areas.length && !areas.includes(area)) setArea(areas[0]); }, [areas]);

  useEffect(() => {
    if (!streamId) return;
    setLoading(true);
    apiClient.get(`/academic/streams/${streamId}/learners`)
      .then(r => { setLearners(r.data || []); if (r.data?.[0]) setLearnerId(r.data[0].id); })
      .catch(() => setLearners([]))
      .finally(() => setLoading(false));
  }, [streamId]);

  // Load already-saved marks so they appear in the boxes (and stay after saving). This
  // lets an admin re-open a class, see every entered mark, change "out of" or any value,
  // and re-save — updating the whole column.
  const [savedMap, setSavedMap] = useState<Record<string, Record<string, string>>>({});
  const loadExisting = async () => {
    if (!streamId || !examId) { setSavedMap({}); return; }
    try {
      const r = await apiClient.get('/academic/mark-list', { params: { streamId, term, examId } });
      const rows = r.data?.learners || [];
      const map: Record<string, Record<string, string>> = {};
      for (const lr of rows) {
        const lid = lr.learnerId || lr.id;
        const subs = lr.subjects || {};
        map[lid] = {};
        for (const [subj, val] of Object.entries(subs)) {
          const raw = (val as any)?.rawScore;
          if (raw != null) map[lid][subj] = String(raw);
        }
      }
      setSavedMap(map);
    } catch { setSavedMap({}); }
  };
  useEffect(() => { loadExisting(); /* eslint-disable-next-line */ }, [streamId, term, examId]);

  // Pre-fill boxes from saved marks when area/learner/mode changes.
  useEffect(() => {
    if (mode !== 'area' || !area) return;
    const next: Record<string, string> = {};
    for (const [lid, subs] of Object.entries(savedMap)) {
      const hit = Object.entries(subs).find(([s]) => s.toLowerCase() === area.toLowerCase());
      if (hit) next[lid] = hit[1];
    }
    setAreaScores(next);
  }, [savedMap, area, mode]);
  useEffect(() => {
    if (mode !== 'learner' || !learnerId) return;
    setLearnerScores(savedMap[learnerId] ? { ...savedMap[learnerId] } : {});
  }, [savedMap, learnerId, mode]);

  const senior = stream ? isSeniorScale(stream.gradeLevel) : false;

  const buildRecord = (lid: string, subject: string, raw: string, paper?: '1' | '2', maxOverride?: number) => {
    const n = Number(raw);
    if (raw === '' || isNaN(n)) return null;
    const maxN = maxOverride != null ? maxOverride : maxScoreNum;
    if (!maxN || isNaN(maxN) || maxN <= 0) return null;  // no "out of" set for this paper → skip
    const percent = Math.round((n / maxN) * 100);
    const level = percentToLevel(percent, stream?.gradeLevel || 'grade_4').code;
    return {
      learnerId: lid, streamId, gradeLevel: stream?.gradeLevel, subject,
      rawScore: n, maxScore: maxN, percent, level, paper: paper || null,
      examType: selectedExam?.examType || '', examId,
      term, academicYear: '2025/2026',
    };
  };

  // Combined percent/level across Paper 1 + Paper 2 (on-screen preview only — the backend
  // re-sums raw/max scores itself when building the mark list). Each paper can have its own
  // "out of" total.
  const combinedLevelFor = (raw1: string, raw2: string, max1: number, max2: number) => {
    const n1 = Number(raw1), n2 = Number(raw2);
    const has1 = raw1 !== '' && !isNaN(n1) && max1 > 0, has2 = raw2 !== '' && !isNaN(n2) && max2 > 0;
    if (!has1 && !has2) return null;
    const rawSum = (has1 ? n1 : 0) + (has2 ? n2 : 0);
    const maxSum = (has1 ? max1 : 0) + (has2 ? max2 : 0);
    return percentToLevel(Math.round((rawSum / maxSum) * 100), stream?.gradeLevel || 'grade_4');
  };

  const saveArea = async () => {
    if (!examId) { toast.error('Pick an assessment first'); return; }
    const paperMode = hasPapers(area);
    if (paperMode && !areaPapersReady) { toast.error('Set the "out of" for both Paper 1 and Paper 2 first'); return; }
    const records = paperMode
      ? Object.keys({ ...areaScores, ...areaScoresP2 }).flatMap(lid => [
          buildRecord(lid, area, areaScores[lid] ?? '', '1', areaMaxP1Num),
          buildRecord(lid, area, areaScoresP2[lid] ?? '', '2', areaMaxP2Num),
        ]).filter(Boolean)
      : Object.entries(areaScores).map(([lid, raw]) => buildRecord(lid, area, raw)).filter(Boolean);
    if (!records.length) { toast.error('Enter at least one mark'); return; }
    setSaving(true);
    try {
      await apiClient.post('/academic/assessment-results/bulk', { records });
      toast.success(`Saved ${records.length} marks for ${area}`);
      await loadExisting();   // keep saved values visible
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not save'); }
    finally { setSaving(false); }
  };

  const saveLearner = async () => {
    if (!examId) { toast.error('Pick an assessment first'); return; }
    const records = areas.flatMap(a => {
      if (hasPapers(a)) {
        const lpm = getLearnerPaperMax(a);
        return [
          buildRecord(learnerId, a, learnerScores[a] ?? '', '1', Number(lpm.p1)),
          buildRecord(learnerId, a, learnerScoresP2[a] ?? '', '2', Number(lpm.p2)),
        ].filter(Boolean);
      }
      const rec = buildRecord(learnerId, a, learnerScores[a] ?? '');
      return rec ? [rec] : [];
    });
    if (!records.length) { toast.error('Enter at least one mark (and set each Paper\'s "out of")'); return; }
    setSaving(true);
    try {
      await apiClient.post('/academic/assessment-results/bulk', { records });
      const who = learners.find(l => l.id === learnerId);
      toast.success(`Saved ${records.length} marks for ${who?.firstName || 'learner'}`);
      await loadExisting();   // keep saved values visible
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not save'); }
    finally { setSaving(false); }
  };

  const levelFor = (raw: string) => {
    const n = Number(raw);
    if (raw === '' || isNaN(n)) return null;
    return percentToLevel(Math.round((n / maxScoreNum) * 100), stream?.gradeLevel || 'grade_4');
  };

  const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error('load failed'));
    document.head.appendChild(s);
  });

  const areaRankingUrl = () => {
    const base = (typeof window !== 'undefined' ? window.location.origin : '');
    return `${(process.env.NEXT_PUBLIC_API_URL || base)}/api/v1/pdf/area-ranking/html?streamId=${streamId}&term=${term}&examId=${examId}&subject=${encodeURIComponent(area)}&academicYear=2025/2026`;
  };

  const printAreaRanking = () => {
    if (!examId) { toast.error('Pick an assessment first'); return; }
    const token = localStorage.getItem('zaroda_token');
    fetch(areaRankingUrl(), { headers: { Authorization: `Bearer ${token}` } }).then(r => r.text())
      .then(html => { const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); } })
      .catch(() => toast.error('Could not open ranking'));
  };

  const downloadAreaPdf = async () => {
    if (!examId) { toast.error('Pick an assessment first'); return; }
    const filename = `${area}-${stream?.name || 'class'}-${term}.pdf`.replace(/\s+/g, '_');
    const toastId = toast.loading('Preparing PDF…');
    try {
      const token = localStorage.getItem('zaroda_token');
      const html = await fetch(areaRankingUrl(), { headers: { Authorization: `Bearer ${token}` } }).then(r => r.text());
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      const html2canvas = (window as any).html2canvas;
      const JsPDF = (window as any).jspdf?.jsPDF;
      if (!html2canvas || !JsPDF) throw new Error('pdf libs unavailable');
      const holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:800px;background:#fff';
      holder.innerHTML = html;
      document.body.appendChild(holder);
      holder.querySelectorAll('script').forEach(s => s.remove());
      const canvas = await html2canvas(holder, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      document.body.removeChild(holder);
      const pdf = new JsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
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
      printAreaRanking();
    }
  };

  const filteredLearners = learners.filter(l => matchesLearner(l, search));

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2">
        <Calculator className="text-theme-muted" size={20}/>
        <h1 className="text-lg font-black text-theme-heading">Enter Marks</h1>
      </div>
      <p className="text-sm text-theme-muted">
        Enter marks on behalf of a teacher. Phone-friendly: one learning area at a time, or one learner at a time.
      </p>

      {/* Shared controls */}
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Class</label>
            <select value={streamId} onChange={e => setStreamId(e.target.value)} className="input w-full">
              {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Term</label>
            <select value={term} onChange={e => setTerm(e.target.value)} className="input w-full">
              {TERMS.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Assessment</label>
            <select value={examId} onChange={e => setExamId(e.target.value)} className="input w-full">
              {termExams.length === 0 && <option value="">No assessments this term</option>}
              {termExams.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
            </select>
          </div>
          {mode === 'area' && hasPapers(area) ? (
            <div>
              <label className="label" style={{ color: areaPapersReady ? undefined : '#f5820a' }}>
                Out of — Paper 1 / Paper 2 *
              </label>
              <div className="flex gap-2">
                <input
                  type="number" inputMode="numeric" value={areaMaxP1}
                  onChange={e => setAreaMaxP1(e.target.value)}
                  placeholder="P1 e.g. 40"
                  className="input w-full font-bold"
                  style={areaMaxP1 !== '' && areaMaxP1Num > 0
                    ? { borderColor: '#16a34a', background: 'rgba(22,163,74,0.06)' }
                    : { borderColor: '#f5820a', background: 'rgba(245,130,10,0.08)' }}
                />
                <input
                  type="number" inputMode="numeric" value={areaMaxP2}
                  onChange={e => setAreaMaxP2(e.target.value)}
                  placeholder="P2 e.g. 60"
                  className="input w-full font-bold"
                  style={areaMaxP2 !== '' && areaMaxP2Num > 0
                    ? { borderColor: '#16a34a', background: 'rgba(22,163,74,0.06)' }
                    : { borderColor: '#f5820a', background: 'rgba(245,130,10,0.08)' }}
                />
              </div>
              {!areaPapersReady && <p className="text-[11px] mt-1" style={{ color: '#f5820a' }}>Paper 1 & 2 usually have different totals — set both.</p>}
            </div>
          ) : (
            <div>
              <label className="label" style={{ color: maxScoreReady ? undefined : '#f5820a' }}>
                Out of (total score) *
              </label>
              <input
                type="number" inputMode="numeric" value={maxScore}
                onChange={e => setMaxScore(e.target.value)}
                placeholder="e.g. 30"
                className="input w-full font-bold"
                style={maxScoreReady
                  ? { borderColor: '#16a34a', background: 'rgba(22,163,74,0.06)' }
                  : { borderColor: '#f5820a', background: 'rgba(245,130,10,0.08)' }}
              />
              {!maxScoreReady && <p className="text-[11px] mt-1" style={{ color: '#f5820a' }}>Set the subject's total score first.</p>}
            </div>
          )}
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1">
        <button onClick={() => setMode('area')}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1 ${mode==='area' ? 'bg-[#1a2e5a] text-white' : 'bg-surface-2 text-theme-muted'}`}>
          <BookOpen size={14}/> By Learning Area
        </button>
        <button onClick={() => setMode('learner')}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1 ${mode==='learner' ? 'bg-[#1a2e5a] text-white' : 'bg-surface-2 text-theme-muted'}`}>
          <User size={14}/> By Learner
        </button>
      </div>

      {!examId ? (
        <div className="card p-6 text-center text-theme-muted text-sm">
          Create an assessment for this term first (Academic → Assessments), then return here to enter marks.
        </div>
      ) : (mode === 'area' ? (hasPapers(area) ? !areaPapersReady : !maxScoreReady) : !maxScoreReady) ? (
        <div className="card p-6 text-center text-sm" style={{ color: '#f5820a', border: '1px solid #f5820a' }}>
          Enter the <b>“Out of (total score)”</b> for this subject above before you start entering marks.
        </div>
      ) : loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-theme-muted" size={24}/></div>
      ) : mode === 'area' ? (
        <div className="card p-4 space-y-3">
          <div>
            <label className="label">Learning Area</label>
            <select value={area} onChange={e => { setArea(e.target.value); setAreaScores({}); setAreaScoresP2({}); }} className="input w-full">
              {areas.map(a => <option key={a} value={a}>{a}{hasPapers(a) ? ' (Paper 1 & 2)' : ''}</option>)}
            </select>
          </div>
          <LearnerSearch value={search} onChange={setSearch} />
          <div className="divide-y divide-theme">
            {filteredLearners.map(l => {
              const paperMode = hasPapers(area);
              const raw = areaScores[l.id] ?? '';
              const raw2 = areaScoresP2[l.id] ?? '';
              const lvl = paperMode ? combinedLevelFor(raw, raw2, areaMaxP1Num, areaMaxP2Num) : levelFor(raw);
              return (
                <div key={l.id} className="flex items-center gap-2 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-theme-heading truncate">{l.firstName} {l.lastName}</div>
                    <div className="text-[11px] text-theme-muted">{l.admissionNumber || ''}</div>
                  </div>
                  {lvl && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ color: lvl.color }}>{lvl.code}</span>}
                  {paperMode ? (
                    <>
                      <input
                        type="number" inputMode="numeric" value={raw}
                        onChange={e => setAreaScores({ ...areaScores, [l.id]: e.target.value })}
                        placeholder="P1" title="Paper 1"
                        className="input w-16 text-center"
                      />
                      <input
                        type="number" inputMode="numeric" value={raw2}
                        onChange={e => setAreaScoresP2({ ...areaScoresP2, [l.id]: e.target.value })}
                        placeholder="P2" title="Paper 2"
                        className="input w-16 text-center"
                      />
                    </>
                  ) : (
                    <input
                      type="number" inputMode="numeric" value={raw}
                      onChange={e => setAreaScores({ ...areaScores, [l.id]: e.target.value })}
                      placeholder="—"
                      className="input w-20 text-center"
                    />
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={saveArea} disabled={saving} className="btn-primary w-full justify-center">
            {saving ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>} Save {area} marks
          </button>
          <button onClick={downloadAreaPdf} className="btn-primary w-full justify-center">
            <Download size={16}/> Download {area} ranking (PDF)
          </button>
          <button onClick={printAreaRanking} className="btn-ghost w-full justify-center">
            <Printer size={16}/> Print {area} ranking
          </button>
        </div>
      ) : (
        <div className="card p-4 space-y-3">
          <div>
            <label className="label">Learner</label>
            <div className="flex gap-2">
              <LearnerSearch value={search} onChange={setSearch} className="flex-1" />
            </div>
            <select value={learnerId} onChange={e => { setLearnerId(e.target.value); setLearnerScores({}); setLearnerScoresP2({}); }} className="input w-full mt-2">
              {filteredLearners.map(l => <option key={l.id} value={l.id}>{l.firstName} {l.lastName} {l.admissionNumber ? `(${l.admissionNumber})` : ''}</option>)}
            </select>
          </div>
          <div className="divide-y divide-theme">
            {areas.map(a => {
              const paperMode = hasPapers(a);
              const raw = learnerScores[a] ?? '';
              const raw2 = learnerScoresP2[a] ?? '';
              const lpm = getLearnerPaperMax(a);
              const lvl = paperMode ? combinedLevelFor(raw, raw2, Number(lpm.p1), Number(lpm.p2)) : levelFor(raw);
              return (
                <div key={a} className={paperMode ? 'py-2' : 'flex items-center gap-2 py-2'}>
                  {paperMode ? (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0 text-sm font-medium text-theme-heading">{a}<span className="text-[10px] text-theme-muted"> (P1+P2)</span></div>
                        {lvl && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ color: lvl.color }}>{lvl.code}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <input
                          type="number" inputMode="numeric" value={raw}
                          onChange={e => setLearnerScores({ ...learnerScores, [a]: e.target.value })}
                          placeholder="P1 score" title="Paper 1 score"
                          className="input w-20 text-center"
                        />
                        <span className="text-theme-muted text-xs">/</span>
                        <input
                          type="number" inputMode="numeric" value={lpm.p1}
                          onChange={e => setLearnerPaperMax({ ...learnerPaperMax, [a]: { ...lpm, p1: e.target.value } })}
                          placeholder="out of" title="Paper 1 out of"
                          className="input w-16 text-center"
                        />
                        <input
                          type="number" inputMode="numeric" value={raw2}
                          onChange={e => setLearnerScoresP2({ ...learnerScoresP2, [a]: e.target.value })}
                          placeholder="P2 score" title="Paper 2 score"
                          className="input w-20 text-center ml-2"
                        />
                        <span className="text-theme-muted text-xs">/</span>
                        <input
                          type="number" inputMode="numeric" value={lpm.p2}
                          onChange={e => setLearnerPaperMax({ ...learnerPaperMax, [a]: { ...lpm, p2: e.target.value } })}
                          placeholder="out of" title="Paper 2 out of"
                          className="input w-16 text-center"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0 text-sm font-medium text-theme-heading">{a}</div>
                      {lvl && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ color: lvl.color }}>{lvl.code}</span>}
                      <input
                        type="number" inputMode="numeric" value={raw}
                        onChange={e => setLearnerScores({ ...learnerScores, [a]: e.target.value })}
                        placeholder="—"
                        className="input w-20 text-center"
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={saveLearner} disabled={saving} className="btn-primary w-full justify-center">
            {saving ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>} Save learner marks
          </button>
        </div>
      )}
    </div>
  );
}
