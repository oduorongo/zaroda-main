// app/dashboard/subscription/page.tsx
// School admin sees what each stream is paid up to, pays for the streams they pick
// (per stream/year) via M-Pesa STK push (Tuma), and can view/print past receipts.
// Streams lapse on their own dates: one paid in January and one added and paid in
// May come due a year apart. Streams with no learners are free until used.
'use client';
import { useState, useEffect, useRef } from 'react';
import { Receipt, Loader2, CheckCircle2, Smartphone, Clock, AlertTriangle, Sparkles } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { usePdfDownload } from '@/components/pdf/pdf-buttons';
import toast from 'react-hot-toast';

const ksh = (n: number) => `KES ${Number(n || 0).toLocaleString('en-KE')}`;
const fmtDate = (d?: string | null) => d
  ? new Date(`${d}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
  : '';

// One pill per stream (and the Pro row). `coverEnd` is the last covered day, paid
// or free; `graceEndsOn` the last usable day before the stream turns read-only.
function StatusPill({ status, coverEnd, graceEndsOn }: { status: string; coverEnd?: string | null; graceEndsOn?: string | null }) {
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap';
  if (status === 'paid') return <span className={`${base} bg-green-100 text-green-700`}><CheckCircle2 size={11}/> Paid until {fmtDate(coverEnd)}</span>;
  if (status === 'due_soon') return <span className={`${base} bg-amber-100 text-amber-700`}><Clock size={11}/> Paid until {fmtDate(coverEnd)}</span>;
  if (status === 'free') return <span className={`${base} bg-blue-100 text-blue-700`}><CheckCircle2 size={11}/> Free until {fmtDate(coverEnd)}</span>;
  if (status === 'free_ending') return <span className={`${base} bg-amber-100 text-amber-700`}><Clock size={11}/> Free until {fmtDate(coverEnd)}</span>;
  if (status === 'grace') return <span className={`${base} bg-amber-100 text-amber-800`}><Clock size={11}/> Grace until {fmtDate(graceEndsOn)}</span>;
  if (status === 'lapsed') return <span className={`${base} bg-red-100 text-red-700`}><AlertTriangle size={11}/> Read-only</span>;
  return <span className={`${base} bg-surface-2 text-theme-muted`}>No learners · not charged</span>;
}

export default function SubscriptionPage() {
  const [summary, setSummary] = useState<any>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includePro, setIncludePro] = useState(false);
  const [phone, setPhone] = useState('');
  const [paying, setPaying] = useState(false);
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { printHtml } = usePdfDownload();

  const load = () => {
    Promise.all([
      apiClient.get('/billing/subscription/summary').then(r => r.data).catch(() => null),
      apiClient.get('/billing/subscription/receipts').then(r => r.data).catch(() => []),
      apiClient.get('/billing/subscription/invoices').then(r => r.data).catch(() => []),
    ]).then(([s, r, inv]) => {
      setSummary(s);
      setReceipts(r || []);
      setInvoices(inv || []);
      setSelected(new Set(s?.defaultSelection?.streamIds || []));
      setIncludePro(!!s?.defaultSelection?.includePro);
    }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const streams: any[] = summary?.streams || [];
  const billable = streams.filter(s => s.billable);
  const empty = streams.filter(s => !s.billable);
  // Shown only — /pay recomputes the charge server-side from the ticked ids.
  const total = billable.filter(s => selected.has(s.id)).reduce((n, s) => n + s.price, 0)
    + (includePro && summary?.pro ? summary.pro.price : 0);
  const needsAttention = billable.filter(s => ['lapsed', 'grace', 'due_soon', 'free_ending'].includes(s.status)).length;
  const openInvoices = invoices.filter(i => i.status === 'open');

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const pay = async () => {
    if (!phone.trim()) { toast.error('Enter the M-Pesa phone number to pay from'); return; }
    if (total <= 0) { toast.error('Tick at least one stream to pay for'); return; }
    setPaying(true);
    try {
      const { data } = await apiClient.post('/billing/subscription/pay', {
        phone, streamIds: Array.from(selected), includePro,
      });
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
  if (!summary) return <div className="p-8 text-sm text-theme-muted text-center">Could not load your subscription. Refresh to try again.</div>;

  const locked = paying || !!pendingPaymentId;

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex items-center gap-2">
          <Receipt className="text-theme-muted" size={20}/>
          <h1 className="text-xl font-black text-theme-heading">Subscription</h1>
        </div>

        {summary.onFreePeriod && (
          <div className="rounded-xl px-4 py-3 text-sm bg-blue-50 text-blue-800 border border-blue-200">
            <b>Free until {fmtDate(summary.freeUntil)}.</b> Every stream is open until then. After that, each stream with learners is invoiced,
            with a {summary.graceDays}-day grace period to {fmtDate(summary.freeGraceEndsOn)}. Streams still unpaid then become read-only:
            records stay viewable and printable, and fee collection keeps working. Paying early costs nothing extra — the paid year starts when the free period ends.
          </div>
        )}
        {needsAttention > 0 && (
          <div className="rounded-xl px-4 py-3 text-sm bg-amber-50 text-amber-800 border border-amber-200 flex gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5"/>
            <span>{needsAttention} stream{needsAttention === 1 ? '' : 's'} {needsAttention === 1 ? 'needs' : 'need'} paying: read-only, in grace, or ending within {summary.dueSoonDays} days. {needsAttention === 1 ? 'It is' : 'They are'} ticked below.</span>
          </div>
        )}

        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-theme-heading text-sm">Streams</h3>
            <span className="text-xs text-theme-muted">{ksh(summary.pricePrimaryJs)} primary/JS · {ksh(summary.priceSenior)} senior · per year</span>
          </div>

          {billable.length === 0 ? (
            <p className="text-sm text-theme-muted">No streams have learners yet, so there is nothing to pay for. Add learners to a stream and it will appear here.</p>
          ) : (
            <div className="divide-y divide-theme">
              {billable.map(s => (
                <label key={s.id} className="flex items-center gap-3 py-2.5 cursor-pointer">
                  <input type="checkbox" className="shrink-0" checked={selected.has(s.id)} onChange={() => toggle(s.id)} disabled={locked}/>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-theme-heading font-medium truncate">{s.name}</div>
                    <div className="text-xs text-theme-muted">{s.learners} learner{s.learners === 1 ? '' : 's'} · {ksh(s.price)}</div>
                  </div>
                  <StatusPill status={s.status} coverEnd={s.coverEnd} graceEndsOn={s.graceEndsOn}/>
                </label>
              ))}
            </div>
          )}

          {summary.pro ? (
            <label className="flex items-center gap-3 py-2.5 border-t border-theme cursor-pointer">
              <input type="checkbox" className="shrink-0" checked={includePro} onChange={e => setIncludePro(e.target.checked)} disabled={locked}/>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#d4af37] flex items-center gap-1"><Sparkles size={13}/> Pro plan</div>
                <div className="text-xs text-theme-muted">Payroll, HR and transport · {ksh(summary.pro.price)} flat</div>
              </div>
              <StatusPill status={summary.pro.status} coverEnd={summary.pro.coverEnd} graceEndsOn={summary.pro.graceEndsOn}/>
            </label>
          ) : (
            <p className="text-xs text-theme-muted bg-surface-2/60 rounded-lg px-3 py-2">
              On the Essential plan. Want payroll, HR and student transport too? Upgrade to Pro for {ksh(summary.pricePro)}/year (flat, not per stream) — email <a href="mailto:support@zarodasolutions.app?subject=Upgrade%20to%20Zaroda%20Pro" className="underline">support@zarodasolutions.app</a>.
            </p>
          )}

          {empty.length > 0 && (
            <details className="text-xs text-theme-muted border-t border-theme pt-3">
              <summary className="cursor-pointer">{empty.length} stream{empty.length === 1 ? '' : 's'} with no learners · not charged</summary>
              <p className="mt-2">{empty.map(s => s.name).join(', ')}. These become payable once learners are added.</p>
            </details>
          )}

          <div className="border-t border-theme pt-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-theme-heading">Total for 1 year</span>
            <span className="text-xl font-black text-theme-heading">{ksh(total)}</span>
          </div>
          <p className="text-xs text-theme-muted">
            Each ticked stream gets a year. It starts when its current cover (paid or free) ends if you pay early, or from that date if you pay
            during grace. For a read-only stream, it starts on the day you pay.
          </p>
        </div>

        <div className="card p-5 space-y-3">
          <label className="label">M-Pesa phone number</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input value={phone} onChange={e => setPhone(e.target.value)} className="input flex-1"
              placeholder="07XX XXX XXX" disabled={locked}/>
            <button onClick={pay} disabled={locked || total <= 0} className="btn-primary">
              {paying ? <Loader2 size={15} className="animate-spin"/> : <Smartphone size={15}/>}
              {pendingPaymentId ? 'Awaiting payment…' : `Pay ${ksh(total)}`}
            </button>
          </div>
          {pendingPaymentId && (
            <p className="text-xs text-theme-muted flex items-center gap-1"><Loader2 size={11} className="animate-spin"/> Waiting for confirmation — enter your M-Pesa PIN on the phone that received the prompt.</p>
          )}
        </div>

        {invoices.length > 0 && (
          <div className="card p-4">
            <h3 className="font-bold text-theme-heading mb-3 text-sm">
              Invoices{openInvoices.length > 0 && <span className="ml-2 text-xs font-medium text-amber-700">{openInvoices.length} open</span>}
            </h3>
            <div className="divide-y divide-theme">
              {invoices.map((i: any) => (
                <div key={i.id} className="flex items-center justify-between py-2 text-sm gap-3">
                  <div className="min-w-0">
                    <div className="text-theme-heading">{i.invoiceNumber} · {ksh(i.amount)}</div>
                    <div className="text-xs text-theme-muted">
                      Issued {fmtDate(i.issuedOn)} · {i.status === 'open' ? `due ${fmtDate(i.dueOn)}` : 'settled'}
                    </div>
                  </div>
                  <button onClick={() => printHtml(`/billing/subscription/invoice/${i.id}/html`, i.id)}
                    className="text-xs text-[#1a2e5a] hover:underline shrink-0">
                    View invoice
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card p-4">
          <h3 className="font-bold text-theme-heading mb-3 text-sm">Payment history</h3>
          {receipts.length === 0 ? (
            <p className="text-sm text-theme-muted">No payments yet.</p>
          ) : (
            <div className="divide-y divide-theme">
              {receipts.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="text-theme-heading">{ksh(r.amount)}</div>
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
