'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Users, DollarSign, BookOpen, GraduationCap, TrendingUp, TrendingDown,
  Calendar, CheckCircle, FileText, Library, Trophy, Scale, ArrowRight,
  MessageSquare, UserPlus, ClipboardList, CheckSquare, BarChart3, Star, Heart,
} from 'lucide-react';
import { useAuth, isHoi, isParent, isLearner } from '@/lib/hooks/useAuth';
import apiClient from '@/lib/api/client';

// ── Overview stat card (matches the design) ────────────────
function StatCard({ icon: Icon, label, value, trend, trendUp, iconBg }: any) {
  return (
    <div className="card p-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${iconBg}`}>
        <Icon size={20} className="text-white"/>
      </div>
      <div className="text-2xl font-black text-theme-heading leading-none">{value}</div>
      <div className="text-sm text-theme-muted mt-1">{label}</div>
      {trend && (
        <div className={`flex items-center gap-1 text-xs font-semibold mt-2 ${trendUp ? 'text-green-500' : 'text-red-400'}`}>
          {trendUp ? <TrendingUp size={12}/> : <TrendingDown size={12}/>} {trend}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user }   = useAuth();
  const router     = useRouter();
  const [stats, setStats]     = useState<any>({});
  const [loading, setLoading] = useState(true);

  // Parents and learners must not see the school-wide dashboard — send them to their
  // own portal, which is scoped to just their data.
  useEffect(() => {
    if (!user) return;
    if (isParent(user.role))  { router.replace('/dashboard/parent'); return; }
    if (isLearner(user.role)) { router.replace('/dashboard/learner'); return; }
  }, [user, router]);

  useEffect(() => {
    if (!user || isParent(user.role) || isLearner(user.role)) return;
    apiClient.get('/academic/dashboard').then(r => setStats(r.data)).catch(()=>setStats({})).finally(()=>setLoading(false));
  }, [user]);

  if (!user) return null;
  if (isParent(user.role) || isLearner(user.role)) return null;  // redirecting

  const OVERVIEW = [
    { icon: Users,        label: 'Students',       value: (stats.totalPopulation ?? stats.totalLearners ?? 0).toLocaleString('en-KE'), trend: `${stats.boys ?? 0} boys · ${stats.girls ?? 0} girls`,  trendUp: true,  iconBg: 'bg-blue-600' },
    { icon: GraduationCap,label: 'Teachers',       value: stats.totalTeachers ?? 0,  trend: `${stats.maleTeachers ?? 0} male · ${stats.femaleTeachers ?? 0} female`,  trendUp: true,  iconBg: 'bg-purple-600' },
    { icon: Heart,        label: 'Parents',        value: stats.parentCount ?? 0,    trend: 'By unique phone', trendUp: true, iconBg: 'bg-rose-600' },
    { icon: BookOpen,     label: 'Classes',        value: stats.totalStreams ?? 0,   trend: 'Streams',  trendUp: true,  iconBg: 'bg-amber-500' },
    { icon: CheckCircle,  label: 'Attendance',     value: `${stats.attendanceRate ?? 0}%`, trend: 'Last 30 days', trendUp: true, iconBg: 'bg-green-600' },
  ];

  const QUICK = [
    { icon: UserPlus,     label: 'Add Student',     href: '/dashboard/academic/admissions', color: 'bg-blue-600' },
    { icon: GraduationCap,label: 'Add Teacher',     href: '/dashboard/academic/teachers',   color: 'bg-purple-600' },
    { icon: BookOpen,     label: 'Create Class',    href: '/dashboard/academic',            color: 'bg-cyan-600' },
    { icon: CheckSquare,  label: 'Take Attendance', href: '/dashboard/academic/attendance', color: 'bg-green-600' },
    { icon: DollarSign,   label: 'Record Fees',     href: '/dashboard/finance',             color: 'bg-[#f5820a]' },
    { icon: ClipboardList,label: 'Assign Homework', href: '/dashboard/professional-records',color: 'bg-rose-600' },
    { icon: MessageSquare,label: 'Send Message',    href: '/dashboard/communication',       color: 'bg-indigo-600' },
    { icon: BarChart3,    label: 'Generate Report', href: '/dashboard/academic/mark-list',  color: 'bg-teal-600' },
  ];

  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const EVENTS = (stats.upcomingEvents || []).map((e: any) => {
    const d = e.startDate ? new Date(e.startDate) : null;
    return {
      d: d ? String(d.getDate()).padStart(2, '0') : '--',
      m: d ? MONTHS[d.getMonth()] : '',
      title: e.name || (e.examType || 'Assessment').replace('_', ' '),
      sub: (e.term || '').replace('term_', 'Term '),
      time: d ? d.toLocaleDateString('en-KE', { weekday: 'short' }) : '',
    };
  });

  const TOP_CLASSES = (stats.topClasses || []).map((c: any) => ({ name: c.name, score: c.score }));

  return (
    <div className="space-y-6">
      {/* ── Welcome hero ── */}
      <div className="card p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-60 h-60 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, var(--brand-gold), transparent 70%)' }}/>
        <div className="relative">
          <p className="text-sm text-theme-muted">Welcome back, {user.firstName}! 👋</p>
          <h1 className="text-2xl sm:text-3xl font-black text-theme-heading mt-1 tracking-tight">
            EMPOWERING SCHOOLS WITH TECHNOLOGY
          </h1>
          <p className="text-sm text-theme-muted mt-1">One system. Every student. Total control.</p>
        </div>
      </div>

      {/* ── Overview ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={16} className="text-[#d4af37]"/>
          <h2 className="font-bold text-theme-heading">Overview</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {loading
            ? [1,2,3,4,5].map(i=><div key={i} className="h-32 shimmer"/>)
            : OVERVIEW.map(s => <StatCard key={s.label} {...s}/>)}
        </div>
      </div>

      {/* ── School population breakdown (items 10 & 11) ── */}
      <div className="card p-5">
        <h3 className="font-bold text-theme-heading mb-4">School Population</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-surface-2 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-blue-500">{loading ? '…' : (stats.boys ?? 0).toLocaleString('en-KE')}</div>
            <div className="text-xs text-theme-muted mt-1">Boys</div>
          </div>
          <div className="bg-surface-2 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-rose-500">{loading ? '…' : (stats.girls ?? 0).toLocaleString('en-KE')}</div>
            <div className="text-xs text-theme-muted mt-1">Girls</div>
          </div>
          <div className="bg-surface-2 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-theme-heading">{loading ? '…' : (stats.totalPopulation ?? 0).toLocaleString('en-KE')}</div>
            <div className="text-xs text-theme-muted mt-1">Total Learners</div>
          </div>
          <div className="bg-surface-2 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-purple-500">{loading ? '…' : (stats.parentCount ?? 0).toLocaleString('en-KE')}</div>
            <div className="text-xs text-theme-muted mt-1">Parents</div>
          </div>
        </div>
        {stats.unspecified > 0 && (
          <p className="text-xs text-theme-muted mt-3">{stats.unspecified} learner(s) have no gender recorded — update their records for an accurate split.</p>
        )}
      </div>

      {/* ── Middle row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Enrollment chart (lightweight SVG) */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-theme-heading">Student Enrollment</h3>
            <span className="text-xs text-theme-muted bg-surface-2 px-2 py-1 rounded-lg">This Term</span>
          </div>
          <EnrollmentChart series={stats.enrollmentTrend}/>
          <div className="flex gap-6 mt-4 pt-4 border-theme" style={{ borderTop: '1px solid var(--border)' }}>
            <div><div className="text-xs text-theme-muted">Total Students</div><div className="font-black text-theme-heading">{(stats.totalLearners ?? 1256).toLocaleString('en-KE')}</div></div>
            <div><div className="text-xs text-theme-muted">New Admissions</div><div className="font-black text-theme-heading">{stats.newAdmissions ?? 128}</div></div>
          </div>
        </div>

        {/* Attendance donut */}
        <div className="card p-5">
          <h3 className="font-bold text-theme-heading mb-4">Attendance Overview</h3>
          <AttendanceDonut present={stats.present ?? 92} absent={stats.absent ?? 6} late={stats.late ?? 2}/>
        </div>
      </div>

      {/* ── Bottom row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Quick actions */}
        <div className="card p-5">
          <h3 className="font-bold text-theme-heading mb-4">Quick Actions</h3>
          <div className="grid grid-cols-4 gap-3">
            {QUICK.map(q => {
              const Icon = q.icon;
              return (
                <Link key={q.label} href={q.href} className="flex flex-col items-center gap-1.5 text-center group">
                  <div className={`w-11 h-11 rounded-xl ${q.color} flex items-center justify-center group-hover:-translate-y-0.5 transition-transform`}>
                    <Icon size={18} className="text-white"/>
                  </div>
                  <span className="text-[10px] font-medium text-theme-muted leading-tight">{q.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Upcoming events */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-theme-heading">Upcoming Events</h3>
          </div>
          <div className="space-y-3">
            {EVENTS.length === 0 ? (
              <p className="text-sm text-theme-muted py-4">No upcoming assessments scheduled. Create an assessment with a date to see it here.</p>
            ) : EVENTS.map((e: any) => (
              <div key={e.title} className="flex gap-3">
                <div className="w-10 text-center flex-shrink-0">
                  <div className="text-base font-black text-theme-heading leading-none">{e.d}</div>
                  <div className="text-[9px] text-theme-muted font-bold">{e.m}</div>
                </div>
                <div className="flex-1 min-w-0 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="text-sm font-semibold text-theme-heading truncate">{e.title}</div>
                  <div className="text-xs text-theme-muted">{e.sub}{e.time ? ` · ${e.time}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top performing classes */}
        <div className="card p-5">
          <h3 className="font-bold text-theme-heading mb-4">Top Performing Classes</h3>
          <div className="space-y-3">
            {TOP_CLASSES.length === 0 ? (
              <p className="text-sm text-theme-muted py-4">No marks recorded yet. Rankings appear once teachers enter marks.</p>
            ) : TOP_CLASSES.map((c: any, i: number) => (
              <div key={c.name} className="flex items-center gap-3">
                <span className="text-sm font-black text-theme-muted w-4">{i+1}</span>
                <Star size={15} className="text-[#d4af37] fill-[#d4af37]"/>
                <span className="flex-1 text-sm font-semibold text-theme-heading">{c.name}</span>
                <span className="text-sm font-black text-green-500">{c.score}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Assessment upload progress (admin/HOI) */}
      {isHoi(user.role) && (stats.assessmentProgress || []).length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-1">
            <ClipboardList size={18} className="text-[#1a2e5a]"/>
            <h3 className="font-bold text-theme-heading">Assessment Upload Progress</h3>
          </div>
          <p className="text-xs text-theme-muted mb-4">How many learners have marks entered for each created assessment.</p>
          <div className="space-y-3">
            {(stats.assessmentProgress || []).map((a: any) => (
              <div key={a.id}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-semibold text-theme-heading truncate">{a.name || (a.examType || '').replace('_',' ')} <span className="text-theme-muted font-normal">· {(a.term||'').replace('term_','Term ')}</span></span>
                  <span className="text-theme-muted">{a.entered}/{a.total} ({a.percent}%)</span>
                </div>
                <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${a.percent}%`, background: a.percent >= 80 ? '#16a34a' : a.percent >= 40 ? '#d4af37' : '#f5820a' }}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Lightweight enrollment line chart (SVG, theme-aware) ────
function EnrollmentChart({ series }: { series?: { label: string; total: number }[] }) {
  const data = (series && series.length) ? series : [];
  if (!data.length) {
    return <div className="h-[120px] flex items-center justify-center text-sm text-theme-muted">Enrollment trend appears as learners are admitted.</div>;
  }
  const pts = data.map(d => d.total);
  const months = data.map(d => d.label);
  const max = Math.max(10, ...pts) * 1.1, w = 520, h = 150, pad = 10;
  const stepX = (w - pad*2) / Math.max(1, pts.length - 1);
  const coords = pts.map((v, i) => [pad + i*stepX, h - pad - (v/max)*(h - pad*2)]);
  const path = coords.map((c, i) => `${i===0?'M':'L'} ${c[0]} ${c[1]}`).join(' ');
  const area = `${path} L ${coords[coords.length-1][0]} ${h-pad} L ${coords[0][0]} ${h-pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h+20}`} className="w-full">
      <defs>
        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill="url(#ag)"/>
      <path d={path} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      {coords.map((c, i) => <circle key={i} cx={c[0]} cy={c[1]} r="3.5" fill="#2563eb"/>)}
      {coords.map((c, i) => (
        <text key={i} x={c[0]} y={h+14} textAnchor="middle" fontSize="9" fill="var(--text-muted)">{months[i]}</text>
      ))}
    </svg>
  );
}

// ── Attendance donut (SVG, theme-aware) ────────────────────
function AttendanceDonut({ present, absent, late }: { present:number; absent:number; late:number }) {
  const r = 54, c = 2*Math.PI*r;
  const seg = (val:number) => (val/100)*c;
  let offset = 0;
  const arcs = [
    { val: present, color: '#22c55e' },
    { val: absent,  color: '#f5820a' },
    { val: late,    color: '#eab308' },
  ];
  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-shrink-0">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="14"/>
          {arcs.map((a, i) => {
            const dash = `${seg(a.val)} ${c - seg(a.val)}`;
            const el = <circle key={i} cx="70" cy="70" r={r} fill="none" stroke={a.color}
              strokeWidth="14" strokeDasharray={dash} strokeDashoffset={-offset}
              transform="rotate(-90 70 70)" strokeLinecap="round"/>;
            offset += seg(a.val);
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-black text-theme-heading">{present}%</div>
          <div className="text-[9px] text-theme-muted">Overall</div>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <Legend color="#22c55e" label="Present" val={present}/>
        <Legend color="#f5820a" label="Absent"  val={absent}/>
        <Legend color="#eab308" label="Late"    val={late}/>
      </div>
    </div>
  );
}
function Legend({ color, label, val }: any) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }}/>
      <span className="text-theme-muted">{label}</span>
      <span className="font-bold text-theme-heading ml-auto">{val}%</span>
    </div>
  );
}
