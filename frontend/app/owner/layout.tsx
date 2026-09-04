// Server Component wrapper — deliberately NOT 'use client', same reason as
// app/dashboard/layout.tsx and app/teacher/layout.tsx: Next.js only honors
// `export const dynamic` from Server Component files. The owner console is
// authenticated/personalized and must never be served from a static cache.
export const dynamic = 'force-dynamic';

import OwnerLayoutClient from './owner-layout-client';

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return <OwnerLayoutClient>{children}</OwnerLayoutClient>;
}
