'use client';
import { useState, useEffect } from 'react';
import { Search, Book, RotateCcw, CheckCircle, Clock, Plus, X, Loader2, Scan } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

export default function LibraryPage() {
  const [tab,    setTab]   = useState<'catalogue'|'loans'|'late'>('catalogue');
  const [books,  setBooks] = useState<any[]>([]);
  const [loans,  setLoans] = useState<any[]>([]);
  const [late,   setLate]  = useState<any[]>([]);
  const [search, setSearch]= useState('');
  const [loading,setLoading]=useState(true);
  const [showIssue, setShowIssue] = useState(false);
  const [issueForm, setIssueForm] = useState({ barcodeOrAccession: '', borrowerQuery: '' });
  const [bookFound, setBookFound] = useState<any>(null);
  const [saving,    setSaving]    = useState(false);

  const loadTab = () => {
    setLoading(true);
    const ep = tab === 'catalogue' ? `/library/books?search=${search}` : tab === 'loans' ? '/library/loans?status=active' : '/library/loans?status=overdue';
    apiClient.get(ep)
      .then(r => {
        if (tab === 'catalogue') setBooks(r.data);
        else if (tab === 'loans') setLoans(r.data);
        else setLate(r.data);
      })
      .catch(() => toast.error('Could not load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadTab(); }, [tab, search]);

  const lookupBook = async () => {
    if (!issueForm.barcodeOrAccession) return;
    try {
      const { data } = await apiClient.get(`/library/books/lookup?q=${issueForm.barcodeOrAccession}`);
      setBookFound(data);
    } catch { toast.error('Book not found'); setBookFound(null); }
  };

  const issueBook = async () => {
    if (!bookFound || !issueForm.borrowerQuery) return;
    setSaving(true);
    try {
      await apiClient.post('/library/loans', {
        bookId:        bookFound.id,
        borrowerQuery: issueForm.borrowerQuery,
      });
      toast.success(`"${bookFound.title}" issued!`);
      setShowIssue(false);
      setIssueForm({ barcodeOrAccession:'', borrowerQuery:'' });
      setBookFound(null);
      loadTab();
    } catch { toast.error('Issue failed'); }
    finally { setSaving(false); }
  };

  const returnBook = async (loanId: string) => {
    try {
      await apiClient.patch(`/library/loans/${loanId}/return`);
      toast.success('Book returned!');
      loadTab();
    } catch { toast.error('Return failed'); }
  };

  const sendReminder = async (loanId: string) => {
    try {
      await apiClient.post(`/library/loans/${loanId}/remind`);
      toast.success('Reminder sent. No fine charged.');
    } catch { toast.error('Could not send reminder'); }
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Library</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-sm text-theme-muted">Book catalogue · Issue & return · Late reminders</p>
            <span className="text-[10px] font-black bg-green-100 text-green-700 px-2 py-0.5 rounded-full">100% FREE</span>
          </div>
        </div>
        <button onClick={() => setShowIssue(true)} className="btn-primary">
          <CheckCircle size={16}/> Issue Book
        </button>
      </div>

      {/* No fines notice */}
      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-start gap-2">
        <CheckCircle size={15} className="text-green-600 mt-0.5 flex-shrink-0"/>
        <p className="text-sm text-green-800">
          <strong>No fines.</strong> ZARODA Library charges KES 0 for late returns. Overdue books generate reminders only — never charges.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-theme gap-1">
        {[{k:'catalogue',l:'📚 Catalogue'},{k:'loans',l:'📤 Active Loans'},{k:'late',l:'⏰ Overdue'}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${tab===t.k?'border-[#1a2e5a] text-theme-heading':'border-transparent text-theme-muted hover:text-theme-heading'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'catalogue' && (
        <>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted"/>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by title, author, or accession number…" className="input pl-8"/>
          </div>
          {loading ? <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-14 shimmer rounded-xl"/>)}</div> : (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="table-header">
                    <th className="px-4 py-3 text-left text-xs">Book</th>
                    <th className="px-4 py-3 text-left text-xs hidden sm:table-cell">Accession No.</th>
                    <th className="px-4 py-3 text-left text-xs hidden md:table-cell">Author</th>
                    <th className="px-4 py-3 text-center text-xs">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {books.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-theme-muted">No books in catalogue</td></tr>
                  ) : books.map((b: any, i: number) => (
                    <tr key={b.id} className={`border-b border-theme ${i%2===0?'bg-surface':'bg-surface-2'}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-surface-2 border border-theme flex items-center justify-center flex-shrink-0">
                            <Book size={14} className="text-theme-muted"/>
                          </div>
                          <span className="text-sm font-semibold text-theme-heading">{b.title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-theme-muted font-mono hidden sm:table-cell">{b.accessionNumber}</td>
                      <td className="px-4 py-3 text-sm text-theme-muted hidden md:table-cell">{b.author}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`badge ${b.isAvailable ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {b.isAvailable ? 'Available' : 'Issued'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'loans' && (
        loading ? <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-14 shimmer rounded-xl"/>)}</div> : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="px-4 py-3 text-left text-xs">Book</th>
                  <th className="px-4 py-3 text-left text-xs hidden sm:table-cell">Borrower</th>
                  <th className="px-4 py-3 text-left text-xs hidden md:table-cell">Due Date</th>
                  <th className="px-4 py-3 text-center text-xs">Action</th>
                </tr>
              </thead>
              <tbody>
                {loans.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-theme-muted">No active loans</td></tr>
                ) : loans.map((l: any, i: number) => (
                  <tr key={l.id} className={`border-b border-theme ${i%2===0?'bg-surface':'bg-surface-2'}`}>
                    <td className="px-4 py-3 text-sm font-semibold text-theme-heading">{l.book?.title}</td>
                    <td className="px-4 py-3 text-sm text-theme-muted hidden sm:table-cell">{l.borrowerName}</td>
                    <td className="px-4 py-3 text-sm text-theme-muted hidden md:table-cell">
                      {l.dueDate ? new Date(l.dueDate).toLocaleDateString('en-KE') : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => returnBook(l.id)} className="text-xs bg-[#1a2e5a] text-white px-2.5 py-1.5 rounded-lg hover:bg-[#142347] font-medium">
                        <RotateCcw size={11} className="inline mr-1"/> Return
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'late' && (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <Clock size={14} className="inline mr-1"/> These books are past their due date. Send a reminder — <strong>KES 0 charged</strong>.
          </div>
          {loading ? <div className="space-y-2">{[1,2].map(i=><div key={i} className="h-14 shimmer rounded-xl"/>)}</div> : (
            <div className="space-y-3">
              {late.length === 0 ? (
                <div className="card p-8 text-center text-theme-muted">No overdue books</div>
              ) : late.map((l: any) => (
                <div key={l.id} className="card p-4 flex items-center gap-4">
                  <Clock size={16} className="text-amber-500 flex-shrink-0"/>
                  <div className="flex-1">
                    <div className="font-semibold text-theme-heading text-sm">{l.book?.title}</div>
                    <div className="text-xs text-theme-muted">{l.borrowerName} · Due: {l.dueDate ? new Date(l.dueDate).toLocaleDateString('en-KE') : '—'}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => sendReminder(l.id)} className="text-xs btn-ghost py-1.5 px-3">Send Reminder</button>
                    <button onClick={() => returnBook(l.id)}   className="text-xs btn-primary py-1.5 px-3">Return</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Issue Book Modal */}
      {showIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <h3 className="text-lg font-bold text-theme-heading">Issue Book</h3>
              <button onClick={() => setShowIssue(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Barcode or Accession Number</label>
                <div className="flex gap-2">
                  <input value={issueForm.barcodeOrAccession}
                    onChange={e => setIssueForm(f => ({...f, barcodeOrAccession: e.target.value}))}
                    placeholder="Scan barcode or type LIB-2025-0001"
                    className="input flex-1" onKeyDown={e => e.key === 'Enter' && lookupBook()}/>
                  <button onClick={lookupBook} className="btn-ghost px-3"><Scan size={16}/></button>
                </div>
              </div>
              {bookFound && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                  <p className="text-sm font-bold text-green-800">✓ {bookFound.title}</p>
                  <p className="text-xs text-green-700">{bookFound.author} · {bookFound.accessionNumber}</p>
                </div>
              )}
              <div>
                <label className="label">Borrower (name or admission number)</label>
                <input value={issueForm.borrowerQuery}
                  onChange={e => setIssueForm(f => ({...f, borrowerQuery: e.target.value}))}
                  placeholder="Search learner or teacher name…" className="input"/>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowIssue(false)} className="btn-ghost flex-1">Cancel</button>
                <button onClick={issueBook} disabled={saving || !bookFound || !issueForm.borrowerQuery} className="btn-primary flex-1">
                  {saving ? <><Loader2 size={14} className="animate-spin"/> Issuing…</> : '✓ Issue Book'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
