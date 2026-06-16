'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CheckSquare, BarChart3, Calendar, Sparkles, Users, BookOpen,
  ChevronRight, GraduationCap, Clock,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';

export default function TeacherHome() {
  const { user } = useAuth();
  const [classes, setClasses]   = useState<any[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [today, setToday]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      apiClient.get('/academic/streams').catch(()=>({data:[]})),
      apiClient.get('/academic/teachers').catch(()=>({data:[]})),
      apiClient.get('/academic/my-timetable').catch(()=>({data:[]})),
      apiClient.get(`/academic/teachers/${user.id}/stream-subjects`).catch(()=>({data:[]})),
    ]).then(([s, t, tt, ss]) => {
      // All streams this teacher owns OR is assigned to teach in (across learning areas).
      const assignedIds = new Set<string>((ss.data||[]).map((row:any)=>String(row.streamId)));
      const mine = (s.data||[]).filter((x:any) =>
        assignedIds.has(String(x.id)) || x.id === user.streamId || x.classTeacherId === user.id);
      setClasses(mine.length ? mine : (s.data||[]));
      const me = (t.data||[]).find((x:any) => x.id === user.id);
      setSubjects(me?.subjects || []);
      // Today's lessons from personal timetable
      const dayName = new Date().toLocaleDateString('en-US',{weekday:'long'});
      setToday((tt.data||[]).filter((l:any) => l.day === dayName));
    }).finally(()=>setLoading(false));
  }, [user]);

  if (!user) return null;

  const QUICK = [
    { icon: CheckSquare, label: 'Take Attendance', sub: 'Mark today\u2019s roll call', href: '/teacher/attendance', color: 'bg-green-600' },
    { icon: BarChart3,   label: 'Enter Marks',     sub: 'Record assessment scores', href: '/teacher/marks',      color: 'bg-rose-600' },
    { icon: Sparkles,    label: 'AI Schemes',      sub: 'Generate KICD records',  href: '/teacher/records',     color: 'bg-purple-600' },
    { icon: Calendar,    label: 'My Timetable',    sub: 'Weekly schedule',        href: '/teacher/timetable',   color: 'bg-blue-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-[#1a2e5a] to-[#243f7a] rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-[#d4af37]/10 rounded-full -translate-y-10 translate-x-10"/>
        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <GraduationCap size={24} className="text-[#d4af37]"/>
          </div>
          <div>
            <h1 className="text-2xl font-black">Welcome, {user.firstName}</h1>
            <p className="text-white/60 text-sm">
              {subjects.length > 0 ? subjects.slice(0,3).join(' · ') : 'Teacher'}{subjects.length > 3 ? ` +${subjects.length-3}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <Users size={18} className="mx-auto text-[#1a2e5a] mb-1"/>
          <div className="text-xl font-black text-theme-heading">{loading ? '…' : classes.length}</div>
          <div className="text-xs text-theme-muted">My Classes</div>
        </div>
        <div className="card p-4 text-center">
          <BookOpen size={18} className="mx-auto text-purple-600 mb-1"/>
          <div className="text-xl font-black text-theme-heading">{loading ? '…' : subjects.length}</div>
          <div className="text-xs text-theme-muted">Subjects</div>
        </div>
        <div className="card p-4 text-center">
          <Clock size={18} className="mx-auto text-[#f5820a] mb-1"/>
          <div className="text-xl font-black text-theme-heading">{loading ? '…' : today.length}</div>
          <div className="text-xs text-theme-muted">Lessons Today</div>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="section-title">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK.map(q => {
            const Icon = q.icon;
            return (
              <Link key={q.label} href={q.href} className="card p-4 hover:shadow-md hover:-translate-y-0.5 transition-all">
                <div className={`w-11 h-11 rounded-xl ${q.color} flex items-center justify-center mb-3`}><Icon size={20} className="text-white"/></div>
                <div className="font-bold text-theme-heading text-sm">{q.label}</div>
                <div className="text-xs text-theme-muted mt-0.5">{q.sub}</div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Today's lessons */}
      <div>
        <h2 className="section-title">Today's Lessons</h2>
        {loading ? <div className="h-20 shimmer rounded-2xl"/> : today.length === 0 ? (
          <div className="card p-6 text-center text-theme-muted text-sm">No lessons scheduled for today</div>
        ) : (
          <div className="card divide-y" style={{ borderColor: 'var(--border)' }}>
            {today.map((l:any, i:number) => (
              <div key={i} className="flex items-center gap-3 p-3" style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <div className="w-14 text-xs font-bold text-theme-muted">{l.periodLabel}</div>
                <div className="flex-1">
                  <div className="font-semibold text-theme-heading text-sm">{l.subject}</div>
                  <div className="text-xs text-theme-muted">{l.streamName}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My classes */}
      <div>
        <h2 className="section-title">My Classes</h2>
        {loading ? <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{[1,2,3].map(i=><div key={i} className="h-24 shimmer rounded-2xl"/>)}</div>
        : classes.length === 0 ? (
          <div className="card p-6 text-center text-theme-muted text-sm">No classes assigned yet — ask your administrator</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {classes.map((c:any) => (
              <Link key={c.id} href={`/teacher/attendance?streamId=${c.id}`} className="card p-4 hover:shadow-md transition-all group">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-[#1a2e5a] flex items-center justify-center text-[#d4af37] font-black text-xs">
                    {c.gradeLevel?.replace('grade_','G').replace('_','').toUpperCase().slice(0,3)}
                  </div>
                  <ChevronRight size={16} className="text-theme-muted group-hover:text-theme-heading transition-colors"/>
                </div>
                <div className="font-bold text-theme-heading">{c.name}</div>
                <div className="text-xs text-theme-muted mt-0.5 flex items-center gap-1"><Users size={11}/> {c.learnersCount || 0} learners</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
