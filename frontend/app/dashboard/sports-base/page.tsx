// app/dashboard/sports-base/page.tsx
'use client';
import { ExternalLink, Trophy } from 'lucide-react';

export default function SportsBaseDashboardPage() {
  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">ZARODA Sports Base</h1>
          <p className="text-sm text-theme-muted">Cross-school championship platform — completely free</p>
        </div>
        <a href="/sports-base" target="_blank" rel="noopener noreferrer" className="btn-primary">
          <ExternalLink size={14}/> Open Full Platform
        </a>
      </div>

      {/* Embedded iframe of the Sports Base */}
      <div className="card overflow-hidden" style={{ height: '70vh' }}>
        <div className="bg-[#0f1c38] px-4 py-2 flex items-center gap-2">
          <Trophy size={14} className="text-[#d4af37]"/>
          <span className="text-xs font-bold text-white/70">ZARODA SPORTS BASE — Championship Browser</span>
          <a href="/sports-base" target="_blank" rel="noopener noreferrer"
            className="ml-auto text-[10px] text-white/40 hover:text-white/70 flex items-center gap-1">
            Open in new tab <ExternalLink size={10}/>
          </a>
        </div>
        <iframe
          src="/sports-base"
          className="w-full border-0"
          style={{ height: 'calc(100% - 36px)' }}
          title="ZARODA Sports Base"
        />
      </div>
    </div>
  );
}
