'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Printer, Save, Pencil, X, Download } from 'lucide-react';
import apiClient from '@/lib/api/client';
import toast from 'react-hot-toast';

/**
 * KJSEA (Grade 9 national exam) mark list and analysis. The admin enters only each candidate's points (1-8) per
 * subject code; totals, percentages, performance levels, ranks, subject means and the level and gender breakdowns
 * are all worked out here from those points. Teachers see the same page read-only.
 */

type Subject = { code: string; name: string };
type Row = { id: string; name: string; admissionNumber: string; gender: string; stream: string | null; points: Record<string, number> };

const RE_CODES = ['908', '909', '910'];
/** Short subject names shown under each code, for staff still learning the KJSEA codes. */
const ABBR: Record<string, string> = {
  '901': 'ENG', '902': 'KIS', '903': 'MAT', '905': 'ISC', '906': 'AGR', '907': 'SST',
  '908': 'CRE', '909': 'IRE', '910': 'HRE', '911': 'CAS', '912': 'PTS',
};
/** A column heading: the code, with its abbreviation underneath. */
function CodeHead({ code, abbr }: { code: string; abbr: string }) {
  return (<><div>{code}</div><div className="text-[10px] font-medium text-theme-muted leading-tight">{abbr}</div></>);
}
/** KJSEA points and their performance levels. */
const LEVELS = [
  { pts: 8, code: 'EE1' }, { pts: 7, code: 'EE2' }, { pts: 6, code: 'ME1' }, { pts: 5, code: 'ME2' },
  { pts: 4, code: 'AE1' }, { pts: 3, code: 'AE2' }, { pts: 2, code: 'BE1' }, { pts: 1, code: 'BE2' },
];
/** Overall performance level (1-8) from the percentage, on KNEC's 8-level bands. */
const plFromPercent = (p: number) => p >= 90 ? 8 : p >= 75 ? 7 : p >= 58 ? 6 : p >= 41 ? 5 : p >= 31 ? 4 : p >= 21 ? 3 : p >= 11 ? 2 : p > 0 ? 1 : 0;
const isBoy = (g: string) => ['male', 'm', 'boy'].includes(String(g || '').toLowerCase());
const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) return resolve();
  const s = document.createElement('script');
  s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error('PDF tools could not load'));
  document.head.appendChild(s);
});
const fmt = (n: number | null, d = 2) => n === null || Number.isNaN(n) ? '—' : n.toFixed(d).replace(/\.?0+$/, '');

export default function KjseaAnalysis() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<{ canEdit: boolean; subjects: Subject[]; learners: Row[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, Record<string, number | ''>>>({});
  const [reCode, setReCode] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  /**
   * A real PDF file of the analysis. Only the sections marked data-pdf-section are drawn, so nothing from
   * the app around the page (menu, header, subscription notice) can end up in it. Each section is rendered
   * in the light theme, kept whole where it fits, and long tables are split between rows.
   */
  const downloadPdf = async () => {
    const root = reportRef.current;
    if (!root) return;
    setPdfBusy(true);
    const toastId = toast.loading('Preparing PDF…');
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      const html2canvas = (window as any).html2canvas;
      const JsPDF = (window as any).jspdf?.jsPDF;
      if (!html2canvas || !JsPDF) throw new Error('PDF tools could not load');

      const pdf = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth(), pageH = pdf.internal.pageSize.getHeight(), M = 24;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14);
      pdf.text(`KJSEA ${year} RESULTS ANALYSIS`, pageW / 2, M + 10, { align: 'center' });
      let y = M + 26;
      const SCALE = 2;

      for (const sec of Array.from(root.querySelectorAll<HTMLElement>('[data-pdf-section]'))) {
        const width = Math.max(sec.scrollWidth, sec.offsetWidth);
        const canvas: HTMLCanvasElement = await html2canvas(sec, {
          scale: SCALE, backgroundColor: '#ffffff', useCORS: true, width, windowWidth: Math.max(1280, width + 64),
          ignoreElements: (el: Element) => el.hasAttribute?.('data-pdf-ignore'),
          onclone: (doc: Document, el: HTMLElement) => {
            doc.documentElement.classList.remove('dark');      // always print light
            el.style.overflow = 'visible'; el.style.width = `${width}px`; el.style.boxShadow = 'none';
          },
        });
        // Where rows start (canvas pixels), so a long table is split between rows, never through one.
        const top = sec.getBoundingClientRect().top;
        const cuts = Array.from(sec.querySelectorAll('tr')).map(tr => (tr.getBoundingClientRect().top - top) * SCALE);
        const fit = Math.min(1, (pageW - 2 * M) / (canvas.width / SCALE * 0.75));
        const ptPerPx = (0.75 / SCALE) * fit;                 // canvas px -> PDF points
        const fullH = canvas.height * ptPerPx;
        if (y + fullH > pageH - M && y > M + 30) { pdf.addPage(); y = M; }

        let start = 0;
        while (start < canvas.height - 1) {
          const room = (pageH - M - y) / ptPerPx;
          let end = Math.min(canvas.height, start + room);
          if (end < canvas.height) {
            const row = cuts.filter(c => c > start + 40 && c <= end).pop();
            if (row) end = row;
          }
          const slice = document.createElement('canvas');
          slice.width = canvas.width; slice.height = Math.ceil(end - start);
          slice.getContext('2d')!.drawImage(canvas, 0, start, canvas.width, end - start, 0, 0, canvas.width, end - start);
          pdf.addImage(slice.toDataURL('image/png'), 'PNG', M, y, canvas.width * ptPerPx, (end - start) * ptPerPx);
          y += (end - start) * ptPerPx + 12;
          start = end;
          if (start < canvas.height - 1) { pdf.addPage(); y = M; }
        }
      }
      pdf.save(`KJSEA-${year}-results-analysis.pdf`);
      toast.success('PDF downloaded', { id: toastId });
    } catch (e: any) {
      toast.error(`${e?.message || 'Could not make the PDF'}. Use Print and choose "Save as PDF" instead.`, { id: toastId });
    } finally { setPdfBusy(false); }
  };

  const load = () => {
    setLoading(true);
    apiClient.get('/academic/kjsea', { params: { year } })
      .then(r => { setData(r.data); setEditing(false); })
      .catch((e: any) => { setData(null); toast.error(e?.response?.data?.message || 'Could not load KJSEA results'); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [year]);

  const learners: Row[] = data?.learners || [];
  const subjects: Subject[] = data?.subjects || [];

  // Columns: one per subject code; the three RE papers share a column, as each candidate sits one of them.
  const reInUse = useMemo(() => {
    const used = RE_CODES.filter(c => learners.some(l => l.points?.[c] != null));
    return used.length ? used : ['908'];
  }, [learners]);
  const columns = useMemo(() => {
    const out: { key: string; label: string; abbr: string; name: string }[] = [];
    for (const s of subjects) {
      if (RE_CODES.includes(s.code)) {
        if (s.code === '908') out.push({ key: 'RE', label: reInUse.join('/'), abbr: reInUse.map(c => ABBR[c]).join('/'), name: reInUse.map(c => subjects.find(x => x.code === c)?.name).join('/') });
        continue;
      }
      out.push({ key: s.code, label: s.code, abbr: ABBR[s.code] || '', name: s.name });
    }
    return out;
  }, [subjects, reInUse]);

  /** A learner's RE paper: the one they have points in, else what the admin picked, else 908. */
  const reOf = (l: Row) => reCode[l.id] || RE_CODES.find(c => l.points?.[c] != null) || '908';

  const startEdit = () => {
    setDraft(Object.fromEntries(learners.map(l => [l.id, { ...l.points }])));
    setReCode(Object.fromEntries(learners.map(l => [l.id, RE_CODES.find(c => l.points?.[c] != null) || '908'])));
    setEditing(true);
  };

  // The points everything is worked out from: the draft while editing, so the analysis updates as points are typed.
  const pointsOf = (l: Row): Record<string, number> => {
    const src = editing ? draft[l.id] || {} : l.points || {};
    const out: Record<string, number> = {};
    for (const [c, v] of Object.entries(src)) if (v !== '' && v != null && Number(v) >= 1 && Number(v) <= 8) out[c] = Number(v);
    return out;
  };

  const results = useMemo(() => {
    const rows = learners.map(l => {
      const pts = pointsOf(l);
      const vals = Object.values(pts);
      const total = vals.reduce((a, b) => a + b, 0);
      const pct = vals.length ? (total / (vals.length * 8)) * 100 : null;
      return {
        l, pts, total, count: vals.length, pct,
        mean: vals.length ? total / vals.length : null,
        pl: pct === null ? null : plFromPercent(pct),
      };
    });
    // Rank by total, ties sharing a position; learners without points are listed last, unranked.
    const sorted = [...rows].sort((a, b) => (b.count ? b.total : -1) - (a.count ? a.total : -1) || a.l.name.localeCompare(b.l.name));
    let last = -1, rank = 0;
    return sorted.map((r, i) => {
      if (!r.count) return { ...r, rank: null as number | null };
      if (r.total !== last) { rank = i + 1; last = r.total; }
      return { ...r, rank };
    });
  }, [learners, draft, editing]);

  const sat = results.filter(r => r.count > 0);
  const subjectCodesInUse = subjects.filter(s => !RE_CODES.includes(s.code) || reInUse.includes(s.code)).map(s => s.code);
  const nameOf = (code: string) => subjects.find(s => s.code === code)?.name || code;

  const subjectStats = useMemo(() => subjectCodesInUse.map(code => {
    const got = sat.map(r => ({ p: r.pts[code], boy: isBoy(r.l.gender) })).filter(x => x.p != null);
    const mean = got.length ? got.reduce((a, b) => a + b.p, 0) / got.length : null;
    const byLevel = LEVELS.map(lv => {
      const at = got.filter(g => g.p === lv.pts);
      return { ...lv, boys: at.filter(g => g.boy).length, girls: at.filter(g => !g.boy).length, total: at.length };
    });
    return { code, mean, entries: got.length, boys: got.filter(g => g.boy).length, girls: got.filter(g => !g.boy).length, byLevel };
  }), [sat, subjectCodesInUse.join()]);

  const schoolMean = sat.length ? sat.reduce((a, r) => a + (r.mean || 0), 0) / sat.length : null;
  const schoolPct = sat.length ? sat.reduce((a, r) => a + (r.pct || 0), 0) / sat.length : null;
  const plByGender = LEVELS.map(lv => {
    const at = sat.filter(r => r.pl === lv.pts);
    return { ...lv, boys: at.filter(r => isBoy(r.l.gender)).length, girls: at.filter(r => !isBoy(r.l.gender)).length, total: at.length };
  });
  const boysSat = sat.filter(r => isBoy(r.l.gender));
  const girlsSat = sat.filter(r => !isBoy(r.l.gender));
  const avg = (rs: typeof sat) => rs.length ? rs.reduce((a, r) => a + (r.mean || 0), 0) / rs.length : null;

  const setPoint = (id: string, code: string, v: string) => {
    const n = v.replace(/[^0-9]/g, '').slice(0, 1);
    if (n && (Number(n) < 1 || Number(n) > 8)) return;
    setDraft(d => ({ ...d, [id]: { ...(d[id] || {}), [code]: n === '' ? '' : Number(n) } }));
  };
  const setRe = (id: string, code: string) => {
    setReCode(c => ({ ...c, [id]: code }));
    // Move the RE points to the chosen paper so a learner never has two.
    setDraft(d => {
      const cur = { ...(d[id] || {}) };
      const val = RE_CODES.map(c => cur[c]).find(v => v !== '' && v != null) ?? '';
      RE_CODES.forEach(c => delete cur[c]);
      if (val !== '') cur[code] = val;
      return { ...d, [id]: cur };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const rows = learners.map(l => {
        const pts: Record<string, number | null> = {};
        for (const [c, v] of Object.entries(draft[l.id] || {})) pts[c] = v === '' ? null : Number(v);
        return { learnerId: l.id, points: pts };
      });
      await apiClient.put('/academic/kjsea', { year, rows });
      toast.success('KJSEA points saved');
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not save');
    } finally { setSaving(false); }
  };

  const cellValue = (r: typeof results[number], key: string) => key === 'RE' ? RE_CODES.map(c => r.pts[c]).find(v => v != null) : r.pts[key];
  const th = 'px-2 py-1.5 text-left font-semibold text-theme-heading whitespace-nowrap';
  const td = 'px-2 py-1.5 whitespace-nowrap';

  return (
    <div className="space-y-6 kjsea-print" ref={reportRef}>
      <div className="page-header print:hidden">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">KJSEA {year} Results Analysis</h1>
          <p className="text-sm text-theme-muted mt-0.5">
            Grade 9 candidates are picked automatically. {data?.canEdit ? 'Enter each candidate’s points (1–8) per subject code; everything else is calculated.' : 'Points are entered by the school administration.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input py-1.5" value={year} onChange={e => setYear(Number(e.target.value))} disabled={editing}>
            {[thisYear, thisYear - 1, thisYear - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {!editing && learners.length > 0 && (
            <button className="btn-ghost" disabled={pdfBusy} onClick={downloadPdf}>
              {pdfBusy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Download PDF
            </button>
          )}
          {!editing && <button className="btn-ghost" onClick={() => window.print()}><Printer size={16} /> Print</button>}
          {data?.canEdit && !editing && learners.length > 0 && <button className="btn-primary" onClick={startEdit}><Pencil size={16} /> Enter points</button>}
          {editing && (
            <>
              <button className="btn-ghost" disabled={saving} onClick={() => setEditing(false)}><X size={16} /> Cancel</button>
              <button className="btn-primary" disabled={saving} onClick={save}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save</button>
            </>
          )}
        </div>
      </div>
      <h1 className="hidden print:block text-xl font-black text-center">KJSEA {year} RESULTS ANALYSIS</h1>

      {loading ? (
        <div className="card p-8 flex justify-center"><Loader2 className="animate-spin text-theme-muted" /></div>
      ) : !learners.length ? (
        <div className="card p-8 text-center text-theme-muted">No Grade 9 learners found for {year}.</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-pdf-section>
            {[
              ['Candidates', `${sat.length}${sat.length !== learners.length ? ` of ${learners.length}` : ''}`],
              ['School mean', schoolMean === null ? '—' : `${fmt(schoolMean, 4)} / 8`],
              ['School %', schoolPct === null ? '—' : `${fmt(schoolPct)}%`],
              ['Boys / Girls mean', `${fmt(avg(boysSat))} / ${fmt(avg(girlsSat))}`],
            ].map(([k, v]) => (
              <div key={k} className="card p-4">
                <div className="text-xs text-theme-muted">{k}</div>
                <div className="text-lg font-bold text-theme-heading">{v}</div>
              </div>
            ))}
          </div>

          {/* Mark list */}
          <div className="card p-0 overflow-x-auto" data-pdf-section>
            <table className="w-full text-sm">
              <thead className="bg-surface-2">
                <tr>
                  <th className={th}>#</th><th className={th}>Candidate</th><th className={th}>Adm</th><th className={th}>G</th>
                  {columns.map(c => <th key={c.key} className={`${th} text-center`} title={c.name}><CodeHead code={c.label} abbr={c.abbr} /></th>)}
                  <th className={`${th} text-center`}>/72</th><th className={`${th} text-center`}>%</th>
                  <th className={`${th} text-center`}>PL</th><th className={`${th} text-center`}>/8</th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.l.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className={td}>{r.rank ?? '—'}</td>
                    <td className={`${td} font-medium text-theme-heading`}>{r.l.name}</td>
                    <td className={`${td} text-theme-muted`}>{r.l.admissionNumber}</td>
                    <td className={td}>{isBoy(r.l.gender) ? 'B' : 'G'}</td>
                    {columns.map(c => (
                      <td key={c.key} className={`${td} text-center`}>
                        {editing ? (
                          <div className="flex items-center justify-center gap-1">
                            {c.key === 'RE' && (
                              <select className="input py-0.5 px-1 text-xs w-[4.5rem]" value={reOf(r.l)} onChange={e => setRe(r.l.id, e.target.value)}>
                                {RE_CODES.map(rc => <option key={rc} value={rc}>{rc}</option>)}
                              </select>
                            )}
                            <input
                              inputMode="numeric" className="input w-10 py-0.5 px-1 text-center"
                              value={(draft[r.l.id] || {})[c.key === 'RE' ? reOf(r.l) : c.key] ?? ''}
                              onChange={e => setPoint(r.l.id, c.key === 'RE' ? reOf(r.l) : c.key, e.target.value)}
                            />
                          </div>
                        ) : (
                          <>
                            {cellValue(r, c.key) ?? ''}
                            {c.key === 'RE' && reInUse.length > 1 && cellValue(r, c.key) != null && (
                              <sup className="ml-0.5 text-[10px] text-theme-muted">{RE_CODES.find(rc => r.pts[rc] != null)}</sup>
                            )}
                          </>
                        )}
                      </td>
                    ))}
                    <td className={`${td} text-center font-semibold`}>{r.count ? r.total : '—'}{r.count && r.count < 9 ? <span className="text-amber-600" title={`${r.count} of 9 subjects entered`}>*</span> : null}</td>
                    <td className={`${td} text-center`}>{fmt(r.pct)}</td>
                    <td className={`${td} text-center`}>{r.pl ?? '—'}</td>
                    <td className={`${td} text-center`}>{fmt(r.mean, 4)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-surface-2 font-semibold">
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <td className={td} colSpan={4}>Learning area mean</td>
                  {columns.map(c => {
                    const codes = c.key === 'RE' ? reInUse : [c.key];
                    const vals = sat.flatMap(r => codes.map(k => r.pts[k]).filter(v => v != null));
                    return <td key={c.key} className={`${td} text-center`}>{vals.length ? fmt(vals.reduce((a, b) => a + b, 0) / vals.length, 4) : '—'}</td>;
                  })}
                  <td className={`${td} text-center`}>{sat.length ? fmt(sat.reduce((a, r) => a + r.total, 0) / sat.length) : '—'}</td>
                  <td className={`${td} text-center`}>{fmt(schoolPct)}</td>
                  <td className={td}></td>
                  <td className={`${td} text-center`}>{fmt(schoolMean, 4)}</td>
                </tr>
                {/* Subject names under the totals, as on the KJSEA analysis sheet. */}
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <td className={`${td} text-xs text-theme-muted`} colSpan={4}>Subject</td>
                  {columns.map(c => (
                    <td key={c.key} className="px-1 py-1.5 text-center text-[11px] font-medium leading-tight text-theme-heading whitespace-normal min-w-[3.5rem]">{c.name}</td>
                  ))}
                  <td className="px-1 py-1.5 text-center text-[11px] font-medium text-theme-heading">Total</td>
                  <td className="px-1 py-1.5 text-center text-[11px] font-medium text-theme-heading">School %</td>
                  <td className={td}></td>
                  <td className="px-1 py-1.5 text-center text-[11px] font-medium text-theme-heading">School mean</td>
                </tr>
              </tfoot>
            </table>
            {results.some(r => r.count && r.count < 9) && (
              <p className="px-3 py-2 text-xs text-theme-muted">* Not all 9 subjects entered yet: % and mean use the subjects entered so far.</p>
            )}
          </div>

          {/* Learning areas ranked by mean */}
          <div className="card p-5" data-pdf-section>
            <h2 className="text-sm font-semibold text-theme-heading mb-3">Learning areas by mean</h2>
            <div className="space-y-1.5">
              {[...subjectStats].filter(s => s.entries).sort((a, b) => (b.mean || 0) - (a.mean || 0)).map((s, i) => (
                <div key={s.code} className="flex items-center gap-3 text-sm">
                  <span className="w-5 text-theme-muted">{i + 1}</span>
                  <span className="w-20 font-semibold text-theme-heading">{s.code} <span className="text-xs font-medium text-theme-muted">{ABBR[s.code]}</span></span>
                  <span className="w-44 truncate text-theme-muted hidden sm:inline">{nameOf(s.code)}</span>
                  <div className="flex-1 h-2.5 rounded bg-surface-2 overflow-hidden"><div className="h-full rounded bg-[#1a2e5a]" style={{ width: `${((s.mean || 0) / 8) * 100}%` }} /></div>
                  <span className="w-16 text-right font-semibold">{fmt(s.mean, 4)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Level distribution per learning area */}
          <div className="card p-0 overflow-x-auto" data-pdf-section>
            <h2 className="text-sm font-semibold text-theme-heading px-4 pt-4 pb-2">Level distribution per learning area</h2>
            <table className="w-full text-sm">
              <thead className="bg-surface-2">
                <tr><th className={th}>Level</th><th className={`${th} text-center`}>Pts</th>{subjectStats.map(s => <th key={s.code} className={`${th} text-center`} title={nameOf(s.code)}><CodeHead code={s.code} abbr={ABBR[s.code] || ''} /></th>)}</tr>
              </thead>
              <tbody>
                {LEVELS.map(lv => (
                  <tr key={lv.pts} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className={`${td} font-medium`}>{lv.code}</td><td className={`${td} text-center`}>{lv.pts}</td>
                    {subjectStats.map(s => <td key={s.code} className={`${td} text-center`}>{s.byLevel.find(b => b.pts === lv.pts)?.total || 0}</td>)}
                  </tr>
                ))}
                <tr className="font-semibold" style={{ borderTop: '1px solid var(--border)' }}>
                  <td className={td} colSpan={2}>Entries</td>{subjectStats.map(s => <td key={s.code} className={`${td} text-center`}>{s.entries}</td>)}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Overall performance level by gender */}
          <div className="card p-0 overflow-x-auto" data-pdf-section>
            <h2 className="text-sm font-semibold text-theme-heading px-4 pt-4 pb-2">Overall performance level by gender</h2>
            <table className="w-full text-sm sm:max-w-md">
              <thead className="bg-surface-2"><tr><th className={th}>Level</th><th className={`${th} text-center`}>Boys</th><th className={`${th} text-center`}>Girls</th><th className={`${th} text-center`}>Total</th></tr></thead>
              <tbody>
                {plByGender.map(lv => (
                  <tr key={lv.pts} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className={`${td} font-medium`}>{lv.code}</td>
                    <td className={`${td} text-center`}>{lv.boys}</td><td className={`${td} text-center`}>{lv.girls}</td><td className={`${td} text-center font-semibold`}>{lv.total}</td>
                  </tr>
                ))}
                <tr className="font-semibold" style={{ borderTop: '1px solid var(--border)' }}>
                  <td className={td}>Total</td><td className={`${td} text-center`}>{boysSat.length}</td><td className={`${td} text-center`}>{girlsSat.length}</td><td className={`${td} text-center`}>{sat.length}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Levels per gender per learning area */}
          <div className="card p-0 overflow-x-auto" data-pdf-section>
            <h2 className="text-sm font-semibold text-theme-heading px-4 pt-4 pb-2">Levels by gender per learning area</h2>
            <table className="w-full text-sm">
              <thead className="bg-surface-2">
                <tr>
                  <th className={th} rowSpan={2}>Level</th>
                  {subjectStats.map(s => <th key={s.code} className={`${th} text-center`} colSpan={3} title={nameOf(s.code)} style={{ borderLeft: '1px solid var(--border)' }}><CodeHead code={s.code} abbr={ABBR[s.code] || ''} /></th>)}
                </tr>
                <tr>
                  {subjectStats.map(s => (
                    <Fragment key={s.code}>
                      <th className={`${th} text-center text-xs`} style={{ borderLeft: '1px solid var(--border)' }}>B</th>
                      <th className={`${th} text-center text-xs`}>G</th>
                      <th className={`${th} text-center text-xs`}>T</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LEVELS.map(lv => (
                  <tr key={lv.pts} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className={`${td} font-medium`}>{lv.code}</td>
                    {subjectStats.map(s => {
                      const b = s.byLevel.find(x => x.pts === lv.pts)!;
                      return (
                        <Fragment key={s.code}>
                          <td className={`${td} text-center`} style={{ borderLeft: '1px solid var(--border)' }}>{b.boys}</td>
                          <td className={`${td} text-center`}>{b.girls}</td>
                          <td className={`${td} text-center font-semibold`}>{b.total}</td>
                        </Fragment>
                      );
                    })}
                  </tr>
                ))}
                <tr className="font-semibold" style={{ borderTop: '1px solid var(--border)' }}>
                  <td className={td}>Total</td>
                  {subjectStats.map(s => (
                    <Fragment key={s.code}>
                      <td className={`${td} text-center`} style={{ borderLeft: '1px solid var(--border)' }}>{s.boys}</td>
                      <td className={`${td} text-center`}>{s.girls}</td>
                      <td className={`${td} text-center`}>{s.entries}</td>
                    </Fragment>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-1 bg-surface py-1" data-pdf-section>
            <p className="text-xs text-theme-muted">
              Subjects: {subjects.map(s => `${s.code} ${ABBR[s.code] || ''} = ${s.name}`).join(' · ')}.
            </p>
            <p className="text-xs text-theme-muted">
              Levels: {LEVELS.map(l => `${l.code} = ${l.pts}`).join(' · ')}. Overall PL from the percentage: 90+ = 8, 75–89 = 7, 58–74 = 6, 41–57 = 5, 31–40 = 4, 21–30 = 3, 11–20 = 2, below = 1.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
