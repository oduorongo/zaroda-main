// app/owner/marks-check/page.tsx
// Owner-only: see a school's saved marks grouped by stream/term/exam/subject and spot
// marks whose subject doesn't match a learning area of the stream's grade (these are
// hidden from the mark list). Orphaned groups can be renamed onto a proper area.
'use client';
import { useState, useEffect } from 'react';
import { Search, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api/client';

export default function OwnerMarksCheckPage() {
  const [search, setSearch] = useState('Kadianga');
  const [schools, setSchools] = useState<any[]>([]);
  const [tenant, setTenant] = useState<any>(null);
  const [grade, setGrade] = useState('grade_7');
  const [groups, setGroups] = useState<any[] | null>(null);
  const [areas, setAreas] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState<Record<string, string>>({});

  const findSchools = () => {
    apiClient.get('/admin/tenants', { params: { search } })
      .then(r => setSchools(r.data?.data || [])).catch(() => setSchools([]));
  };
  useEffect(() => { findSchools(); /* eslint-disable-next-line */ }, []);

  const run = (t = tenant) => {
    if (!t) return;
    setLoading(true); setGroups(null);
    apiClient.get('/admin/marks-diagnose', { params: { tenantId: t.id, gradeLevel: grade || undefined } })
      .then(r => { setGroups(r.data?.groups || []); setAreas(r.data?.areasByGrade || {}); })
      .catch(() => { toast.error('Could not load marks'); setGroups([]); })
      .finally(() => setLoading(false));
  };

  const key = (g: any) => [g.streamId, g.term, g.examId, g.subject].join('|');
  const rename = async (g: any) => {
    const to = pick[key(g)];
    if (!to) return;
    if (!confirm(`Rename "${g.subject}" → "${to}" for ${g.marks} marks in ${g.streamName} (${g.term})?`)) return;
    try {
      const r = await apiClient.post('/admin/marks-diagnose/rename', {
        tenantId: tenant.id, streamId: g.streamId, term: g.term, examId: g.examId, from: g.subject, to,
      });
      if (r.data?.error) toast.error(r.data.error); else { toast.success('Marks renamed'); run(); }
    } catch { toast.error('Rename failed'); }
  };

  const orphans = (groups || []).filter(g => g.orphaned);

  // Exams in one term sharing an exam type: saving one used to wipe the other's marks.
  const [clashes, setClashes] = useState<any[] | null>(null);
  const [clashLoading, setClashLoading] = useState(false);
  const fixClashes = async (all: boolean) => {
    if (!confirm(`Set a distinct exam type (mid term / end term / CAT / mock) from each clashing exam's name${all ? ' for ALL schools' : ''}? Report cards read this type, so figures may change.`)) return;
    try {
      const r = await apiClient.post('/admin/exam-type-clashes/fix', all ? {} : { tenantId: tenant?.id });
      if (r.data?.error) { toast.error(r.data.error); return; }
      toast.success(r.data?.message || 'Done');
      if (r.data?.skipped?.length) toast(`Left alone (name unclear): ${r.data.skipped.join(', ')}`, { duration: 8000 });
      findClashes(all);
    } catch { toast.error('Fix failed'); }
  };
  const findClashes = (all: boolean) => {
    setClashLoading(true); setClashes(null);
    apiClient.get('/admin/exam-type-clashes', { params: all ? {} : { tenantId: tenant?.id } })
      .then(r => setClashes(r.data?.clashes || []))
      .catch(() => { toast.error('Could not load exam clashes'); setClashes([]); })
      .finally(() => setClashLoading(false));
  };

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Marks check</h1>
        <p className="text-sm opacity-70">Find saved marks that the mark list can&apos;t show because the subject doesn&apos;t match a learning area for the class&apos;s grade.</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="School name"
          className="border rounded-lg px-3 py-2 text-sm bg-transparent" />
        <button onClick={findSchools} className="px-3 py-2 rounded-lg border text-sm flex items-center gap-1"><Search size={14} /> Find</button>
        <select value={tenant?.id || ''} onChange={e => setTenant(schools.find(s => String(s.id) === e.target.value) || null)}
          className="border rounded-lg px-3 py-2 text-sm bg-transparent">
          <option value="">Choose school…</option>
          {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={grade} onChange={e => setGrade(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-transparent">
          <option value="">All grades</option>
          {['pp1','pp2','grade_1','grade_2','grade_3','grade_4','grade_5','grade_6','grade_7','grade_8','grade_9'].map(g => <option key={g} value={g}>{g.replace('_', ' ')}</option>)}
        </select>
        <button disabled={!tenant || loading} onClick={() => run()} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50">Check marks</button>
      </div>

      <div className="border rounded-lg p-3 space-y-2">
        <div className="text-sm font-semibold">Exams that may have overwritten each other</div>
        <p className="text-xs opacity-70">Exams in the same school, term and year with the same exam type. &quot;Missing&quot; counts class/subject pairs that a sibling exam has marks for but this one doesn&apos;t — likely overwrites.</p>
        <div className="flex gap-2">
          <button disabled={!tenant || clashLoading} onClick={() => findClashes(false)} className="px-3 py-2 rounded-lg border text-sm disabled:opacity-50">This school</button>
          <button disabled={clashLoading} onClick={() => findClashes(true)} className="px-3 py-2 rounded-lg border text-sm disabled:opacity-50">All schools</button>
          {!!clashes?.length && <button onClick={() => fixClashes(!tenant || clashes.some(c => c.tenantId !== tenant.id))} className="px-3 py-2 rounded-lg bg-amber-600 text-white text-sm">Fix exam types</button>}
        </div>
        {clashLoading && <div className="flex items-center gap-2 text-sm"><Loader2 className="animate-spin" size={16} /> Loading…</div>}
        {clashes && !clashLoading && (clashes.length === 0
          ? <div className="text-sm text-green-700">No clashing exams found.</div>
          : clashes.map(c => (
            <div key={[c.tenantId, c.term, c.academicYear, c.examType].join('|')} className="border rounded p-2 text-sm">
              <div className="font-medium">{c.school} · {c.term} · {c.academicYear} · type: {c.examType || '—'}</div>
              <ul className="mt-1 space-y-0.5">
                {c.exams.map((x: any) => (
                  <li key={x.examId}>{x.name} — {x.marks} marks{x.subjectsMissing > 0 && <span className="text-red-600"> · {x.subjectsMissing} class/subject pair(s) missing</span>}</li>
                ))}
              </ul>
            </div>
          )))}
      </div>

      {loading && <div className="flex items-center gap-2 text-sm"><Loader2 className="animate-spin" size={16} /> Loading…</div>}

      {groups && !loading && (
        <>
          <div className={`rounded-lg p-3 text-sm flex items-center gap-2 ${orphans.length ? 'bg-amber-100 text-amber-900' : 'bg-green-100 text-green-900'}`}>
            {orphans.length ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            {orphans.length
              ? `${orphans.length} group(s) of marks don't match any learning area for their class's grade — these are hidden from the mark list.`
              : 'Every mark group matches a learning area. The cause is probably the stream, term or exam selected — check the Stream/Term/Exam columns.'}
          </div>

          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b">
                {['Stream','Stream grade','Marks grade','Term','Exam','Subject','Marks','Learners','Status'].map(h => <th key={h} className="p-2 whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody>
                {groups.map(g => (
                  <tr key={key(g)} className={`border-b ${g.orphaned ? 'bg-amber-50 dark:bg-amber-950/30' : ''}`}>
                    <td className="p-2">{g.streamName || '—'}</td>
                    <td className="p-2">{g.streamGrade || '—'}</td>
                    <td className={`p-2 ${g.markGrade && g.streamGrade && g.markGrade !== g.streamGrade ? 'text-red-600 font-semibold' : ''}`}>{g.markGrade || '—'}</td>
                    <td className="p-2">{g.term || '—'}</td>
                    <td className="p-2">{g.examName || '—'}</td>
                    <td className="p-2">{g.subject}</td>
                    <td className="p-2">{g.marks}</td>
                    <td className="p-2">{g.learners}</td>
                    <td className="p-2">
                      {g.orphaned ? (
                        <div className="flex gap-1 items-center">
                          <select value={pick[key(g)] || ''} onChange={e => setPick({ ...pick, [key(g)]: e.target.value })}
                            className="border rounded px-1 py-1 text-xs bg-transparent">
                            <option value="">Rename to…</option>
                            {(areas[g.streamGrade || ''] || []).map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                          <button onClick={() => rename(g)} disabled={!pick[key(g)]} className="px-2 py-1 rounded bg-amber-600 text-white text-xs disabled:opacity-40">Fix</button>
                        </div>
                      ) : <span className="text-green-700">OK → {g.matchedArea}</span>}
                    </td>
                  </tr>
                ))}
                {!groups.length && <tr><td colSpan={9} className="p-4 text-center opacity-60">No saved marks found for this school/grade.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
