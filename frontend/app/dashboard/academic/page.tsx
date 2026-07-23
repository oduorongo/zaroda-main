'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, Grid, CheckSquare, FileText, Calendar, Search, Plus, ChevronRight, BarChart3, ClipboardList, UserPlus, UserCheck, GraduationCap, Calculator, FileStack } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, isHoi } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

export default function AcademicPage() {
  const { user } = useAuth();
  const [streams,  setStreams]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    apiClient.get('/academic/streams')
      .then(r => setStreams(r.data))
      .catch(() => toast.error('Could not load streams'))
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    { icon: UserPlus,   label: 'Admissions',    sub: 'Full learner intake', href: '/dashboard/academic/admissions',   color: 'bg-teal-600'  },
    { icon: Users,      label: 'Learners',      sub: 'Register & manage',  href: '/dashboard/academic/learners',     color: 'bg-[#1a2e5a]' },
    { icon: Grid,       label: 'Streams',       sub: 'Streams & teachers', href: '/dashboard/academic/streams',      color: 'bg-blue-600'  },
    { icon: CheckSquare,label: 'Attendance',    sub: 'Daily roll call',    href: '/dashboard/academic/attendance',   color: 'bg-green-600' },
    { icon: Calendar,   label: 'Timetable',     sub: 'KICD CBC schedule',  href: '/dashboard/academic/timetable',    color: 'bg-purple-600'},
    { icon: FileText,   label: 'Report Cards',  sub: 'CBC assessments',    href: '/dashboard/academic/report-cards', color: 'bg-[#f5820a]' },
    { icon: BarChart3,  label: 'Mark List',     sub: 'Raw scores → ranking',href: '/dashboard/academic/mark-list',   color: 'bg-rose-600'  },
    { icon: Calculator, label: 'Enter Marks',   sub: 'Add marks for a teacher', href: '/dashboard/academic/enter-marks', color: 'bg-pink-600' },
    { icon: FileStack,  label: 'Paper 1 & 2 Setup', sub: 'Flag multi-paper subjects', href: '/dashboard/academic/subject-papers', color: 'bg-violet-600' },
    { icon: FileText,   label: 'Term Report',   sub: 'Per-assessment levels', href: '/dashboard/academic/term-report', color: 'bg-[#1a2e5a]' },
    { icon: ClipboardList, label: 'Assessment Book', sub: 'KICD rubric per learner', href: '/dashboard/academic/assessment-book', color: 'bg-amber-600' },
    { icon: ClipboardList, label: 'Exams & CATs',sub: 'Assessments setup',  href: '/dashboard/academic/exams',       color: 'bg-indigo-600'},
    { icon: UserCheck,  label: 'Allocation',    sub: 'Subjects & teachers', href: '/dashboard/academic/allocation',   color: 'bg-cyan-600'  },
    { icon: GraduationCap, label: 'Teachers',   sub: 'Onboard & subjects', href: '/dashboard/academic/teachers',     color: 'bg-emerald-600'},
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Academic Core</h1>
          <p className="text-sm text-theme-muted mt-0.5">Learners · Streams · Attendance · CBC Report Cards · KICD Timetable</p>
        </div>
        {isHoi(user?.role || '') && (
          <Link href="/dashboard/academic/learners" className="btn-primary">
            <Plus size={16}/> Add Learner
          </Link>
        )}
      </div>

      {/* Module tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <Link key={c.href} href={c.href}
              className="card p-5 hover:shadow-md hover:-translate-y-0.5 transition-all group text-center">
              <div className={`w-12 h-12 rounded-2xl ${c.color} flex items-center justify-center mx-auto mb-3`}>
                <Icon size={22} className="text-white"/>
              </div>
              <div className="font-bold text-theme-heading text-sm">{c.label}</div>
              <div className="text-xs text-theme-muted mt-0.5">{c.sub}</div>
            </Link>
          );
        })}
      </div>

      {/* Streams list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title mb-0">Streams / Classes</h2>
          {isHoi(user?.role || '') && (
            <Link href="/dashboard/academic/streams" className="text-sm text-[#f5820a] font-semibold hover:underline">
              Manage →
            </Link>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1,2,3].map(i => <div key={i} className="h-24 shimmer rounded-2xl"/>)}
          </div>
        ) : streams.length === 0 ? (
          <div className="card p-10 text-center">
            <Grid size={36} className="mx-auto text-[#e2e6f0] mb-3"/>
            <p className="text-theme-muted font-medium">No streams yet</p>
            {isHoi(user?.role || '') && (
              <Link href="/dashboard/academic/streams" className="btn-primary mt-4 inline-flex">
                <Plus size={16}/> Create First Stream
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {streams.map((s: any) => (
              <Link key={s.id} href={`/dashboard/academic/learners?streamId=${s.id}`}
                className="card p-4 hover:shadow-md transition-all group">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-[#1a2e5a] flex items-center justify-center text-[#d4af37] font-black text-sm">
                    {s.gradeLevel?.replace('grade_','G').replace('_','')}
                  </div>
                  <ChevronRight size={16} className="text-[#e2e6f0] group-hover:text-theme-heading transition-colors"/>
                </div>
                <div className="font-bold text-theme-heading">{s.name}</div>
                <div className="text-xs text-theme-muted mt-0.5">
                  {s.learnersCount || 0} learners ({s.boys || 0} B · {s.girls || 0} G) · {s.classTeacherName || 'No teacher assigned'}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
