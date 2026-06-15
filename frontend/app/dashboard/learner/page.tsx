'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Calendar, FileText, Library, TrendingUp, BookOpen,
  Award, ChevronRight, Backpack,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';

export default function LearnerPortalPage() {
  const { user } = useAuth();
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/learner/me')
      .then(r => setMe(r.data))
      .catch(() => setMe({}))
      .finally(() => setLoading(false));
  }, []);

  const TILES = [
    { icon: Calendar, label: 'My Timetable', sub: 'Weekly schedule',  href: '/dashboard/academic/timetable', color: 'bg-purple-600' },
    { icon: FileText, label: 'My Results',   sub: 'CBC report cards',  href: '/dashboard/academic/report-cards', color: 'bg-[#f5820a]' },
    { icon: Library,  label: 'Library',      sub: 'My borrowed books', href: '/dashboard/library', color: 'bg-cyan-600' },
    { icon: BookOpen, label: 'Learning',     sub: 'Subjects & areas',  href: '/dashboard/academic', color: 'bg-[#1a2e5a]' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-[#1a2e5a] to-[#243f7a] rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-[#d4af37]/10 rounded-full -translate-y-10 translate-x-10"/>
        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-surface/10 flex items-center justify-center flex-shrink-0">
            <Backpack size={22} className="text-[#d4af37]"/>
          </div>
          <div>
            <h1 className="text-2xl font-black">Hi, {user?.firstName}! 📚</h1>
            <p className="text-white/60 text-sm">{user?.streamName || 'My Class'}</p>
          </div>
        </div>
      </div>

      {/* Performance summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <Award size={18} className="mx-auto text-[#d4af37] mb-1"/>
          <div className="text-xl font-black text-theme-heading">{loading ? '…' : me?.currentLevel ?? '—'}</div>
          <div className="text-xs text-theme-muted">Current Level</div>
        </div>
        <div className="card p-4 text-center">
          <TrendingUp size={18} className="mx-auto text-green-600 mb-1"/>
          <div className="text-xl font-black text-theme-heading">{loading ? '…' : me?.position ? `#${me.position}` : '—'}</div>
          <div className="text-xs text-theme-muted">Class Position</div>
        </div>
        <div className="card p-4 text-center">
          <Library size={18} className="mx-auto text-cyan-600 mb-1"/>
          <div className="text-xl font-black text-theme-heading">{loading ? '…' : me?.booksOut ?? 0}</div>
          <div className="text-xs text-theme-muted">Books Out</div>
        </div>
      </div>

      {/* Tiles */}
      <div>
        <h2 className="section-title">Explore</h2>
        <div className="grid grid-cols-2 gap-3">
          {TILES.map(t => {
            const Icon = t.icon;
            return (
              <Link key={t.label} href={t.href}
                className="card p-4 hover:shadow-md hover:-translate-y-0.5 transition-all">
                <div className={`w-11 h-11 rounded-xl ${t.color} flex items-center justify-center mb-3`}>
                  <Icon size={20} className="text-white"/>
                </div>
                <div className="font-bold text-theme-heading text-sm">{t.label}</div>
                <div className="text-xs text-theme-muted mt-0.5">{t.sub}</div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
