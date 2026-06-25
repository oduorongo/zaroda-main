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
    setLearner(l); setBal(null); setLastReceipt(null); setLoadingBal(true);
    try {
      const r = await apiClient.get(`/finance/payments/learner/${l.id}`);
      setBal(r.data);
    } catch { setBal(null); }
    finally { setLoadingBal(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!learner) { toast.error('Select a learner first'); return; }
    setSaving(true);
    try {
      const { data } = await apiClient.post('/finance/payments', {
        learnerId: learner.id,
        learnerName: `${learner.firstName || ''} ${learner.lastName || ''}`.trim(),
        admissionNumber: learner.admissionNumber,
        amount: Number(form.amount),
        method: form.method, reference: form.reference, note: form.note,
        term: form.term || null, academicYear: form.academicYear, paidOn: form.paidOn,
      });
      toast.success('Payment recorded');
      setLastReceipt(data);
      setForm(f => ({ ...f, amount: '', reference: '', note: '' }));
      pickLearner(learner); // refresh balance
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not record payment');
    } finally { setSaving(false); }
  };

  const openReceipt = (paymentId: string) => {
    const token = localStorage.getItem('zaroda_token');
    const base = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
    const url = `${base}/api/v1/finance/payments/${paymentId}/receipt/html`;
    const w = window.open('', '_blank');
    fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.text())
      .then(html => { if (w) { w.document.write(html); w.document.close(); } })
      .catch(() => toast.error('Could not open receipt'));
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

          {/* Step 2: payment form */}
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
