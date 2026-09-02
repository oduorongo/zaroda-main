// app/owner/billing/page.tsx
// Platform-wide view of school subscription payments collected via Tuma (M-Pesa).
'use client';
import { useState, useEffect } from 'react';
import { Receipt, Loader2, CheckCircle2, Clock, XCircle } from 'lucide-react';
import apiClient from '@/lib/api/client';

const STATUS_BADGE: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  failed:  'bg-red-100 text-red-700',
};
const STATUS_ICON: Record<string, any> = { success: CheckCircle2, pending: Clock, failed: XCircle };

export default function OwnerBillingPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/admin/subscription-payments')
      .then(r => setPayments(r.data?.payments || []))
      .catch(() => setPayments([]))
      .finally(() => setLoading(false));
  }, []);

  const totalCollected = payments.filter(p => p.status === 'success').reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const successCount = payments.filter(p => p.status === 'success').length;
  const pendingCount = payments.filter(p => p.status === 'pending').length;

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center gap-2">
          <Receipt className="text-theme-muted" size={20}/>
          <h1 className="text-xl font-black text-theme-heading">Subscription Billing</h1>
        </div>
        <p className="text-sm text-theme-muted">Subscription payments collected from schools via M-Pesa (Tuma), platform-wide.</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card p-4">
            <div className="text-2xl font-black text-theme-heading">KES {totalCollected.toLocaleString('en-KE')}</div>
            <div className="text-xs text-theme-muted mt-1">Total collected</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-black text-green-600">{successCount}</div>
            <div className="text-xs text-theme-muted mt-1">Successful payments</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-black text-amber-600">{pendingCount}</div>
            <div className="text-xs text-theme-muted mt-1">Pending / awaiting confirmation</div>
          </div>
        </div>

        <div className="card p-4">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-theme-muted" size={20}/></div>
          ) : payments.length === 0 ? (
            <p className="text-sm text-theme-muted text-center py-8">No subscription payments yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-theme-muted uppercase tracking-wide border-b border-theme">
                    <th className="py-2 pr-3">School</th>
                    <th className="py-2 pr-3">Amount</th>
                    <th className="py-2 pr-3">Streams</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Receipt</th>
                    <th className="py-2 pr-3">Paid until</th>
                    <th className="py-2 pr-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme">
                  {payments.map((p: any) => {
                    const Icon = STATUS_ICON[p.status] || Clock;
                    return (
                      <tr key={p.id}>
                        <td className="py-2 pr-3 text-theme-heading">{p.schoolName}</td>
                        <td className="py-2 pr-3">KES {Number(p.amount || 0).toLocaleString('en-KE')}</td>
                        <td className="py-2 pr-3 text-theme-muted">{p.streamsPrimaryJs || 0} primary/JS · {p.streamsSenior || 0} senior</td>
                        <td className="py-2 pr-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[p.status] || 'bg-surface-2 text-theme-muted'}`}>
                            <Icon size={11}/> {p.status}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-theme-muted">{p.receiptNumber || '—'}</td>
                        <td className="py-2 pr-3 text-theme-muted">{p.paidUntil ? String(p.paidUntil).slice(0,10) : '—'}</td>
                        <td className="py-2 pr-3 text-theme-muted">{p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-KE') : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
