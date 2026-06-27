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

  const [tab, setTab] = useState<'stock'|'loans'|'overdue'|'returned'>('stock');
  const [books, setBooks] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [showReceive, setShowReceive] = useState(false);
  const [showIssue, setShowIssue]   = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [saving, setSaving] = useState(false);

  const [rcv, setRcv] = useState({ title:'', author:'', category:'Textbook', publisher:'', isbn:'', copies:'1', condition:'New' });
  const [iss, setIss] = useState<any>({ code:'', borrowerType:'learner', borrowerId:'', borrowerName:'', borrowerClass:'', loanDays:'14' });
  const [lookup, setLookup] = useState<any>(null);

  // Borrower picker (from enrolment)
  const [streams, setStreams] = useState<any[]>([]);
  const [pickStream, setPickStream] = useState('');
  const [borrowers, setBorrowers] = useState<any[]>([]);
  const [borrowerSearch, setBorrowerSearch] = useState('');

  // Settings (code scheme + who can issue)
  const [cfg, setCfg] = useState<any>({ codePrefix:'LIB', codeIncludeCategory:true, codeStart:1, classTeachersCanIssue:true, subjectTeachersCanIssue:true });

  useEffect(() => {
    apiClient.get('/academic/streams').then(r => setStreams(r.data || [])).catch(()=>{});
    apiClient.get('/library/settings').then(r => setCfg(r.data || cfg)).catch(()=>{});
  }, []);

  // Load borrowers when type/stream changes inside the issue modal.
  useEffect(() => {
    if (!showIssue) return;
    const ep = iss.borrowerType === 'teacher'
      ? '/library/borrowers?type=teacher'
      : `/library/borrowers?type=learner${pickStream?`&streamId=${pickStream}`:''}`;
    apiClient.get(ep).then(r => setBorrowers(r.data || [])).catch(()=>setBorrowers([]));
  }, [showIssue, iss.borrowerType, pickStream]);

  const loadStats = () => apiClient.get('/library/stats').then(r => setStats(r.data || {})).catch(()=>{});
  const load = () => {
    setLoading(true);
    const ep = tab === 'stock' ? `/library/books?search=${encodeURIComponent(search)}`
      : tab === 'overdue' ? '/library/loans?status=overdue'
      : tab === 'returned' ? '/library/loans?status=returned'
      : '/library/loans?status=active';
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
      await apiClient.post('/library/loans', { code: lookup.code, borrowerType: iss.borrowerType, borrowerId: iss.borrowerId || null, borrowerName: iss.borrowerName, borrowerClass: iss.borrowerClass, loanDays: Number(iss.loanDays) });
      toast.success(`"${lookup.title}" issued to ${iss.borrowerName}`);
      setShowIssue(false); setLookup(null);
      setIss({ code:'', borrowerType:'learner', borrowerId:'', borrowerName:'', borrowerClass:'', loanDays:'14' });
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
          {admin && <button onClick={()=>setShowSettings(true)} className="btn-ghost text-sm">Settings</button>}
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
        {[{k:'stock',l:'Stock'},{k:'loans',l:'Issued'},{k:'overdue',l:'Overdue'},{k:'returned',l:'Collection'}].map(t => (
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
        loans.length === 0 ? <div className="card p-10 text-center text-theme-muted">{tab==='overdue'?'Nothing overdue.':tab==='returned'?'No returns recorded yet.':'No books currently issued.'}</div> : (
          <div className="space-y-2">
            {loans.map((l:any) => (
              <div key={l.id} className="card p-4 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${l.status==='returned'?'bg-green-100':l.overdue?'bg-red-100':'bg-surface-2'}`}>
                  {l.status==='returned' ? <CheckCircle size={16} className="text-green-600"/> : l.overdue ? <AlertTriangle size={16} className="text-red-600"/> : <Book size={16} className="text-theme-muted"/>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-theme-heading text-sm truncate">{l.bookTitle} <span className="font-mono text-xs text-theme-muted">{l.bookCode}</span></div>
                  <div className="text-xs text-theme-muted">
                    {l.borrowerName}{l.borrowerClass?` · ${l.borrowerClass}`:''} · {l.borrowerType}
                    {l.status==='returned'
                      ? ` · returned ${l.returnedOn || ''}${l.returnCondition?` · ${l.returnCondition}`:''}`
                      : ` · due ${l.dueOn}${l.overdue?' (overdue)':''}`}
                  </div>
                </div>
                {l.status!=='returned' && <button onClick={()=>returnBook(l.id)} className="btn-ghost text-xs"><CheckCircle size={13}/> Return</button>}
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
                  <select value={iss.borrowerType} onChange={e=>{setIss({...iss,borrowerType:e.target.value,borrowerId:'',borrowerName:'',borrowerClass:''});setPickStream('');}} className="input"><option value="learner">Learner</option><option value="teacher">Teacher</option></select></div>
                <div><label className="label">Loan days</label><input type="number" min={1} value={iss.loanDays} onChange={e=>setIss({...iss,loanDays:e.target.value})} className="input"/></div>
              </div>

              {iss.borrowerType === 'learner' && (
                <div><label className="label">Class</label>
                  <select value={pickStream} onChange={e=>setPickStream(e.target.value)} className="input">
                    <option value="">All classes…</option>
                    {streams.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}

              <div><label className="label">Select {iss.borrowerType} *</label>
                <input value={borrowerSearch} onChange={e=>setBorrowerSearch(e.target.value)} className="input mb-1" placeholder={`Search ${iss.borrowerType} by name…`}/>
                <div className="max-h-40 overflow-y-auto border border-theme rounded-xl divide-y divide-theme/30">
                  {borrowers.filter((b:any)=>!borrowerSearch || b.name.toLowerCase().includes(borrowerSearch.toLowerCase())).length === 0 ? (
                    <div className="p-3 text-sm text-theme-muted">No {iss.borrowerType}s found</div>
                  ) : borrowers.filter((b:any)=>!borrowerSearch || b.name.toLowerCase().includes(borrowerSearch.toLowerCase())).slice(0,60).map((b:any)=>(
                    <button type="button" key={b.id} onClick={()=>setIss({...iss,borrowerId:b.id,borrowerName:b.name,borrowerClass:b.stream||b.sub||''})}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-surface-2 ${iss.borrowerId===b.id?'bg-surface-2 font-semibold':''}`}>
                      <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-[9px] ${iss.borrowerId===b.id?'bg-[#1a2e5a] text-white border-[#1a2e5a]':'border-theme'}`}>{iss.borrowerId===b.id?'✓':''}</span>
                      {b.name} <span className="text-theme-muted text-xs">{b.sub}</span>
                    </button>
                  ))}
                </div>
                {iss.borrowerName && <p className="text-[11px] text-green-600 mt-1">Selected: {iss.borrowerName}{iss.borrowerClass?` · ${iss.borrowerClass}`:''}</p>}
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={()=>{setShowIssue(false);setLookup(null);}} className="btn-ghost flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={saving || !lookup || lookup.status==='issued'} className="btn-primary flex-1 justify-center">{saving?<Loader2 size={14} className="animate-spin"/>:<ArrowLeftRight size={14}/>} Issue</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <h3 className="font-bold text-theme-heading">Library Settings</h3>
              <button onClick={()=>setShowSettings(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <h4 className="text-sm font-bold text-theme-heading mb-2">Book coding scheme</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Code prefix</label>
                    <input value={cfg.codePrefix} onChange={e=>setCfg({...cfg,codePrefix:e.target.value.toUpperCase()})} className="input font-mono" placeholder="e.g. MCS"/></div>
                  <div><label className="label">Start number</label>
                    <input type="number" min={1} value={cfg.codeStart} onChange={e=>setCfg({...cfg,codeStart:e.target.value})} className="input"/></div>
                </div>
                <label className="flex items-center gap-2 mt-2 text-sm">
                  <input type="checkbox" checked={cfg.codeIncludeCategory} onChange={e=>setCfg({...cfg,codeIncludeCategory:e.target.checked})}/>
                  Include category in the code
                </label>
                <p className="text-[11px] text-theme-muted mt-1">Preview: <span className="font-mono">{(cfg.codePrefix||'LIB')}{cfg.codeIncludeCategory?'-TEXT':''}-{String(Math.max(1,Number(cfg.codeStart)||1)).padStart(5,'0')}/1</span></p>
              </div>

              <div>
                <h4 className="text-sm font-bold text-theme-heading mb-2">Who can issue & receive returns</h4>
                <p className="text-[11px] text-theme-muted mb-2">Admins can always issue. Choose whether teachers may too.</p>
                <label className="flex items-center gap-2 text-sm py-1">
                  <input type="checkbox" checked={cfg.classTeachersCanIssue} onChange={e=>setCfg({...cfg,classTeachersCanIssue:e.target.checked})}/>
                  Class teachers can issue & receive from learners
                </label>
                <label className="flex items-center gap-2 text-sm py-1">
                  <input type="checkbox" checked={cfg.subjectTeachersCanIssue} onChange={e=>setCfg({...cfg,subjectTeachersCanIssue:e.target.checked})}/>
                  Learning area (subject) teachers can issue & receive
                </label>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={()=>setShowSettings(false)} className="btn-ghost flex-1 justify-center">Cancel</button>
                <button onClick={async()=>{ try{ await apiClient.patch('/library/settings', cfg); toast.success('Settings saved'); setShowSettings(false);}catch(err:any){toast.error(err?.response?.data?.message||'Could not save');} }} className="btn-primary flex-1 justify-center">Save settings</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
