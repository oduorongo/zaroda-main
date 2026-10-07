'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, ClipboardList, Download, BookOpen } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { levelsFor } from '@/lib/cbc/constants';
import { downloadSheet } from '@/components/cat/CatWorkspace';
import toast from 'react-hot-toast';

const TERMS = [{ v: '', label: 'All terms' }, { v: 'term_1', label: 'Term 1' }, { v: 'term_2', label: 'Term 2' }, { v: 'term_3', label: 'Term 3' }];

export default function ParentCatsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="animate-spin text-theme-muted" size={28}/></div>}>
      <ParentCatsInner/>
    </Suspense>
  );
}

function Level({ code, grade }: { code: string; grade: string }) {
  return <span className="font-bold" style={{ color: levelsFor(grade).find(l => l.code === code)?.color }}>{code}</span>;
}

function ParentCatsInner() {
  const search = useSearchParams();
  const [learnerId, setLearnerId] = useState(search.get('child') || '');
  const [term, setTerm] = useState('');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    apiClient.get('/cats/child', { params: { learnerId: learnerId || undefined, term: term || undefined } })
      .then(r => setData(r.data))
      .catch(e => { setData({ children: [], cats: [] }); toast.error(e?.response?.data?.message || 'Could not load CAT results'); });
  }, [learnerId, term]);

  const chosen = data?.chosen;
  const grade = chosen?.gradeLevel || 'grade_4';
  const download = () => chosen && downloadSheet('/cats/child/sheet', `CAT_report-${chosen.name}${term ? `-${term}` : ''}.pdf`.replace(/[^\w.-]+/g, '_'),
    { params: { learnerId: chosen.id, term: term || undefined }, portrait: true });

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-[#1a2e5a] to-[#243f7a] rounded-2xl p-6 text-white flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0"><ClipboardList size={22} className="text-[#d4af37]"/></div>
        <div>
          <h1 className="text-2xl font-black">CAT Results</h1>
          <p className="text-white/60 text-sm">{chosen ? `${chosen.name} · ${chosen.streamName || ''}` : 'Continuous Assessment Tests'}</p>
        </div>
      </div>

      <div className="card p-4 flex flex-wrap gap-3 items-end">
        {data?.children?.length > 1 && (
          <div>
            <label className="label">Child</label>
            <select value={chosen?.id || ''} onChange={e => setLearnerId(e.target.value)} className="input">
              {data.children.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label">Term</label>
          <select value={term} onChange={e => setTerm(e.target.value)} className="input">
            {TERMS.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        </div>
        {data?.cats?.length > 0 && <button onClick={download} className="btn-primary ml-auto"><Download size={16}/> Download PDF</button>}
      </div>

      {!data ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-theme-muted" size={28}/></div>
      ) : !chosen ? (
        <div className="card p-10 text-center text-theme-muted">No children are linked to your account yet. Please contact the school office.</div>
      ) : !data.cats.length ? (
        <div className="card p-10 text-center text-theme-muted">No CAT marks yet{term ? ' for this term' : ''}.</div>
      ) : (
        <>
          <p className="text-xs text-theme-muted">CATs are short classroom tests that show where {chosen.name.split(' ')[0]} needs practice. They are not part of the report card.</p>
          {data.cats.map((c: any) => (
            <div key={c.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-bold text-theme-heading">{c.subject} — {c.title}</div>
                  <div className="text-xs text-theme-muted">{c.term?.replace('term_', 'Term ')}{c.catDate ? ` · ${c.catDate}` : ''}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-theme-heading">{c.total} / {c.max} <Level code={c.level} grade={grade}/></div>
                  <div className="text-xs text-theme-muted">{c.pct}% · class average {c.classAvgPct}%</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-theme-muted"><th className="p-2">Strand</th><th className="p-2">Marks</th><th className="p-2">Level</th></tr></thead>
                  <tbody>
                    {c.strands.map((s: any) => (
                      <tr key={s.name} className="border-t border-theme">
                        <td className="p-2">{s.name}</td><td className="p-2">{s.got} / {s.max}</td><td className="p-2"><Level code={s.level} grade={grade}/></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {c.practise.length ? (
                <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 flex gap-2">
                  <BookOpen size={16} className="flex-shrink-0 mt-0.5"/>
                  <span><b>Practise at home:</b> {c.practise.join(', ')}</span>
                </div>
              ) : <div className="text-sm text-green-700">Well done — no weak areas in this CAT.</div>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
