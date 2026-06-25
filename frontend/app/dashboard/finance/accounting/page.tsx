'use client';
import { useState } from 'react';
import { BookOpen, FileSpreadsheet, Scale, FileText, Download } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

const REPORTS = [
  { key: 'cashbook',      icon: BookOpen,         label: 'Cashbook',         desc: 'All cash receipts and payments' },
  { key: 'ledger',        icon: FileSpreadsheet,  label: 'General Ledger',   desc: 'Account-by-account transactions' },
  { key: 'trial_balance', icon: Scale,            label: 'Trial Balance',    desc: 'Debits and credits balanced' },
  { key: 'income',        icon: FileText,         label: 'Income Statement', desc: 'Revenue minus expenses' },
  { key: 'fee_statement', icon: FileText,         label: 'Fee Statements',   desc: 'Per-learner fee account' },
];

export default function AccountingPage() {
  const [generating, setGenerating] = useState('');

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
