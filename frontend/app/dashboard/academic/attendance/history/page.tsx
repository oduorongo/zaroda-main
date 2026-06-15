'use client';
import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, CalendarRange, AlertTriangle, CheckCircle, User } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

const STATUS_COLOR: Record<string,string> = {
  present: 'bg-green-500', absent: 'bg-red-500', late: 'bg-amber-500', excused: 'bg-blue-500',
};

export default function AttendanceHistoryPage() {
  const { user } = useAuth();
  const [streams, setStreams]   = useState<any[]>([]);
  const [streamId, setStreamId] = useState('');
  const [learners, setLearners] = useState<any[]>([]);
  const [summary, setSummary]   = useState<any[]>([]);   // stream-wide rates
  const [learnerId, setLearnerId] = useState('');
  const [history, setHistory]   = useState<any>(null);   // single-learner trend
  const [loading, setLoading]   = useState(false);

  // Default range: last 90 days
  const today = new Date().toISOString().split('T')[0];
  const ago90 = new Date(Date.now() - 90*24*60*60*1000).toISOString().split('T')[0];
  const [from, setFrom] = useState(ago90);
  const [to,   setTo]   = useState(today);

  useEffect(() => {
    apiClient.get('/academic/streams').then(r => {
      setStreams(r.data);
      if (user?.streamId) setStreamId(user.streamId);
      else if (r.data[0]) setStreamId(r.data[0].id);
    });
  }, [user]);

  // Load stream summary + learners when stream/range changes
  useEffect(() => {
    if (!streamId) return;
    setLoading(true);
    setLearnerId(''); setHistory(null);
    Promise.all([
      apiClient.get(`/academic/attendance/summary?streamId=${streamId}&from=${from}&to=${to}`).catch(()=>({data:[]})),
      apiClient.get(`/academic/streams/${streamId}/learners`).catch(()=>({data:[]})),
    ]).then(([s, l]) => {
      setSummary((s.data||[]).map((r:any)=>({ ...r, rate: Number(r.rate)||0, total: Number(r.total)||0, present: Number(r.present)||0, absent: Number(r.absent)||0, late: Number(r.late)||0 })));
      setLearners(l.data);
    }).finally(()=>setLoading(false));
  }, [streamId, from, to]);

  // Load one learner's trend
  const loadLearner = (id: string) => {
    setLearnerId(id);
    if (!id) { setHistory(null); return; }
    apiClient.get(`/academic/attendance/learner/${id}?from=${from}&to=${to}`)
      .then(r => setHistory(r.data))
      .catch(() => toast.error('Could not load history'));
  };

  const rateColor = (r: number) => r >= 90 ? 'text-green-600' : r >= 75 ? 'text-amber-600' : 'text-red-600';
  const rateBar   = (r: number) => r >= 90 ? 'bg-green-500'   : r >= 75 ? 'bg-amber-500'   : 'bg-red-500';

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Attendance History & Trends</h1>
          <p className="text-sm text-theme-muted">Track attendance patterns and spot at-risk learners</p>
        </div>
        <a href="/dashboard/academic/attendance" className="btn-ghost text-sm"><CalendarRange size={14}/> Take Attendance</a>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Stream</label>
          <select value={streamId} onChange={e=>setStreamId(e.target.value)} className="input w-44">
            {streams.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div><label className="label">From</label><input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="input w-40"/></div>
        <div><label className="label">To</label><input type="date" value={to} onChange={e=>setTo(e.target.value)} className="input w-40"/></div>
        <div className="flex-1"/>
        <div>
          <label className="label">Focus on a learner</label>
          <select value={learnerId} onChange={e=>loadLearner(e.target.value)} className="input w-52">
            <option value="">— Whole class ranking —</option>
            {learners.map((l:any)=><option key={l.id} value={l.id}>{l.firstName} {l.lastName}</option>)}
          </select>
        </div>
      </div>

      {/* SINGLE LEARNER TREND */}
      {history && (
        <div className="space-y-4">
          {/* Summary tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-4 text-center">
              <div className={`text-3xl font-black ${rateColor(history.summary.rate)}`}>{history.summary.rate}%</div>
              <div className="text-xs text-theme-muted mt-1">Attendance Rate</div>
            </div>
            <div className="card p-4 text-center"><div className="text-2xl font-black text-green-600">{history.summary.present}</div><div className="text-xs text-theme-muted mt-1">Days Present</div></div>
            <div className="card p-4 text-center"><div className="text-2xl font-black text-red-600">{history.summary.absent}</div><div className="text-xs text-theme-muted mt-1">Days Absent</div></div>
            <div className="card p-4 text-center"><div className="text-2xl font-black text-amber-600">{history.summary.late}</div><div className="text-xs text-theme-muted mt-1">Times Late</div></div>
          </div>

          {/* Monthly trend bars */}
          {history.trend.length > 0 && (
            <div className="card p-5">
              <h3 className="font-bold text-theme-heading mb-4">Monthly Trend</h3>
              <div className="flex items-end gap-3 h-40">
                {history.trend.map((t:any)=>(
                  <div key={t.month} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-xs font-bold text-theme-heading">{t.rate}%</div>
                    <div className="w-full bg-surface-2 rounded-t-lg flex items-end" style={{ height: '100%' }}>
                      <div className={`w-full rounded-t-lg ${rateBar(t.rate)}`} style={{ height: `${t.rate}%` }}/>
                    </div>
                    <div className="text-[10px] text-theme-muted">{t.month.slice(5)}/{t.month.slice(2,4)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent records */}
          <div className="card p-5">
            <h3 className="font-bold text-theme-heading mb-3">Recent Records</h3>
            <div className="flex flex-wrap gap-1.5">
              {history.records.slice(0, 60).map((r:any)=>(
                <div key={r.id} title={`${r.date} — ${r.status}`}
                  className={`w-7 h-7 rounded ${STATUS_COLOR[r.status]||'bg-gray-400'} flex items-center justify-center text-white text-[9px] font-bold`}>
                  {r.status[0].toUpperCase()}
                </div>
              ))}
            </div>
            <p className="text-xs text-theme-muted mt-3">Each square is a school day · P present · A absent · L late · E excused</p>
          </div>
        </div>
      )}

      {/* WHOLE-CLASS RANKING (at-risk surface first) */}
      {!history && (
        loading ? <div className="h-64 shimmer"/> : summary.length === 0 ? (
          <div className="card p-10 text-center text-theme-muted">No attendance recorded in this range yet</div>
        ) : (
          <div className="card overflow-hidden">
            <div className="p-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <AlertTriangle size={15} className="text-amber-500"/>
              <span className="text-sm font-bold text-theme-heading">Class attendance — lowest first (at-risk learners on top)</span>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="table-header">
                <th className="px-4 py-3 text-left text-xs">Learner</th>
                <th className="px-4 py-3 text-center text-xs hidden sm:table-cell">Present</th>
                <th className="px-4 py-3 text-center text-xs hidden sm:table-cell">Absent</th>
                <th className="px-4 py-3 text-center text-xs hidden md:table-cell">Late</th>
                <th className="px-4 py-3 text-left text-xs w-40">Rate</th>
              </tr></thead>
              <tbody>
                {summary.map((r:any,i:number)=>(
                  <tr key={r.learnerId} className={`${i%2===0?'bg-surface':'bg-surface-2'}`} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-3">
                      <button onClick={()=>loadLearner(r.learnerId)} className="font-semibold text-theme-heading hover:underline text-left">
                        {r.learnerName}
                      </button>
                      <div className="text-[10px] text-theme-muted">{r.admissionNumber}</div>
                    </td>
                    <td className="px-4 py-3 text-center text-green-600 font-semibold hidden sm:table-cell">{r.present}</td>
                    <td className="px-4 py-3 text-center text-red-600 font-semibold hidden sm:table-cell">{r.absent}</td>
                    <td className="px-4 py-3 text-center text-amber-600 font-semibold hidden md:table-cell">{r.late}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
                          <div className={`h-full ${rateBar(r.rate)}`} style={{ width: `${r.rate}%` }}/>
                        </div>
                        <span className={`text-xs font-black ${rateColor(r.rate)} w-9 text-right`}>{r.rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
