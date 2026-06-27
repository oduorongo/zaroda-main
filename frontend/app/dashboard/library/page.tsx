'use client';

import { useState, useEffect } from 'react';
import { Search, Book, Plus, X, Loader2, Library as LibIcon, ArrowLeftRight, AlertTriangle, CheckCircle } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';
import { useAuth, isHoi } from '@/lib/hooks/useAuth';

const CATEGORIES = ['Textbook','Story Book','Reference','Revision','Set Book','Atlas/Map','Dictionary','Magazine','General'];
const CONDITIONS = ['New','Good','Fair','Poor','Damaged'];

export default function LibraryPage() {
  const { user } = useAuth();
  const admin = isHoi(user?.role || '');

  const [tab, setTab] = useState<'stock'|'loans'|'overdue'>('stock');
  const [books, setBooks] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [showReceive, setShowReceive] = useState(false);
  const [showIssue, setShowIssue]   = useState(false);
  const [saving, setSaving] = useState(false);

  const [rcv, setRcv] = useState({ title:'', author:'', category:'Textbook', publisher:'', isbn:'', copies:'1', condition:'New' });
  const [iss, setIss] = useState({ code:'', borrowerType:'learner', borrowerName:'', borrowerClass:'', loanDays:'14' });
  const [lookup, setLookup] = useState<any>(null);

  const loadStats = () => apiClient.get('/library/stats').then(r => setStats(r.data || {})).catch(()=>{});
  const load = () => {
    setLoading(true);
    const ep = tab === 'stock' ? `/library/books?search=${encodeURIComponent(search)}`
      : tab === 'overdue' ? '/library/loans?status=overdue' : '/library/loans?status=active';
    apiClient.get(ep)
      .then(r => { if (tab === 'stock') setBooks(r.data || []); else setLoans(r.data || []); })
      .catch(()=>{}).finally(()=>setLoading(false));
  };
  useEffect(() => { load(); }, [tab]);
  useEffect(() => { loadStats(); }, []);
  useEffect(() => { if (tab === 'stock') { const t = setTimeout(load, 300); return () => clearTimeout(t); } }, [search]);

  const receive = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const { data } = await apiClient.post('/library/books', { ...rcv, copies: Number(rcv.copies) });
      toast.success(`Received ${data.received} copies — coded ${data.baseCode}/1…${data.received}`);
      setShowReceive(false);
      setRcv({ title:'', author:'', category:'Textbook', publisher:'', isbn:'', copies:'1', condition:'New' });
      load(); loadStats();
    } catch (err:any) { toast.error(err?.response?.data?.message || 'Could not receive books'); }
    finally { setSaving(false); }
  };

  const doLookup = async () => {
    if (!iss.code.trim()) return;
    try {
      const { data } = await apiClient.get(`/library/books/lookup?q=${encodeURIComponent(iss.code.trim())}`);
      if (!data.found) { toast.error('No book with that code'); setLookup(null); return; }
      if (data.status === 'issued') { toast.error('That copy is already issued'); }
      setLookup(data);
    } catch { toast.error('Lookup failed'); }
  };

  const issue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookup) { toast.error('Look up a valid book code first'); return; }
    if (!iss.borrowerName.trim()) { toast.error('Enter the borrower name'); return; }
    setSaving(true);
    try {
      await apiClient.post('/library/loans', { code: lookup.code, borrowerType: iss.borrowerType, borrowerName: iss.borrowerName, borrowerClass: iss.borrowerClass, loanDays: Number(iss.loanDays) });
      toast.success(`"${lookup.title}" issued to ${iss.borrowerName}`);
      setShowIssue(false); setLookup(null);
      setIss({ code:'', borrowerType:'learner', borrowerName:'', borrowerClass:'', loanDays:'14' });
      load(); loadStats();
    } catch (err:any) { toast.error(err?.response?.data?.message || 'Could not issue'); }
    finally { setSaving(false); }
  };

  const giveCondition = () => {
    const c = prompt('Condition on return? (New / Good / Fair / Poor / Damaged)', 'Good');
    return c && CONDITIONS.includes(c) ? c : 'Good';
  };
  const returnBook = async (loanId: string) => {
    try {
      await apiClient.patch(`/library/loans/${loanId}/return`, { condition: giveCondition() });
      toast.success('Book returned'); load(); loadStats();
    } catch (err:any) { toast.error(err?.response?.data?.message || 'Could not return'); }
  };

  const STAT = [
    { label:'Titles', value: stats.titles ?? 0 },
    { label:'Total copies', value: stats.totalCopies ?? 0 },
    { label:'Available', value: stats.available ?? 0 },
    { label:'Issued', value: stats.issued ?? 0 },
    { label:'Overdue', value: stats.overdue ?? 0 },
    { label:'Damaged', value: stats.damaged ?? 0 },
  ];

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading flex items-center gap-2"><LibIcon size={22}/> School Library</h1>
          <p className="text-sm text-theme-muted">Receive, code, issue and track the school's book stock</p>
        </div>
        <div className="flex gap-2">
          <button onClick={()=>setShowIssue(true)} className="btn-ghost text-sm"><ArrowLeftRight size={14}/> Issue book</button>
          {admin && <button onClick={()=>setShowReceive(true)} className="btn-primary text-sm"><Plus size={14}/> Receive books</button>}
        </div>
      </div>

      {/* Stock summary */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {STAT.map(s => (
          <div key={s.label} className="card p-3 text-center">
            <div className="text-xl font-black text-theme-heading">{s.value}</div>
            <div className="text-[10px] text-theme-muted uppercase">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-theme">
        {[{k:'stock',l:'Stock'},{k:'loans',l:'Issued'},{k:'overdue',l:'Overdue'}].map(t => (
          <button key={t.k} onClick={()=>setTab(t.k as any)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 ${tab===t.k?'border-[#1a2e5a] text-theme-heading':'border-transparent text-theme-muted hover:text-theme-heading'}`}>{t.l}</button>
        ))}
      </div>

      {tab === 'stock' && (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search title, author or code…" className="input pl-9"/>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-theme-muted" size={22}/></div>
      ) : tab === 'stock' ? (
        books.length === 0 ? <div className="card p-10 text-center text-theme-muted">No books yet. {admin ? 'Use “Receive books” to add stock.' : 'Ask the librarian to add stock.'}</div> : (
          <div className="space-y-2">
            {books.map((b:any) => (
              <div key={b.baseCode} className="card p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#1a2e5a] flex items-center justify-center flex-shrink-0"><Book size={18} className="text-[#d4af37]"/></div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-theme-heading text-sm truncate">{b.title}</div>
                  <div className="text-xs text-theme-muted">{b.author || '—'} · {b.category} · <span className="font-mono">{b.baseCode}</span></div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-semibold text-green-600">{b.available} available</div>
                  <div className="text-theme-muted">{b.issued} out · {b.copies} total{b.damaged?` · ${b.damaged} damaged`:''}</div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        loans.length === 0 ? <div className="card p-10 text-center text-theme-muted">{tab==='overdue'?'Nothing overdue.':'No books currently issued.'}</div> : (
          <div className="space-y-2">
            {loans.map((l:any) => (
              <div key={l.id} className="card p-4 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${l.overdue?'bg-red-100':'bg-surface-2'}`}>
                  {l.overdue ? <AlertTriangle size={16} className="text-red-600"/> : <Book size={16} className="text-theme-muted"/>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-theme-heading text-sm truncate">{l.bookTitle} <span className="font-mono text-xs text-theme-muted">{l.bookCode}</span></div>
                  <div className="text-xs text-theme-muted">{l.borrowerName}{l.borrowerClass?` · ${l.borrowerClass}`:''} · {l.borrowerType} · due {l.dueOn}{l.overdue?' (overdue)':''}</div>
                </div>
                <button onClick={()=>returnBook(l.id)} className="btn-ghost text-xs"><CheckCircle size={13}/> Return</button>
              </div>
            ))}
          </div>
        )
      )}

      {/* Receive books modal */}
      {showReceive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <h3 className="font-bold text-theme-heading">Receive New Books</h3>
              <button onClick={()=>setShowReceive(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={receive} className="p-5 space-y-3 overflow-y-auto">
              <div><label className="label">Title *</label><input required value={rcv.title} onChange={e=>setRcv({...rcv,title:e.target.value})} className="input"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Author</label><input value={rcv.author} onChange={e=>setRcv({...rcv,author:e.target.value})} className="input"/></div>
                <div><label className="label">Category</label>
                  <select value={rcv.category} onChange={e=>setRcv({...rcv,category:e.target.value})} className="input">{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>
                <div><label className="label">Publisher</label><input value={rcv.publisher} onChange={e=>setRcv({...rcv,publisher:e.target.value})} className="input"/></div>
                <div><label className="label">ISBN</label><input value={rcv.isbn} onChange={e=>setRcv({...rcv,isbn:e.target.value})} className="input"/></div>
                <div><label className="label">No. of copies *</label><input required type="number" min={1} max={500} value={rcv.copies} onChange={e=>setRcv({...rcv,copies:e.target.value})} className="input"/></div>
                <div><label className="label">Condition</label>
                  <select value={rcv.condition} onChange={e=>setRcv({...rcv,condition:e.target.value})} className="input">{CONDITIONS.map(c=><option key={c}>{c}</option>)}</select></div>
              </div>
              <p className="text-[11px] text-theme-muted">Each copy is auto-coded systematically, e.g. <span className="font-mono">LIB-TEXT-00007/1</span>, /2, /3…</p>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={()=>setShowReceive(false)} className="btn-ghost flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">{saving?<Loader2 size={14} className="animate-spin"/>:<Plus size={14}/>} Receive</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Issue modal */}
      {showIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <h3 className="font-bold text-theme-heading">Issue a Book</h3>
              <button onClick={()=>{setShowIssue(false);setLookup(null);}}><X size={20} className="text-theme-muted"/></button>
            </div>
            <form onSubmit={issue} className="p-5 space-y-3 overflow-y-auto">
              <div><label className="label">Book code *</label>
                <div className="flex gap-2">
                  <input value={iss.code} onChange={e=>{setIss({...iss,code:e.target.value});setLookup(null);}} className="input font-mono" placeholder="LIB-TEXT-00007/1"/>
                  <button type="button" onClick={doLookup} className="btn-ghost px-3"><Search size={15}/></button>
                </div>
              </div>
              {lookup && (
                <div className={`rounded-xl p-3 text-sm ${lookup.status==='issued'?'bg-red-50 text-red-700':'bg-green-50 text-green-700'}`}>
                  <div className="font-semibold">{lookup.title}</div>
                  <div className="text-xs">{lookup.author||'—'} · condition {lookup.condition} · {lookup.status}</div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Borrower type</label>
                  <select value={iss.borrowerType} onChange={e=>setIss({...iss,borrowerType:e.target.value})} className="input"><option value="learner">Learner</option><option value="teacher">Teacher</option></select></div>
                <div><label className="label">Loan days</label><input type="number" min={1} value={iss.loanDays} onChange={e=>setIss({...iss,loanDays:e.target.value})} className="input"/></div>
                <div><label className="label">Borrower name *</label><input required value={iss.borrowerName} onChange={e=>setIss({...iss,borrowerName:e.target.value})} className="input"/></div>
                <div><label className="label">Class / Dept</label><input value={iss.borrowerClass} onChange={e=>setIss({...iss,borrowerClass:e.target.value})} className="input"/></div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={()=>{setShowIssue(false);setLookup(null);}} className="btn-ghost flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={saving || !lookup || lookup.status==='issued'} className="btn-primary flex-1 justify-center">{saving?<Loader2 size={14} className="animate-spin"/>:<ArrowLeftRight size={14}/>} Issue</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
