'use client';
import { useState, useEffect, useMemo } from 'react';
import { Save, Loader2, Youtube, X } from 'lucide-react';
import { LearnerSearch, matchesLearner } from '@/components/LearnerSearch';
import apiClient from '@/lib/api/client';
import { useAuth, isHoi } from '@/lib/hooks/useAuth';
import { learningAreaMatches } from '@/lib/cbc/constants';

const gradeLabelFor = (g: string): string => {
  const map: Record<string,string> = {
    playgroup:'Playgroup', pp1:'PP1', pp2:'PP2',
    grade_1:'Grade 1', grade_2:'Grade 2', grade_3:'Grade 3', grade_4:'Grade 4',
    grade_5:'Grade 5', grade_6:'Grade 6', grade_7:'Grade 7', grade_8:'Grade 8',
    grade_9:'Grade 9', grade_10:'Grade 10', grade_11:'Grade 11', grade_12:'Grade 12',
  };
  return map[g] || g || 'Class';
};
import toast from 'react-hot-toast';

const LEVELS = ['EE', 'ME', 'AE', 'BE'] as const;
const VAL: Record<string, number> = { EE: 4, ME: 3, AE: 2, BE: 1 };
const STYLE: Record<string, string> = {
  EE: 'bg-[#E1F5EE] border-[#0F6E56] text-[#085041]',
  ME: 'bg-[#E6F1FB] border-[#185FA5] text-[#0C447C]',
  AE: 'bg-[#FAEEDA] border-[#854F0B] text-[#633806]',
  BE: 'bg-[#FCEBEB] border-[#A32D2D] text-[#791F1F]',
};
const LEGEND = [
  { c: 'EE', t: 'Exceeds expectations', s: 'bg-[#E1F5EE] text-[#085041]' },
  { c: 'ME', t: 'Meets expectations', s: 'bg-[#E6F1FB] text-[#0C447C]' },
  { c: 'AE', t: 'Approaches expectations', s: 'bg-[#FAEEDA] text-[#633806]' },
  { c: 'BE', t: 'Below expectations', s: 'bg-[#FCEBEB] text-[#791F1F]' },
];

export default function TeacherAssessment() {
  const { user } = useAuth();
  const [streams, setStreams]   = useState<any[]>([]);
  const [streamId, setStreamId] = useState('');
  const [stream, setStream]     = useState<any>(null);
  const [areas, setAreas]       = useState<string[]>([]);
  const [area, setArea]         = useState('');
  const [term, setTerm]         = useState('Term One');
  const [learners, setLearners] = useState<any[]>([]);
  const [learnerId, setLearnerId] = useState('');
  const [search, setSearch] = useState('');
  const [strands, setStrands]   = useState<any[]>([]);
  const [scores, setScores]     = useState<Record<string, string>>({});
  const [comment, setComment]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [resourceFor, setResourceFor] = useState<any>(null);
  const [resourceUrl, setResourceUrl] = useState('');

  useEffect(() => {
    if (!user) return;
    const seesAll = isHoi(user?.role || '') || user?.role === 'super_admin';
    Promise.all([
      apiClient.get('/academic/streams'),
      seesAll ? Promise.resolve({ data: [] }) : apiClient.get(`/academic/teachers/${user.id}/stream-subjects`).catch(() => ({ data: [] })),
    ]).then(([r, ss]) => {
      const all = r.data || [];
      // Admins/HOI see every stream. A subject/class teacher sees every stream they are
      // assigned to teach in (from their learning-area assignments) plus any stream they
      // are class teacher of — so teaching across 3 streams shows all 3.
      const assignedIds = new Set<string>((ss.data || []).map((row: any) => String(row.streamId)));
      const mine = all.filter((x: any) =>
        assignedIds.has(String(x.id)) || x.id === user.streamId || x.classTeacherId === user.id);
      const list = seesAll ? all : (mine.length ? mine : all);
      setStreams(list);
      const s = (user?.streamId && list.find((x: any) => x.id === user.streamId)) || list[0];
      if (s) { setStreamId(s.id); setStream(s); }
    });
  }, [user]);

  useEffect(() => {
    if (!streamId) return;
    const s = streams.find(x => x.id === streamId);
    setStream(s);
    apiClient.get(`/academic/streams/${streamId}/learners`).then(r => {
      setLearners(r.data); if (r.data[0]) setLearnerId(r.data[0].id);
    }).catch(() => {});
    if (s?.gradeLevel) {
      Promise.all([
        apiClient.get(`/assessment/learning-areas?gradeLevel=${s.gradeLevel}`),
        apiClient.get(`/academic/teachers/${user?.id}/stream-subjects`).catch(() => ({ data: [] })),
      ]).then(([r, ss]) => {
        let la = (r.data || []).map((x: any) => x.learningArea);
        // A subject teacher edits the rubric ONLY for the areas assigned to them
        // IN THIS STREAM. Class teachers / overall class teachers / HOI see all areas.
        const seesAll = ['class_teacher','overall_class_teacher','hoi','dhois','school_admin'].includes(user?.role || '');
        const myForStream: string[] = (ss.data || [])
          .filter((row: any) => row.streamId === streamId)
          .flatMap((row: any) => row.subjects || []);
        // Fallback to the flat union if no per-stream rows exist yet (older teachers).
        const mine = myForStream.length ? myForStream : ((user?.subjects || []) as string[]);
        if (!seesAll && mine.length) {
          const filtered = la.filter((area: string) => mine.some((sub: string) => learningAreaMatches(area, sub)));
          if (filtered.length) la = filtered;  // only fall back to all if nothing matches
        }
        setAreas(la); if (la[0]) setArea(la[0]);
      }).catch(() => {});
    }
  }, [streamId]);

  useEffect(() => {
    if (!stream?.gradeLevel || !area || !learnerId) return;
    setLoading(true);
    Promise.all([
      apiClient.get(`/assessment/book?gradeLevel=${stream.gradeLevel}&learningArea=${encodeURIComponent(area)}`).catch(() => ({ data: { strands: [] } })),
      apiClient.get(`/assessment/scores?learnerId=${learnerId}&term=${encodeURIComponent(term)}&learningArea=${encodeURIComponent(area)}`).catch(() => ({ data: { scores: {}, comment: '' } })),
    ]).then(([book, sc]) => {
      setStrands(book.data.strands || []);
      const m: Record<string, string> = {};
      Object.entries(sc.data.scores || {}).forEach(([k, v]: any) => { if (v?.level) m[k] = v.level; });
      setScores(m);
      setComment(sc.data.comment || '');
    }).finally(() => setLoading(false));
  }, [stream, area, learnerId, term]);

  const allSubs = useMemo(() => strands.flatMap(s => s.substrands.map((ss: any) => ss.id)), [strands]);
  const done = allSubs.filter(id => scores[id]).length;
  const pct = allSubs.length ? Math.round(done / allSubs.length * 100) : 0;

  const strandLevel = (s: any) => {
    const vals = s.substrands.map((ss: any) => scores[ss.id]).filter(Boolean).map((c: string) => VAL[c]);
    if (!vals.length) return null;
    const avg = vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
    if (avg >= 3.5) return 'EE'; if (avg >= 2.5) return 'ME';
    if (avg >= 1.5) return 'AE'; return 'BE';
  };

  const tap = (id: string, code: string) =>
    setScores(s => ({ ...s, [id]: s[id] === code ? '' : code }));

  const save = async () => {
    if (!done) { toast.error('Score at least one sub-topic first'); return; }
    setSaving(true);
    try {
      await apiClient.post('/assessment/scores', {
        learnerId, streamId, gradeLevel: stream.gradeLevel, learningArea: area, term, comment,
        scores: Object.fromEntries(Object.entries(scores).filter(([, v]) => v).map(([k, v]) => [k, { level: v }])),
      });
      toast.success('Formative assessment saved');
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not save'); }
    finally { setSaving(false); }
  };

  const saveResource = async () => {
    try {
      await apiClient.post('/assessment/resource', { substrandId: resourceFor.id, youtubeUrl: resourceUrl });
      setStrands(sts => sts.map(s => ({ ...s, substrands: s.substrands.map((ss: any) => ss.id === resourceFor.id ? { ...ss, youtubeUrl: resourceUrl } : ss) })));
      toast.success('Resource link saved'); setResourceFor(null); setResourceUrl('');
    } catch { toast.error('Could not save link'); }
  };

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Assessment Rubric</h1>
          <p className="text-sm text-theme-muted">Daily formative assessment — performance level per sub-strand</p>
        </div>
      </div>

      <div className="card p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-theme-muted">Stream</span>
          <select value={streamId} onChange={e => setStreamId(e.target.value)} className="input py-1.5 text-sm w-auto">
            {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-theme-muted">Learning area</span>
          <select value={area} onChange={e => setArea(e.target.value)} className="input py-1.5 text-sm w-auto">
            {areas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-theme-muted">Term</span>
          <select value={term} onChange={e => setTerm(e.target.value)} className="input py-1.5 text-sm w-auto">
            <option>Term One</option><option>Term Two</option><option>Term Three</option>
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <LearnerSearch value={search} onChange={setSearch} placeholder="Search…" className="w-36" />
          <select value={learnerId} onChange={e => setLearnerId(e.target.value)}
            className="bg-[#E6F1FB] text-[#0C447C] font-semibold rounded-lg px-3 py-1.5 text-sm border-0">
            {learners.filter(l=>matchesLearner(l, search)).map(l => <option key={l.id} value={l.id}>{l.firstName} {l.lastName}</option>)}
          </select>
        </div>
      </div>

      <p className="text-xs text-theme-muted bg-surface-2 rounded-lg px-3 py-2">
        This is the daily formative rubric — tap a performance level for each sub-topic. It is separate from CATs and End-Term exams and does not appear on the end-term report.
      </p>

      <div className="flex flex-wrap gap-2">
        {LEGEND.map(l => <span key={l.c} className={`text-[11px] font-semibold px-2 py-1 rounded ${l.s}`}>{l.c} — {l.t}</span>)}
      </div>

      <div>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-theme-muted">Sub-topics assessed</span>
          <span className="text-xs font-semibold text-theme-heading">{done} / {allSubs.length}</span>
        </div>
        <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-[#1D9E75] transition-all" style={{ width: `${pct}%` }}/>
        </div>
      </div>

      {loading ? <div className="h-64 shimmer rounded-2xl"/> : strands.length === 0 ? (
        <div className="card p-10 text-center text-theme-muted">No rubric template for this grade &amp; learning area yet.</div>
      ) : strands.map((s, si) => {
        const lvl = strandLevel(s);
        return (
          <div key={s.id} className="card p-3.5">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-semibold text-theme-muted uppercase tracking-wide">Strand {si + 1} — {s.name}</span>
              <span className="text-[11px] bg-surface-2 text-theme-muted rounded px-1.5 py-0.5">{s.substrands.length} sub-topics</span>
            </div>
            <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr className="text-[11px] text-theme-muted">
                  <th className="text-left font-medium pb-1.5" style={{ width: '46%' }}>Sub-topic</th>
                  {LEVELS.map(l => <th key={l} className="font-medium pb-1.5">{l}</th>)}
                </tr>
              </thead>
              <tbody>
                {s.substrands.map((ss: any, i: number) => (
                  <tr key={ss.id} style={{ borderTop: '0.5px solid var(--border)' }}>
                    <td className="py-1.5 pr-2 text-theme align-middle">
                      <div className="flex items-center gap-1.5">
                        {ss.youtubeUrl
                          ? <a href={ss.youtubeUrl} target="_blank" rel="noreferrer" title="Watch resource" className="text-red-600 shrink-0"><Youtube size={14}/></a>
                          : <button onClick={() => { setResourceFor(ss); setResourceUrl(''); }} title="Add YouTube resource" className="text-theme-muted hover:text-red-600 shrink-0"><Youtube size={14}/></button>}
                        <span>{ss.name}</span>
                      </div>
                    </td>
                    {LEVELS.map(l => {
                      const on = scores[ss.id] === l;
                      return (
                        <td key={l} className="text-center py-1.5">
                          <button onClick={() => tap(ss.id, l)}
                            className={`w-9 h-7 rounded-md text-xs font-semibold border transition-all ${on ? STYLE[l] : 'bg-surface-2 border-theme text-theme-muted opacity-60 hover:opacity-100'}`}>{l}</button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between items-center mt-2.5 pt-2.5" style={{ borderTop: '0.5px solid var(--border)' }}>
              <span className="text-xs text-theme-muted">Overall level</span>
              {lvl ? <span className={`text-xs font-semibold px-2.5 py-1 rounded border ${STYLE[lvl]}`}>{lvl}</span> : <span className="text-xs text-theme-muted">—</span>}
            </div>
          </div>
        );
      })}

      {strands.length > 0 && (
        <div className="card p-3.5">
          <div className="text-sm font-semibold text-theme-heading mb-1.5">Teacher comment (formative observations)</div>
          <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Optional notes on the learner's progress…"
            className="input w-full text-sm" style={{ minHeight: 64, resize: 'none' }}/>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={save} disabled={saving || !strands.length} className="btn-primary">
          {saving ? <><Loader2 size={16} className="animate-spin"/> Saving…</> : <><Save size={16}/> Save</>}
        </button>
      </div>

      {resourceFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-bold text-theme-heading">Learning Resource</h3>
              <button onClick={() => setResourceFor(null)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-theme-muted">YouTube link for: <strong className="text-theme-heading">{resourceFor.name}</strong></p>
              <input value={resourceUrl} onChange={e => setResourceUrl(e.target.value)} placeholder="https://youtube.com/watch?v=…" className="input"/>
              <div className="flex gap-3">
                <button onClick={() => setResourceFor(null)} className="btn-ghost flex-1">Cancel</button>
                <button onClick={saveResource} className="btn-primary flex-1">Save link</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
