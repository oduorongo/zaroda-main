// ============================================================
// ZARODA SPORTS BASE PLATFORM — Frontend
// ============================================================
'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api/client';

export const BaseAPI = {
  listChampionships:      (p?: any) => apiClient.get('/api/v1/sports/base/championships', { params: p }),
  getChampionship:        (id: string) => apiClient.get(`/api/v1/sports/base/championships/${id}`),
  getRegisteredSchools:   (id: string) => apiClient.get(`/api/v1/sports/base/championships/${id}/schools`),
  getRegisteredAthletes:  (id: string, p?: any) => apiClient.get(`/api/v1/sports/base/championships/${id}/athletes`, { params: p }),
  getStandings:           (id: string) => apiClient.get(`/api/v1/sports/base/championships/${id}/standings`),
  getFixtures:            (id: string) => apiClient.get(`/api/v1/sports/base/championships/${id}/fixtures`),
  getAthleticsLeaderboard:(id: string, event: string) => apiClient.get(`/api/v1/sports/base/championships/${id}/leaderboard`, { params: { event } }),
  recordMatchResult:      (fid: string, d: any) => apiClient.post(`/api/v1/sports/base/fixtures/${fid}/result`, d),
  recordAthleticsResult:  (d: any) => apiClient.post('/api/v1/sports/base/athletics-results', d),
};

const LEVEL_COLORS: Record<string, string> = {
  zone: '#6b7280', sub_county: '#3b82f6', county: '#f59e0b',
  regional: '#f5820a', national: '#ef4444', international: '#8b5cf6',
};
const LEVEL_LABELS: Record<string, string> = {
  zone: 'Zone', sub_county: 'Sub-County', county: 'County',
  regional: 'Regional', national: 'National', international: 'International',
};

function SportsBaseHeader({ subtitle, dark = false }: { subtitle?: string; dark?: boolean }) {
  return (
    <div className={`flex items-center gap-4 mb-6 pb-5 border-b ${dark ? 'border-white/10' : 'border-gray-100'}`}>
      <img src="/sports/zaroda-sports-logo.png" alt="ZARODA Sports"
        className="h-14 w-auto object-contain flex-shrink-0"
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}/>
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xl font-black tracking-tight ${dark ? 'text-white' : 'text-[#1a2e5a]'}`}>ZARODA SPORTS</span>
          <span className="text-[10px] font-bold text-[#f5820a] uppercase tracking-widest bg-orange-50 px-2 py-0.5 rounded">Base Platform</span>
        </div>
        <p className={`text-xs italic mt-0.5 ${dark ? 'text-white/50' : 'text-gray-400'}`}>From Registration to Champions — Seamlessly Managed</p>
        {subtitle && <p className={`text-sm mt-1 font-medium ${dark ? 'text-white/80' : 'text-gray-700'}`}>{subtitle}</p>}
      </div>
    </div>
  );
}

function LevelBadge({ level, size = 'sm' }: { level: string; size?: 'sm'|'md'|'lg' }) {
  const color = LEVEL_COLORS[level] || '#888';
  const sizes = { sm: 'text-[10px] px-2 py-0.5', md: 'text-xs px-3 py-1', lg: 'text-sm px-4 py-1.5' };
  return (
    <span className={`inline-flex items-center font-bold uppercase tracking-wide rounded-full ${sizes[size]}`}
      style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
      {LEVEL_LABELS[level] || level}
    </span>
  );
}

function LoadingSpinner() {
  return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin"/></div>;
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return <div className="text-center py-16"><div className="text-4xl mb-3">{icon}</div><p className="text-white/30 text-sm">{message}</p></div>;
}
// ─── Championships Browser ─────────────────────────────────
export default function SportsBaseHome() {
  const [championships, setChampionships] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter,  setFilter]    = useState({ level: '', academicYear: '2025/2026', search: '' });

  const load = useCallback(() => {
    setLoading(true);
    BaseAPI.listChampionships({ level: filter.level || undefined, academicYear: filter.academicYear })
      .then(r => setChampionships(r.data)).finally(() => setLoading(false));
  }, [filter.level, filter.academicYear]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter.search
    ? championships.filter(c => c.name.toLowerCase().includes(filter.search.toLowerCase()))
    : championships;

  const byLevel = ['national','regional','county','sub_county','zone'].reduce((acc: any, lvl) => {
    const items = filtered.filter(c => c.level === lvl);
    if (items.length) acc[lvl] = items;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#0f1c38]">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a2e5a] via-[#0f1c38] to-[#0a1228]"/>
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage:'repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 0,transparent 40px),repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 0,transparent 40px)' }}/>
        <div className="relative px-6 py-10 max-w-6xl mx-auto">
          <SportsBaseHeader dark/>
          <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight mb-2">
            Kenya School <span className="text-[#d4af37]">Championships</span>
          </h1>
          <p className="text-white/60 text-sm mb-6 max-w-lg">Zone to National — every school championship, one platform.</p>
          <div className="flex gap-3 flex-wrap">
            <input value={filter.search} onChange={e => setFilter(f => ({...f, search: e.target.value}))}
              placeholder="Search championships…"
              className="flex-1 min-w-[200px] px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-white text-sm placeholder:text-white/35 focus:outline-none focus:border-[#d4af37]"/>
            <select value={filter.level} onChange={e => setFilter(f => ({...f, level: e.target.value}))}
              className="px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-white text-sm focus:outline-none focus:border-[#d4af37]" style={{ colorScheme:'dark' }}>
              <option value="">All Levels</option>
              {Object.entries(LEVEL_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div className="px-6 py-8 max-w-6xl mx-auto">
        {loading ? (
          <div className="text-center py-20"><div className="w-10 h-10 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin mx-auto"/></div>
        ) : Object.keys(byLevel).length === 0 ? (
          <EmptyState icon="🏆" message="No championships found"/>
        ) : Object.entries(byLevel).map(([level, items]: [string, any]) => (
          <div key={level} className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <LevelBadge level={level} size="md"/>
              <div className="flex-1 h-px bg-white/10"/>
              <span className="text-white/30 text-xs">{(items as any[]).length} events</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(items as any[]).map(c => (
                <a key={c.id} href={`/sports-base/championships/${c.id}`}
                  className="group block bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#d4af37]/40 rounded-2xl p-5 transition-all hover:-translate-y-0.5">
                  <div className="flex items-start justify-between mb-3">
                    <LevelBadge level={c.level}/>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${c.status==='ongoing'?'bg-orange-400 animate-pulse':c.status==='registration_open'?'bg-green-400':'bg-gray-500'}`}/>
                      <span className="text-xs text-white/40 capitalize">{c.status?.replace(/_/g,' ')}</span>
                    </div>
                  </div>
                  <h3 className="font-bold text-white text-base leading-tight mb-2 group-hover:text-[#d4af37] transition-colors">{c.name}</h3>
                  <div className="space-y-1 text-xs text-white/50">
                    {c.venue && <div>📍 {c.venue}</div>}
                    {c.startDate && <div>📅 {new Date(c.startDate).toLocaleDateString('en-KE',{day:'numeric',month:'long',year:'numeric'})}</div>}
                  </div>
                  {(c.registeredSchoolsCount > 0 || c.registeredAthletesCount > 0) && (
                    <div className="flex gap-3 mt-4 pt-3 border-t border-white/10 text-xs">
                      {c.registeredSchoolsCount > 0 && <div className="text-white/50"><span className="text-white font-bold">{c.registeredSchoolsCount}</span> schools</div>}
                      {c.registeredAthletesCount > 0 && <div className="text-white/50"><span className="text-white font-bold">{c.registeredAthletesCount}</span> athletes</div>}
                    </div>
                  )}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
// ─── Championship Hub ─────────────────────────────────────
export function ChampionshipHub({ id }: { id: string }) {
  const [champ,   setChamp]   = useState<any>(null);
  const [tab,     setTab]     = useState<'overview'|'fixtures'|'results'|'athletes'|'standings'>('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    BaseAPI.getChampionship(id).then(r => setChamp(r.data)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-[#0f1c38] p-6 animate-pulse">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="h-12 bg-white/5 rounded-xl w-2/3"/>
        <div className="h-6  bg-white/5 rounded-xl w-1/3"/>
        <div className="h-10 bg-white/5 rounded-xl"/>
        <div className="h-64 bg-white/5 rounded-2xl"/>
      </div>
    </div>
  );
  if (!champ) return <div className="text-center py-20 text-gray-400">Championship not found</div>;

  const TABS = [
    {k:'overview',label:'Overview',icon:'🏠'},
    {k:'fixtures',label:'Fixtures',icon:'📅'},
    {k:'results',label:'Results',icon:'📊'},
    {k:'athletes',label:'Athletes',icon:'🏃'},
    {k:'standings',label:'Standings',icon:'🏆'},
  ];

  return (
    <div className="min-h-screen bg-[#0f1c38]">
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-[#1a2e5a] to-[#0f1c38]"/>
        <div className="relative px-6 pt-8 pb-0 max-w-5xl mx-auto">
          <SportsBaseHeader dark/>
          <div className="flex items-start gap-4 flex-wrap mb-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <LevelBadge level={champ.level} size="md"/>
                {champ.status === 'ongoing' && (
                  <span className="flex items-center gap-1.5 bg-orange-500/20 text-orange-400 border border-orange-400/30 text-xs font-bold px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse"/>LIVE
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">{champ.name}</h1>
              <div className="flex gap-4 mt-3 flex-wrap text-sm text-white/50">
                {champ.venue    && <span>📍 {champ.venue}</span>}
                {champ.startDate && <span>📅 {new Date(champ.startDate).toLocaleDateString('en-KE',{day:'numeric',month:'long',year:'numeric'})}</span>}
              </div>
            </div>
            <div className="flex gap-3">
              {[{label:'Schools',value:champ.registeredSchoolsCount||0},{label:'Athletes',value:champ.registeredAthletesCount||0}].map(k => (
                <div key={k.label} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center min-w-[72px]">
                  <div className="text-2xl font-black text-[#d4af37]">{k.value}</div>
                  <div className="text-xs text-white/40 mt-0.5">{k.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-1 border-b border-white/10 overflow-x-auto pb-0">
            {TABS.map(t => (
              <button key={t.k} onClick={() => setTab(t.k as any)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all
                  ${tab===t.k ? 'border-[#d4af37] text-[#d4af37]' : 'border-transparent text-white/50 hover:text-white/80'}`}>
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="px-6 py-6 max-w-5xl mx-auto">
        {tab==='overview'  && <OverviewTab  champ={champ}/>}
        {tab==='fixtures'  && <FixturesTab  champId={id}/>}
        {tab==='results'   && <ResultsTab   champId={id} champ={champ}/>}
        {tab==='athletes'  && <AthletesTab  champId={id}/>}
        {tab==='standings' && <StandingsTab champId={id}/>}
      </div>
    </div>
  );
}

function OverviewTab({ champ }: { champ: any }) {
  const [schools, setSchools] = useState<any[]>([]);
  useEffect(() => { BaseAPI.getRegisteredSchools(champ.id).then(r => setSchools(r.data)).catch(()=>{}); }, [champ.id]);
  return (
    <div>
      <h3 className="text-white font-bold mb-3 text-sm uppercase tracking-wider opacity-60">Participating Schools ({schools.length})</h3>
      {schools.length === 0 ? <p className="text-white/30 text-sm">No schools registered yet</p> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {schools.map((s: any) => (
            <div key={s.id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center font-black text-base flex-shrink-0 bg-[#1a2e5a] text-[#d4af37]">
                {s.schoolName?.[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">{s.schoolName}</div>
                <div className={`text-xs mt-0.5 capitalize ${s.status==='confirmed'?'text-green-400':s.status==='withdrawn'?'text-red-400':'text-white/40'}`}>{s.status}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
// ─── Fixtures Tab ─────────────────────────────────────────
function FixturesTab({ champId }: { champId: string }) {
  const [fixtures,  setFixtures]  = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [recording, setRecording] = useState<string|null>(null);
  const [result,    setResult]    = useState({ homeScore:'', awayScore:'', isDraw:false });
  const [saving,    setSaving]    = useState(false);

  const reload = () => BaseAPI.getFixtures(champId).then(r => setFixtures(r.data));
  useEffect(() => { reload().finally(() => setLoading(false)); }, [champId]);

  const saveResult = async (fid: string) => {
    setSaving(true);
    try {
      await BaseAPI.recordMatchResult(fid, { homeScore:parseFloat(result.homeScore)||0, awayScore:parseFloat(result.awayScore)||0, isDraw:result.isDraw });
      setRecording(null); setResult({ homeScore:'', awayScore:'', isDraw:false }); reload();
    } finally { setSaving(false); }
  };

  if (loading) return <LoadingSpinner/>;
  if (fixtures.length === 0) return <EmptyState icon="📅" message="No fixtures scheduled yet"/>;

  const groups = fixtures.reduce((acc: any, f) => {
    const key = f.round || f.fixtureType || 'General';
    if (!acc[key]) acc[key] = []; acc[key].push(f); return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([round, items]: [string, any]) => (
        <div key={round}>
          <h3 className="text-white/50 text-xs font-bold uppercase tracking-wider mb-3">{round}</h3>
          <div className="space-y-3">
            {items.map((f: any) => (
              <div key={f.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 text-right"><div className="font-bold text-white text-sm">{f.homeSchoolName||'Home'}</div></div>
                    <div className="flex-shrink-0 bg-[#1a2e5a] border border-white/10 rounded-xl px-5 py-2.5 text-center min-w-[90px]">
                      {f.result ? <span className="text-xl font-black text-[#d4af37]">{f.result.homeScore??'?'} — {f.result.awayScore??'?'}</span> : <span className="text-xs font-bold text-white/40 uppercase">vs</span>}
                    </div>
                    <div className="flex-1"><div className="font-bold text-white text-sm">{f.awaySchoolName||'Away'}</div></div>
                  </div>
                  {f.fixtureDate && <p className="text-xs text-center text-white/30 mt-2">{new Date(f.fixtureDate).toLocaleDateString('en-KE',{weekday:'short',day:'numeric',month:'short'})}{f.venue?` · ${f.venue}`:''}</p>}
                </div>
                {f.status === 'scheduled' && (
                  <div className="border-t border-white/10 px-4 py-2.5">
                    {recording === f.id ? (
                      <div className="space-y-2">
                        <div className="flex gap-2 items-center">
                          <input type="number" value={result.homeScore} onChange={e=>setResult(p=>({...p,homeScore:e.target.value}))} placeholder="Home" className="flex-1 px-3 py-2 bg-white/10 border border-white/15 rounded-lg text-white text-sm text-center focus:outline-none focus:border-[#d4af37]"/>
                          <span className="text-white/30">—</span>
                          <input type="number" value={result.awayScore} onChange={e=>setResult(p=>({...p,awayScore:e.target.value}))} placeholder="Away" className="flex-1 px-3 py-2 bg-white/10 border border-white/15 rounded-lg text-white text-sm text-center focus:outline-none focus:border-[#d4af37]"/>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-white/50 cursor-pointer">
                          <input type="checkbox" checked={result.isDraw} onChange={e=>setResult(p=>({...p,isDraw:e.target.checked}))} className="accent-[#d4af37]"/> Draw
                        </label>
                        <div className="flex gap-2">
                          <button onClick={()=>saveResult(f.id)} disabled={saving} className="flex-1 py-1.5 bg-[#22c55e] text-white text-xs rounded-lg font-bold hover:bg-green-600 disabled:opacity-50">{saving?'…':'✓ Save'}</button>
                          <button onClick={()=>setRecording(null)} className="px-3 py-1.5 border border-white/15 text-white/50 text-xs rounded-lg">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={()=>setRecording(f.id)} className="text-xs text-[#f5820a] hover:text-[#d4af37] font-medium transition-colors">+ Record Result</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Results Tab ──────────────────────────────────────────
function ResultsTab({ champId, champ }: { champId: string; champ: any }) {
  const EVENTS = ['100m Sprint','200m','400m','800m','1500m','4x100m Relay','4x400m Relay','Long Jump','High Jump','Triple Jump','Shot Put','Discus','Javelin'];
  const [selectedEvent, setSelectedEvent] = useState(EVENTS[0]);
  const [results, setResults]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    setLoading(true);
    BaseAPI.getAthleticsLeaderboard(champId, selectedEvent).then(r => setResults(r.data)).catch(()=>setResults([])).finally(()=>setLoading(false));
  }, [champId, selectedEvent]);

  const isTime = !['Long Jump','High Jump','Triple Jump','Shot Put','Discus','Javelin'].includes(selectedEvent);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {EVENTS.map(ev => (
          <button key={ev} onClick={()=>setSelectedEvent(ev)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${selectedEvent===ev ? 'bg-[#d4af37] text-[#0f1c38]' : 'bg-white/5 text-white/50 hover:bg-white/10 border border-white/10'}`}>
            {ev}
          </button>
        ))}
      </div>
      {loading ? <LoadingSpinner/> : (
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10 flex justify-between">
            <h3 className="font-bold text-white text-sm">{selectedEvent}</h3>
            <span className="text-white/30 text-xs">{results.length} athlete{results.length!==1?'s':''}</span>
          </div>
          {results.length === 0 ? <div className="py-10 text-center text-white/30 text-sm">No results recorded</div> : (
            <div className="divide-y divide-white/5">
              {results.map((r: any, i: number) => (
                <div key={r.id} className={`flex items-center gap-4 px-5 py-3.5 ${i===0?'bg-[#d4af37]/10':''}`}>
                  <div className="w-8 text-center flex-shrink-0">
                    {i===0?'🥇':i===1?'🥈':i===2?'🥉':<span className="text-white/30 font-bold text-sm">{i+1}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-bold text-sm truncate ${i===0?'text-[#d4af37]':'text-white'}`}>{r.baseAthlete?.firstName} {r.baseAthlete?.lastName}</div>
                    <div className="text-xs text-white/40">{r.baseAthlete?.schoolName}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`font-black text-lg ${i===0?'text-[#d4af37]':'text-white'}`}>{r.resultValue}{r.resultUnit||(isTime?'s':'m')}</div>
                    {r.isChampionshipRecord && <div className="text-[10px] text-[#f5820a] font-bold">🏆 CR</div>}
                    {r.isPersonalBest && !r.isChampionshipRecord && <div className="text-[10px] text-green-400 font-bold">⬆ PB</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
// ─── Athletes Tab ─────────────────────────────────────────
function AthletesTab({ champId }: { champId: string }) {
  const [athletes, setAthletes]    = useState<any[]>([]);
  const [loading, setLoading]      = useState(true);
  const [search, setSearch]        = useState('');
  const [filterSchool, setFilterSchool] = useState('');

  useEffect(() => { BaseAPI.getRegisteredAthletes(champId).then(r => setAthletes(r.data)).finally(()=>setLoading(false)); }, [champId]);

  const schools  = [...new Set(athletes.map(a => a.schoolName))].sort();
  const filtered = athletes.filter(a => {
    const ms = !search || `${a.firstName} ${a.lastName}`.toLowerCase().includes(search.toLowerCase());
    const msc = !filterSchool || a.schoolName === filterSchool;
    return ms && msc;
  });

  if (loading) return <LoadingSpinner/>;
  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search athletes…"
          className="flex-1 min-w-[160px] px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-white text-sm placeholder:text-white/35 focus:outline-none focus:border-[#d4af37]"/>
        <select value={filterSchool} onChange={e=>setFilterSchool(e.target.value)}
          className="px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-white text-sm focus:outline-none focus:border-[#d4af37]" style={{colorScheme:'dark'}}>
          <option value="">All Schools</option>
          {schools.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10 flex justify-between">
          <span className="text-white/50 text-xs font-bold uppercase tracking-wider">Athletes Register</span>
          <span className="text-white/30 text-xs">{filtered.length} athlete{filtered.length!==1?'s':''}</span>
        </div>
        <div className="divide-y divide-white/5">
          {filtered.length===0 ? <div className="py-10 text-center text-white/30 text-sm">No athletes found</div> :
            filtered.map((a: any) => (
              <div key={a.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/5 transition-colors">
                <div className="flex-shrink-0 w-14 text-center">
                  <span className="font-black text-xl text-[#f5820a] font-mono">{a.bibNumber||'—'}</span>
                  <div className="text-[10px] text-white/30 -mt-0.5">BIB</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white text-sm">{a.firstName} {a.lastName}</div>
                  <div className="text-xs text-white/40 mt-0.5">{a.schoolName}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs text-white/50">{a.events?.join(', ')||'—'}</div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded capitalize mt-0.5 inline-block
                    ${a.status==='competing'?'bg-orange-500/20 text-orange-400':a.status==='confirmed'?'bg-green-500/20 text-green-400':'bg-white/10 text-white/30'}`}>
                    {a.status}
                  </span>
                </div>
                <div className="text-xs text-white/30 hidden sm:block flex-shrink-0">{a.gender} · {a.gradeLevel?.replace('grade_','G')}</div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

// ─── Standings Tab ────────────────────────────────────────
function StandingsTab({ champId }: { champId: string }) {
  const [standings, setStandings] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => { BaseAPI.getStandings(champId).then(r => setStandings(r.data)).finally(()=>setLoading(false)); }, [champId]);

  if (loading) return <LoadingSpinner/>;
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      <div className="grid grid-cols-[2rem_1fr_repeat(7,auto)] gap-x-4 px-5 py-3 border-b border-white/10 text-[10px] font-bold uppercase tracking-wider text-white/30">
        <span>#</span><span>School</span>
        <span>P</span><span>W</span><span>D</span><span>L</span><span>GF</span><span>GA</span><span>Pts</span>
      </div>
      {standings.length===0 ? <div className="py-10 text-center text-white/30 text-sm">No matches played yet</div> :
        standings.map((s: any, i: number) => (
          <div key={s.id}
            className={`grid grid-cols-[2rem_1fr_repeat(7,auto)] gap-x-4 px-5 py-3.5 text-sm items-center
              ${i===0?'bg-[#d4af37]/10 border-l-2 border-[#d4af37]':i===1?'bg-white/5 border-l-2 border-white/20':i===2?'bg-white/3 border-l-2 border-white/10':'border-b border-white/5 hover:bg-white/5'}`}>
            <span className={`font-black text-sm ${i===0?'text-[#d4af37]':i===1?'text-gray-300':i===2?'text-amber-600':'text-white/30'}`}>
              {i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}
            </span>
            <span className={`font-bold truncate ${i===0?'text-[#d4af37]':'text-white'}`}>{s.schoolName}</span>
            <span className="text-white/60">{s.played}</span>
            <span className="text-green-400 font-semibold">{s.won}</span>
            <span className="text-white/40">{s.drawn}</span>
            <span className="text-red-400">{s.lost}</span>
            <span className="text-white/50">{s.goalsFor}</span>
            <span className="text-white/50">{s.goalsAgainst}</span>
            <span className={`font-black text-base ${i===0?'text-[#d4af37]':'text-white'}`}>{s.points}</span>
          </div>
        ))
      }
    </div>
  );
}

// ─── School Portal (per-school view from SMS) ─────────────
export function SchoolPortalView({ champId, tenantId }: { champId: string; tenantId: string }) {
  const [champ,    setChamp]    = useState<any>(null);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([
      BaseAPI.getChampionship(champId),
      BaseAPI.getRegisteredAthletes(champId, { tenantId }),
    ]).then(([c, a]) => { setChamp(c.data); setAthletes(a.data); }).finally(()=>setLoading(false));
  }, [champId, tenantId]);

  if (loading) return <LoadingSpinner/>;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="bg-[#1a2e5a] px-5 py-4 flex items-center gap-4">
        <img src="/sports/zaroda-sports-logo.png" alt="ZARODA Sports" className="h-10 w-auto object-contain"
          onError={e=>{ (e.target as HTMLImageElement).style.display='none'; }}/>
        <div className="flex-1 min-w-0">
          <div className="text-white font-bold text-sm truncate">{champ?.name}</div>
          <div className="flex items-center gap-2 mt-0.5">
            {champ && <LevelBadge level={champ.level}/>}
            <span className="text-white/40 text-xs">{champ?.venue}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[#d4af37] font-black text-xl">{athletes.length}</div>
          <div className="text-white/40 text-xs">your athletes</div>
        </div>
      </div>
      <div className="p-4">
        {athletes.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">No athletes registered for this championship</p>
        ) : (
          <div className="space-y-2">
            {athletes.map(a => (
              <div key={a.id} className="flex items-center gap-3 p-3 bg-[#f4f6fb] rounded-xl">
                <span className="font-mono font-black text-[#f5820a] text-lg w-10 text-center">{a.bibNumber}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 text-sm">{a.firstName} {a.lastName}</div>
                  <div className="text-xs text-gray-400">{a.events?.join(', ')||'—'}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize
                  ${a.status==='competing'?'bg-orange-100 text-orange-700':a.status==='confirmed'?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        )}
        <a href={`/sports-base/championships/${champId}`} target="_blank"
          className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 border border-[#1a2e5a] text-[#1a2e5a] rounded-xl text-sm font-medium hover:bg-[#f4f6fb]">
          View Full Championship →
        </a>
      </div>
    </div>
  );
}
