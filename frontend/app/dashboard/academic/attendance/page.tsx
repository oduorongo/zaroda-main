'use client';
import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, AlertCircle, Save, Loader2, ChevronDown, TrendingUp } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

const STATUS_CONFIG = {
  present: { label: 'P', full: 'Present', color: 'bg-green-500',  text: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-300'  },
  absent:  { label: 'A', full: 'Absent',  color: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-300'    },
  late:    { label: 'L', full: 'Late',    color: 'bg-amber-500',  text: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-300'  },
  excused: { label: 'E', full: 'Excused', color: 'bg-blue-500',   text: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-300'   },
} as const;
type Status = keyof typeof STATUS_CONFIG;

export default function AttendancePage() {
  const { user } = useAuth();
  const [streams,    setStreams]    = useState<any[]>([]);
  const [streamId,   setStreamId]  = useState('');
  const [learners,   setLearners]  = useState<any[]>([]);
  const [attendance, setAttendance]= useState<Record<string, Status>>({});
  const [loading,    setLoading]   = useState(false);
  const [saving,     setSaving]    = useState(false);
  const [date,       setDate]      = useState(new Date().toISOString().split('T')[0]);
  const [existing,   setExisting]  = useState(false);

  // Load streams
  useEffect(() => {
    apiClient.get('/academic/streams').then(r => {
      setStreams(r.data);
      // Auto-select teacher's own stream
      if (user?.streamId) setStreamId(user.streamId);
      else if (r.data.length > 0) setStreamId(r.data[0].id);
    });
  }, [user]);

  // Load learners when stream or date changes
  useEffect(() => {
    if (!streamId) return;
    setLoading(true);
    Promise.all([
      apiClient.get(`/academic/streams/${streamId}/learners`),
      apiClient.get(`/academic/attendance?streamId=${streamId}&date=${date}`).catch(() => ({ data: [] })),
    ]).then(([learnersRes, attRes]) => {
      const ls: any[] = learnersRes.data;
      setLearners(ls);
      const existing: any[] = attRes.data;
      if (existing.length > 0) {
        setExisting(true);
        const map: Record<string, Status> = {};
        existing.forEach((e: any) => { map[e.learnerId] = e.status; });
        setAttendance(map);
      } else {
        setExisting(false);
        const def: Record<string, Status> = {};
        ls.forEach((l: any) => { def[l.id] = 'present'; });
        setAttendance(def);
      }
    }).catch(() => toast.error('Could not load learners'))
      .finally(() => setLoading(false));
  }, [streamId, date]);

  const setStatus = (learnerId: string, status: Status) =>
    setAttendance(a => ({ ...a, [learnerId]: status }));

  const markAll = (status: Status) => {
    const all: Record<string, Status> = {};
    learners.forEach(l => { all[l.id] = status; });
    setAttendance(all);
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.post('/academic/attendance/bulk', {
        streamId, date,
        records: Object.entries(attendance).map(([learnerId, status]) => ({ learnerId, status })),
      });
      toast.success('Attendance saved!');
      setExisting(true);
    } catch { toast.error('Failed to save attendance'); }
    finally { setSaving(false); }
  };

  const counts = {
    present: Object.values(attendance).filter(s => s === 'present').length,
    absent:  Object.values(attendance).filter(s => s === 'absent').length,
    late:    Object.values(attendance).filter(s => s === 'late').length,
    excused: Object.values(attendance).filter(s => s === 'excused').length,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Attendance</h1>
          <p className="text-sm text-theme-muted">Daily roll call — mark Present · Absent · Late · Excused</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/dashboard/academic/attendance/history" className="btn-ghost">
            <TrendingUp size={16}/> History & Trends
          </a>
          <button onClick={save} disabled={saving || learners.length === 0} className="btn-primary">
            {saving ? <><Loader2 size={16} className="animate-spin"/> Saving…</> : <><Save size={16}/> Save Attendance</>}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="label">Stream / Class</label>
          <select value={streamId} onChange={e => setStreamId(e.target.value)} className="input">
            {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input type="date" value={date} max={new Date().toISOString().split('T')[0]}
            onChange={e => setDate(e.target.value)} className="input"/>
        </div>
        {existing && (
          <span className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-1.5 rounded-lg font-medium">
            ✓ Attendance already recorded for this date
          </span>
        )}
      </div>

      {/* Summary bar */}
      {learners.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {(Object.entries(STATUS_CONFIG) as [Status, typeof STATUS_CONFIG[Status]][]).map(([key, cfg]) => (
            <div key={key} className={`card p-3 text-center border ${cfg.border}`}>
              <div className={`text-xl font-black ${cfg.text}`}>{counts[key]}</div>
              <div className="text-xs text-theme-muted mt-0.5">{cfg.full}</div>
            </div>
          ))}
        </div>
      )}

      {/* Mark all buttons */}
      {learners.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-theme-muted font-medium">Mark all:</span>
          {(Object.entries(STATUS_CONFIG) as [Status, typeof STATUS_CONFIG[Status]][]).map(([key, cfg]) => (
            <button key={key} onClick={() => markAll(key)}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all hover:shadow-sm ${cfg.bg} ${cfg.text} ${cfg.border}`}>
              {cfg.full}
            </button>
          ))}
        </div>
      )}

      {/* Learner list */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-16 shimmer rounded-xl"/>)}
        </div>
      ) : learners.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-theme-muted">No learners in this stream</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="table-header">
                <th className="px-4 py-3 text-left text-xs">#</th>
                <th className="px-4 py-3 text-left text-xs">Learner</th>
                <th className="px-4 py-3 text-left text-xs hidden sm:table-cell">Adm. No.</th>
                <th className="px-4 py-3 text-center text-xs">Status</th>
              </tr>
            </thead>
            <tbody>
              {learners.map((l: any, idx: number) => {
                const status = attendance[l.id] || 'present';
                const cfg    = STATUS_CONFIG[status];
                return (
                  <tr key={l.id} className={`border-b border-theme ${idx % 2 === 0 ? 'bg-surface' : 'bg-[#f9fafb]'}`}>
                    <td className="px-4 py-3 text-sm text-theme-muted">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-[#1a2e5a] flex items-center justify-center text-[#d4af37] font-bold text-xs flex-shrink-0">
                          {l.firstName[0]}{l.lastName[0]}
                        </div>
                        <span className="text-sm font-semibold text-theme-heading">{l.firstName} {l.lastName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-theme-muted hidden sm:table-cell">{l.admissionNumber}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {(Object.entries(STATUS_CONFIG) as [Status, typeof STATUS_CONFIG[Status]][]).map(([key, c]) => (
                          <button key={key} onClick={() => setStatus(l.id, key)}
                            className={`w-8 h-8 rounded-lg text-xs font-black transition-all
                              ${status === key
                                ? `${c.color} text-white shadow-sm scale-110`
                                : 'bg-surface-2 text-theme-muted hover:bg-[#e2e6f0]'}`}>
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
