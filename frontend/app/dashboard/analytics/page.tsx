'use client';

import { useState, useEffect } from 'react';
import { Loader2, TrendingUp, Users, BarChart3, School } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { GRADE_LEVELS, percentToLevel } from '@/lib/cbc/constants';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell,
} from 'recharts';
import toast from 'react-hot-toast';

const NAVY = '#1a2e5a';
const GOLD = '#d4af37';

const gradeLabel = (g: string) => GRADE_LEVELS.find(x => x.value === g)?.label || g;

const TERMS = [
  { v: '',        label: 'All terms' },
  { v: 'term_1',  label: 'Term 1' },
  { v: 'term_2',  label: 'Term 2' },
  { v: 'term_3',  label: 'Term 3' },
];

export default function SchoolAnalyticsPage() {
  const [grade,   setGrade]   = useState('');
  const [term,    setTerm]    = useState('');
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiClient.get('/academic/analytics/school', { params: { gradeLevel: grade || undefined, term: term || undefined } })
      .then(r => setData(r.data))
      .catch(e => { setData(null); toast.error(e?.response?.data?.message || 'Could not load analytics'); })
      .finally(() => setLoading(false));
  }, [grade, term]);

  const hasData = data && data.learnerCount > 0;
  const gradeColor = (g: string, avg: number) => percentToLevel(avg, g).color;

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">School Analytics</h1>
          <p className="text-sm text-theme-muted">Whole-school performance — by grade, learning area, and class</p>
        </div>
      </div>

      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Grade</label>
          <select value={grade} onChange={e => setGrade(e.target.value)} className="input">
            <option value="">All grades</option>
            {GRADE_LEVELS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Term</label>
          <select value={term} onChange={e => setTerm(e.target.value)} className="input">
            {TERMS.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-theme-muted" size={28}/></div>
      ) : !hasData ? (
        <div className="card p-10 text-center text-theme-muted">
          No marks recorded yet{grade ? ` for ${gradeLabel(grade)}` : ''}{term ? ' in this term' : ''}. Once teachers enter marks, school analytics appear here.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard icon={<Users size={18}/>} label="Learners assessed" value={String(data.learnerCount)} />
            <SummaryCard icon={<BarChart3 size={18}/>} label="School average" value={`${data.schoolAverage}%`} />
            <SummaryCard icon={<School size={18}/>} label="Grades" value={String(data.grades.length)} />
            <SummaryCard icon={<TrendingUp size={18}/>} label="Classes" value={String(data.streams.length)} />
          </div>

          {/* Per-grade averages (only meaningful across grades) */}
          {data.grades.length > 1 && (
            <div className="card p-5">
              <h2 className="font-bold text-theme-heading mb-1">Average by grade</h2>
              <p className="text-xs text-theme-muted mb-4">Mean percentage per grade{term ? ' this term' : ''}.</p>
              <ResponsiveContainer width="100%" height={Math.max(220, data.grades.length * 40)}>
                <BarChart data={data.grades.map((g: any) => ({ ...g, label: gradeLabel(g.gradeLevel) }))} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.06)"/>
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }}/>
                  <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 11 }}/>
                  <Tooltip formatter={(v: any, _n: any, p: any) => [`${v}%  (${p.payload.level})`, 'Average']}/>
                  <Bar dataKey="average" radius={[0, 6, 6, 0]}>
                    {data.grades.map((g: any, i: number) => <Cell key={i} fill={gradeColor(g.gradeLevel, g.average)}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Per-education-band breakdown. Bands run different learning areas (e.g.
              "Mathematics Activities" in ECDE vs "Mathematics" in 4-6 vs electives in
              10-12), so subject averages and level distributions are shown separately
              per band rather than pooled into one school-wide chart. */}
          {(data.bands || []).map((b: any) => (
            <div key={b.key} className="card p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="font-bold text-theme-heading">{b.label}</h2>
                  <p className="text-xs text-theme-muted">{b.learnerCount} learner{b.learnerCount === 1 ? '' : 's'} assessed{term ? '' : ` · ${b.average}% average`}</p>
                </div>
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-theme-heading mb-2">Average by learning area</h3>
                  <ResponsiveContainer width="100%" height={Math.max(180, b.areas.length * 34)}>
                    <BarChart data={b.areas} layout="vertical" margin={{ left: 10, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.06)"/>
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }}/>
                      <YAxis type="category" dataKey="subject" width={120} tick={{ fontSize: 10 }}/>
                      <Tooltip formatter={(v: any) => [`${v}%`, 'Average']}/>
                      <Bar dataKey="average" radius={[0, 6, 6, 0]} fill={NAVY}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-theme-heading mb-2">Performance level distribution</h3>
                  {b.distribution && b.distribution.length ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={b.distribution} margin={{ left: 0, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)"/>
                        <XAxis dataKey="code" tick={{ fontSize: 11 }}/>
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }}/>
                        <Tooltip formatter={(v: any) => [`${v} marks`, 'Count']}/>
                        <Bar dataKey="count" radius={[6, 6, 0, 0]} fill={GOLD}/>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <div className="h-[200px] flex items-center justify-center text-sm text-theme-muted">No data.</div>}
                </div>
              </div>
            </div>
          ))}

          {/* Term trend */}
          <div className="card p-5">
            <h2 className="font-bold text-theme-heading mb-1">School trend over terms</h2>
            <p className="text-xs text-theme-muted mb-4">Average percentage across all assessed learners.</p>
            {data.trend.length <= 1 ? (
              <div className="h-[200px] flex items-center justify-center text-sm text-theme-muted text-center px-6">
                Trend appears once there are marks in more than one term.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.trend} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)"/>
                  <XAxis dataKey="term" tickFormatter={(t: string) => t.replace('term_', 'Term ')} tick={{ fontSize: 11 }}/>
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }}/>
                  <Tooltip formatter={(v: any) => [`${v}%`, 'Average']} labelFormatter={(t: string) => t.replace('term_', 'Term ')}/>
                  <Line type="monotone" dataKey="average" stroke={GOLD} strokeWidth={3} dot={{ r: 4, fill: NAVY }}/>
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Class leaderboard */}
          <div className="card p-5">
            <h2 className="font-bold text-theme-heading mb-1">Class leaderboard</h2>
            <p className="text-xs text-theme-muted mb-4">Each class ranked by average percentage.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-theme-muted border-b border-theme">
                    <th className="px-3 py-2">Rank</th>
                    <th className="px-3 py-2">Class</th>
                    <th className="px-3 py-2">Grade</th>
                    <th className="px-3 py-2 text-center">Learners</th>
                    <th className="px-3 py-2 text-center">Average</th>
                    <th className="px-3 py-2 text-center">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {data.streams.map((s: any) => {
                    const lc = percentToLevel(s.average, s.gradeLevel);
                    return (
                      <tr key={s.streamId} className="border-b border-theme/40">
                        <td className="px-3 py-2 font-bold">{s.rank}</td>
                        <td className="px-3 py-2">{s.name}</td>
                        <td className="px-3 py-2 text-theme-muted">{gradeLabel(s.gradeLevel)}</td>
                        <td className="px-3 py-2 text-center text-theme-muted">{s.learners}</td>
                        <td className="px-3 py-2 text-center font-bold">{s.average}%</td>
                        <td className="px-3 py-2 text-center font-bold" style={{ color: lc.color }}>{s.level}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-theme-muted text-xs font-semibold uppercase tracking-wide">{icon}{label}</div>
      <div className="text-2xl font-black mt-1 text-theme-heading">{value}</div>
    </div>
  );
}
