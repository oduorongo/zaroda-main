'use client';
import { useState, useEffect, useMemo } from 'react';
import { Save, Loader2, Calculator } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, isHoi } from '@/lib/hooks/useAuth';
import { GRADE_LEVELS, LEARNING_AREAS, percentToLevel, isSeniorScale, levelsFor, learningAreasFor, levelBandLabel, learningAreaMatches } from '@/lib/cbc/constants';
import toast from 'react-hot-toast';

export default function TeacherMarks() {
  const { user } = useAuth();
  const [streams, setStreams]   = useState<any[]>([]);
  const [streamId, setStreamId] = useState('');
  const [stream, setStream]     = useState<any>(null);
  const [mySubjects, setMySubjects] = useState<string[]>([]);
  const [streamSubjects, setStreamSubjects] = useState<any[]>([]); // per-stream assignment
  const [rubricAreas, setRubricAreas] = useState<string[]>([]);    // DB rubric (same source as mark-list)
  const [subject, setSubject]   = useState('');
  const [learners, setLearners] = useState<any[]>([]);
  const [term, setTerm]         = useState('term_1');
  const [examType, setExamType] = useState('end_term');
  const [maxScore, setMaxScore] = useState(100);
  const [scores, setScores]     = useState<Record<string, number>>({});
  const [savedSubjects, setSavedSubjects] = useState<string[]>([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      apiClient.get('/academic/streams').catch(()=>({data:[]})),
      apiClient.get('/academic/teachers').catch(()=>({data:[]})),
      apiClient.get(`/academic/teachers/${user.id}/stream-subjects`).catch(()=>({data:[]})),
    ]).then(([s, t, ss]) => {
      const all = s.data || [];
      const seesAll = isHoi(user?.role || '') || user?.role === 'super_admin';
      const me = (t.data||[]).find((x:any)=>x.id===user.id);
      const streamSubs = ss.data || [];
      setStreamSubjects(streamSubs);
      const assignedIds = new Set<string>(streamSubs.map((row:any)=>String(row.streamId)));
      const mine = all.filter((x:any) => assignedIds.has(String(x.id)) || x.id === user.streamId || x.classTeacherId === user.id);
      const list = seesAll ? all : (mine.length ? mine : all);
      setStreams(list);
      const url = new URLSearchParams(window.location.search);
      const sid = url.get('streamId') || (user.streamId && list.find((x:any)=>x.id===user.streamId)?.id) || list[0]?.id || '';
      setStreamId(sid); setStream(list.find((x:any)=>x.id===sid));
      const subs = me?.subjects || [];
      setMySubjects(subs);
    });
  }, [user]);

  useEffect(() => {
    if (!streamId) return;
    const s = streams.find(x=>x.id===streamId);
    setStream(s);
    setLoading(true);
    setSavedSubjects([]); setScores({});  // fresh entry session for this class
    Promise.all([
      apiClient.get(`/academic/streams/${streamId}/learners`).catch(()=>({data:[]})),
      s?.gradeLevel
        ? apiClient.get('/assessment/learning-areas', { params: { gradeLevel: s.gradeLevel } }).catch(()=>({data:[]}))
        : Promise.resolve({ data: [] }),
    ]).then(([lrn, ra]) => {
      setLearners(lrn.data);
      setRubricAreas(Array.from(new Set((ra.data || []).map((x:any)=>x.learningArea).filter(Boolean))));
    }).finally(()=>setLoading(false));
  }, [streamId, term, examType, streams]);

  const band = useMemo(() => levelBandLabel(stream?.gradeLevel || 'grade_4'), [stream]);
  // Authoritative area list = the class's DB assessment rubric (SAME source the
  // mark-list uses for its columns), falling back to the KICD band list only if the
  // rubric isn't set up yet. This guarantees marks save under names the mark-list shows.
  const classAreas = useMemo(() => {
    const g = stream?.gradeLevel || 'grade_4';
    // Senior School (Grades 10–12): areas = 4 core + every elective taken by any learner
    // in this stream (same union the mark-list and report card use), so electives are
    // markable and then flow through to both documents.
    if (['grade_10','grade_11','grade_12'].includes(g)) {
      const core = ['English', 'Kiswahili', 'Core Mathematics', 'Community Service Learning'];
      const electiveSet = new Set<string>();
      (learners || []).forEach((l:any) => (Array.isArray(l.electives) ? l.electives : []).forEach((e:string) => e && electiveSet.add(e)));
      return [...core, ...Array.from(electiveSet)];
    }
    if (rubricAreas.length) return rubricAreas;
    return learningAreasFor(g);
  }, [rubricAreas, stream, learners]);

  // Subjects this teacher may enter for THIS stream: rubric ∩ per-stream assignment.
  const subjectOptions = useMemo(() => {
    const mineForStream: string[] = (streamSubjects || [])
      .filter((row:any) => row.streamId === streamId)
      .flatMap((row:any) => row.subjects || []);
    const mine = mineForStream.length ? mineForStream : mySubjects; // fallback to flat union
    if (!mine.length) return classAreas;
    const filtered = classAreas.filter(area => mine.some(sub => learningAreaMatches(area, sub)));
    return filtered.length ? filtered : classAreas;
  }, [classAreas, streamSubjects, mySubjects, streamId]);

  // Keep the selected subject valid for the current class band
  useEffect(() => {
    if (subjectOptions.length && !subjectOptions.includes(subject)) {
      setSubject(subjectOptions[0]);
    }
  }, [subjectOptions]); // eslint-disable-line

  const ranked = useMemo(() => {
    const rows = learners.map(l => {
      const raw = scores[l.id];
      const has = raw !== undefined && raw !== null;
      const percent = has ? Math.round((raw / maxScore) * 100) : 0;
      return { learner: l, raw, percent, has };
    });
    const withS = rows.filter(r=>r.has).sort((a,b)=>b.percent-a.percent);
    withS.forEach((r,i)=>(r as any).rank=i+1);
    return [...withS, ...rows.filter(r=>!r.has)];
  }, [learners, scores, maxScore]);

  const save = async () => {
    setSaving(true);
    try {
      const records = ranked.filter(r=>r.has).map(r => ({
        learnerId: r.learner.id, streamId, subject,
        rawScore: r.raw, maxScore, percent: r.percent,
        level: percentToLevel(r.percent, stream?.gradeLevel||'grade_4').code,
        gradeLevel: stream?.gradeLevel,
        term, examType, academicYear: '2025/2026',
      }));
      if (!records.length) { toast.error('Enter at least one score'); setSaving(false); return; }
      await apiClient.post('/academic/assessment-results/bulk', { records });

      // Track which learning areas are done, then auto-advance to the next one.
      const nowSaved = Array.from(new Set([...savedSubjects, subject]));
      setSavedSubjects(nowSaved);

      const remaining = subjectOptions.filter(s => !nowSaved.includes(s));
      if (remaining.length) {
        toast.success(`${subject} saved — now enter ${remaining[0]}`);
        setScores({});            // clear grid for the next learning area
        setSubject(remaining[0]); // open the next learning area
      } else {
        toast.success(`${subject} saved — all learning areas complete for this class`);
      }
    } catch { toast.error('Could not save marks'); }
    finally { setSaving(false); }
  };

  const scaleLabel = stream ? (isSeniorScale(stream.gradeLevel) ? '8-level' : '4-level') : '';

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Enter Marks</h1>
          <p className="text-sm text-theme-muted">Raw scores auto-convert to CBC level &amp; rank your class</p>
        </div>
        <button onClick={save} disabled={saving || learners.length===0 || !subject} className="btn-primary">
          {saving ? <><Loader2 size={16} className="animate-spin"/> Saving…</> : <><Save size={16}/> Save Marks</>}
        </button>
      </div>

      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div><label className="label">Stream</label>
          <select value={streamId} onChange={e=>setStreamId(e.target.value)} className="input w-40">
            {streams.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div><label className="label">Subject</label>
          <select value={subject} onChange={e=>setSubject(e.target.value)} className="input w-44">
            {subjectOptions.map(s=><option key={s} value={s}>{savedSubjects.includes(s) ? `✓ ${s}` : s}</option>)}
          </select>
        </div>
        <div><label className="label">Term</label>
          <select value={term} onChange={e=>setTerm(e.target.value)} className="input w-28">
            <option value="term_1">Term 1</option><option value="term_2">Term 2</option><option value="term_3">Term 3</option>
          </select>
        </div>
        <div><label className="label">Out of</label>
          <input type="number" value={maxScore} onChange={e=>setMaxScore(Number(e.target.value)||100)} className="input w-20"/>
        </div>
        {stream && <div className="ml-auto text-xs bg-surface-2 rounded-lg px-3 py-2 text-theme-muted"><Calculator size={12} className="inline mr-1"/>{scaleLabel} · {band}</div>}
      </div>

      {subjectOptions.length > 1 && (
        <div className="card p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-theme-muted uppercase tracking-wide">Learning Areas Progress</span>
            <span className="text-xs text-theme-muted">{savedSubjects.length}/{subjectOptions.length} saved</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {subjectOptions.map(s => (
              <button key={s} onClick={()=>setSubject(s)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  s === subject ? 'bg-[#1a2e5a] text-white border-transparent'
                  : savedSubjects.includes(s) ? 'bg-green-500/10 text-green-600 border-green-500/30'
                  : 'bg-surface-2 text-theme-muted border-theme'}`}>
                {savedSubjects.includes(s) ? '✓ ' : ''}{s}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? <div className="h-64 shimmer rounded-2xl"/> : learners.length===0 ? (
        <div className="card p-10 text-center text-theme-muted">No learners in this class</div>
      ) : (
        <div className="card overflow-hidden">
          {ranked.map((row, i) => {
            const lvl = row.has ? percentToLevel(row.percent, stream?.gradeLevel||'grade_4') : null;
            return (
              <div key={row.learner.id} className="flex items-center gap-3 p-3" style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0 ${(row as any).rank===1?'bg-[#d4af37] text-[#0f1c38]':'bg-surface-2 text-theme-muted'}`}>
                  {row.has ? (row as any).rank : '—'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-theme-heading text-sm truncate">{row.learner.firstName} {row.learner.lastName}</div>
                  <div className="text-[10px] text-theme-muted">{row.learner.admissionNumber}</div>
                </div>
                {row.has && lvl && <span className="badge text-white text-[10px] font-bold" style={{ backgroundColor: lvl.color }}>{lvl.code}</span>}
                {row.has && <span className="text-sm font-black text-theme-heading w-10 text-right">{row.percent}%</span>}
                <input type="number" min={0} max={maxScore}
                  value={scores[row.learner.id] ?? ''} placeholder="—"
                  onChange={e=>{ const v = Math.min(maxScore, Math.max(0, Number(e.target.value)||0)); setScores(s=>({...s,[row.learner.id]:v})); }}
                  className="w-16 text-center text-sm px-2 py-1.5 bg-surface-2 rounded-lg focus:ring-1 focus:ring-[#1a2e5a] focus:outline-none" style={{ border:'1px solid var(--border)' }}/>
              </div>
            );
          })}
        </div>
      )}

      {stream && (
        <div className="card p-4">
          <p className="text-xs font-bold text-theme-muted uppercase tracking-wide mb-2">CBC Levels — {scaleLabel}</p>
          <div className="flex flex-wrap gap-2">
            {levelsFor(stream.gradeLevel).map(l => (
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
