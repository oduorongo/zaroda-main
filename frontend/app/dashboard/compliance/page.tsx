// ── Data Protection page ──────────────────────────────────────
// app/dashboard/compliance/page.tsx
//
// Two things a school needs to show an ODPC inspector: who has been looking at
// learners' personal data, and that data is not kept forever.
'use client';
import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Eye, Clock, Loader2, RefreshCw, Lock } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

const CATEGORY_LABELS: Record<string, string> = {
  alumni_learners:  'Former learners (personal details)',
  attendance:       'Attendance records',
  audit_logs:       'Access & activity logs',
  academic_results: 'Academic results',
  financial_records:'Financial records',
};

const ACTION_LABELS: Record<string, string> = {
  'learner.viewed':   'Viewed learner records',
  'learner.exported': 'Exported learner records',
};

function CompliancePage() {
  const [tab, setTab] = useState<'trail' | 'retention'>('trail');

  // ── Access trail ──
  const [trail, setTrail]   = useState<any[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ from: '', to: '' });

  const loadTrail = useCallback(() => {
    setLoading(true);
    apiClient.get('/compliance/access-trail', { params: { page, limit: 50, ...filters } })
      .then(r => { setTrail(r.data?.data || []); setTotal(r.data?.total || 0); })
      .catch(() => toast.error('Could not load the access trail'))
      .finally(() => setLoading(false));
  }, [page, filters]);

  useEffect(() => { if (tab === 'trail') loadTrail(); }, [tab, loadTrail]);

  // ── Retention ──
  const [policies, setPolicies] = useState<any[]>([]);
  const [purging, setPurging]   = useState(false);

  const loadPolicies = useCallback(() => {
    apiClient.get('/compliance/retention')
      .then(r => setPolicies(r.data || []))
      .catch(() => toast.error('Could not load retention settings'));
  }, []);

  useEffect(() => { if (tab === 'retention') loadPolicies(); }, [tab, loadPolicies]);

  const savePolicy = async (category: string, months: number) => {
    try {
      await apiClient.patch('/compliance/retention', { category, retentionMonths: months });
      toast.success('Retention period updated');
      loadPolicies();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not update that period');
    }
  };

  const runPurge = async () => {
    if (!confirm('Apply retention now? Former learners past their retention period will have their personal details permanently anonymised. Academic results are kept.')) return;
    setPurging(true);
    try {
      const r = await apiClient.post('/compliance/retention/run');
      const n = (r.data?.applied || []).reduce((s: number, a: any) => s + (a.count || 0), 0);
      toast.success(n ? `Retention applied to ${n} record(s)` : 'Nothing was past its retention period');
      loadPolicies();
    } catch { toast.error('Could not apply retention'); }
    finally { setPurging(false); }
  };

  const pages = Math.ceil(total / 50);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-theme-heading flex items-center gap-2">
          <ShieldCheck size={20}/> Data Protection
        </h1>
        <p className="text-sm text-theme-muted">
          Your obligations as a data controller under the Data Protection Act 2019
        </p>
      </div>

      <div className="flex gap-1 border-b border-theme">
        {([['trail', 'Access Trail', Eye], ['retention', 'Retention', Clock]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-semibold flex items-center gap-2 border-b-2 -mb-px ${
              tab === k ? 'border-[#d4af37] text-theme-heading' : 'border-transparent text-theme-muted'
            }`}>
            <Icon size={15}/> {label}
          </button>
        ))}
      </div>

      {tab === 'trail' && (
        <div className="space-y-3">
          <p className="text-xs text-theme-muted">
            Every time a staff member opens a learner&apos;s record, it is logged here. This is what
            answers &quot;who saw this child&apos;s data?&quot; if a parent or the ODPC asks.
          </p>

          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="label">From</label>
              <input type="date" value={filters.from} className="input"
                onChange={e => { setPage(1); setFilters(f => ({ ...f, from: e.target.value })); }}/>
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" value={filters.to} className="input"
                onChange={e => { setPage(1); setFilters(f => ({ ...f, to: e.target.value })); }}/>
            </div>
            <button onClick={loadTrail} className="btn-ghost"><RefreshCw size={14}/> Refresh</button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-theme">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-2 text-theme-muted">
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">Who</th>
                  <th className="px-3 py-2 text-left">Did what</th>
                  <th className="px-3 py-2 text-left">Whose record</th>
                  <th className="px-3 py-2 text-right">Records</th>
                  <th className="px-3 py-2 text-left">IP</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-theme-muted">
                    <Loader2 size={16} className="animate-spin inline"/> Loading…
                  </td></tr>
                ) : trail.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-theme-muted">
                    No access recorded for this period.
                  </td></tr>
                ) : trail.map(r => (
                  <tr key={r.id} className="border-t border-theme">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    <td className="px-3 py-2">
                      {r.actorFirstName ? `${r.actorFirstName} ${r.actorLastName}` : 'Unknown'}
                      <span className="text-theme-muted capitalize"> · {(r.actorRole || '').replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-3 py-2">{ACTION_LABELS[r.action] || r.action}</td>
                    <td className="px-3 py-2">
                      {r.learnerFirstName
                        ? `${r.learnerFirstName} ${r.learnerLastName} (${r.learnerAdmissionNumber || '—'})`
                        : <span className="text-theme-muted">Class / list view</span>}
                    </td>
                    <td className="px-3 py-2 text-right">{r.recordCount ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-theme-muted">{r.ipAddress || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-theme-muted">{total} entries</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-ghost disabled:opacity-40">Previous</button>
                <span className="px-2 py-1.5">Page {page} of {pages}</span>
                <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="btn-ghost disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'retention' && (
        <div className="space-y-3">
          <p className="text-xs text-theme-muted">
            Personal data may not be kept indefinitely. When a period runs out, former learners&apos;
            names, birth certificate numbers, guardian contacts and health notes are permanently
            anonymised — their academic results are kept, because a school is required to retain those.
          </p>

          <div className="overflow-x-auto rounded-xl border border-theme">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-2 text-theme-muted">
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-left">Keep for</th>
                  <th className="px-3 py-2 text-left">Last applied</th>
                </tr>
              </thead>
              <tbody>
                {policies.map(p => (
                  <tr key={p.category} className="border-t border-theme">
                    <td className="px-3 py-2">{CATEGORY_LABELS[p.category] || p.category}</td>
                    <td className="px-3 py-2">
                      {p.isStatutory ? (
                        <span className="flex items-center gap-1.5 text-theme-muted">
                          <Lock size={12}/>
                          {p.retentionMonths ? `${p.retentionMonths / 12} years — required by law` : 'Kept permanently — required by law'}
                        </span>
                      ) : (
                        <select defaultValue={p.retentionMonths} className="input py-1"
                          onChange={e => savePolicy(p.category, Number(e.target.value))}>
                          {[12, 24, 36, 60, 84, 120].map(m => (
                            <option key={m} value={m}>{m / 12} years</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-2 text-theme-muted">
                      {p.lastPurgedAt
                        ? `${new Date(p.lastPurgedAt).toLocaleDateString('en-KE', { dateStyle: 'medium' })} · ${p.lastPurgedCount ?? 0} record(s)`
                        : 'Not yet applied'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={runPurge} disabled={purging} className="btn-primary">
              {purging ? <><Loader2 size={14} className="animate-spin"/> Applying…</> : <>Apply retention now</>}
            </button>
            <span className="text-xs text-theme-muted">Runs automatically every Sunday at 2am.</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default CompliancePage;
