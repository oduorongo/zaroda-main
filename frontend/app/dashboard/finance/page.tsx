'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { DollarSign, Search, CreditCard, Loader2, FileText, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';
import { InvoiceButton, ReceiptButton } from '@/components/pdf/pdf-buttons';

export default function FinancePage() {
  const [tab,       setTab]      = useState<'invoices'|'receipts'|'payroll'>('invoices');
  const [invoices,  setInvoices] = useState<any[]>([]);
  const [search,    setSearch]   = useState('');
  const [loading,   setLoading]  = useState(true);
  const [mpeza,     setMpeza]    = useState<{invoiceId:string;phone:string}|null>(null);
  const [mpezaLoading, setMpezaLoading] = useState(false);
  const [term,      setTerm]     = useState('term_1');
  const [year,      setYear]     = useState('2025/2026');

  const load = () => {
    setLoading(true);
    const p = new URLSearchParams({ term, academicYear: year });
    if (search) p.set('search', search);
    apiClient.get(`/finance/invoices?${p}`)
      .then(r => setInvoices(r.data))
      .catch(() => toast.error('Could not load invoices'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, term, year]);

  const fmt = (n: number) => `KES ${(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

  const statusBadge = (status: string) => {
    const conf: Record<string, string> = {
      paid:     'bg-green-100 text-green-700',
      partial:  'bg-amber-100 text-amber-700',
      unpaid:   'bg-red-100   text-red-700',
      overpaid: 'bg-purple-100 text-purple-700',
    };
    return <span className={`badge ${conf[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>;
  };

  const sendStk = async () => {
    if (!mpeza) return;
    setMpezaLoading(true);
    try {
      await apiClient.post('/finance/mpesa/stk-push', mpeza);
      toast.success('M-Pesa prompt sent! Ask parent to check their phone.');
      setMpeza(null);
    } catch { toast.error('M-Pesa request failed. Check credentials in settings.'); }
    finally { setMpezaLoading(false); }
  };

  const TABS = [
    { key: 'invoices', label: 'Fee Invoices' },
    { key: 'receipts', label: 'Receipts'     },
    { key: 'payroll',  label: 'Payroll'      },
  ];

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Finance & Fees</h1>
          <p className="text-sm text-theme-muted">Fee collection · M-Pesa · Payroll · FPE/FDJSE/FDSSE</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/dashboard/finance/payments" className="btn-primary text-xs"><DollarSign size={13}/> Record Payment</Link>
          <Link href="/dashboard/finance/fee-structures" className="btn-ghost text-xs">Fee Structures</Link>
          <Link href="/dashboard/finance/expenses" className="btn-ghost text-xs">Expenses</Link>
          <Link href="/dashboard/finance/accounting" className="btn-ghost text-xs">Accounting</Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-theme gap-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${tab===t.key ? 'border-[#1a2e5a] text-theme-heading' : 'border-transparent text-theme-muted hover:text-theme-heading'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'invoices' && (
        <>
          {/* Filters */}
          <div className="card p-4 flex gap-3 flex-wrap items-end">
            <div className="flex-1 min-w-[200px] relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted"/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by learner name…" className="input pl-8"/>
            </div>
            <select value={term} onChange={e => setTerm(e.target.value)} className="input w-36">
              <option value="term_1">Term 1</option>
              <option value="term_2">Term 2</option>
              <option value="term_3">Term 3</option>
            </select>
            <select value={year} onChange={e => setYear(e.target.value)} className="input w-36">
              <option value="2025/2026">2025/2026</option>
              <option value="2024/2025">2024/2025</option>
            </select>
          </div>

          {/* Summary cards */}
          {!loading && invoices.length > 0 && (() => {
            const paid    = invoices.filter(i => i.status === 'paid').length;
            const partial = invoices.filter(i => i.status === 'partial').length;
            const unpaid  = invoices.filter(i => i.status === 'unpaid').length;
            const total   = invoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
            const collected = invoices.reduce((s, i) => s + (i.amountPaid || 0), 0);
            return (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                  { label: 'Total Billed',  value: fmt(total),     color: 'text-theme-heading' },
                  { label: 'Collected',     value: fmt(collected),  color: 'text-green-600' },
                  { label: 'Outstanding',   value: fmt(total - collected), color: 'text-red-600' },
                  { label: 'Fully Paid',    value: paid,            color: 'text-green-600' },
                  { label: 'Unpaid',        value: unpaid,          color: 'text-red-600'   },
                ].map(s => (
                  <div key={s.label} className="card p-3 text-center">
                    <div className={`text-lg font-black ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-theme-muted">{s.label}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Invoices table */}
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 shimmer rounded-xl"/>)}</div>
          ) : invoices.length === 0 ? (
            <div className="card p-10 text-center">
              <FileText size={36} className="mx-auto text-[#e2e6f0] mb-2"/>
              <p className="text-theme-muted">No invoices for selected term</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="table-header">
                    <th className="px-4 py-3 text-left text-xs">Learner</th>
                    <th className="px-4 py-3 text-left text-xs hidden sm:table-cell">Invoice No.</th>
                    <th className="px-4 py-3 text-right text-xs">Total</th>
                    <th className="px-4 py-3 text-right text-xs hidden md:table-cell">Paid</th>
                    <th className="px-4 py-3 text-right text-xs">Balance</th>
                    <th className="px-4 py-3 text-center text-xs">Status</th>
                    <th className="px-4 py-3 text-center text-xs">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv: any, i: number) => {
                    const balance = (inv.totalAmount || 0) - (inv.amountPaid || 0);
                    return (
                      <tr key={inv.id} className={`border-b border-theme hover:bg-[#f9fafb] ${i%2===0?'bg-surface':'bg-surface-2'}`}>
                        <td className="px-4 py-3">
                          <div className="text-sm font-semibold text-theme-heading">{inv.learner?.firstName} {inv.learner?.lastName}</div>
                          <div className="text-xs text-theme-muted">{inv.learner?.stream?.name}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-theme-muted hidden sm:table-cell">{inv.invoiceNumber}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-right text-theme-heading">{fmt(inv.totalAmount)}</td>
                        <td className="px-4 py-3 text-sm text-right text-green-600 hidden md:table-cell">{fmt(inv.amountPaid)}</td>
                        <td className={`px-4 py-3 text-sm font-bold text-right ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(Math.abs(balance))}</td>
                        <td className="px-4 py-3 text-center">{statusBadge(inv.status)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2 flex-wrap">
                            <InvoiceButton invoiceId={inv.id} invoiceNumber={inv.invoiceNumber} compact/>
                            {balance > 0 && (
                              <button onClick={() => setMpeza({ invoiceId: inv.id, phone: inv.learner?.guardianPhone || '' })}
                                className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg hover:bg-green-700 font-medium">
                                M-Pesa
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'receipts' && (
        <div className="card p-8 text-center">
          <p className="text-theme-muted">Receipts list — calls <code className="bg-surface-2 px-1 rounded">/api/v1/finance/receipts</code></p>
        </div>
      )}

      {tab === 'payroll' && (
        <div className="card p-8 text-center">
          <p className="text-theme-muted">Payroll — calls <code className="bg-surface-2 px-1 rounded">/api/v1/finance/payroll</code></p>
        </div>
      )}

      {/* M-Pesa STK modal */}
      {mpeza && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-theme-heading mb-1">Send M-Pesa Request</h3>
            <p className="text-sm text-theme-muted mb-4">Parent will receive an M-Pesa prompt on their phone</p>
            <label className="label">Parent Phone Number</label>
            <input value={mpeza.phone}
              onChange={e => setMpeza(m => m ? {...m, phone: e.target.value} : null)}
              placeholder="+254 7XX XXX XXX" className="input mb-4"/>
            <div className="flex gap-3">
              <button onClick={() => setMpeza(null)} className="btn-ghost flex-1">Cancel</button>
              <button onClick={sendStk} disabled={mpezaLoading || !mpeza.phone} className="btn-primary flex-1">
                {mpezaLoading ? <><Loader2 size={14} className="animate-spin"/> Sending…</> : '📱 Send STK Push'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
