'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2, Undo2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, isHoi } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

type Action = 'promote' | 'repeat' | 'transfer' | 'complete';
const ACTION_LABEL: Record<Action, string> = { promote: 'Promote', repeat: 'Repeat', transfer: 'Transferred out', complete: 'Completed' };

/**
 * End of year: move a class's learners to the next grade. Each grade has its own learning areas and rubric,
 * so a promoted learner simply picks up the new grade's; their old marks stay under the grade they were earned in.
 */
export default function PromoteLearnersPage() {
  const { user } = useAuth();
  const [streams, setStreams] = useState<any[]>([]);
  const [streamId, setStreamId] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actions, setActions] = useState<Record<string, Action>>({});
  const [targetId, setTargetId] = useState('');
  const [newName, setNewName] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [batches, setBatches] = useState<any[]>([]);

  const loadBatches = () => apiClient.get('/academic/promotion/batches').then(r => setBatches(r.data || [])).catch(() => setBatches([]));
  // Top grade first, with how many learners each class still has to move this year.
  const loadClasses = () => apiClient.get('/academic/promotion/classes').then(r => setStreams(r.data || [])).catch(() => setStreams([]));
  useEffect(() => {
    loadClasses();
    loadBatches();
  }, []);

  useEffect(() => {
    setPreview(null); setConfirming(false);
    if (!streamId) return;
    setLoading(true);
    apiClient.get('/academic/promotion/preview', { params: { streamId } })
      .then(r => {
        const p = r.data;
        setPreview(p);
        const def: Action = p.defaultAction || (p.isFinalGrade ? 'complete' : 'promote');
        setActions(Object.fromEntries(p.learners.map((l: any) => [l.id, def])));
        setTargetId(p.suggestedTargetId || (p.targets.length || p.canCreateTarget === false ? '' : '__new'));
        setNewName(p.suggestedNewName || '');
      })
      .catch((e: any) => toast.error(e?.response?.data?.message || 'Could not load this class'))
      .finally(() => setLoading(false));
  }, [streamId]);

  const counts = useMemo(() => {
    const c: Record<Action, number> = { promote: 0, repeat: 0, transfer: 0, complete: 0 };
    Object.values(actions).forEach(a => { c[a]++; });
    return c;
  }, [actions]);

  // The chosen class to move into still holds this year's learners: it has to be promoted first.
  const blockingTarget = preview && counts.promote > 0 && targetId && targetId !== '__new'
    ? preview.targets.find((t: any) => t.id === targetId && t.waiting > 0) : null;

  // Grade 9 learners finish Junior School rather than 'completing school'.
  const label = (a: Action) => (a === 'complete' && preview?.completeLabel) || ACTION_LABEL[a];

  const setAll = (a: Action) => setActions(Object.fromEntries(Object.keys(actions).map(id => [id, a])));

  const submit = async () => {
    if (!preview) return;
    if (counts.promote && !targetId) { toast.error(`Choose the ${preview.nextGradeName} class`); return; }
    if (counts.promote && targetId === '__new' && !newName.trim()) { toast.error('Name the new class'); return; }
    if (blockingTarget) { toast.error(`Promote ${blockingTarget.name} first`); return; }
    setSaving(true);
    try {
      const r = await apiClient.post('/academic/promotion', {
        streamId,
        targetStreamId: targetId && targetId !== '__new' ? targetId : undefined,
        newStreamName: targetId === '__new' ? newName.trim() : undefined,
        decisions: Object.entries(actions).map(([learnerId, action]) => ({ learnerId, action })),
      });
      const c = r.data.counts;
      toast.success(`${preview.stream.name}: ${c.promote} promoted${r.data.toStream ? ` to ${r.data.toStream}` : ''}, ${c.repeat} repeating, ${c.transfer} transferred, ${c.complete} completed`);
      setStreamId(''); setPreview(null); setConfirming(false);
      loadClasses();
      loadBatches();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not promote this class');
    } finally { setSaving(false); }
  };

  const undo = async (b: any) => {
    if (!confirm(`Undo this promotion of ${b.fromStream}? Every learner goes back to the class and grade they were in.`)) return;
    try {
      const r = await apiClient.post(`/academic/promotion/${b.batchId}/undo`);
      toast.success(`${r.data.restored} learner(s) moved back${r.data.skipped ? `; ${r.data.skipped} had been moved again since and were left as they are` : ''}`);
      loadBatches();
      loadClasses();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not undo'); }
  };

  const allSame = (a: Action) => Object.keys(actions).length > 0 && Object.values(actions).every(x => x === a);

  const confirmBox = preview && preview.learners.length > 0 && (
    !confirming ? (
      <button className="btn-primary" disabled={!!blockingTarget} onClick={() => setConfirming(true)}>Review and confirm</button>
    ) : (
      <div className="rounded-lg bg-surface-2 p-4 space-y-3">
        <p className="text-sm text-theme-heading">
          {counts.promote > 0 && <><b>{counts.promote}</b> promoted to <b>{targetId === '__new' ? newName || 'a new class' : preview.targets.find((t: any) => t.id === targetId)?.name || '—'}</b>. </>}
          {counts.repeat > 0 && <><b>{counts.repeat}</b> repeating {preview.stream.gradeName}. </>}
          {counts.transfer > 0 && <><b>{counts.transfer}</b> transferred out. </>}
          {counts.complete > 0 && <><b>{counts.complete}</b> {preview.completeLabel === 'Completed Junior School' ? 'completed Junior School' : 'completed school'}. </>}
        </p>
        <p className="text-xs text-theme-muted">You can undo this within 30 days from the list below.</p>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={saving} onClick={submit}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Confirm
          </button>
          <button className="btn-ghost" disabled={saving} onClick={() => setConfirming(false)}>Back</button>
        </div>
      </div>
    )
  );

  if (user && !isHoi(user.role || '')) {
    return <div className="card p-8 text-center text-theme-muted">Only the HOI, a deputy, the Director of Studies or a school administrator can promote learners.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Promote Learners</h1>
          <p className="text-sm text-theme-muted mt-0.5">End of year: move each class up a grade. Learners pick up the new grade&apos;s learning areas; their old marks stay with the grade they were earned in.</p>
        </div>
        <Link href="/dashboard/academic" className="btn-ghost">Back to Academic</Link>
      </div>

      <div className="card p-5 space-y-3">
        <label className="block text-sm font-semibold text-theme-heading">1. Choose a class</label>
        <p className="text-xs text-theme-muted">Work from the top grade down: a class can only move into a class that has already moved up, so Grade 3 goes before Grade 2.</p>
        <select className="input w-full sm:max-w-sm" value={streamId} onChange={e => setStreamId(e.target.value)}>
          <option value="">Select a class…</option>
          {streams.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} — {s.waiting > 0 ? `${s.waiting} to move` : s.learners > 0 ? 'done ✓' : 'empty'}
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="card p-8 flex justify-center"><Loader2 className="animate-spin text-theme-muted" /></div>}

      {preview && !loading && (
        <>
          <div className="card p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold text-theme-heading">{preview.stream.name}</span>
              <ArrowRight size={16} className="text-theme-muted" />
              <span className="font-bold text-theme-heading">{preview.isFinalGrade ? (preview.completeLabel === 'Completed Junior School' ? 'Completes Junior School' : 'Completes school')
                : preview.defaultAction === 'complete' ? `Completes Junior School (or ${preview.nextGradeName})` : preview.nextGradeName}</span>
              <span className="text-theme-muted">· end of {preview.schoolYear}</span>
            </div>
            {preview.completeLabel === 'Completed Junior School' && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                {preview.isFinalGrade
                  ? "Grade 9 is the end of Junior School. Learners go on to Senior School through placement, so they are marked Completed Junior School and leave this school's class lists. Their marks and report cards are kept."
                  : "Grade 9 is the end of Junior School. Most learners leave for Senior School through placement: keep them as Completed Junior School, and choose Promote only for those staying in this school's Grade 10."}
              </p>
            )}
            {preview.needsPathway && counts.promote > 0 && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                Grade 10 is Senior School: after promoting, set each learner&apos;s pathway and electives under Senior Selection.
              </p>
            )}

            {!preview.isFinalGrade && counts.promote > 0 && (
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-theme-heading">2. {preview.nextGradeName} class they move into</label>
                <select className="input w-full sm:max-w-sm" value={targetId} onChange={e => setTargetId(e.target.value)}>
                  <option value="">Select…</option>
                  {preview.targets.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name}{t.waiting > 0 ? ` — not promoted yet (${t.waiting} still there)` : ''}</option>
                  ))}
                  {preview.canCreateTarget !== false && <option value="__new">+ Create a new {preview.nextGradeName} class</option>}
                </select>
                {targetId === '__new' && (
                  <input className="input w-full sm:max-w-sm" value={newName} onChange={e => setNewName(e.target.value)} placeholder={`e.g. ${preview.suggestedNewName}`} />
                )}
                {blockingTarget && (
                  <div className="flex flex-wrap items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <span className="flex-1 min-w-[12rem]">
                      {blockingTarget.name} still has {blockingTarget.waiting} learner{blockingTarget.waiting === 1 ? '' : 's'} from this year.
                      Promote {blockingTarget.name} first, then come back to {preview.stream.name}, so the two classes don&apos;t get mixed up.
                    </span>
                    <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setStreamId(blockingTarget.id)}>
                      Go to {blockingTarget.name}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-semibold text-theme-heading">{!preview.isFinalGrade && counts.promote > 0 ? '3' : '2'}. Each learner ({preview.learners.length})</label>
                <div className="flex flex-wrap gap-1 text-xs">
                  <span className="text-theme-muted self-center">Set all:</span>
                  {(preview.actions || []).filter((a: Action) => a !== 'transfer').map((a: Action) => (
                    <button key={a} type="button" onClick={() => setAll(a)} aria-pressed={allSame(a)}
                      className={allSame(a) ? 'btn-primary px-2 py-1' : 'btn-ghost px-2 py-1'}>
                      {allSame(a) && <CheckCircle2 size={12} />} {label(a)}
                    </button>
                  ))}
                </div>
              </div>
              {preview.learners.length > 0 && <div className="mb-3">{confirmBox}</div>}
              {preview.learners.length === 0 ? (
                <p className="text-sm text-theme-muted">
                  {preview.alreadyMoved > 0
                    ? `Nothing left to do here this year: the ${preview.alreadyMoved} learner(s) in ${preview.stream.name} have already moved in or are repeating.`
                    : 'No active learners in this class.'}
                </p>
              ) : (
                <div className="divide-y rounded-lg" style={{ border: '1px solid var(--border)' }}>
                  {preview.learners.map((l: any) => (
                    <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <div className="font-medium text-theme-heading truncate">{l.name}</div>
                        <div className="text-xs text-theme-muted">{l.admissionNumber}</div>
                      </div>
                      <select className="input py-1 text-sm" value={actions[l.id]} onChange={e => setActions(a => ({ ...a, [l.id]: e.target.value as Action }))}>
                        {(preview.actions || []).map((a: Action) => (
                          <option key={a} value={a}>{label(a)}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {preview.learners.length > 10 && confirmBox}
          </div>
        </>
      )}

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-theme-heading mb-3">Recent promotions</h2>
        {batches.length === 0 ? (
          <p className="text-sm text-theme-muted">None yet.</p>
        ) : (
          <div className="divide-y">
            {batches.map(b => (
              <div key={b.batchId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <span className="font-medium text-theme-heading">{b.fromStream}</span>
                  {b.toStream && <> → <span className="font-medium text-theme-heading">{b.toStream}</span></>}
                  <div className="text-xs text-theme-muted">
                    {b.promoted} promoted · {b.repeated} repeating · {b.transferred} transferred · {b.completed} completed
                    {' · '}{new Date(b.doneAt).toLocaleDateString('en-KE')}{b.doneBy ? ` by ${b.doneBy}` : ''}
                    {b.undoneAt && <span className="text-amber-700"> · undone</span>}
                  </div>
                </div>
                {b.canUndo && <button className="btn-ghost text-xs" onClick={() => undo(b)}><Undo2 size={14} /> Undo</button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
