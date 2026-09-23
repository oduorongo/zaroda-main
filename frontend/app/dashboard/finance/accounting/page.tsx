'use client';
import { useState, useEffect } from 'react';
import { BookOpen, FileSpreadsheet, Scale, FileText, Printer, Landmark, Wrench, Loader2,
  CalendarRange, Plus, ArrowRightLeft, Download } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';
import { usePdfDownload } from '@/components/pdf/pdf-buttons';

const REPORTS = [
  { key: 'cashbook',      icon: BookOpen,         label: 'Analysed Cash Book', desc: 'Receipts and payments, split cash/bank and analysed by vote head' },
  { key: 'ledger',        icon: FileSpreadsheet,  label: 'Vote Head Ledger',   desc: 'Voted, spent and balance for each vote head' },
  { key: 'trial_balance', icon: Scale,            label: 'Trial Balance',      desc: 'Vote heads with opening and closing cash and bank' },
  { key: 'cash_flow',     icon: Landmark,         label: 'Cash Flow Statement',desc: 'Opening balance, movements, closing balance' },
  { key: 'income',        icon: FileText,         label: 'Income & Expenditure', desc: 'Receipts by vote head less expenditure' },
  { key: 'fee_statement', icon: FileText,         label: 'Fee Statements',     desc: 'Per-learner fee account' },
];

const ksh = (n: number) => 'KES ' + Number(n || 0).toLocaleString('en-KE');

export default function AccountingPage() {
  const [generating, setGenerating] = useState('');
  const [voteHeads, setVoteHeads] = useState<any[]>([]);
  const [totalReceived, setTotalReceived] = useState(0);
  const [loadingVoteHeads, setLoadingVoteHeads] = useState(true);
  const [reconciling, setReconciling] = useState(false);

  // ── Financial years & opening balances ──
  const [years, setYears] = useState<any[]>([]);
  const [yearId, setYearId] = useState('');
  const [opening, setOpening] = useState({ openingCash: '', openingBank: '' });
  const [savingOpening, setSavingOpening] = useState(false);
  const [showNewYear, setShowNewYear] = useState(false);
  const [newYear, setNewYear] = useState({ yearLabel: '', startDate: '', endDate: '' });

  const selectedYear = years.find(y => y.id === yearId);

  const loadYears = (keep?: string) => {
    apiClient.get('/finance/financial-years')
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : [];
        setYears(list);
        const pick = keep || list.find((y: any) => y.isCurrent)?.id || list[0]?.id || '';
        setYearId(pick);
        const y = list.find((x: any) => x.id === pick);
        setOpening({
          openingCash: y ? String(Number(y.openingCash || 0)) : '',
          openingBank: y ? String(Number(y.openingBank || 0)) : '',
        });
      })
      .catch(() => {/* a school with no years yet still gets the reports */});
  };
  useEffect(() => loadYears(), []);

  const saveOpening = async () => {
    if (!yearId) return;
    setSavingOpening(true);
    try {
      await apiClient.patch(`/finance/financial-years/${yearId}/opening`, {
        openingCash: Number(opening.openingCash || 0),
        openingBank: Number(opening.openingBank || 0),
      });
      toast.success('Opening balance saved');
      loadYears(yearId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not save the opening balance');
    } finally { setSavingOpening(false); }
  };

  const createYear = async () => {
    try {
      const { data } = await apiClient.post('/finance/financial-years', newYear);
      toast.success(`${newYear.yearLabel} created`);
      setShowNewYear(false);
      setNewYear({ yearLabel: '', startDate: '', endDate: '' });
      loadYears(data?.id);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not create that financial year');
    }
  };

  // ── Fee statement scope ──
  const [streams, setStreams] = useState<any[]>([]);
  const [feeFilter, setFeeFilter] = useState({ gradeLevel: '', streamId: '' });

  useEffect(() => {
    apiClient.get('/academic/streams')
      .then(r => setStreams(Array.isArray(r.data) ? r.data : (r.data?.data || [])))
      .catch(() => {/* filters just stay empty */});
  }, []);

  const grades = [...new Set(streams.map((s: any) => s.gradeLevel).filter(Boolean))].sort();

  const carryForward = async () => {
    if (!yearId) return;
    if (!confirm('Carry this year’s closing cash and bank into the next financial year as its opening balance? This replaces whatever opening figures that year currently holds.')) return;
    try {
      const { data } = await apiClient.post(`/finance/financial-years/${yearId}/carry-forward`);
      toast.success(`Carried forward into ${data.into}`);
      loadYears(yearId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not carry the balances forward');
    }
  };

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

  // The backend renders each report as printable HTML (with its own "Print / Save as PDF"
  // button), not CSV — open it in a new tab rather than downloading the markup as a
  // mislabeled .csv file (which showed raw tags and garbled encoding when opened in Excel).
  const generate = async (key: string, label: string) => {
    setGenerating(key);
    try {
      const res = await apiClient.get(`/finance/reports/${key}`, {
        responseType: 'text',
        params: {
          ...(yearId ? { yearId } : {}),
          // Only the fee statement is per-learner, so only it takes a class filter.
          ...(key === 'fee_statement' && feeFilter.gradeLevel ? { gradeLevel: feeFilter.gradeLevel } : {}),
          ...(key === 'fee_statement' && feeFilter.streamId ? { streamId: feeFilter.streamId } : {}),
        },
      });
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
    } catch (e: any) { toast.error(err(e, label, key)); }
    finally { setGenerating(''); }
  };
  // Same document as View / Print, rendered to a PDF file instead of relying on
  // the browser's print dialog — which on mobile often has no Save-as-PDF at all.
  const { downloadHtmlAsPdf, downloading } = usePdfDownload();
  const reportUrl = (key: string) => {
    const p = new URLSearchParams();
    if (yearId) p.set('yearId', yearId);
    if (key === 'fee_statement' && feeFilter.gradeLevel) p.set('gradeLevel', feeFilter.gradeLevel);
    if (key === 'fee_statement' && feeFilter.streamId) p.set('streamId', feeFilter.streamId);
    const q = p.toString();
    return `/finance/reports/${key}${q ? `?${q}` : ''}`;
  };
  const savePdf = (key: string, label: string) => downloadHtmlAsPdf(
    reportUrl(key),
    `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${selectedYear?.yearLabel || 'all'}.pdf`,
    `dl-${key}`,
    // The analysed cash book grows a column per vote head and only fits across.
    key === 'cashbook' ? 'landscape' : 'portrait',
  );

  const err = (e: any, label: string, key: string) => {
    if (e?.response?.status === 404) return `${label} report not available yet`;
    // The backend now returns a readable HTML error body on failure — surface its text
    // instead of a generic message, so the real cause is visible without checking server logs.
    const body = e?.response?.data;
    if (typeof body === 'string') {
      const text = body.replace(/<[^>]+>/g, '').trim();
      if (text) return `Could not generate ${label}: ${text}`;
    }
    return `Could not generate ${label}`;
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Accounting & Reports</h1>
          <p className="text-sm text-theme-muted">Kenyan accounting workflows — cashbook, ledger, trial balance, statements</p>
        </div>
      </div>

      {/* Financial year — the period every book below runs over, and the
          opening position it starts from. */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CalendarRange size={18} className="text-[#d4af37]"/>
            <div className="font-bold text-theme-heading">Financial Year</div>
          </div>
          <button onClick={() => setShowNewYear(v => !v)} className="btn-ghost text-xs">
            <Plus size={13}/> New year
          </button>
        </div>

        {years.length === 0 ? (
          <p className="text-sm text-theme-muted">
            No financial year set up yet — the books below cover every transaction recorded.
            Create one to run them over a period and carry balances forward.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label">Year</label>
              <select value={yearId} className="input"
                onChange={e => {
                  const id = e.target.value; setYearId(id);
                  const y = years.find(x => x.id === id);
                  setOpening({
                    openingCash: y ? String(Number(y.openingCash || 0)) : '',
                    openingBank: y ? String(Number(y.openingBank || 0)) : '',
                  });
                }}>
                {years.map(y => (
                  <option key={y.id} value={y.id}>
                    {y.yearLabel}{y.isCurrent ? ' (current)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Opening cash in hand</label>
              <input type="number" min={0} step="0.01" className="input" value={opening.openingCash}
                onChange={e => setOpening(o => ({ ...o, openingCash: e.target.value }))}/>
            </div>
            <div>
              <label className="label">Opening cash at bank</label>
              <input type="number" min={0} step="0.01" className="input" value={opening.openingBank}
                onChange={e => setOpening(o => ({ ...o, openingBank: e.target.value }))}/>
            </div>
            <div className="flex items-end gap-2">
              <button onClick={saveOpening} disabled={savingOpening} className="btn-primary flex-1 justify-center text-xs">
                {savingOpening ? <Loader2 size={13} className="animate-spin"/> : null} Save opening
              </button>
            </div>
          </div>
        )}

        {selectedYear && (
          <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-theme-muted">
              {selectedYear.openingSource
                ? `Opening balances ${selectedYear.openingSource}.`
                : 'No opening balance recorded for this year yet.'}
            </p>
            <button onClick={carryForward} className="btn-ghost text-xs"
              title="Compute this year's closing cash and bank and set them as the next year's opening balance">
              <ArrowRightLeft size={13}/> Carry closing balances into next year
            </button>
          </div>
        )}

        {showNewYear && (
          <div className="mt-4 pt-4 border-t border-theme grid gap-3 sm:grid-cols-4">
            <div>
              <label className="label">Label</label>
              <input className="input" placeholder="2027" value={newYear.yearLabel}
                onChange={e => setNewYear(f => ({ ...f, yearLabel: e.target.value }))}/>
            </div>
            <div>
              <label className="label">Starts</label>
              <input type="date" className="input" value={newYear.startDate}
                onChange={e => setNewYear(f => ({ ...f, startDate: e.target.value }))}/>
            </div>
            <div>
              <label className="label">Ends</label>
              <input type="date" className="input" value={newYear.endDate}
                onChange={e => setNewYear(f => ({ ...f, endDate: e.target.value }))}/>
            </div>
            <div className="flex items-end">
              <button onClick={createYear} className="btn-primary w-full justify-center text-xs">Create</button>
            </div>
          </div>
        )}
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
              {r.key === 'fee_statement' && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <select className="input py-1 text-xs" value={feeFilter.gradeLevel}
                    onChange={e => setFeeFilter({ gradeLevel: e.target.value, streamId: '' })}>
                    <option value="">All grades</option>
                    {grades.map(g => (
                      <option key={g} value={g}>{String(g).replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                  <select className="input py-1 text-xs" value={feeFilter.streamId}
                    onChange={e => setFeeFilter(f => ({ ...f, streamId: e.target.value }))}>
                    <option value="">All streams</option>
                    {streams
                      .filter((s: any) => !feeFilter.gradeLevel || s.gradeLevel === feeFilter.gradeLevel)
                      .map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => generate(r.key, r.label)} disabled={generating === r.key}
                  className="btn-ghost flex-1 justify-center text-xs">
                  <Printer size={13}/> {generating === r.key ? 'Opening…' : 'View'}
                </button>
                <button onClick={() => savePdf(r.key, r.label)} disabled={downloading === `dl-${r.key}`}
                  className="btn-primary flex-1 justify-center text-xs">
                  <Download size={13}/> {downloading === `dl-${r.key}` ? 'Saving…' : 'PDF'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
