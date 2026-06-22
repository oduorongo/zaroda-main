// app/owner/layout.tsx
// Platform-owner (super_admin) console shell: persistent sidebar + section nav.
'use client';
import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Building2, Megaphone, GraduationCap, ShieldCheck, LogOut, BookOpen, Menu, X } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';

const NAV = [
  { href: '/owner',               label: 'Overview',      icon: LayoutDashboard, exact: true },
  { href: '/owner/schools',       label: 'Schools',       icon: Building2 },
  { href: '/owner/rubrics',       label: 'Rubrics',       icon: BookOpen },
  { href: '/owner/communication', label: 'Communication', icon: Megaphone },
  { href: '/owner/retooling',     label: 'Retooling',     icon: GraduationCap },
];

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);  // mobile drawer

  useEffect(() => {
    if (user && user.role !== 'super_admin') router.replace('/dashboard');
  }, [user, router]);

  useEffect(() => { setOpen(false); }, [pathname]);  // close drawer on navigation

  const isActive = (item: typeof NAV[number]) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <div className="min-h-screen bg-surface-2">
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-40 flex items-center gap-2 bg-[#1a2e5a] text-white px-4 py-3">
        <button onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={22}/></button>
        <span className="font-black text-sm">ZARODA Owner</span>
      </div>

      {/* Backdrop (mobile only, when drawer open) */}
      {open && <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)}/>}

      {/* Sidebar: off-canvas drawer on mobile, fixed on desktop */}
      <aside className={`w-60 shrink-0 bg-[#1a2e5a] text-white flex flex-col fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="p-5 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-[#d4af37]">
            <ShieldCheck size={18}/>
          </div>
          <div className="flex-1">
            <div className="font-black text-sm leading-tight">ZARODA</div>
            <div className="text-[10px] text-white/60 uppercase tracking-wide">Platform Owner</div>
          </div>
          <button onClick={() => setOpen(false)} className="lg:hidden text-white/70" aria-label="Close menu"><X size={18}/></button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map(item => {
            const active = isActive(item);
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
                <item.icon size={17}/> {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="px-3 py-2 text-xs text-white/60 truncate">{user?.email}</div>
          <button onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white">
            <LogOut size={17}/> Sign out
          </button>
        </div>
      </aside>

      {/* Content: offset by sidebar width only on desktop */}
      <main className="lg:ml-60 min-w-0">
        {children}
      </main>
    </div>
  );
}
