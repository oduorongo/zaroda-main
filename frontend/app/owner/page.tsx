'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Users, GraduationCap, Activity, Search, Loader2, ChevronRight, ShieldCheck } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';

// Platform owner (super_admin) dashboard — read-only oversight across ALL schools.
// Control actions (suspend, subscription, edit) come in a later phase.
export default function OwnerDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats]     = useState<any>(null);
  const [schools, setSchools] = useState<any[]>([]);
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail]   = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Guard: only the platform owner may view this page.
  useEffect(() => {
    if (user && user.role !== 'super_admin') router.replace('/dashboard');
  }, [user, router]);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get('/admin/stats').catch(() => ({ data: {} })),
      apiClient.get('/admin/tenants', { params: { search } }).catch(() => ({ data: { data: [] } })),
    ]).then(([s, t]) => {
      setStats(s.data || {});
      setSchools(t.data?.data || []);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openSchool = async (id: string) => {
    setDetailLoading(true); setDetail({ id });
    try {
      const r = await apiClient.get(`/admin/tenants/${id}`);
      setDetail(r.data);
    } catch { setDetail(null); }
    finally { setDetailLoading(false); }
  };

  const statusBadge = (st: string) => {
    const map: Record<string,string> = {
      active: 'bg-green-100 text-green-700', trial: 'bg-amber-100 text-amber-700',
      suspended: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-500',
    };
    return map[st] || 'bg-gray-100 text-gray-500';
  };

  if (user && user.role !== 'super_admin') return null;

  return (
    <div className="min-h-screen bg-surface-2 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#1a2e5a] flex items-center justify-center text-[#d4af37]">
            <ShieldCheck size={22}/>
          </div>
          <div>
            <h1 className="text-xl font-black text-theme-heading">ZARODA Platform — Owner Console</h1>
            <p className="text-sm text-theme-muted">Oversight across all schools. Read-only.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-theme-muted" size={28}/></div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Schools',   value: stats?.totalTenants ?? 0,    icon: Building2,     sub: `${stats?.activeTenants ?? 0} active · ${stats?.trialTenants ?? 0} trial` },
                { label: 'Suspended', value: stats?.suspendedTenants ?? 0, icon: Activity },
                { label: 'Learners',  value: stats?.totalLearners ?? 0,    icon: GraduationCap },
                { label: 'Users',     value: stats?.totalUsers ?? 0,       icon: Users },
              ].map((c, i) => (
                <div key={i} className="card p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-theme-muted font-medium uppercase tracking-wide">{c.label}</span>
                    <c.icon size={16} className="text-theme-muted"/>
                  </div>
                  <div className="text-2xl font-black text-theme-heading mt-1">{c.value}</div>
                  {c.sub && <div className="text-[11px] text-theme-muted mt-0.5">{c.sub}</div>}
                </div>
              ))}
            </div>

            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted"/>
                  <input
                    value={search} onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') load(); }}
                    placeholder="Search schools by name…"
                    className="input pl-9 w-full"/>
                </div>
                <button onClick={load} className="btn-primary">Search</button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-theme-muted border-b border-theme">
                      <th className="py-2 pr-3 font-medium">School</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 font-medium">Tier</th>
                      <th className="py-2 pr-3 font-medium">Learners</th>
                      <th className="py-2 pr-3 font-medium">Users</th>
                      <th className="py-2 pr-3 font-medium">County</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {schools.length === 0 ? (
                      <tr><td colSpan={7} className="py-8 text-center text-theme-muted">No schools found</td></tr>
                    ) : schools.map((s: any) => (
                      <tr key={s.id} className="border-b border-theme/50 hover:bg-surface-2 cursor-pointer" onClick={() => openSchool(s.id)}>
                        <td className="py-2.5 pr-3 font-semibold text-theme-heading">{s.name}</td>
                        <td className="py-2.5 pr-3"><span className={`badge ${statusBadge(s.status)}`}>{s.status}</span></td>
                        <td className="py-2.5 pr-3 capitalize">{s.subscriptionTier || '—'}</td>
                        <td className="py-2.5 pr-3">{s.learnerCount ?? 0}</td>
                        <td className="py-2.5 pr-3">{s.userCount ?? 0}</td>
                        <td className="py-2.5 pr-3 text-theme-muted">{s.county || '—'}</td>
                        <td className="py-2.5 text-theme-muted"><ChevronRight size={16}/></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* School detail drawer */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setDetail(null)}>
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()} style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-bold text-theme-heading">{detail?.tenant?.name || 'School'}</h3>
              <button onClick={() => setDetail(null)} className="text-theme-muted">✕</button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {detailLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-theme-muted" size={24}/></div>
              ) : detail?.tenant ? (
                <>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="card p-3"><div className="text-xl font-black text-theme-heading">{detail.tenant.learnerCount ?? 0}</div><div className="text-[11px] text-theme-muted">Learners</div></div>
                    <div className="card p-3"><div className="text-xl font-black text-theme-heading">{detail.tenant.streamCount ?? 0}</div><div className="text-[11px] text-theme-muted">Streams</div></div>
                    <div className="card p-3"><div className="text-xl font-black text-theme-heading">{detail.tenant.userCount ?? 0}</div><div className="text-[11px] text-theme-muted">Users</div></div>
                  </div>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between"><span className="text-theme-muted">Status</span><span className={`badge ${statusBadge(detail.tenant.status)}`}>{detail.tenant.status}</span></div>
                    <div className="flex justify-between"><span className="text-theme-muted">Tier</span><span className="capitalize">{detail.tenant.subscription_tier || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-theme-muted">KNEC Code</span><span>{detail.tenant.knec_code || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-theme-muted">County</span><span>{detail.tenant.county || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-theme-muted">Phone</span><span>{detail.tenant.phone || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-theme-muted">Email</span><span>{detail.tenant.email || '—'}</span></div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-theme-muted uppercase tracking-wide mb-2">Staff ({detail.users?.length || 0})</div>
                    <div className="space-y-1 max-h-52 overflow-y-auto">
                      {(detail.users || []).map((u: any) => (
                        <div key={u.id} className="flex items-center justify-between text-sm py-1">
                          <span>{u.firstName} {u.lastName}</span>
                          <span className="text-theme-muted text-xs capitalize">{u.role?.replace('_',' ')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-theme-muted pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    Read-only view. Control actions (suspend, subscription, edit) are coming in the next phase.
                  </p>
                </>
              ) : (
                <p className="text-theme-muted text-center py-10">Could not load this school.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
