// app/owner/schools/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { Building2, Search, Loader2, ChevronRight } from 'lucide-react';
import apiClient from '@/lib/api/client';

export default function OwnerSchoolsPage() {
  const [schools, setSchools] = useState<any[]>([]);
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    apiClient.get('/admin/tenants', { params: { search } })
      .then(r => setSchools(r.data?.data || []))
      .catch(() => setSchools([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const badge = (st: string) => ({
    active: 'bg-green-100 text-green-700', trial: 'bg-amber-100 text-amber-700',
    suspended: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-500',
  } as Record<string,string>)[st] || 'bg-gray-100 text-gray-500';

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex items-center gap-2">
          <Building2 className="text-theme-muted" size={20}/>
          <h1 className="text-xl font-black text-theme-heading">Schools</h1>
        </div>

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

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-theme-muted" size={24}/></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-theme-muted border-b border-theme">
                    <th className="py-2 pr-3 font-medium">School</th>
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
                    <tr><td colSpan={8} className="py-8 text-center text-theme-muted">No schools found</td></tr>
                  ) : schools.map((s: any) => (
                    <tr key={s.id} className="border-b border-theme/50 align-top">
                      <td className="py-2.5 pr-3 font-semibold text-theme-heading">{s.name}</td>
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
