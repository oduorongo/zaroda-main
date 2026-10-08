'use client';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

export interface SimilarSchool { name: string; county: string | null; subCounty: string | null; knecHint: string | null }

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000') + '/api/v1';

/** Existing ZARODA schools whose name looks like this one. Empty on any error — never blocks signup by itself. */
export async function checkSimilarSchools(schoolName: string, county?: string): Promise<SimilarSchool[]> {
  try {
    const res = await fetch(`${API}/auth/similar-schools`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schoolName, county }),
    });
    return res.ok ? ((await res.json()).matches || []) : [];
  } catch { return []; }
}

export function SimilarSchoolsWarning({ matches, onConfirm, showLogin = true }: { matches: SimilarSchool[]; onConfirm: () => void; showLogin?: boolean }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3 text-sm text-amber-900">
      <div className="flex gap-2 font-bold"><AlertTriangle size={18} className="flex-shrink-0 text-amber-600"/> Is your school already on ZARODA?</div>
      <p className="text-xs">We found {matches.length === 1 ? 'a school' : 'schools'} with a similar name:</p>
      <ul className="space-y-1.5">
        {matches.map((m, i) => (
          <li key={i} className="bg-white rounded-lg border border-amber-200 px-3 py-2">
            <div className="font-semibold text-[#1a2e5a]">{m.name}</div>
            <div className="text-[11px] text-[#7a82a8]">{[m.subCounty, m.county].filter(Boolean).join(', ') || 'Location not set'}{m.knecHint ? ` · KNEC ${m.knecHint}` : ''}</div>
          </li>
        ))}
      </ul>
      <p className="text-xs">If one of these is your school, <b>do not sign up again</b> — ask its HOI or administrator to add you as a staff member{showLogin ? ', or log in if you already have an account' : ''}.</p>
      <div className="flex flex-wrap gap-2">
        {showLogin && <Link href="/auth/login" className="btn-primary text-xs justify-center flex-1">Log in instead</Link>}
        <button type="button" onClick={onConfirm} className="btn-ghost text-xs justify-center flex-1 border border-amber-300">This is a different school — continue</button>
      </div>
    </div>
  );
}
