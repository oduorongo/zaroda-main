'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Users, Play, Lock, Trash2, Printer, Save, Plus, X, Download, FileText } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';
import { ProUpgradeNotice, isProPlanError } from '@/components/ProUpgradeNotice';

const ksh = (n: number) => 'KES ' + Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 });
const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function PayrollPage() {
  const [tab, setTab] = useState<'salaries' | 'runs' | 'loans'>('runs');
  const [proLocked, setProLocked] = useState(false);

  // ── Staff salaries ──
  const [staff, setStaff] = useState<any[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ basicPay: '', houseAllowance: '', transportAllowance: '', otherAllowance: '', otherAllowanceLabel: '', paymentSource: 'school', remedialRate: '' });
  const [savingSalary, setSavingSalary] = useState(false);

  const loadStaff = () => {
    setLoadingStaff(true);
    apiClient.get('/finance/payroll/staff').then(r => setStaff(r.data || [])).catch((err) => { if (isProPlanError(err)) setProLocked(true); setStaff([]); }).finally(() => setLoadingStaff(false));
  };
  useEffect(() => { loadStaff(); }, []);

  const startEdit = (s: any) => {
    setEditingId(s.id);
    setForm({
      basicPay: s.basicPay || '', houseAllowance: s.houseAllowance || '',
      transportAllowance: s.transportAllowance || '', otherAllowance: s.otherAllowance || '',
      otherAllowanceLabel: s.otherAllowanceLabel || '',
      paymentSource: s.paymentSource || 'school', remedialRate: s.remedialRate || '',
    });
  };
  const saveSalary = async () => {
    if (!editingId) return;
    setSavingSalary(true);
    try {
      await apiClient.post('/finance/payroll/salaries', { staffId: editingId, ...form });
      toast.success('Salary saved');
      setEditingId(null);
      loadStaff();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not save salary'); }
    finally { setSavingSalary(false); }
  };

  // ── Staff loans/advances ──
  const [loans, setLoans] = useState<any[]>([]);
  const [loadingLoans, setLoadingLoans] = useState(true);
  const [showNewLoan, setShowNewLoan] = useState(false);
  const [loanForm, setLoanForm] = useState({ staffId: '', principalAmount: '', monthlyDeduction: '', reason: '' });
  const [savingLoan, setSavingLoan] = useState(false);

  const loadLoans = () => {
    setLoadingLoans(true);
    apiClient.get('/finance/payroll/loans').then(r => setLoans(r.data || [])).catch(() => setLoans([])).finally(() => setLoadingLoans(false));
  };
  useEffect(() => { loadLoans(); }, []);

  const staffWithoutActiveLoan = staff.filter((s: any) => !loans.some((l: any) => l.staffId === s.id && l.status === 'active'));

  const createLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanForm.staffId) { toast.error('Select a staff member'); return; }
    setSavingLoan(true);
    try {
      await apiClient.post('/finance/payroll/loans', loanForm);
      toast.success('Loan recorded and disbursement posted to Expenses');
      setShowNewLoan(false);
      setLoanForm({ staffId: '', principalAmount: '', monthlyDeduction: '', reason: '' });
      loadLoans();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not save loan'); }
    finally { setSavingLoan(false); }
  };

  const cancelLoan = async (id: string) => {
    if (!confirm('Cancel this loan? No further payroll deductions will be made for it.')) return;
    try { await apiClient.patch(`/finance/payroll/loans/${id}`, { status: 'cancelled' }); toast.success('Cancelled'); loadLoans(); }
    catch { toast.error('Could not cancel'); }
  };

  const deleteLoan = async (id: string) => {
    if (!confirm('Delete this loan record?')) return;
    try { await apiClient.delete(`/finance/payroll/loans/${id}`); toast.success('Deleted'); loadLoans(); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Could not delete'); }
  };

  // ── Payroll runs ──
  const [runs, setRuns] = useState<any[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [month, setMonth] = useState(thisMonth());
  const [running, setRunning] = useState(false);
  const [remedialLessons, setRemedialLessons] = useState<Record<string, string>>({});
  const remedialEligible = staff.filter((s: any) => s.paymentSource === 'tsc' || Number(s.remedialRate) > 0);
  const [openRun, setOpenRun] = useState<any>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadRuns = () => {
    setLoadingRuns(true);
    apiClient.get('/finance/payroll/runs').then(r => setRuns(r.data || [])).catch(() => setRuns([])).finally(() => setLoadingRuns(false));
  };
  useEffect(() => { loadRuns(); }, []);

  const runPayroll = async () => {
    setRunning(true);
    try {
      const lessons: Record<string, number> = {};
      for (const [id, v] of Object.entries(remedialLessons)) if (Number(v) > 0) lessons[id] = Number(v);
      const { data } = await apiClient.post('/finance/payroll/runs', { month, remedialLessons: lessons });
      toast.success(`Payroll computed for ${data.entries.length} staff member(s) — review before finalizing.`);
      setOpenRun(data);
      loadRuns();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not run payroll'); }
    finally { setRunning(false); }
  };

  const openRunDetail = async (id: string) => {
    try { const { data } = await apiClient.get(`/finance/payroll/runs/${id}`); setOpenRun(data); }
    catch { toast.error('Could not load payroll run'); }
  };

  const finalizeRun = async () => {
    if (!openRun) return;
    if (!confirm(`Finalize payroll for ${openRun.month}? This locks the run and posts net pay + statutory remittances into Expenses. This cannot be undone.`)) return;
    setFinalizing(true);
    try {
      const { data } = await apiClient.post(`/finance/payroll/runs/${openRun.id}/finalize`);
      toast.success('Payroll finalized and posted to Expenses.');
      setOpenRun(data);
      loadRuns();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not finalize'); }
    finally { setFinalizing(false); }
  };

  const deleteRun = async (id: string) => {
    if (!confirm('Delete this draft payroll run?')) return;
    setDeleting(id);
    try {
      await apiClient.delete(`/finance/payroll/runs/${id}`);
      toast.success('Draft deleted');
      if (openRun?.id === id) setOpenRun(null);
      loadRuns();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not delete'); }
    finally { setDeleting(null); }
  };

  const openPayslip = async (entryId: string) => {
    const tId = toast.loading('Opening payslip…');
    try {
      const res = await apiClient.get(`/finance/payroll/payslip/${entryId}/html`, { responseType: 'text' });
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
      toast.error(e?.response?.data?.message || 'Could not open payslip', { id: tId });
    }
  };

  const [p9StaffId, setP9StaffId] = useState('');
  const [p9Year, setP9Year] = useState(String(new Date().getFullYear()));
  const openP9 = async () => {
    if (!p9StaffId) { toast.error('Select a staff member'); return; }
    const tId = toast.loading('Opening annual summary…');
    try {
      const res = await apiClient.get(`/finance/payroll/p9/${p9StaffId}/html`, { params: { year: p9Year }, responseType: 'text' });
      const html = typeof res.data === 'string' ? res.data : String(res.data);
      const blob = new Blob([html], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      toast.dismiss(tId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not open annual summary', { id: tId });
    }
  };

  const downloadDisbursement = async (run: any) => {
    const tId = toast.loading('Preparing disbursement file…');
    try {
      const res = await apiClient.get(`/finance/payroll/runs/${run.id}/disbursement.csv`, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = blobUrl; a.download = `payroll-disbursement-${run.month}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      toast.dismiss(tId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not export disbursement file', { id: tId });
    }
  };

  if (proLocked) {
    return (
      <div className="space-y-5 max-w-4xl">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance" className="btn-ghost p-2"><ArrowLeft size={16}/></Link>
          <h1 className="text-2xl font-black text-theme-heading">Payroll</h1>
        </div>
        <ProUpgradeNotice feature="Payroll"/>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/finance" className="btn-ghost p-2"><ArrowLeft size={16}/></Link>
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Payroll</h1>
          <p className="text-sm text-theme-muted">Staff salaries, statutory deductions (PAYE, NSSF, SHA, Housing Levy) and payslips</p>
        </div>
      </div>

      <p className="text-xs text-theme-muted bg-surface-2/60 rounded-lg px-3 py-2">
        Statutory rates are set per current KRA/SHA/NSSF guidance at the time this was built and may change by government notice — verify against the latest official rates before relying on a payslip for compliance.
      </p>

      <div className="flex border-b border-theme gap-1">
        {[{ key: 'runs', label: 'Payroll Runs' }, { key: 'salaries', label: 'Staff Salaries' }, { key: 'loans', label: 'Loans & Advances' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${tab===t.key ? 'border-[#1a2e5a] text-theme-heading' : 'border-transparent text-theme-muted hover:text-theme-heading'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'salaries' && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} className="text-[#1a2e5a]"/>
            <h2 className="font-bold text-theme-heading">Staff Salaries</h2>
          </div>
          {loadingStaff ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-theme-muted" size={22}/></div>
          ) : staff.length === 0 ? (
            <p className="text-sm text-theme-muted text-center py-8">No active staff found.</p>
          ) : (
            <div className="divide-y divide-theme">
              {staff.map((s: any) => {
                const gross = Number(s.basicPay || 0) + Number(s.houseAllowance || 0) + Number(s.transportAllowance || 0) + Number(s.otherAllowance || 0);
                return (
                  <div key={s.id} className="py-3">
                    {editingId === s.id ? (
                      <div className="space-y-2">
                        <div className="font-semibold text-theme-heading text-sm">{s.firstName} {s.lastName} <span className="text-theme-muted font-normal capitalize">· {(s.role || '').replace('_',' ')}</span></div>
                        <div>
                          <label className="label">Payment Source</label>
                          <select value={form.paymentSource} onChange={e => setForm(f => ({...f, paymentSource: e.target.value}))} className="input">
                            <option value="school">School-paid</option>
                            <option value="tsc">TSC-paid (government) — not on this payroll</option>
                          </select>
                          <p className="text-xs text-theme-muted mt-1">Most public-school teachers are paid by TSC, not the school. TSC-paid staff are left out of a normal payroll run and are only paid here for remedial lessons.</p>
                        </div>
                        {form.paymentSource === 'school' && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div><label className="label">Basic Pay</label><input type="number" min={0} value={form.basicPay} onChange={e => setForm(f => ({...f, basicPay: e.target.value}))} className="input"/></div>
                            <div><label className="label">House Allowance</label><input type="number" min={0} value={form.houseAllowance} onChange={e => setForm(f => ({...f, houseAllowance: e.target.value}))} className="input"/></div>
                            <div><label className="label">Transport Allowance</label><input type="number" min={0} value={form.transportAllowance} onChange={e => setForm(f => ({...f, transportAllowance: e.target.value}))} className="input"/></div>
                            <div><label className="label">Other Allowance</label><input type="number" min={0} value={form.otherAllowance} onChange={e => setForm(f => ({...f, otherAllowance: e.target.value}))} className="input"/></div>
                          </div>
                        )}
                        {form.paymentSource === 'school' && Number(form.otherAllowance) > 0 && (
                          <input value={form.otherAllowanceLabel} onChange={e => setForm(f => ({...f, otherAllowanceLabel: e.target.value}))} className="input" placeholder="What is this other allowance for?"/>
                        )}
                        <div>
                          <label className="label">Remedial Rate (KES per lesson)</label>
                          <input type="number" min={0} value={form.remedialRate} onChange={e => setForm(f => ({...f, remedialRate: e.target.value}))} className="input max-w-[200px]"/>
                          <p className="text-xs text-theme-muted mt-1">Paid per lesson actually taught, entered each time payroll is run — for remedial/tuition lessons the school pays for directly.</p>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button onClick={saveSalary} disabled={savingSalary} className="btn-primary text-xs py-1.5 px-3">
                            {savingSalary ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Save
                          </button>
                          <button onClick={() => setEditingId(null)} className="btn-ghost text-xs py-1.5 px-3">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <div className="font-semibold text-theme-heading text-sm">{s.firstName} {s.lastName}</div>
                          <div className="text-xs text-theme-muted capitalize">
                            {(s.role || '').replace('_',' ')} {s.paymentSource === 'tsc' ? '· TSC-paid' : (gross > 0 ? `· Gross ${ksh(gross)}/mo` : '· No salary set')}
                            {Number(s.remedialRate) > 0 ? ` · Remedial ${ksh(s.remedialRate)}/lesson` : ''}
                          </div>
                        </div>
                        <button onClick={() => startEdit(s)} className="btn-ghost text-xs py-1.5 px-3">{gross > 0 || s.paymentSource === 'tsc' ? 'Edit' : 'Set salary'}</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'loans' && (
        <>
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-[#1a2e5a]"/>
                <h2 className="font-bold text-theme-heading">Staff Loans &amp; Advances</h2>
              </div>
              <button onClick={() => setShowNewLoan(true)} className="btn-primary text-sm"><Plus size={14}/> New Loan</button>
            </div>
            <p className="text-xs text-theme-muted">Disbursing a loan posts the full amount to Expenses immediately; the monthly deduction below just pays it down each payroll run — no double-counting.</p>
          </div>

          {loadingLoans ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-theme-muted" size={22}/></div>
          ) : loans.length === 0 ? (
            <div className="card p-8 text-center text-theme-muted">No loans recorded yet.</div>
          ) : (
            <div className="card p-5">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-theme-muted border-b border-theme">
                    <th className="px-2 py-2">Staff</th><th className="px-2 py-2 text-right">Principal</th>
                    <th className="px-2 py-2 text-right">Monthly Deduction</th><th className="px-2 py-2 text-right">Balance</th>
                    <th className="px-2 py-2">Status</th><th></th>
                  </tr></thead>
                  <tbody>
                    {loans.map((l: any) => (
                      <tr key={l.id} className="border-b border-theme/40">
                        <td className="px-2 py-2">{l.staffName}</td>
                        <td className="px-2 py-2 text-right">{ksh(l.principalAmount)}</td>
                        <td className="px-2 py-2 text-right">{ksh(l.monthlyDeduction)}</td>
                        <td className="px-2 py-2 text-right font-semibold">{ksh(l.balanceRemaining)}</td>
                        <td className="px-2 py-2">
                          <span className={`badge text-[10px] ${l.status === 'active' ? 'bg-amber-100 text-amber-700' : l.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{l.status}</span>
                        </td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          {l.status === 'active' && (
                            <button onClick={() => cancelLoan(l.id)} className="btn-ghost text-xs">Cancel</button>
                          )}
                          {Number(l.balanceRemaining) === Number(l.principalAmount) && (
                            <button onClick={() => deleteLoan(l.id)} className="btn-ghost text-xs text-red-600"><Trash2 size={12}/></button>
                          )}
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

      {tab === 'runs' && (
        <>
          <div className="card p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label">Month</label>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="input"/>
              </div>
              <button onClick={runPayroll} disabled={running} className="btn-primary">
                {running ? <Loader2 size={15} className="animate-spin"/> : <Play size={15}/>} Run Payroll
              </button>
            </div>
            <p className="text-xs text-theme-muted mt-2">Computes gross pay, PAYE, NSSF, SHA, Housing Levy and any active loan deduction for every school-paid staff member with a salary set. TSC-paid staff are left off this payroll unless remedial lessons are entered for them below. Running the same month again while it's still a draft recomputes it — nothing is duplicated.</p>
          </div>

          {remedialEligible.length > 0 && (
            <div className="card p-5">
              <h3 className="font-bold text-theme-heading text-sm mb-1">Remedial Lessons This Month</h3>
              <p className="text-xs text-theme-muted mb-3">Enter lessons actually taught for {month} — paid at each staff member's remedial rate and added to this run. Leave blank for staff not paid for remedial this month.</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {remedialEligible.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 bg-surface-2/60 rounded-lg px-3 py-2">
                    <div className="text-xs">
                      <div className="font-semibold text-theme-heading">{s.firstName} {s.lastName}</div>
                      <div className="text-theme-muted">{ksh(s.remedialRate || 0)}/lesson{s.paymentSource === 'tsc' ? ' · TSC-paid' : ''}</div>
                    </div>
                    <input type="number" min={0} className="input w-20 text-right" placeholder="0"
                      value={remedialLessons[s.id] || ''}
                      onChange={e => setRemedialLessons(m => ({ ...m, [s.id]: e.target.value }))}/>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-2">
              <FileText size={15} className="text-[#1a2e5a]"/>
              <h3 className="font-bold text-theme-heading text-sm">Annual PAYE Summary (P9-style)</h3>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[180px]">
                <label className="label">Staff Member</label>
                <select value={p9StaffId} onChange={e => setP9StaffId(e.target.value)} className="input">
                  <option value="">Select…</option>
                  {staff.map((s: any) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Year</label>
                <input type="number" value={p9Year} onChange={e => setP9Year(e.target.value)} className="input w-24"/>
              </div>
              <button onClick={openP9} className="btn-ghost"><Printer size={14}/> View</button>
            </div>
            <p className="text-xs text-theme-muted mt-2">A month-by-month breakdown for one staff member from finalized payroll only — a reference shaped like KRA's P9A, not a pixel-perfect copy. Verify against the current official form before filing.</p>
          </div>

          {loadingRuns ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-theme-muted" size={22}/></div>
          ) : runs.length === 0 ? (
            <div className="card p-8 text-center text-theme-muted">No payroll runs yet.</div>
          ) : (
            <div className="card p-5">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-theme-muted border-b border-theme">
                    <th className="px-2 py-2">Month</th><th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2 text-right">Staff</th><th className="px-2 py-2 text-right">Total Net Pay</th><th></th>
                  </tr></thead>
                  <tbody>
                    {runs.map((r: any) => (
                      <tr key={r.id} className="border-b border-theme/40">
                        <td className="px-2 py-2 font-semibold">{r.month}</td>
                        <td className="px-2 py-2">
                          <span className={`badge ${r.status === 'finalized' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span>
                        </td>
                        <td className="px-2 py-2 text-right">{r.staffCount}</td>
                        <td className="px-2 py-2 text-right font-semibold">{ksh(r.totalNetPay)}</td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          <button onClick={() => openRunDetail(r.id)} className="btn-ghost text-xs">View</button>
                          {r.status === 'finalized' && (
                            <button onClick={() => downloadDisbursement(r)} className="btn-ghost text-xs"><Download size={12}/></button>
                          )}
                          {r.status === 'draft' && (
                            <button onClick={() => deleteRun(r.id)} disabled={deleting === r.id} className="btn-ghost text-xs text-red-600">
                              {deleting === r.id ? <Loader2 size={12} className="animate-spin"/> : <Trash2 size={12}/>}
                            </button>
                          )}
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

      {openRun && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-3xl my-8 mt-16" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <h3 className="text-lg font-bold text-theme-heading">Payroll — {openRun.month}</h3>
                <span className={`badge mt-1 ${openRun.status === 'finalized' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{openRun.status}</span>
              </div>
              <button onClick={() => setOpenRun(null)}>✕</button>
            </div>
            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-theme-muted border-b border-theme">
                    <th className="px-2 py-2">Staff</th><th className="px-2 py-2 text-right">Gross</th>
                    <th className="px-2 py-2 text-right">PAYE</th><th className="px-2 py-2 text-right">NSSF</th>
                    <th className="px-2 py-2 text-right">SHA</th><th className="px-2 py-2 text-right">Housing</th>
                    <th className="px-2 py-2 text-right">Loan</th>
                    <th className="px-2 py-2 text-right">Remedial</th>
                    <th className="px-2 py-2 text-right">Net Pay</th><th></th>
                  </tr></thead>
                  <tbody>
                    {openRun.entries.map((e: any) => (
                      <tr key={e.id} className="border-b border-theme/40">
                        <td className="px-2 py-2">{e.staffName}{e.paymentSource === 'tsc' ? <span className="text-[10px] text-theme-muted"> · TSC-paid</span> : ''}</td>
                        <td className="px-2 py-2 text-right">{ksh(e.grossPay)}</td>
                        <td className="px-2 py-2 text-right">{ksh(e.paye)}</td>
                        <td className="px-2 py-2 text-right">{ksh(e.nssfEmployee)}</td>
                        <td className="px-2 py-2 text-right">{ksh(e.sha)}</td>
                        <td className="px-2 py-2 text-right">{ksh(e.housingLevyEmployee)}</td>
                        <td className="px-2 py-2 text-right">{Number(e.loanDeduction) > 0 ? ksh(e.loanDeduction) : '—'}</td>
                        <td className="px-2 py-2 text-right">{Number(e.remedialPay) > 0 ? `${ksh(e.remedialPay)} (${e.remedialLessons})` : '—'}</td>
                        <td className="px-2 py-2 text-right font-bold text-green-700">{ksh(e.netPay)}</td>
                        <td className="px-2 py-2 text-right"><button onClick={() => openPayslip(e.id)} className="btn-ghost text-xs"><Printer size={12}/></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {openRun.status === 'draft' && (
                <div className="flex gap-3 pt-2 border-t border-theme">
                  <button onClick={finalizeRun} disabled={finalizing} className="btn-primary flex-1 justify-center">
                    {finalizing ? <Loader2 size={14} className="animate-spin"/> : <Lock size={14}/>} Finalize &amp; Post to Expenses
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showNewLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-lg font-bold text-theme-heading">New Loan / Advance</h3>
              <button onClick={() => setShowNewLoan(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={createLoan} className="p-5 space-y-4">
              <div>
                <label className="label">Staff Member *</label>
                <select required value={loanForm.staffId} onChange={e => setLoanForm(f => ({ ...f, staffId: e.target.value }))} className="input">
                  <option value="">Select…</option>
                  {staffWithoutActiveLoan.map((s: any) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
                </select>
                <p className="text-xs text-theme-muted mt-1">Only staff without an active loan are listed — one at a time per person.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Loan Amount (KES) *</label><input required type="number" min={1} value={loanForm.principalAmount} onChange={e => setLoanForm(f => ({ ...f, principalAmount: e.target.value }))} className="input"/></div>
                <div><label className="label">Monthly Deduction (KES) *</label><input required type="number" min={1} value={loanForm.monthlyDeduction} onChange={e => setLoanForm(f => ({ ...f, monthlyDeduction: e.target.value }))} className="input"/></div>
              </div>
              <div><label className="label">Reason</label><input value={loanForm.reason} onChange={e => setLoanForm(f => ({ ...f, reason: e.target.value }))} className="input" placeholder="Optional"/></div>
              <div className="flex gap-3 pt-1 border-t border-theme">
                <button type="button" onClick={() => setShowNewLoan(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={savingLoan} className="btn-primary flex-1">
                  {savingLoan ? <Loader2 size={14} className="animate-spin"/> : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
