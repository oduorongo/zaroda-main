// ============================================================
// ZARODA SPORTS BASE — RESULT RECORDING + ROUTING
// For match officials / tournament admins at the venue
// ============================================================

'use client';
import { useState, useEffect } from 'react';
import { SportsBaseAPI } from './sports-base-pages';

const NAVY   = '#1a2e5a';
const GOLD   = '#d4af37';
const ORANGE = '#f5820a';

// ══════════════════════════════════════════════════════════════
// MATCH RESULT RECORDING — Team sports
// ══════════════════════════════════════════════════════════════
export function RecordMatchResultForm({
  fixtureId, homeSchool, awaySchool, onSaved,
}: {
  fixtureId:  string;
  homeSchool: string;
  awaySchool: string;
  onSaved?:   () => void;
}) {
  const [form, setForm] = useState({
    homeScore: '', awayScore: '', isDraw: false,
    halfTimeScore: '', extraTime: false, penalties: false,
    referee: '', attendance: '', matchNotes: '',
    scorers: [] as { name: string; time: string; team: string; type: string }[],
  });
  const [loading, setLoading] = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  const homeGoals = parseInt(form.homeScore) || 0;
  const awayGoals = parseInt(form.awayScore) || 0;
  const winner    = form.isDraw ? null : homeGoals > awayGoals ? homeSchool : awaySchool;

  const addScorer = () => {
    setForm(p => ({ ...p, scorers: [...p.scorers, { name:'', time:'', team: homeSchool, type:'goal' }] }));
  };

  const submit = async () => {
    if (form.homeScore === '' || form.awayScore === '') {
      setError('Both scores are required.'); return;
    }
    setLoading(true); setError('');
    try {
      await SportsBaseAPI.recordMatchResult(fixtureId, {
        homeScore:     homeGoals,
        awayScore:     awayGoals,
        isDraw:        form.isDraw,
        winnerSchoolName: winner || undefined,
        halfTimeScore: form.halfTimeScore || undefined,
        extraTime:     form.extraTime,
        penalties:     form.penalties,
        referee:       form.referee || undefined,
        attendance:    form.attendance ? parseInt(form.attendance) : undefined,
        matchNotes:    form.matchNotes || undefined,
        scorers:       form.scorers.filter(s => s.name),
      });
      setSaved(true);
      onSaved?.();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to record result.');
    } finally { setLoading(false); }
  };

  if (saved) return (
    <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}
      className="rounded-2xl p-8 text-center">
      <div className="text-4xl mb-3">✅</div>
      <div className="font-bold text-green-400">Result recorded</div>
      <div className="text-sm text-green-400/70 mt-1">
        {homeSchool} {homeGoals} — {awayGoals} {awaySchool}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="text-sm font-semibold text-white mb-1">
        {homeSchool} vs {awaySchool}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl text-xs text-red-300"
          style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)' }}>
          {error}
        </div>
      )}

      {/* Score input */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="text-xs text-white/40 mb-1.5 text-center">{homeSchool}</div>
          <input type="number" min="0" value={form.homeScore}
            onChange={e => setForm(p => ({...p, homeScore: e.target.value}))}
            className="w-full text-center text-3xl font-black text-white rounded-xl py-4 outline-none"
            style={{ background:'rgba(255,255,255,0.07)', border:`2px solid ${GOLD}25` }}
            placeholder="0"/>
        </div>
        <div className="text-white/30 font-bold text-xl flex-shrink-0">—</div>
        <div className="flex-1">
          <div className="text-xs text-white/40 mb-1.5 text-center">{awaySchool}</div>
          <input type="number" min="0" value={form.awayScore}
            onChange={e => setForm(p => ({...p, awayScore: e.target.value}))}
            className="w-full text-center text-3xl font-black text-white rounded-xl py-4 outline-none"
            style={{ background:'rgba(255,255,255,0.07)', border:`2px solid ${GOLD}25` }}
            placeholder="0"/>
        </div>
      </div>

      {/* Winner preview */}
      {(form.homeScore !== '' && form.awayScore !== '') && (
        <div className="text-center text-xs py-2 rounded-lg"
          style={{ background:'rgba(212,175,55,0.08)', color: GOLD }}>
          {form.isDraw ? '🤝 Draw' : `🏆 Winner: ${winner}`}
        </div>
      )}

      {/* Options row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { key:'isDraw',     label:'Draw',       type:'bool' },
          { key:'extraTime',  label:'Extra Time', type:'bool' },
          { key:'penalties',  label:'Penalties',  type:'bool' },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={(form as any)[key]}
              onChange={e => setForm(p => ({...p, [key]: e.target.checked}))}
              className="w-4 h-4 rounded"
              style={{ accentColor: GOLD }}/>
            <span className="text-xs text-white/50">{label}</span>
          </label>
        ))}
      </div>

      {/* Optional fields */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-white/35 block mb-1">Half-time Score</label>
          <input value={form.halfTimeScore} onChange={e => setForm(p => ({...p, halfTimeScore: e.target.value}))}
            placeholder="e.g. 1–0"
            className="w-full px-3 py-2 rounded-lg text-sm text-white/70 outline-none"
            style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}/>
        </div>
        <div>
          <label className="text-xs text-white/35 block mb-1">Attendance</label>
          <input type="number" value={form.attendance} onChange={e => setForm(p => ({...p, attendance: e.target.value}))}
            placeholder="Number of spectators"
            className="w-full px-3 py-2 rounded-lg text-sm text-white/70 outline-none"
            style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}/>
        </div>
      </div>

      <div>
        <label className="text-xs text-white/35 block mb-1">Referee</label>
        <input value={form.referee} onChange={e => setForm(p => ({...p, referee: e.target.value}))}
          placeholder="Referee name"
          className="w-full px-3 py-2 rounded-lg text-sm text-white/70 outline-none"
          style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}/>
      </div>

      {/* Scorers */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-white/35">Goal Scorers</label>
          <button onClick={addScorer} className="text-xs text-white/40 hover:text-white/60">+ Add</button>
        </div>
        {form.scorers.map((s, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input value={s.name} onChange={e => {
              const sc = [...form.scorers]; sc[i].name = e.target.value; setForm(p => ({...p, scorers: sc}));
            }} placeholder="Player name"
              className="flex-1 px-2.5 py-1.5 rounded-lg text-xs text-white/70 outline-none"
              style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}/>
            <input value={s.time} onChange={e => {
              const sc = [...form.scorers]; sc[i].time = e.target.value; setForm(p => ({...p, scorers: sc}));
            }} placeholder="Min"
              className="w-14 px-2 py-1.5 rounded-lg text-xs text-white/70 text-center outline-none"
              style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}/>
            <select value={s.team} onChange={e => {
              const sc = [...form.scorers]; sc[i].team = e.target.value; setForm(p => ({...p, scorers: sc}));
            }} className="px-2 py-1.5 rounded-lg text-xs text-white/70 outline-none"
              style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}>
              <option value={homeSchool}>{homeSchool.split(' ')[0]}</option>
              <option value={awaySchool}>{awaySchool.split(' ')[0]}</option>
            </select>
          </div>
        ))}
      </div>

      <div>
        <label className="text-xs text-white/35 block mb-1">Match Notes</label>
        <textarea value={form.matchNotes} onChange={e => setForm(p => ({...p, matchNotes: e.target.value}))}
          rows={2} placeholder="Any additional notes…"
          className="w-full px-3 py-2 rounded-lg text-sm text-white/70 outline-none resize-none"
          style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}/>
      </div>

      <button onClick={submit} disabled={loading}
        className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-60"
        style={{ background:`linear-gradient(135deg, ${NAVY}, #243f7a)`, border:`1px solid ${GOLD}30`, color: GOLD }}>
        {loading ? 'Saving…' : '✓ Record Result'}
      </button>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════
// ATHLETICS RESULT RECORDING
// ══════════════════════════════════════════════════════════════
export function RecordAthleticsResultForm({
  championshipId, eventName, bibNumber, athleteName, baseAthleteId, onSaved,
}: {
  championshipId: string;
  eventName:      string;
  bibNumber:      string;
  athleteName:    string;
  baseAthleteId:  string;
  onSaved?:       () => void;
}) {
  const [form, setForm] = useState({
    resultValue: '', resultUnit: 's', windSpeed: '',
    position: '', heatNumber: '',
    isPersonalBest: false, isChampionshipRecord: false,
    dns: false, dnf: false, dq: false, notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  // Auto-detect unit from event name
  useEffect(() => {
    const isField = /jump|throw|put|vault|discus|javelin|hammer/i.test(eventName);
    setForm(p => ({...p, resultUnit: isField ? 'm' : 's'}));
  }, [eventName]);

  const submit = async () => {
    if (!form.dns && !form.dnf && !form.dq && !form.resultValue) {
      setError('Enter a result, or mark DNS/DNF/DQ.'); return;
    }
    setLoading(true); setError('');
    try {
      await SportsBaseAPI.recordAthleticsResult({
        championshipId,
        baseAthleteId,
        eventName,
        resultValue:          form.resultValue ? parseFloat(form.resultValue) : undefined,
        resultUnit:           form.resultUnit,
        windSpeed:            form.windSpeed   ? parseFloat(form.windSpeed)   : undefined,
        position:             form.position    ? parseInt(form.position)      : undefined,
        heatNumber:           form.heatNumber  ? parseInt(form.heatNumber)    : undefined,
        isPersonalBest:       form.isPersonalBest,
        isChampionshipRecord: form.isChampionshipRecord,
        dns: form.dns, dnf: form.dnf, dq: form.dq,
        notes: form.notes || undefined,
      });
      setSaved(true);
      onSaved?.();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to record result.');
    } finally { setLoading(false); }
  };

  if (saved) return (
    <div style={{ background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.3)' }}
      className="rounded-xl p-6 text-center">
      <div className="text-3xl mb-2">✅</div>
      <div className="font-bold text-green-400 text-sm">Result saved for {athleteName}</div>
    </div>
  );

  const dnxMode = form.dns || form.dnf || form.dq;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 pb-3 border-b border-white/5">
        <span className="font-mono font-bold text-lg" style={{ color: ORANGE }}>{bibNumber}</span>
        <div>
          <div className="text-sm font-semibold text-white">{athleteName}</div>
          <div className="text-xs text-white/35">{eventName}</div>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg text-xs text-red-300"
          style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* DNS / DNF / DQ toggles */}
      <div className="flex gap-2">
        {[
          { key:'dns', label:'DNS', sub:'Did Not Start' },
          { key:'dnf', label:'DNF', sub:'Did Not Finish' },
          { key:'dq',  label:'DQ',  sub:'Disqualified' },
        ].map(({ key, label, sub }) => (
          <button key={key} onClick={() => setForm(p => ({
            ...p, dns: false, dnf: false, dq: false, [key]: !(p as any)[key],
          }))}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${(form as any)[key] ? 'text-white' : 'text-white/35 hover:text-white/55'}`}
            style={{ background:(form as any)[key]?'rgba(239,68,68,0.25)':'rgba(255,255,255,0.04)',
                     border:`1px solid ${(form as any)[key]?'rgba(239,68,68,0.4)':'rgba(255,255,255,0.08)'}` }}>
            {label}
          </button>
        ))}
      </div>

      {!dnxMode && (
        <>
          {/* Result value */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-white/35 block mb-1">Result</label>
              <input type="number" step="0.001" value={form.resultValue}
                onChange={e => setForm(p => ({...p, resultValue: e.target.value}))}
                placeholder={form.resultUnit === 's' ? 'e.g. 10.85' : 'e.g. 6.45'}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white text-center font-mono font-bold outline-none"
                style={{ background:'rgba(255,255,255,0.07)', border:`2px solid ${GOLD}20` }}/>
            </div>
            <div className="w-20">
              <label className="text-xs text-white/35 block mb-1">Unit</label>
              <select value={form.resultUnit} onChange={e => setForm(p => ({...p, resultUnit: e.target.value}))}
                className="w-full px-2 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)' }}>
                <option value="s">s (sec)</option>
                <option value="m">m (metres)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-white/35 block mb-1">Position</label>
              <input type="number" value={form.position} onChange={e => setForm(p => ({...p, position: e.target.value}))}
                placeholder="1st, 2nd…"
                className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none text-center"
                style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}/>
            </div>
            <div>
              <label className="text-xs text-white/35 block mb-1">Heat</label>
              <input type="number" value={form.heatNumber} onChange={e => setForm(p => ({...p, heatNumber: e.target.value}))}
                placeholder="Heat #"
                className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none text-center"
                style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}/>
            </div>
            <div>
              <label className="text-xs text-white/35 block mb-1">Wind (m/s)</label>
              <input type="number" step="0.1" value={form.windSpeed}
                onChange={e => setForm(p => ({...p, windSpeed: e.target.value}))}
                placeholder="e.g. +1.2"
                className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none text-center"
                style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}/>
            </div>
          </div>

          <div className="flex gap-4">
            {[
              { key:'isPersonalBest',       label:'Personal Best (PB)',        color:'#22c55e' },
              { key:'isChampionshipRecord', label:'Championship Record (CR)',   color: GOLD },
            ].map(({ key, label, color }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={(form as any)[key]}
                  onChange={e => setForm(p => ({...p, [key]: e.target.checked}))}
                  className="w-4 h-4" style={{ accentColor: color }}/>
                <span className="text-xs" style={{ color: (form as any)[key] ? color : 'rgba(255,255,255,0.35)' }}>
                  {label}
                </span>
              </label>
            ))}
          </div>
        </>
      )}

      <button onClick={submit} disabled={loading}
        className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-60"
        style={{ background:`linear-gradient(135deg, ${NAVY}, #243f7a)`, border:`1px solid ${GOLD}30`, color: GOLD }}>
        {loading ? 'Saving…' : `✓ Record ${dnxMode ? form.dns?'DNS':form.dnf?'DNF':'DQ' : 'Result'}`}
      </button>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════
// NEXT.JS APP ROUTER — Route definitions
// ══════════════════════════════════════════════════════════════

// app/sports-base/layout.tsx
export function SportsBaseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#0a0f1e', minHeight: '100vh' }}>
      {children}
    </div>
  );
}

// app/sports-base/page.tsx
export function SportsBaseHomePage() {
  // Lazy import avoids SSR issues
  const SportsBaseHome = require('./sports-base-pages').default;
  return <SportsBaseHome />;
}

// app/sports-base/championships/[id]/page.tsx
export function ChampionshipPage({ params }: { params: { id: string } }) {
  const { ChampionshipDetail } = require('./sports-base-pages');
  return <ChampionshipDetail id={params.id} />;
}

// app/sports-base/championships/[id]/live/page.tsx
export function LivePage({ params }: { params: { id: string } }) {
  const { LiveResultsDashboard } = require('./sports-base-pages');
  return <LiveResultsDashboard championshipId={params.id} />;
}

// app/sports-base/admin/create/page.tsx
export function CreateChampionshipPage() {
  const { CreateChampionshipForm } = require('./sports-base-pages');
  return (
    <div style={{ background: '#0a0f1e' }} className="min-h-screen p-6">
      <CreateChampionshipForm />
    </div>
  );
}
