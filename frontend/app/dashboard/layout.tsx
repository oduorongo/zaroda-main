'use client';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home, BookOpen, DollarSign, MessageSquare, FileText,
  Library, Trophy, Scale, Settings, HelpCircle, LogOut,
  Bell, Menu, X, ChevronRight, Users, BarChart2,
  GraduationCap, Heart, Backpack, Sun, Moon, ArrowLeft,
} from 'lucide-react';
import { useAuth, isHoi, isTeacher, isBursar, isParent, isLearner } from '@/lib/hooks/useAuth';
import apiClient from '@/lib/api/client';
import { useTheme } from '@/lib/hooks/useTheme';
import clsx from 'clsx';

// ── Navigation definition ──────────────────────────────────
const NAV_ITEMS = [
  { href: '/dashboard',                        icon: Home,         label: 'Dashboard',            roles: 'all' },
  { href: '/dashboard/teacher',                icon: GraduationCap,label: 'My Workspace',         roles: 'teacher_only' },
  { href: '/dashboard/parent',                 icon: Heart,        label: 'My Children',          roles: 'parent_only' },
  { href: '/dashboard/learner',                icon: Backpack,     label: 'My Portal',            roles: 'learner_only' },
  { href: '/dashboard/academic',               icon: BookOpen,     label: 'Academic',             roles: 'all' },
  { href: '/dashboard/finance',                icon: DollarSign,   label: 'Finance',              roles: 'finance' },
  { href: '/dashboard/communication',          icon: MessageSquare,label: 'Communication',        roles: 'all' },
  { href: '/dashboard/professional-records',   icon: FileText,     label: 'Professional Records', roles: 'teacher' },
  // Library module deactivated — to be rebuilt afresh (does not match the envisioned design).
  // { href: '/dashboard/library',                icon: Library,      label: 'Library',              roles: 'all',   badge: 'FREE' },
  { href: '/dashboard/sports',                 icon: Trophy,       label: 'Sports',               roles: 'all' },
  { href: '/dashboard/discipline',             icon: Scale,        label: 'Discipline',           roles: 'all' },
];

function canSee(roleKey: string, userRole: string): boolean {
  if (roleKey === 'all') return true;
  if (roleKey === 'finance')      return isBursar(userRole);
  if (roleKey === 'teacher')      return isTeacher(userRole) || isHoi(userRole);
  if (roleKey === 'teacher_only') return isTeacher(userRole);
  if (roleKey === 'parent_only')  return isParent(userRole);
  if (roleKey === 'learner_only') return isLearner(userRole);
  return true;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const router   = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [schoolName, setSchoolName] = useState('');

  // Load the school name for the sidebar (from school settings).
  useEffect(() => {
    if (!user) return;
    apiClient.get('/schools/settings')
      .then(r => setSchoolName(r.data?.schoolName || ''))
      .catch(() => {});
  }, [user]);

  // Redirect if not logged in
  useEffect(() => {
    if (!user) { router.push('/auth/login'); return; }
    // Teachers have their own independent portal — keep them out of the admin dashboard
    if (isTeacher(user.role)) router.replace('/teacher');
  }, [user, router]);

  if (!user || isTeacher(user.role)) return null;

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
    </div>
  );
}
