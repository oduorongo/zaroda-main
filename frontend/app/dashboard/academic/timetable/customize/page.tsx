// app/dashboard/academic/timetable/customize/page.tsx
// Lets an admin override the official KICD period structure / subject
// allocations for one grade band — Auto-generate then builds against this
// instead. Only ever affects THIS school: every band with no override still
// uses the stock KICD table, and every other school is untouched regardless.
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save, RotateCcw, Plus, Trash2, Info } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';
import { GRADE_LEVELS } from '@/lib/cbc/constants';

// One representative grade per band — editing any one applies to the whole
// band (Grade 1 and Grade 2 share the same structure, so there's no need to
// pick a specific grade).
const BAND_GRADES = [
  { value: 'pp1',     label: 'ECDE (Playgroup–PP2)' },
  { value: 'grade_1', label: 'Lower Primary (Grade 1–3)' },
  { value: 'grade_4', label: 'Upper Primary (Grade 4–6)' },
  { value: 'grade_7', label: 'Junior School (Grade 7–9)' },
];

// 'remedial': an early-morning or evening catch-up slot — schedulable like a
// real lesson (assign a subject/teacher to it manually), but deliberately
// left OUT of Auto-generate's KICD-driven fill, since remedial time isn't
// part of the mandated weekly allocation — it's extra, and up to the school
// who/what goes into it.
const PERIOD_TYPES = ['lesson', 'remedial', 'break', 'lunch', 'assembly', 'non_formal', 'ppi', 'games', 'free_choice'];

type Period = { period: number; startTime: string; endTime: string; type: string; label?: string };
type Allocation = { name: string; lessons: number; beforeBreak?: boolean; doubleAllowed?: boolean; isPpi?: boolean };

export default function CustomizeTimetableStructurePage() {
  const [gradeLevel, setGradeLevel] = useState('grade_7');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [data, setData] = useState<any>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [allowsDouble, setAllowsDouble] = useState(false);

  const load = () => {
    setLoading(true);
    apiClient.get('/academic/timetable/structure', { params: { gradeLevel } })
      .then(r => {
        setData(r.data);
        setPeriods((r.data?.periods || []).map((p: any) => ({ ...p })));
        setAllocations((r.data?.allocations || []).map((a: any) => ({ ...a })));
        setAllowsDouble(!!r.data?.allowsDouble);
      })
      .catch(() => toast.error('Could not load the current structure'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [gradeLevel]);

  const save = async () => {
    if (!periods.length) { toast.error('Add at least one period'); return; }
    if (!allocations.length) { toast.error('Add at least one learning area'); return; }
    setSaving(true);
    try {
      const { data: res } = await apiClient.post('/academic/timetable/override', { gradeLevel, periods, allocations, allowsDouble });
      toast.success(res.message || 'Saved');
      load();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not save'); }
    finally { setSaving(false); }
  };

  const resetToDefault = async () => {
    if (!confirm('Reset this grade band back to the official KICD structure? Your customization will be lost.')) return;
    setResetting(true);
    try {
      const { data: res } = await apiClient.delete('/academic/timetable/override', { params: { gradeLevel } });
      toast.success(res.message || 'Reset');
      load();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not reset'); }
    finally { setResetting(false); }
  };

  const nextPeriodNumber = () => Math.max(0, ...periods.filter(p => p.type === 'lesson').map(p => p.period)) + 1;
  const addPeriod = () => setPeriods(p => [...p, { period: nextPeriodNumber(), startTime: '08:00', endTime: '08:40', type: 'lesson' }]);
  const removePeriod = (i: number) => setPeriods(p => p.filter((_, x) => x !== i));
  const updatePeriod = (i: number, patch: Partial<Period>) => setPeriods(p => p.map((row, x) => x === i ? { ...row, ...patch } : row));

  const addAllocation = () => setAllocations(a => [...a, { name: '', lessons: 1 }]);
  const removeAllocation = (i: number) => setAllocations(a => a.filter((_, x) => x !== i));
  const updateAllocation = (i: number, patch: Partial<Allocation>) => setAllocations(a => a.map((row, x) => x === i ? { ...row, ...patch } : row));

  const totalLessons = allocations.filter(a => !a.isPpi).reduce((s, a) => s + (Number(a.lessons) || 0), 0);
  const totalCapacity = periods.filter(p => p.type === 'lesson').length * 5;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/academic/timetable" className="btn-ghost p-2"><ArrowLeft size={16}/></Link>
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Customize Timetable Structure</h1>
          <p className="text-sm text-theme-muted">Adjust the period times, breaks, or subject list for a grade band — only for this school</p>
        </div>
      </div>

      <div className="card p-4">
        <label className="label">Grade band</label>
        <select value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} className="input max-w-sm">
          {BAND_GRADES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
        {data && (
          <p className={`text-xs mt-2 ${data.customized ? 'text-amber-600' : 'text-theme-muted'}`}>
            {data.customized ? `Customized · last updated ${new Date(data.updatedAt).toLocaleDateString('en-KE')}` : 'Currently using the official KICD structure — no changes yet.'}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-theme-muted" size={26}/></div>
      ) : (
        <>
          <div className="card p-4 flex items-start gap-2 border border-blue-200/60 bg-blue-50/30">
            <Info size={16} className="text-[#1a2e5a] flex-shrink-0 mt-0.5"/>
            <p className="text-sm text-theme-muted">Weekly lesson total: <b className="text-theme-heading">{totalLessons}</b> · Period capacity (lesson periods × 5 days): <b className="text-theme-heading">{totalCapacity}</b>.{' '}
              {totalLessons > totalCapacity ? <span className="text-red-600 font-semibold">Over capacity — some lessons won't fit. Add more lesson periods or reduce a subject's count.</span>
                : totalLessons < totalCapacity ? <span className="text-amber-600">Under capacity — some periods will sit empty.</span>
                : <span className="text-green-600 font-semibold">Exact fit — every lesson should place cleanly.</span>}
            </p>
          </div>

          {/* Period structure */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-theme-heading">Daily period structure</h2>
              <button onClick={addPeriod} className="btn-ghost text-xs"><Plus size={13}/> Add row</button>
            </div>
            <div className="space-y-2">
              {periods.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1.4fr_auto] gap-2 items-center">
                  <input type="time" value={p.startTime} onChange={e => updatePeriod(i, { startTime: e.target.value })} className="input py-1.5 text-sm"/>
                  <input type="time" value={p.endTime} onChange={e => updatePeriod(i, { endTime: e.target.value })} className="input py-1.5 text-sm"/>
                  <select value={p.type} onChange={e => updatePeriod(i, { type: e.target.value })} className="input py-1.5 text-sm capitalize">
                    {PERIOD_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                  </select>
                  <input value={p.label || ''} onChange={e => updatePeriod(i, { label: e.target.value })}
                    placeholder={p.type === 'lesson' ? `Period ${p.period} (auto)` : p.type === 'remedial' ? 'Give it a distinct name, e.g. "Early Morning Remedial"' : 'Label, e.g. Lunch Break'} className="input py-1.5 text-sm"/>
                  <button onClick={() => removePeriod(i)} className="text-theme-muted hover:text-red-600"><Trash2 size={15}/></button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-theme-muted mt-2">"Lesson" periods are numbered automatically in order. Non-lesson rows (breaks, lunch, assembly…) just mark time that isn't available for teaching.</p>
          </div>

          {/* Learning areas */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-theme-heading">Learning areas &amp; weekly lessons</h2>
              <button onClick={addAllocation} className="btn-ghost text-xs"><Plus size={13}/> Add subject</button>
            </div>
            <div className="space-y-2">
              {allocations.map((a, i) => (
                <div key={i} className="grid grid-cols-[2fr_0.6fr_auto_auto_auto] gap-2 items-center">
                  <input value={a.name} onChange={e => updateAllocation(i, { name: e.target.value })} placeholder="Subject name" className="input py-1.5 text-sm"/>
                  <input type="number" min={0} value={a.lessons} onChange={e => updateAllocation(i, { lessons: Number(e.target.value) })} className="input py-1.5 text-sm text-center"/>
                  <label className="flex items-center gap-1.5 text-xs text-theme-muted whitespace-nowrap">
                    <input type="checkbox" checked={!!a.beforeBreak} onChange={e => updateAllocation(i, { beforeBreak: e.target.checked })}/> Before break
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-theme-muted whitespace-nowrap">
                    <input type="checkbox" checked={!!a.doubleAllowed} onChange={e => updateAllocation(i, { doubleAllowed: e.target.checked })}/> Allow double
                  </label>
                  <button onClick={() => removeAllocation(i)} className="text-theme-muted hover:text-red-600"><Trash2 size={15}/></button>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-theme-muted mt-3 pt-3 border-t border-theme">
              <input type="checkbox" checked={allowsDouble} onChange={e => setAllowsDouble(e.target.checked)}/>
              Allow double (back-to-back) lessons for this band — only takes effect for subjects also ticked "Allow double" above.
            </label>
          </div>

          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? <Loader2 size={15} className="animate-spin"/> : <Save size={15}/>} Save Customization
            </button>
            {data?.customized && (
              <button onClick={resetToDefault} disabled={resetting} className="btn-ghost">
                {resetting ? <Loader2 size={15} className="animate-spin"/> : <RotateCcw size={15}/>} Reset to KICD Default
              </button>
            )}
          </div>
          <p className="text-xs text-theme-muted">After saving, go back and run <b>Auto-generate</b> on the affected classes to apply the new structure.</p>
        </>
      )}
    </div>
  );
}
