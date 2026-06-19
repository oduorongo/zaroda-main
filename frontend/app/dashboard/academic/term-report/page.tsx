// app/dashboard/academic/term-report/page.tsx
// Per-assessment term mark sheet → report view.
// Each assessment in the term is its own column group per learning area, showing the
// 8-point level (BE2…EE1). Per-assessment total (e.g. /72 for 9 areas) + term average.
'use client';
import { useState, useEffect } from 'react';
import { Loader2, FileText, Printer } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';

const TERMS = [
  { v: 'term_1', label: 'Term 1' },
  { v: 'term_2', label: 'Term 2' },
  { v: 'term_3', label: 'Term 3' },
];

// Colour per level code (BE low → EE high) for quick scanning.
const LEVEL_COLOR: Record<string, string> = {
  EE1: '#15803d', EE2: '#16a34a', ME1: '#2563eb', ME2: '#3b82f6',
  AE1: '#f59e0b', AE2: '#fb923c', BE1: '#dc2626', BE2: '#b91c1c',
  EE: '#16a34a', ME: '#2563eb', AE: '#f59e0b', BE: '#dc2626',
};

export default function TermReportPage() {
  const { user } = useAuth();
  const [streams, setStreams]   = useState<any[]>([]);
  const [streamId, setStreamId] = useState('');
  const [term, setTerm]         = useState('term_1');
  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    apiClient.get('/academic/streams').then(r => {
      setStreams(r.data || []);
      if (r.data?.[0]) setStreamId(r.data[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!streamId) return;
    setLoading(true);
    apiClient.get('/academic/term-mark-sheet', { params: { streamId, term } })
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [streamId, term]);

  // The union of all learning areas that appear in any assessment, for stable rows.
  const allAreas: string[] = (() => {
    if (!data?.learners) return [];
    const set = new Set<string>();
    for (const L of data.learners) {
      for (const exId of Object.keys(L.byAssessment || {})) {
        for (const a of Object.keys(L.byAssessment[exId].areas || {})) set.add(a);
      }
    }
    return Array.from(set);
  })();

  const assessments = data?.assessments || [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <FileText className="text-theme-muted" size={20}/>
          <h1 className="text-lg font-black text-theme-heading">Term Report — by Assessment</h1>
        </div>
        <div className="flex items-center gap-2">
          <select value={streamId} onChange={e => setStreamId(e.target.value)} className="input w-44">
            {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={term} onChange={e => setTerm(e.target.value)} className="input w-28">
            {TERMS.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
          <button onClick={() => window.print()} className="btn-ghost"><Printer size={15}/> Print</button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-theme-muted" size={26}/></div>
      ) : !data || assessments.length === 0 ? (
        <div className="card p-8 text-center text-theme-muted">
          No assessments with marks for this class in {TERMS.find(t=>t.v===term)?.label}. Create an assessment and have teachers enter marks first.
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-surface-2">
                <th className="text-left p-2 sticky left-0 bg-surface-2 z-10 border-theme" style={{ borderRight: '1px solid var(--border)' }}>Learner</th>
                {allAreas.map(area => (
                  <th key={area} colSpan={assessments.length} className="p-2 text-center border-theme" style={{ borderLeft: '1px solid var(--border)' }}>
                    {area}
                  </th>
                ))}
                <th className="p-2 text-center" style={{ borderLeft: '2px solid var(--border)' }}>Term Avg</th>
              </tr>
              <tr className="bg-surface-2 text-[11px] text-theme-muted">
                <th className="sticky left-0 bg-surface-2 z-10" style={{ borderRight: '1px solid var(--border)' }}></th>
                {allAreas.map(area => assessments.map((a: any) => (
                  <th key={area + a.id} className="p-1 font-medium whitespace-nowrap" style={{ borderLeft: '1px solid var(--border)' }} title={a.name}>
                    {a.name.length > 8 ? a.name.slice(0, 8) + '…' : a.name}
                  </th>
                )))}
                <th style={{ borderLeft: '2px solid var(--border)' }}></th>
              </tr>
            </thead>
            <tbody>
              {data.learners.map((L: any) => (
                <tr key={L.learnerId} className="border-t border-theme hover:bg-surface-2">
                  <td className="p-2 font-semibold text-theme-heading sticky left-0 bg-surface z-10 whitespace-nowrap" style={{ borderRight: '1px solid var(--border)' }}>
                    {L.firstName} {L.lastName}
                  </td>
                  {allAreas.map(area => assessments.map((a: any) => {
                    const cell = L.byAssessment?.[a.id]?.areas?.[area];
                    return (
                      <td key={area + a.id} className="p-1 text-center" style={{ borderLeft: '1px solid var(--border)' }}>
                        {cell ? (
                          <span className="font-bold" style={{ color: LEVEL_COLOR[cell.level] || 'inherit' }} title={`${cell.percent}%`}>
                            {cell.level}
                          </span>
                        ) : <span className="text-theme-muted">·</span>}
                      </td>
                    );
                  }))}
                  <td className="p-2 text-center font-bold text-theme-heading" style={{ borderLeft: '2px solid var(--border)' }}>
                    {L.termAveragePercent}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Per-assessment totals summary (e.g. /72 for 9 areas at 8 pts each) */}
          {data.senior && (
            <div className="p-4 border-t border-theme">
              <div className="text-xs font-semibold text-theme-muted uppercase tracking-wide mb-2">
                Performance-level totals (out of {allAreas.length * data.maxPointsPerArea} for {allAreas.length} learning areas)
              </div>
              <div className="overflow-x-auto">
                <table className="text-sm">
                  <thead>
                    <tr className="text-theme-muted text-left">
                      <th className="p-1 pr-4">Learner</th>
                      {assessments.map((a: any) => <th key={a.id} className="p-1 px-3 text-center">{a.name}</th>)}
                      <th className="p-1 px-3 text-center font-bold">Term Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.learners.map((L: any) => (
                      <tr key={L.learnerId} className="border-t border-theme/40">
                        <td className="p-1 pr-4 font-medium whitespace-nowrap">{L.firstName} {L.lastName}</td>
                        {assessments.map((a: any) => {
                          const blk = L.byAssessment?.[a.id];
                          return (
                            <td key={a.id} className="p-1 px-3 text-center">
                              {blk ? `${blk.points}/${blk.max}` : '—'}
                            </td>
                          );
                        })}
                        <td className="p-1 px-3 text-center font-bold text-theme-heading">{L.termTotalPoints ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
