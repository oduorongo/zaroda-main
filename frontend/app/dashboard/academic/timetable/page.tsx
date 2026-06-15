// app/dashboard/academic/timetable/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { Calendar, Pencil, Check, X, Loader2, UserCheck, Trash2, Wand2, LayoutGrid, Download, Printer } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useAuth, isHoi } from '@/lib/hooks/useAuth';
import { learningAreasFor, learningAreaMatches } from '@/lib/cbc/constants';
import toast from 'react-hot-toast';

const DAYS    = ['Monday','Tuesday','Wednesday','Thursday','Friday'];

const COLORS = ['bg-blue-50 border-blue-200','bg-green-50 border-green-200','bg-purple-50 border-purple-200','bg-amber-50 border-amber-200','bg-red-50 border-red-200','bg-cyan-50 border-cyan-200','bg-pink-50 border-pink-200','bg-indigo-50 border-indigo-200'];

const fmt = (t: string) => t; // times come pre-formatted HH:MM from the backend

export default function TimetablePage() {
  const { user }  = useAuth();
  const [streams,  setStreams]  = useState<any[]>([]);
  const [streamId, setStreamId] = useState('');
  const [timetable,setTimetable]= useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]); // teacher↔subject for this stream
  const [structure, setStructure] = useState<any>(null);     // official KICD period structure
  const [school, setSchool] = useState<any>({ schoolName: '', knecCode: '' });
  const [loading,  setLoading]  = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving,   setSaving]   = useState(false);

  // Cell being edited: { period, day }
  const [editing, setEditing] = useState<{period:string;day:string}|null>(null);

  // CBE calculator
  const [cbeOpen, setCbeOpen]   = useState(false);
  const [cbeType, setCbeType]   = useState<'junior'|'primary'>('junior');
  const [cbeStreams, setCbeStreams] = useState(1);
  const [cbe, setCbe]           = useState<any>(null);
  const [cbeLoading, setCbeLoading] = useState(false);

  const runCbe = async () => {
    setCbeLoading(true);
    try {
      const r = await apiClient.get('/academic/cbe', { params: { schoolType: cbeType, streams: cbeStreams } });
      setCbe(r.data);
    } catch { toast.error('Could not calculate CBE'); }
    finally { setCbeLoading(false); }
  };

  // Auto-generate timetables
  const [showGen, setShowGen]   = useState(false);
  const [genScope, setGenScope] = useState<'all'|'one'>('all');
  const [genLoading, setGenLoading] = useState(false);
  const [genResults, setGenResults] = useState<any[]|null>(null);

  const runGenerate = async () => {
    setGenLoading(true); setGenResults(null);
    try {
      const body = genScope === 'one' && streamId ? { streamIds: [streamId] } : {};
      const r = await apiClient.post('/academic/timetable/auto-generate', body);
      setGenResults(r.data?.results || []);
      toast.success('Timetable generated');
      loadTimetable();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not generate timetable');
    } finally { setGenLoading(false); }
  };

  // Master / block grid (whole school)
  const [masterOpen, setMasterOpen] = useState(false);
  const [masterRows, setMasterRows] = useState<any[]>([]);
  const [masterLoading, setMasterLoading] = useState(false);

  const loadMaster = async () => {
    setMasterLoading(true);
    try {
      const r = await apiClient.get('/academic/timetable/master');
      setMasterRows(r.data?.lessons || []);
    } catch { toast.error('Could not load master grid'); }
    finally { setMasterLoading(false); }
  };

  // Master grid → CSV (stream, day, period, subject, teacher)
  // Print the current stream's timetable, customised with school + class name.
  const esc = (s:any) => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c] as string));
  const printStream = () => {
    const stream = streams.find(s => s.id === streamId);
    const rows = (structure?.periods || []);
    if (!rows.length) { toast.error('Select a class first'); return; }
    const w = window.open('', '_blank');
    if (!w) { toast.error('Allow pop-ups to print'); return; }
    const fixedLabel: Record<string,string> = { break:'Health Break', lunch:'Lunch Break', games:'Games / Co-curricular', ppi:'PPI (Friday only)', assembly:'Assembly / Roll Call', non_formal:'Non-formal', free_choice:'Free Choice' };
    let body = '';
    rows.forEach((p:any) => {
      if (p.type === 'lesson') {
        const label = `Period ${p.period}`;
        body += `<tr><td class="ph">${label}<br><small>${p.startTime}–${p.endTime}</small></td>` +
          DAYS.map(day => {
            const l = grid[label]?.[day];
            return `<td>${l ? `<b>${l.subject}</b>${l.teacherName?`<br><small>${l.teacherName}</small>`:''}` : ''}</td>`;
          }).join('') + `</tr>`;
      } else {
        const lbl = p.label || fixedLabel[p.type] || p.type;
        body += `<tr class="fixed"><td class="ph">${lbl}<br><small>${p.startTime}–${p.endTime}</small></td><td colspan="${DAYS.length}">${lbl}</td></tr>`;
      }
    });
    w.document.write(`<!doctype html><html><head><title>Timetable — ${stream?.name||''}</title><style>
      body{font-family:Arial,sans-serif;padding:24px;color:#1a2e5a}
      h1{margin:0;font-size:16pt} h2{margin:2px 0;font-size:12pt;font-weight:600}
      .meta{color:#666;font-size:10px;margin-bottom:12px}
      table{width:100%;border-collapse:collapse;font-size:10px}
      th,td{border:1px solid #ccc;padding:4px 6px;text-align:center}
      th{background:#1a2e5a;color:#fff} td.ph{text-align:left;font-weight:700;background:#f4f6fb;white-space:nowrap}
      tr.fixed td{background:#f7f7f9;font-style:italic;color:#555}
    </style></head><body>
      <div style="display:flex;align-items:center;gap:14px;border-bottom:3px solid #1a2e5a;padding-bottom:10px;margin-bottom:10px">
        ${school.badgeBase64 ? `<img src="${school.badgeBase64}" alt="badge" style="width:60px;height:60px;object-fit:contain"/>` : ''}
        <div>
          <h1 style="margin:0">${esc(school.schoolName || 'School')}</h1>
          <h2 style="margin:2px 0">Class Timetable — ${esc(stream?.name || '')}</h2>
          <div class="meta">${school.knecCode ? 'KNEC Code: '+esc(school.knecCode)+' · ' : ''}Generated ${new Date().toLocaleDateString('en-KE')}</div>
        </div>
      </div>
      <table><thead><tr><th>Period</th>${DAYS.map(d=>`<th>${d}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
      <div style="margin-top:18px;text-align:center;font-size:9px;color:#888">Powered by ZARODA Solutions · Reliable. Innovative. Forward.</div>
      <script>window.onload=function(){window.print()}</script>
    </body></html>`);
    w.document.close();
  };

  const downloadMaster = () => {
    if (!masterRows.length) return;
    const head = ['Stream','Grade','Day','Period','Subject','Teacher'];
    const esc = (v:any) => `"${String(v ?? '').replace(/"/g,'""')}"`;
    const lines = [head.join(',')];
    masterRows.forEach((r:any) => {
      lines.push([r.streamName, r.gradeLevel, r.day, r.periodLabel, r.subject, r.teacherName || ''].map(esc).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'master-timetable.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Master grid → print (one table per stream)
  const printMaster = () => {
    if (!masterRows.length) return;
    const w = window.open('', '_blank');
    if (!w) { toast.error('Allow pop-ups to print'); return; }
    const byStream: Record<string, any> = {};
    masterRows.forEach((r:any) => {
      if (!byStream[r.streamName]) byStream[r.streamName] = {};
      if (!byStream[r.streamName][r.day]) byStream[r.streamName][r.day] = {};
      byStream[r.streamName][r.day][r.periodLabel] = r;
    });
    const dayList = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
    let html = `<!doctype html><html><head><title>Master Timetable</title><style>
      body{font-family:Arial,sans-serif;padding:20px;color:#1a2e5a}
      h2{margin:18px 0 4px;font-size:13pt} table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:12px}
      th,td{border:1px solid #ccc;padding:3px 5px;text-align:center} th{background:#1a2e5a;color:#fff}
      td.day{text-align:left;font-weight:700;background:#f4f6fb}
    </style></head><body>
      <div style="display:flex;align-items:center;gap:14px;border-bottom:3px solid #1a2e5a;padding-bottom:10px;margin-bottom:10px">
        ${school.badgeBase64 ? `<img src="${school.badgeBase64}" style="width:56px;height:56px;object-fit:contain"/>` : ''}
        <div><h1 style="margin:0">${(school.schoolName||'School')}</h1><h2 style="margin:2px 0">Master Block Timetable</h2></div>
      </div>`;
    Object.keys(byStream).sort().forEach(sn => {
      const periods = Array.from(new Set(masterRows.filter((r:any)=>r.streamName===sn).map((r:any)=>r.periodLabel)))
        .sort((a:any,b:any)=>((parseInt(String(a).replace(/\D/g,''))||0)-(parseInt(String(b).replace(/\D/g,''))||0)));
      html += `<h2>${sn}</h2><table><thead><tr><th>Day</th>${periods.map((p:any)=>`<th>${p}</th>`).join('')}</tr></thead><tbody>`;
      dayList.forEach(day => {
        html += `<tr><td class="day">${day}</td>` + periods.map((p:any)=>{
          const c = byStream[sn][day]?.[p];
          return `<td>${c ? c.subject + (c.teacherName?`<br><small>${c.teacherName}</small>`:'') : '—'}</td>`;
        }).join('') + `</tr>`;
      });
      html += `</tbody></table>`;
    });
    html += `<div style="margin-top:18px;text-align:center;font-size:9px;color:#888">Powered by ZARODA Solutions · Reliable. Innovative. Forward.</div><script>window.onload=function(){window.print()}</script></body></html>`;
    w.document.write(html); w.document.close();
  };

  const canEdit = isHoi(user?.role || '');

  useEffect(() => {
    apiClient.get('/academic/streams').then(r => {
      setStreams(r.data);
      if (user?.streamId) setStreamId(user.streamId);
      else if (r.data.length > 0) setStreamId(r.data[0].id);
    });
    apiClient.get('/schools/settings').then(r => setSchool(r.data || {})).catch(()=>{});
  }, [user]);

  const loadTimetable = () => {
    if (!streamId) return;
    setLoading(true);
    const stream = streams.find(s => s.id === streamId);
    const gradeLevel = stream?.gradeLevel || 'grade_7';
    Promise.all([
      apiClient.get(`/academic/timetable?streamId=${streamId}`).catch(()=>({data:[]})),
      apiClient.get('/academic/teachers').catch(()=>({data:[]})),
      apiClient.get(`/academic/timetable/structure?gradeLevel=${gradeLevel}`).catch(()=>({data:null})),
      apiClient.get(`/assessment/learning-areas?gradeLevel=${gradeLevel}`).catch(()=>({data:[]})),
    ]).then(([tt, teachers, struct, la]) => {
      setTimetable(tt.data);
      setStructure(struct.data);
      // The learning areas that belong to THIS class's grade (authoritative list).
      const classAreas: string[] = (la.data || []).map((x:any)=>x.learningArea).filter(Boolean);
      // Fall back to the KICD band list if the rubric isn't set up for this grade.
      const areaList = classAreas.length ? classAreas : learningAreasFor(gradeLevel);

      // Assignable options = each class learning area, paired with a teacher who
      // teaches it (if any). Subjects NOT offered in this class never appear.
      const opts: any[] = [];
      areaList.forEach((area: string) => {
        // find a teacher who teaches this area (tolerant name match)
        const teacher = (teachers.data || []).find((t: any) =>
          (Array.isArray(t.subjects) ? t.subjects : []).some((s: string) => learningAreaMatches(area, s)));
        opts.push({
          subject: area,
          teacherId:   teacher?.id || null,
          teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : '',
        });
      });
      setAllocations(opts);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { loadTimetable(); }, [streamId, streams]);

  // Official lesson period labels (e.g. "Period 1") + their times, from the doc.
  // Non-lesson rows (break/lunch/assembly) are shown but not editable.
  const lessonPeriods = (structure?.periods || []).filter((p: any) => p.type === 'lesson');
  const PERIODS: string[] = lessonPeriods.map((p: any) => `Period ${p.period}`);
  const periodTime: Record<string, string> = {};
  lessonPeriods.forEach((p: any) => { periodTime[`Period ${p.period}`] = `${p.startTime}–${p.endTime}`; });

  // Full day structure (in order) so the grid also SHOWS breaks, lunch, games & PPI rows.
  // Each row: { kind: 'lesson'|'fixed', label, time, type }
  const STRUCTURE_ROWS = (structure?.periods || []).map((p: any) => {
    const isLesson = p.type === 'lesson';
    const niceType: Record<string,string> = {
      break: 'Health Break', lunch: 'Lunch Break', games: 'Games / Co-curricular',
      ppi: 'PPI', assembly: 'Assembly / Roll Call', non_formal: 'Non-formal', free_choice: 'Free Choice',
    };
    return {
      kind: isLesson ? 'lesson' : 'fixed',
      label: isLesson ? `Period ${p.period}` : (p.label || niceType[p.type] || p.type),
      time: `${p.startTime}–${p.endTime}`,
      type: p.type,
    };
  });

  // Build grid: [period][day] = lesson
  const grid: Record<string, Record<string, any>> = {};
  timetable.forEach((lesson: any) => {
    const p = lesson.periodLabel || lesson.period;
    if (!grid[p]) grid[p] = {};
    grid[p][lesson.day] = lesson;
  });

  // Stable colour per subject
  const subjectColor: Record<string, string> = {};
  let ci = 0;
  timetable.forEach((l:any) => { if (!subjectColor[l.subject]) subjectColor[l.subject] = COLORS[ci++ % COLORS.length]; });

  // Assign an allocation (subject+teacher) to a cell
  const assignCell = async (period: string, day: string, allocation: any) => {
    setSaving(true);
    try {
      await apiClient.post('/academic/timetable', {
        streamId, day, periodLabel: period,
        subject:     allocation.subject,
        teacherId:   allocation.teacherId || allocation.teacher_id,
        teacherName: allocation.teacherName,
      });
      // Optimistic update
      setTimetable(prev => {
        const filtered = prev.filter(l => !((l.periodLabel||l.period)===period && l.day===day));
        return [...filtered, { periodLabel: period, day, subject: allocation.subject, teacherName: allocation.teacherName }];
      });
      toast.success(`${allocation.subject} assigned`);
    } catch { toast.error('Could not save lesson'); }
    finally { setSaving(false); setEditing(null); }
  };

  const clearCell = async (period: string, day: string) => {
    setSaving(true);
    try {
      await apiClient.post('/academic/timetable/clear', { streamId, day, periodLabel: period });
      setTimetable(prev => prev.filter(l => !((l.periodLabel||l.period)===period && l.day===day)));
      toast.success('Lesson cleared');
    } catch { toast.error('Could not clear'); }
    finally { setSaving(false); setEditing(null); }
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-black text-theme-heading">Timetable</h1>
          <p className="text-sm text-theme-muted">
            {school.schoolName ? `${school.schoolName} · ` : ''}{editMode ? 'Tap any period to assign a subject & teacher' : 'KICD CBC weekly schedule'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={streamId} onChange={e => setStreamId(e.target.value)} className="input w-44">
            {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={printStream} className="btn-ghost" title="Print this class timetable"><Printer size={15}/></button>
          {canEdit && (
            <>
              <button onClick={()=>setShowGen(true)} className="btn-ghost" title="Auto-generate KICD timetable">
                <Wand2 size={15}/> Auto-generate
              </button>
              <button onClick={()=>{ setMasterOpen(true); loadMaster(); }} className="btn-ghost" title="Whole-school block timetable">
                <LayoutGrid size={15}/> Master grid
              </button>
              <button onClick={() => setEditMode(!editMode)} className={editMode ? 'btn-primary' : 'btn-ghost'}>
                {editMode ? <><Check size={15}/> Done</> : <><Pencil size={15}/> Edit</>}
              </button>
            </>
          )}
        </div>
      </div>

      {/* KICD structure summary for the selected grade band */}
      {structure && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="font-bold text-theme-heading">KICD structure:</span>
            <span className="text-theme-muted">{structure.lessonsPerWeek} lessons/week</span>
            <span className="text-theme-muted">{structure.lessonDuration} min/lesson</span>
            <span className="text-theme-muted">{lessonPeriods.length} lessons/day</span>
            <span className="text-theme-muted">{structure.allowsDouble ? 'One double lesson allowed (practical)' : 'No double lessons'}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(structure.allocations || []).map((a: any, i: number) => {
              const plotted = timetable.filter((l:any) => (l.subject||'').toLowerCase() === a.name.toLowerCase()).length;
              const ok = plotted === a.lessons;
              return (
                <span key={i} title={`${plotted} of ${a.lessons} plotted`}
                  className={`text-[11px] px-2 py-1 rounded-lg border ${ok ? 'bg-green-500/10 border-green-500/30 text-green-700' : 'bg-surface-2 border-theme text-theme-muted'}`}>
                  {a.name} <strong>{plotted}/{a.lessons}</strong>{a.beforeBreak ? ' ⏱' : ''}
                </span>
              );
            })}
          </div>
          <p className="text-[10px] text-theme-muted mt-2">Targets per learning area follow the KICD lesson-distribution tables. ⏱ = must be plotted before a break.</p>
        </div>
      )}

      {/* Allocation hint */}
      {editMode && (
        <div className="card p-4 bg-surface-2">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck size={15} className="text-theme-heading"/>
            <span className="text-sm font-bold text-theme-heading">Teachers & subjects available to assign</span>
          </div>
          {allocations.length === 0 ? (
            <p className="text-xs text-theme-muted">
              No teachers onboarded yet. Add them under{' '}
              <a href="/dashboard/academic/teachers" className="text-theme-heading font-semibold underline">Teachers</a>{' '}
              with the subjects they teach — they then appear here automatically.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {allocations.map((a:any, i:number) => (
                <span key={i} className="text-xs bg-surface border border-theme rounded-lg px-2 py-1">
                  <strong className="text-theme-heading">{a.subject}</strong>
                  <span className="text-theme-muted"> · {a.teacherName}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? <div className="h-96 shimmer rounded-2xl"/> : (
        <div className="card overflow-auto">
          <table className="w-full text-xs min-w-[760px]">
            <thead>
              <tr className="table-header">
                <th className="px-3 py-3 text-left sticky left-0 bg-[#1a2e5a]">Period</th>
                {DAYS.map(d => <th key={d} className="px-3 py-3 text-center">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {STRUCTURE_ROWS.map((row: any, ri: number) => {
                // Fixed (non-lesson) rows: break, lunch, games, ppi, assembly — span all days.
                if (row.kind !== 'lesson') {
                  const tint: Record<string,string> = {
                    break: 'bg-amber-50 text-amber-700', lunch: 'bg-orange-50 text-orange-700',
                    games: 'bg-green-50 text-green-700', ppi: 'bg-purple-50 text-purple-700',
                    assembly: 'bg-blue-50 text-blue-700', non_formal: 'bg-slate-50 text-slate-600',
                    free_choice: 'bg-slate-50 text-slate-600',
                  };
                  const ppiNote = row.type === 'ppi' ? ' · Friday only' : '';
                  return (
                    <tr key={`fixed-${ri}`} className={`border-b border-theme ${tint[row.type] || 'bg-surface-2'}`}>
                      <td className={`px-3 py-1.5 font-semibold whitespace-nowrap sticky left-0 ${tint[row.type] || 'bg-surface-2'}`}>
                        <div>{row.label}{ppiNote}</div>
                        <div className="text-[9px] font-normal opacity-80">{row.time}</div>
                      </td>
                      <td colSpan={DAYS.length} className="px-3 py-1.5 text-center text-xs italic">
                        {row.label}{ppiNote}
                      </td>
                    </tr>
                  );
                }
                const period = row.label;
                const pi = ri;
                {
                  return (
                  <tr key={period} className={`border-b border-theme ${pi%2===0?'bg-surface':'bg-surface-2'}`}>
                    <td className="px-3 py-2 font-semibold text-theme-muted whitespace-nowrap sticky left-0 bg-inherit">
                      <div>{period}</div>
                      <div className="text-[9px] font-normal text-theme-muted">{row.time}</div>
                    </td>
                    {DAYS.map(day => {
                      const lesson = grid[period]?.[day];
                      const isEditingCell = editing?.period === period && editing?.day === day;

                      return (
                        <td key={day} className="px-2 py-1.5 align-top relative">
                          {/* Existing lesson */}
                          {lesson && !isEditingCell && (
                            <div
                              onClick={() => editMode && setEditing({ period, day })}
                              className={`rounded-lg border px-2 py-1.5 ${subjectColor[lesson.subject] || 'bg-gray-50 border-gray-200'} ${editMode ? 'cursor-pointer hover:ring-1 hover:ring-[#1a2e5a]' : ''}`}>
                              <div className="font-bold text-theme-heading truncate">{lesson.subject}</div>
                              <div className="text-[10px] font-normal text-theme-muted truncate">{lesson.teacherName || '—'}</div>
                            </div>
                          )}

                          {/* Empty cell in edit mode */}
                          {!lesson && !isEditingCell && editMode && (
                            <button onClick={() => setEditing({ period, day })}
                              className="w-full h-10 rounded-lg border border-dashed border-theme text-[#c0c6d8] hover:border-[#1a2e5a] hover:text-theme-heading text-lg leading-none">
                              +
                            </button>
                          )}
                          {!lesson && !isEditingCell && !editMode && <div className="h-6"/>}

                          {/* Assignment picker */}
                          {isEditingCell && (
                            <div className="absolute z-20 top-0 left-0 right-0 bg-surface border border-[#1a2e5a] rounded-lg shadow-modal p-2 min-w-[160px]">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] font-bold text-theme-muted uppercase">Assign</span>
                                <button onClick={() => setEditing(null)}><X size={12} className="text-theme-muted"/></button>
                              </div>
                              <div className="max-h-44 overflow-auto space-y-1">
                                {allocations.length === 0 && <div className="text-[10px] text-theme-muted py-2">No allocations</div>}
                                {allocations.map((a:any, i:number) => (
                                  <button key={i} disabled={saving}
                                    onClick={() => assignCell(period, day, a)}
                                    className="w-full text-left text-[11px] px-2 py-1.5 rounded-md hover:bg-surface-2">
                                    <div className="font-semibold text-theme-heading">{a.subject}</div>
                                    <div className="text-[9px] text-theme-muted">{a.teacherName}</div>
                                  </button>
                                ))}
                              </div>
                              {lesson && (
                                <button onClick={() => clearCell(period, day)}
                                  className="w-full mt-1 text-left text-[11px] px-2 py-1.5 rounded-md text-red-600 hover:bg-red-50 flex items-center gap-1">
                                  <Trash2 size={11}/> Clear this period
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
                }
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Subject legend */}
      {!editMode && timetable.length > 0 && (
        <div className="card p-4">
          <p className="text-xs font-bold text-theme-muted uppercase tracking-wide mb-2">Subjects</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(subjectColor).map(([subj, cls]) => (
              <span key={subj} className={`text-xs px-2 py-1 rounded-lg border ${cls}`}>{subj}</span>
            ))}
          </div>
        </div>
      )}
      {/* Curriculum Based Establishment (CBE) calculator — Section B */}
      {canEdit && (
        <div className="card p-4">
          <button onClick={()=>setCbeOpen(!cbeOpen)} className="flex items-center justify-between w-full">
            <span className="text-sm font-bold text-theme-heading">Curriculum Based Establishment (CBE) Calculator</span>
            <span className="text-xs text-theme-muted">{cbeOpen ? 'Hide' : 'Show'}</span>
          </button>
          {cbeOpen && (
            <div className="mt-4">
              <p className="text-xs text-theme-muted mb-3">
                Estimate the number of teachers your school needs (KICD Section B). Junior school uses the
                27-lesson workload method plus admin shortfalls; primary uses classes + 1 (head teacher).
              </p>
              <div className="flex flex-wrap gap-3 items-end mb-4">
                <div>
                  <label className="label">School Level</label>
                  <select value={cbeType} onChange={e=>{ setCbeType(e.target.value as any); setCbe(null); }} className="input w-44">
                    <option value="junior">Junior School (Grade 7–9)</option>
                    <option value="primary">Primary (Grade 1–6)</option>
                  </select>
                </div>
                <div>
                  <label className="label">Number of Streams</label>
                  <input type="number" min={1} max={12} value={cbeStreams}
                    onChange={e=>{ setCbeStreams(Math.max(1, Math.min(12, Number(e.target.value)||1))); setCbe(null); }}
                    className="input w-28"/>
                </div>
                <button onClick={runCbe} disabled={cbeLoading} className="btn-primary">
                  {cbeLoading ? <><Loader2 size={15} className="animate-spin"/> Calculating…</> : 'Calculate CBE'}
                </button>
              </div>

              {cbe && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-surface-2 rounded-xl p-3 text-center">
                      <div className="text-2xl font-black text-theme-heading">{cbe.totalCbe}</div>
                      <div className="text-[10px] text-theme-muted uppercase tracking-wide">Total CBE (teachers)</div>
                    </div>
                    <div className="bg-surface-2 rounded-xl p-3 text-center">
                      <div className="text-2xl font-black text-theme-heading">{cbe.principal ?? 1}</div>
                      <div className="text-[10px] text-theme-muted uppercase tracking-wide">{cbeType==='junior'?'Principal':'Head Teacher'}</div>
                    </div>
                    <div className="bg-surface-2 rounded-xl p-3 text-center">
                      <div className="text-2xl font-black text-theme-heading">{cbe.deputyPrincipals}</div>
                      <div className="text-[10px] text-theme-muted uppercase tracking-wide">Deputies</div>
                    </div>
                    <div className="bg-surface-2 rounded-xl p-3 text-center">
                      <div className="text-2xl font-black text-theme-heading">{cbe.seniorMasters}</div>
                      <div className="text-[10px] text-theme-muted uppercase tracking-wide">Senior Masters</div>
                    </div>
                  </div>

                  {cbeType==='junior' && (
                    <>
                      <div className="text-xs text-theme-muted flex flex-wrap gap-x-5 gap-y-1">
                        <span>Teachers from lessons: <strong className="text-theme-heading">{cbe.teachersRequired}</strong></span>
                        <span>Shortfall lessons: <strong className="text-theme-heading">{cbe.shortfallLessons}</strong></span>
                        <span>Shortfall teachers: <strong className="text-theme-heading">{cbe.shortfallTeachers}</strong></span>
                        <span>Total weekly lessons: <strong className="text-theme-heading">{cbe.totalLessons}</strong></span>
                      </div>
                      {Array.isArray(cbe.breakdown) && cbe.breakdown.length > 0 && (
                        <div className="overflow-auto">
                          <table className="w-full text-xs">
                            <thead><tr className="table-header">
                              <th className="px-3 py-2 text-left">Learning Area</th>
                              <th className="px-3 py-2 text-center">Lessons/week</th>
                              <th className="px-3 py-2 text-center">Teachers needed</th>
                            </tr></thead>
                            <tbody>
                              {cbe.breakdown.map((b:any,i:number)=>(
                                <tr key={i} className="border-b border-theme">
                                  <td className="px-3 py-1.5">{b.subject}</td>
                                  <td className="px-3 py-1.5 text-center">{b.lessonsPerWeek}</td>
                                  <td className="px-3 py-1.5 text-center">{Number(b.teachersNeeded).toFixed(3)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                  <p className="text-[10px] text-theme-muted">
                    Decimals are rounded up to the next whole teacher, per the guidelines. Figures are an
                    establishment estimate; the official CBE is approved by the SCQASO/TSC.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* Auto-generate modal */}
      {showGen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={()=>!genLoading && setShowGen(false)}>
          <div className="card p-6 max-w-md w-full" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-black text-theme-heading flex items-center gap-2"><Wand2 size={18}/> Auto-generate Timetable</h3>
              <button onClick={()=>!genLoading && setShowGen(false)} className="btn-ghost p-1"><X size={18}/></button>
            </div>
            <p className="text-sm text-theme-muted mb-4">
              Builds a KICD-compliant weekly timetable: correct lessons per learning area, creative/PE before a break,
              one double only for JS practicals, and no teacher double-booked across streams. Existing timetables for the
              selected scope are replaced.
            </p>
            <div className="space-y-2 mb-4">
              <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer ${genScope==='all'?'border-[#1a2e5a] bg-surface-2':'border-theme'}`}>
                <input type="radio" checked={genScope==='all'} onChange={()=>setGenScope('all')}/>
                <span className="text-sm">All streams (whole school)</span>
              </label>
              <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer ${genScope==='one'?'border-[#1a2e5a] bg-surface-2':'border-theme'}`}>
                <input type="radio" checked={genScope==='one'} onChange={()=>setGenScope('one')}/>
                <span className="text-sm">Just this class ({streams.find(s=>s.id===streamId)?.name || '—'})</span>
              </label>
            </div>

            {genResults && (
              <div className="mb-4 max-h-48 overflow-auto space-y-1">
                {genResults.map((r:any,i:number)=>(
                  <div key={i} className="text-xs flex items-center justify-between bg-surface-2 rounded-lg px-2 py-1.5">
                    <span className="font-semibold text-theme-heading">{r.streamName}</span>
                    <span className={r.placed===r.expected ? 'text-green-600' : 'text-amber-600'}>
                      {r.placed}/{r.expected} lessons{r.unplaced?.length ? ` · ${r.unplaced.length} unplaced` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={()=>setShowGen(false)} className="btn-ghost flex-1" disabled={genLoading}>Close</button>
              <button onClick={runGenerate} className="btn-primary flex-1" disabled={genLoading}>
                {genLoading ? <><Loader2 size={15} className="animate-spin"/> Generating…</> : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Master / block grid modal */}
      {masterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={()=>setMasterOpen(false)}>
          <div className="card p-5 max-w-6xl w-full max-h-[90vh] overflow-auto" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-black text-theme-heading flex items-center gap-2"><LayoutGrid size={18}/> Master Block Timetable — Whole School</h3>
              <div className="flex items-center gap-1">
                <button onClick={downloadMaster} disabled={!masterRows.length} className="btn-ghost p-1" title="Download CSV"><Download size={16}/></button>
                <button onClick={printMaster} disabled={!masterRows.length} className="btn-ghost p-1" title="Print"><Printer size={16}/></button>
                <button onClick={()=>setMasterOpen(false)} className="btn-ghost p-1"><X size={18}/></button>
              </div>
            </div>
            {masterLoading ? <div className="h-64 shimmer rounded-2xl"/> : (() => {
              // Group rows by stream, then day → period
              const byStream: Record<string, any> = {};
              masterRows.forEach((r:any)=>{
                if (!byStream[r.streamName]) byStream[r.streamName] = { gradeLevel: r.gradeLevel, days: {} };
                const d = byStream[r.streamName].days;
                if (!d[r.day]) d[r.day] = {};
                d[r.day][r.periodLabel] = r;
              });
              const streamNames = Object.keys(byStream).sort();
              if (!streamNames.length) return <p className="text-sm text-theme-muted py-6 text-center">No timetables yet. Use Auto-generate first.</p>;
              return (
                <div className="space-y-6">
                  {streamNames.map(sn => {
                    const periods = Array.from(new Set(masterRows.filter((r:any)=>r.streamName===sn).map((r:any)=>r.periodLabel)))
                      .sort((a:any,b:any)=>{
                        const na=parseInt(String(a).replace(/\D/g,''))||0, nb=parseInt(String(b).replace(/\D/g,''))||0; return na-nb;
                      });
                    return (
                      <div key={sn}>
                        <div className="font-bold text-theme-heading text-sm mb-1">{sn}</div>
                        <div className="overflow-auto">
                          <table className="w-full text-[11px] min-w-[640px]">
                            <thead><tr className="table-header">
                              <th className="px-2 py-1.5 text-left">Day</th>
                              {periods.map((p:any)=><th key={p} className="px-2 py-1.5 text-center">{p}</th>)}
                            </tr></thead>
                            <tbody>
                              {DAYS.map(day=>(
                                <tr key={day} className="border-b border-theme">
                                  <td className="px-2 py-1.5 font-semibold text-theme-muted">{day}</td>
                                  {periods.map((p:any)=>{
                                    const cell = byStream[sn].days[day]?.[p];
                                    return <td key={p} className="px-2 py-1.5 text-center">
                                      {cell ? <div><div className="font-bold text-theme-heading">{cell.subject}</div>
                                        {cell.teacherName && <div className="text-[9px] text-theme-muted">{cell.teacherName}</div>}</div> : '—'}
                                    </td>;
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
