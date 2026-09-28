// Per-learning-area class means for the bottom of a mark list, so a school can see
// which learning areas are performing best. A column's mean is taken over learners
// who HAVE a mark in it (a missing mark is not a 0 — the learner simply wasn't
// assessed). Positions use competition ranking: equal means share a position.
// Mirrors frontend/lib/cbc/learning-area-means.ts, which the on-screen lists use.

export interface AreaMean { mean: number | null; n: number; position: number | null }

export function learningAreaMeans(
  learners: { marks: Record<string, { pct: number } | undefined> }[],
  subjects: string[],
): Record<string, AreaMean> {
  const out: Record<string, AreaMean> = {};
  for (const s of subjects) {
    const vals = learners.map(L => L.marks[s]?.pct).filter((v): v is number => v != null && !isNaN(Number(v)));
    const mean = vals.length ? Math.round((vals.reduce((a, b) => a + Number(b), 0) / vals.length) * 10) / 10 : null;
    out[s] = { mean, n: vals.length, position: null };
  }
  const means = subjects.map(s => out[s].mean).filter((m): m is number => m != null);
  for (const s of subjects) {
    const m = out[s].mean;
    if (m != null) out[s].position = 1 + means.filter(x => x > m).length;
  }
  return out;
}

// <tfoot> with the learning-area names repeated, a "Mean %" row (mean + its
// performance level) and a "Position" row under each learning-area column, plus a one-line best/weakest summary for below
// the table. leadCols = columns before the first learning area (#, Learner, Adm…);
// trailCols = columns after the last one (Points, Level).
export function learningAreaMeanFooter(
  learners: { marks: Record<string, { pct: number } | undefined> }[],
  subjects: string[],
  leadCols: number,
  trailCols: number,
  level: (pct: number) => string,
  esc: (s: any) => string,
): { tfoot: string; summary: string } {
  const means = learningAreaMeans(learners, subjects);
  const ranked = subjects.filter(s => means[s].mean != null).sort((a, b) => (means[b].mean as number) - (means[a].mean as number));
  if (!ranked.length) return { tfoot: '', summary: '' };

  // Row 1 repeats the learning-area names (styled like the header) so a long list can
  // be read at the bottom without scrolling back up; rows 2–3 are the mean and position.
  const head = 'background:#1a2e5a;color:#fff;font-weight:700';
  const foot = 'background:#e8edf7;font-weight:700';
  const td = (style: string, body: string, span = 1) =>
    `<td${span > 1 ? ` colspan="${span}"` : ''} style="${style}">${body}</td>`;
  const row = (style: string, label: string, cells: string[]) =>
    `<tr>${td(`${style};text-align:right`, label, leadCols)}${cells.join('')}${trailCols ? td(style, '', trailCols) : ''}</tr>`;
  const nameRow = row(head, 'Learning area', subjects.map(s => td(head, esc(s))));
  const meanRow = row(foot, 'Mean %', subjects.map(s => {
    const m = means[s].mean;
    return td(foot, m != null ? `${m}% <span style="font-size:9px">${esc(level(m))}</span>` : '-');
  }));
  const posRow = row(foot, 'Position', subjects.map(s => {
    const p = means[s].position;
    return td(p === 1 ? `${foot};color:#1b7a3a` : foot, p != null ? String(p) : '-');
  }));
  const tfoot = `<tfoot>${nameRow}${meanRow}${posRow}</tfoot>`;

  // Name every area sharing the top (or bottom) mean, so ties aren't hidden.
  const top = means[ranked[0]].mean as number, low = means[ranked[ranked.length - 1]].mean as number;
  const names = (m: number) => ranked.filter(s => means[s].mean === m).map(s => `<b>${esc(s)}</b>`).join(', ');
  const summary = `<div style="text-align:center;margin-top:8px;font-size:11px">`
    + (top === low
      ? `All assessed learning areas have the same mean (${top}%)`
      : `Best performing: ${names(top)} (${top}%) · Lowest: ${names(low)} (${low}%)`)
    + `</div>`;
  return { tfoot, summary };
}
