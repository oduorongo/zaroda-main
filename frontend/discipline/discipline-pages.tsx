// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// MODULE 08: Discipline & Guidance — Next.js Frontend
// Pages: Discipline Dashboard · Record Incident · Incident Detail
//        Counselling · Behaviour Records · Analytics
// ============================================================

'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';

export const DisciplineAPI = {
  createIncident:    (d: any)    => apiClient.post('/api/v1/discipline/incidents', d),
  listIncidents:     (p?: any)   => apiClient.get('/api/v1/discipline/incidents', { params: p }),
  getIncident:       (id: string)=> apiClient.get(`/api/v1/discipline/incidents/${id}`),
  closeIncident:     (id: string, notes?: string) =>
    apiClient.post(`/api/v1/discipline/incidents/${id}/close`, { notes }),
  recordAction:      (d: any)    => apiClient.post('/api/v1/discipline/actions', d),
  notifyParent:      (d: any)    => apiClient.post('/api/v1/discipline/notify-parent', d),
  getLearnerHistory: (id: string)=> apiClient.get(`/api/v1/discipline/learners/${id}/history`),
  getBehaviourTrend: (id: string)=> apiClient.get(`/api/v1/discipline/learners/${id}/behaviour-trend`),
  createCounselling: (d: any)    => apiClient.post('/api/v1/discipline/counselling', d),
  listCounsellings:  (p?: any)   => apiClient.get('/api/v1/discipline/counselling', { params: p }),
  getAtRisk:         ()          => apiClient.get('/api/v1/discipline/counselling/at-risk'),
  recordBehaviour:   (d: any)    => apiClient.post('/api/v1/discipline/behaviour', d),
  getAnalytics:      (year: string, term?: string) =>
    apiClient.get('/api/v1/discipline/analytics', { params: { academicYear: year, term } }),
  getQasoReport:     (year: string, term: string) =>
    apiClient.get('/api/v1/discipline/analytics/qaso-report', { params: { academicYear: year, term } }),
};

const SEVERITY_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  minor:    { bg:'bg-gray-100',    text:'text-gray-700',  dot:'bg-gray-400'    },
  moderate: { bg:'bg-yellow-100',  text:'text-yellow-800',dot:'bg-yellow-500'  },
  major:    { bg:'bg-orange-100',  text:'text-orange-700',dot:'bg-orange-500'  },
  critical: { bg:'bg-red-100',     text:'text-red-700',   dot:'bg-red-600'     },
};

const STATUS_STYLES: Record<string, string> = {
  open:          'bg-blue-100 text-blue-700',
  under_review:  'bg-yellow-100 text-yellow-700',
  action_taken:  'bg-orange-100 text-orange-700',
  closed:        'bg-green-100 text-green-700',
  appealed:      'bg-purple-100 text-purple-700',
};

function SeverityBadge({ severity }: { severity: string }) {
  const s = SEVERITY_STYLES[severity] || SEVERITY_STYLES.minor;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded font-medium capitalize ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`}/>
      {severity}
    </span>
  );
}


// ─────────────────────────────────────────────────────────────
// app/dashboard/discipline/page.tsx — Main dashboard
// ─────────────────────────────────────────────────────────────
export default function DisciplineDashboard() {
  const { user }     = useAuth();
  const [tab,        setTab]        = useState<'incidents'|'counselling'|'behaviour'|'analytics'>('incidents');
  const [incidents,  setIncidents]  = useState<any[]>([]);
  const [atRisk,     setAtRisk]     = useState<any[]>([]);
  const [analytics,  setAnalytics]  = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState({ severity: '', status: '', page: 1 });

  const loadIncidents = useCallback(async () => {
    setLoading(true);
    DisciplineAPI.listIncidents({
      severity: filter.severity || undefined,
      status:   filter.status   || undefined,
      page:     filter.page,
      limit:    25,
    }).then(r => setIncidents(r.data.data)).finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { if (tab === 'incidents') loadIncidents(); }, [tab, loadIncidents]);

  useEffect(() => {
    if (tab === 'counselling') DisciplineAPI.getAtRisk().then(r => setAtRisk(r.data));
    if (tab === 'analytics')   DisciplineAPI.getAnalytics('2025/2026').then(r => setAnalytics(r.data));
  }, [tab]);

  const isAdmin = ['hoi','dhois','school_admin','tenant_owner'].includes(user?.role || '');

  const TABS = [
    { k:'incidents',   label:'📋 Incidents' },
    { k:'counselling', label:'💬 Counselling' },
    { k:'behaviour',   label:'📊 Behaviour' },
    ...(isAdmin ? [{ k:'analytics', label:'📈 Analytics' }] : []),
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Discipline & Guidance</h1>
          <p className="text-sm text-gray-500 mt-0.5">Incident recording · Counselling · Behaviour tracking · QASO reports</p>
        </div>
        <a href="/dashboard/discipline/incidents/new"
          className="px-4 py-2 bg-[#1a2e5a] text-white text-sm font-medium rounded-lg hover:bg-[#142347]">
          + Record Incident
        </a>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all
              ${tab === t.k ? 'bg-[#1a2e5a] text-white border-[#1a2e5a]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* INCIDENTS TAB */}
      {tab === 'incidents' && (
        <div>
          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4 flex gap-3 flex-wrap">
            <select value={filter.severity} onChange={e => setFilter(f => ({...f, severity: e.target.value, page: 1}))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]">
              <option value="">All Severities</option>
              {['minor','moderate','major','critical'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
              ))}
            </select>
            <select value={filter.status} onChange={e => setFilter(f => ({...f, status: e.target.value, page: 1}))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]">
              <option value="">All Statuses</option>
              {['open','under_review','action_taken','closed'].map(s => (
                <option key={s} value={s}>{s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>
              ))}
            </select>
            <button onClick={loadIncidents}
              className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
              ↻ Refresh
            </button>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400 text-sm">Loading incidents…</div>
          ) : incidents.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-gray-500 text-sm font-medium">No incidents recorded</p>
              <p className="text-gray-400 text-xs mt-1">This is a good sign!</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#f4f6fb] border-b border-gray-100">
                  <tr>
                    {['Date','Learner','Incident','Severity','Status','Reported By','Action'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {incidents.map(i => (
                    <tr key={i.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(i.incidentDate).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'})}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 text-sm">
                          {i.learner?.firstName} {i.learner?.lastName}
                        </div>
                        <div className="text-xs text-gray-400">{i.learner?.admissionNumber}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800 text-sm max-w-xs truncate">{i.title}</div>
                        <div className="text-xs text-gray-400">{i.category?.name}</div>
                      </td>
                      <td className="px-4 py-3"><SeverityBadge severity={i.severity}/></td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded capitalize ${STATUS_STYLES[i.status] || ''}`}>
                          {i.status?.replace(/_/g,' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {i.reporter?.firstName} {i.reporter?.lastName}
                      </td>
                      <td className="px-4 py-3">
                        <a href={`/dashboard/discipline/incidents/${i.id}`}
                          className="text-xs text-[#1a2e5a] hover:underline font-medium">
                          View →
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* COUNSELLING TAB */}
      {tab === 'counselling' && (
        <div className="space-y-4">
          {/* At-risk alert */}
          {atRisk.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <div className="font-semibold text-red-800">{atRisk.length} learner(s) at high/critical risk</div>
                <div className="text-xs text-red-600 mt-0.5">Require immediate attention or follow-up</div>
              </div>
              <a href="/dashboard/discipline/counselling/at-risk"
                className="ml-auto px-3 py-1.5 bg-red-700 text-white text-xs rounded-lg hover:bg-red-800">
                Review →
              </a>
            </div>
          )}

          <div className="flex justify-between items-center">
            <h2 className="font-semibold text-gray-900">Counselling Sessions</h2>
            <a href="/dashboard/discipline/counselling/new"
              className="px-4 py-2 bg-[#1a2e5a] text-white text-sm font-medium rounded-lg hover:bg-[#142347]">
              + Record Session
            </a>
          </div>

          <CounsellingList />
        </div>
      )}

      {/* BEHAVIOUR TAB */}
      {tab === 'behaviour' && <BehaviourTab />}

      {/* ANALYTICS TAB */}
      {tab === 'analytics' && isAdmin && analytics && (
        <AnalyticsDashboard analytics={analytics} />
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// Record Incident Form
// ─────────────────────────────────────────────────────────────
export function RecordIncidentPage() {
  const [form, setForm] = useState({
    learnerId: '', title: '', description: '', severity: 'minor',
    location: '', incidentDate: new Date().toISOString().split('T')[0],
    incidentTime: '', witnessedBy: '', injuriesReported: false, injuryDetails: '', notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error,   setError]   = useState('');
  const set = (k: string) => (e: any) => setForm(p => ({...p, [k]: e.target?.value ?? e}));

  const submit = async () => {
    if (!form.learnerId || !form.title || !form.description) {
      setError('Learner, title and description are required.'); return;
    }
    setLoading(true); setError('');
    try {
      await DisciplineAPI.createIncident(form);
      setSuccess(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to record incident.');
    } finally { setLoading(false); }
  };

  if (success) return (
    <div className="p-6 max-w-lg mx-auto text-center py-20">
      <div className="text-5xl mb-4">📋</div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">Incident Recorded</h2>
      <p className="text-gray-500 text-sm mb-6">The incident has been logged and is now under review.</p>
      <div className="flex gap-3 justify-center">
        <a href="/dashboard/discipline"
          className="px-5 py-2.5 bg-[#1a2e5a] text-white rounded-lg text-sm font-medium">
          Back to Dashboard
        </a>
        <button onClick={() => { setSuccess(false); setForm({ learnerId:'', title:'', description:'', severity:'minor', location:'', incidentDate:new Date().toISOString().split('T')[0], incidentTime:'', witnessedBy:'', injuriesReported:false, injuryDetails:'', notes:'' }); }}
          className="px-5 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm">
          Record Another
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Record Incident</h1>
        <p className="text-sm text-gray-500 mt-0.5">Document a disciplinary incident accurately and promptly</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-5">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
        {/* Learner */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Learner ID *</label>
          <input value={form.learnerId} onChange={set('learnerId')} placeholder="Learner UUID"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
          <p className="text-xs text-gray-400 mt-1">In production: searchable dropdown by name or admission number</p>
        </div>

        {/* Severity — colour-coded selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Severity *</label>
          <div className="grid grid-cols-4 gap-2">
            {(['minor','moderate','major','critical'] as const).map(s => {
              const styles = SEVERITY_STYLES[s];
              return (
                <button key={s} type="button" onClick={() => setForm(p => ({...p, severity: s}))}
                  className={`py-2.5 rounded-lg text-xs font-medium border-2 capitalize transition-all
                    ${form.severity === s
                      ? `${styles.bg} ${styles.text} border-current`
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                  {s}
                </button>
              );
            })}
          </div>
          {form.severity === 'critical' && (
            <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700">
              ⚠ Critical incidents are automatically flagged to the HOI and require immediate action.
            </div>
          )}
        </div>

        {/* Title + Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Incident Title *</label>
          <input value={form.title} onChange={set('title')} placeholder="Brief description of what happened"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Description *</label>
          <textarea value={form.description} onChange={set('description')} rows={4}
            placeholder="Provide a detailed, factual account of the incident…"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a] resize-none"/>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
            <input type="date" value={form.incidentDate} onChange={set('incidentDate')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time <span className="text-xs text-gray-400">optional</span></label>
            <input type="time" value={form.incidentTime} onChange={set('incidentTime')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location <span className="text-xs text-gray-400">optional</span></label>
          <input value={form.location} onChange={set('location')} placeholder="e.g. Classroom 4A, Football field, Library"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Witnesses <span className="text-xs text-gray-400">optional</span></label>
          <input value={form.witnessedBy} onChange={set('witnessedBy')} placeholder="Names of witnesses"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={form.injuriesReported}
            onChange={e => setForm(p => ({...p, injuriesReported: e.target.checked}))}
            className="w-4 h-4 accent-[#1a2e5a]"/>
          <span className="text-sm text-gray-700">Injuries were reported</span>
        </label>

        {form.injuriesReported && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Injury Details</label>
            <textarea value={form.injuryDetails} onChange={set('injuryDetails')} rows={2}
              placeholder="Describe the injuries sustained…"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a] resize-none"/>
          </div>
        )}

        <button onClick={submit} disabled={loading}
          className="w-full py-3 bg-[#1a2e5a] text-white rounded-xl text-sm font-medium hover:bg-[#142347] disabled:opacity-60">
          {loading ? 'Recording…' : '📋 Record Incident'}
        </button>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// Analytics Dashboard (HOI / Admin)
// ─────────────────────────────────────────────────────────────
function AnalyticsDashboard({ analytics }: { analytics: any }) {
  const fmt = (n: any) => Number(n || 0);

  const SEVERITY_COLORS: Record<string, string> = {
    minor:    'bg-gray-200',
    moderate: 'bg-yellow-400',
    major:    'bg-orange-500',
    critical: 'bg-red-600',
  };

  return (
    <div className="space-y-5">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:'Total Incidents',       value: analytics.summary?.totalIncidents || 0,                    color:'text-[#1a2e5a]' },
          { label:'Counselling Sessions',  value: analytics.summary?.counsellingSessions?.total_sessions || 0, color:'text-blue-700' },
          { label:'High/Critical Risk',    value: (fmt(analytics.summary?.counsellingSessions?.high_risk) + fmt(analytics.summary?.counsellingSessions?.critical_risk)), color:'text-red-600' },
          { label:'Repeat Offenders',      value: analytics.repeatOffenders?.length || 0,                    color:'text-orange-600' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className={`text-3xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-xs text-gray-500 mt-1">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Severity breakdown */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Incidents by Severity</h3>
          <div className="space-y-3">
            {analytics.summary?.bySeverity?.map((s: any) => {
              const total = analytics.summary?.totalIncidents || 1;
              const pct   = Math.round((parseInt(s.count) / total) * 100);
              return (
                <div key={s.severity}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize font-medium text-gray-700">{s.severity}</span>
                    <span className="text-gray-500">{s.count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${SEVERITY_COLORS[s.severity]}`} style={{ width: `${pct}%` }}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top categories */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Top Incident Categories</h3>
          <div className="space-y-2">
            {analytics.topCategories?.slice(0,8).map((c: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-700">{c.category}</span>
                <span className="text-sm font-bold text-[#1a2e5a] bg-[#f4f6fb] px-2 py-0.5 rounded">{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Repeat offenders */}
      {analytics.repeatOffenders?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">
            Repeat Offenders
            <span className="ml-2 text-xs font-normal text-gray-400">(3+ incidents — require targeted intervention)</span>
          </h3>
          <table className="w-full text-sm">
            <thead className="bg-[#f4f6fb]">
              <tr>
                {['Learner','Stream','Incidents','Last Incident','Severities'].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {analytics.repeatOffenders.map((r: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 font-medium text-gray-900">{r.first_name} {r.last_name}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs">{r.stream}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-bold text-red-600">{r.incident_count}</span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs">
                    {new Date(r.last_incident).toLocaleDateString('en-KE')}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 capitalize">{r.severities}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* QASO report button */}
      <div className="bg-[#f4f6fb] border border-[#1a2e5a]/10 rounded-xl p-4 flex items-center justify-between">
        <div>
          <div className="font-semibold text-gray-900 text-sm">QASO Report</div>
          <div className="text-xs text-gray-500 mt-0.5">Download report formatted for Sub-County Quality Assurance Officer</div>
        </div>
        <button
          onClick={() => DisciplineAPI.getQasoReport('2025/2026','term_1').then(r => {
            const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url; a.download = 'qaso-report.json'; a.click();
          })}
          className="px-4 py-2 bg-[#1a2e5a] text-white text-sm font-medium rounded-lg hover:bg-[#142347]">
          ↓ Download QASO Report
        </button>
      </div>
    </div>
  );
}

// Placeholder components for counselling list and behaviour tab
function CounsellingList() {
  const [sessions, setSessions] = useState<any[]>([]);
  useEffect(() => {
    DisciplineAPI.listCounsellings().then(r => setSessions(r.data)).catch(() => {});
  }, []);

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {sessions.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">No counselling sessions recorded yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-[#f4f6fb] border-b border-gray-100">
            <tr>
              {['Date','Learner','Type','Issues','Risk','Outcome'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sessions.map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(s.sessionDate).toLocaleDateString('en-KE')}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{s.learner?.firstName} {s.learner?.lastName}</td>
                <td className="px-4 py-3 text-xs capitalize text-gray-600">{s.sessionType?.replace(/_/g,' ')}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{s.issuesAddressed?.join(', ') || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded capitalize
                    ${s.riskLevel === 'critical' ? 'bg-red-100 text-red-700' :
                      s.riskLevel === 'high'     ? 'bg-orange-100 text-orange-700' :
                      s.riskLevel === 'medium'   ? 'bg-yellow-100 text-yellow-700' :
                                                   'bg-green-100 text-green-700'}`}>
                    {s.riskLevel}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 capitalize">{s.outcome?.replace(/_/g,' ') || 'Ongoing'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BehaviourTab() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
      <div className="text-4xl mb-3">📊</div>
      <h3 className="font-semibold text-gray-900 mb-2">Behaviour Records</h3>
      <p className="text-sm text-gray-500 mb-5 max-w-sm mx-auto">
        Record CBC-aligned behaviour assessments per learner per term. 
        Competencies: Social Skills · Self-Management · Responsibility · Respect · Punctuality · Participation.
      </p>
      <a href="/dashboard/discipline/behaviour/new"
        className="inline-block px-5 py-2.5 bg-[#1a2e5a] text-white rounded-lg text-sm font-medium hover:bg-[#142347]">
        + Record Behaviour Assessment
      </a>
    </div>
  );
}
