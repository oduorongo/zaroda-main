'use client';
import { useState, useEffect } from 'react';
import {
  Building2, Users, DollarSign, TrendingUp, Search, Send,
  MapPin, Loader2, Megaphone, CheckCircle, Clock,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

export default function SuperAdminPage() {
  const { user } = useAuth();
  const [tab,     setTab]     = useState<'tenants'|'broadcast'|'analytics'>('tenants');
  const [tenants, setTenants] = useState<any[]>([]);
  const [stats,   setStats]   = useState<any>({});
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);

  // Retooling broadcast form
  const [bcast, setBcast]   = useState({ audience: 'all', title: '', message: '' });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiClient.get('/admin/tenants').catch(() => ({ data: [] })),
      apiClient.get('/admin/stats').catch(() => ({ data: {} })),
    ]).then(([t, s]) => {
      setTenants(t.data);
      setStats(s.data);
    }).finally(() => setLoading(false));
  }, []);

  const sendBroadcast = async () => {
    if (!bcast.title || !bcast.message) { toast.error('Title and message required'); return; }
    setSending(true);
    try {
      await apiClient.post('/admin/broadcast', bcast);
      toast.success(`Broadcast sent to: ${bcast.audience}`);
      setBcast({ audience: 'all', title: '', message: '' });
    } catch { toast.error('Could not send broadcast'); }
    finally { setSending(false); }
  };

  const filtered = tenants.filter(t =>
    !search || t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.county?.toLowerCase().includes(search.toLowerCase()),
  );

  const STAT_CARDS = [
    { icon: Building2,  label: 'Total Schools',   value: stats.totalTenants    ?? tenants.length, color: 'bg-[#1a2e5a]' },
    { icon: CheckCircle,label: 'Active',          value: stats.activeTenants   ?? '—', color: 'bg-green-600' },
    { icon: Clock,      label: 'On Trial',        value: stats.trialTenants    ?? '—', color: 'bg-amber-500' },
    { icon: DollarSign, label: 'MRR (KES)',       value: stats.mrr ? stats.mrr.toLocaleString('en-KE') : '—', color: 'bg-[#f5820a]' },
  ];

  return (
    <div className="min-h-screen bg-surface-2">
      {/* Top bar */}
      <header className="bg-[#0f1c38] text-white">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-[#d4af37] rounded-xl flex items-center justify-center font-black text-lg text-[#0f1c38]">Z</div>
            <div>
              <div className="font-black leading-none">ZARODA Super Admin</div>
              <div className="text-[9px] text-white/40 uppercase tracking-widest">Platform Control</div>
            </div>
          </div>
          <span className="text-xs bg-surface/10 px-3 py-1.5 rounded-lg">{user?.email}</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STAT_CARDS.map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="card p-5">
                <div className={`w-10 h-10 rounded-xl ${s.color} flex items-center justify-center mb-3`}>
                  <Icon size={20} className="text-white"/>
                </div>
                <div className="text-2xl font-black text-theme-heading">{loading ? '…' : s.value}</div>
                <div className="text-sm text-theme-muted">{s.label}</div>
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-theme gap-1">
          {[
            { k: 'tenants',   l: '🏫 Schools' },
            { k: 'broadcast', l: '📢 Retooling Broadcast' },
            { k: 'analytics', l: '📊 Marketing Pipeline' },
          ].map(t => (
            <button key={t.k} onClick={() => setTab(t.k as any)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${tab === t.k ? 'border-[#1a2e5a] text-theme-heading' : 'border-transparent text-theme-muted hover:text-theme-heading'}`}>
              {t.l}
            </button>
          ))}
        </div>

        {/* TENANTS */}
        {tab === 'tenants' && (
          <>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted"/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search schools by name or county…" className="input pl-8"/>
            </div>
            {loading ? <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 shimmer rounded-xl"/>)}</div> : (
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="table-header">
                      <th className="px-4 py-3 text-left text-xs">School</th>
                      <th className="px-4 py-3 text-left text-xs hidden sm:table-cell">County</th>
                      <th className="px-4 py-3 text-left text-xs hidden md:table-cell">Streams</th>
                      <th className="px-4 py-3 text-center text-xs">Status</th>
                      <th className="px-4 py-3 text-right text-xs hidden lg:table-cell">Trial Ends</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-10 text-center text-theme-muted">No schools registered yet</td></tr>
                    ) : filtered.map((t, i) => (
                      <tr key={t.id} className={`border-b border-theme ${i % 2 === 0 ? 'bg-surface' : 'bg-surface-2'}`}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-theme-heading text-sm">{t.name}</div>
                          <div className="text-xs text-theme-muted">{t.email || '—'}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-theme-muted hidden sm:table-cell">
                          <MapPin size={11} className="inline mr-1"/>{t.county || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-theme-muted hidden md:table-cell">{t.streamsCount ?? '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`badge ${t.status === 'active' ? 'bg-green-100 text-green-700' : t.status === 'trial' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-theme-muted hidden lg:table-cell">
                          {t.trialEndsAt ? new Date(t.trialEndsAt).toLocaleDateString('en-KE') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* RETOOLING BROADCAST (spec section 2) */}
        {tab === 'broadcast' && (
          <div className="card p-6 max-w-2xl">
            <div className="flex items-center gap-2 mb-1">
              <Megaphone size={18} className="text-theme-heading"/>
              <h2 className="font-bold text-theme-heading">Retooling — Professional Broadcast</h2>
            </div>
            <p className="text-sm text-theme-muted mb-5">Send professional information to users across all schools, segmented by audience.</p>
            <div className="space-y-4">
              <div>
                <label className="label">Audience</label>
                <select value={bcast.audience} onChange={e => setBcast(b => ({ ...b, audience: e.target.value }))} className="input">
                  <option value="all">All users</option>
                  <option value="admins">Admins only</option>
                  <option value="teachers">Teachers only</option>
                  <option value="learners">Learners only</option>
                  <option value="parents">Parents only</option>
                </select>
              </div>
              <div>
                <label className="label">Title</label>
                <input value={bcast.title} onChange={e => setBcast(b => ({ ...b, title: e.target.value }))}
                  placeholder="e.g. New CBE assessment guidelines" className="input"/>
              </div>
              <div>
                <label className="label">Message</label>
                <textarea rows={5} value={bcast.message} onChange={e => setBcast(b => ({ ...b, message: e.target.value }))}
                  placeholder="Professional information to communicate…" className="input resize-none"/>
              </div>
              <button onClick={sendBroadcast} disabled={sending} className="btn-primary">
                {sending ? <><Loader2 size={14} className="animate-spin"/> Sending…</> : <><Send size={14}/> Send Broadcast</>}
              </button>
            </div>
          </div>
        )}

        {/* MARKETING PIPELINE */}
        {tab === 'analytics' && (
          <div className="card p-6">
            <h2 className="font-bold text-theme-heading mb-4">Marketing Pipeline by Location</h2>
            <p className="text-sm text-theme-muted">Signups and conversions across all 47 counties load from <code className="bg-surface-2 px-1 rounded">/api/v1/admin/pipeline</code>. Filter by county, sub-county, and zone to track adoption.</p>
          </div>
        )}
      </div>
    </div>
  );
}
