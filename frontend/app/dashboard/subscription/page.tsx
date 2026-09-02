// app/dashboard/subscription/page.tsx
// School admin pays the ZARODA subscription (per stream/year) via M-Pesa STK push
// (Tuma), and can view/print past receipts.
'use client';
import { useState, useEffect, useRef } from 'react';
import { Receipt, Loader2, CheckCircle2, Smartphone, Clock } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { usePdfDownload } from '@/components/pdf/pdf-buttons';
import toast from 'react-hot-toast';

export default function SubscriptionPage() {
  const [summary, setSummary] = useState<any>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [paying, setPaying] = useState(false);
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { printHtml } = usePdfDownload();

  const load = () => {
    Promise.all([
      apiClient.get('/billing/subscription/summary').then(r => r.data).catch(() => null),
      apiClient.get('/billing/subscription/receipts').then(r => r.data).catch(() => []),
    ]).then(([s, r]) => { setSummary(s); setReceipts(r || []); }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const pay = async () => {
    if (!phone.trim()) { toast.error('Enter the M-Pesa phone number to pay from'); return; }
    setPaying(true);
    try {
      const { data } = await apiClient.post('/billing/subscription/pay', { phone });
      toast.success(data.message || 'STK push sent — check your phone.');
      setPendingPaymentId(data.paymentId);

      // Poll for confirmation up to ~2 minutes (Tuma's webhook usually beats this,
      // this is just the fallback in case it's slow or never arrives).
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        try {
          const { data: status } = await apiClient.get(`/billing/subscription/status/${data.paymentId}`);
          if (status.status === 'success') {
            clearInterval(pollRef.current!);
            setPendingPaymentId(null);
            toast.success('Payment confirmed!');
            load();
          } else if (status.status === 'failed' || attempts >= 24) {
            clearInterval(pollRef.current!);
            setPendingPaymentId(null);
            if (status.status === 'failed') toast.error('Payment failed or was cancelled.');
          }
        } catch { /* keep polling */ }
      }, 5000);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not start payment.');
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-theme-muted" size={24}/></div>;

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex items-center gap-2">
          <Receipt className="text-theme-muted" size={20}/>
          <h1 className="text-xl font-black text-theme-heading">Subscription</h1>
        </div>

        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-theme-muted">Status</span>
            {summary?.covered ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                <CheckCircle2 size={12}/> Paid until {summary.paidUntil ? String(summary.paidUntil).slice(0,10) : ''}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                <Clock size={12}/> {summary?.paidUntil ? 'Expired' : 'Not yet paid'}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-theme-muted">Primary/JS streams</span><br/><b>{summary?.streamsPrimaryJs ?? 0}</b> × KES {summary?.pricePrimaryJs ?? 2400}</div>
            <div><span className="text-theme-muted">Senior streams</span><br/><b>{summary?.streamsSenior ?? 0}</b> × KES {summary?.priceSenior ?? 3360}</div>
          </div>
          <div className="border-t border-theme pt-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-theme-heading">Amount due (1 year)</span>
            <span className="text-xl font-black text-theme-heading">KES {(summary?.amountDue ?? 0).toLocaleString('en-KE')}</span>
          </div>
        </div>

        <div className="card p-5 space-y-3">
          <label className="label">M-Pesa phone number</label>
          <div className="flex gap-2">
            <input value={phone} onChange={e => setPhone(e.target.value)} className="input flex-1"
              placeholder="07XX XXX XXX" disabled={paying || !!pendingPaymentId}/>
            <button onClick={pay} disabled={paying || !!pendingPaymentId || !summary?.amountDue} className="btn-primary">
              {paying ? <Loader2 size={15} className="animate-spin"/> : <Smartphone size={15}/>}
              {pendingPaymentId ? 'Awaiting payment…' : 'Pay with M-Pesa'}
            </button>
          </div>
          {pendingPaymentId && (
            <p className="text-xs text-theme-muted flex items-center gap-1"><Loader2 size={11} className="animate-spin"/> Waiting for confirmation — enter your M-Pesa PIN on the phone that received the prompt.</p>
          )}
        </div>

        <div className="card p-4">
          <h3 className="font-bold text-theme-heading mb-3 text-sm">Payment history</h3>
          {receipts.length === 0 ? (
            <p className="text-sm text-theme-muted">No payments yet.</p>
          ) : (
            <div className="divide-y divide-theme">
              {receipts.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="text-theme-heading">KES {Number(r.amount || 0).toLocaleString('en-KE')}</div>
                    <div className="text-xs text-theme-muted">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-KE') : ''} · {r.status}</div>
                  </div>
                  {r.status === 'success' ? (
                    <button onClick={() => printHtml(`/billing/subscription/receipt/${r.id}/html`, r.id)}
                      className="text-xs text-[#1a2e5a] hover:underline">
                      View receipt
                    </button>
                  ) : (
                    <span className="text-xs text-theme-muted capitalize">{r.status}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
