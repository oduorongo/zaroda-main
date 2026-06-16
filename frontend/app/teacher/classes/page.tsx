'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, ChevronRight, CheckSquare, BarChart3, Search } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';

export default function MyClasses() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    if (!user) return;
    Promise.all([
      apiClient.get('/academic/streams'),
      apiClient.get(`/academic/teachers/${user.id}/stream-subjects`).catch(()=>({data:[]})),
    ]).then(([r, ss]) => {
      const assignedIds = new Set<string>((ss.data||[]).map((row:any)=>String(row.streamId)));
      const mine = (r.data||[]).filter((x:any) =>
        assignedIds.has(String(x.id)) || x.id === user.streamId || x.classTeacherId === user.id);
      setClasses(mine.length ? mine : (r.data||[]));
    }).catch(()=>{}).finally(()=>setLoading(false));
  }, [user]);

  const filtered = classes.filter((c:any) =>
    !search || `${c.name} ${c.gradeLevel||''}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">My Classes</h1>
          <p className="text-sm text-theme-muted">The classes you teach</p>
        </div>
      </div>
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted"/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search classes…" className="input pl-8"/>
      </div>
      {loading ? <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{[1,2,3].map(i=><div key={i} className="h-32 shimmer rounded-2xl"/>)}</div>
      : filtered.length === 0 ? (
        <div className="card p-10 text-center text-theme-muted">{search ? 'No classes match your search' : 'No classes assigned yet — ask your administrator'}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c:any) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#1a2e5a] flex items-center justify-center text-[#d4af37] font-black text-xs">
                  {c.gradeLevel?.replace('grade_','G').replace('_','').toUpperCase().slice(0,3)}
                </div>
                <span className="badge bg-surface-2 text-theme-muted">{c.academicYear || '2025/2026'}</span>
              </div>
              <div className="font-bold text-theme-heading">{c.name}</div>
              <div className="text-xs text-theme-muted mt-0.5 flex items-center gap-1 mb-3"><Users size={11}/> {c.learnersCount || 0} learners</div>
              <div className="flex gap-2">
                <Link href={`/teacher/attendance?streamId=${c.id}`} className="btn-ghost flex-1 justify-center text-xs"><CheckSquare size={13}/> Attendance</Link>
                <Link href={`/teacher/marks?streamId=${c.id}`} className="btn-ghost flex-1 justify-center text-xs"><BarChart3 size={13}/> Marks</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
