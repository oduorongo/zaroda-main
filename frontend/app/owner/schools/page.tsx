// app/owner/schools/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { Building2, Search, Loader2, ChevronRight, Copy, X } from 'lucide-react';
import apiClient from '@/lib/api/client';

const LEVEL_TABS = [
  { key: '',           label: 'All' },
  { key: 'primary_js', label: 'Primary / JS' },
  { key: 'senior',     label: 'Senior School' },
];

export default function OwnerSchoolsPage() {
  const [schools, setSchools] = useState<any[]>([]);
  const [search, setSearch]   = useState('');
  const [level, setLevel]     = useState('');
  const [loading, setLoading] = useState(true);
  const [dups, setDups] = useState<any[] | null>(null);
  const [showDups, setShowDups] = useState(false);
  const openDups = () => {
    setShowDups(true); setDups(null);
    apiClient.get('/admin/duplicate-schools').then(r => setDups(r.data?.groups || [])).catch(() => setDups([]));
  };
  const day = (d: string | null) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const load = () => {
    setLoading(true);
    apiClient.get('/admin/tenants', { params: { search, level: level || undefined } })
      .then(r => setSchools(r.data?.data || []))
      .catch(() => setSchools([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [level]);

  const levelLabel = (levels: string[]) => {
    if (!levels || levels.length === 0) return '—';
    return levels.map(l => l === 'senior' ? 'Senior' : 'Primary/JS').join(' + ');
  };

  const badge = (st: string) => ({
    active: 'bg-green-100 text-green-700', trial: 'bg-amber-100 text-amber-700',
    suspended: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-500',
  } as Record<string,string>)[st] || 'bg-gray-100 text-gray-500';

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Building2 className="text-theme-muted" size={20}/>
            <h1 className="text-xl font-black text-theme-heading">Schools</h1>
          </div>
          <button onClick={() => (showDups ? setShowDups(false) : openDups())}
            className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 bg-[#d4af37] text-[#1a2e5a] hover:brightness-95">
            {showDups ? <X size={15}/> : <Copy size={15}/>} {showDups ? 'Close duplicates' : 'Possible duplicates'}
          </button>
        </div>

        {showDups && (
          <div className="card p-4 space-y-3 border-l-4 border-l-[#d4af37]">
            <div>
              <h2 className="font-semibold text-theme-heading">Schools that may be registered twice</h2>
              <p className="text-xs text-theme-muted">Grouped by similar name (same rules as the sign-up check). Different schools can share a name — compare the county, KNEC code and who is actually using each account before contacting them.</p>
            </div>
            {!dups ? <div className="flex justify-center py-6"><Loader2 className="animate-spin text-theme-muted" size={20}/></div>
              : !dups.length ? <p className="text-sm text-theme-muted py-4 text-center">No likely duplicates found.</p>
              : dups.map((g: any[], gi: number) => (
                <div key={gi} className="rounded-xl border border-theme overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-theme-muted bg-surface-2">
                      {['School', 'KNEC', 'Location', 'Registered', 'Users', 'Learners', 'Last marks', 'Admin'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {g.map((s: any) => (
                        <tr key={s.id} className="border-t border-theme align-top">
                          <td className="p-2 font-semibold text-theme-heading">{s.name}<div><span className={`badge ${badge(s.status)}`}>{s.status}</span></div></td>
                          <td className="p-2 text-theme-muted">{s.knecCode || '—'}</td>
                          <td className="p-2 text-theme-muted">{[s.subCounty, s.county].filter(Boolean).join(', ') || '—'}</td>
                          <td className="p-2 text-theme-muted whitespace-nowrap">{day(s.createdAt)}</td>
                          <td className="p-2">{s.users}</td>
                          <td className="p-2">{s.learners}</td>
                          <td className="p-2 text-theme-muted whitespace-nowrap">{day(s.lastMarkAt)}</td>
                          <td className="p-2 text-xs text-theme-muted">{s.adminName && <div className="text-theme-heading font-medium">{s.adminName}</div>}{s.adminPhone && <div>{s.adminPhone}</div>}{s.adminEmail && <div>{s.adminEmail}</div>}{!s.adminName && !s.adminPhone && !s.adminEmail && '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        )}

        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted"/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') load(); }}
                placeholder="Search schools by name…" className="input pl-9 w-full"/>
            </div>
            <button onClick={load} className="btn-primary">Search</button>
          </div>

          <div className="flex gap-1 mb-3 border-b border-theme">
            {LEVEL_TABS.map(t => (
              <button key={t.key} onClick={() => setLevel(t.key)}
                className={`px-3 py-1.5 text-xs font-semibold border-b-2 transition-all
                  ${level === t.key ? 'border-[#1a2e5a] text-theme-heading' : 'border-transparent text-theme-muted hover:text-theme-heading'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-theme-muted" size={24}/></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-theme-muted border-b border-theme">
                    <th className="py-2 pr-3 font-medium">School</th>
                    <th className="py-2 pr-3 font-medium">Level</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Tier</th>
                    <th className="py-2 pr-3 font-medium">Learners</th>
                    <th className="py-2 pr-3 font-medium">County</th>
                    <th className="py-2 pr-3 font-medium">Sub-county</th>
                    <th className="py-2 pr-3 font-medium">Zone</th>
                    <th className="py-2 pr-3 font-medium">Admin contact</th>
                  </tr>
                </thead>
                <tbody>
                  {schools.length === 0 ? (
                    <tr><td colSpan={9} className="py-8 text-center text-theme-muted">No schools found</td></tr>
                  ) : schools.map((s: any) => (
                    <tr key={s.id} className="border-b border-theme/50 align-top">
                      <td className="py-2.5 pr-3 font-semibold text-theme-heading">{s.name}</td>
                      <td className="py-2.5 pr-3 text-theme-muted">{levelLabel(s.schoolLevels)}</td>
                      <td className="py-2.5 pr-3"><span className={`badge ${badge(s.status)}`}>{s.status}</span></td>
                      <td className="py-2.5 pr-3 capitalize">{s.subscriptionTier || '—'}</td>
                      <td className="py-2.5 pr-3">{s.learnerCount ?? 0}</td>
                      <td className="py-2.5 pr-3 text-theme-muted">{s.county || '—'}</td>
                      <td className="py-2.5 pr-3 text-theme-muted">{s.subCounty || '—'}</td>
                      <td className="py-2.5 pr-3 text-theme-muted">{s.zone || '—'}</td>
                      <td className="py-2.5 pr-3 text-theme-muted">
                        {(s.adminName || s.adminPhone || s.adminEmail) ? (
                          <div className="leading-tight">
                            {s.adminName && <div className="text-theme-heading font-medium">{s.adminName.trim()}</div>}
                            {s.adminPhone && <div className="text-xs">{s.adminPhone}</div>}
                            {s.adminEmail && <div className="text-xs">{s.adminEmail}</div>}
                          </div>
                        ) : (s.phone || s.email) ? (
                          <div className="leading-tight">
                            {s.phone && <div className="text-xs">{s.phone}</div>}
                            {s.email && <div className="text-xs">{s.email}</div>}
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-theme-muted mt-3">Tip: open the Overview tab to manage a school (suspend, subscription, reset passwords).</p>
        </div>
      </div>
    </div>
  );
}
