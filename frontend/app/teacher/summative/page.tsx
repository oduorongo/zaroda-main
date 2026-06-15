'use client';
import { useState, useEffect } from 'react';
import { Save, Loader2, ClipboardList } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import toast from 'react-hot-toast';

export default function TeacherSummative() {
  const { user } = useAuth();
  const [streams, setStreams] = useState<any[]>([]);
  const [streamId, setStreamId] = useState('');
  const [stream, setStream] = useState<any>(null);
  const [exams, setExams] = useState<any[]>([]);
  const [examId, setExamId] = useState('');
  const [areas, setAreas] = useState<string[]>([]);
  const [learners, setLearners] = useState<any[]>([]);
  const [learnerId, setLearnerId] = useState('');
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    apiClient.get('/academic/streams').then(r => {
      const mine = (r.data || []).filter((x: any) => x.id === user.streamId || x.classTeacherId === user.id);
      const list = mine.length ? mine : (r.data || []);
      setStreams(list); if (list[0]) { setStreamId(list[0].id); setStream(list[0]); }
    });
    apiClient.get('/assessment/exams').then(r => {
      setExams(r.data || []); if (r.data?.[0]) setExamId(r.data[0].id);
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!streamId) return;
    const s = streams.find(x => x.id === streamId); setStream(s);
    apiClient.get(`/academic/streams/${streamId}/learners`).then(r => {
      setLearners(r.data); if (r.data[0]) setLearnerId(r.data[0].id);
    }).catch(() => {});
    if (s?.gradeLevel) {
      apiClient.get(`/assessment/learning-areas?gradeLevel=${s.gradeLevel}`).then(r => {
        setAreas((r.data || []).map((x: any) => x.learningArea));
      }).catch(() => {});
    }
  }, [streamId]);

  useEffect(() => {
    if (!examId || !learnerId) return;
    setLoading(true);
    apiClient.get(`/assessment/summative?examId=${examId}&learnerId=${learnerId}`)
      .then(r => {
        const m: Record<string, string> = {};
        Object.entries(r.data || {}).forEach(([area, v]: any) => { if (v?.score != null) m[area] = String(v.score); });
        setMarks(m);
      })
      .catch(() => setMarks({}))
      .finally(() => setLoading(false));
  }, [examId, learnerId]);

  const save = async () => {
    if (!examId) { toast.error('No exam selected'); return; }
    setSaving(true);
    try {
      for (const [area, score] of Object.entries(marks)) {
        if (score === '') continue;
        await apiClient.post('/assessment/summative', {
          examId, learnerId, streamId, gradeLevel: stream?.gradeLevel,
          learningArea: area, score: Number(score), maxScore: 100,
        });
      }
      toast.success('Summative scores saved');
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not save'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Summative Scores</h1>
          <p className="text-sm text-theme-muted">Enter CAT / End-Term marks per learning area</p>
        </div>
      </div>

      {exams.length === 0 ? (
        <div className="card p-10 text-center text-theme-muted">
          <ClipboardList size={28} className="mx-auto mb-2 opacity-40"/>
          No assessment events yet. The administrator must create a CAT or End-Term exam first.
        </div>
      ) : (
        <>
          <div className="card p-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-theme-muted">Exam</span>
              <select value={examId} onChange={e => setExamId(e.target.value)} className="input py-1.5 text-sm w-auto">
                {exams.map(x => <option key={x.id} value={x.id}>{x.name} ({x.examType})</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-theme-muted">Class</span>
              <select value={streamId} onChange={e => setStreamId(e.target.value)} className="input py-1.5 text-sm w-auto">
                {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="ml-auto">
              <select value={learnerId} onChange={e => setLearnerId(e.target.value)}
                className="bg-[#E6F1FB] text-[#0C447C] font-semibold rounded-lg px-3 py-1.5 text-sm border-0">
                {learners.map(l => <option key={l.id} value={l.id}>{l.firstName} {l.lastName}</option>)}
              </select>
            </div>
          </div>

          {loading ? <div className="h-48 shimmer rounded-2xl"/> : (
            <div className="card p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-theme-muted text-left">
                    <th className="font-medium pb-2">Learning Area</th>
                    <th className="font-medium pb-2 text-center">Score (/100)</th>
                  </tr>
                </thead>
                <tbody>
                  {areas.map(a => (
                    <tr key={a} style={{ borderTop: '0.5px solid var(--border)' }}>
                      <td className="py-2 text-theme">{a}</td>
                      <td className="py-2 text-center">
                        <input type="number" min={0} max={100} value={marks[a] ?? ''}
                          onChange={e => setMarks(m => ({ ...m, [a]: e.target.value }))}
                          className="w-20 text-center px-2 py-1 bg-surface-2 rounded-md focus:outline-none focus:ring-1 focus:ring-[#1a2e5a]"
                          style={{ border: '0.5px solid var(--border)' }} placeholder="—"/>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? <><Loader2 size={16} className="animate-spin"/> Saving…</> : <><Save size={16}/> Save scores</>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
