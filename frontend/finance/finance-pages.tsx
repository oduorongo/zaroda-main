// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// MODULE 03: Finance — Next.js Frontend
// Pages: Finance Dashboard · Fee Collection · M-Pesa Payment
//        Debtors · Cashbook · Gov Funds · Payroll
// ============================================================

'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api/client';

// ─────────────────────────────────────────────────────────────
// lib/api/finance.ts
// ─────────────────────────────────────────────────────────────
export const FinanceAPI = {
  // Fee structures
  createFeeStructure: (d: any) => apiClient.post('/api/v1/finance/fee-structures', d),
  generateInvoices:   (d: any) => apiClient.post('/api/v1/finance/invoices/generate', d),
  getLearnerInvoices: (id: string) => apiClient.get(`/api/v1/finance/invoices/learner/${id}`),
  getDebtors:         (year: string, term: string) =>
    apiClient.get('/api/v1/finance/debtors', { params: { academicYear: year, term } }),

  // Payments
  recordPayment:   (d: any)    => apiClient.post('/api/v1/finance/payments', d),
  getReceipt:      (ref: string) => apiClient.get(`/api/v1/finance/receipts/${ref}`),
  getStatement:    (id: string, year?: string) =>
    apiClient.get(`/api/v1/finance/statement/learner/${id}`, { params: { academicYear: year } }),

  // M-Pesa
  stkPush:         (d: any)    => apiClient.post('/api/v1/finance/mpesa/stk-push', d),
  checkMpesa:      (id: string)=> apiClient.get(`/api/v1/finance/mpesa/status/${id}`),

  // Reports
  getCashbook:     (p: any)    => apiClient.get('/api/v1/finance/reports/cashbook', { params: p }),
  getTrialBalance: (year: string, term: string) =>
    apiClient.get('/api/v1/finance/reports/trial-balance', { params: { academicYear: year, term } }),
  getIncomeStatement: (year: string, term: string) =>
    apiClient.get('/api/v1/finance/reports/income-statement', { params: { academicYear: year, term } }),
  getAgingReport:  (year: string) =>
    apiClient.get('/api/v1/finance/reports/aging', { params: { academicYear: year } }),

  // Gov funds
  recordGovFund:   (d: any) => apiClient.post('/api/v1/finance/gov-funds/receipts', d),
  getGovFundStatement: (type: string, year: string, term: string) =>
    apiClient.get(`/api/v1/finance/gov-funds/statement/${type}`, { params: { academicYear: year, term } }),

  // Payroll
  createPayroll:   (d: any)    => apiClient.post('/api/v1/finance/payroll', d),
  approvePayroll:  (id: string)=> apiClient.patch(`/api/v1/finance/payroll/${id}/approve`),

  // ZARODA bill
  getZarodaBill:   ()          => apiClient.get('/api/v1/finance/zaroda-bill'),
};


// ─────────────────────────────────────────────────────────────
// app/dashboard/finance/page.tsx — Finance Dashboard
// ─────────────────────────────────────────────────────────────
export default function FinanceDashboard() {
  const [year,       setYear]       = useState('2025/2026');
  const [term,       setTerm]       = useState('term_1');
  const [income,     setIncome]     = useState<any>(null);
  const [debtors,    setDebtors]    = useState<any>(null);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    Promise.all([
      FinanceAPI.getIncomeStatement(year, term),
      FinanceAPI.getDebtors(year, term),
    ]).then(([inc, deb]) => {
      setIncome(inc.data);
      setDebtors(deb.data);
    }).finally(() => setLoading(false));
  }, [year, term]);

  const fmt = (n: number) => `KES ${(n||0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Finance</h1>
          <p className="text-sm text-gray-500 mt-0.5">School financial overview</p>
        </div>
        <div className="flex gap-2">
          <select value={year} onChange={e => setYear(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]">
            <option value="2025/2026">2025/2026</option>
            <option value="2026/2027">2026/2027</option>
          </select>
          <select value={term} onChange={e => setTerm(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]">
            <option value="term_1">Term 1</option>
            <option value="term_2">Term 2</option>
            <option value="term_3">Term 3</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400 text-sm">Loading financial data…</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label:'Total Income',       value: fmt(income?.income?.totalIncome),    color:'bg-green-50',  border:'border-green-200', text:'text-green-700' },
              { label:'Fees Collected',     value: fmt(income?.income?.feesCollected),  color:'bg-blue-50',   border:'border-blue-200',  text:'text-blue-700' },
              { label:'Government Funds',   value: fmt(income?.income?.governmentFunds),color:'bg-purple-50', border:'border-purple-200',text:'text-purple-700' },
              { label:'Total Expenses',     value: fmt(income?.expenditure?.totalExpenses),color:'bg-orange-50',border:'border-orange-200',text:'text-orange-700' },
            ].map(k => (
              <div key={k.label} className={`${k.color} border ${k.border} rounded-xl p-4`}>
                <div className="text-xs text-gray-500 mb-1">{k.label}</div>
                <div className={`text-lg font-bold ${k.text}`}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Surplus card */}
          <div className={`rounded-xl p-5 mb-6 border ${income?.surplus >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-700">Net Surplus / (Deficit)</div>
                <div className={`text-2xl font-bold mt-1 ${income?.surplus >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {fmt(income?.surplus)}
                </div>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${income?.surplus >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                {income?.surplus >= 0 ? '↑' : '↓'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Debtors summary */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">Outstanding Fees</h3>
                <a href="/dashboard/finance/debtors" className="text-xs text-[#1a2e5a] hover:underline">View all →</a>
              </div>
              <div className="text-2xl font-bold text-red-600 mb-1">
                {fmt(debtors?.totalOutstanding)}
              </div>
              <div className="text-sm text-gray-500">{debtors?.count} learners with unpaid balances</div>

              {/* Top 5 debtors */}
              {debtors?.debtors?.slice(0,5).map((d: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-t border-gray-50 mt-2">
                  <div>
                    <div className="text-sm font-medium text-gray-800">{d.firstName} {d.lastName}</div>
                    <div className="text-xs text-gray-400">{d.streamName} · {d.admissionNumber}</div>
                  </div>
                  <div className="text-sm font-bold text-red-600">
                    {fmt(parseFloat(d.balanceDue))}
                  </div>
                </div>
              ))}
            </div>

            {/* Gov funds breakdown */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Government Funds</h3>
              {income?.income?.govFundBreakdown?.length > 0 ? (
                income.income.govFundBreakdown.map((g: any) => (
                  <div key={g.id} className="flex items-center justify-between py-2.5 border-b border-gray-50">
                    <div>
                      <div className="text-sm font-medium text-gray-800 uppercase">{g.fundType}</div>
                      <div className="text-xs text-gray-400">{g.academicYear} {g.term?.replace('_',' ')}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-purple-700">{fmt(Number(g.amountReceived))}</div>
                      <div className="text-xs text-gray-400">of {fmt(Number(g.amountExpected))}</div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400">No government funds recorded for this term.</p>
              )}
              <a href="/dashboard/finance/gov-funds"
                className="block mt-3 text-center text-xs text-[#1a2e5a] hover:underline">
                Manage FPE / FDJSE / FDSSE →
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// app/dashboard/finance/collect/page.tsx — Fee Collection
// ─────────────────────────────────────────────────────────────
export function FeeCollectionPage() {
  const [step,       setStep]       = useState<'search'|'pay'|'mpesa'|'done'>('search');
  const [search,     setSearch]     = useState('');
  const [learner,    setLearner]    = useState<any>(null);
  const [invoices,   setInvoices]   = useState<any[]>([]);
  const [selectedInv,setSelectedInv]= useState<any>(null);
  const [method,     setMethod]     = useState('mpesa');
  const [amount,     setAmount]     = useState('');
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [mpesaRef,   setMpesaRef]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState<any>(null);
  const [error,      setError]      = useState('');
  const [stkStatus,  setStkStatus]  = useState<'idle'|'pending'|'confirmed'|'failed'>('idle');
  const [checkoutId, setCheckoutId] = useState('');

  const searchLearner = async () => {
    if (!search.trim()) return;
    setLoading(true); setError('');
    try {
      const { data } = await apiClient.get('/api/v1/learners', { params: { search, limit: 5 } });
      if (data.data.length === 0) { setError('No learner found with that name or admission number.'); return; }
      if (data.data.length === 1) await selectLearner(data.data[0]);
      else setLearner(data.data); // show list to pick
    } catch { setError('Search failed.'); }
    finally { setLoading(false); }
  };

  const selectLearner = async (l: any) => {
    setLearner(l);
    const { data } = await FinanceAPI.getLearnerInvoices(l.id);
    const unpaid = data.filter((i: any) => ['unpaid','partial'].includes(i.status));
    setInvoices(unpaid);
    if (unpaid.length === 1) { setSelectedInv(unpaid[0]); setAmount(unpaid[0].totalAmount); }
    setStep('pay');
  };

  const submitPayment = async () => {
    if (!selectedInv || !amount) { setError('Select invoice and enter amount.'); return; }
    setError(''); setLoading(true);

    try {
      if (method === 'mpesa' && !mpesaRef) {
        // Initiate STK push
        const { data: stk } = await FinanceAPI.stkPush({
          phone: mpesaPhone || learner.guardianPhone,
          amount: parseFloat(amount),
          accountRef: learner.admissionNumber,
          description: `Fee payment ${selectedInv.invoiceNumber}`,
        });
        setCheckoutId(stk.checkoutRequestId);
        setStkStatus('pending');
        setStep('mpesa');
        // Poll for confirmation
        pollStkStatus(stk.checkoutRequestId);
        return;
      }

      const { data } = await FinanceAPI.recordPayment({
        learnerId:     learner.id,
        invoiceId:     selectedInv.id,
        amount:        parseFloat(amount),
        paymentMethod: method,
        mpesaRef,
        narration: `Fee payment — ${selectedInv.invoiceNumber}`,
      });
      setResult(data);
      setStep('done');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Payment failed.');
    } finally { setLoading(false); }
  };

  const pollStkStatus = async (cid: string) => {
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const { data } = await FinanceAPI.checkMpesa(cid);
        if (data.ResultCode === 0) {
          setStkStatus('confirmed');
          // Auto-reconciled by backend callback; reload statement
          setTimeout(() => setStep('done'), 1000);
          return;
        }
        if (data.ResultCode !== undefined && data.ResultCode !== 0) {
          setStkStatus('failed');
          setError('M-Pesa payment failed or was cancelled. Please try another method.');
          setStep('pay');
          return;
        }
      } catch {}
    }
    setStkStatus('failed');
    setError('M-Pesa confirmation timed out. Check if payment went through and record manually.');
    setStep('pay');
  };

  const fmt = (n: number) => `KES ${(n||0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Collect Fee Payment</h1>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>}

      {/* SEARCH */}
      {step === 'search' && (
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Search Learner</label>
          <div className="flex gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchLearner()}
              placeholder="Name or admission number"
              className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
            <button onClick={searchLearner} disabled={loading}
              className="px-4 py-2.5 bg-[#1a2e5a] text-white rounded-lg text-sm font-medium hover:bg-[#142347] disabled:opacity-60">
              {loading ? '…' : 'Search'}
            </button>
          </div>
        </div>
      )}

      {/* PAYMENT FORM */}
      {step === 'pay' && learner && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          {/* Learner info */}
          <div className="flex items-center gap-3 p-3 bg-[#f4f6fb] rounded-lg">
            <div className="w-10 h-10 bg-[#1a2e5a] rounded-full flex items-center justify-center text-white font-medium">
              {learner.firstName?.[0]}{learner.lastName?.[0]}
            </div>
            <div>
              <div className="font-semibold text-gray-800">{learner.firstName} {learner.lastName}</div>
              <div className="text-xs text-gray-500">{learner.admissionNumber} · {learner.stream?.name}</div>
            </div>
          </div>

          {/* Invoice selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Invoice</label>
            <select value={selectedInv?.id || ''} onChange={e => {
              const inv = invoices.find(i => i.id === e.target.value);
              setSelectedInv(inv);
              if (inv) setAmount(String(inv.totalAmount - (inv.totalPaid || 0)));
            }} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]">
              <option value="">Select invoice…</option>
              {invoices.map(i => (
                <option key={i.id} value={i.id}>
                  {i.invoiceNumber} — Balance: {fmt(i.totalAmount - (i.totalPaid || 0))} ({i.term?.replace('_',' ')})
                </option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min={1}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
          </div>

          {/* Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v:'mpesa', label:'M-Pesa', icon:'📱' },
                { v:'cash',  label:'Cash',   icon:'💵' },
                { v:'bank',  label:'Bank',   icon:'🏦' },
              ].map(m => (
                <button key={m.v} onClick={() => setMethod(m.v)}
                  className={`py-2.5 px-3 rounded-lg text-sm font-medium border transition-all
                    ${method === m.v ? 'bg-[#1a2e5a] text-white border-[#1a2e5a]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* M-Pesa phone */}
          {method === 'mpesa' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number <span className="text-xs text-gray-400">(STK Push)</span>
                </label>
                <input value={mpesaPhone || learner.guardianPhone || ''}
                  onChange={e => setMpesaPhone(e.target.value)}
                  placeholder="0712345678"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  M-Pesa Ref <span className="text-xs text-gray-400">(if already paid)</span>
                </label>
                <input value={mpesaRef} onChange={e => setMpesaRef(e.target.value)}
                  placeholder="e.g. QKJ4XG2Z1P — leave blank to initiate STK"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={() => { setStep('search'); setLearner(null); }}
              className="px-4 py-2.5 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50">
              ← Back
            </button>
            <button onClick={submitPayment} disabled={loading || !selectedInv || !amount}
              className="flex-1 py-2.5 bg-[#1a2e5a] text-white text-sm font-medium rounded-lg hover:bg-[#142347] disabled:opacity-60">
              {loading ? 'Processing…' : method === 'mpesa' && !mpesaRef ? 'Send STK Push' : 'Record Payment'}
            </button>
          </div>
        </div>
      )}

      {/* MPESA WAITING */}
      {step === 'mpesa' && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
            📱
          </div>
          <h3 className="font-semibold text-gray-800 mb-2">
            {stkStatus === 'pending' ? 'Waiting for M-Pesa…' : stkStatus === 'confirmed' ? 'Payment Confirmed!' : 'Payment Failed'}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {stkStatus === 'pending'
              ? `An M-Pesa prompt has been sent to ${mpesaPhone || learner?.guardianPhone}. Ask the parent to enter their PIN.`
              : stkStatus === 'confirmed'
              ? 'Payment has been confirmed and automatically reconciled.'
              : 'The payment was not completed.'}
          </p>
          {stkStatus === 'pending' && (
            <div className="flex justify-center">
              <svg className="animate-spin w-8 h-8 text-[#1a2e5a]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
          )}
        </div>
      )}

      {/* DONE — Receipt */}
      {step === 'done' && result && (
        <div className="bg-white rounded-xl border border-gray-100 p-8">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <h3 className="font-semibold text-gray-800">Payment Recorded</h3>
          </div>

          {/* Receipt preview */}
          <div className="bg-[#f4f6fb] rounded-xl p-4 space-y-2 text-sm mb-5">
            <div className="text-center font-bold text-[#1a2e5a] mb-3">
              ZARODA SMS — OFFICIAL RECEIPT
            </div>
            {[
              ['Receipt No.', result.receiptNumber],
              ['Amount',      `KES ${parseFloat(amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`],
              ['Balance Due', `KES ${result.balance?.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`],
              ['Status',      result.status?.toUpperCase()],
            ].map(([k,v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-gray-500">{k}</span>
                <span className="font-medium text-gray-800">{v}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setStep('search'); setLearner(null); setSelectedInv(null); setAmount(''); setResult(null); }}
              className="flex-1 py-2.5 bg-[#1a2e5a] text-white rounded-xl text-sm font-medium hover:bg-[#142347]">
              Collect Another
            </button>
            <button className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm hover:bg-gray-50"
              onClick={() => window.print()}>
              🖨 Print
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// app/dashboard/finance/gov-funds/page.tsx
// FPE / FDJSE / FDSSE Fund Management
// ─────────────────────────────────────────────────────────────
export function GovFundsPage() {
  const [fundType,    setFundType]    = useState<'fpe'|'fdjse'|'fdsse'>('fpe');
  const [year,        setYear]        = useState('2025/2026');
  const [term,        setTerm]        = useState('term_1');
  const [statement,   setStatement]   = useState<any>(null);
  const [loading,     setLoading]     = useState(false);
  const [showForm,    setShowForm]    = useState(false);
  const [form,        setForm]        = useState({ amountReceived: '', amountExpected: '', enrolledCount: '', capitationRate: '', treasuryRef: '' });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await FinanceAPI.getGovFundStatement(fundType, year, term);
      setStatement(data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [fundType, year, term]);

  const save = async () => {
    await FinanceAPI.recordGovFund({ fundType, academicYear: year, term, ...form });
    setShowForm(false);
    load();
  };

  const fmt = (n: number) => `KES ${(n||0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

  const FUND_COLORS: Record<string, string> = {
    fpe: 'bg-blue-600', fdjse: 'bg-purple-600', fdsse: 'bg-green-600'
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Government Funds</h1>
          <p className="text-sm text-gray-500">FPE · FDJSE · FDSSE — Kenya Handbook Format</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-[#1a2e5a] text-white text-sm font-medium rounded-lg hover:bg-[#142347]">
          + Record Receipt
        </button>
      </div>

      {/* Fund type tabs */}
      <div className="flex gap-2 mb-5">
        {(['fpe','fdjse','fdsse'] as const).map(f => (
          <button key={f} onClick={() => setFundType(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all uppercase
              ${fundType === f ? `${FUND_COLORS[f]} text-white border-transparent` : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {f}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <select value={year} onChange={e => setYear(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option value="2025/2026">2025/2026</option>
          </select>
          <select value={term} onChange={e => setTerm(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option value="term_1">Term 1</option>
            <option value="term_2">Term 2</option>
            <option value="term_3">Term 3</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : statement ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label:'Received',     value: fmt(statement.totalReceived), color:'text-green-700' },
              { label:'Spent',        value: fmt(statement.totalSpent),    color:'text-orange-700' },
              { label:'Balance',      value: fmt(statement.balance),       color: statement.balance >= 0 ? 'text-blue-700' : 'text-red-700' },
            ].map(c => (
              <div key={c.label} className="bg-white border border-gray-100 rounded-xl p-4 text-center">
                <div className="text-xs text-gray-500 mb-1">{c.label}</div>
                <div className={`text-lg font-bold ${c.color}`}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Vote head utilization */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
            <h3 className="font-semibold text-gray-800 mb-4">
              Expenditure by Vote Head <span className="text-xs text-gray-400 font-normal">(Kenya Handbook Format)</span>
            </h3>
            {statement.utilization?.length > 0 ? (
              <div className="space-y-3">
                {statement.utilization.map((u: any) => (
                  <div key={u.voteHead}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700">{u.voteHead}</span>
                      <span className="font-medium text-gray-800">{fmt(u.amount)} <span className="text-gray-400 text-xs">({u.pct}%)</span></span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${FUND_COLORS[fundType]} rounded-full transition-all`}
                        style={{ width: `${Math.min(u.pct, 100)}%` }}/>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No expenditure recorded yet for this term.</p>
            )}
          </div>
        </>
      ) : null}

      {/* Record receipt modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="font-semibold text-gray-800 mb-4">Record {fundType.toUpperCase()} Receipt</h3>
            <div className="space-y-3">
              {[
                { key:'amountExpected',  label:'Expected Amount (KES)',    type:'number' },
                { key:'amountReceived',  label:'Amount Received (KES)',    type:'number' },
                { key:'enrolledCount',   label:'Enrolled Learners',        type:'number' },
                { key:'capitationRate',  label:'Capitation Rate per Learner', type:'number' },
                { key:'treasuryRef',     label:'Treasury Reference',       type:'text' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                  <input type={f.type} value={(form as any)[f.key]}
                    onChange={e => setForm(p => ({...p, [f.key]: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm">Cancel</button>
              <button onClick={save}
                className="flex-1 py-2.5 bg-[#1a2e5a] text-white rounded-lg text-sm font-medium hover:bg-[#142347]">
                Save Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
