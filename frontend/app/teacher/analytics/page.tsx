'use client';

import { useState, useEffect } from 'react';
import { Loader2, TrendingUp, Users, Award, BarChart3 } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, isHoi } from '@/lib/hooks/useAuth';
import { percentToLevel } from '@/lib/cbc/constants';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell,
} from 'recharts';
import toast from 'react-hot-toast';

const NAVY = '#1a2e5a';
const GOLD = '#d4af37';

const TERMS = [
  { v: '',        label: 'All terms' },
  { v: 'term_1',  label: 'Term 1' },
  { v: 'term_2',  label: 'Term 2' },
  { v: 'term_3',  label: 'Term 3' },
];

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<'class' | 'subject'>('class');

  // class mode
  const [streams,  setStreams]  = useState<any[]>([]);
  const [streamId, setStreamId] = useState('');
  const [stream,   setStream]   = useState<any>(null);
  const [term,     setTerm]     = useState('');
  const [data,     setData]     = useState<any>(null);
  const [loading,  setLoading]  = useState(false);

  // subject mode
  const [subjData,  setSubjData]  = useState<any>(null);
  const [subject,   setSubject]   = useState('');
  const [subjLoading, setSubjLoading] = useState(false);

  useEffect(() => {
    apiClient.get('/academic/streams')
      .then(r => {
        let s = r.data || [];
        if (user && !isHoi(user.role)) {
          const mine = s.filter((x: any) => String(x.classTeacherId || '') === String(user.id));
          if (mine.length) s = mine;
        }
        setStreams(s);
        if (s[0]) { setStreamId(s[0].id); setStream(s[0]); }
      })
      .catch(() => toast.error('Could not load your classes'));
  }, [user]);

  useEffect(() => {
    setStream(streams.find(s => s.id === streamId) || null);
  }, [streamId, streams]);

  useEffect(() => {
    if (mode !== 'class' || !streamId) return;
    setLoading(true);
    apiClient.get('/academic/analytics/stream', { params: { streamId, term: term || undefined } })
      .then(r => setData(r.data))
      .catch(e => { setData(null); toast.error(e?.response?.data?.message || 'Could not load analytics'); })
      .finally(() => setLoading(false));
  }, [streamId, term, mode]);

  useEffect(() => {
    if (mode !== 'subject') return;
    setSubjLoading(true);
    apiClient.get('/academic/analytics/subject', { params: { subject: subject || undefined, term: term || undefined } })
      .then(r => { setSubjData(r.data); if (r.data?.chosen && !subject) setSubject(r.data.chosen); })
      .catch(e => { setSubjData(null); toast.error(e?.response?.data?.message || 'Could not load analytics'); })
      .finally(() => setSubjLoading(false));
  }, [subject, term, mode]);

  const hasData = data && data.learnerCount > 0;
  const hasSubj = subjData && subjData.classes && subjData.classes.length > 0;

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Performance Analytics</h1>
          <p className="text-sm text-theme-muted">How your {mode === 'class' ? 'class is performing' : 'learning area is doing across classes'}</p>
        </div>
      </div>

      {/* Mode toggle: class teacher view vs subject teacher view */}
      <div className="flex gap-1 p-1 bg-surface-2 rounded-xl w-fit">
        <button onClick={() => setMode('class')}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${mode === 'class' ? 'bg-[#1a2e5a] text-white' : 'text-theme-muted'}`}>
          By Class
        </button>
        <button onClick={() => setMode('subject')}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${mode === 'subject' ? 'bg-[#1a2e5a] text-white' : 'text-theme-muted'}`}>
          By Learning Area
        </button>
      </div>

      {/* Controls */}
      {mode === 'class' ? (
        <div className="card p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Class</label>
            <select value={streamId} onChange={e => setStreamId(e.target.value)} className="input">
              {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Term</label>
            <select value={term} onChange={e => setTerm(e.target.value)} className="input">
              {TERMS.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </div>
        </div>
      ) : (
        <div className="card p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Learning Area</label>
            <select value={subject} onChange={e => setSubject(e.target.value)} className="input">
              {(subjData?.subjects || []).map((s: string) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Term</label>
            <select value={term} onChange={e => setTerm(e.target.value)} className="input">
              {TERMS.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {mode === 'subject' ? (
        subjLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-theme-muted" size={28}/></div>
        ) : subjData?.note ? (
          <div className="card p-10 text-center text-theme-muted">{subjData.note}</div>
        ) : !hasSubj ? (
          <div className="card p-10 text-center text-theme-muted">
            No marks recorded yet for {subject || 'your learning area'}{term ? ' this term' : ''}. Enter marks in <b>Enter Marks</b> and they’ll appear here.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <SummaryCard icon={<BarChart3 size={18}/>} label={`${subjData.chosen} average`} value={`${subjData.overallAverage}%`} />
              <SummaryCard icon={<Users size={18}/>} label="Learners" value={String(subjData.learnerCount)} />
              <SummaryCard icon={<TrendingUp size={18}/>} label="Classes taught" value={String(subjData.classes.length)} />
            </div>

            {/* Class-by-class for this subject */}
            <div className="card p-5">
              <h2 className="font-bold text-theme-heading mb-1">{subjData.chosen} — average by class</h2>
              <p className="text-xs text-theme-muted mb-4">How each class you teach is doing in this learning area.</p>
              <ResponsiveContainer width="100%" height={Math.max(200, subjData.classes.length * 44)}>
                <BarChart data={subjData.classes} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.06)"/>
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }}/>
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }}/>
                  <Tooltip formatter={(v: any, _n: any, p: any) => [`${v}%  (${p.payload.level})`, 'Average']}/>
                  <Bar dataKey="average" radius={[0, 6, 6, 0]}>
                    {subjData.classes.map((c: any, i: number) => (
                      <Cell key={i} fill={percentToLevel(c.average, c.gradeLevel).color}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <div className="card p-5">
                <h2 className="font-bold text-theme-heading mb-1">Level distribution</h2>
                <p className="text-xs text-theme-muted mb-4">All marks for {subjData.chosen} across your classes.</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={subjData.distribution} margin={{ left: 0, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)"/>
                    <XAxis dataKey="code" tick={{ fontSize: 11 }}/>
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }}/>
                    <Tooltip formatter={(v: any) => [`${v} marks`, 'Count']}/>
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} fill={NAVY}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="card p-5">
                <h2 className="font-bold text-theme-heading mb-1">Trend over terms</h2>
                <p className="text-xs text-theme-muted mb-4">Average for {subjData.chosen} by term.</p>
                {subjData.trend.length <= 1 ? (
                  <div className="h-[240px] flex items-center justify-center text-sm text-theme-muted text-center px-6">
                    Trend appears once there are marks in more than one term.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={subjData.trend} margin={{ left: 0, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)"/>
                      <XAxis dataKey="term" tickFormatter={(t: string) => t.replace('term_', 'Term ')} tick={{ fontSize: 11 }}/>
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }}/>
                      <Tooltip formatter={(v: any) => [`${v}%`, 'Average']} labelFormatter={(t: string) => t.replace('term_', 'Term ')}/>
                      <Line type="monotone" dataKey="average" stroke={GOLD} strokeWidth={3} dot={{ r: 4, fill: NAVY }}/>
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </>
        )
      ) : loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-theme-muted" size={28}/></div>
      ) : !hasData ? (
        <div className="card p-10 text-center text-theme-muted">
          No marks recorded yet for this class{term ? ' in this term' : ''}. Enter marks in <b>Enter Marks</b> and they’ll appear here.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard icon={<Users size={18}/>} label="Learners" value={String(data.learnerCount)} />
            <SummaryCard icon={<BarChart3 size={18}/>} label="Class average" value={`${data.classAverage}%`} />
            <SummaryCard icon={<Award size={18}/>} label="Class level"
              value={data.classLevel}
              color={percentToLevel(data.classAverage, stream?.gradeLevel || 'grade_4').color} />
            <SummaryCard icon={<TrendingUp size={18}/>} label="Learning areas" value={String(data.areas.length)} />
          </div>

          {/* Per-learning-area averages */}
          <div className="card p-5">
            <h2 className="font-bold text-theme-heading mb-1">Average by learning area</h2>
            <p className="text-xs text-theme-muted mb-4">Mean percentage across all assessments{term ? ' this term' : ''}.</p>
            <ResponsiveContainer width="100%" height={Math.max(220, data.areas.length * 42)}>
              <BarChart data={data.areas} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.06)"/>
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }}/>
                <YAxis type="category" dataKey="subject" width={130} tick={{ fontSize: 11 }}/>
                <Tooltip formatter={(v: any, _n: any, p: any) => [`${v}%  (${p.payload.level})`, 'Average']}/>
                <Bar dataKey="average" radius={[0, 6, 6, 0]}>
                  {data.areas.map((a: any, i: number) => (
                    <Cell key={i} fill={percentToLevel(a.average, stream?.gradeLevel || 'grade_4').color}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Level distribution */}
            <div className="card p-5">
              <h2 className="font-bold text-theme-heading mb-1">Performance level distribution</h2>
              <p className="text-xs text-theme-muted mb-4">How marks are spread across CBC levels.</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.distribution} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)"/>
                  <XAxis dataKey="code" tick={{ fontSize: 11 }}/>
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }}/>
                  <Tooltip formatter={(v: any) => [`${v} marks`, 'Count']}/>
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} fill={NAVY}/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Term trend */}
            <div className="card p-5">
              <h2 className="font-bold text-theme-heading mb-1">Trend over terms</h2>
              <p className="text-xs text-theme-muted mb-4">Class average percentage by term.</p>
              {data.trend.length <= 1 ? (
                <div className="h-[240px] flex items-center justify-center text-sm text-theme-muted text-center px-6">
                  Trend appears once this class has marks in more than one term.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
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
          </div>

          {/* Ranking */}
          <div className="card p-5">
            <h2 className="font-bold text-theme-heading mb-1">Learner ranking</h2>
            <p className="text-xs text-theme-muted mb-4">Ordered by average percentage across learning areas.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-theme-muted border-b border-theme">
                    <th className="px-3 py-2">Rank</th>
                    <th className="px-3 py-2">Adm No</th>
                    <th className="px-3 py-2">Learner</th>
                    <th className="px-3 py-2 text-center">Average</th>
                    <th className="px-3 py-2 text-center">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ranking.map((r: any) => {
                    const lc = percentToLevel(r.average, stream?.gradeLevel || 'grade_4');
                    return (
                      <tr key={r.learnerId} className="border-b border-theme/40">
                        <td className="px-3 py-2 font-bold">{r.rank}</td>
                        <td className="px-3 py-2 text-theme-muted">{r.adm || '—'}</td>
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2 text-center font-bold">{r.average}%</td>
                        <td className="px-3 py-2 text-center font-bold" style={{ color: lc.color }}>{r.level}</td>
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

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-theme-muted text-xs font-semibold uppercase tracking-wide">{icon}{label}</div>
      <div className="text-2xl font-black mt-1" style={{ color: color || 'var(--text-heading)' }}>{value}</div>
    </div>
  );
}
