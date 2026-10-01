'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onChange} disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 border ${checked ? 'bg-[#1a2e5a] border-[#1a2e5a]' : 'bg-gray-300 border-gray-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`}/>
    </button>
  );
}

type Settings = { showPerformanceLevels: boolean; showPointsTotal: boolean; showMarklistLevels: boolean; totalMarksOutOf: string };

export default function ReportCardSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPerformanceLevels, setShowPerformanceLevels] = useState(true);
  const [showPointsTotal, setShowPointsTotal] = useState(true);
  const [showMarklistLevels, setShowMarklistLevels] = useState(true);
  // "Total marks out of" — blank means the report card doesn't show a total-marks line.
  const [totalMarksOutOf, setTotalMarksOutOf] = useState('');
  const [savedTotalMarksOutOf, setSavedTotalMarksOutOf] = useState('');

  useEffect(() => {
    apiClient.get('/pdf/report-card-settings')
      .then(r => {
        setShowPerformanceLevels(r.data?.showPerformanceLevels !== false);
        setShowPointsTotal(r.data?.showPointsTotal !== false);
        setShowMarklistLevels(r.data?.showMarklistLevels !== false);
        const t = r.data?.totalMarksOutOf ? String(r.data.totalMarksOutOf) : '';
        setTotalMarksOutOf(t); setSavedTotalMarksOutOf(t);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Always sends every setting (the backend overwrites the whole row), with `change` applied
  // on top of what's currently on screen.
  const save = async (change: Partial<Settings>) => {
    const next: Settings = {
      showPerformanceLevels, showPointsTotal, showMarklistLevels, totalMarksOutOf: savedTotalMarksOutOf, ...change,
    };
    setSaving(true);
    try {
      await apiClient.post('/pdf/report-card-settings', { ...next, totalMarksOutOf: next.totalMarksOutOf.trim() || null });
      setSavedTotalMarksOutOf(next.totalMarksOutOf.trim());
      toast.success('Saved');
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not save'); }
    finally { setSaving(false); }
  };

  const totalDirty = totalMarksOutOf.trim() !== savedTotalMarksOutOf;

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/academic/report-cards" className="btn-ghost p-2"><ArrowLeft size={16}/></Link>
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Report Card Settings</h1>
          <p className="text-sm text-theme-muted">Applies to every report card generated for this school, one term at a time</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-theme-muted" size={24}/></div>
      ) : (
        <div className="space-y-3">
          <div className="card p-5 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-theme-heading text-sm">Show CBC performance-level bands</div>
              <p className="text-xs text-theme-muted mt-1">EE/ME/AE/BE (or EE1–BE2 for Grade 7–12) next to each percentage. Turn off to show percentages only.</p>
            </div>
            <Toggle checked={showPerformanceLevels} disabled={saving}
              onChange={() => { const next = !showPerformanceLevels; setShowPerformanceLevels(next); save({ showPerformanceLevels: next }); }}/>
          </div>
          <div className="card p-5 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-theme-heading text-sm">Show the points total</div>
              <p className="text-xs text-theme-muted mt-1">"Performance-level total: X / Y" at the bottom of the report card. Turn off to show a plain "Term Average: Z%" instead.</p>
            </div>
            <Toggle checked={showPointsTotal} disabled={saving}
              onChange={() => { const next = !showPointsTotal; setShowPointsTotal(next); save({ showPointsTotal: next }); }}/>
          </div>
          <div className="card p-5 space-y-3">
            <div>
              <div className="font-semibold text-theme-heading text-sm">Total marks out of</div>
              <p className="text-xs text-theme-muted mt-1">
                Adds "Total marks: X / {totalMarksOutOf.trim() || 'Y'}" to the report card. Each learning area carries an equal share,
                so a learner averaging 80% gets 80% of this total. Leave blank to hide the line.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number" inputMode="numeric" min={1} step={1} value={totalMarksOutOf}
                onChange={e => setTotalMarksOutOf(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && totalDirty) save({ totalMarksOutOf }); }}
                placeholder="e.g. 500"
                className="input w-32 font-bold"
              />
              <button type="button" onClick={() => save({ totalMarksOutOf })} disabled={saving || !totalDirty} className="btn-primary">
                {saving ? <Loader2 className="animate-spin" size={14}/> : null} Save
              </button>
            </div>
          </div>
          <div className="card p-5 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-theme-heading text-sm">Show performance levels on the mark list</div>
              <p className="text-xs text-theme-muted mt-1">EE/ME/AE/BE bands next to scores on the mark-list views. Turn off to show percentage scores only.</p>
            </div>
            <Toggle checked={showMarklistLevels} disabled={saving}
              onChange={() => { const next = !showMarklistLevels; setShowMarklistLevels(next); save({ showMarklistLevels: next }); }}/>
          </div>
          <p className="text-xs text-theme-muted bg-surface-2/60 rounded-lg px-3 py-2">
            To write your own class teacher / HOI remark instead of the auto-generated one, open a learner's report card from Report Card (teacher view) and use "Edit Remarks" there — it's per learner, per term.
          </p>
        </div>
      )}
    </div>
  );
}
