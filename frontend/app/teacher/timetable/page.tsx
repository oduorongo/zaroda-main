'use client';
import { useState, useEffect } from 'react';
import { Calendar, Printer } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
const COLORS = ['bg-blue-50 border-blue-200','bg-green-50 border-green-200','bg-purple-50 border-purple-200','bg-amber-50 border-amber-200','bg-cyan-50 border-cyan-200','bg-rose-50 border-rose-200'];

const FIXED_TINT: Record<string,string> = {
  break: 'bg-amber-50 text-amber-700', lunch: 'bg-orange-50 text-orange-700',
  games: 'bg-green-50 text-green-700', ppi: 'bg-purple-50 text-purple-700',
  assembly: 'bg-blue-50 text-blue-700', non_formal: 'bg-slate-50 text-slate-600',
  free_choice: 'bg-slate-50 text-slate-600',
};
const FIXED_LABEL: Record<string,string> = {
  break: 'Health Break', lunch: 'Lunch Break', games: 'Games / Co-curricular',
  ppi: 'PPI', assembly: 'Assembly / Roll Call', non_formal: 'Non-formal', free_choice: 'Free Choice',
};

export default function MyTimetable() {
  const { user } = useAuth();
  const [lessons, setLessons] = useState<any[]>([]);
  const [structure, setStructure] = useState<any>(null);
  const [school, setSchool] = useState<any>({ schoolName: '', knecCode: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/schools/settings').then(r => setSchool(r.data || {})).catch(()=>{});
    apiClient.get('/academic/my-timetable')
      .then(async r => {
        const ls = r.data || [];
        setLessons(ls);
        // Pull the official day structure for the teacher's predominant grade band,
        // so the personal timetable shows the same period times, breaks, lunch & games.
        const grade = mostCommon(ls.map((l:any)=>l.gradeLevel).filter(Boolean)) || 'grade_7';
        try {
          const s = await apiClient.get(`/academic/timetable/structure?gradeLevel=${grade}`);
          setStructure(s.data);
        } catch {}
      })
      .catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  const grid: Record<string, Record<string, any>> = {};
  lessons.forEach(l => {
    const p = l.periodLabel || l.period;
    if (!grid[p]) grid[p] = {};
    grid[p][l.day] = l;
  });
  const subjectColor: Record<string,string> = {};
  let ci = 0;
  lessons.forEach(l => { if (!subjectColor[l.subject]) subjectColor[l.subject] = COLORS[ci++ % COLORS.length]; });

  // Build the row list from the official structure (lessons + breaks/lunch/games/ppi).
  // Fall back to the distinct periods the teacher actually has if no structure.
  let rows: { kind:'lesson'|'fixed'; label:string; time?:string; type?:string }[] = [];
  if (structure?.periods?.length) {
    rows = structure.periods.map((p:any) => p.type === 'lesson'
      ? { kind:'lesson', label:`Period ${p.period}`, time:`${p.startTime}–${p.endTime}` }
      : { kind:'fixed', label: p.label || FIXED_LABEL[p.type] || p.type, time:`${p.startTime}–${p.endTime}`, type:p.type });
  } else {
    const labels = Array.from(new Set(lessons.map(l => l.periodLabel))).sort((a:any,b:any)=>(
      (parseInt(String(a).replace(/\D/g,''))||0)-(parseInt(String(b).replace(/\D/g,''))||0)));
    rows = labels.map(l => ({ kind:'lesson', label:l }));
  }

  const teacherName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Teacher';
  const esc = (s:any) => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c] as string));
  const printMine = () => {
    if (!lessons.length) return;
    const w = window.open('', '_blank');
    if (!w) return;
    let body = '';
    rows.forEach(row => {
      if (row.kind === 'fixed') {
        const lbl = row.label + (row.type==='ppi'?' · Friday only':'');
        body += `<tr class="fixed"><td class="ph">${lbl}${row.time?`<br><small>${row.time}</small>`:''}</td><td colspan="${DAYS.length}">${lbl}</td></tr>`;
      } else {
        body += `<tr><td class="ph">${row.label}${row.time?`<br><small>${row.time}</small>`:''}</td>` +
          DAYS.map(day => {
            const l = grid[row.label]?.[day];
            return `<td>${l ? `<b>${esc(l.subject)}</b>${l.streamName?`<br><small>${esc(l.streamName)}</small>`:''}` : ''}</td>`;
          }).join('') + `</tr>`;
      }
    });
    w.document.write(`<!doctype html><html><head><title>My Timetable — ${esc(teacherName)}</title><style>
      body{font-family:Arial,sans-serif;padding:24px;color:#1a2e5a}
      h1{margin:0;font-size:16pt} h2{margin:2px 0;font-size:12pt;font-weight:600}
      .meta{color:#666;font-size:10px;margin-bottom:12px}
      table{width:100%;border-collapse:collapse;font-size:10px}
      th,td{border:1px solid #ccc;padding:4px 6px;text-align:center}
      th{background:#1a2e5a;color:#fff} td.ph{text-align:left;font-weight:700;background:#f4f6fb;white-space:nowrap}
      tr.fixed td{background:#f7f7f9;font-style:italic;color:#555}
    </style></head><body>
      <div style="display:flex;align-items:center;gap:14px;border-bottom:3px solid #1a2e5a;padding-bottom:10px;margin-bottom:10px">
        ${school.badgeBase64 ? `<img src="${school.badgeBase64}" style="width:60px;height:60px;object-fit:contain"/>` : ''}
        <div>
          <h1 style="margin:0">${esc(school.schoolName || 'School')}</h1>
          <h2 style="margin:2px 0">Personal Timetable — ${esc(teacherName)}</h2>
          <div class="meta">${school.knecCode ? 'KNEC Code: '+esc(school.knecCode)+' · ' : ''}Generated ${new Date().toLocaleDateString('en-KE')}</div>
        </div>
      </div>
      <table><thead><tr><th>Period</th>${DAYS.map(d=>`<th>${d}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
      <div style="margin-top:18px;text-align:center;font-size:9px;color:#888">Powered by ZARODA Solutions · Reliable. Innovative. Forward.</div>
      <script>window.onload=function(){window.print()}</script>
    </body></html>`);
    w.document.close();
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">My Timetable</h1>
          <p className="text-sm text-theme-muted">{school.schoolName ? `${school.schoolName} · ` : ''}{teacherName} — from the school block timetable</p>
        </div>
        {lessons.length > 0 && (
          <button onClick={printMine} className="btn-ghost"><Printer size={15}/> Print</button>
        )}
      </div>

      {loading ? <div className="h-96 shimmer rounded-2xl"/>
      : lessons.length === 0 ? (
        <div className="card p-10 text-center">
          <Calendar size={36} className="mx-auto text-theme-muted opacity-40 mb-2"/>
          <p className="text-theme-muted">No lessons scheduled yet</p>
          <p className="text-xs text-theme-muted mt-1">Your administrator builds the timetable — your lessons will appear here</p>
        </div>
      ) : (
        <div className="card overflow-auto">
          <table className="w-full text-xs min-w-[760px]">
            <thead>
              <tr className="table-header">
                <th className="px-3 py-3 text-left sticky left-0 bg-[#1a2e5a]">Period</th>
                {DAYS.map(d => <th key={d} className="px-3 py-3 text-center">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => {
                if (row.kind === 'fixed') {
                  const tint = FIXED_TINT[row.type || ''] || 'bg-surface-2';
                  const ppiNote = row.type === 'ppi' ? ' · Friday only' : '';
                  return (
                    <tr key={`fixed-${ri}`} className={`border-t border-theme ${tint}`}>
                      <td className={`px-3 py-1.5 font-semibold whitespace-nowrap sticky left-0 ${tint}`}>
                        <div>{row.label}{ppiNote}</div>
                        {row.time && <div className="text-[9px] font-normal opacity-80">{row.time}</div>}
                      </td>
                      <td colSpan={DAYS.length} className="px-3 py-1.5 text-center italic">{row.label}{ppiNote}</td>
                    </tr>
                  );
                }
                const period = row.label;
                return (
                  <tr key={period} className="border-t border-theme">
                    <td className="px-3 py-2 font-semibold text-theme-muted whitespace-nowrap sticky left-0 bg-inherit">
                      <div>{period}</div>
                      {row.time && <div className="text-[9px] font-normal text-theme-muted">{row.time}</div>}
                    </td>
                    {DAYS.map(day => {
                      const l = grid[period]?.[day];
                      return (
                        <td key={day} className="px-2 py-1.5 align-top">
                          {l ? (
                            <div className={`rounded-lg border px-2 py-1.5 ${subjectColor[l.subject] || 'bg-gray-50 border-gray-200'}`}>
                              <div className="font-bold text-theme-heading truncate">{l.subject}</div>
                              <div className="text-[10px] font-normal text-theme-muted truncate">{l.streamName || ''}</div>
                            </div>
                          ) : <div className="h-6"/>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function mostCommon(arr: string[]): string | null {
  if (!arr.length) return null;
  const c: Record<string,number> = {};
  arr.forEach(x => { c[x] = (c[x]||0)+1; });
  return Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0];
}
