// app/owner/rubrics/page.tsx
// Super-admin rubric manager: browse any grade + learning area's assessment rubric and
// add/edit the YouTube resource link on each sub-strand. Not tied to a stream or learner.
'use client';
import { useState, useEffect } from 'react';
import { BookOpen, Loader2, Youtube, Save, X, Pencil, Plus, Trash2 } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

const GRADES = [
  ['playgroup','Playgroup'],['pp1','PP1'],['pp2','PP2'],
  ['grade_1','Grade 1'],['grade_2','Grade 2'],['grade_3','Grade 3'],
  ['grade_4','Grade 4'],['grade_5','Grade 5'],['grade_6','Grade 6'],
  ['grade_7','Grade 7'],['grade_8','Grade 8'],['grade_9','Grade 9'],
  ['grade_10','Grade 10'],['grade_11','Grade 11'],['grade_12','Grade 12'],
] as const;

export default function OwnerRubricsPage() {
  const [grade, setGrade]   = useState('grade_7');
  const [term, setTerm]     = useState('term_1');
  const [areas, setAreas]   = useState<string[]>([]);
  const [area, setArea]     = useState('');
  const [strands, setStrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editFor, setEditFor] = useState<any>(null);
  const [url, setUrl]         = useState('');
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    apiClient.get(`/assessment/learning-areas?gradeLevel=${grade}`)
      .then(r => {
        const raw = r.data?.areas || r.data || [];
        // Backend returns [{ learningArea }]; also tolerate strings or { name }.
        const names = raw.map((a: any) => typeof a === 'string' ? a : (a.learningArea || a.name || a.area)).filter(Boolean);
        setAreas(names);
        if (names[0]) setArea(names[0]);
      })
      .catch(() => setAreas([]));
  }, [grade]);

  useEffect(() => {
    if (!grade || !area || area === '__new__') { if (area === '__new__') setStrands([]); return; }
    setLoading(true);
    apiClient.get(`/assessment/book?gradeLevel=${grade}&learningArea=${encodeURIComponent(area)}&term=${term}`)
      .then(r => setStrands(r.data?.strands || []))
      .catch(() => setStrands([]))
      .finally(() => setLoading(false));
  }, [grade, area, term]);

  const saveLink = async () => {
    setSaving(true);
    try {
      await apiClient.post('/assessment/resource', { substrandId: editFor.id, youtubeUrl: url });
      setStrands(sts => sts.map(s => ({ ...s, substrands: s.substrands.map((ss: any) => ss.id === editFor.id ? { ...ss, youtubeUrl: url } : ss) })));
      toast.success('Video link saved');
      setEditFor(null);
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not save'); }
    finally { setSaving(false); }
  };

  const deleteArea = async () => {
    if (!area || area === '__new__') { toast.error('Pick a learning area first'); return; }
    if (!confirm(`Delete the ENTIRE "${area}" learning area for ${grade.replace('_',' ')} — all its strands and sub-strands across all terms? This cannot be undone.`)) return;
    try {
      const r = await apiClient.delete(`/assessment/area?gradeLevel=${grade}&learningArea=${encodeURIComponent(area)}`);
      toast.success(`Removed "${area}"`);
      // refresh the area list
      const ar = await apiClient.get(`/assessment/learning-areas?gradeLevel=${grade}`);
      const raw = ar.data?.areas || ar.data || [];
      const names = raw.map((a: any) => typeof a === 'string' ? a : (a.learningArea || a.name || a.area)).filter(Boolean);
      setAreas(names); setArea(names[0] || ''); setStrands([]);
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not delete area'); }
  };

  const reload = () => {
    if (!grade || !area) return;
    apiClient.get(`/assessment/book?gradeLevel=${grade}&learningArea=${encodeURIComponent(area)}&term=${term}`)
      .then(r => setStrands(r.data?.strands || [])).catch(() => {});
  };

  const addStrand = async () => {
    const name = prompt('New strand name:'); if (!name?.trim()) return;
    try { await apiClient.post('/assessment/strand', { gradeLevel: grade, learningArea: area, term, name }); toast.success('Strand added'); reload(); }
    catch (e: any) { toast.error(e?.response?.data?.message || 'Could not add'); }
  };
  const renameStrand = async (s: any) => {
    const name = prompt('Rename strand:', s.name); if (!name?.trim() || name === s.name) return;
    try { await apiClient.patch(`/assessment/strand/${s.id}`, { name }); toast.success('Renamed'); reload(); }
    catch (e: any) { toast.error(e?.response?.data?.message || 'Could not rename'); }
  };
  const deleteStrand = async (s: any) => {
    if (!confirm(`Delete strand "${s.name}" and all its sub-strands? This cannot be undone.`)) return;
    try { await apiClient.delete(`/assessment/strand/${s.id}`); toast.success('Strand deleted'); reload(); }
    catch (e: any) { toast.error(e?.response?.data?.message || 'Could not delete'); }
  };
  const addSubstrand = async (s: any) => {
    const name = prompt(`Add sub-strand to "${s.name}":`); if (!name?.trim()) return;
    try { await apiClient.post('/assessment/substrand', { strandId: s.id, name }); toast.success('Sub-strand added'); reload(); }
    catch (e: any) { toast.error(e?.response?.data?.message || 'Could not add'); }
  };
  const renameSubstrand = async (ss: any) => {
    const name = prompt('Rename sub-strand:', ss.name); if (!name?.trim() || name === ss.name) return;
    try { await apiClient.patch(`/assessment/substrand/${ss.id}`, { name }); toast.success('Renamed'); reload(); }
    catch (e: any) { toast.error(e?.response?.data?.message || 'Could not rename'); }
  };
  const deleteSubstrand = async (ss: any) => {
    if (!confirm(`Delete sub-strand "${ss.name}"?`)) return;
    try { await apiClient.delete(`/assessment/substrand/${ss.id}`); toast.success('Deleted'); reload(); }
    catch (e: any) { toast.error(e?.response?.data?.message || 'Could not delete'); }
  };

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-2">
          <BookOpen className="text-theme-muted" size={20}/>
          <h1 className="text-xl font-black text-theme-heading">Assessment Rubrics</h1>
        </div>
        <p className="text-sm text-theme-muted">Edit the rubric for any grade, learning area and term — add, rename or delete strands and sub-strands, and attach YouTube resource links (watched by teachers and parents at home).</p>

        <div className="card p-4 flex flex-wrap gap-2">
          <div>
            <label className="label">Grade</label>
            <select value={grade} onChange={e => setGrade(e.target.value)} className="input w-40">
              {GRADES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Learning Area</label>
            <div className="flex gap-1">
              <select value={areas.includes(area)?area:''} onChange={e => setArea(e.target.value)} className="input w-48">
                {areas.length === 0 && <option value="">No areas yet</option>}
                {areas.map((a: any) => { const name = typeof a === 'string' ? a : (a.learningArea || a.name); return <option key={name} value={name}>{name}</option>; })}
                <option value="__new__">➕ Type a new area…</option>
              </select>
            </div>
            {(area === '__new__' || (!areas.includes(area) && area)) && (
              <input autoFocus value={area==='__new__'?'':area} onChange={e=>setArea(e.target.value)} className="input mt-1 w-48" placeholder="New learning area name"/>
            )}
          </div>
          <div>
            <label className="label">Term</label>
            <select value={term} onChange={e => setTerm(e.target.value)} className="input w-32">
              <option value="term_1">Term 1</option>
              <option value="term_2">Term 2</option>
              <option value="term_3">Term 3</option>
            </select>
          </div>
          {area && area !== '__new__' && areas.includes(area) && (
            <div className="flex items-end">
              <button onClick={deleteArea} className="btn-ghost text-sm text-red-600 hover:bg-red-50" title="Delete this whole learning area">
                <Trash2 size={14}/> Delete area
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-theme-muted" size={24}/></div>
        ) : (
          <>
          {strands.length === 0 ? (
            <div className="card p-8 text-center text-theme-muted">No rubric for this grade, area and term yet. Use “Add strand” below to start building it.</div>
          ) : strands.map((s, si) => (
          <div key={si} className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="font-bold text-theme-heading flex-1">{s.name}</div>
              <button onClick={() => addSubstrand(s)} className="text-xs text-[#1a2e5a] hover:underline" title="Add sub-strand"><Plus size={13} className="inline"/> sub-strand</button>
              <button onClick={() => renameStrand(s)} className="text-theme-muted hover:text-[#1a2e5a]" title="Rename strand"><Pencil size={13}/></button>
              <button onClick={() => deleteStrand(s)} className="text-theme-muted hover:text-red-600" title="Delete strand"><Trash2 size={13}/></button>
            </div>
            <div className="divide-y divide-theme">
              {s.substrands.length === 0 && <div className="text-xs text-theme-muted py-2">No sub-strands. Click “+ sub-strand” to add.</div>}
              {s.substrands.map((ss: any) => (
                <div key={ss.id} className="flex items-center gap-2 py-2">
                  <div className="flex-1 min-w-0 text-sm">{ss.name}</div>
                  {ss.youtubeUrl && (
                    <a href={ss.youtubeUrl} target="_blank" rel="noreferrer" className="text-red-600" title="Watch"><Youtube size={15}/></a>
                  )}
                  <button onClick={() => { setEditFor(ss); setUrl(ss.youtubeUrl || ''); }}
                    className="text-theme-muted hover:text-red-600" title={ss.youtubeUrl ? 'Edit video link' : 'Add video link'}>
                    {ss.youtubeUrl ? <Pencil size={13}/> : <Youtube size={15}/>}
                  </button>
                  <button onClick={() => renameSubstrand(ss)} className="text-theme-muted hover:text-[#1a2e5a]" title="Rename sub-strand"><Pencil size={12}/></button>
                  <button onClick={() => deleteSubstrand(ss)} className="text-theme-muted hover:text-red-600" title="Delete sub-strand"><Trash2 size={12}/></button>
                </div>
              ))}
            </div>
          </div>
          ))}
          <button onClick={addStrand} className="btn-ghost w-full justify-center"><Plus size={15}/> Add strand</button>
          </>
        )}
      </div>

      {editFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setEditFor(null)}>
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md" onClick={e => e.stopPropagation()} style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-bold text-theme-heading flex items-center gap-2"><Youtube size={18} className="text-red-600"/> Video resource</h3>
              <button onClick={() => setEditFor(null)} className="text-theme-muted"><X size={20}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-sm text-theme-muted">{editFor.name}</div>
              <input value={url} onChange={e => setUrl(e.target.value)} className="input w-full" placeholder="https://youtu.be/…"/>
              <button onClick={saveLink} disabled={saving} className="btn-primary w-full justify-center">
                {saving ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>} Save link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
