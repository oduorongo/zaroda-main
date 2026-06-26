'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
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
  const [showNew, setShowNew]= useState(false);
  const [saving,  setSaving] = useState(false);
  const [streams, setStreams]= useState<any[]>([]);
  const [pickStream, setPickStream] = useState('');
  const [streamLearners, setStreamLearners] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ name:'', sport:'Football', ageCategory:'Under 15', gender:'Mixed', coach:'', athletes:[] as any[] });
  const [editId, setEditId] = useState<string|null>(null);
  const [viewTeam, setViewTeam] = useState<any>(null);

  const openView = (t: any) => setViewTeam(t);

  const openEdit = (t: any) => {
    setEditId(t.id);
    let athletes: any[] = [];
    if (Array.isArray(t.athletes)) athletes = t.athletes;
    else if (typeof t.athletes === 'string') { try { athletes = JSON.parse(t.athletes); } catch { athletes = []; } }
    setForm({
      name: t.name || '', sport: t.sport || 'Football', ageCategory: t.ageCategory || 'Under 15',
      gender: t.gender || 'Mixed', coach: t.coach || '',
      athletes: Array.isArray(athletes) ? athletes : [],
    });
    setPickStream(''); setStreamLearners([]);
    setShowNew(true);
  };

  const SPORTS = ['Football','Netball','Volleyball','Handball','Rugby','Hockey','Basketball','Athletics (Track)','Athletics (Field)','Swimming','Badminton','Table Tennis','Lawn Tennis'];
  const AGE_CATS = ['Under 11','Under 13','Under 15','Under 17','Under 19','Open'];

  // Ball/court games field "players"; track, field & swimming field "athletes".
  const memberNoun = (sport?: string) => {
    const s = (sport || '').toLowerCase();
    if (s.includes('athletics') || s.includes('swimming') || s.includes('cross country')) return 'athletes';
    return 'players';
  };
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

  const loadTeams = () => {
    apiClient.get('/sports/teams').then(r => setTeams(r.data)).catch(() => {});
  };

  useEffect(() => {
    apiClient.get('/academic/streams').then(r => setStreams(r.data || [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (!pickStream) { setStreamLearners([]); return; }
    apiClient.get(`/academic/streams/${pickStream}/learners`).then(r => setStreamLearners(r.data || [])).catch(() => setStreamLearners([]));
  }, [pickStream]);

  const setF = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }));

  const toggleAthlete = (l: any) => {
    setForm((f: any) => {
      const exists = f.athletes.find((a: any) => a.id === l.id);
      const athletes = exists ? f.athletes.filter((a: any) => a.id !== l.id)
        : [...f.athletes, { id: l.id, name: `${l.firstName||''} ${l.lastName||''}`.trim(), admissionNumber: l.admissionNumber, stream: l.streamName }];
      return { ...f, athletes };
    });
  };

  const createTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editId) {
        await apiClient.patch(`/sports/teams/${editId}`, form);
        toast.success('Team updated');
      } else {
        await apiClient.post('/sports/teams', form);
        toast.success('Team created');
      }
      setShowNew(false); setEditId(null);
      setForm({ name:'', sport:'Football', ageCategory:'Under 15', gender:'Mixed', coach:'', athletes:[] });
      setPickStream(''); setStreamLearners([]);
      loadTeams();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not save team'); }
    finally { setSaving(false); }
  };

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
          {tab === 'teams' && (
            <button onClick={() => { setEditId(null); setForm({ name:'', sport:'Football', ageCategory:'Under 15', gender:'Mixed', coach:'', athletes:[] }); setShowNew(true); }} className="btn-primary text-sm flex items-center gap-1.5">
              <Plus size={14}/> New Team
            </button>
          )}
          <Link href="/dashboard/sports/fixtures" className="btn-ghost text-sm flex items-center gap-1.5">
            <Swords size={14}/> Fixtures
          </Link>
          <Link href="/dashboard/sports/school-team" className="btn-ghost text-sm flex items-center gap-1.5">
            <Trophy size={14} className="text-[#d4af37]"/> School Team
          </Link>
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
            <button onClick={() => { setEditId(null); setShowNew(true); }} className="btn-primary mt-4"><Plus size={14}/> Create Team</button>
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
                    <div className="text-xs text-theme-muted">{t.sport}{t.ageCategory ? ` · ${t.ageCategory}` : ''}</div>
                  </div>
                  <button onClick={() => deleteTeam(t)} title="Delete team"
                    className="ml-auto text-theme-muted hover:text-red-600 p-1"><Trash2 size={15}/></button>
                </div>
                <div className="flex items-center gap-2 text-xs text-theme-muted">
                  <Users size={12}/> {t.athleteCount || 0} {memberNoun(t.sport)}
                  {t.gender && t.gender !== 'Mixed' && (
                    <span className="ml-auto">{t.gender}</span>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => openView(t)} className="btn-ghost flex-1 justify-center text-xs">View</button>
                  <button onClick={() => openEdit(t)} className="btn-ghost flex-1 justify-center text-xs">Edit</button>
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

      {/* Create Team modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] flex flex-col" style={{ border:'1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom:'1px solid var(--border)' }}>
              <h3 className="text-lg font-bold text-theme-heading">{editId ? 'Edit Team' : 'Create Team'}</h3>
              <button onClick={() => { setShowNew(false); setEditId(null); }} className="text-theme-muted text-xl leading-none">✕</button>
            </div>
            <form onSubmit={createTeam} className="p-5 space-y-4 overflow-y-auto">
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className="label">Team Name *</label>
                  <input required value={form.name} onChange={setF('name')} className="input" placeholder="e.g. Eagles FC / Grade 7 Relay"/></div>
                <div><label className="label">Sport / Event *</label>
                  <select required value={form.sport} onChange={setF('sport')} className="input">
                    {SPORTS.map(s => <option key={s}>{s}</option>)}
                  </select></div>
                <div><label className="label">Age Category</label>
                  <select value={form.ageCategory} onChange={setF('ageCategory')} className="input">
                    {AGE_CATS.map(a => <option key={a}>{a}</option>)}
                  </select></div>
                <div><label className="label">Gender</label>
                  <select value={form.gender} onChange={setF('gender')} className="input">
                    <option>Mixed</option><option>Boys</option><option>Girls</option>
                  </select></div>
                <div className="sm:col-span-2"><label className="label">Coach / Teacher in charge</label>
                  <input value={form.coach} onChange={setF('coach')} className="input" placeholder="Optional"/></div>
              </div>

              {/* Squad editor: current members (removable) + add more from classes */}
              <div>
                {form.athletes.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="label mb-0">Current squad ({form.athletes.length})</label>
                      <button type="button" onClick={() => setForm((f:any)=>({ ...f, athletes: [] }))}
                        className="text-[11px] text-red-600 hover:underline">Clear all</button>
                    </div>
                    <div className="border border-theme rounded-xl divide-y divide-theme/30 max-h-44 overflow-y-auto">
                      {form.athletes.map((a:any, idx:number) => (
                        <div key={a.id || idx} className="flex items-center gap-2 px-3 py-2 text-sm">
                          <span className="w-5 text-theme-muted">{idx+1}.</span>
                          <span className="font-medium text-theme-heading">{a.name}</span>
                          <span className="text-theme-muted text-xs ml-1">{a.stream || ''}{a.admissionNumber?` · ${a.admissionNumber}`:''}</span>
                          <button type="button" onClick={() => toggleAthlete({ id: a.id })}
                            className="ml-auto text-theme-muted hover:text-red-600" title="Remove">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <label className="label">Add {memberNoun(form.sport)} (pick a class)</label>
                <select value={pickStream} onChange={e => setPickStream(e.target.value)} className="input mb-2">
                  <option value="">Select a class to pick from…</option>
                  {streams.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {pickStream && (
                  <div className="max-h-40 overflow-y-auto border border-theme rounded-xl divide-y divide-theme/40">
                    {streamLearners.length === 0 ? <div className="p-3 text-sm text-theme-muted">No learners</div> :
                      streamLearners.map((l:any) => {
                        const picked = form.athletes.find((a:any)=>a.id===l.id);
                        return (
                          <button type="button" key={l.id} onClick={()=>toggleAthlete(l)}
                            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-surface-2 ${picked?'bg-surface-2':''}`}>
                            <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${picked?'bg-[#1a2e5a] text-white border-[#1a2e5a]':'border-theme'}`}>{picked?'✓':''}</span>
                            {l.firstName} {l.lastName} <span className="text-theme-muted">· Adm {l.admissionNumber || '—'}</span>
                            {picked && <span className="ml-auto text-[10px] text-[#1a2e5a]">in squad</span>}
                          </button>
                        );
                      })}
                  </div>
                )}
                <p className="text-[11px] text-theme-muted mt-1">Tick to add, tick again to remove. You can pick from multiple classes; the current squad above updates live.</p>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowNew(false); setEditId(null); }} className="btn-ghost flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? <Loader2 size={15} className="animate-spin"/> : <Plus size={15}/>} {editId ? 'Save Changes' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Team roster */}
      {viewTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md max-h-[85vh] flex flex-col" style={{ border:'1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom:'1px solid var(--border)' }}>
              <div>
                <h3 className="text-lg font-bold text-theme-heading">{viewTeam.name}</h3>
                <p className="text-xs text-theme-muted">{viewTeam.sport}{viewTeam.ageCategory?` · ${viewTeam.ageCategory}`:''}{viewTeam.gender?` · ${viewTeam.gender}`:''}{viewTeam.coach?` · Coach: ${viewTeam.coach}`:''}</p>
              </div>
              <button onClick={() => setViewTeam(null)} className="text-theme-muted text-xl leading-none">✕</button>
            </div>
            <div className="p-5 overflow-y-auto">
              <div className="text-xs font-semibold text-theme-muted uppercase mb-2">{cap(memberNoun(viewTeam.sport))} ({(viewTeam.athletes||[]).length})</div>
              {(viewTeam.athletes||[]).length === 0 ? (
                <p className="text-sm text-theme-muted">No {memberNoun(viewTeam.sport)} added yet. Use Edit to add some.</p>
              ) : (
                <ol className="space-y-1">
                  {viewTeam.athletes.map((a:any, idx:number) => (
                    <li key={a.id || idx} className="flex items-center gap-2 text-sm py-1.5 border-b border-theme/30">
                      <span className="w-5 text-theme-muted">{idx+1}.</span>
                      <span className="font-medium text-theme-heading">{a.name}</span>
                      <span className="text-theme-muted text-xs ml-auto">{a.stream || ''}{a.admissionNumber?` · ${a.admissionNumber}`:''}</span>
                    </li>
                  ))}
                </ol>
              )}
              <div className="flex gap-2 mt-4">
                <button onClick={() => { const t = viewTeam; setViewTeam(null); openEdit(t); }} className="btn-primary flex-1 justify-center text-sm">Edit Team</button>
                <button onClick={() => setViewTeam(null)} className="btn-ghost flex-1 justify-center text-sm">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
