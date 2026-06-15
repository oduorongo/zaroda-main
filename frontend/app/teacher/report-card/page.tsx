'use client';
import { useState, useEffect } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { BulkReportCardsButton, ReportCardButton } from '@/components/pdf/pdf-buttons';

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
  const [term, setTerm] = useState('Term One');
  const [card, setCard] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const termCode = term === 'Term One' ? 'term_1' : term === 'Term Two' ? 'term_2' : 'term_3';

  useEffect(() => {
    if (!user) return;
    apiClient.get('/academic/streams').then(r => {
      const mine = (r.data || []).filter((x: any) => x.id === user.streamId || x.classTeacherId === user.id);
      const list = mine.length ? mine : (r.data || []);
      setStreams(list); if (list[0]) setStreamId(list[0].id);
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
          <span className="text-xs text-theme-muted">Class</span>
          <select value={streamId} onChange={e => setStreamId(e.target.value)} className="input py-1.5 text-sm w-auto">
            {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-theme-muted">Learner</span>
          <select value={learnerId} onChange={e => setLearnerId(e.target.value)} className="input py-1.5 text-sm w-auto">
            {learners.map(l => <option key={l.id} value={l.id}>{l.firstName} {l.lastName}</option>)}
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
              <ReportCardButton
                learnerId={learnerId}
                term={termCode}
                academicYear="2025/2026"
                learnerName={learners.find(l => l.id === learnerId) ? `${learners.find(l => l.id === learnerId).firstName} ${learners.find(l => l.id === learnerId).lastName}` : ''}
              />
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
    </div>
  );
}
