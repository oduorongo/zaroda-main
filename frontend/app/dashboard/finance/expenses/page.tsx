'use client';
import { useState, useEffect } from 'react';
import { Plus, X, Loader2, TrendingDown, Wallet } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, isBursar } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

const EXPENSE_CATEGORIES = ['Salaries','Utilities','Supplies','Maintenance','Transport','Food','Examinations','Co-curricular','Other'];

export default function ExpensesPage() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [form, setForm] = useState({ description: '', category: 'Supplies', amount: 0, date: new Date().toISOString().split('T')[0], payee: '' });

  const load = () => {
    setLoading(true);
    apiClient.get('/finance/expenses').then(r => setExpenses(r.data)).catch(()=>{}).finally(()=>setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try { await apiClient.post('/finance/expenses', form); toast.success('Expense recorded'); setShowNew(false); load(); }
    catch { toast.error('Could not save'); } finally { setSaving(false); }
  };
  const fmt = (n: number) => `KES ${(n||0).toLocaleString('en-KE')}`;
  const total = expenses.reduce((s, e) => s + (e.amount||0), 0);

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div><h1 className="text-2xl font-black text-theme-heading">Expenses</h1>
          <p className="text-sm text-theme-muted">Track school expenditure by category</p></div>
        {isBursar(user?.role || '') && <button onClick={()=>setShowNew(true)} className="btn-primary"><Plus size={16}/> Record Expense</button>}
      </div>

      <div className="card p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center"><TrendingDown size={20} className="text-white"/></div>
        <div><div className="text-2xl font-black text-theme-heading">{fmt(total)}</div><div className="text-xs text-theme-muted">Total expenses recorded</div></div>
      </div>

      {loading ? <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-14 shimmer rounded-xl"/>)}</div>
      : expenses.length === 0 ? (
        <div className="card p-10 text-center"><Wallet size={36} className="mx-auto text-[#e2e6f0] mb-2"/><p className="text-theme-muted">No expenses recorded</p></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full"><thead><tr className="table-header">
            <th className="px-4 py-3 text-left text-xs">Description</th>
            <th className="px-4 py-3 text-left text-xs">Category</th>
            <th className="px-4 py-3 text-left text-xs hidden sm:table-cell">Payee</th>
            <th className="px-4 py-3 text-left text-xs hidden md:table-cell">Date</th>
            <th className="px-4 py-3 text-right text-xs">Amount</th>
          </tr></thead><tbody>
            {expenses.map((ex: any, i: number) => (
              <tr key={ex.id} className={`border-b border-theme ${i%2===0?'bg-surface':'bg-surface-2'}`}>
                <td className="px-4 py-3 text-sm font-semibold text-theme-heading">{ex.description}</td>
                <td className="px-4 py-3"><span className="badge bg-surface-2 text-theme">{ex.category}</span></td>
                <td className="px-4 py-3 text-sm text-theme-muted hidden sm:table-cell">{ex.payee || '—'}</td>
                <td className="px-4 py-3 text-sm text-theme-muted hidden md:table-cell">{ex.date ? new Date(ex.date).toLocaleDateString('en-KE') : '—'}</td>
                <td className="px-4 py-3 text-sm font-bold text-right text-red-600">{fmt(ex.amount)}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <h3 className="text-lg font-bold text-theme-heading">Record Expense</h3>
              <button onClick={()=>setShowNew(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-4">
              <div><label className="label">Description *</label><input required value={form.description} onChange={set('description')} className="input" placeholder="Printer toner cartridges"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Category</label><select value={form.category} onChange={set('category')} className="input">{EXPENSE_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>
                <div><label className="label">Amount (KES)</label><input type="number" value={form.amount} onChange={set('amount')} className="input"/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Date</label><input type="date" value={form.date} onChange={set('date')} className="input"/></div>
                <div><label className="label">Payee</label><input value={form.payee} onChange={set('payee')} className="input" placeholder="Supplier name"/></div>
              </div>
              <div className="flex gap-3"><button type="button" onClick={()=>setShowNew(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? <Loader2 size={14} className="animate-spin"/> : 'Record'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
