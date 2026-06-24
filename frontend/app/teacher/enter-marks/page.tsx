// app/dashboard/academic/enter-marks/page.tsx
// Admin/HOI marks entry — mobile friendly. Two modes:
//   • By Learning Area: pick one subject, enter that mark for every learner (one column)
//   • By Learner: pick one learner, enter all their learning-area marks (one form)
// Tied to a created assessment (exam), like the teacher flow. Lets an admin fill in
// marks when a teacher can't — without the unusable wide grid on a phone.
'use client';
import { useState, useEffect, useMemo } from 'react';
import { Save, Loader2, Calculator, User, BookOpen, Printer, Download } from 'lucide-react';
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
  const [maxScore, setMaxScore] = useState<string>('');  // blank & mandatory — teacher must set the subject's total before entering marks
  const maxScoreNum = Number(maxScore);
  const maxScoreReady = maxScore !== '' && !isNaN(maxScoreNum) && maxScoreNum > 0;
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);

  // By-area mode: chosen learning area + { learnerId: rawScore }
  const [area, setArea]         = useState('');
  const [areaScores, setAreaScores] = useState<Record<string, string>>({});

  // By-learner mode: chosen learner + { subject: rawScore }
  const [learnerId, setLearnerId]   = useState('');
  const [learnerScores, setLearnerScores] = useState<Record<string, string>>({});

  const areas = useMemo(() => stream ? learningAreasFor(stream.gradeLevel) : [], [stream]);
  const termExams = exams.filter(e => !term || e.term === term);
  const selectedExam = exams.find(e => e.id === examId);

  useEffect(() => {
    if (!user) return;
    const seesAll = (user.role === 'super_admin');
    Promise.all([
      apiClient.get('/academic/streams'),
      apiClient.get(`/academic/teachers/${user.id}/stream-subjects`).catch(() => ({ data: [] })),
    ]).then(([r, ss]) => {
      const all = r.data || [];
      const assignedIds = new Set<string>((ss.data || []).map((row: any) => String(row.streamId)));
      // A teacher sees streams they teach a subject in OR are class teacher of.
      const mine = all.filter((x: any) => assignedIds.has(String(x.id)) || x.id === user.streamId || x.classTeacherId === user.id);
      const list = seesAll ? all : (mine.length ? mine : all);
      setStreams(list);
      const s = (user.streamId && list.find((x: any) => x.id === user.streamId)) || list[0];
      if (s) setStreamId(s.id);
    }).catch(() => {});
    apiClient.get('/academic/exams').then(r => setExams(r.data || [])).catch(() => {});
  }, [user]);

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

  // Load already-saved marks for the current stream/term/assessment so they appear in
  // the boxes (and don't "disappear" after saving). Returns a {learnerId: {subject: raw}}
  // map built from saved rawScore values.
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

  // When the saved map, chosen area, or chosen learner changes, pre-fill the boxes.
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

  const buildRecord = (lid: string, subject: string, raw: string) => {
    const n = Number(raw);
    if (raw === '' || isNaN(n)) return null;
    const percent = Math.round((n / maxScoreNum) * 100);
    const level = percentToLevel(percent, stream?.gradeLevel || 'grade_4').code;
    return {
      learnerId: lid, streamId, gradeLevel: stream?.gradeLevel, subject,
      rawScore: n, maxScore: maxScoreNum, percent, level,
      examType: selectedExam?.examType || '', examId,
      term, academicYear: '2025/2026',
    };
  };

  const saveArea = async () => {
    if (!examId) { toast.error('Pick an assessment first'); return; }
    const records = Object.entries(areaScores)
      .map(([lid, raw]) => buildRecord(lid, area, raw)).filter(Boolean);
    if (!records.length) { toast.error('Enter at least one mark'); return; }
    setSaving(true);
    try {
      await apiClient.post('/academic/assessment-results/bulk', { records });
      toast.success(`Saved ${records.length} marks for ${area}`);
      await loadExisting();   // reload so the saved values stay visible
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not save'); }
    finally { setSaving(false); }
  };

  const saveLearner = async () => {
    if (!examId) { toast.error('Pick an assessment first'); return; }
    const records = Object.entries(learnerScores)
      .map(([subject, raw]) => buildRecord(learnerId, subject, raw)).filter(Boolean);
    if (!records.length) { toast.error('Enter at least one mark'); return; }
    setSaving(true);
    try {
      await apiClient.post('/academic/assessment-results/bulk', { records });
      const who = learners.find(l => l.id === learnerId);
      toast.success(`Saved ${records.length} marks for ${who?.firstName || 'learner'}`);
      await loadExisting();   // reload so the saved values stay visible
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

  // True download-to-device PDF of the {area} ranking (client-side render).
  const downloadAreaPdf = async () => {
    if (!examId) { toast.error('Pick an assessment first'); return; }
    const filename = `${area}-${stream?.name || 'class'}-${term}.pdf`.replace(/\s+/g, '_');
    const toastId = toast.loading('Preparing PDF…');
    try {
      const base = (typeof window !== 'undefined' ? window.location.origin : '');
      const token = localStorage.getItem('zaroda_token');
      const url = `${(process.env.NEXT_PUBLIC_API_URL || base)}/api/v1/pdf/area-ranking/html?streamId=${streamId}&term=${term}&examId=${examId}&subject=${encodeURIComponent(area)}&academicYear=2025/2026`;
      const html = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.text());
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
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      const img = canvas.toDataURL('image/png');
      let remaining = imgH, position = 0;
      if (imgH <= pageH) { pdf.addImage(img, 'PNG', 0, 0, imgW, imgH); }
      else { while (remaining > 0) { pdf.addImage(img, 'PNG', 0, position, imgW, imgH); remaining -= pageH; position -= pageH; if (remaining > 0) pdf.addPage(); } }
      pdf.save(filename);
      toast.success('PDF downloaded', { id: toastId });
    } catch {
      toast.dismiss(toastId);
      // Fallback: open print page
      const base = (typeof window !== 'undefined' ? window.location.origin : '');
      const token = localStorage.getItem('zaroda_token');
      const url = `${(process.env.NEXT_PUBLIC_API_URL || base)}/api/v1/pdf/area-ranking/html?streamId=${streamId}&term=${term}&examId=${examId}&subject=${encodeURIComponent(area)}&academicYear=2025/2026`;
      fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.text())
        .then(html => { const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); } })
        .catch(() => toast.error('Could not generate PDF'));
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
        Enter marks for your class. Phone-friendly: one learning area at a time, or one learner at a time.
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
            {!maxScoreReady && <p className="text-[11px] mt-1" style={{ color: '#f5820a' }}>Set your subject's total score first.</p>}
          </div>
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
      ) : !maxScoreReady ? (
        <div className="card p-6 text-center text-sm" style={{ color: '#f5820a', border: '1px solid #f5820a' }}>
          Enter the <b>“Out of (total score)”</b> for this subject above before you start entering marks.
        </div>
      ) : loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-theme-muted" size={24}/></div>
      ) : mode === 'area' ? (
        <div className="card p-4 space-y-3">
          <div>
            <label className="label">Learning Area</label>
            <select value={area} onChange={e => { setArea(e.target.value); setAreaScores({}); }} className="input w-full">
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <LearnerSearch value={search} onChange={setSearch} />
          <div className="divide-y divide-theme">
            {filteredLearners.map(l => {
              const raw = areaScores[l.id] ?? '';
              const lvl = levelFor(raw);
              return (
                <div key={l.id} className="flex items-center gap-2 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-theme-heading truncate">{l.firstName} {l.lastName}</div>
                    <div className="text-[11px] text-theme-muted">{l.admissionNumber || ''}</div>
                  </div>
                  {lvl && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ color: lvl.color }}>{lvl.code}</span>}
                  <input
                    type="number" inputMode="numeric" value={raw}
                    onChange={e => setAreaScores({ ...areaScores, [l.id]: e.target.value })}
                    placeholder="—"
                    className="input w-20 text-center"
                  />
                </div>
              );
            })}
          </div>
          <button onClick={saveArea} disabled={saving} className="btn-primary w-full justify-center">
            {saving ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>} Save {area} marks
          </button>
          <button
            onClick={() => {
              if (!examId) { toast.error('Pick an assessment first'); return; }
              const base = (typeof window !== 'undefined' ? window.location.origin : '');
              const token = localStorage.getItem('zaroda_token');
              const url = `${(process.env.NEXT_PUBLIC_API_URL || base)}/api/v1/pdf/area-ranking/html?streamId=${streamId}&term=${term}&examId=${examId}&subject=${encodeURIComponent(area)}&academicYear=2025/2026`;
              fetch(url, { headers: { Authorization: `Bearer ${token}` } })
                .then(r => r.text())
                .then(html => { const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); } })
                .catch(() => toast.error('Could not open ranking'));
            }}
            className="btn-ghost w-full justify-center">
            <Printer size={16}/> Print {area} ranking (score + level)
          </button>
          <button onClick={downloadAreaPdf} className="btn-primary w-full justify-center">
            <Download size={16}/> Download {area} ranking (PDF)
          </button>
          <button
            onClick={() => {
              const rows = [['Learner','Admission','Score','Out of','Percent','Level']];
              filteredLearners.forEach(l => {
                const raw = areaScores[l.id] ?? '';
                const lvl = levelFor(raw);
                const pct = raw !== '' && !isNaN(Number(raw)) ? Math.round((Number(raw)/maxScoreNum)*100) : '';
                rows.push([`${l.firstName||''} ${l.lastName||''}`.trim(), l.admissionNumber||'', String(raw), String(maxScoreNum), pct === '' ? '' : `${pct}%`, lvl?.code || '']);
              });
              const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `${area}-${stream?.name||'class'}-${term}.csv`.replace(/\s+/g,'_');
              a.click();
            }}
            className="btn-ghost w-full justify-center">
            <Download size={16}/> Download {area} list (CSV)
          </button>
        </div>
      ) : (
        <div className="card p-4 space-y-3">
          <div>
            <label className="label">Learner</label>
            <div className="flex gap-2">
              <LearnerSearch value={search} onChange={setSearch} className="flex-1" />
            </div>
            <select value={learnerId} onChange={e => { setLearnerId(e.target.value); setLearnerScores({}); }} className="input w-full mt-2">
              {filteredLearners.map(l => <option key={l.id} value={l.id}>{l.firstName} {l.lastName} {l.admissionNumber ? `(${l.admissionNumber})` : ''}</option>)}
            </select>
          </div>
          <div className="divide-y divide-theme">
            {areas.map(a => {
              const raw = learnerScores[a] ?? '';
              const lvl = levelFor(raw);
              return (
                <div key={a} className="flex items-center gap-2 py-2">
                  <div className="flex-1 min-w-0 text-sm font-medium text-theme-heading">{a}</div>
                  {lvl && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ color: lvl.color }}>{lvl.code}</span>}
                  <input
                    type="number" inputMode="numeric" value={raw}
                    onChange={e => setLearnerScores({ ...learnerScores, [a]: e.target.value })}
                    placeholder="—"
                    className="input w-20 text-center"
                  />
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
