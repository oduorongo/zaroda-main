'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trophy, Sparkles, Check, Loader2, Send, UserPlus } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

const SPORTS = ['Football','Netball','Volleyball','Handball','Rugby','Hockey','Basketball','Athletics (Track)','Athletics (Field)','Swimming','Badminton','Table Tennis','Lawn Tennis','Cross Country'];

export default function SchoolTeamPage() {
  const [sport, setSport]           = useState('Football');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [pool, setPool]             = useState<any[]>([]);
  const [squad, setSquad]           = useState<any[]>([]);
  const [status, setStatus]         = useState('draft');
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);

  const load = async (s: string) => {
    setLoading(true);
    try {
      const [sug, sq] = await Promise.all([
        apiClient.get(`/sports/school-team/suggestions?sport=${encodeURIComponent(s)}`).catch(()=>({data:{suggestions:[]}})),
        apiClient.get(`/sports/school-team?sport=${encodeURIComponent(s)}`).catch(()=>({data:[]})),
      ]);
      setSuggestions(sug.data?.suggestions || []);
      setPool(sug.data?.pool || []);
      const saved = (sq.data || [])[0];
      setSquad(saved?.members || []);
      setStatus(saved?.status || 'draft');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(sport); }, [sport]);

  const inSquad = (name: string, cls: string) => squad.some(m => m.name === name && (m.class||'') === (cls||''));
  const toggle = (m: any) => {
    setSquad(prev => inSquad(m.name, m.class)
      ? prev.filter(x => !(x.name === m.name && (x.class||'') === (m.class||'')))
      : [...prev, { name: m.name, class: m.class || '', discipline: m.discipline || sport, basis: m.source }]);
  };

  const addAll = () => {
    const merged = [...squad];
    suggestions.forEach(s => { if (!inSquad(s.name, s.class)) merged.push({ name: s.name, class: s.class||'', discipline: s.discipline||sport, basis: s.source }); });
    setSquad(merged);
  };

  const save = async (newStatus?: string) => {
    setSaving(true);
    try {
      await apiClient.post('/sports/school-team', { sport, members: squad, status: newStatus || status });
      if (newStatus) setStatus(newStatus);
      toast.success(newStatus === 'ready_for_base' ? 'School team confirmed — ready for Base' : 'School team saved');
    } catch (err:any) { toast.error(err?.response?.data?.message || 'Could not save'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/sports" className="btn-ghost p-2"><ArrowLeft size={16}/></Link>
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Form School Team</h1>
          <p className="text-sm text-theme-muted">Promote inter-class winners & top performers into the school squad</p>
        </div>
      </div>

      <div className="card p-4">
        <label className="label">Sport / Event</label>
        <select value={sport} onChange={e => setSport(e.target.value)} className="input">
          {SPORTS.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-theme-muted" size={22}/></div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Suggestions from results */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><Sparkles size={16} className="text-[#d4af37]"/><h3 className="font-bold text-theme-heading">Suggested from results</h3></div>
              {suggestions.length > 0 && <button onClick={addAll} className="text-xs text-[#1a2e5a] hover:underline">Add all</button>}
            </div>
            {suggestions.length === 0 ? (
              <p className="text-sm text-theme-muted">No completed {sport} fixtures or races yet. Record some results first, and the top performers will appear here to promote.</p>
            ) : (
              <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
                {suggestions.map((s, i) => {
                  const picked = inSquad(s.name, s.class);
                  return (
                    <button key={i} onClick={() => toggle(s)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-2 border ${picked?'border-[#1a2e5a] bg-[#1a2e5a]/5':'border-theme hover:bg-surface-2'}`}>
                      <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${picked?'bg-[#1a2e5a] text-white border-[#1a2e5a]':'border-theme'}`}>{picked?'✓':''}</span>
                      <span className="font-medium text-theme-heading">{s.name}</span>
                      <span className="text-theme-muted text-xs">{s.class}</span>
                      <span className="ml-auto text-[10px] text-theme-muted">
                        {s.bestPosition ? `Pos ${s.bestPosition}` : s.source === 'match' ? 'Winner' : ''} · {s.points}pts
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {pool.length > 0 && (
              <div className="mt-4 pt-4 border-t border-theme/40">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-theme-muted uppercase">All {sport} team players</h4>
                  <button onClick={() => { const merged=[...squad]; pool.forEach((p:any)=>{ if(!inSquad(p.name,p.class)) merged.push({name:p.name,class:p.class||'',discipline:sport,basis:'team-pool'}); }); setSquad(merged); }} className="text-xs text-[#1a2e5a] hover:underline">Add all</button>
                </div>
                <div className="space-y-1.5 max-h-[30vh] overflow-y-auto">
                  {pool.map((p:any, i:number) => {
                    const picked = inSquad(p.name, p.class);
                    return (
                      <button key={`pool-${i}`} onClick={() => toggle(p)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-2 border ${picked?'border-[#1a2e5a] bg-[#1a2e5a]/5':'border-theme hover:bg-surface-2'}`}>
                        <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${picked?'bg-[#1a2e5a] text-white border-[#1a2e5a]':'border-theme'}`}>{picked?'✓':''}</span>
                        <span className="font-medium text-theme-heading">{p.name}</span>
                        <span className="text-theme-muted text-xs">{p.class}</span>
                        <span className="ml-auto text-[10px] text-theme-muted">{p.team}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* The school squad */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><Trophy size={16} className="text-[#1a2e5a]"/><h3 className="font-bold text-theme-heading">School squad ({squad.length})</h3></div>
              {status === 'ready_for_base' && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Ready for Base</span>}
            </div>
            {squad.length === 0 ? (
              <p className="text-sm text-theme-muted">No one added yet. Tick performers from the suggestions, or use “Add all”.</p>
            ) : (
              <div className="space-y-1.5 max-h-[48vh] overflow-y-auto">
                {squad.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm border-b border-theme/30">
                    <span className="w-5 text-theme-muted">{i+1}.</span>
                    <span className="font-medium text-theme-heading">{m.name}</span>
                    <span className="text-theme-muted text-xs">{m.class}</span>
                    <button onClick={() => toggle(m)} className="ml-auto text-theme-muted hover:text-red-600" title="Remove">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-2 mt-4">
              <button onClick={() => save()} disabled={saving} className="btn-ghost justify-center text-sm">
                {saving ? <Loader2 size={14} className="animate-spin"/> : <Check size={14}/>} Save draft
              </button>
              <button onClick={() => save('ready_for_base')} disabled={saving || squad.length===0} className="btn-primary justify-center text-sm">
                <Send size={14}/> Confirm & mark ready for Base
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-[11px] text-theme-muted">Tip: suggestions are ranked by merit — race winners and top-3 finishers, plus players from winning teams. You can also add or remove anyone manually. Once confirmed, the squad is marked ready to hand off to the ZARODA Sports Base.</p>
    </div>
  );
}
