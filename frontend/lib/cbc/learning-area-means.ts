// Per-learning-area class means for the bottom of a mark list, so a school can see
// which learning areas are performing best. A column's mean is taken over learners
// who HAVE a mark in it (a missing mark is not a 0 — the learner simply wasn't
// assessed). Positions use competition ranking: equal means share a position.
// Mirrors backend/src/modules/pdf/learning-area-means.ts, used by the printed lists.

export interface AreaMean { mean: number | null; n: number; position: number | null }

export function learningAreaMeans(
  rows: { subjectPct?: Record<string, number> }[],
  subjects: string[],
): Record<string, AreaMean> {
  const out: Record<string, AreaMean> = {};
  for (const s of subjects) {
    const vals = rows.map(r => r.subjectPct?.[s]).filter((v): v is number => v != null && !isNaN(Number(v)));
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
