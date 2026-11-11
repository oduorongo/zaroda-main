'use client';
import Link from 'next/link';
import KjseaAnalysis from '@/components/KjseaAnalysis';

/** KJSEA results analysis for the school administration (they enter the points). */
export default function KjseaPage() {
  return (
    <div className="space-y-4">
      <Link href="/dashboard/academic" className="btn-ghost print:hidden">Back to Academic</Link>
      <KjseaAnalysis />
    </div>
  );
}
