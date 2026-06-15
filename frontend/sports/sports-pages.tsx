// ============================================================
// ZARODA SPORTS MANAGEMENT SYSTEM — TWO-TIER FRONTEND
// MODULE 07: Sports Frontend
// Pages: School Sports Dashboard · Qualification Register
//        Push to Base · Base Championships Browser
//        Bib Sheet · Live Results
// ============================================================

'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api/client';

export const SportsAPI = {
  // Tier 1 — School
  getDashboard:        ()            => apiClient.get('/api/v1/sports/dashboard'),
  createTeam:          (d: any)      => apiClient.post('/api/v1/sports/teams', d),
  getSquad:            (id: string)  => apiClient.get(`/api/v1/sports/teams/${id}/squad`),
  addMember:           (id: string, d: any) => apiClient.post(`/api/v1/sports/teams/${id}/members`, d),
  createCompetition:   (d: any)      => apiClient.post('/api/v1/sports/competitions', d),
  createQualification: (d: any)      => apiClient.post('/api/v1/sports/qualifications', d),
  addQualifiedAthlete: (id: string, d: any) => apiClient.post(`/api/v1/sports/qualifications/${id}/athletes`, d),
  getQualifications:   (p?: any)     => apiClient.get('/api/v1/sports/qualifications', { params: p }),
  generateTalentReport:(id: string, year: string, term: string) =>
    apiClient.post(`/api/v1/sports/talent/report/${id}`, {}, { params: { academicYear: year, term } }),

  // PUSH — the school→base pipeline
  pushToBase: (qualId: string, baseChampionshipId: string) =>
    apiClient.post(`/api/v1/sports/qualifications/${qualId}/push-to-base`, { baseChampionshipId }),

  // Tier 2 — Base
  listBaseChampionships:   (p?: any)       => apiClient.get('/api/v1/sports/base/championships', { params: p }),
  getRegisteredSchools:    (id: string)    => apiClient.get(`/api/v1/sports/base/championships/${id}/schools`),
  getRegisteredAthletes:   (id: string)    => apiClient.get(`/api/v1/sports/base/championships/${id}/athletes`),
  getBaseStandings:        (id: string)    => apiClient.get(`/api/v1/sports/base/championships/${id}/standings`),
  getAthleticsLeaderboard: (id: string, event: string) =>
    apiClient.get(`/api/v1/sports/base/championships/${id}/leaderboard`, { params: { event } }),
  getBibSheet:             (champId: string, schoolId?: string) =>
    apiClient.get(`/api/v1/sports/base/championships/${champId}/bib-sheet`, { params: { schoolId } }),
};

// Brand constants
const SPORTS_NAVY  = '#1a2e5a';
const SPORTS_GOLD  = '#d4af37';
const SPORTS_ORANGE= '#f5820a';

const LEVEL_COLORS: Record<string, string> = {
  zone:          'bg-gray-100 text-gray-700',
  sub_county:    'bg-blue-100 text-blue-700',
  county:        'bg-yellow-100 text-yellow-800',
  regional:      'bg-orange-100 text-orange-700',
  national:      'bg-red-100 text-red-700',
  international: 'bg-purple-100 text-purple-700',
};

function SportsLogo({ size = 48 }: { size?: number }) {
  return (
    <img
      src="/sports/zaroda-sports-logo.png"
      alt="ZARODA Sports"
      style={{ width: size, height: size, objectFit: 'contain' }}
      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// app/dashboard/sports/page.tsx — Main dashboard
// ─────────────────────────────────────────────────────────────
export default function SportsDashboard() {
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<'school'|'base'>('school');

  useEffect(() => {
    SportsAPI.getDashboard().then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ZARODA SPORTS branded header */}
      <div className="flex items-center gap-4 mb-6 pb-5 border-b border-gray-100">
        <SportsLogo size={56} />
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-[#1a2e5a]">ZARODA SPORTS</h1>
            <span className="text-xs font-bold text-[#f5820a] uppercase tracking-wide px-2 py-0.5 bg-orange-50 rounded">Management System</span>
          </div>
          <p className="text-xs text-gray-400 italic mt-0.5">From Registration to Champions — Seamlessly Managed</p>
        </div>
      </div>

      {/* Tier switcher */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('school')}
          className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all border
            ${tab === 'school' ? 'bg-[#1a2e5a] text-white border-[#1a2e5a]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
          🏫 School Sports
        </button>
        <button onClick={() => setTab('base')}
          className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all border
            ${tab === 'base' ? 'bg-[#f5820a] text-white border-[#f5820a]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
          🏆 ZARODA Sports Base
        </button>
        {data?.pendingPush > 0 && tab === 'school' && (
          <div className="ml-auto flex items-center gap-2 bg-orange-50 border border-orange-200 px-3 py-2 rounded-xl">
            <span className="w-2 h-2 bg-[#f5820a] rounded-full animate-pulse"/>
            <span className="text-xs font-medium text-orange-700">
              {data.pendingPush} team(s) qualified — ready to push to Base
            </span>
            <a href="/dashboard/sports/qualifications" className="text-xs text-[#f5820a] hover:underline font-semibold">
              Push now →
            </a>
          </div>
        )}
      </div>

      {tab === 'school' && <SchoolSportsTab data={data} loading={loading} />}
      {tab === 'base'   && <BaseSportsTab />}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// School Sports Tab
// ─────────────────────────────────────────────────────────────
function SchoolSportsTab({ data, loading }: any) {
  if (loading) return <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>;

  const QUICK_LINKS = [
    { href:'/dashboard/sports/teams/create',          icon:'👥', label:'Create Team' },
    { href:'/dashboard/sports/competitions/create',   icon:'🏟️', label:'Inter-class Competition' },
    { href:'/dashboard/sports/qualifications/create', icon:'📋', label:'Register Qualification' },
    { href:'/dashboard/sports/talent',                icon:'⭐', label:'Talent Analytics' },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:'Active Teams',       value: data?.totalTeams || 0,          color:'text-[#1a2e5a]' },
          { label:'Qualifications',     value: data?.totalQualifications || 0, color:'text-green-700' },
          { label:'Ready to Push',      value: data?.pendingPush || 0,         color:'text-[#f5820a]' },
          { label:'Top Athletes',       value: data?.topAthletes?.length || 0, color:'text-purple-700' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className={`text-3xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-xs text-gray-500 mt-1">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {QUICK_LINKS.map(l => (
          <a key={l.href} href={l.href}
            className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-100 rounded-xl hover:border-[#1a2e5a]/30 hover:bg-[#f4f6fb] transition-all text-center">
            <span className="text-2xl">{l.icon}</span>
            <span className="text-xs font-medium text-gray-700">{l.label}</span>
          </a>
        ))}
      </div>

      {/* Top athletes */}
      {data?.topAthletes?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Top Athletes — Talent Scores</h3>
          <div className="space-y-2">
            {data.topAthletes.map((a: any, i: number) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                  ${i===0?'bg-yellow-400 text-yellow-900':i===1?'bg-gray-300 text-gray-700':i===2?'bg-orange-400 text-orange-900':'bg-gray-100 text-gray-500'}`}>
                  {i+1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {a.learner?.firstName} {a.learner?.lastName}
                  </div>
                  <div className="text-xs text-gray-400">{a.primaryDiscipline?.name || 'Multi-sport'}</div>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[#f5820a]" style={{ width: `${(a.talentScore/10)*100}%` }}/>
                  </div>
                  <span className="text-sm font-bold text-[#f5820a] w-8 text-right">
                    {Number(a.talentScore||0).toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// Base Sports Tab — Browse Base championships + push teams
// ─────────────────────────────────────────────────────────────
function BaseSportsTab() {
  const [championships, setChampionships] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState({ level: '', academicYear: '2025/2026' });

  const load = useCallback(async () => {
    setLoading(true);
    SportsAPI.listBaseChampionships(filter).then(r => setChampionships(r.data)).finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {/* Base platform banner */}
      <div className="bg-[#1a2e5a] rounded-xl p-5 mb-5 flex items-center gap-4">
        <SportsLogo size={48} />
        <div className="flex-1">
          <h2 className="text-white font-bold text-lg">ZARODA Sports Base</h2>
          <p className="text-white/70 text-xs mt-0.5">Free cross-school championship platform · Zone → National · Connect & compete</p>
        </div>
        <div className="text-right">
          <div className="text-[#d4af37] font-bold text-lg">{championships.length}</div>
          <div className="text-white/60 text-xs">Open Championships</div>
          <div className="mt-1 text-xs bg-green-500 text-white px-2 py-0.5 rounded font-medium">FREE</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select value={filter.level} onChange={e => setFilter(f => ({...f, level: e.target.value}))}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]">
          <option value="">All Levels</option>
          {['zone','sub_county','county','regional','national','international'].map(l => (
            <option key={l} value={l}>{l.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>
          ))}
        </select>
        <select value={filter.academicYear} onChange={e => setFilter(f => ({...f, academicYear: e.target.value}))}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]">
          <option value="2025/2026">2025/2026</option>
          <option value="2026/2027">2026/2027</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading championships…</div>
      ) : championships.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <div className="text-4xl mb-3">🏆</div>
          <p className="text-gray-500 text-sm font-medium">No open championships</p>
          <p className="text-gray-400 text-xs mt-1">Championships are created by ZARODA Sports Base administrators</p>
        </div>
      ) : (
        <div className="space-y-3">
          {championships.map(c => (
            <ChampionshipCard key={c.id} championship={c} />
          ))}
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// Championship card with push-to-base action
// ─────────────────────────────────────────────────────────────
function ChampionshipCard({ championship: c }: { championship: any }) {
  const [showPush, setShowPush] = useState(false);
  const [qualifications, setQualifications] = useState<any[]>([]);
  const [selectedQual, setSelectedQual] = useState('');
  const [pushing,  setPushing]  = useState(false);
  const [pushed,   setPushed]   = useState<any>(null);
  const [error,    setError]    = useState('');

  const loadQuals = async () => {
    const { data } = await SportsAPI.getQualifications({
      status: 'qualified',
      competitionLevel: c.level,
    });
    setQualifications(data);
    setShowPush(true);
  };

  const doPush = async () => {
    if (!selectedQual) { setError('Select a qualification register.'); return; }
    setPushing(true); setError('');
    try {
      const { data } = await SportsAPI.pushToBase(selectedQual, c.id);
      setPushed(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Push failed.');
    } finally { setPushing(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded capitalize font-medium ${LEVEL_COLORS[c.level]}`}>
                {c.level.replace('_',' ')}
              </span>
              <span className="text-xs text-gray-400 capitalize">{c.competitionType?.replace('_',' ')}</span>
            </div>
            <h3 className="font-semibold text-gray-900">{c.name}</h3>
            <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-3">
              {c.venue      && <span>📍 {c.venue}</span>}
              {c.startDate  && <span>📅 {new Date(c.startDate).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'})}</span>}
              {c.maxTeams   && <span>👥 Max {c.maxTeams} teams</span>}
              {c.maxAthletes && <span>🏃 Max {c.maxAthletes} athletes</span>}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded">FREE</span>
          </div>
        </div>

        {c.registrationDeadline && (
          <div className="text-xs text-orange-600 font-medium mb-3">
            ⏰ Registration closes: {new Date(c.registrationDeadline).toLocaleDateString('en-KE')}
          </div>
        )}

        {/* Push result */}
        {pushed ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-2">
            <div className="font-semibold text-green-800 text-sm">✅ {pushed.message}</div>
            {pushed.athletes?.length > 0 && (
              <div className="mt-2 space-y-1">
                {pushed.athletes.map((a: any) => (
                  <div key={a.bibNumber} className="flex items-center gap-2 text-xs text-green-700">
                    <span className="font-mono font-bold bg-green-100 px-1.5 py-0.5 rounded">#{a.bibNumber}</span>
                    <span>{a.name}</span>
                    {a.events?.length > 0 && <span className="text-green-500">· {a.events.join(', ')}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex gap-2 mt-3">
            <button onClick={() => showPush ? setShowPush(false) : loadQuals()}
              className="flex-1 py-2 bg-[#1a2e5a] text-white text-sm font-medium rounded-lg hover:bg-[#142347]">
              {showPush ? 'Cancel' : '↗ Register School for this Championship'}
            </button>
            <a href={`/dashboard/sports/base/championships/${c.id}`}
              className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
              Details
            </a>
          </div>
        )}

        {/* Push form */}
        {showPush && !pushed && (
          <div className="mt-4 space-y-3 pt-3 border-t border-gray-100">
            {error && <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Select Qualification Register
              </label>
              {qualifications.length === 0 ? (
                <div className="text-xs text-gray-400 bg-gray-50 px-3 py-2 rounded-lg">
                  No qualified teams/athletes found for {c.level.replace('_',' ')} level.
                  <a href="/dashboard/sports/qualifications/create" className="ml-1 text-[#1a2e5a] hover:underline">
                    Create one →
                  </a>
                </div>
              ) : (
                <select value={selectedQual} onChange={e => setSelectedQual(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]">
                  <option value="">Select qualification…</option>
                  {qualifications.map((q: any) => (
                    <option key={q.id} value={q.id}>
                      {q.name} ({q.discipline?.name || ''} · via {q.qualifiedVia || 'Internal selection'})
                    </option>
                  ))}
                </select>
              )}
            </div>
            {selectedQual && (
              <button onClick={doPush} disabled={pushing}
                className="w-full py-2.5 bg-[#f5820a] text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-60">
                {pushing ? 'Pushing to Base…' : '🚀 Push to ZARODA Sports Base — Register & Assign Bibs'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// app/dashboard/sports/base/championships/[id]/bib-sheet/page.tsx
// Printable bib sheet
// ─────────────────────────────────────────────────────────────
export function BibSheetPage({ params }: { params: { id: string } }) {
  const [sheet,   setSheet]   = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    SportsAPI.getBibSheet(params.id).then(r => setSheet(r.data)).finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <div className="text-center py-16 text-gray-400 text-sm">Loading bib sheet…</div>;
  if (!sheet)  return <div className="text-center py-16 text-red-400 text-sm">Bib sheet not found</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Print button */}
      <div className="flex justify-end mb-4 print:hidden">
        <button onClick={() => window.print()}
          className="px-4 py-2 bg-[#1a2e5a] text-white text-sm font-medium rounded-lg hover:bg-[#142347]">
          🖨 Print Bib Sheet
        </button>
      </div>

      {/* Header */}
      <div className="bg-[#1a2e5a] rounded-t-xl p-5 flex items-center gap-4 print:rounded-none">
        <SportsLogo size={52} />
        <div className="flex-1 text-white">
          <div className="font-bold text-lg">ZARODA SPORTS MANAGEMENT SYSTEM</div>
          <div className="text-white/70 text-xs italic">From Registration to Champions — Seamlessly Managed</div>
          <div className="text-[#d4af37] font-semibold mt-1">{sheet.championship.name}</div>
        </div>
        <div className="text-right text-white">
          <div className="text-xs text-white/60">Level</div>
          <div className="font-bold capitalize">{sheet.championship.level?.replace('_',' ')}</div>
          <div className="text-xs text-white/60 mt-1">Athletes</div>
          <div className="font-bold">{sheet.totalAthletes}</div>
        </div>
      </div>

      {/* Championship details */}
      <div className="bg-[#f4f6fb] px-5 py-3 flex gap-6 text-xs text-gray-600 border-x border-[#1a2e5a]/20">
        <span>📅 {sheet.championship.startDate && new Date(sheet.championship.startDate).toLocaleDateString('en-KE',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span>
        {sheet.championship.venue && <span>📍 {sheet.championship.venue}</span>}
        <span>Academic Year: {sheet.championship.academicYear}</span>
      </div>

      {/* Bib table */}
      <div className="border border-[#1a2e5a]/20 rounded-b-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#1a2e5a] text-white">
            <tr>
              {['Bib #','First Name','Last Name','School','Gender','Grade','Events'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sheet.athletes.map((a: any, i: number) => (
              <tr key={a.bibNumber} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f9fafb]'}>
                <td className="px-4 py-2.5 font-mono font-bold text-[#f5820a] text-base">{a.bibNumber}</td>
                <td className="px-4 py-2.5 font-medium text-gray-900">{a.firstName}</td>
                <td className="px-4 py-2.5 font-medium text-gray-900">{a.lastName}</td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">{a.schoolName}</td>
                <td className="px-4 py-2.5 text-gray-500 capitalize text-xs">{a.gender}</td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">{a.gradeLevel?.replace('grade_','G') || '—'}</td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">{a.events?.join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="mt-4 text-xs text-center text-gray-400">
        Generated by <strong className="text-[#f5820a]">ZARODA SPORTS MANAGEMENT SYSTEM</strong> ·
        www.zarodasolutions.app · +254781230805 ·
        {new Date(sheet.generatedAt).toLocaleString('en-KE')}
      </div>
    </div>
  );
}
