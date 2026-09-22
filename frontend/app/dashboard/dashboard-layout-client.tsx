'use client';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home, BookOpen, DollarSign, MessageSquare, FileText,
  Library, Settings, HelpCircle, LogOut, Share2,
  Menu, X, ChevronRight, Users,
  GraduationCap, Heart, Backpack, Sun, Moon, ArrowLeft, TrendingUp,
  Bus, BookMarked, ExternalLink, ShieldCheck,
} from 'lucide-react';
import { useAuth, isHoi, isTeacher, isBursar, isParent, isLearner, isIndividualAccount, isProPlan } from '@/lib/hooks/useAuth';
import apiClient from '@/lib/api/client';
import { useTheme } from '@/lib/hooks/useTheme';
import { ShareZaroda } from '@/components/ShareZaroda';
import { NotificationBell } from '@/components/NotificationBell';
import clsx from 'clsx';
import toast from 'react-hot-toast';

// Individual accounts (a teacher without a school tenant — see migration 043) have
// no real school data behind any module except Professional Records, which they
// pay for and use directly, and Retooling, which is platform-wide content with
// nothing school-specific to be missing. Every other nav item exists (so the
// sidebar looks the same for everyone) but reminds them to sign up a school
// instead of opening a page with nothing in it.
const INDIVIDUAL_ALLOWED_HREFS = ['/dashboard/professional-records', '/dashboard/retooling', '/dashboard/upgrade-to-school'];

// ── Navigation definition ──────────────────────────────────
const NAV_ITEMS = [
  { href: '/dashboard',                        icon: Home,         label: 'Dashboard',            roles: 'staff' },
  { href: '/dashboard/professional-records',   icon: FileText,     label: 'Professional Records', roles: 'teacher', highlight: true },
  { href: '/dashboard/teacher',                icon: GraduationCap,label: 'My Workspace',         roles: 'teacher_only' },
  { href: '/dashboard/parent',                 icon: Heart,        label: 'My Children',          roles: 'parent_only' },
  { href: '/dashboard/learner',                icon: Backpack,     label: 'My Portal',            roles: 'learner_only' },
  { href: '/dashboard/academic',               icon: BookOpen,     label: 'Academic',             roles: 'all' },
  { href: '/dashboard/analytics',              icon: TrendingUp,   label: 'Analytics',            roles: 'admin' },
  { href: '/dashboard/finance',                icon: DollarSign,   label: 'Finance',              roles: 'finance' },
  { href: '/dashboard/transport',              icon: Bus,          label: 'Transport',            roles: 'finance', pro: true },
  // Subscription nav hidden for now — page still reachable directly, just not in the sidebar.
  { href: '/dashboard/communication',          icon: MessageSquare,label: 'Communication',        roles: 'parent_ok' },
  { href: '/dashboard/senior-selection',       icon: GraduationCap,label: 'Grade 10 Selection',   roles: 'parent_ok' },
  // Grouped the way Academic is: one entry opening a page of tiles, rather than
  // seven separate lines nobody scans to the bottom of. `match` keeps the parent
  // highlighted while you are inside one of its children, which still live at
  // their original paths so no existing link breaks.
  { href: '/dashboard/school-life',            icon: Library,      label: 'School Life',          roles: 'all',
    match: ['/dashboard/library', '/dashboard/sports', '/dashboard/discipline', '/dashboard/duty-roster'] },
  { href: '/dashboard/staff',                  icon: Users,        label: 'Staff',                roles: 'staff',
    match: ['/dashboard/hr', '/dashboard/retooling'] },
  { href: '/dashboard/compliance',             icon: ShieldCheck,  label: 'Data Protection',      roles: 'admin' },
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

export default function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
  const { user, hydrated, logout, refreshUser } = useAuth();
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

  // The cached user object is otherwise frozen at whatever it was at login —
  // refresh it once per app load so role/accountType/subjects changes made
  // server-side (a promotion, an individual-account conversion, etc.) actually
  // show up without forcing a logout/login.
  useEffect(() => {
    if (ready && user) refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

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
  const TEACHER_ALLOWED = ['/dashboard/library', '/dashboard/retooling', '/dashboard/professional-records', '/dashboard/duty-roster', '/dashboard/hr/leave',
    // The two hub pages themselves — without these a teacher clicking School Life
    // or Staff in the sidebar is bounced straight back to their own workspace.
    '/dashboard/school-life', '/dashboard/staff',
    // Individual (Professional Records) accounts carry the class_teacher role, so
    // without this the "set up a school account" page would bounce to /teacher.
    '/dashboard/upgrade-to-school'];
  // Fee collection is a class-teacher-only override (see settings/class-teacher-override) —
  // subject teachers with no class of their own have no reason to be here.
  const isClassTeacher = ['class_teacher', 'overall_class_teacher'].includes(user?.role || '');
  const teacherAllowedHere = TEACHER_ALLOWED.some(p => pathname.startsWith(p))
    || (isClassTeacher && pathname.startsWith('/dashboard/finance/payments'));

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

  const isActive = (href: string, match?: string[]) =>
    href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname.startsWith(href) || (match || []).some(m => pathname.startsWith(m));

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
          const active = isActive(item.href, (item as any).match);
          const blocked = isIndividualAccount(user.accountType) && !INDIVIDUAL_ALLOWED_HREFS.includes(item.href);
          return (
            <Link key={item.href} href={blocked ? '#' : item.href}
              onClick={(e) => {
                if (blocked) {
                  e.preventDefault();
                  toast((t) => (
                    <div className="text-sm">
                      <div className="font-semibold text-theme-heading">This needs a school account</div>
                      <div className="text-xs text-theme-muted mt-0.5 mb-2">Your individual account only includes Professional Records. Add your school to this same account to unlock the rest — you keep this login and everything you have already generated.</div>
                      <div className="flex gap-3">
                        {/* Must NOT point at /auth/signup: this email already owns a tenant,
                            so that form can only answer "account already exists". */}
                        <button onClick={() => { router.push('/dashboard/upgrade-to-school'); toast.dismiss(t.id); }} className="text-xs font-bold text-[#1a2e5a] underline">Set up a school account →</button>
                        <button onClick={() => { router.push('/auth/login'); toast.dismiss(t.id); }} className="text-xs font-bold text-[#1a2e5a] underline">Sign in →</button>
                      </div>
                    </div>
                  ), { duration: 8000 });
                  return;
                }
                setSidebarOpen(false);
              }}
              className={clsx('nav-item group', active && 'nav-item-active', (item as any).highlight && 'text-[#d4af37]')}>
              <Icon size={18} className="flex-shrink-0"/>
              <span className="flex-1">{item.label}</span>
              {(item as any).badge && (
                <span className="text-[9px] font-black bg-[#d4af37] text-[#0f1c38] px-1.5 py-0.5 rounded">
                  {(item as any).badge}
                </span>
              )}
              {(item as any).pro && !isProPlan(user.planTier) && (
                <span className="text-[9px] font-black border border-[#d4af37] text-[#d4af37] px-1.5 py-0.5 rounded">
                  PRO
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
        <a href="https://zarodabooks.com" target="_blank" rel="noopener noreferrer" className="nav-item">
          <BookMarked size={18}/> <span className="flex-1">Zaroda Books</span>
          <ExternalLink size={13} className="text-white/40"/>
        </a>
        <button onClick={() => { setShowShare(true); setSidebarOpen(false); }} className="nav-item w-full text-[#d4af37] hover:bg-white/10">
          <Share2 size={18}/> <span>Refer a School</span>
        </button>
        <button onClick={logout} className="nav-item w-full text-red-400/80 hover:text-red-400 hover:bg-red-500/10">
          <LogOut size={18}/> <span>Sign Out</span>
        </button>
        {/* Parents and staff must be able to reach these from inside the app, not
            only from the public landing page they may never see again. */}
        <div className="flex gap-3 px-3 pt-2 text-[10px] text-white/35">
          <Link href="/legal/privacy" onClick={() => setSidebarOpen(false)} className="hover:text-white/70">Privacy</Link>
          <Link href="/legal/terms" onClick={() => setSidebarOpen(false)} className="hover:text-white/70">Terms</Link>
        </div>
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
      <aside className="no-print hidden lg:flex flex-col w-64 flex-shrink-0" style={{ background: 'var(--sidebar)' }}>
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
        <header className="no-print flex-shrink-0 h-14 px-4 flex items-center justify-between bg-surface border-theme" style={{ borderBottom: '1px solid var(--border)' }}>
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
                {NAV_ITEMS.find(n => isActive(n.href, (n as any).match))?.label || 'Dashboard'}
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
            <NotificationBell/>
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
