'use client';
import { useState, useEffect } from 'react';
import { Trophy, Users, Star, Send, Plus, ExternalLink, Loader2, Swords, Trash2 } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';
import { BibSheetButton } from '@/components/pdf/pdf-buttons';

export default function SportsPage() {
  const [tab,     setTab]    = useState<'teams'|'qualifications'|'base'>('teams');
  const [teams,   setTeams]  = useState<any[]>([]);
  const [quals,   setQuals]  = useState<any[]>([]);
  const [champs,  setChamps] = useState<any[]>([]);
  const [loading, setLoading]= useState(true);
  const [pushing, setPushing]= useState<string|null>(null);

  useEffect(() => {
    setLoading(true);
    const ep = tab === 'teams' ? '/sports/teams' : tab === 'qualifications' ? '/sports/qualifications' : '/sports/base/championships?status=registration_open';
    apiClient.get(ep)
      .then(r => {
        if (tab === 'teams')           setTeams(r.data);
        else if (tab === 'qualifications') setQuals(r.data);
        else setChamps(r.data);
      })
      .catch(() => toast.error('Could not load'))
      .finally(() => setLoading(false));
  }, [tab]);

  const deleteTeam = async (t: any) => {
    if (!confirm(`Delete the team "${t.name}"? This also removes its squad members.`)) return;
    try {
      await apiClient.delete(`/sports/teams/${t.id}`);
      toast.success('Team deleted');
      setTeams(prev => prev.filter(x => x.id !== t.id));
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not delete team'); }
  };

  const pushToBase = async (qualId: string, champId: string) => {
    setPushing(qualId);
    try {
      await apiClient.post('/sports/push-to-base', { qualificationRegisterId: qualId, championshipId: champId });
      toast.success('Athletes registered at ZARODA Sports Base! Bib numbers assigned.');
      setTab('qualifications');
    } catch { toast.error('Push failed'); }
    finally { setPushing(null); }
  };

  const LEVEL_COLORS: Record<string, string> = {
    zone: 'bg-gray-100 text-gray-700', sub_county:'bg-blue-100 text-blue-700',
    county:'bg-amber-100 text-amber-700', regional:'bg-orange-100 text-orange-700',
    national:'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Sports Management</h1>
          <p className="text-sm text-theme-muted">School teams · Qualifications · ZARODA Sports Base</p>
        </div>
        <div className="flex gap-2">
          <a href="/dashboard/sports/fixtures" className="btn-ghost text-sm flex items-center gap-1.5">
            <Swords size={14}/> Fixtures
          </a>
          <a href="/dashboard/sports-base" target="_blank" rel="noopener noreferrer"
            className="btn-ghost text-sm flex items-center gap-1.5">
            <Trophy size={14} className="text-[#f5820a]"/> Sports Base <ExternalLink size={12}/>
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-theme gap-1">
        {[{k:'teams',l:'🏟 Teams'},{k:'qualifications',l:'📋 Qualifications'},{k:'base',l:'🏆 Push to Base'}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${tab===t.k?'border-[#1a2e5a] text-theme-heading':'border-transparent text-theme-muted hover:text-theme-heading'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-16 shimmer rounded-xl"/>)}</div>
      ) : tab === 'teams' ? (
        teams.length === 0 ? (
          <div className="card p-10 text-center">
            <Trophy size={36} className="mx-auto text-[#e2e6f0] mb-2"/>
            <p className="text-theme-muted">No teams yet</p>
            <button className="btn-primary mt-4"><Plus size={14}/> Create Team</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {teams.map((t: any) => (
              <div key={t.id} className="card p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-[#1a2e5a] flex items-center justify-center">
                    <Trophy size={18} className="text-[#d4af37]"/>
                  </div>
                  <div>
                    <div className="font-bold text-theme-heading text-sm">{t.name}</div>
                    <div className="text-xs text-theme-muted">{t.discipline}</div>
                  </div>
                  <button onClick={() => deleteTeam(t)} title="Delete team"
                    className="ml-auto text-theme-muted hover:text-red-600 p-1"><Trash2 size={15}/></button>
                </div>
                <div className="flex items-center gap-2 text-xs text-theme-muted">
                  <Users size={12}/> {t.athletesCount || 0} athletes
                  {t.avgTalentScore && (
                    <span className="ml-auto flex items-center gap-0.5">
                      <Star size={12} className="text-[#d4af37]"/>
                      {t.avgTalentScore.toFixed(1)}/10
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === 'qualifications' ? (
        quals.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="text-theme-muted">No qualification registers yet</p>
            <button className="btn-primary mt-4"><Plus size={14}/> Create Register</button>
          </div>
        ) : (
          <div className="space-y-3">
            {quals.map((q: any) => (
              <div key={q.id} className="card p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-bold text-theme-heading">{q.name || q.discipline}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`badge ${LEVEL_COLORS[q.targetLevel] || 'bg-gray-100 text-gray-600'}`}>
                        {q.targetLevel?.replace('_',' ')}
                      </span>
                      <span className="text-xs text-theme-muted">{q.athletesCount || 0} athletes</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {q.baseChampionshipId && (
                      <BibSheetButton championshipId={q.baseChampionshipId} champName={q.name}/>
                    )}
                    <span className={`badge ${q.status==='registered' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {q.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Push to Base tab */
        champs.length === 0 ? (
          <div className="card p-10 text-center text-theme-muted">
            <p>No Base championships currently open for registration</p>
            <a href="/dashboard/sports-base" target="_blank" className="text-[#f5820a] text-sm hover:underline mt-2 inline-block">
              Browse ZARODA Sports Base →
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-theme-muted">Select a championship to push your qualified athletes to ZARODA Sports Base. Bib numbers are assigned automatically — free.</p>
            {champs.map((c: any) => (
              <div key={c.id} className="card p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-bold text-theme-heading">{c.name}</div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-theme-muted">
                      <span className={`badge ${LEVEL_COLORS[c.level] || 'bg-gray-100 text-gray-600'}`}>{c.level}</span>
                      <span>📍 {c.venue}</span>
                      <span>📅 {c.startDate ? new Date(c.startDate).toLocaleDateString('en-KE') : '—'}</span>
                    </div>
                  </div>
                  <button
                    disabled={pushing === c.id}
                    onClick={() => {
                      const q = quals[0]; // In production: show a picker to choose which qualification register
                      if (!q) { toast.error('Create a qualification register first'); return; }
                      pushToBase(q.id, c.id);
                    }}
                    className="btn-primary text-sm">
                    {pushing === c.id ? <><Loader2 size={14} className="animate-spin"/> Pushing…</> : <><Send size={14}/> Push Athletes</>}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
