'use client';
import { useState, useEffect } from 'react';
import { Search, Plus, User, Phone, BookOpen, X, Loader2, Pencil, UserX, UserCheck, KeyRound } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, isHoi } from '@/lib/hooks/useAuth';
import { SENIOR_ELECTIVES } from '@/lib/cbc/constants';
import toast from 'react-hot-toast';

export default function LearnersPage() {
  const { user }  = useAuth();
  const [learners, setLearners] = useState<any[]>([]);
  const [search,   setSearch]   = useState('');
  const [statusTab, setStatusTab] = useState<'active'|'inactive'>('active');
  const [stream,   setStream]   = useState('');
  const [streams,  setStreams]   = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkStreamId, setBulkStreamId] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkRows, setBulkRows] = useState<{ admissionNumber: string; fullName: string; gender: string }[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [form,     setForm]     = useState({
    fullName: '', admissionNumber: '',
    dateOfBirth: '', gender: 'male', gradeLevel: '', streamId: '', electives: [] as string[],
    guardianName: '', guardianPhone: '', guardianEmail: '',
  });

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (stream) params.set('streamId', stream);
    params.set('status', statusTab);
    apiClient.get(`/academic/learners?${params}`)
      .then(r => setLearners(r.data))
      .catch(() => toast.error('Could not load learners'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    apiClient.get('/academic/streams').then(r => setStreams(r.data));
  }, []);

  useEffect(() => { load(); }, [search, stream, statusTab]);

  // ── Bulk upload from the KNEC/CBA class list ─────────────────────
  // Each row is like: "A001531118 OLIMA WILLIAM M None KIS CRE"
  // We take col 1 = admission no, the standalone M/F token = gender, and the
  // text between the admission no and the gender = full name. Other columns ignored.
  const parseBulk = (text: string) => {
    const rows: { admissionNumber: string; fullName: string; gender: string }[] = [];
    for (const lineRaw of text.split(/\r?\n/)) {
      const line = lineRaw.trim();
      if (!line) continue;
      // skip headers/footers
      if (/^(assessment|the kenya|generated on|grade\b|\d{6,8}\s)/i.test(line) && !/^[A-Z]\d{6,}/.test(line)) continue;
      const tokens = line.split(/\s+/);
      // admission/assessment no = first token (letter+digits, or all digits)
      const adm = tokens[0];
      if (!/^[A-Za-z]?\d{5,}$/.test(adm)) continue;   // not a learner row
      // find the gender token: a standalone 'M' or 'F' after the name
      let gIdx = -1;
      for (let i = 1; i < tokens.length; i++) {
        if (/^(M|F|MALE|FEMALE)$/i.test(tokens[i])) { gIdx = i; break; }
      }
      if (gIdx < 2) continue;   // need at least one name token before gender
      const fullName = tokens.slice(1, gIdx).join(' ');
      const gender = /^f/i.test(tokens[gIdx]) ? 'female' : 'male';
      rows.push({ admissionNumber: adm, fullName, gender });
    }
    setBulkRows(rows);
    if (!rows.length) toast.error('No learner rows found — paste the list text (admission no, name, gender).');
  };

  // Extract text from a dropped/selected KNEC PDF using pdf.js (loaded on demand),
  // then run it through the same parser as pasted text.
  const [bulkParsing, setBulkParsing] = useState(false);
  const loadPdfJs = (): Promise<any> => new Promise((resolve, reject) => {
    const w = window as any;
    if (w.pdfjsLib) return resolve(w.pdfjsLib);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      const lib = (window as any).pdfjsLib;
      try { lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; } catch {}
      resolve(lib);
    };
    s.onerror = () => reject(new Error('Could not load the PDF reader'));
    document.body.appendChild(s);
  });

  const handlePdfFile = async (file: File) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) { toast.error('Please drop a PDF file (or paste the text instead)'); return; }
    setBulkParsing(true);
    try {
      const pdfjsLib = await loadPdfJs();
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let text = '';
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        // Group text items into lines by their vertical position.
        const lines: Record<number, { x: number; str: string }[]> = {};
        for (const it of content.items as any[]) {
          const y = Math.round(it.transform[5]);
          (lines[y] = lines[y] || []).push({ x: it.transform[4], str: it.str });
        }
        Object.keys(lines).map(Number).sort((a, b) => b - a).forEach(y => {
          const row = lines[y].sort((a, b) => a.x - b.x).map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
          if (row) text += row + '\n';
        });
      }
      setBulkText(text);
      parseBulk(text);
    } catch (err: any) {
      toast.error(err?.message || 'Could not read the PDF — try pasting the text instead');
    } finally { setBulkParsing(false); }
  };

  const submitBulk = async () => {
    if (!bulkStreamId) { toast.error('Choose the stream to upload into'); return; }
    if (!bulkRows.length) { toast.error('Nothing to upload — parse the list first'); return; }
    setBulkSaving(true);
    try {
      const learners = bulkRows.map(r => {
        const parts = r.fullName.trim().split(/\s+/);
        const firstName = parts.shift() || r.fullName;
        const lastName  = parts.join(' ') || firstName;
        return { firstName, lastName, gender: r.gender, admissionNumber: r.admissionNumber };
      });
      const res = await apiClient.post('/academic/learners/bulk', {
        streamId: bulkStreamId, academicYear: '2025/2026', learners,
      });
      toast.success(res.data?.summary || `${res.data?.registered || 0} learners uploaded`);
      setShowBulk(false); setBulkText(''); setBulkRows([]); setBulkStreamId('');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Bulk upload failed');
    } finally { setBulkSaving(false); }
  };


  const [editLearner, setEditLearner] = useState<any>(null);

  // Parent access dialog
  const [parentFor, setParentFor]   = useState<any>(null);  // learner
  const [parentInfo, setParentInfo] = useState<any>(null);  // status from server
  const [parentEmail, setParentEmail] = useState('');
  const [parentName, setParentName]   = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentCreds, setParentCreds] = useState<any>(null); // one-time {email,password}
  const [parentBusy, setParentBusy]   = useState(false);

  const openParent = async (l: any) => {
    setParentFor(l); setParentInfo(null); setParentCreds(null);
    setParentEmail(''); setParentName(''); setParentPhone('');
    try {
      const r = await apiClient.get(`/academic/learners/${l.id}/parent-access`);
      setParentInfo(r.data);
      setParentEmail(r.data?.guardianEmail || '');
      setParentName(r.data?.guardianName || '');
      setParentPhone(r.data?.guardianPhone || '');
    } catch { setParentInfo({ hasAccount: false }); }
  };

  const submitParent = async () => {
    if (!parentEmail.trim()) { toast.error('Enter a parent email'); return; }
    setParentBusy(true);
    try {
      const r = await apiClient.post(`/academic/learners/${parentFor.id}/parent-access`, {
        guardianEmail: parentEmail.trim(), guardianName: parentName.trim(), guardianPhone: parentPhone.trim(),
      });
      setParentCreds(r.data?.credentials);
      toast.success(r.data?.message || 'Parent access updated');
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not update parent access'); }
    finally { setParentBusy(false); }
  };
  const openEdit = (l:any) => setEditLearner({
    id: l.id, fullName: l.fullName || `${l.firstName||''} ${l.lastName||''}`.trim(),
    admissionNumber: l.admissionNumber || '', guardianPhone: l.guardianPhone || '',
    guardianName: l.guardianName || '', streamId: l.streamId || l.stream?.id || '',
    gradeLevel: l.gradeLevel || l.stream?.gradeLevel || '',
    electives: Array.isArray(l.electives) ? l.electives : [],
  });
  const saveEdit = async () => {
    try {
      await apiClient.patch(`/academic/learners/${editLearner.id}`, editLearner);
      toast.success('Learner updated'); setEditLearner(null); load();
    } catch (e:any) { toast.error(e?.response?.data?.message || 'Could not update'); }
  };
  const toggleActive = async (l:any) => {
    const deactivating = l.isActive !== false;
    if (deactivating) {
      const name = `${l.firstName||''} ${l.lastName||''}`.trim();
      if (!confirm(`Deactivate ${name}?\n\nThey will be moved to the Inactive list and hidden from class registers, mark lists and reports. You can reactivate them anytime.`)) return;
    }
    try {
      await apiClient.patch(`/academic/learners/${l.id}/active`, { active: l.isActive === false });
      toast.success(l.isActive === false ? 'Learner reactivated' : 'Learner deactivated'); load();
    } catch (e:any) { toast.error(e?.response?.data?.message || 'Could not update'); }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parts = (form.fullName || '').trim().split(/\s+/);
    if (parts.length < 2) { toast.error('Enter the learner\'s full name (first and last)'); return; }
    const firstName = parts.shift() as string;
    const lastName  = parts.join(' ');
    setSaving(true);
    try {
      await apiClient.post('/academic/learners', { ...form, firstName, lastName });
      toast.success('Learner registered!');
      setShowForm(false);
      setForm({ fullName:'',admissionNumber:'',dateOfBirth:'',gender:'male',gradeLevel:'',streamId:'',electives:[],guardianName:'',guardianPhone:'',guardianEmail:'' });
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Registration failed');
    } finally { setSaving(false); }
  };

  const GRADE_LEVELS = ['pp1','pp2','grade_1','grade_2','grade_3','grade_4','grade_5','grade_6','grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'];

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Learners</h1>
          <p className="text-sm text-theme-muted">{learners.length} learner{learners.length !== 1 ? 's' : ''} registered</p>
        </div>
        {isHoi(user?.role || '') && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowBulk(true)} className="btn-ghost">
              <Plus size={16}/> Bulk Upload (CBA List)
            </button>
            <button onClick={() => setShowForm(true)} className="btn-primary">
              <Plus size={16}/> Add Learner
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 flex gap-3 flex-wrap items-end">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or admission number…"
            className="input pl-8"/>
        </div>
        <div className="w-48">
          <select value={stream} onChange={e => setStream(e.target.value)} className="input">
            <option value="">All streams</option>
            {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {/* Active / Inactive tabs */}
      <div className="flex gap-1 mb-2">
        {([['active','Active'],['inactive','Inactive']] as const).map(([v,label]) => (
          <button key={v} onClick={() => setStatusTab(v)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              statusTab===v ? 'bg-[#1a2e5a] text-white' : 'bg-surface-2 text-theme-muted hover:text-theme-heading'}`}>
            {label}{v==='inactive' ? ' learners' : ''}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-16 shimmer rounded-xl"/>)}</div>
      ) : learners.length === 0 ? (
        <div className="card p-12 text-center">
          <User size={40} className="mx-auto text-[#e2e6f0] mb-3"/>
          <p className="text-theme-muted font-medium">
            {statusTab==='inactive' ? 'No inactive learners' : 'No learners found'}
          </p>
          {statusTab==='active' && isHoi(user?.role || '') && (
            <button onClick={() => setShowForm(true)} className="btn-primary mt-4">
              <Plus size={16}/> Register First Learner
            </button>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="table-header">
                <th className="px-4 py-3 text-left text-xs">Learner</th>
                <th className="px-4 py-3 text-left text-xs hidden sm:table-cell">Adm No.</th>
                <th className="px-4 py-3 text-left text-xs hidden md:table-cell">Stream</th>
                <th className="px-4 py-3 text-left text-xs hidden lg:table-cell">Guardian</th>
                <th className="px-4 py-3 text-left text-xs hidden lg:table-cell">Phone</th>
                <th className="px-4 py-3 text-right text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {learners.map((l: any, i: number) => (
                <tr key={l.id} className={`border-b border-theme hover:bg-[#f9fafb] transition-colors ${i%2===0?'bg-surface':'bg-surface-2'}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-[#1a2e5a] flex items-center justify-center text-[#d4af37] font-bold text-xs flex-shrink-0">
                        {l.firstName?.[0]}{l.lastName?.[0]}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-theme-heading">
                          {l.fullName || `${l.firstName} ${l.lastName}`}
                          {l.isActive === false && <span className="ml-2 text-[10px] bg-surface-2 text-amber-600 rounded px-1.5 py-0.5">Inactive</span>}
                        </div>
                        <div className="text-xs text-theme-muted sm:hidden">{l.admissionNumber}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-theme-muted hidden sm:table-cell">{l.admissionNumber}</td>
                  <td className="px-4 py-3 text-sm text-theme-muted hidden md:table-cell">{l.stream?.name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-theme-muted hidden lg:table-cell">{l.guardianName || '—'}</td>
                  <td className="px-4 py-3 text-sm text-theme-muted hidden lg:table-cell">{l.guardianPhone || '—'}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {statusTab === 'inactive' ? (
                      <button onClick={() => toggleActive(l)} className="btn-primary text-xs py-1 px-3">
                        <UserCheck size={13}/> Reactivate
                      </button>
                    ) : (
                      <>
                        <button onClick={() => openEdit(l)} title="Edit" className="text-theme-muted hover:text-[#2563eb] p-1"><Pencil size={14}/></button>
                        <button onClick={() => openParent(l)} title="Parent access" className="text-theme-muted hover:text-[#16a34a] p-1 ml-1"><KeyRound size={14}/></button>
                        <button onClick={() => toggleActive(l)} title="Deactivate"
                          className="text-theme-muted hover:text-amber-600 p-1 ml-1"><UserX size={14}/></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Learner Modal */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowBulk(false)}>
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold text-theme-heading">Bulk Upload Learners (CBA / KNEC List)</h2>
              <button onClick={() => setShowBulk(false)}><X size={20}/></button>
            </div>
            <p className="text-xs text-theme-muted mb-4">Paste the rows from your KNEC/CBA class list. We use only <b>admission no.</b>, <b>full name</b> and <b>gender</b> — other columns are ignored.</p>

            <label className="label">Upload into stream *</label>
            <select value={bulkStreamId} onChange={e => setBulkStreamId(e.target.value)} className="input mb-3">
              <option value="">Select stream…</option>
              {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            <label className="label">Upload the KNEC/CBA PDF</label>
            <div
              onDragOver={e => { e.preventDefault(); }}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handlePdfFile(f); }}
              className="border-2 border-dashed rounded-lg p-5 text-center mb-2 cursor-pointer hover:bg-surface-2"
              style={{ borderColor: 'var(--border)' }}
              onClick={() => document.getElementById('bulk-pdf-input')?.click()}
            >
              {bulkParsing
                ? <span className="text-sm text-theme-muted inline-flex items-center gap-2"><Loader2 className="animate-spin" size={16}/> Reading PDF…</span>
                : <span className="text-sm text-theme-muted">Drop the class list PDF here, or click to choose a file</span>}
              <input id="bulk-pdf-input" type="file" accept="application/pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfFile(f); }}/>
            </div>
            <div className="text-center text-xs text-theme-muted mb-2">— or —</div>

            <label className="label">Paste class list</label>
            <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={8}
              className="input font-mono text-xs" placeholder="A001531118 OLIMA WILLIAM M None KIS CRE&#10;A001793892 MOGAN M None KIS CRE&#10;…"/>
            <div className="flex items-center gap-2 mt-2">
              <button type="button" onClick={() => parseBulk(bulkText)} className="btn-ghost text-sm">Preview rows</button>
              {bulkRows.length > 0 && <span className="text-xs text-theme-muted">{bulkRows.length} learners found</span>}
            </div>

            {bulkRows.length > 0 && (
              <div className="mt-3 border rounded max-h-56 overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
                <table className="w-full text-xs">
                  <thead><tr className="bg-surface-2 text-theme-muted">
                    <th className="text-left p-2">#</th><th className="text-left p-2">Adm No</th>
                    <th className="text-left p-2">Full Name</th><th className="text-left p-2">Gender</th>
                  </tr></thead>
                  <tbody>
                    {bulkRows.map((r, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: 'var(--border)' }}>
                        <td className="p-2">{i+1}</td><td className="p-2 font-mono">{r.admissionNumber}</td>
                        <td className="p-2">{r.fullName}</td><td className="p-2 capitalize">{r.gender}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowBulk(false)} className="btn-ghost">Cancel</button>
              <button onClick={submitBulk} disabled={bulkSaving || !bulkRows.length || !bulkStreamId} className="btn-primary">
                {bulkSaving ? <Loader2 className="animate-spin" size={16}/> : `Upload ${bulkRows.length || ''} Learners`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-theme">
              <h3 className="text-lg font-bold text-theme-heading">Register Learner</h3>
              <button onClick={() => setShowForm(false)} className="text-theme-muted hover:text-theme-heading"><X size={20}/></button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-4">
              <div>
                <label className="label">Full Name *</label>
                <input required value={form.fullName} onChange={set('fullName')} className="input" placeholder="John Kamau"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Admission No. *</label><input required value={form.admissionNumber} onChange={set('admissionNumber')} className="input" placeholder="2025001"/></div>
                <div><label className="label">Date of Birth</label><input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} className="input"/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Gender *</label>
                  <select required value={form.gender} onChange={set('gender')} className="input">
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="label">Stream *</label>
                  <select required value={form.streamId} onChange={e => {
                    const s = streams.find(x => x.id === e.target.value);
                    setForm(f => ({ ...f, streamId: e.target.value, gradeLevel: s?.gradeLevel || f.gradeLevel }));
                  }} className="input">
                    <option value="">Select stream…</option>
                    {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              {['grade_10','grade_11','grade_12'].includes(form.gradeLevel) && (
                <div className="border-t border-theme pt-4">
                  <p className="text-xs font-bold text-theme-muted uppercase tracking-wide mb-1">Senior School Learning Areas</p>
                  <p className="text-xs text-theme-muted mb-2">Core: English, Kiswahili, Core Mathematics, Community Service Learning. Choose <b>3–4 electives</b>.</p>
                  <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto p-1 rounded border" style={{ borderColor: 'var(--border)' }}>
                    {SENIOR_ELECTIVES.map(opt => {
                      const checked = (form.electives || []).includes(opt);
                      return (
                        <label key={opt} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                          <input type="checkbox" checked={checked} onChange={() => {
                            setForm(f => {
                              const cur = f.electives || [];
                              if (cur.includes(opt)) return { ...f, electives: cur.filter(x => x !== opt) };
                              if (cur.length >= 4) { toast.error('Maximum 4 electives'); return f; }
                              return { ...f, electives: [...cur, opt] };
                            });
                          }}/>
                          <span>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-theme-muted mt-1">{(form.electives || []).length} selected</p>
                </div>
              )}
              <div className="border-t border-theme pt-4">
                <p className="text-xs font-bold text-theme-muted uppercase tracking-wide mb-3">Guardian / Parent</p>
                <div className="space-y-3">
                  <div><label className="label">Guardian Name</label><input value={form.guardianName} onChange={set('guardianName')} className="input" placeholder="James Kamau"/></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="label">Guardian Phone</label><input type="tel" value={form.guardianPhone} onChange={set('guardianPhone')} className="input" placeholder="+254 7XX XXX XXX"/></div>
                    <div><label className="label">Guardian Email</label><input type="email" value={form.guardianEmail} onChange={set('guardianEmail')} className="input" placeholder="guardian@email.com"/></div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? <><Loader2 size={14} className="animate-spin"/> Saving…</> : 'Register Learner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editLearner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-bold text-theme-heading">Edit Learner</h3>
              <button onClick={()=>setEditLearner(null)}><X size={20} className="text-theme-muted"/></button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className="label">Full Name</label><input value={editLearner.fullName} onChange={e=>setEditLearner({...editLearner, fullName:e.target.value})} className="input"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Admission No.</label><input value={editLearner.admissionNumber} onChange={e=>setEditLearner({...editLearner, admissionNumber:e.target.value})} className="input"/></div>
                <div>
                  <label className="label">Class / Stream</label>
                  <select
                    value={editLearner.streamId}
                    onChange={e=>{
                      const s = streams.find((x:any)=>x.id===e.target.value);
                      setEditLearner({...editLearner, streamId:e.target.value, gradeLevel: s?.gradeLevel || editLearner.gradeLevel});
                    }}
                    className="input"
                  >
                    <option value="">Select stream…</option>
                    {streams.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              {['grade_10','grade_11','grade_12'].includes(editLearner.gradeLevel) && (
                <div className="border-t border-theme pt-3">
                  <p className="text-xs font-bold text-theme-muted uppercase tracking-wide mb-1">Senior School Electives</p>
                  <p className="text-xs text-theme-muted mb-2">Core areas are automatic. Choose 3–4 electives.</p>
                  <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto p-1 rounded border" style={{ borderColor: 'var(--border)' }}>
                    {SENIOR_ELECTIVES.map(opt => {
                      const cur = editLearner.electives || [];
                      const checked = cur.includes(opt);
                      return (
                        <label key={opt} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                          <input type="checkbox" checked={checked} onChange={() => {
                            if (checked) setEditLearner({ ...editLearner, electives: cur.filter((x:string)=>x!==opt) });
                            else if (cur.length >= 4) toast.error('Maximum 4 electives');
                            else setEditLearner({ ...editLearner, electives: [...cur, opt] });
                          }}/>
                          <span>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-theme-muted mt-1">{(editLearner.electives || []).length} selected</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Guardian Phone</label><input value={editLearner.guardianPhone} onChange={e=>setEditLearner({...editLearner, guardianPhone:e.target.value})} className="input"/></div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={()=>setEditLearner(null)} className="btn-ghost flex-1">Cancel</button>
                <button onClick={saveEdit} className="btn-primary flex-1">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {parentFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setParentFor(null)}>
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md" onClick={e => e.stopPropagation()} style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-[#16a34a]"/>
                <h3 className="font-bold text-theme-heading">Parent access</h3>
              </div>
              <button onClick={() => setParentFor(null)} className="text-theme-muted"><X size={20}/></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-theme-muted">
                {parentInfo?.hasAccount
                  ? `A parent login already exists for ${parentFor.firstName}. You can reset it below to get fresh credentials.`
                  : `Give ${parentFor.firstName}'s parent a login so they can see attendance, marks and fees.`}
              </p>

              {parentCreds ? (
                <div className="rounded-xl bg-green-50 border border-green-200 p-4 space-y-2">
                  <p className="text-sm font-semibold text-green-800">Share these with the parent:</p>
                  <div className="text-sm"><b>Login email:</b> {parentCreds.email}</div>
                  <div className="text-sm"><b>Password:</b> <span className="font-mono">{parentCreds.password}</span></div>
                  <p className="text-[11px] text-green-700">They'll be asked to change the password on first login. This password is shown only once.</p>
                  <button onClick={() => { navigator.clipboard?.writeText(`Email: ${parentCreds.email}\nPassword: ${parentCreds.password}`); toast.success('Copied'); }}
                    className="btn-ghost text-xs">Copy credentials</button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="label">Parent email <span className="text-red-500">*</span></label>
                    <input value={parentEmail} onChange={e => setParentEmail(e.target.value)} className="input w-full" placeholder="parent@example.com"/>
                  </div>
                  <div>
                    <label className="label">Parent name</label>
                    <input value={parentName} onChange={e => setParentName(e.target.value)} className="input w-full" placeholder="Full name"/>
                  </div>
                  <div>
                    <label className="label">Parent phone</label>
                    <input value={parentPhone} onChange={e => setParentPhone(e.target.value)} className="input w-full" placeholder="07XXXXXXXX"/>
                  </div>
                  <button onClick={submitParent} disabled={parentBusy} className="btn-primary w-full justify-center">
                    {parentBusy ? <Loader2 className="animate-spin" size={16}/> : <KeyRound size={16}/>}
                    {parentInfo?.hasAccount ? 'Reset parent password' : 'Create parent login'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
