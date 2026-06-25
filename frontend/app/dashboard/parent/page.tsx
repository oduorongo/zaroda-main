'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  User, DollarSign, FileText, MessageSquare, CheckCircle,
  TrendingUp, CreditCard, ChevronRight, Heart, Loader2,
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

  // Open ONLY this child's report card (never the whole class). Defaults to the current
  // term; the page that opens is the single-learner print-ready report.
  const [feesChild, setFeesChild] = useState<any>(null);
  const [feesData, setFeesData]   = useState<any>(null);
  const [feesLoading, setFeesLoading] = useState(false);

  const openFees = async (c: any) => {
    setFeesChild(c); setFeesData(null); setFeesLoading(true);
    try {
      const r = await apiClient.get(`/finance/payments/my-child/${c.id}`);
      setFeesData(r.data);
    } catch { setFeesData(null); }
    finally { setFeesLoading(false); }
  };
  const downloadChildReport = async (c: any) => {
    const term = 'term_2';
    const year = '2025/2026';
    const win = window.open('', '_blank');
    try {
      const res = await apiClient.get(`/pdf/report-card/${c.id}/html`, {
        params: { term, academicYear: year }, responseType: 'text',
      });
      const html = typeof res.data === 'string' ? res.data : String(res.data);
      if (win) { win.document.open(); win.document.write(html); win.document.close(); }
    } catch {
      if (win) win.close();
    }
  };

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
                  <button onClick={() => downloadChildReport(c)} className="btn-ghost flex-1 justify-center text-xs"><FileText size={13}/> Report Card</button>
                  <button onClick={() => openFees(c)} className="btn-ghost flex-1 justify-center text-xs"><CreditCard size={13}/> Fees</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {feesChild && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md max-h-[85vh] flex flex-col" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-bold text-theme-heading">{feesChild.firstName} {feesChild.lastName} · Fees</h3>
              <button onClick={() => setFeesChild(null)}>✕</button>
            </div>
            <div className="p-5 overflow-y-auto">
              {feesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-theme-muted" size={22}/></div>
              ) : !feesData ? (
                <p className="text-sm text-theme-muted text-center py-6">Fee information isn’t available right now.</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center mb-4">
                    <div className="bg-surface-2 rounded-xl p-3"><div className="text-[10px] text-theme-muted uppercase">Billed</div><div className="font-black text-theme-heading text-sm">KES {Number(feesData.totalBilled||0).toLocaleString('en-KE')}</div></div>
                    <div className="bg-surface-2 rounded-xl p-3"><div className="text-[10px] text-theme-muted uppercase">Paid</div><div className="font-black text-green-600 text-sm">KES {Number(feesData.totalPaid||0).toLocaleString('en-KE')}</div></div>
                    <div className="bg-surface-2 rounded-xl p-3"><div className="text-[10px] text-theme-muted uppercase">Balance</div><div className={`font-black text-sm ${feesData.balance>0?'text-[#f5820a]':'text-green-600'}`}>KES {Number(feesData.balance||0).toLocaleString('en-KE')}</div></div>
                  </div>
                  <h4 className="font-semibold text-theme-heading text-sm mb-2">Payment history</h4>
                  {(feesData.payments||[]).length === 0 ? (
                    <p className="text-sm text-theme-muted">No payments recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {feesData.payments.map((p:any)=>(
                        <div key={p.id} className="flex items-center justify-between text-sm border-b border-theme/40 pb-2">
                          <div>
                            <div className="font-semibold text-theme-heading">KES {Number(p.amount).toLocaleString('en-KE')}</div>
                            <div className="text-[11px] text-theme-muted capitalize">{(p.method||'').replace('_',' ')} · {p.paidOn || (p.createdAt||'').slice(0,10)} · {p.receiptNumber}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-theme-muted mt-4">For payments or fee questions, please contact the school bursar’s office.</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
