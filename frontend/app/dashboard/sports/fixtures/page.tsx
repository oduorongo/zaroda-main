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

  const load = () => {
    setLoading(true);
    apiClient.get(`/sports/fixtures?type=${tab}`).then(r => setFixtures(r.data)).catch(()=>{}).finally(()=>setLoading(false));
  };
  useEffect(() => { load(); }, [tab]);

  const set = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try { await apiClient.post('/sports/fixtures', form); toast.success('Fixture scheduled'); setShowNew(false); load(); }
    catch { toast.error('Could not save'); } finally { setSaving(false); }
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
            <div key={f.id} className="card p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#1a2e5a] flex items-center justify-center flex-shrink-0"><Trophy size={18} className="text-[#d4af37]"/></div>
              <div className="flex-1">
                <div className="font-bold text-theme-heading text-sm">{f.homeTeam} vs {f.awayTeam}</div>
                <div className="text-xs text-theme-muted">{f.discipline} · {f.venue} · {f.date ? new Date(f.date).toLocaleDateString('en-KE') : 'TBD'}</div>
              </div>
              {f.homeScore != null && <div className="font-black text-theme-heading">{f.homeScore} - {f.awayScore}</div>}
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
              <div><label className="label">Discipline</label><input value={form.discipline} onChange={set('discipline')} className="input" placeholder="Football"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Home Team</label><input required value={form.homeTeam} onChange={set('homeTeam')} className="input" placeholder="Grade 6 North"/></div>
                <div><label className="label">Away Team</label><input required value={form.awayTeam} onChange={set('awayTeam')} className="input" placeholder="Grade 6 South"/></div>
              </div>
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
    </div>
  );
}
