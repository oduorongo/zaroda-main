// app/owner/rubrics/page.tsx
// Super-admin rubric manager: browse any grade + learning area's assessment rubric and
// add/edit the YouTube resource link on each sub-strand. Not tied to a stream or learner.
'use client';
import { useState, useEffect } from 'react';
import { BookOpen, Loader2, Youtube, Save, X, Pencil } from 'lucide-react';
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
      .then(r => { const a = r.data?.areas || r.data || []; setAreas(a); if (a[0]) setArea(typeof a[0] === 'string' ? a[0] : a[0].name); })
      .catch(() => setAreas([]));
  }, [grade]);

  useEffect(() => {
    if (!grade || !area) return;
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

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-2">
          <BookOpen className="text-theme-muted" size={20}/>
          <h1 className="text-xl font-black text-theme-heading">Assessment Rubrics</h1>
        </div>
        <p className="text-sm text-theme-muted">Add or edit the YouTube resource link on any sub-strand. These videos are watched by all teachers and learners.</p>

        <div className="card p-4 flex flex-wrap gap-2">
          <div>
            <label className="label">Grade</label>
            <select value={grade} onChange={e => setGrade(e.target.value)} className="input w-40">
              {GRADES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Learning Area</label>
            <select value={area} onChange={e => setArea(e.target.value)} className="input w-56">
              {areas.length === 0 && <option value="">No areas</option>}
              {areas.map((a: any) => { const name = typeof a === 'string' ? a : a.name; return <option key={name} value={name}>{name}</option>; })}
            </select>
          </div>
          <div>
            <label className="label">Term</label>
            <select value={term} onChange={e => setTerm(e.target.value)} className="input w-32">
              <option value="term_1">Term 1</option>
              <option value="term_2">Term 2</option>
              <option value="term_3">Term 3</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-theme-muted" size={24}/></div>
        ) : strands.length === 0 ? (
          <div className="card p-8 text-center text-theme-muted">No rubric found for this grade and learning area.</div>
        ) : strands.map((s, si) => (
          <div key={si} className="card p-4">
            <div className="font-bold text-theme-heading mb-2">{s.name}</div>
            <div className="divide-y divide-theme">
              {s.substrands.map((ss: any) => (
                <div key={ss.id} className="flex items-center gap-2 py-2">
                  <div className="flex-1 min-w-0 text-sm">{ss.name}</div>
                  {ss.youtubeUrl && (
                    <a href={ss.youtubeUrl} target="_blank" rel="noreferrer" className="text-red-600" title="Watch"><Youtube size={15}/></a>
                  )}
                  <button onClick={() => { setEditFor(ss); setUrl(ss.youtubeUrl || ''); }}
                    className="text-theme-muted hover:text-red-600" title={ss.youtubeUrl ? 'Edit link' : 'Add link'}>
                    {ss.youtubeUrl ? <Pencil size={13}/> : <Youtube size={15}/>}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
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
