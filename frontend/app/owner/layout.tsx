// app/owner/layout.tsx
// Platform-owner (super_admin) console shell: persistent sidebar + section nav.
'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Building2, Megaphone, GraduationCap, ShieldCheck, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';

const NAV = [
  { href: '/owner',               label: 'Overview',      icon: LayoutDashboard, exact: true },
  { href: '/owner/schools',       label: 'Schools',       icon: Building2 },
  { href: '/owner/communication', label: 'Communication', icon: Megaphone },
  { href: '/owner/retooling',     label: 'Retooling',     icon: GraduationCap },
];

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (user && user.role !== 'super_admin') router.replace('/dashboard');
  }, [user, router]);

  const isActive = (item: typeof NAV[number]) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <div className="min-h-screen flex bg-surface-2">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 bg-[#1a2e5a] text-white flex flex-col fixed inset-y-0 left-0 z-30">
        <div className="p-5 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-[#d4af37]">
            <ShieldCheck size={18}/>
          </div>
          <div>
            <div className="font-black text-sm leading-tight">ZARODA</div>
            <div className="text-[10px] text-white/60 uppercase tracking-wide">Platform Owner</div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
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

      {/* Content */}
      <main className="flex-1 ml-60 min-w-0">
        {children}
      </main>
    </div>
  );
}
