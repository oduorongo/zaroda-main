// app/dashboard/academic/subject-papers/page.tsx
// Admin/HOI setup: choose, per grade, which learning areas are examined as two
// separate papers (Paper 1 & 2) that get summed into one score on the mark list.
// Optional and per-school — nothing is fixed to any particular subject; any
// learning area (or a custom name) can be flagged on or off per grade.
'use client';
import { useState, useEffect, useMemo } from 'react';
import { FileStack, Loader2, Plus } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { GRADE_LEVELS, learningAreasFor } from '@/lib/cbc/constants';
import toast from 'react-hot-toast';

// Paper 1/2 only applies to Junior School (Grade 7-9) and Senior School (Grade 10-12).
const PAPER_GRADE_LEVELS = GRADE_LEVELS.filter(g => g.band === 'Junior School' || g.band === 'Senior School');

export default function SubjectPapersPage() {
  const [gradeLevel, setGradeLevel] = useState('grade_7');
  const [config, setConfig]         = useState<Record<string, number>>({});
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState<string | null>(null);
  const [customArea, setCustomArea] = useState('');
  const [extraAreas, setExtraAreas] = useState<string[]>([]);

  const areas = useMemo(() => {
    const base = learningAreasFor(gradeLevel);
    return Array.from(new Set([...base, ...extraAreas]));
  }, [gradeLevel, extraAreas]);

  const load = () => {
    setLoading(true);
    apiClient.get('/academic/subject-paper-config', { params: { gradeLevel } })
      .then(r => {
        const data = r.data || {};
        setConfig(data);
        // Any subject already flagged for this grade but not in the default KICD list
        // (a school-specific addition) still needs to show up as a row.
        const known = new Set(learningAreasFor(gradeLevel).map(a => a.toLowerCase()));
        const extra = Object.keys(data).filter(k => !known.has(k));
        setExtraAreas(extra);
      })
      .catch(() => { setConfig({}); setExtraAreas([]); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [gradeLevel]);

  const toggle = async (area: string, on: boolean) => {
    setSaving(area);
    try {
      await apiClient.post('/academic/subject-paper-config', {
        gradeLevel, learningArea: area, paperCount: on ? 2 : 1,
      });
      setConfig(prev => {
        const next = { ...prev };
        if (on) next[area.toLowerCase()] = 2; else delete next[area.toLowerCase()];
        return next;
      });
      toast.success(on ? `${area} now split into Paper 1 & 2` : `${area} back to a single score`);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not save');
    } finally { setSaving(null); }
  };

  const addCustomArea = () => {
    const name = customArea.trim();
    if (!name) return;
    if (!extraAreas.some(a => a.toLowerCase() === name.toLowerCase()) &&
        !learningAreasFor(gradeLevel).some(a => a.toLowerCase() === name.toLowerCase())) {
      setExtraAreas(prev => [...prev, name]);
    }
    setCustomArea('');
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-2">
        <FileStack className="text-theme-muted" size={20}/>
        <h1 className="text-lg font-black text-theme-heading">Paper 1 & 2 Setup</h1>
      </div>
      <p className="text-sm text-theme-muted">
        Choose which learning areas are examined as two separate papers (e.g. English, Kiswahili)
        that get summed into one score on the mark list. This is entirely optional — a school or
        class can flag any subject, several subjects, or none at all.
      </p>

      <div className="card p-4">
        <label className="label">Grade</label>
        <select value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} className="input w-full max-w-xs">
          {PAPER_GRADE_LEVELS.map(g => <option key={g.value} value={g.value}>{g.label} ({g.band})</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-theme-muted" size={24}/></div>
      ) : (
        <div className="card divide-y divide-theme">
          {areas.map(area => {
            const on = (config[area.toLowerCase()] || 1) >= 2;
            return (
              <div key={area} className="flex items-center justify-between gap-3 p-3">
                <div className="text-sm font-medium text-theme-heading">{area}</div>
                <label className="flex items-center gap-2 text-xs text-theme-muted cursor-pointer">
                  {saving === area && <Loader2 size={14} className="animate-spin"/>}
                  <span>{on ? 'Paper 1 & 2' : 'Single score'}</span>
                  <input
                    type="checkbox" checked={on} disabled={saving === area}
                    onChange={e => toggle(area, e.target.checked)}
                    className="w-4 h-4"
                  />
                </label>
              </div>
            );
          })}
        </div>
      )}

      <div className="card p-4">
        <label className="label">Add another subject (not in the list above)</label>
        <div className="flex gap-2 mt-1">
          <input
            value={customArea} onChange={e => setCustomArea(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustomArea()}
            placeholder="e.g. Business Studies"
            className="input flex-1"
          />
          <button onClick={addCustomArea} className="btn-ghost"><Plus size={16}/></button>
        </div>
      </div>
    </div>
  );
}
