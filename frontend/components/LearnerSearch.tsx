// components/LearnerSearch.tsx
// Small reusable search box + filter helper for any page that lists learners.
// Filters by learner name or admission number, case-insensitive.
'use client';
import { Search } from 'lucide-react';

export function matchesLearner(l: any, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase().trim();
  const name = (
    l.fullName ||
    `${l.firstName || ''} ${l.lastName || ''}`
  ).toLowerCase();
  const adm = String(l.admissionNumber || l.admission_number || '').toLowerCase();
  return name.includes(needle) || adm.includes(needle);
}

export function LearnerSearch({
  value, onChange, placeholder = 'Search learner by name or admission no…', className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="input pl-9 w-full"
      />
    </div>
  );
}
