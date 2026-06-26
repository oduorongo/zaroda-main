// app/dashboard/sports-base/page.tsx
'use client';
import { ExternalLink, Trophy, Link2 } from 'lucide-react';

// The ZARODA Sports is a SEPARATE platform (the commercial championship layer). Set its
// public URL via NEXT_PUBLIC_SPORTS_BASE_URL at build time to embed/link it here. Until then
// we show a clear "not connected" panel instead of a 404 iframe.
const BASE_URL = process.env.NEXT_PUBLIC_SPORTS_BASE_URL || '';

export default function SportsBaseDashboardPage() {
  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">ZARODA Sports</h1>
          <p className="text-sm text-theme-muted">Cross-school championship platform</p>
        </div>
        {BASE_URL && (
          <a href={BASE_URL} target="_blank" rel="noopener noreferrer" className="btn-primary">
            <ExternalLink size={14}/> Open Full Platform
          </a>
        )}
      </div>

      {BASE_URL ? (
        <div className="card overflow-hidden" style={{ height: '70vh' }}>
          <div className="bg-[#0f1c38] px-4 py-2 flex items-center gap-2">
            <Trophy size={14} className="text-[#d4af37]"/>
            <span className="text-xs font-bold text-white/70">ZARODA SPORTS — Championship Browser</span>
            <a href={BASE_URL} target="_blank" rel="noopener noreferrer"
              className="ml-auto text-[10px] text-white/40 hover:text-white/70 flex items-center gap-1">
              Open in new tab <ExternalLink size={10}/>
            </a>
          </div>
          <iframe src={BASE_URL} className="w-full border-0" style={{ height: 'calc(100% - 36px)' }} title="ZARODA Sports"/>
        </div>
      ) : (
        <div className="card p-8 text-center max-w-xl mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-[#1a2e5a]/10 flex items-center justify-center mx-auto mb-4">
            <Link2 size={26} className="text-[#1a2e5a]"/>
          </div>
          <h3 className="font-bold text-theme-heading mb-2">ZARODA Sports not connected yet</h3>
          <p className="text-sm text-theme-muted mb-4">
            The ZARODA Sports is the central championship platform where school teams are entered into
            zonal, county, regional and national competitions. It runs as a separate system.
          </p>
          <p className="text-sm text-theme-muted">
            To connect it, set <code className="bg-surface-2 px-1.5 py-0.5 rounded text-xs">NEXT_PUBLIC_SPORTS_BASE_URL</code> to
            the ZARODA Sports platform's web address in the frontend service settings, then redeploy. Once linked, your
            confirmed school squads can be handed off here.
          </p>
        </div>
      )}
    </div>
  );
}
