// app/dashboard/academic/report-cards/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { Save, Loader2, ArrowLeft, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { matchLearningArea } from '@/lib/cbc/constants';
import { ReportCardButton, BulkReportCardsButton } from '@/components/pdf/pdf-buttons';
import { LearnerSearch, matchesLearner } from '@/components/LearnerSearch';
import toast from 'react-hot-toast';

const LEVELS_JUNIOR = ['EE','ME','AE','BE'];
const LEVELS_SENIOR = ['EE1','EE2','ME1','ME2','AE1','AE2','BE1','BE2'];
const LEVEL_COLORS: Record<string,string> = {
  EE:'bg-green-500',EE1:'bg-green-600',EE2:'bg-green-500',
  ME:'bg-blue-500', ME1:'bg-blue-600', ME2:'bg-blue-500',
  AE:'bg-amber-500',AE1:'bg-amber-600',AE2:'bg-amber-500',
  BE:'bg-red-500',  BE1:'bg-red-600',  BE2:'bg-red-500',
};

// term used by report cards (term_1) vs mark list term value — keep aligned
const TERM_OPTS = [
  { v: 'term_1', label: 'Term 1' },
  { v: 'term_2', label: 'Term 2' },
  { v: 'term_3', label: 'Term 3' },
];

export default function ReportCardsPage() {
  const { user }   = useAuth();
  const router     = useRouter();
  const [streams,  setStreams]  = useState<any[]>([]);
  const [streamId, setStreamId]= useState('');
  const [term,     setTerm]    = useState('term_1');
  const [year,     setYear]    = useState('2025/2026');
  const [learners, setLearners]= useState<any[]>([]);
  // results[learnerId][subject] = level (e.g. 'ME'); seeded from the class mark list
  const [results,  setResults] = useState<Record<string,Record<string,string>>>({});
  // percents[learnerId][subject] = number — read-only context from the mark list
  const [percents, setPercents]= useState<Record<string,Record<string,number>>>({});
  const [subjects, setSubjects]= useState<string[]>([]);
  const [loading,  setLoading] = useState(false);
  const [saving,   setSaving]  = useState(false);
  const [search,   setSearch]  = useState('');
  const [stream,   setStreamObj]= useState<any>(null);
  const [marksFound, setMarksFound] = useState<boolean | null>(null);

  useEffect(() => {
    apiClient.get('/academic/streams').then(r => {
      setStreams(r.data);
      const s = user?.streamId ? r.data.find((s:any) => s.id === user.streamId) : r.data[0];
      if (s) { setStreamId(s.id); setStreamObj(s); }
    });
  }, [user]);

  // Load learners + the EXISTING class mark list whenever stream/term/year changes
  useEffect(() => {
    if (!streamId) return;
    setLoading(true);
    const s = streams.find(s => s.id === streamId);
    setStreamObj(s);

    Promise.all([
      apiClient.get(`/academic/streams/${streamId}/learners`).then(r => r.data).catch(() => []),
      apiClient.get('/academic/mark-list', { params: { streamId, term } }).then(r => r.data).catch(() => null),
      s?.gradeLevel
        ? apiClient.get('/assessment/learning-areas', { params: { gradeLevel: s.gradeLevel } }).then(r => r.data).catch(() => [])
        : Promise.resolve([]),
    ]).then(([learnerRows, markList, rubric]) => {
      setLearners(learnerRows);

      const rubricAreas: string[] = Array.from(new Set((rubric || []).map((x: any) => x.learningArea).filter(Boolean)));
      const norm = (x: string) => String(x || '').toLowerCase().replace(/[^a-z]/g, '');
      // Map a saved subject name onto the matching rubric column (tolerant of spelling
      // variants, word families and extra words) so no score is hidden.
      const toColumn = (saved: string) => matchLearningArea(saved, rubricAreas) || saved;

      const seededLevels: Record<string,Record<string,string>> = {};
      const seededPercents: Record<string,Record<string,number>> = {};
      const extraCols = new Set<string>();
      let anyMarks = false;

      if (markList?.learners?.length) {
        for (const lr of markList.learners) {
          const subs = lr.subjects || {};
          for (const [subject, data] of Object.entries<any>(subs)) {
            const col = toColumn(subject);
            if (col && !rubricAreas.some(rc => norm(rc) === norm(col))) extraCols.add(col);
            if (data?.level) {
              seededLevels[lr.learnerId] = { ...(seededLevels[lr.learnerId]||{}), [col]: data.level };
              anyMarks = true;
            }
            if (data?.percent != null) {
              seededPercents[lr.learnerId] = { ...(seededPercents[lr.learnerId]||{}), [col]: Math.round(Number(data.percent)) };
              anyMarks = true;
            }
          }
        }
      }

      setResults(seededLevels);
      setPercents(seededPercents);
      // Columns = rubric areas + any saved subjects not in the rubric (so nothing is hidden).
      setSubjects(rubricAreas.length ? Array.from(new Set([...rubricAreas, ...extraCols]))
        : ['Mathematics','English','Kiswahili','Science','Social Studies','Creative Arts','PHE']);
      setMarksFound(anyMarks);
    }).finally(() => setLoading(false));
  }, [streamId, term, year]);

  const isSenior = stream?.gradeLevel && ['grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'].includes(stream.gradeLevel);
  const levels   = isSenior ? LEVELS_SENIOR : LEVELS_JUNIOR;

  const setLevel = (learnerId: string, subject: string, level: string) =>
    setResults(r => ({ ...r, [learnerId]: { ...(r[learnerId]||{}), [subject]: level } }));

  const saveResults = async () => {
    setSaving(true);
    try {
      const records = Object.entries(results).flatMap(([learnerId, subs]) =>
        Object.entries(subs)
          .filter(([, level]) => level)   // never save blanks — protects class teacher's marks
          .map(([subject, level]) => ({ learnerId, subject, level, term, academicYear: year }))
      );
      if (!records.length) { toast.error('Nothing to save'); return; }
      await apiClient.post('/academic/assessment-results/bulk', { records });
      toast.success('CBC results saved!');
    } catch { toast.error('Could not save results'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-ghost p-2" title="Back" aria-label="Back">
            <ArrowLeft size={18}/>
          </button>
          <div>
            <h1 className="text-2xl font-black text-theme-heading">Report Cards</h1>
            <p className="text-sm text-theme-muted">Marks load from the class mark list · Generate PDFs</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={saveResults} disabled={saving} className="btn-ghost text-sm">
            {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Save
          </button>
          {streamId && (
            <BulkReportCardsButton streamId={streamId} term={term} academicYear={year} streamName={stream?.name}/>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex gap-3 flex-wrap items-end">
        <div>
          <label className="label">Stream</label>
          <select value={streamId} onChange={e => setStreamId(e.target.value)} className="input w-44">
            {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Term</label>
          <select value={term} onChange={e => setTerm(e.target.value)} className="input w-32">
            {TERM_OPTS.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Academic Year</label>
          <select value={year} onChange={e => setYear(e.target.value)} className="input w-36">
            <option>2025/2026</option><option>2024/2025</option>
          </select>
        </div>
        {stream && (
          <div className="ml-auto text-xs bg-surface-2 border border-theme rounded-lg px-3 py-2 text-theme-muted">
            Scale: <strong className="text-theme-heading">{isSenior ? 'EE1–BE2 (Senior)' : 'EE–BE (Primary/Junior)'}</strong>
          </div>
        )}
      </div>

      {/* Mark-list status banner */}
      {marksFound === false && !loading && learners.length > 0 && (
        <div className="card p-3 flex items-center gap-2 text-sm" style={{ borderLeft: '4px solid #f59e0b' }}>
          <Info size={16} className="text-amber-500"/>
          <span className="text-theme-muted">
            No marks found in the class mark list for this stream &amp; term. Ask the class teacher to enter marks first, or set levels manually below.
          </span>
        </div>
      )}

      {/* Grade entry table */}
      {loading ? <div className="h-64 shimmer rounded-2xl"/> : learners.length === 0 ? (
        <div className="card p-10 text-center text-theme-muted">No learners in this stream</div>
      ) : (
        <div className="card overflow-auto">
          <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <LearnerSearch value={search} onChange={setSearch} className="max-w-sm" />
          </div>
          <table className="w-full text-xs min-w-[700px]">
            <thead>
              <tr className="table-header">
                <th className="px-4 py-3 text-left">Learner</th>
                {subjects.map(s => <th key={s} className="px-2 py-3 text-center">{s}</th>)}
                <th className="px-3 py-3 text-center">PDF</th>
              </tr>
            </thead>
            <tbody>
              {learners.filter((l:any)=>matchesLearner(l, search)).map((l: any, i: number) => (
                <tr key={l.id} className={`border-b border-theme ${i%2===0?'bg-surface':'bg-surface-2'}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-theme-heading text-sm">{l.firstName} {l.lastName}</div>
                    <div className="text-[10px] text-theme-muted">{l.admissionNumber}</div>
                  </td>
                  {subjects.map(subj => {
                    const val = results[l.id]?.[subj] || '';
                    const pct = percents[l.id]?.[subj];
                    return (
                      <td key={subj} className="px-1 py-2 text-center">
                        <select value={val} onChange={e => setLevel(l.id, subj, e.target.value)}
                          className={`text-xs font-bold px-1.5 py-1 rounded-lg border text-center w-full max-w-[60px]
                            ${val ? `${LEVEL_COLORS[val]} text-white border-transparent` : 'bg-surface-2 text-theme-muted border-theme'}`}>
                          <option value="">—</option>
                          {levels.map(lv => <option key={lv} value={lv}>{lv}</option>)}
                        </select>
                        {pct != null && <div className="text-[9px] text-theme-muted mt-0.5">{pct}%</div>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center">
                    <ReportCardButton
                      learnerId={l.id}
                      learnerName={`${l.firstName} ${l.lastName}`}
                      term={term} academicYear={year} compact/>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
