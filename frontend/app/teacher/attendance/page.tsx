'use client';
import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, AlertCircle, Save, Loader2, TrendingUp } from 'lucide-react';
import { LearnerSearch, matchesLearner } from '@/components/LearnerSearch';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

type Status = 'present'|'absent'|'late'|'excused';

export default function TeacherAttendance() {
  const { user } = useAuth();
  const [streams, setStreams]   = useState<any[]>([]);
  const [streamId, setStreamId] = useState('');
  const [learners, setLearners] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<Record<string, Status>>({});
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    if (!user) return;
    apiClient.get('/academic/streams').then(r => {
      const mine = (r.data||[]).filter((x:any) => x.id === user.streamId || x.classTeacherId === user.id);
      const list = mine.length ? mine : (r.data||[]);
      setStreams(list);
      const url = new URLSearchParams(window.location.search);
      setStreamId(url.get('streamId') || list[0]?.id || '');
    });
  }, [user]);

  useEffect(() => {
    if (!streamId) return;
    setLoading(true);
    Promise.all([
      apiClient.get(`/academic/streams/${streamId}/learners`).catch(()=>({data:[]})),
      apiClient.get(`/academic/attendance?streamId=${streamId}&date=${date}`).catch(()=>({data:[]})),
    ]).then(([l, a]) => {
      setLearners(l.data);
      const init: Record<string,Status> = {};
      l.data.forEach((x:any) => init[x.id] = 'present');
      (a.data||[]).forEach((r:any) => init[r.learnerId] = r.status);
      setAttendance(init);
    }).finally(()=>setLoading(false));
  }, [streamId, date]);

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.post('/academic/attendance/bulk', {
        streamId, date,
        records: Object.entries(attendance).map(([learnerId, status]) => ({ learnerId, status })),
      });
      toast.success('Attendance saved');
    } catch { toast.error('Failed to save attendance'); }
    finally { setSaving(false); }
  };

  const STATUSES: {key:Status;icon:any;color:string}[] = [
    { key:'present', icon:CheckCircle, color:'text-green-600' },
    { key:'absent',  icon:XCircle,     color:'text-red-600' },
    { key:'late',    icon:Clock,       color:'text-amber-600' },
    { key:'excused', icon:AlertCircle, color:'text-blue-600' },
  ];
  const counts = {
    present: Object.values(attendance).filter(s=>s==='present').length,
    absent:  Object.values(attendance).filter(s=>s==='absent').length,
    late:    Object.values(attendance).filter(s=>s==='late').length,
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Attendance</h1>
          <p className="text-sm text-theme-muted">Mark roll call for your class</p>
        </div>
        <button onClick={save} disabled={saving || learners.length===0} className="btn-primary">
          {saving ? <><Loader2 size={16} className="animate-spin"/> Saving…</> : <><Save size={16}/> Save</>}
        </button>
      </div>

      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Class</label>
          <select value={streamId} onChange={e=>setStreamId(e.target.value)} className="input w-44">
            {streams.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="input"/>
        </div>
        <div className="ml-auto flex gap-3 text-xs">
          <span className="text-green-600 font-bold">{counts.present} present</span>
          <span className="text-red-600 font-bold">{counts.absent} absent</span>
          <span className="text-amber-600 font-bold">{counts.late} late</span>
        </div>
      </div>

      {loading ? <div className="h-64 shimmer rounded-2xl"/> : learners.length===0 ? (
        <div className="card p-10 text-center text-theme-muted">No learners in this class</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <LearnerSearch value={search} onChange={setSearch} />
          </div>
          {learners.filter((l:any)=>matchesLearner(l, search)).map((l:any, i:number) => (
            <div key={l.id} className="flex items-center gap-3 p-3" style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center text-xs font-bold text-theme-heading flex-shrink-0">
                {l.firstName?.[0]}{l.lastName?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-theme-heading text-sm truncate">{l.firstName} {l.lastName}</div>
                <div className="text-[10px] text-theme-muted">{l.admissionNumber}</div>
              </div>
              <div className="flex gap-1">
                {STATUSES.map(s => {
                  const Icon = s.icon;
                  const active = attendance[l.id] === s.key;
                  return (
                    <button key={s.key} onClick={()=>setAttendance(a=>({...a,[l.id]:s.key}))}
                      title={s.key}
                      className={`p-2 rounded-lg transition-all ${active ? `bg-surface-2 ${s.color}` : 'text-theme-muted opacity-40 hover:opacity-100'}`}>
                      <Icon size={18}/>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
