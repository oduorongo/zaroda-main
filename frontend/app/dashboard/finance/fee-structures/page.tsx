'use client';
import { useState, useEffect } from 'react';
import { Plus, X, Loader2, Receipt, Bus, Home, Utensils, Award } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, isBursar } from '@/lib/hooks/useAuth';
import { GRADE_LEVELS } from '@/lib/cbc/constants';
import toast from 'react-hot-toast';

const FEE_CATEGORIES = [
  { value: 'tuition',   label: 'Tuition',   icon: Receipt },
  { value: 'transport', label: 'Transport', icon: Bus },
  { value: 'boarding',  label: 'Boarding',  icon: Home },
  { value: 'meals',     label: 'Meals',     icon: Utensils },
  { value: 'activity',  label: 'Activity',  icon: Award },
];

export default function FeeStructuresPage() {
  const { user } = useAuth();
  const [structures, setStructures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [form, setForm] = useState({
    name: '', gradeLevel: '', term: 'term_1', academicYear: '2025/2026',
    category: 'tuition', amount: 0, isMandatory: true,
  });

  const load = () => {
    setLoading(true);
    apiClient.get('/finance/fee-structures')
      .then(r => setStructures(r.data))
      .catch(() => toast.error('Could not load fee structures'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const set = (k: string) => (e: any) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.post('/finance/fee-structures', form);
      toast.success('Fee structure created');
      setShowNew(false);
      load();
    } catch { toast.error('Could not save'); }
    finally { setSaving(false); }
  };

  const fmt = (n: number) => `KES ${(n||0).toLocaleString('en-KE')}`;

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Fee Structures</h1>
          <p className="text-sm text-theme-muted">Tuition, transport, boarding, meals — designed by the bursar</p>
        </div>
        {isBursar(user?.role || '') && (
          <button onClick={() => setShowNew(true)} className="btn-primary"><Plus size={16}/> New Structure</button>
        )}
      </div>

      {loading ? <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-14 shimmer rounded-xl"/>)}</div>
      : structures.length === 0 ? (
        <div className="card p-10 text-center">
          <Receipt size={36} className="mx-auto text-[#e2e6f0] mb-2"/>
          <p className="text-theme-muted">No fee structures defined</p>
          {isBursar(user?.role || '') && <button onClick={() => setShowNew(true)} className="btn-primary mt-4"><Plus size={16}/> Create First</button>}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead><tr className="table-header">
              <th className="px-4 py-3 text-left text-xs">Name</th>
              <th className="px-4 py-3 text-left text-xs hidden sm:table-cell">Grade</th>
              <th className="px-4 py-3 text-left text-xs">Category</th>
              <th className="px-4 py-3 text-right text-xs">Amount</th>
              <th className="px-4 py-3 text-center text-xs hidden md:table-cell">Term</th>
            </tr></thead>
            <tbody>
              {structures.map((s: any, i: number) => (
                <tr key={s.id} className={`border-b border-theme ${i%2===0?'bg-surface':'bg-surface-2'}`}>
                  <td className="px-4 py-3 text-sm font-semibold text-theme-heading">{s.name}</td>
                  <td className="px-4 py-3 text-sm text-theme-muted hidden sm:table-cell">{GRADE_LEVELS.find(g=>g.value===s.gradeLevel)?.label || 'All'}</td>
                  <td className="px-4 py-3"><span className="badge bg-surface-2 text-theme">{s.category}</span></td>
                  <td className="px-4 py-3 text-sm font-bold text-right text-theme-heading">{fmt(s.amount)}</td>
                  <td className="px-4 py-3 text-center text-sm text-theme-muted hidden md:table-cell">{s.term?.replace('_',' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <h3 className="text-lg font-bold text-theme-heading">New Fee Structure</h3>
              <button onClick={() => setShowNew(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-4">
              <div><label className="label">Name *</label><input required value={form.name} onChange={set('name')} className="input" placeholder="Grade 4 Term 1 Tuition"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Grade</label>
                  <select value={form.gradeLevel} onChange={set('gradeLevel')} className="input">
                    <option value="">All grades</option>
                    {GRADE_LEVELS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </div>
                <div><label className="label">Category</label>
                  <select value={form.category} onChange={set('category')} className="input">
                    {FEE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Term</label>
                  <select value={form.term} onChange={set('term')} className="input">
                    <option value="term_1">Term 1</option><option value="term_2">Term 2</option><option value="term_3">Term 3</option>
                  </select>
                </div>
                <div><label className="label">Amount (KES)</label><input type="number" value={form.amount} onChange={set('amount')} className="input"/></div>
              </div>
              <label className="flex items-center gap-2 text-sm text-theme cursor-pointer">
                <input type="checkbox" checked={form.isMandatory} onChange={set('isMandatory')} className="accent-[#1a2e5a]"/> Mandatory fee
              </label>
              <div className="flex gap-3"><button type="button" onClick={()=>setShowNew(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? <Loader2 size={14} className="animate-spin"/> : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
