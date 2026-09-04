// Server Component wrapper — deliberately NOT 'use client'. Next.js only honors
// route segment config exports (like `dynamic`) from Server Component files; the
// actual layout below (sidebar, nav, auth guard) is a Client Component and can't
// carry this export itself.
//
// Every /dashboard/* page is authenticated and personalized (role, tenant, wallet
// balance, etc.) — it must never be served from Next.js's Full Route Cache or any
// shared CDN cache. Without this, Next.js was treating these routes as static and
// handing out a year-old cached response (observed: `Cache-Control:
// s-maxage=31536000` / `x-nextjs-cache: HIT`) even though every deploy since had
// shipped real changes — confirmed by `next build` still marking every /dashboard
// route "○ (Static)" with only the client-side `export const dynamic` in place.
export const dynamic = 'force-dynamic';

import DashboardLayoutClient from './dashboard-layout-client';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayoutClient>{children}</DashboardLayoutClient>;
}
