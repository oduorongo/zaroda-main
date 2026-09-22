// A hub for the modules that are about school life rather than academics or
// money. They were four separate sidebar entries; the sidebar had grown past
// what anyone scans, so they are gathered here the way Academic gathers its own.
'use client';
import Link from 'next/link';
import { Library, Trophy, Scale, CalendarDays, ChevronRight } from 'lucide-react';

const CARDS = [
  { icon: Library,      label: 'Library',      sub: 'Books, copies & loans',          href: '/dashboard/library',     color: 'bg-[#1a2e5a]' },
  { icon: Trophy,       label: 'Sports',       sub: 'Teams, fixtures & athletics',    href: '/dashboard/sports',      color: 'bg-emerald-600' },
  { icon: Scale,        label: 'Discipline',   sub: 'Incidents & counselling',        href: '/dashboard/discipline',  color: 'bg-rose-600' },
  { icon: CalendarDays, label: 'Duty Roster',  sub: 'Teacher duty & school calendar', href: '/dashboard/duty-roster', color: 'bg-purple-600' },
];

export default function SchoolLifePage() {
  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">School Life</h1>
          <p className="text-sm text-theme-muted mt-0.5">Library · Sports · Discipline · Duty Roster &amp; Calendar</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {CARDS.map(c => {
          const Icon = c.icon;
          return (
            <Link key={c.href} href={c.href}
              className="card p-5 hover:shadow-md hover:-translate-y-0.5 transition-all group text-center">
              <div className={`w-12 h-12 rounded-2xl ${c.color} flex items-center justify-center mx-auto mb-3`}>
                <Icon size={22} className="text-white"/>
              </div>
              <div className="font-bold text-theme-heading text-sm">{c.label}</div>
              <div className="text-xs text-theme-muted mt-0.5">{c.sub}</div>
              <ChevronRight size={14} className="mx-auto mt-2 text-theme-muted group-hover:translate-x-0.5 transition-transform"/>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
