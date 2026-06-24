'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, TrendingUp, Award, Heart } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { percentToLevel } from '@/lib/cbc/constants';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, Cell,
} from 'recharts';
import toast from 'react-hot-toast';

const NAVY = '#1a2e5a';
const GOLD = '#d4af37';
const GREY = '#9aa3bd';

const TERMS = [
  { v: '',        label: 'All terms' },
  { v: 'term_1',  label: 'Term 1' },
  { v: 'term_2',  label: 'Term 2' },
  { v: 'term_3',  label: 'Term 3' },
];

export default function ParentAnalyticsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="animate-spin text-theme-muted" size={28}/></div>}>
      <ParentAnalyticsInner />
    </Suspense>
  );
}

function ParentAnalyticsInner() {
  const search = useSearchParams();
  const [learnerId, setLearnerId] = useState(search.get('child') || '');
  const [term,      setTerm]      = useState('');
  const [data,      setData]      = useState<any>(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    setLoading(true);
    apiClient.get('/academic/analytics/parent', { params: { learnerId: learnerId || undefined, term: term || undefined } })
      .then(r => { setData(r.data); if (r.data?.chosen?.id && !learnerId) setLearnerId(r.data.chosen.id); })
      .catch(e => { setData(null); toast.error(e?.response?.data?.message || 'Could not load performance'); })
      .finally(() => setLoading(false));
  }, [learnerId, term]);

  const grade = data?.chosen?.gradeLevel || 'grade_4';
  const hasMarks = data?.hasMarks;

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-[#1a2e5a] to-[#243f7a] rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-[#d4af37]/10 rounded-full -translate-y-10 translate-x-10"/>
        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <TrendingUp size={22} className="text-[#d4af37]"/>
          </div>
          <div>
            <h1 className="text-2xl font-black">Performance</h1>
            <p className="text-white/60 text-sm">{data?.chosen?.name ? `${data.chosen.name}'s progress` : 'Your child’s progress'}</p>
          </div>
        </div>
      </div>

      {/* Child + term pickers */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        {data?.children?.length > 1 && (
          <div>
            <label className="label">Child</label>
            <select value={learnerId} onChange={e => setLearnerId(e.target.value)} className="input">
              {data.children.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label">Term</label>
          <select value={term} onChange={e => setTerm(e.target.value)} className="input">
            {TERMS.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-theme-muted" size={28}/></div>
      ) : data?.note ? (
        <div className="card p-10 text-center text-theme-muted"><Heart size={28} className="mx-auto mb-2 text-[#e2e6f0]"/>{data.note}</div>
      ) : !hasMarks ? (
        <div className="card p-10 text-center text-theme-muted">
          No marks have been recorded for {data?.chosen?.name || 'your child'} yet{term ? ' this term' : ''}. Performance will appear here once teachers enter marks.
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="card p-4">
              <div className="text-theme-muted text-xs font-semibold uppercase tracking-wide flex items-center gap-2"><Award size={16}/> Overall average</div>
              <div className="text-2xl font-black mt-1" style={{ color: percentToLevel(data.overallAverage, grade).color }}>
                {data.overallAverage}% <span className="text-base">{data.overallLevel}</span>
              </div>
            </div>
            <div className="card p-4">
              <div className="text-theme-muted text-xs font-semibold uppercase tracking-wide">Class average</div>
              <div className="text-2xl font-black mt-1 text-theme-heading">{data.classOverall != null ? `${data.classOverall}%` : '—'}</div>
            </div>
            <div className="card p-4">
              <div className="text-theme-muted text-xs font-semibold uppercase tracking-wide">vs class</div>
              <div className="text-2xl font-black mt-1" style={{ color: data.classOverall != null && data.overallAverage >= data.classOverall ? '#16a34a' : '#dc2626' }}>
                {data.classOverall != null ? `${data.overallAverage >= data.classOverall ? '+' : ''}${data.overallAverage - data.classOverall}%` : '—'}
              </div>
            </div>
          </div>

          {/* Per-subject: child vs class */}
          <div className="card p-5">
            <h2 className="font-bold text-theme-heading mb-1">By learning area</h2>
            <p className="text-xs text-theme-muted mb-4">{data.chosen.name}’s average compared to the class average.</p>
            <ResponsiveContainer width="100%" height={Math.max(240, data.areas.length * 46)}>
              <BarChart data={data.areas} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.06)"/>
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }}/>
                <YAxis type="category" dataKey="subject" width={130} tick={{ fontSize: 11 }}/>
                <Tooltip formatter={(v: any, n: any) => [`${v}%`, n === 'average' ? data.chosen.name : 'Class average']}/>
                <Legend formatter={(v: string) => v === 'average' ? data.chosen.name : 'Class average'}/>
                <Bar dataKey="classAverage" name="classAverage" fill={GREY} radius={[0, 4, 4, 0]} barSize={10}/>
                <Bar dataKey="average" name="average" fill={NAVY} radius={[0, 4, 4, 0]} barSize={14}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Per-subject table with levels */}
          <div className="card p-5">
            <h2 className="font-bold text-theme-heading mb-3">Learning area details</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-theme-muted border-b border-theme">
                    <th className="px-3 py-2">Learning area</th>
                    <th className="px-3 py-2 text-center">{data.chosen.name?.split(' ')[0]}</th>
                    <th className="px-3 py-2 text-center">Level</th>
                    <th className="px-3 py-2 text-center">Class avg</th>
                  </tr>
                </thead>
                <tbody>
                  {data.areas.map((a: any) => {
                    const lc = percentToLevel(a.average, grade);
                    return (
                      <tr key={a.subject} className="border-b border-theme/40">
                        <td className="px-3 py-2">{a.subject}</td>
                        <td className="px-3 py-2 text-center font-bold">{a.average}%</td>
                        <td className="px-3 py-2 text-center font-bold" style={{ color: lc.color }}>{a.level}</td>
                        <td className="px-3 py-2 text-center text-theme-muted">{a.classAverage != null ? `${a.classAverage}%` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Trend */}
          <div className="card p-5">
            <h2 className="font-bold text-theme-heading mb-1">Progress over terms</h2>
            <p className="text-xs text-theme-muted mb-4">{data.chosen.name}’s average percentage by term.</p>
            {data.trend.length <= 1 ? (
              <div className="h-[200px] flex items-center justify-center text-sm text-theme-muted text-center px-6">
                Progress over time appears once there are marks in more than one term.
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
        </>
      )}
    </div>
  );
}
