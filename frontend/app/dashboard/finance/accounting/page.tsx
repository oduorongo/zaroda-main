'use client';
import { useState, useEffect } from 'react';
import { BookOpen, FileSpreadsheet, Scale, FileText, Download, Landmark, Wrench, Loader2 } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

const REPORTS = [
  { key: 'cashbook',      icon: BookOpen,         label: 'Cashbook',         desc: 'All cash receipts and payments' },
  { key: 'ledger',        icon: FileSpreadsheet,  label: 'General Ledger',   desc: 'Account-by-account transactions' },
  { key: 'trial_balance', icon: Scale,            label: 'Trial Balance',    desc: 'Debits and credits balanced' },
  { key: 'income',        icon: FileText,         label: 'Income Statement', desc: 'Revenue minus expenses' },
  { key: 'fee_statement', icon: FileText,         label: 'Fee Statements',   desc: 'Per-learner fee account' },
];

const ksh = (n: number) => 'KES ' + Number(n || 0).toLocaleString('en-KE');

export default function AccountingPage() {
  const [generating, setGenerating] = useState('');
  const [voteHeads, setVoteHeads] = useState<any[]>([]);
  const [totalReceived, setTotalReceived] = useState(0);
  const [loadingVoteHeads, setLoadingVoteHeads] = useState(true);
  const [reconciling, setReconciling] = useState(false);

  const loadVoteHeads = () => {
    setLoadingVoteHeads(true);
    apiClient.get('/finance/vote-heads/summary')
      .then(r => { setVoteHeads(r.data?.voteHeads || []); setTotalReceived(Number(r.data?.totalReceived || 0)); })
      .catch(() => toast.error('Could not load vote head totals'))
      .finally(() => setLoadingVoteHeads(false));
  };
  useEffect(loadVoteHeads, []);

  // One-time repair for payments that were mis-split before a term-matching fix: money that
  // fell into an unattributed "Credit / Overpayment" bucket instead of paying down a learner's
  // real vote heads. Safe to run more than once — only touches unattributed allocations.
  const reconcile = async () => {
    setReconciling(true);
    try {
      const { data } = await apiClient.post('/finance/vote-heads/reconcile');
      toast.success(`Reconciled ${data.reconciled} of ${data.total} unattributed payment(s)`);
      loadVoteHeads();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not reconcile balances');
    } finally { setReconciling(false); }
  };

  const generate = async (key: string, label: string) => {
    setGenerating(key);
    try {
      const { data } = await apiClient.get(`/finance/reports/${key}`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a'); a.href = url; a.download = `${key}-report.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast.success(`${label} downloaded (CSV)`);
    } catch (e: any) { toast.error(err(e, label, key)); }
    finally { setGenerating(''); }
  };
  const err = (e: any, label: string, key: string) =>
    e?.response?.status === 404 ? `${label} report not available yet` : `Could not generate ${label}`;

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Accounting & Reports</h1>
          <p className="text-sm text-theme-muted">Kenyan accounting workflows — cashbook, ledger, trial balance, statements</p>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Landmark size={18} className="text-[#d4af37]"/>
            <div className="font-bold text-theme-heading">Total Received per Vote Head</div>
          </div>
          <button onClick={reconcile} disabled={reconciling} className="btn-ghost text-xs" title="Fix payments that were recorded but not applied to the correct vote head">
            {reconciling ? <Loader2 size={13} className="animate-spin"/> : <Wrench size={13}/>} Reconcile balances
          </button>
        </div>
        {loadingVoteHeads ? (
          <div className="h-32 shimmer rounded-xl"/>
        ) : voteHeads.length === 0 ? (
          <div className="text-sm text-theme-muted">No payments recorded yet</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-theme-muted text-xs uppercase tracking-wide">
                  <th className="py-2 pr-4">Vote Head</th>
                  <th className="py-2 pr-4 text-right">Payments</th>
                  <th className="py-2 text-right">Total Received</th>
                </tr>
              </thead>
              <tbody>
                {voteHeads.map((v: any) => (
                  <tr key={v.voteHead} className="border-t border-theme">
                    <td className="py-2 pr-4 font-medium text-theme-heading">{v.voteHead}</td>
                    <td className="py-2 pr-4 text-right text-theme-muted">{v.paymentCount}</td>
                    <td className="py-2 text-right font-bold text-theme-heading">{ksh(v.totalReceived)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-theme">
                  <td className="py-2 pr-4 font-bold text-theme-heading">Total</td>
                  <td/>
                  <td className="py-2 text-right font-black text-theme-heading">{ksh(totalReceived)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map(r => {
          const Icon = r.icon;
          return (
            <div key={r.key} className="card p-5">
              <div className="w-11 h-11 rounded-xl bg-[#1a2e5a] flex items-center justify-center mb-3">
                <Icon size={20} className="text-[#d4af37]"/>
              </div>
              <div className="font-bold text-theme-heading">{r.label}</div>
              <div className="text-xs text-theme-muted mt-0.5 mb-4">{r.desc}</div>
              <button onClick={() => generate(r.key, r.label)} disabled={generating === r.key}
                className="btn-ghost w-full justify-center text-xs">
                <Download size={13}/> {generating === r.key ? 'Generating…' : 'Download CSV'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
