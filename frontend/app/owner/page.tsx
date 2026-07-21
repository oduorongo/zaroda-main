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
  const [ownershipFilter, setOwnershipFilter] = useState<''|'public'|'private'>('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail]   = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing]   = useState(false);

  // Refresh the open school's detail + the list after a control action.
  const refreshAfterAction = async (id: string) => {
    try { const r = await apiClient.get(`/admin/tenants/${id}`); setDetail(r.data); } catch {}
    load();
  };
  const deleteSchool = async (id: string, name: string) => {
    const typed = prompt(`This permanently deletes "${name}" and ALL its data (learners, marks, users, fees). This cannot be undone.\n\nType the school name exactly to confirm:`);
    if (typed == null) return;
    if (typed !== name) { alert('Name did not match. Deletion cancelled.'); return; }
    setActing(true);
    try {
      const r = await apiClient.delete(`/admin/tenants/${id}`, { params: { confirm: name } });
      if (r.data?.deleted) { alert(`"${name}" was deleted.`); setDetail(null); load(); }
      else alert(r.data?.message || 'Could not delete school');
    } catch { alert('Could not delete school'); }
    finally { setActing(false); }
  };
  const setStatus = async (id: string, status: string) => {
    const verb = status === 'suspended' ? 'Suspend' : 'Reactivate';
    if (!confirm(`${verb} this school? ${status === 'suspended' ? 'Its users will be blocked from logging in.' : 'Its users will regain access.'}`)) return;
    setActing(true);
    try { await apiClient.patch(`/admin/tenants/${id}/status`, { status }); await refreshAfterAction(id); }
    catch { alert('Could not update status'); }
    finally { setActing(false); }
  };
  const setTier = async (id: string, tier: string) => {
    setActing(true);
    try { await apiClient.patch(`/admin/tenants/${id}/subscription`, { tier }); await refreshAfterAction(id); }
    catch { alert('Could not change subscription'); }
    finally { setActing(false); }
  };
  const setOwnership = async (id: string, ownership: string) => {
    setActing(true);
    try { await apiClient.patch(`/admin/tenants/${id}`, { ownership }); await refreshAfterAction(id); }
    catch { alert('Could not change ownership'); }
    finally { setActing(false); }
  };
  const resetPassword = async (userId: string, name: string) => {
    if (!confirm(`Reset the password for ${name}? A new temporary password will be generated.`)) return;
    setActing(true);
    try {
      const r = await apiClient.post(`/admin/users/${userId}/reset-password`);
      if (r.data?.tempPassword) {
        alert(`New temporary password for ${r.data.email}:\n\n${r.data.tempPassword}\n\nShare it securely. They'll be asked to change it on next login.`);
      } else { alert('Could not reset password'); }
    } catch { alert('Could not reset password'); }
    finally { setActing(false); }
  };
  // Recovery action for a school left with no administrator (e.g. its HOI account was
  // removed) — promotes an existing staff member to HOI, demoting any other current HOI.
  const promoteToHoi = async (userId: string, name: string) => {
    if (!confirm(`Make ${name} the Head of Institution for this school? Any existing HOI will be demoted to class teacher.`)) return;
    setActing(true);
    try {
      const r = await apiClient.post(`/admin/users/${userId}/promote-hoi`);
      if (r.data?.promoted) { await refreshAfterAction(detail.tenant.id); }
      else alert(r.data?.error || 'Could not promote to HOI');
    } catch { alert('Could not promote to HOI'); }
    finally { setActing(false); }
  };

  // Guard: only the platform owner may view this page.
  useEffect(() => {
    if (user && user.role !== 'super_admin') router.replace('/dashboard');
  }, [user, router]);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get('/admin/stats').catch(() => ({ data: {} })),
      apiClient.get('/admin/tenants', { params: { search, ownership: ownershipFilter || undefined } }).catch(() => ({ data: { data: [] } })),
    ]).then(([s, t]) => {
      setStats(s.data || {});
      setSchools(t.data?.data || []);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [ownershipFilter]);

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

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-black text-theme-heading">Overview</h1>
            <p className="text-sm text-theme-muted">Oversight and management across all schools.</p>
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

            {/* Charts: school status + subscription tier breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="card p-4">
                <div className="text-xs text-theme-muted font-medium uppercase tracking-wide mb-3">Schools by status</div>
                {(() => {
                  const total = stats?.totalTenants || 0;
                  const bars = [
                    { label: 'Active',    value: stats?.activeTenants ?? 0,    color: '#16a34a' },
                    { label: 'Trial',     value: stats?.trialTenants ?? 0,     color: '#f59e0b' },
                    { label: 'Suspended', value: stats?.suspendedTenants ?? 0, color: '#dc2626' },
                  ];
                  return (
                    <div className="space-y-2">
                      {bars.map(b => (
                        <div key={b.label}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-theme">{b.label}</span>
                            <span className="text-theme-muted font-semibold">{b.value}</span>
                          </div>
                          <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${total ? (b.value/total)*100 : 0}%`, background: b.color }}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="card p-4">
                <div className="text-xs text-theme-muted font-medium uppercase tracking-wide mb-3">Subscription tiers</div>
                {(() => {
                  const counts: Record<string, number> = {};
                  for (const s of schools) { const t = (s.subscriptionTier || 'free'); counts[t] = (counts[t]||0)+1; }
                  const palette: Record<string,string> = { free:'#94a3b8', primary:'#2563eb', senior:'#7c3aed' };
                  const total = schools.length || 1;
                  const entries = Object.entries(counts);
                  return entries.length ? (
                    <div className="space-y-2">
                      {entries.map(([tier, n]) => (
                        <div key={tier}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-theme capitalize">{tier}</span>
                            <span className="text-theme-muted font-semibold">{n}</span>
                          </div>
                          <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(n/total)*100}%`, background: palette[tier] || '#94a3b8' }}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <div className="text-xs text-theme-muted">No schools yet</div>;
                })()}
              </div>
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
                <select value={ownershipFilter} onChange={e => setOwnershipFilter(e.target.value as any)} className="input w-40">
                  <option value="">All ownership</option>
                  <option value="public">Public only</option>
                  <option value="private">Private only</option>
                </select>
                <button onClick={load} className="btn-primary">Search</button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-theme-muted border-b border-theme">
                      <th className="py-2 pr-3 font-medium">School</th>
                      <th className="py-2 pr-3 font-medium">Ownership</th>
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
                      <tr><td colSpan={8} className="py-8 text-center text-theme-muted">No schools found</td></tr>
                    ) : schools.map((s: any) => (
                      <tr key={s.id} className="border-b border-theme/50 hover:bg-surface-2 cursor-pointer" onClick={() => openSchool(s.id)}>
                        <td className="py-2.5 pr-3 font-semibold text-theme-heading">{s.name}</td>
                        <td className="py-2.5 pr-3 capitalize">{s.ownership || 'public'}</td>
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
                    <div className="flex justify-between items-center">
                      <span className="text-theme-muted">Ownership</span>
                      <div className="flex items-center gap-2">
                        <span className="capitalize">{detail.tenant.ownership || 'public'}</span>
                        <button
                          disabled={acting}
                          onClick={() => setOwnership(detail.tenant.id, detail.tenant.ownership === 'private' ? 'public' : 'private')}
                          className="text-[11px] text-[#1a2e5a] hover:underline"
                          title="Private schools may onboard a non-teaching School Owner account"
                        >Switch to {detail.tenant.ownership === 'private' ? 'Public' : 'Private'}</button>
                      </div>
                    </div>
                    <div className="flex justify-between"><span className="text-theme-muted">KNEC Code</span><span>{detail.tenant.knec_code || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-theme-muted">County</span><span>{detail.tenant.county || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-theme-muted">Phone</span><span>{detail.tenant.phone || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-theme-muted">Email</span><span>{detail.tenant.email || '—'}</span></div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-theme-muted uppercase tracking-wide mb-2">Staff ({detail.users?.length || 0})</div>
                    {!(detail.users || []).some((u: any) => ['hoi','tenant_owner','school_admin'].includes(u.role)) && (detail.users || []).length > 0 && (
                      <div className="text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2 mb-2">
                        This school has no administrator. Use "Make HOI" below to give one of its staff admin access.
                      </div>
                    )}
                    <div className="space-y-1 max-h-52 overflow-y-auto">
                      {(detail.users || []).map((u: any) => (
                        <div key={u.id} className="flex items-center justify-between text-sm py-1 gap-2">
                          <span className="truncate">{u.firstName} {u.lastName}</span>
                          <span className="text-theme-muted text-xs capitalize ml-auto">{u.role?.replace('_',' ')}</span>
                          {u.role !== 'hoi' && (
                            <button
                              disabled={acting}
                              onClick={() => promoteToHoi(u.id, `${u.firstName} ${u.lastName}`)}
                              className="text-[11px] text-[#1a2e5a] hover:underline whitespace-nowrap"
                              title="Make this user the Head of Institution"
                            >Make HOI</button>
                          )}
                          <button
                            disabled={acting}
                            onClick={() => resetPassword(u.id, `${u.firstName} ${u.lastName}`)}
                            className="text-[11px] text-[#1a2e5a] hover:underline whitespace-nowrap"
                            title="Reset this user's password"
                          >Reset password</button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="pt-3 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
                    <div className="text-xs font-semibold text-theme-muted uppercase tracking-wide">Manage</div>

                    {/* Suspend / reactivate */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-theme-muted">School access</span>
                      {detail.tenant.status === 'suspended' ? (
                        <button disabled={acting} onClick={() => setStatus(detail.tenant.id, 'active')} className="btn-primary text-xs py-1.5 px-3">
                          Reactivate school
                        </button>
                      ) : (
                        <button disabled={acting} onClick={() => setStatus(detail.tenant.id, 'suspended')} className="btn-ghost text-xs py-1.5 px-3 text-red-500">
                          Suspend school
                        </button>
                      )}
                    </div>

                    {/* Subscription tier */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-theme-muted">Subscription</span>
                      <select
                        value={detail.tenant.subscription_tier || 'free'}
                        disabled={acting}
                        onChange={e => setTier(detail.tenant.id, e.target.value)}
                        className="input py-1 text-sm w-36"
                      >
                        <option value="free">Free / Trial</option>
                        <option value="primary">Primary</option>
                        <option value="senior">Senior</option>
                      </select>
                    </div>

                    <p className="text-[11px] text-theme-muted">
                      Suspending blocks all of this school's users from logging in until reactivated. Changing the tier updates their plan immediately.
                    </p>

                    {/* Danger zone: permanent delete */}
                    <div className="mt-4 pt-4 rounded-xl border border-red-200 bg-red-50 p-3" style={{ borderTopWidth: 1 }}>
                      <div className="text-xs font-bold text-red-700 uppercase tracking-wide mb-1">Danger zone</div>
                      <p className="text-[11px] text-red-700 mb-2">Permanently delete this school and all its data. This cannot be undone.</p>
                      <button disabled={acting}
                        onClick={() => deleteSchool(detail.tenant.id, detail.tenant.name)}
                        className="text-xs py-1.5 px-3 rounded-lg bg-red-600 text-white font-medium disabled:opacity-50">
                        Delete school permanently
                      </button>
                    </div>
                  </div>
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
