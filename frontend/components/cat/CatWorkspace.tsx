'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, Lock, Loader2, Plus, Save, Trash2, ClipboardList, Eye, Download, AlertTriangle } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { percentToLevel, levelsFor } from '@/lib/cbc/constants';
import toast from 'react-hot-toast';

const TERMS = [{ v: 'term_1', l: 'Term 1' }, { v: 'term_2', l: 'Term 2' }, { v: 'term_3', l: 'Term 3' }];
function LevelCell({ got, max, grade }: { got: number | null; max: number; grade: string }) {
  if (got === null) return <td className="p-2 text-center text-theme-muted">—</td>;
  const lv = percentToLevel(Math.round((got / max) * 100), grade);
  return <td className="p-2 text-center whitespace-nowrap"><span className="font-semibold">{got}</span> <span className="text-xs font-bold" style={{ color: lv.color }} title={lv.label}>{lv.code}</span></td>;
}

const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) return resolve();
  const el = document.createElement('script');
  el.src = src; el.onload = () => resolve(); el.onerror = () => reject(new Error('load failed'));
  document.head.appendChild(el);
});

// Fetches the server-built mark sheet and saves it as a landscape A4 PDF; falls back to the print dialog.
async function downloadSheet(path: string, filename: string) {
  const toastId = toast.loading('Preparing PDF…');
  let html = '';
  try {
    html = (await apiClient.get(path, { responseType: 'text' })).data;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    const html2canvas = (window as any).html2canvas, JsPDF = (window as any).jspdf?.jsPDF;
    if (!html2canvas || !JsPDF) throw new Error('pdf libs unavailable');
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:1100px;background:#fff';
    holder.innerHTML = html;
    document.body.appendChild(holder);
    const canvas = await html2canvas(holder, { scale: 2, backgroundColor: '#ffffff' });
    document.body.removeChild(holder);
    const pdf = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const M = 20, w = pdf.internal.pageSize.getWidth() - M * 2, usable = pdf.internal.pageSize.getHeight() - M * 2;
    const h = (canvas.height * w) / canvas.width, img = canvas.toDataURL('image/png');
    for (let off = 0; off < h; off += usable) {
      if (off) pdf.addPage();
      pdf.addImage(img, 'PNG', M, M - off, w, h);
    }
    pdf.save(filename);
    toast.success('PDF downloaded', { id: toastId });
  } catch (e) {
    toast.dismiss(toastId);
    if (!html) { err(e, 'Could not build the PDF'); return; }
    const win = window.open('', '_blank');
    if (win) { win.opener = null; win.document.write(html + '<script>window.onload=()=>window.print()</' + 'script>'); win.document.close(); }
  }
}

const err = (e: any, fallback: string) => toast.error(e?.response?.data?.message || fallback);

export function CatWorkspace() {
  const [openId, setOpenId] = useState<string | null>(null);
  return openId ? <CatDetail id={openId} onBack={() => setOpenId(null)}/> : <CatList onOpen={setOpenId}/>;
}

function CatList({ onOpen }: { onOpen: (id: string) => void }) {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [term, setTerm] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: '', assignment: '', term: 'term_1', catDate: '' });
  const [saving, setSaving] = useState(false);

  const load = () => apiClient.get('/cats', { params: { term: term || undefined } })
    .then(r => setData(r.data)).catch(e => { err(e, 'Could not load CATs'); setData({ cats: [], assignments: [] }); });
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [term]);

  const create = async () => {
    const a = data.assignments[Number(form.assignment)];
    if (!form.title.trim() || !a) { toast.error('Enter a title and pick a class & subject'); return; }
    setSaving(true);
    try {
      const r = await apiClient.post('/cats', { title: form.title, streamId: a.streamId, subject: a.subject, term: form.term, catDate: form.catDate || null });
      toast.success('CAT created — now add the questions');
      onOpen(r.data.id);
    } catch (e) { err(e, 'Could not create CAT'); } finally { setSaving(false); }
  };

  if (!data) return <div className="card p-10 text-center text-theme-muted"><Loader2 className="animate-spin mx-auto"/></div>;
  const canCreate = data.assignments.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-theme-heading">CATs</h1>
          <p className="text-sm text-theme-muted">Question-level marks for your Continuous Assessment Tests{data.readOnlyAll ? ' · other teachers’ CATs are read-only' : ''}</p>
        </div>
        <div className="flex gap-2">
          <select value={term} onChange={e => setTerm(e.target.value)} className="input">
            <option value="">All terms</option>
            {TERMS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
          {canCreate && <button onClick={() => setShowNew(s => !s)} className="btn-primary"><Plus size={16}/> New CAT</button>}
        </div>
      </div>

      {showNew && (
        <div className="card p-4 grid gap-3 sm:grid-cols-2">
          <input className="input" placeholder="Title, e.g. Fractions CAT" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}/>
          <select className="input" value={form.assignment} onChange={e => setForm({ ...form, assignment: e.target.value })}>
            <option value="">Class & subject…</option>
            {data.assignments.map((a: any, i: number) => <option key={i} value={i}>{a.streamName} — {a.subject}</option>)}
          </select>
          <select className="input" value={form.term} onChange={e => setForm({ ...form, term: e.target.value })}>
            {TERMS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
          <input type="date" className="input" value={form.catDate} onChange={e => setForm({ ...form, catDate: e.target.value })}/>
          <div className="sm:col-span-2 flex justify-end">
            <button onClick={create} disabled={saving} className="btn-primary">{saving ? <Loader2 size={16} className="animate-spin"/> : <Plus size={16}/>} Create</button>
          </div>
        </div>
      )}

      {data.cats.length === 0 ? (
        <div className="card p-10 text-center">
          <ClipboardList size={36} className="mx-auto text-[#e2e6f0] mb-2"/>
          <p className="text-theme-muted font-medium">{canCreate ? 'No CATs yet — create your first one.' : 'No CATs yet. CATs are created by the subject teacher assigned to a class.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.cats.map((c: any) => {
            const mine = String(c.teacherId) === String(user?.id);
            return (
              <div key={c.id} onClick={() => onOpen(c.id)}
                className={`card p-4 cursor-pointer hover:shadow-md border-l-4 ${mine ? 'border-l-[#d4af37]' : 'border-l-blue-500'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-theme-heading">{c.title}</span>
                  {!mine && <span className="badge bg-blue-100 text-blue-700"><Eye size={10} className="mr-1"/> {c.teacherName || 'Teacher'}</span>}
                </div>
                <p className="text-xs text-theme-muted mt-1">
                  {c.streamName} · {c.subject} · {c.term?.replace('_', ' ')}{c.catDate ? ` · ${String(c.catDate).slice(0, 10)}` : ''}
                  {' · '}{c.questionCount} questions / {c.maxTotal} marks · {c.learnersMarked} learners marked
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CatDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<any>(null);
  const [qs, setQs] = useState<any[]>([]);
  const [cells, setCells] = useState<Record<string, string>>({});
  const [orig, setOrig] = useState<Record<string, string>>({});
  const [strands, setStrands] = useState<any[]>([]);
  const [busy, setBusy] = useState('');
  const [view, setView] = useState<'marks' | 'analysis'>('marks');

  const load = async () => {
    try {
      const { data } = await apiClient.get(`/cats/${id}`);
      setD(data);
      setQs(data.questions.length ? data.questions : [{ number: 1, maxMarks: '', strand: '', subStrand: '' }]);
      const m: Record<string, string> = {};
      for (const s of data.scores) m[`${s.learnerId}:${s.questionId}`] = String(s.score);
      setCells(m); setOrig(m);
      if (data.cat.gradeLevel) apiClient.get('/assessment/book', { params: { gradeLevel: data.cat.gradeLevel, learningArea: data.cat.subject, term: data.cat.term } })
        .then(r => setStrands(r.data?.strands || [])).catch(() => {});
    } catch (e) { err(e, 'Could not open CAT'); onBack(); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const saved = d?.questions || [];
  const maxTotal = saved.reduce((a: number, q: any) => a + Number(q.maxMarks), 0);
  if (!d) return <div className="card p-10 text-center text-theme-muted"><Loader2 className="animate-spin mx-auto"/></div>;
  const { cat, learners, locked } = d;
  const edit = cat.canEdit;

  const setQ = (i: number, k: string, v: string) => setQs(list => list.map((q, j) => {
    if (j !== i) return q;
    const next = { ...q, [k]: v };
    if (k === 'strand') { next.subStrand = ''; next.substrandId = null; }
    if (k === 'subStrand') next.substrandId = strands.find(s => s.name === q.strand)?.substrands.find((ss: any) => ss.name === v)?.id || null;
    return next;
  }));
  const addQ = () => setQs(list => [...list, { number: (list[list.length - 1]?.number || 0) + 1, maxMarks: '', strand: list[list.length - 1]?.strand || '', subStrand: '' }]);

  const saveQuestions = async () => {
    setBusy('q');
    try { await apiClient.put(`/cats/${id}/questions`, { questions: qs }); toast.success('Questions saved'); await load(); }
    catch (e) { err(e, 'Could not save questions'); } finally { setBusy(''); }
  };
  const clearMarks = async () => {
    if (!confirm('Delete ALL marks entered for this CAT? This unlocks the questions for editing.')) return;
    try { await apiClient.delete(`/cats/${id}/scores`); toast.success('Marks cleared'); await load(); } catch (e) { err(e, 'Could not clear marks'); }
  };
  const deleteCat = async () => {
    if (!confirm('Delete this CAT and all its marks?')) return;
    try { await apiClient.delete(`/cats/${id}`); toast.success('CAT deleted'); onBack(); } catch (e) { err(e, 'Could not delete CAT'); }
  };
  const setCell = (learnerId: string, q: any, v: string) => {
    if (v !== '' && (isNaN(Number(v)) || Number(v) < 0)) return;
    if (v !== '' && Number(v) > q.maxMarks) { toast.error(`Q${q.number} is out of ${q.maxMarks}`); v = String(q.maxMarks); }
    setCells(c => ({ ...c, [`${learnerId}:${q.id}`]: v }));
  };
  const saveMarks = async () => {
    const changed = Object.keys({ ...orig, ...cells }).filter(k => (cells[k] ?? '') !== (orig[k] ?? ''));
    if (!changed.length) { toast('No changes to save'); return; }
    setBusy('m');
    try {
      await apiClient.put(`/cats/${id}/scores`, { scores: changed.map(k => { const [learnerId, questionId] = k.split(':'); return { learnerId, questionId, score: cells[k] ?? '' }; }) });
      toast.success('Marks saved'); await load();
    } catch (e) { err(e, 'Could not save marks'); } finally { setBusy(''); }
  };
  const strandGroups = Object.values(saved.reduce((g: Record<string, any>, q: any) => {
    const k = q.strand || 'No strand';
    (g[k] ||= { name: k, qs: [], max: 0 }).qs.push(q); g[k].max += Number(q.maxMarks);
    return g;
  }, {})) as { name: string; qs: any[]; max: number }[];
  const sumFor = (lid: string, list: any[]) => {
    const vals = list.map((q: any) => cells[`${lid}:${q.id}`]).filter((v: any) => v !== undefined && v !== '');
    return vals.length ? vals.reduce((a: number, v: string) => a + Number(v), 0) : null;
  };
  const total = (lid: string) => sumFor(lid, saved);
  const strandOpts = strands.map(s => s.name);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <button onClick={onBack} className="text-sm text-theme-muted flex items-center gap-1 mb-1"><ArrowLeft size={14}/> All CATs</button>
          <h1 className="text-xl font-bold text-theme-heading">{cat.title}</h1>
          <p className="text-sm text-theme-muted">{cat.streamName} · {cat.subject} · {cat.term?.replace('_', ' ')}{cat.catDate ? ` · ${String(cat.catDate).slice(0, 10)}` : ''}{!edit && ` · by ${cat.teacherName}`}</p>
        </div>
        {edit ? <button onClick={deleteCat} className="btn-ghost text-red-600"><Trash2 size={14}/> Delete</button>
              : <span className="badge bg-blue-100 text-blue-700"><Eye size={12} className="mr-1"/> Read-only</span>}
      </div>

      <div className="flex gap-1 border-b border-theme">
        {([['marks', 'Questions & marks'], ['analysis', 'Item analysis']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setView(k)} className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${view === k ? 'border-[#d4af37] text-theme-heading' : 'border-transparent text-theme-muted'}`}>{label}</button>
        ))}
      </div>
      {view === 'marks' ? (<>
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-semibold text-theme-heading">Questions <span className="text-theme-muted font-normal text-sm">· out of {maxTotal}</span></h2>
          {locked && edit && <button onClick={clearMarks} className="text-xs text-red-600 underline">Clear marks to unlock</button>}
        </div>
        {locked && edit && (
          <p className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded flex items-center gap-2">
            <Lock size={12}/> Marks have been entered, so question numbers and max marks are locked. You can still change strands.
          </p>
        )}
        <datalist id="cat-strands">{strandOpts.map(s => <option key={s} value={s}/>)}</datalist>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-theme-muted text-xs"><th className="p-1 w-16">Q#</th><th className="p-1 w-24">Max</th><th className="p-1">Strand</th><th className="p-1">Sub-strand</th>{edit && !locked && <th/>}</tr></thead>
            <tbody>
              {qs.map((q, i) => (
                <tr key={i}>
                  <td className="p-1"><input className="input w-16" type="number" min={1} disabled={!edit || locked} value={q.number} onChange={e => setQ(i, 'number', e.target.value)}/></td>
                  <td className="p-1"><input className="input w-24" type="number" min={0} step="0.5" disabled={!edit || locked} value={q.maxMarks} onChange={e => setQ(i, 'maxMarks', e.target.value)}/></td>
                  <td className="p-1"><input className="input w-full min-w-[140px]" list="cat-strands" disabled={!edit} value={q.strand || ''} onChange={e => setQ(i, 'strand', e.target.value)}/></td>
                  <td className="p-1">
                    <input className="input w-full min-w-[140px]" list={`cat-sub-${i}`} disabled={!edit} value={q.subStrand || ''} onChange={e => setQ(i, 'subStrand', e.target.value)}/>
                    <datalist id={`cat-sub-${i}`}>{(strands.find(s => s.name === q.strand)?.substrands || []).map((ss: any) => <option key={ss.id} value={ss.name}/>)}</datalist>
                  </td>
                  {edit && !locked && <td className="p-1"><button onClick={() => setQs(list => list.filter((_, j) => j !== i))} className="text-red-500"><Trash2 size={14}/></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {edit && (
          <div className="flex gap-2 justify-end">
            {!locked && <button onClick={addQ} className="btn-ghost"><Plus size={14}/> Question</button>}
            <button onClick={saveQuestions} disabled={busy === 'q'} className="btn-primary">{busy === 'q' ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Save questions</button>
          </div>
        )}
      </div>

      {saved.length > 0 && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-theme-heading">Marks <span className="text-theme-muted font-normal text-sm">· {learners.length} learners</span></h2>
            <div className="flex gap-2">
              <button onClick={() => downloadSheet(`/cats/${id}/sheet`, `${cat.title}-${cat.streamName}-${cat.subject}.pdf`.replace(/[^\w.-]+/g, '_'))} className="btn-ghost"><Download size={16}/> Download PDF</button>
              {edit && <button onClick={saveMarks} disabled={busy === 'm'} className="btn-primary">{busy === 'm' ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Save marks</button>}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse">
              <thead>
                <tr className="text-xs text-theme-muted">
                  <th className="p-2 text-left sticky left-0 bg-surface">Learner</th>
                  {saved.map((q: any) => <th key={q.id} className="p-1 text-center" title={[q.strand, q.subStrand].filter(Boolean).join(' › ')}>Q{q.number}<div className="font-normal">/{q.maxMarks}</div></th>)}
                  {strandGroups.map(g => <th key={g.name} className="p-2 text-center bg-amber-50/60 max-w-[110px]" title={g.name}><div className="truncate">{g.name}</div><div className="font-normal">/{g.max}</div></th>)}
                  <th className="p-2 text-center">Total<div className="font-normal">/{maxTotal}</div></th>
                </tr>
              </thead>
              <tbody>
                {learners.map((l: any) => {
                  const t = total(l.id);
                  return (
                    <tr key={l.id} className="border-t border-theme">
                      <td className="p-2 sticky left-0 bg-surface whitespace-nowrap">{l.firstName} {l.lastName}<div className="text-[10px] text-theme-muted">{l.admissionNumber}</div></td>
                      {saved.map((q: any) => (
                        <td key={q.id} className="p-1">
                          <input className="input w-14 text-center px-1" inputMode="decimal" disabled={!edit}
                            value={cells[`${l.id}:${q.id}`] ?? ''} onChange={e => setCell(l.id, q, e.target.value)}/>
                        </td>
                      ))}
                      {strandGroups.map(g => <LevelCell key={g.name} got={sumFor(l.id, g.qs)} max={g.max} grade={cat.gradeLevel}/>)}
                      <LevelCell got={t} max={maxTotal} grade={cat.gradeLevel}/>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>) : <ItemAnalysis id={id} grade={cat.gradeLevel} filename={`${cat.title}-${cat.streamName}-${cat.subject}-item-analysis.pdf`.replace(/[^\w.-]+/g, '_')}/>}
    </div>
  );
}

function Lv({ code, grade }: { code: string | null; grade: string }) {
  if (!code) return null;
  return <span className="text-xs font-bold" style={{ color: levelsFor(grade).find(l => l.code === code)?.color }}>{code}</span>;
}

function LevelCounts({ codes, counts, grade }: { codes: string[]; counts: Record<string, number>; grade: string }) {
  return (
    <div className="flex flex-wrap gap-1">
      {codes.map(k => <span key={k} className="text-[11px] px-1.5 py-0.5 rounded border border-theme whitespace-nowrap"><Lv code={k} grade={grade}/> {counts[k] || 0}</span>)}
    </div>
  );
}

function ItemAnalysis({ id, grade, filename }: { id: string; grade: string; filename: string }) {
  const [a, setA] = useState<any>(null);
  useEffect(() => {
    apiClient.get(`/cats/${id}/analysis`).then(r => setA(r.data)).catch(e => { err(e, 'Could not load item analysis'); setA({ sat: 0 }); });
  }, [id]);
  if (!a) return <div className="card p-10 text-center text-theme-muted"><Loader2 className="animate-spin mx-auto"/></div>;
  if (!a.sat) return <div className="card p-10 text-center text-theme-muted">No marks entered yet — item analysis appears once learners have marks.</div>;

  const flagged = a.questions.filter((q: any) => q.flagged);
  const th = 'p-2 text-xs text-theme-muted font-semibold';

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => downloadSheet(`/cats/${id}/analysis/sheet`, filename)} className="btn-ghost"><Download size={16}/> Download PDF</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[['Learners sat', `${a.sat} / ${a.enrolled}`], ['Class average', `${a.classAvg} / ${a.maxTotal}`], ['Class average %', <>{a.classAvgPct}% <Lv code={a.classLevel} grade={grade}/></>], ['Flagged questions', flagged.length]].map(([k, v]: any) => (
          <div key={k} className="card p-3"><div className="text-xs text-theme-muted">{k}</div><div className={`text-lg font-bold ${k === 'Flagged questions' && v ? 'text-red-600' : 'text-theme-heading'}`}>{v}</div></div>
        ))}
      </div>

      <div className="card p-4 space-y-2">
        <h2 className="font-semibold text-theme-heading">Learners per level <span className="text-theme-muted font-normal text-sm">· CAT total</span></h2>
        <div className="flex flex-wrap gap-2">
          {a.levelCodes.map((k: string) => (
            <div key={k} className="rounded-lg border border-theme px-3 py-2 text-center min-w-[64px]">
              <div className="text-xs font-bold" style={{ color: levelsFor(grade).find(l => l.code === k)?.color }}>{k}</div>
              <div className="text-lg font-bold text-theme-heading">{a.levelCounts[k] || 0}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4 space-y-2">
        <h2 className="font-semibold text-theme-heading">Per question</h2>
        <p className="text-xs text-theme-muted">Red = more than half the class scored below half the marks on that question.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left">{['Q', 'Strand › Sub-strand', 'Max', 'Class avg', 'Full marks', 'Partial', 'Zero', 'Below half'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {a.questions.map((q: any) => (
                <tr key={q.id} className={`border-t border-theme ${q.flagged ? 'bg-red-50 text-red-800' : ''}`}>
                  <td className="p-2 font-semibold whitespace-nowrap">{q.flagged && <AlertTriangle size={12} className="inline mr-1 text-red-600"/>}Q{q.number}</td>
                  <td className="p-2">{[q.strand, q.subStrand].filter(Boolean).join(' › ') || '—'}</td>
                  <td className="p-2">{q.maxMarks}</td>
                  <td className="p-2 whitespace-nowrap">{q.avg} <span className="text-xs text-theme-muted">({q.avgPct}%)</span></td>
                  <td className="p-2">{q.fullPct}%</td>
                  <td className="p-2">{q.partialPct}%</td>
                  <td className="p-2">{q.zeroPct}%</td>
                  <td className={`p-2 font-semibold ${q.flagged ? 'text-red-600' : ''}`}>{q.belowHalfPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-4 space-y-2">
        <h2 className="font-semibold text-theme-heading">Strand performance</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left">{['Strand / sub-strand', 'Max', 'Class avg', 'Avg %', 'Level', 'Flagged', 'Learners per level'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {a.strands.map((s: any) => [
                <tr key={s.name} className="border-t border-theme bg-amber-50/60 font-semibold">
                  <td className="p-2">{s.name}</td><td className="p-2">{s.max}</td><td className="p-2">{s.avg}</td><td className="p-2">{s.avgPct}%</td>
                  <td className="p-2"><Lv code={s.level} grade={grade}/></td><td className={`p-2 ${s.flagged ? 'text-red-600' : ''}`}>{s.flagged || '—'}</td>
                  <td className="p-2 font-normal"><LevelCounts codes={a.levelCodes} counts={s.levelCounts} grade={grade}/></td>
                </tr>,
                ...s.subStrands.map((ss: any) => (
                  <tr key={`${s.name}:${ss.name}`} className="border-t border-theme">
                    <td className="p-2 pl-6 text-theme-muted">{ss.name}</td><td className="p-2">{ss.max}</td><td className="p-2">{ss.avg}</td><td className="p-2">{ss.avgPct}%</td>
                    <td className="p-2"><Lv code={ss.level} grade={grade}/></td><td className={`p-2 ${ss.flagged ? 'text-red-600' : ''}`}>{ss.flagged || '—'}</td>
                    <td className="p-2"><LevelCounts codes={a.levelCodes} counts={ss.levelCounts} grade={grade}/></td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-4 space-y-2">
        <h2 className="font-semibold text-theme-heading">Learner drill-down</h2>
        <p className="text-xs text-theme-muted">Questions where the learner scored less than half the marks (score / out of). &ldquo;Not marked&rdquo; = no mark entered for that question.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left">{['Learner', 'Total', 'Level', 'Questions scored below half'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {a.learners.map((l: any) => (
                <tr key={l.id} className="border-t border-theme align-top">
                  <td className="p-2 whitespace-nowrap">{l.name}<div className="text-[10px] text-theme-muted">{l.admissionNumber}</div></td>
                  <td className="p-2 whitespace-nowrap">{l.total} / {a.maxTotal}</td>
                  <td className="p-2"><Lv code={l.level} grade={grade}/></td>
                  <td className="p-2">
                    {l.missed.length ? (
                      <div className="flex flex-wrap gap-1">
                        {l.missed.map((m: any) => <span key={m.number} className="badge bg-red-100 text-red-700">Q{m.number}{m.subStrand ? ` · ${m.subStrand}` : ''}: {m.score === null ? 'not marked' : `${m.score}/${m.maxMarks}`}</span>)}
                      </div>
                    ) : <span className="text-xs text-green-700">None</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
