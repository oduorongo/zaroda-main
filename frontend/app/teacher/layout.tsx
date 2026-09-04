// Server Component wrapper — deliberately NOT 'use client', for the same reason as
// app/dashboard/layout.tsx: Next.js only honors `export const dynamic` from Server
// Component files. Every /teacher/* page is authenticated and personalized, and was
// confirmed (via `next build`) to be prerendered "○ Static" and served from Next.js's
// Full Route Cache — the same year-long stale-cache bug fixed on /dashboard.
export const dynamic = 'force-dynamic';

import TeacherLayoutClient from './teacher-layout-client';

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <TeacherLayoutClient>{children}</TeacherLayoutClient>;
}
