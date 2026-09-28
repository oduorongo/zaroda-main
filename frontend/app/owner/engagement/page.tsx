// app/owner/engagement/page.tsx
// Which schools are actually using the system, judged by how full their mark lists
// are: per learning area, the share of learners with a mark, averaged across areas.
'use client';
import { useState, useEffect, Fragment } from 'react';
import { Activity, Search, Loader2, ChevronRight, ChevronDown } from 'lucide-react';
import apiClient from '@/lib/api/client';

const WINDOWS = [
  { days: 30,  label: 'Last 30 days' },
  { days: 60,  label: 'Last 60 days' },
  { days: 90,  label: 'Last 90 days (≈ a term)' },
  { days: 365, label: 'Last 12 months' },
];

const FILTERS = [
  { key: '',         label: 'All' },
  { key: 'active',   label: 'Active' },
  { key: 'low',      label: 'Low activity' },
  { key: 'inactive', label: 'Inactive' },
];

const BADGE: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  low:      'bg-amber-100 text-amber-700',
  inactive: 'bg-red-100 text-red-700',
};
const LABEL: Record<string, string> = { active: 'Active', low: 'Low activity', inactive: 'Inactive' };
const RANK: Record<string, number> = { active: 0, low: 1, inactive: 2 };

const barColor = (pct: number) => pct >= 50 ? 'bg-green-500' : pct > 0 ? 'bg-amber-500' : 'bg-red-400';

export default function OwnerEngagementPage() {
  const [days, setDays]       = useState(30);
  const [rows, setRows]       = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ active: 0, low: 0, inactive: 0 });
  const [filter, setFilter]   = useState('');
  const [search, setSearch]   = useState('');
  const [open, setOpen]       = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiClient.get('/admin/engagement', { params: { days } })
      .then(r => { setRows(r.data?.data || []); setSummary(r.data?.summary || { active: 0, low: 0, inactive: 0 }); })
      .catch(() => { setRows([]); setSummary({ active: 0, low: 0, inactive: 0 }); })
      .finally(() => setLoading(false));
  }, [days]);

  const shown = rows
    .filter(r => (!filter || r.engagement === filter) &&
      (!search || r.name?.toLowerCase().includes(search.toLowerCase()) || r.county?.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => (RANK[a.engagement] - RANK[b.engagement]) || ((b.coverage ?? -1) - (a.coverage ?? -1)) ||
      (new Date(b.lastMarkAt || 0).getTime() - new Date(a.lastMarkAt || 0).getTime()));

  const lastSeen = (d: string | null) => {
    if (!d) return 'Never';
    const n = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : `${n} days ago`;
  };

  const CARDS = [
    { key: 'active',   value: summary.active,   color: 'text-green-600', hint: '≥ 50% of learners marked per learning area' },
    { key: 'low',      value: summary.low,      color: 'text-amber-600', hint: 'Some marks, but mark lists mostly empty' },
    { key: 'inactive', value: summary.inactive, color: 'text-red-600',   hint: 'No marks entered in this window' },
  ];

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <Activity className="text-theme-muted" size={20}/>
            <h1 className="text-xl font-black text-theme-heading">School Engagement</h1>
          </div>
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="input sm:w-56">
            {WINDOWS.map(w => <option key={w.days} value={w.days}>{w.label}</option>)}
          </select>
        </div>
        <p className="text-sm text-theme-muted">
          Activity is measured from the mark list. For every learning area a school entered marks for, we take the share of its
          learners who have a mark, then average across learning areas. That average is the school&apos;s <b>coverage</b>.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {CARDS.map(c => (
            <button key={c.key} onClick={() => setFilter(filter === c.key ? '' : c.key)}
              className={`card p-4 text-left transition-all ${filter === c.key ? 'ring-2 ring-[#1a2e5a]' : ''}`}>
              <div className={`text-2xl font-black ${c.color}`}>{loading ? '…' : c.value}</div>
              <div className="text-sm font-semibold text-theme-heading mt-1">{LABEL[c.key]}</div>
              <div className="text-xs text-theme-muted">{c.hint}</div>
            </button>
          ))}
        </div>

        <div className="card p-4">
          <div className="flex flex-col sm:flex-row gap-3 mb-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted"/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search schools by name or county…" className="input pl-9 w-full"/>
            </div>
            <div className="flex gap-1 bg-surface-2 rounded-xl p-1 flex-shrink-0 overflow-x-auto">
              {FILTERS.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all ${filter === f.key ? 'bg-surface shadow-sm text-theme-heading' : 'text-theme-muted hover:text-theme-heading'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-theme-muted" size={24}/></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-theme-muted border-b border-theme">
                    <th className="py-2 pr-3 font-medium">School</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium min-w-[140px]">Coverage</th>
                    <th className="py-2 pr-3 font-medium text-right">Learning areas</th>
                    <th className="py-2 pr-3 font-medium text-right">Avg learners / area</th>
                    <th className="py-2 pr-3 font-medium text-right">Learners</th>
                    <th className="py-2 pr-3 font-medium">Last mark entry</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 ? (
                    <tr><td colSpan={7} className="py-8 text-center text-theme-muted">No schools match this filter</td></tr>
                  ) : shown.map(s => {
                    const expanded = open === s.id;
                    const canExpand = (s.breakdown || []).length > 0;
                    return (
                      <Fragment key={s.id}>
                        <tr onClick={() => canExpand && setOpen(expanded ? null : s.id)}
                          className={`border-b border-theme/50 ${canExpand ? 'cursor-pointer hover:bg-surface-2' : ''}`}>
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-1.5">
                              {canExpand
                                ? (expanded ? <ChevronDown size={14} className="text-theme-muted"/> : <ChevronRight size={14} className="text-theme-muted"/>)
                                : <span className="w-[14px]"/>}
                              <div>
                                <div className="font-semibold text-theme-heading">{s.name}</div>
                                <div className="text-xs text-theme-muted">{s.county || '—'}{s.subCounty ? ` · ${s.subCounty}` : ''}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 pr-3"><span className={`badge ${BADGE[s.engagement]}`}>{LABEL[s.engagement]}</span></td>
                          <td className="py-2.5 pr-3">
                            {s.coverage == null ? <span className="text-theme-muted">—</span> : (
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                                  <div className={`h-full ${barColor(s.coverage)}`} style={{ width: `${s.coverage}%` }}/>
                                </div>
                                <span className="text-xs font-semibold text-theme-heading w-9 text-right">{s.coverage}%</span>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 text-right">{s.learningAreas}</td>
                          <td className="py-2.5 pr-3 text-right">{s.avgLearnersPerArea ?? '—'}</td>
                          <td className="py-2.5 pr-3 text-right">{s.learnerCount}</td>
                          <td className="py-2.5 pr-3 text-theme-muted whitespace-nowrap">{lastSeen(s.lastMarkAt)}</td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-theme/50 bg-surface-2">
                            <td colSpan={7} className="px-4 py-3">
                              <div className="text-xs font-semibold text-theme-muted uppercase tracking-wide mb-2">Mark list by learning area</div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                                {s.breakdown.map((b: any) => {
                                  const pct = s.learnerCount > 0 ? Math.min(100, Math.round((b.learners / s.learnerCount) * 100)) : 0;
                                  return (
                                    <div key={b.subject} className="flex items-center gap-2 text-xs">
                                      <span className="w-40 truncate text-theme-heading" title={b.subject}>{b.subject}</span>
                                      <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
                                        <div className={`h-full ${barColor(pct)}`} style={{ width: `${pct}%` }}/>
                                      </div>
                                      <span className="w-24 text-right text-theme-muted">{b.learners}/{s.learnerCount} · {pct}%</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-theme-muted mt-3">Click a school to see how full its mark list is in each learning area. Individual teacher accounts are excluded.</p>
        </div>
      </div>
    </div>
  );
}
