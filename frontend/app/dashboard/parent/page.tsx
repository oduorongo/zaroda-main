'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  User, DollarSign, FileText, MessageSquare, CheckCircle,
  TrendingUp, CreditCard, ChevronRight, Heart,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';

export default function ParentPortalPage() {
  const { user } = useAuth();
  const [children, setChildren] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    apiClient.get('/academic/my-children')
      .then(r => setChildren(r.data))
      .catch(() => setChildren([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-[#1a2e5a] to-[#243f7a] rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-[#d4af37]/10 rounded-full -translate-y-10 translate-x-10"/>
        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-surface/10 flex items-center justify-center flex-shrink-0">
            <Heart size={22} className="text-[#d4af37]"/>
          </div>
          <div>
            <h1 className="text-2xl font-black">Parent Portal</h1>
            <p className="text-white/60 text-sm">Welcome, {user?.firstName}</p>
          </div>
        </div>
      </div>

      {/* My children */}
      <div>
        <h2 className="section-title">My Children</h2>
        {loading ? (
          <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-28 shimmer rounded-2xl"/>)}</div>
        ) : children.length === 0 ? (
          <div className="card p-8 text-center text-theme-muted">
            <User size={32} className="mx-auto text-[#e2e6f0] mb-2"/>
            No children linked to your account yet. Contact the school office.
          </div>
        ) : (
          <div className="space-y-4">
            {children.map((c: any) => (
              <div key={c.id} className="card p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-[#1a2e5a] flex items-center justify-center text-[#d4af37] font-bold flex-shrink-0">
                    {c.firstName?.[0]}{c.lastName?.[0]}
                  </div>
                  <div>
                    <div className="font-bold text-theme-heading">{c.firstName} {c.lastName}</div>
                    <div className="text-xs text-theme-muted">{c.stream?.name} · Adm {c.admissionNumber}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-surface-2 rounded-xl p-3 text-center">
                    <CheckCircle size={16} className="mx-auto text-green-600 mb-1"/>
                    <div className="text-sm font-black text-theme-heading">{c.attendanceRate ?? '—'}%</div>
                    <div className="text-[10px] text-theme-muted">Attendance</div>
                  </div>
                  <div className="bg-surface-2 rounded-xl p-3 text-center">
                    <TrendingUp size={16} className="mx-auto text-blue-600 mb-1"/>
                    <div className="text-sm font-black text-theme-heading">{c.currentLevel ?? '—'}</div>
                    <div className="text-[10px] text-theme-muted">Performance</div>
                  </div>
                  <div className="bg-surface-2 rounded-xl p-3 text-center">
                    <DollarSign size={16} className="mx-auto text-red-600 mb-1"/>
                    <div className="text-sm font-black text-theme-heading">{c.balance ? `${(c.balance/1000).toFixed(0)}k` : '0'}</div>
                    <div className="text-[10px] text-theme-muted">Balance</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Link href={`/dashboard/parent/analytics?child=${c.id}`} className="btn-primary flex-1 justify-center text-xs"><TrendingUp size={13}/> Performance</Link>
                  <Link href="/dashboard/academic/report-cards" className="btn-ghost flex-1 justify-center text-xs"><FileText size={13}/> Report Card</Link>
                  <Link href="/dashboard/finance" className="btn-ghost flex-1 justify-center text-xs"><CreditCard size={13}/> Pay Fees</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
