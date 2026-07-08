'use client';
import { useState, useEffect } from 'react';
import { Plus, X, Loader2, Swords, Calendar, Trophy } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

export default function FixturesPage() {
  const [tab, setTab] = useState<'fixtures'|'results'|'interclass'>('fixtures');
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ discipline:'Football', homeTeam:'', awayTeam:'', venue:'', date:'', type:'inter_class' });
  const [teams, setTeams] = useState<any[]>([]);

  useEffect(() => {
    apiClient.get('/sports/teams').then(r => setTeams(r.data || [])).catch(() => {});
  }, []);

  // Teams matching the chosen discipline (so you pick relevant teams); fall back to all.
  const teamsForDiscipline = teams.filter((t:any) =>
    !form.discipline || (t.sport || '').toLowerCase() === form.discipline.toLowerCase());
  const teamOptions = (teamsForDiscipline.length ? teamsForDiscipline : teams);

  const load = () => {
    setLoading(true);
    apiClient.get(`/sports/fixtures?type=${tab}`).then(r => setFixtures(r.data)).catch(()=>{}).finally(()=>setLoading(false));
  };
  useEffect(() => { load(); }, [tab]);

  const set = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isRace = /athletics|swimming|cross country/i.test(form.discipline);
    if (!isRace && form.homeTeam && form.homeTeam === form.awayTeam) {
      toast.error('Home and away cannot be the same team.'); return;
    }
    setSaving(true);
    try { await apiClient.post('/sports/fixtures', form); toast.success('Fixture scheduled'); setShowNew(false);
      setForm({ discipline:'Football', homeTeam:'', awayTeam:'', venue:'', date:'', type:'inter_class' }); load(); }
    catch (err:any) { toast.error(err?.response?.data?.message || 'Could not save'); } finally { setSaving(false); }
  };

  // Result recording (match score OR race positions)
  const [resultFix, setResultFix] = useState<any>(null);
  const [score, setScore] = useState({ homeScore:'', awayScore:'', notes:'' });
  const [positions, setPositions] = useState<{position:string;name:string;cls:string;time:string}[]>([{position:'1',name:'',cls:'',time:''}]);

  const openResult = (f:any) => {
    setResultFix(f);
    setScore({ homeScore: f.homeScore ?? '', awayScore: f.awayScore ?? '', notes: f.notes || '' });
    setPositions(Array.isArray(f.results) && f.results.length
      ? f.results.map((r:any)=>({ position:String(r.position||''), name:r.name||'', cls:r.class||r.cls||'', time:r.time||'' }))
      : [{position:'1',name:'',cls:'',time:''},{position:'2',name:'',cls:'',time:''},{position:'3',name:'',cls:'',time:''}]);
  };
  const addPos = () => setPositions(p => [...p, { position:String(p.length+1), name:'', cls:'', time:'' }]);
  const setPos = (i:number, k:string, v:string) => setPositions(p => p.map((row,idx)=> idx===i ? { ...row, [k]:v } : row));

  const saveResult = async () => {
    if (!resultFix) return;
    setSaving(true);
    try {
      const payload: any = resultFix.kind === 'race'
        ? { results: positions.filter(p=>p.name).map(p=>({ position:Number(p.position)||null, name:p.name, class:p.cls, time:p.time })), notes: score.notes }
        : { homeScore: Number(score.homeScore)||0, awayScore: Number(score.awayScore)||0,
            winner: (Number(score.homeScore)||0) === (Number(score.awayScore)||0) ? 'Draw'
              : (Number(score.homeScore)||0) > (Number(score.awayScore)||0) ? resultFix.homeTeam : resultFix.awayTeam,
            notes: score.notes };
      await apiClient.patch(`/sports/fixtures/${resultFix.id}/result`, payload);
      toast.success('Result recorded'); setResultFix(null); load();
    } catch (err:any) { toast.error(err?.response?.data?.message || 'Could not save result'); }
    finally { setSaving(false); }
  };

  const removeFixture = async (id:string) => {
    if (!confirm('Delete this fixture?')) return;
    try { await apiClient.delete(`/sports/fixtures/${id}`); toast.success('Deleted'); load(); }
    catch { toast.error('Could not delete'); }
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div><h1 className="text-2xl font-black text-theme-heading">Fixtures & Results</h1>
          <p className="text-sm text-theme-muted">Schedule matches, record results, run inter-class competitions</p></div>
        <button onClick={()=>setShowNew(true)} className="btn-primary"><Plus size={16}/> New Fixture</button>
      </div>

      <div className="flex border-b border-theme gap-1">
        {[{k:'fixtures',l:'📅 Upcoming'},{k:'results',l:'🏆 Results'},{k:'interclass',l:'⚔️ Inter-Class'}].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k as any)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${tab===t.k?'border-[#1a2e5a] text-theme-heading':'border-transparent text-theme-muted hover:text-theme-heading'}`}>{t.l}</button>
        ))}
      </div>

      {loading ? <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-16 shimmer rounded-xl"/>)}</div>
      : fixtures.length === 0 ? (
        <div className="card p-10 text-center"><Swords size={36} className="mx-auto text-[#e2e6f0] mb-2"/><p className="text-theme-muted">No {tab} yet</p></div>
      ) : (
        <div className="space-y-3">
          {fixtures.map((f:any)=>(
            <div key={f.id} className="card p-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#1a2e5a] flex items-center justify-center flex-shrink-0"><Trophy size={18} className="text-[#d4af37]"/></div>
                <div className="flex-1 min-w-0">
                  {f.kind === 'race' ? (
                    <div className="font-bold text-theme-heading text-sm">{f.discipline}</div>
                  ) : (
                    <div className="font-bold text-theme-heading text-sm">{f.homeTeam} vs {f.awayTeam}</div>
                  )}
                  <div className="text-xs text-theme-muted">{f.discipline}{f.venue?` · ${f.venue}`:''} · {f.date ? new Date(f.date).toLocaleDateString('en-KE') : 'TBD'}{f.status==='completed'?' · ✓ Completed':''}</div>
                </div>
                {f.kind !== 'race' && f.homeScore != null && <div className="font-black text-theme-heading text-lg">{f.homeScore} - {f.awayScore}</div>}
              </div>

              {/* Race results podium */}
              {f.kind === 'race' && Array.isArray(f.results) && f.results.length > 0 && (
                <div className="mt-3 pl-14 space-y-1">
                  {f.results.slice(0,5).map((r:any,idx:number)=>(
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <span className="font-black text-[#d4af37] w-5">{r.position}.</span>
                      <span className="font-medium text-theme-heading">{r.name}</span>
                      <span className="text-theme-muted">{r.class||r.cls||''}</span>
                      {r.time && <span className="text-theme-muted ml-auto">{r.time}</span>}
                    </div>
                  ))}
                </div>
              )}
              {f.winner && f.kind !== 'race' && <div className="mt-2 pl-14 text-xs text-green-600 font-semibold">Winner: {f.winner}</div>}

              <div className="flex gap-2 mt-3 pl-14">
                <button onClick={()=>openResult(f)} className="btn-ghost text-xs">{f.status==='completed'?'Edit Result':'Record Result'}</button>
                <button onClick={()=>removeFixture(f.id)} className="btn-ghost text-xs text-red-600">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <h3 className="text-lg font-bold text-theme-heading">New Fixture</h3>
              <button onClick={()=>setShowNew(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-4">
              <div><label className="label">Discipline / Event</label>
                <select value={form.discipline} onChange={set('discipline')} className="input">
                  {['Football','Netball','Volleyball','Handball','Rugby','Hockey','Basketball','Basketball Boys JS','Basketball Girls JS','Athletics (Track)','Athletics (Field)','Swimming','Badminton','Table Tennis','Lawn Tennis','Cross Country','Chess Boys Primary','Chess Girls Primary','Chess Boys JS','Chess Girls JS'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              {!/athletics|swimming|cross country/i.test(form.discipline) ? (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Home Team</label>
                    {teamOptions.length > 0 ? (
                      <select required value={form.homeTeam} onChange={set('homeTeam')} className="input">
                        <option value="">Select team…</option>
                        {teamOptions.map((t:any) => <option key={t.id} value={t.name}>{t.name}</option>)}
                      </select>
                    ) : (
                      <input required value={form.homeTeam} onChange={set('homeTeam')} className="input" placeholder="Grade 6 North"/>
                    )}
                  </div>
                  <div><label className="label">Away Team</label>
                    {teamOptions.length > 0 ? (
                      <select required value={form.awayTeam} onChange={set('awayTeam')} className="input">
                        <option value="">Select team…</option>
                        {teamOptions.map((t:any) => <option key={t.id} value={t.name}>{t.name}</option>)}
                      </select>
                    ) : (
                      <input required value={form.awayTeam} onChange={set('awayTeam')} className="input" placeholder="Grade 6 South"/>
                    )}
                  </div>
                  {teamOptions.length === 0 && (
                    <p className="col-span-2 text-[11px] text-theme-muted">No {form.discipline} teams created yet — type names here, or create teams first in the Teams tab to pick them.</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-theme-muted bg-surface-2 rounded-lg p-2">This is a race/field event — you'll enter finishing positions when recording the result, so no teams are needed here.</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Venue</label><input value={form.venue} onChange={set('venue')} className="input" placeholder="School field"/></div>
                <div><label className="label">Date</label><input type="date" value={form.date} onChange={set('date')} className="input"/></div>
              </div>
              <div><label className="label">Type</label>
                <select value={form.type} onChange={set('type')} className="input">
                  <option value="inter_class">Inter-Class</option><option value="inter_house">Inter-House</option><option value="friendly">Friendly</option>
                </select>
              </div>
              <div className="flex gap-3"><button type="button" onClick={()=>setShowNew(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? <Loader2 size={14} className="animate-spin"/> : 'Schedule'}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Record Result modal */}
      {resultFix && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <h3 className="text-lg font-bold text-theme-heading">Record Result</h3>
              <button onClick={()=>setResultFix(null)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              {resultFix.kind === 'race' ? (
                <>
                  <p className="text-sm text-theme-muted">{resultFix.discipline} — enter finishing positions.</p>
                  <div className="space-y-2">
                    {positions.map((p,i)=>(
                      <div key={i} className="grid grid-cols-12 gap-2 items-center">
                        <input value={p.position} onChange={e=>setPos(i,'position',e.target.value)} className="input col-span-2 text-center" placeholder="#"/>
                        <input value={p.name} onChange={e=>setPos(i,'name',e.target.value)} className="input col-span-5" placeholder="Athlete name"/>
                        <input value={p.cls} onChange={e=>setPos(i,'cls',e.target.value)} className="input col-span-2" placeholder="Class"/>
                        <input value={p.time} onChange={e=>setPos(i,'time',e.target.value)} className="input col-span-3" placeholder="Time"/>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addPos} className="btn-ghost text-xs"><Plus size={12}/> Add position</button>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">{resultFix.homeTeam}</label>
                    <input type="number" min={0} value={score.homeScore} onChange={e=>setScore(s=>({...s,homeScore:e.target.value}))} className="input text-center text-xl font-bold"/></div>
                  <div><label className="label">{resultFix.awayTeam}</label>
                    <input type="number" min={0} value={score.awayScore} onChange={e=>setScore(s=>({...s,awayScore:e.target.value}))} className="input text-center text-xl font-bold"/></div>
                </div>
              )}
              <div><label className="label">Notes (optional)</label>
                <input value={score.notes} onChange={e=>setScore(s=>({...s,notes:e.target.value}))} className="input" placeholder="e.g. MVP, weather, remarks"/></div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={()=>setResultFix(null)} className="btn-ghost flex-1 justify-center">Cancel</button>
                <button onClick={saveResult} disabled={saving} className="btn-primary flex-1 justify-center">{saving ? <Loader2 size={14} className="animate-spin"/> : 'Save Result'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
