'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { DollarSign, Search, Loader2, CheckCircle, Printer, ArrowLeft } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

const METHODS = [
  { v: 'cash',  label: 'Cash' },
  { v: 'mpesa', label: 'M-Pesa' },
  { v: 'bank',  label: 'Bank / Cheque' },
];
const TERMS = [
  { v: '',        label: 'Not term-specific' },
  { v: 'term_1',  label: 'Term 1' },
  { v: 'term_2',  label: 'Term 2' },
  { v: 'term_3',  label: 'Term 3' },
];

const ksh = (n: number) => 'KES ' + Number(n || 0).toLocaleString('en-KE');

export default function RecordPaymentPage() {
  const [streams, setStreams]   = useState<any[]>([]);
  const [streamId, setStreamId] = useState('');
  const [learners, setLearners] = useState<any[]>([]);
  const [search, setSearch]     = useState('');
  const [learner, setLearner]   = useState<any>(null);
  const [bal, setBal]           = useState<any>(null);
  const [voteHeads, setVoteHeads] = useState<any[]>([]);
  const [override, setOverride] = useState<Record<string, string>>({}); // feeItemId -> amount (manual split)
  const [useOverride, setUseOverride] = useState(false);
  const [loadingBal, setLoadingBal] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [lastReceipt, setLastReceipt] = useState<any>(null);

  const [form, setForm] = useState({ amount: '', method: 'cash', reference: '', note: '', term: '', academicYear: '2025/2026', paidOn: new Date().toISOString().slice(0,10) });
  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }));
  const [editPay, setEditPay] = useState<any>(null);

  const saveEdit = async () => {
    try {
      await apiClient.patch(`/finance/payments/${editPay.id}`, {
        amount: Number(editPay.amount), method: editPay.method,
        reference: editPay.reference, note: editPay.note, paidOn: editPay.paidOn,
      });
      toast.success('Payment updated'); setEditPay(null);
      if (learner) pickLearner(learner);
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not update'); }
  };

  const removePay = async (p: any) => {
    if (!confirm(`Delete payment of ${ksh(p.amount)} (Receipt ${p.receiptNumber})? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`/finance/payments/${p.id}`);
      toast.success('Payment deleted');
      if (learner) pickLearner(learner);
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not delete'); }
  };

  useEffect(() => {
    apiClient.get('/academic/streams').then(r => setStreams(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!streamId) { setLearners([]); return; }
    apiClient.get(`/academic/streams/${streamId}/learners`).then(r => setLearners(r.data || [])).catch(() => setLearners([]));
  }, [streamId]);

  const pickLearner = async (l: any) => {
    setLearner(l); setBal(null); setVoteHeads([]); setOverride({}); setUseOverride(false); setLastReceipt(null); setLoadingBal(true);
    try {
      const [balR, vhR] = await Promise.all([
        apiClient.get(`/finance/payments/learner/${l.id}`),
        apiClient.get(`/finance/vote-heads/${l.id}`, { params: { term: form.term || undefined } }),
      ]);
      setBal(balR.data);
      setVoteHeads(vhR.data?.voteHeads || []);
    } catch { setBal(null); }
    finally { setLoadingBal(false); }
  };

  const [savingPriority, setSavingPriority] = useState('');
  const changePriority = async (feeItemId: string, priority: number) => {
    setSavingPriority(feeItemId);
    try {
      await apiClient.patch(`/finance/fee-structures/${feeItemId}/priority`, { priority });
      toast.success('Vote head priority updated');
      if (learner) await pickLearner(learner); // refresh order + auto-allocation preview
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not update priority');
    } finally { setSavingPriority(''); }
  };

  // Auto-allocation preview: fill each vote head's balance in priority order until the amount runs out.
  const previewAllocation = () => {
    let remaining = Number(form.amount) || 0;
    const rows = voteHeads.map(vh => {
      const take = remaining > 0 ? Math.min(remaining, vh.balance) : 0;
      remaining -= take;
      return { ...vh, willPay: take };
    });
    return { rows, leftover: Math.max(0, remaining) };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!learner) { toast.error('Select a learner first'); return; }
    setSaving(true);
    try {
      const allocations = useOverride
        ? Object.entries(override).filter(([, v]) => Number(v) > 0).map(([feeItemId, v]) => ({ feeItemId, amount: Number(v) }))
        : undefined;
      const { data } = await apiClient.post('/finance/payments', {
        learnerId: learner.id,
        learnerName: `${learner.firstName || ''} ${learner.lastName || ''}`.trim(),
        admissionNumber: learner.admissionNumber,
        amount: Number(form.amount),
        method: form.method, reference: form.reference, note: form.note,
        term: form.term || null, academicYear: form.academicYear, paidOn: form.paidOn,
        allocations,
      });
      toast.success('Payment recorded');
      setLastReceipt(data);
      setForm(f => ({ ...f, amount: '', reference: '', note: '' }));
      pickLearner(learner); // refresh balance
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not record payment');
    } finally { setSaving(false); }
  };

  const openReceipt = async (paymentId: string) => {
    const tId = toast.loading('Opening receipt…');
    try {
      // Use apiClient so the base URL + auth header are guaranteed correct (a manual fetch
      // with window.location.origin would hit the frontend domain, not the API).
      const res = await apiClient.get(`/finance/payments/${paymentId}/receipt/html`, { responseType: 'text' });
      const html = typeof res.data === 'string' ? res.data : String(res.data);
      const blob = new Blob([html], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      const w = window.open(blobUrl, '_blank');
      if (!w) {
        const a = document.createElement('a');
        a.href = blobUrl; a.target = '_blank'; a.rel = 'noopener';
        document.body.appendChild(a); a.click(); a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      toast.dismiss(tId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || `Could not open receipt`, { id: tId });
    }
  };

  const filtered = learners.filter(l =>
    !search || `${l.firstName} ${l.lastName} ${l.admissionNumber}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/finance" className="btn-ghost p-2"><ArrowLeft size={16}/></Link>
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Record Payment</h1>
          <p className="text-sm text-theme-muted">Manually record cash, M-Pesa, or bank payments and print a receipt</p>
        </div>
      </div>

      {/* Step 1: pick learner */}
      <div className="card p-5">
        <h2 className="font-bold text-theme-heading mb-3">1 · Select learner</h2>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <select value={streamId} onChange={e => { setStreamId(e.target.value); setLearner(null); setBal(null); }} className="input">
            <option value="">Select class…</option>
            {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted"/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or admission no." className="input pl-9"/>
          </div>
        </div>
        {streamId && (
          <div className="max-h-44 overflow-y-auto border border-theme rounded-xl divide-y divide-theme/40">
            {filtered.length === 0 ? <div className="p-3 text-sm text-theme-muted">No learners</div> :
              filtered.map(l => (
                <button key={l.id} onClick={() => pickLearner(l)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-2 ${learner?.id===l.id ? 'bg-surface-2 font-semibold' : ''}`}>
                  {l.firstName} {l.lastName} <span className="text-theme-muted">· Adm {l.admissionNumber || '—'}</span>
                </button>
              ))}
          </div>
        )}
      </div>

      {learner && (
        <>
          {/* Balance */}
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-theme-heading">{learner.firstName} {learner.lastName}</div>
                <div className="text-xs text-theme-muted">Adm {learner.admissionNumber || '—'}</div>
              </div>
              {loadingBal ? <Loader2 className="animate-spin text-theme-muted" size={18}/> : bal && (
                <div className="text-right text-sm">
                  <div className="text-theme-muted">Billed {ksh(bal.totalBilled)} · Paid {ksh(bal.totalPaid)}</div>
                  <div className={`font-black text-lg ${bal.balance > 0 ? 'text-[#f5820a]' : 'text-green-600'}`}>
                    Balance {ksh(bal.balance)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Vote-head balances */}
          {voteHeads.length > 0 && (
            <div className="card p-5">
              <h2 className="font-bold text-theme-heading mb-1">Fee vote heads <span className="text-xs font-normal text-theme-muted">(in payment priority order)</span></h2>
              <p className="text-[11px] text-theme-muted mb-3">A lump-sum payment auto-fills these in order, lowest number first. Change the number to reorder.</p>
              <div className="space-y-1.5">
                {voteHeads.map((vh, i) => (
                  <div key={vh.feeItemId} className="flex items-center gap-3 text-sm">
                    <input
                      type="number"
                      min={1}
                      defaultValue={vh.priority}
                      key={`${vh.feeItemId}-${vh.priority}`}
                      disabled={savingPriority === vh.feeItemId}
                      onBlur={e => {
                        const val = Number(e.target.value);
                        if (val && val !== vh.priority) changePriority(vh.feeItemId, val);
                      }}
                      title="Priority (lower = filled first)"
                      className="input w-14 py-1 text-center text-xs"
                    />
                    <span className="flex-1 font-medium text-theme-heading">{vh.name}</span>
                    <span className="text-theme-muted">{ksh(vh.paid)} / {ksh(vh.billed)}</span>
                    <span className={`w-28 text-right font-bold ${vh.balance > 0 ? 'text-[#f5820a]' : 'text-green-600'}`}>
                      {vh.balance > 0 ? ksh(vh.balance) + ' due' : 'Cleared'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <form onSubmit={submit} className="card p-5 space-y-4">
            <h2 className="font-bold text-theme-heading">2 · Payment details</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="label">Amount (KES) *</label>
                <input type="number" required min={1} value={form.amount} onChange={set('amount')} className="input" placeholder="e.g. 5000"/></div>
              <div><label className="label">Method</label>
                <select value={form.method} onChange={set('method')} className="input">
                  {METHODS.map(m => <option key={m.v} value={m.v}>{m.label}</option>)}
                </select></div>
              <div><label className="label">Reference {form.method !== 'cash' && '(M-Pesa code / slip no.)'}</label>
                <input value={form.reference} onChange={set('reference')} className="input" placeholder={form.method === 'cash' ? 'Optional' : 'e.g. SVF7X2K1'}/></div>
              <div><label className="label">Date paid</label>
                <input type="date" value={form.paidOn} onChange={set('paidOn')} className="input"/></div>
              <div><label className="label">Term</label>
                <select value={form.term} onChange={set('term')} className="input">
                  {TERMS.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select></div>
              <div><label className="label">Note</label>
                <input value={form.note} onChange={set('note')} className="input" placeholder="Optional"/></div>
            </div>

            {/* Allocation: how this amount fills the vote heads */}
            {voteHeads.length > 0 && Number(form.amount) > 0 && (
              <div className="rounded-xl border border-theme p-3 bg-surface-2/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-theme-heading">How this payment is applied</span>
                  <label className="text-xs flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={useOverride} onChange={e => {
                      setUseOverride(e.target.checked);
                      if (e.target.checked) {
                        const seed: Record<string, string> = {};
                        previewAllocation().rows.forEach(r => { if (r.willPay > 0) seed[r.feeItemId] = String(r.willPay); });
                        setOverride(seed);
                      }
                    }}/>
                    Adjust manually
                  </label>
                </div>
                {!useOverride ? (
                  <div className="space-y-1">
                    {previewAllocation().rows.filter(r => r.willPay > 0).map(r => (
                      <div key={r.feeItemId} className="flex justify-between text-sm">
                        <span className="text-theme-heading">{r.name}</span>
                        <span className="font-bold text-green-600">{ksh(r.willPay)}</span>
                      </div>
                    ))}
                    {previewAllocation().leftover > 0 && (
                      <div className="flex justify-between text-sm text-[#f5820a]">
                        <span>Overpayment / credit</span><span className="font-bold">{ksh(previewAllocation().leftover)}</span>
                      </div>
                    )}
                    <p className="text-[11px] text-theme-muted pt-1">Auto-filled by priority order. Tick "Adjust manually" to change the split.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {voteHeads.map(vh => (
                      <div key={vh.feeItemId} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 text-theme-heading">{vh.name} <span className="text-theme-muted text-xs">({ksh(vh.balance)} due)</span></span>
                        <input type="number" min={0} value={override[vh.feeItemId] || ''} onChange={e => setOverride(o => ({ ...o, [vh.feeItemId]: e.target.value }))}
                          className="input w-28 py-1 text-sm" placeholder="0"/>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs pt-1 border-t border-theme">
                      <span className="text-theme-muted">Allocated</span>
                      <span className={`font-bold ${Object.values(override).reduce((s: number, v) => s + Number(v||0), 0) === Number(form.amount) ? 'text-green-600' : 'text-[#f5820a]'}`}>
                        {ksh(Object.values(override).reduce((s: number, v) => s + Number(v||0), 0))} / {ksh(Number(form.amount))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
              {saving ? <Loader2 className="animate-spin" size={16}/> : <DollarSign size={16}/>} Record Payment
            </button>
          </form>

          {/* Receipt + history */}
          {lastReceipt && (
            <div className="card p-5 border-2 border-green-500/30">
              <div className="flex items-center gap-2 text-green-600 mb-2"><CheckCircle size={18}/> <span className="font-bold">Payment recorded — Receipt {lastReceipt.receiptNumber}</span></div>
              <button onClick={() => openReceipt(lastReceipt.id)} className="btn-primary"><Printer size={16}/> Print receipt</button>
            </div>
          )}

          {bal?.payments?.length > 0 && (
            <div className="card p-5">
              <h2 className="font-bold text-theme-heading mb-3">Payment history</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-theme-muted border-b border-theme">
                    <th className="px-2 py-2">Date</th><th className="px-2 py-2">Method</th>
                    <th className="px-2 py-2 text-right">Amount</th><th className="px-2 py-2">Receipt</th><th></th>
                  </tr></thead>
                  <tbody>
                    {bal.payments.map((p: any) => (
                      <tr key={p.id} className="border-b border-theme/40">
                        <td className="px-2 py-2">{p.paidOn || (p.createdAt||'').slice(0,10)}</td>
                        <td className="px-2 py-2 capitalize">{(p.method||'').replace('_',' ')}</td>
                        <td className="px-2 py-2 text-right font-semibold">{ksh(p.amount)}</td>
                        <td className="px-2 py-2 text-theme-muted text-xs">{p.receiptNumber}</td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          <button onClick={() => openReceipt(p.id)} className="btn-ghost text-xs"><Printer size={12}/> Print</button>
                          <button onClick={() => setEditPay({ ...p, paidOn: p.paidOn || (p.createdAt||'').slice(0,10) })} className="btn-ghost text-xs">Edit</button>
                          <button onClick={() => removePay(p)} className="btn-ghost text-xs text-red-600">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {editPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-bold text-theme-heading">Edit Payment · {editPay.receiptNumber}</h3>
              <button onClick={() => setEditPay(null)}>✕</button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className="label">Amount (KES)</label>
                <input type="number" min={1} value={editPay.amount} onChange={e => setEditPay({ ...editPay, amount: e.target.value })} className="input"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Method</label>
                  <select value={editPay.method} onChange={e => setEditPay({ ...editPay, method: e.target.value })} className="input">
                    {METHODS.map(m => <option key={m.v} value={m.v}>{m.label}</option>)}
                  </select></div>
                <div><label className="label">Date paid</label>
                  <input type="date" value={editPay.paidOn || ''} onChange={e => setEditPay({ ...editPay, paidOn: e.target.value })} className="input"/></div>
              </div>
              <div><label className="label">Reference</label>
                <input value={editPay.reference || ''} onChange={e => setEditPay({ ...editPay, reference: e.target.value })} className="input"/></div>
              <div><label className="label">Note</label>
                <input value={editPay.note || ''} onChange={e => setEditPay({ ...editPay, note: e.target.value })} className="input"/></div>
              <p className="text-[11px] text-theme-muted bg-surface-2/60 rounded-lg px-3 py-2">
                Changing the amount re-applies this payment across the learner's fee vote heads by priority order. The vote-head balances update automatically.
              </p>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setEditPay(null)} className="btn-ghost flex-1 justify-center">Cancel</button>
                <button onClick={saveEdit} className="btn-primary flex-1 justify-center">Save changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
