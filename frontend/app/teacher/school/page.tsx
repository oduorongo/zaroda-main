// The four school-wide modules a teacher reaches from their own workspace.
//
// Deliberately NOT the admin /dashboard/school-life hub: that one also offers
// Sports and Discipline, which a teacher is redirected away from, so they would
// be tiles that bounce you straight back here.
'use client';
import Link from 'next/link';
import { BookOpen, CalendarDays, CalendarClock, GraduationCap, ChevronRight } from 'lucide-react';
import { useAuth, isIndividualAccount } from '@/lib/hooks/useAuth';

const CARDS = [
  // needsSchool: there is no school data behind this for an individual account,
  // so it is hidden rather than opening an empty page.
  { icon: BookOpen,      label: 'Library',     sub: 'Borrow & return books',          href: '/dashboard/library',     color: 'bg-[#1a2e5a]',  needsSchool: true },
  { icon: CalendarDays,  label: 'Duty Roster', sub: 'Your duty week & the calendar',  href: '/dashboard/duty-roster', color: 'bg-purple-600', needsSchool: true },
  { icon: CalendarClock, label: 'My Leave',    sub: 'Request and track leave',        href: '/dashboard/hr/leave',    color: 'bg-cyan-600',   needsSchool: true },
  { icon: GraduationCap, label: 'Retooling',   sub: 'Professional development',       href: '/dashboard/retooling',   color: 'bg-amber-600',  needsSchool: false },
];

export default function TeacherSchoolPage() {
  const { user } = useAuth();
  const individual = isIndividualAccount(user?.accountType);
  const cards = CARDS.filter(c => !c.needsSchool || !individual);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">School</h1>
          <p className="text-sm text-theme-muted mt-0.5">{cards.map(c => c.label).join(' · ')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
              <ChevronRight size={14} className="mx-auto mt-2 text-theme-muted group-hover:translate-x-0.5 transition-transform"/>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
