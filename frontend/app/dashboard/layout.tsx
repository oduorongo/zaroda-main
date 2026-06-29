'use client';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home, BookOpen, DollarSign, MessageSquare, FileText,
  Library, Trophy, Scale, Settings, HelpCircle, LogOut, Share2,
  Bell, Menu, X, ChevronRight, Users, BarChart2,
  GraduationCap, Heart, Backpack, Sun, Moon, ArrowLeft, TrendingUp,
} from 'lucide-react';
import { useAuth, isHoi, isTeacher, isBursar, isParent, isLearner } from '@/lib/hooks/useAuth';
import apiClient from '@/lib/api/client';
import { useTheme } from '@/lib/hooks/useTheme';
import { ShareZaroda } from '@/components/ShareZaroda';
import clsx from 'clsx';

// ── Navigation definition ──────────────────────────────────
const NAV_ITEMS = [
  { href: '/dashboard',                        icon: Home,         label: 'Dashboard',            roles: 'staff' },
  { href: '/dashboard/teacher',                icon: GraduationCap,label: 'My Workspace',         roles: 'teacher_only' },
  { href: '/dashboard/parent',                 icon: Heart,        label: 'My Children',          roles: 'parent_only' },
  { href: '/dashboard/learner',                icon: Backpack,     label: 'My Portal',            roles: 'learner_only' },
  { href: '/dashboard/academic',               icon: BookOpen,     label: 'Academic',             roles: 'all' },
  { href: '/dashboard/analytics',              icon: TrendingUp,   label: 'Analytics',            roles: 'admin' },
  { href: '/dashboard/finance',                icon: DollarSign,   label: 'Finance',              roles: 'finance' },
  { href: '/dashboard/communication',          icon: MessageSquare,label: 'Communication',        roles: 'parent_ok' },
  { href: '/dashboard/professional-records',   icon: FileText,     label: 'Professional Records', roles: 'teacher' },
  { href: '/dashboard/retooling',              icon: GraduationCap,label: 'Retooling',      roles: 'staff' },
  { href: '/dashboard/library',                icon: Library,      label: 'Library',              roles: 'all' },
  { href: '/dashboard/sports',                 icon: Trophy,       label: 'Sports',               roles: 'staff' },
  { href: '/dashboard/discipline',             icon: Scale,        label: 'Discipline',           roles: 'staff' },
];

function canSee(roleKey: string, userRole: string): boolean {
  // Parents and learners get a deliberately focused menu — their portal, the home
  // dashboard, and communication. They do NOT see staff/admin modules.
  if (isParent(userRole)) {
    return ['parent_only', 'parent_ok'].includes(roleKey);
  }
  if (isLearner(userRole)) {
    return ['learner_only', 'learner_ok'].includes(roleKey);
  }
  if (roleKey === 'all') return true;          // all STAFF (parents/learners handled above)
  if (roleKey === 'staff') return true;        // staff-only modules
  if (roleKey === 'parent_ok' || roleKey === 'learner_ok') return true;  // staff also see these
  if (roleKey === 'finance')      return isBursar(userRole);
  if (roleKey === 'teacher')      return isTeacher(userRole) || isHoi(userRole);
  if (roleKey === 'admin')        return isHoi(userRole);
  if (roleKey === 'teacher_only') return isTeacher(userRole);
  if (roleKey === 'parent_only')  return isParent(userRole);
  if (roleKey === 'learner_only') return isLearner(userRole);
  return true;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, hydrated, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const router   = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [schoolName, setSchoolName] = useState('');

  const [ready, setReady] = useState(false);
  // Belt-and-braces: once mounted on the client, give hydration a tick to settle, then
  // proceed regardless. This guarantees the app can never get permanently stuck behind the
  // hydration gate even if the store's rehydrate callback misbehaves.
  useEffect(() => {
    if (hydrated) { setReady(true); return; }
    const t = setTimeout(() => setReady(true), 150);
    return () => clearTimeout(t);
  }, [hydrated]);

  // Load the school name for the sidebar (from school settings).
  useEffect(() => {
    if (!user) return;
    apiClient.get('/schools/settings')
      .then(r => setSchoolName(r.data?.schoolName || ''))
      .catch(() => {});
  }, [user]);

  // Redirect if not logged in — but ONLY after hydration has settled, so a momentary null
  // during a full-reload navigation doesn't bounce a logged-in user to login.
  // Dashboard pages teachers ARE allowed to open (shared modules), despite otherwise being
  // routed to their own /teacher workspace.
  const TEACHER_ALLOWED = ['/dashboard/library', '/dashboard/retooling'];
  const teacherAllowedHere = TEACHER_ALLOWED.some(p => pathname.startsWith(p));

  useEffect(() => {
    if (!ready) return;
    if (!user) { router.push('/auth/login'); return; }
    if (isTeacher(user.role) && !teacherAllowedHere) router.replace('/teacher');
  }, [user, ready, router, teacherAllowedHere]);

  if (!ready) return null;
  if (!user) return null;
  if (isTeacher(user.role) && !teacherAllowedHere) return null;

  const navItems = NAV_ITEMS.filter(n => canSee(n.roles, user.role));
  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  const SidebarContent = () => (
    <>
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <img src="/zaroda-logo.png" alt="ZARODA" className="w-10 h-10 rounded-xl object-cover flex-shrink-0"/>
          <div>
            <div className="text-white font-black text-[11px] tracking-wide leading-tight">ZARODA SCHOOL</div>
            <div className="text-[#fdba74] font-black text-[11px] tracking-wide leading-tight">MANAGEMENT SYSTEM</div>
          </div>
        </div>
      </div>

      {/* School info */}
      <div className="px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="text-xs text-white/40 uppercase tracking-wide mb-0.5">School</div>
        <div className="text-sm text-white font-medium truncate">{schoolName || 'Your School'}</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(item => {
          const Icon   = item.icon;
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={clsx('nav-item group', active && 'nav-item-active')}>
              <Icon size={18} className="flex-shrink-0"/>
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className="text-[9px] font-black bg-[#d4af37] text-[#0f1c38] px-1.5 py-0.5 rounded">
                  {item.badge}
                </span>
              )}
              {active && <div className="w-1 h-4 bg-[#d4af37] rounded-full"/>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-3 py-3 border-t border-white/10 flex-shrink-0 space-y-0.5">
        <Link href="/dashboard/help" onClick={() => setSidebarOpen(false)} className="nav-item">
          <HelpCircle size={18}/> <span>Help & Guide</span>
        </Link>
        <Link href="/dashboard/settings" onClick={() => setSidebarOpen(false)} className="nav-item">
          <Settings size={18}/> <span>Settings</span>
        </Link>
        <button onClick={() => { setShowShare(true); setSidebarOpen(false); }} className="nav-item w-full text-[#d4af37] hover:bg-white/10">
          <Share2 size={18}/> <span>Refer a School</span>
        </button>
        <button onClick={logout} className="nav-item w-full text-red-400/80 hover:text-red-400 hover:bg-red-500/10">
          <LogOut size={18}/> <span>Sign Out</span>
        </button>
      </div>

      {/* User */}
      <div className="px-4 py-4 border-t border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#d4af37]/20 border border-[#d4af37]/30 flex items-center justify-center text-xs font-bold text-[#d4af37] flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white truncate">{user.firstName} {user.lastName}</div>
            <div className="text-[10px] text-white/40 capitalize truncate">{user.role.replace(/_/g, ' ')}</div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* ── Desktop sidebar ──────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 flex-shrink-0" style={{ background: 'var(--sidebar)' }}>
        <SidebarContent/>
      </aside>

      {/* ── Mobile sidebar overlay ────────────────────────── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)}/>
          <aside className="relative z-10 flex flex-col w-72 h-full shadow-2xl" style={{ background: 'var(--sidebar)' }}>
            <button onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 text-white/50 hover:text-white">
              <X size={20}/>
            </button>
            <SidebarContent/>
          </aside>
        </div>
      )}

      {/* ── Main content ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex-shrink-0 h-14 px-4 flex items-center justify-between bg-surface border-theme" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-lg text-theme-heading hover:bg-surface-2">
              <Menu size={20}/>
            </button>
            {/* Back — shown on every page except the dashboard root */}
            {pathname !== '/dashboard' && (
              <button onClick={() => router.back()} title="Back" aria-label="Back"
                className="flex items-center gap-1 p-1.5 rounded-lg text-theme-muted hover:bg-surface-2 hover:text-theme-heading transition-colors">
                <ArrowLeft size={18}/>
                <span className="hidden sm:inline text-sm">Back</span>
              </button>
            )}
            {/* Breadcrumb */}
            <div className="hidden sm:flex items-center gap-1.5 text-sm text-theme-muted">
              <span className="font-medium text-theme-heading">
                {NAV_ITEMS.find(n => isActive(n.href))?.label || 'Dashboard'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            <button onClick={toggle} title="Toggle dark / light"
              className="p-2 rounded-xl text-theme-muted hover:bg-surface-2 hover:text-theme-heading transition-colors">
              {theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}
            </button>
            {/* Notifications */}
            <button className="relative p-2 rounded-xl text-theme-muted hover:bg-surface-2 hover:text-theme-heading transition-colors">
              <Bell size={18}/>
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#f5820a] rounded-full"/>
            </button>
            {/* Avatar */}
            <div className="w-8 h-8 rounded-xl bg-[#1a2e5a] flex items-center justify-center text-xs font-bold text-[#d4af37]">
              {initials}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
      {showShare && <ShareZaroda onClose={() => setShowShare(false)} />}
    </div>
  );
}
