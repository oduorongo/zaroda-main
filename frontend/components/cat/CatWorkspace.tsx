'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, Lock, Loader2, Plus, Save, Trash2, ClipboardList, Eye } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

const TERMS = [{ v: 'term_1', l: 'Term 1' }, { v: 'term_2', l: 'Term 2' }, { v: 'term_3', l: 'Term 3' }];
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
  const total = (lid: string) => {
    const vals = saved.map((q: any) => cells[`${lid}:${q.id}`]).filter((v: any) => v !== undefined && v !== '');
    return vals.length ? vals.reduce((a: number, v: string) => a + Number(v), 0) : null;
  };
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
            {edit && <button onClick={saveMarks} disabled={busy === 'm'} className="btn-primary">{busy === 'm' ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Save marks</button>}
          </div>
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse">
              <thead>
                <tr className="text-xs text-theme-muted">
                  <th className="p-2 text-left sticky left-0 bg-surface">Learner</th>
                  {saved.map((q: any) => <th key={q.id} className="p-1 text-center" title={[q.strand, q.subStrand].filter(Boolean).join(' › ')}>Q{q.number}<div className="font-normal">/{q.maxMarks}</div></th>)}
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
                      <td className="p-2 text-center font-semibold">{t ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
