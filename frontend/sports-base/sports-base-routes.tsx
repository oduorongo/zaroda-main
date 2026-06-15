// ============================================================
// ZARODA SPORTS BASE — Next.js App Router Pages
// These are thin wrappers — all logic lives in sports-base-pages.tsx
// ============================================================

// ─────────────────────────────────────────────────────────────
// app/sports-base/page.tsx — Championships browser
// ─────────────────────────────────────────────────────────────
// export { default } from '@/frontend/sports-base/sports-base-pages';


// ─────────────────────────────────────────────────────────────
// app/sports-base/championships/[id]/page.tsx
// ─────────────────────────────────────────────────────────────
'use client';
import { useParams }        from 'next/navigation';
import { ChampionshipHub }  from '@/frontend/sports-base/sports-base-pages';

export default function ChampionshipPage() {
  const { id } = useParams<{ id: string }>();
  return <ChampionshipHub id={id}/>;
}


// ─────────────────────────────────────────────────────────────
// Navbar integration — add Sports Base to the school SMS sidebar
// Paste this into your existing sidebar navigation component
// ─────────────────────────────────────────────────────────────
/*
  // In the Sports section of the school sidebar:
  <NavItem
    href="/dashboard/sports"
    icon="🏫"
    label="School Sports"
  />
  <NavItem
    href="/sports-base"
    icon="🏆"
    label="ZARODA Sports Base"
    badge="Base"
    badgeColor="orange"
    target="_blank"   // opens in new tab — it's a separate platform
  />
*/


// ─────────────────────────────────────────────────────────────
// tailwind.config additions needed for dark mode on this platform:
// ─────────────────────────────────────────────────────────────
/*
  In tailwind.config.ts — ensure these are present:
  content: ['./app/**', './frontend/**'],
  theme: {
    extend: {
      colors: {
        'sports-navy':  '#1a2e5a',
        'sports-deep':  '#0f1c38',
        'sports-gold':  '#d4af37',
        'sports-orange':'#f5820a',
      }
    }
  }
*/


// ─────────────────────────────────────────────────────────────
// SchoolPortalView — embed in school SMS sports dashboard
// Shows a school's athletes at a Base championship in-context
// Usage in /dashboard/sports page:
// ─────────────────────────────────────────────────────────────
export { SchoolPortalView } from '@/frontend/sports-base/sports-base-pages';

/*
  // In school sports dashboard, for each active qualification with base_championship_id:
  {qualifications
    .filter(q => q.baseChampionshipId && q.status === 'registered')
    .map(q => (
      <SchoolPortalView
        key={q.id}
        champId={q.baseChampionshipId}
        tenantId={currentTenantId}
      />
    ))
  }
*/


// ─────────────────────────────────────────────────────────────
// PDF Bib Sheet button — wire into Base championship athlete list
// ─────────────────────────────────────────────────────────────
import { BibSheetButton } from '@/components/pdf/pdf-buttons';

export function BaseChampionshipActions({
  championshipId,
  schoolId,
  champName,
}: {
  championshipId: string;
  schoolId?: string;
  champName: string;
}) {
  return (
    <div className="flex gap-3 items-center">
      <BibSheetButton
        championshipId={championshipId}
        schoolId={schoolId}
        champName={champName}
      />
      <a
        href={`/api/v1/sports/base/championships/${championshipId}/athletes${schoolId ? `?tenantId=${schoolId}` : ''}`}
        download
        className="px-4 py-2 border border-[#1a2e5a]/20 text-[#1a2e5a] text-sm rounded-lg hover:bg-[#f4f6fb]"
      >
        ↓ Athletes CSV
      </a>
    </div>
  );
}
