'use client';
import { useState, useEffect } from 'react';
import { FileText, Loader2, Pencil, X, Save } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, isHoi } from '@/lib/hooks/useAuth';
import { BulkReportCardsButton, ReportCardButton } from '@/components/pdf/pdf-buttons';
import { LearnerSearch, matchesLearner } from '@/components/LearnerSearch';
import toast from 'react-hot-toast';

const STYLE: Record<string, string> = {
  EE: 'bg-[#E1F5EE] text-[#085041]', EE1: 'bg-[#E1F5EE] text-[#085041]', EE2: 'bg-[#E1F5EE] text-[#085041]',
  ME: 'bg-[#E6F1FB] text-[#0C447C]', ME1: 'bg-[#E6F1FB] text-[#0C447C]', ME2: 'bg-[#E6F1FB] text-[#0C447C]',
  AE: 'bg-[#FAEEDA] text-[#633806]', AE1: 'bg-[#FAEEDA] text-[#633806]', AE2: 'bg-[#FAEEDA] text-[#633806]',
  BE: 'bg-[#FCEBEB] text-[#791F1F]', BE1: 'bg-[#FCEBEB] text-[#791F1F]', BE2: 'bg-[#FCEBEB] text-[#791F1F]',
};

export default function ReportCard() {
  const { user } = useAuth();
  const [streams, setStreams] = useState<any[]>([]);
  const [streamId, setStreamId] = useState('');
  const [learners, setLearners] = useState<any[]>([]);
  const [learnerId, setLearnerId] = useState('');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('Term One');
  const [card, setCard] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const termCode = term === 'Term One' ? 'term_1' : term === 'Term Two' ? 'term_2' : 'term_3';

  useEffect(() => {
    if (!user) return;
    const seesAll = isHoi(user?.role || '') || user?.role === 'super_admin';
    Promise.all([
      apiClient.get('/academic/streams'),
      seesAll ? Promise.resolve({ data: [] }) : apiClient.get(`/academic/teachers/${user.id}/stream-subjects`).catch(() => ({ data: [] })),
    ]).then(([r, ss]) => {
      const all = r.data || [];
      const assignedIds = new Set<string>((ss.data || []).map((row: any) => String(row.streamId)));
      const mine = all.filter((x: any) => assignedIds.has(String(x.id)) || x.id === user.streamId || x.classTeacherId === user.id);
      const list = seesAll ? all : (mine.length ? mine : all);
      setStreams(list);
      const s = (user.streamId && list.find((x: any) => x.id === user.streamId)) || list[0];
      if (s) setStreamId(s.id);
    });
  }, [user]);

  useEffect(() => {
    if (!streamId) return;
    apiClient.get(`/academic/streams/${streamId}/learners`).then(r => {
      setLearners(r.data); if (r.data[0]) setLearnerId(r.data[0].id);
    }).catch(() => {});
  }, [streamId]);

  useEffect(() => {
    if (!learnerId) return;
    setLoading(true);
    apiClient.get(`/assessment/report-card?learnerId=${learnerId}&term=${encodeURIComponent(term)}`)
      .then(r => setCard(r.data))
      .catch(() => setCard(null))
      .finally(() => setLoading(false));
  }, [learnerId, term]);

  // Manual remark override — replaces the auto-generated CBC-competency-language
  // comment on the printed report card for this exact learner/term/year when set.
  const [showRemarks, setShowRemarks] = useState(false);
  const [remarkForm, setRemarkForm] = useState({ teacherRemark: '', hoiRemark: '' });
  const [loadingRemark, setLoadingRemark] = useState(false);
  const [savingRemark, setSavingRemark] = useState(false);
  const academicYear = '2025/2026';
  const openRemarks = async () => {
    setShowRemarks(true);
    setLoadingRemark(true);
    try {
      const { data } = await apiClient.get(`/pdf/report-card-remarks/${learnerId}`, { params: { term: termCode, academicYear } });
      setRemarkForm({ teacherRemark: data?.teacherRemark || '', hoiRemark: data?.hoiRemark || '' });
    } catch { setRemarkForm({ teacherRemark: '', hoiRemark: '' }); }
    finally { setLoadingRemark(false); }
  };
  const saveRemarks = async () => {
    setSavingRemark(true);
    try {
      await apiClient.post('/pdf/report-card-remarks', { learnerId, term: termCode, academicYear, ...remarkForm });
      toast.success('Saved — the printed report card will use this instead of the auto-generated remark.');
      setShowRemarks(false);
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not save'); }
    finally { setSavingRemark(false); }
  };

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Report Card</h1>
          <p className="text-sm text-theme-muted">Summative result per learning area</p>
        </div>
      </div>

      <div className="card p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-theme-muted">Stream</span>
          <select value={streamId} onChange={e => setStreamId(e.target.value)} className="input py-1.5 text-sm w-auto">
            {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-theme-muted">Learner</span>
          <LearnerSearch value={search} onChange={setSearch} placeholder="Search…" className="w-40 inline-block" />
          <select value={learnerId} onChange={e => setLearnerId(e.target.value)} className="input py-1.5 text-sm w-auto">
            {learners.filter(l=>matchesLearner(l, search)).map(l => <option key={l.id} value={l.id}>{l.firstName} {l.lastName}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-theme-muted">Term</span>
          <select value={term} onChange={e => setTerm(e.target.value)} className="input py-1.5 text-sm w-auto">
            <option>Term One</option><option>Term Two</option><option>Term Three</option>
          </select>
        </div>
        {streamId && (
          <div className="flex items-center gap-2 ml-auto">
            {learnerId && (
              <>
                <button onClick={openRemarks} className="btn-ghost text-sm py-1.5"><Pencil size={13}/> Edit Remarks</button>
                <ReportCardButton
                  learnerId={learnerId}
                  term={termCode}
                  academicYear="2025/2026"
                  learnerName={learners.find(l => l.id === learnerId) ? `${learners.find(l => l.id === learnerId).firstName} ${learners.find(l => l.id === learnerId).lastName}` : ''}
                />
              </>
            )}
            <BulkReportCardsButton streamId={streamId} term={termCode} academicYear="2025/2026" streamName={streams.find(s=>s.id===streamId)?.name}/>
          </div>
        )}
      </div>

      {loading ? <div className="h-64 shimmer rounded-2xl"/> : !card || !card.areas?.length ? (
        <div className="card p-10 text-center text-theme-muted">
          <FileText size={28} className="mx-auto mb-2 opacity-40"/>
          {card?.note || 'No End-Term assessment results for this learner and term yet.'}
        </div>
      ) : (
        <div className="card p-5">
          <div className="flex justify-between items-start mb-4 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <div className="font-bold text-lg text-theme-heading">{card.learner?.firstName} {card.learner?.lastName}</div>
              <div className="text-sm text-theme-muted">{card.learner?.streamName} · {term}</div>
            </div>
            <span className="text-[11px] px-2 py-1 rounded bg-surface-2 text-theme-muted">End-Term Summative</span>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-theme-muted text-left">
                <th className="font-medium pb-2">Learning Area</th>
                {(card.catLabels || []).map((cl: string) => (
                  <th key={cl} className="font-medium pb-2 text-center">{cl}</th>
                ))}
                <th className="font-medium pb-2 text-center">End Term</th>
                <th className="font-medium pb-2 text-center">Level</th>
                <th className="font-medium pb-2">Teacher Comment</th>
              </tr>
            </thead>
            <tbody>
              {card.areas.map((a: any) => (
                <tr key={a.learningArea} style={{ borderTop: '0.5px solid var(--border)' }}>
                  <td className="py-2 pr-2 text-theme">{a.learningArea}</td>
                  {(card.catLabels || []).map((cl: string, i: number) => (
                    <td key={cl} className="py-2 text-center text-theme-muted">
                      {a.cats?.[i]?.score != null ? a.cats[i].score : '—'}
                    </td>
                  ))}
                  <td className="py-2 text-center text-theme font-medium">{a.score != null ? a.score : '—'}</td>
                  <td className="py-2 text-center">
                    {a.level
                      ? <span className={`text-xs font-bold px-2.5 py-1 rounded ${STYLE[a.level] || 'bg-surface-2'}`}>{a.level}</span>
                      : <span className="text-theme-muted">—</span>}
                  </td>
                  <td className="py-2 text-theme-muted text-xs">{a.comment || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Per-learner overall: average % across areas, and (senior) average points */}
          <div className="mt-4 pt-4 flex flex-wrap gap-6 items-center" style={{ borderTop: '1px solid var(--border)' }}>
            <div>
              <div className="text-[11px] text-theme-muted">Average %</div>
              <div className="text-xl font-black text-theme-heading">{card.averagePercent != null ? `${card.averagePercent}%` : '—'}</div>
            </div>
            {card.usePoints && (
              <div>
                <div className="text-[11px] text-theme-muted">Average Points</div>
                <div className="text-xl font-black text-theme-heading">{card.averagePoints != null ? card.averagePoints : '—'}</div>
              </div>
            )}
            {card.usePoints && (
              <div>
                <div className="text-[11px] text-theme-muted">Total Points</div>
                <div className="text-xl font-black text-theme-heading">{card.totalPoints != null ? card.totalPoints : '—'}</div>
              </div>
            )}
            {card.overallLevel && (
              <div>
                <div className="text-[11px] text-theme-muted">Overall Level</div>
                <span className={`text-sm font-bold px-2.5 py-1 rounded ${STYLE[card.overallLevel] || 'bg-surface-2'}`}>{card.overallLevel}</span>
              </div>
            )}
          </div>

          {(card.catLabels || []).length > 0 && (
            <p className="text-[11px] text-theme-muted mt-3">
              CAT scores are shown for reference only. The performance level is determined by the End-Term result.
            </p>
          )}
        </div>
      )}

      {showRemarks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-bold text-theme-heading">Edit Remarks — {term}</h3>
              <button onClick={() => setShowRemarks(false)}><X size={20} className="text-theme-muted"/></button>
            </div>
            {loadingRemark ? (
              <div className="flex justify-center py-10"><Loader2 className="animate-spin text-theme-muted" size={22}/></div>
            ) : (
              <div className="p-5 space-y-4">
                <p className="text-xs text-theme-muted">
                  Leave either box blank to keep using the system's auto-generated CBC-language remark for this learner. Typing something here overrides it on the printed report card, for this term only.
                </p>
                <div>
                  <label className="label">Class Teacher's Remark</label>
                  <textarea value={remarkForm.teacherRemark} onChange={e => setRemarkForm(f => ({ ...f, teacherRemark: e.target.value }))}
                    className="input resize-y" rows={3} placeholder="Leave blank for the auto-generated remark"/>
                </div>
                <div>
                  <label className="label">Head of Institution's Remark</label>
                  <textarea value={remarkForm.hoiRemark} onChange={e => setRemarkForm(f => ({ ...f, hoiRemark: e.target.value }))}
                    className="input resize-y" rows={3} placeholder="Leave blank for the auto-generated remark"/>
                </div>
                <div className="flex gap-3 pt-1 border-t border-theme">
                  <button onClick={() => setShowRemarks(false)} className="btn-ghost flex-1">Cancel</button>
                  <button onClick={saveRemarks} disabled={savingRemark} className="btn-primary flex-1">
                    {savingRemark ? <Loader2 size={14} className="animate-spin"/> : <><Save size={14}/> Save</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
