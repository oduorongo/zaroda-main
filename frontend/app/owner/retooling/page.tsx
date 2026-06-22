// app/owner/retooling/page.tsx
'use client';
import { GraduationCap } from 'lucide-react';

export default function OwnerRetoolingPage() {
  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center gap-2">
          <GraduationCap className="text-theme-muted" size={20}/>
          <h1 className="text-xl font-black text-theme-heading">Retooling</h1>
        </div>
        <div className="card p-8 text-center text-theme-muted">
          Post teacher-retooling articles and professional-development content for all schools. Coming next.
        </div>
      </div>
    </div>
  );
}
