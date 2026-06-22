'use client';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home, CheckSquare, BarChart3, Calendar, BookOpen, Users,
  Sparkles, Bell, Menu, X, LogOut, GraduationCap, Sun, Moon, UserPlus, ClipboardCheck, FileText, ListChecks, ArrowLeft, Share2,
} from 'lucide-react';
import { useAuth, isTeacher } from '@/lib/hooks/useAuth';
import { ShareZaroda } from '@/components/ShareZaroda';
import { useTheme } from '@/lib/hooks/useTheme';

// Teacher-only navigation — nothing admin here
const TEACHER_NAV = [
  { href: '/teacher',            icon: Home,        label: 'My Dashboard' },
  { href: '/teacher/classes',    icon: Users,       label: 'My Classes' },
  { href: '/teacher/learners',   icon: UserPlus,    label: 'My Learners' },
  { href: '/teacher/attendance', icon: CheckSquare, label: 'Attendance' },
  { href: '/teacher/enter-marks', icon: BarChart3,   label: 'Enter Marks' },
  { href: '/teacher/mark-list',  icon: ListChecks,  label: 'Class Mark List' },
  { href: '/teacher/assessment', icon: ClipboardCheck, label: 'Assessment Rubric' },
  { href: '/teacher/report-card', icon: FileText, label: 'Report Card' },
  { href: '/dashboard/retooling', icon: GraduationCap, label: 'Retooling & CPD' },
  { href: '/teacher/timetable',  icon: Calendar,    label: 'My Timetable' },
  { href: '/teacher/records',    icon: Sparkles,    label: 'Schemes & Records' },
];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [showShare, setShowShare] = useState(false);
  const { theme, toggle } = useTheme();
  const router   = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ready, setReady] = useState(false);

  // Guard: only teachers may use this portal
  useEffect(() => {
    if (user === null) { router.replace('/auth/login'); return; }
    if (user && !isTeacher(user.role)) {
      // Admins/bursars/etc. belong in the admin dashboard
      router.replace('/dashboard');
      return;
    }
    if (user) setReady(true);
  }, [user, router]);

  if (!ready) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="text-theme-muted text-sm">Loading your workspace…</div>
    </div>;
  }

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase();
  const isActive = (href: string) => href === '/teacher' ? pathname === '/teacher' : pathname.startsWith(href);

  const Sidebar = () => (
    <>
      <div className="p-5 flex items-center gap-2.5">
        <img src="/zaroda-logo.png" alt="ZARODA" className="w-10 h-10 rounded-xl object-cover flex-shrink-0"/>
        <div>
          <div className="font-black text-white leading-tight text-[11px]">ZARODA SCHOOL</div>
          <div className="font-black text-[#fdba74] leading-tight text-[11px]">MANAGEMENT SYSTEM</div>
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {TEACHER_NAV.map(n => {
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                ${isActive(n.href) ? 'bg-[#2563eb] text-white' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}>
              <Icon size={18}/> {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-xs font-bold text-[#d4af37]">{initials}</div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{user?.firstName} {user?.lastName}</div>
            <div className="text-[10px] text-white/40">{user?.streamName || 'Teacher'}</div>
          </div>
        </div>
        <button onClick={() => setShowShare(true)}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-[#d4af37] hover:bg-white/10 w-full">
          <Share2 size={18}/> Refer a School
        </button>
        <button onClick={() => { logout(); router.replace('/auth/login'); }}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-white/65 hover:bg-white/10 hover:text-white w-full">
          <LogOut size={18}/> Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <aside className="hidden lg:flex flex-col w-64 flex-shrink-0" style={{ background: 'var(--sidebar)' }}>
        <Sidebar/>
      </aside>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)}/>
          <aside className="relative z-10 flex flex-col w-72 h-full" style={{ background: 'var(--sidebar)' }}>
            <button onClick={() => setSidebarOpen(false)} className="absolute top-4 right-4 text-white/50 hover:text-white"><X size={20}/></button>
            <Sidebar/>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex-shrink-0 h-14 px-4 flex items-center justify-between bg-surface" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 rounded-lg text-theme-heading hover:bg-surface-2"><Menu size={20}/></button>
            {pathname !== '/teacher' && (
              <button onClick={() => router.back()} title="Back" aria-label="Back"
                className="flex items-center gap-1 p-1.5 rounded-lg text-theme-muted hover:bg-surface-2 hover:text-theme-heading transition-colors">
                <ArrowLeft size={18}/>
                <span className="hidden sm:inline text-sm">Back</span>
              </button>
            )}
            <span className="text-sm font-medium text-theme-heading">
              {TEACHER_NAV.find(n => isActive(n.href))?.label || 'My Dashboard'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggle} className="p-2 rounded-xl text-theme-muted hover:bg-surface-2 hover:text-theme-heading">
              {theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}
            </button>
            <button className="relative p-2 rounded-xl text-theme-muted hover:bg-surface-2 hover:text-theme-heading">
              <Bell size={18}/><span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#f5820a] rounded-full"/>
            </button>
            <div className="w-8 h-8 rounded-xl bg-[#1a2e5a] flex items-center justify-center text-xs font-bold text-[#d4af37]">{initials}</div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 max-w-6xl mx-auto">{children}</div>
        </main>
      </div>
      {showShare && <ShareZaroda onClose={() => setShowShare(false)} />}
    </div>
  );
}
