'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// The teacher experience now lives in its own independent portal at /teacher.
// This route just forwards there for any old links.
export default function DashboardTeacherRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/teacher'); }, [router]);
  return <div className="p-8 text-center text-theme-muted text-sm">Taking you to your workspace…</div>;
}
