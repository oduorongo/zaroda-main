// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// LEARNING-AREA NAME CANONICALIZATION
// Shared by every report-card / mark-list renderer so they all pick learning
// areas the SAME way and never treat spelling variants as separate subjects.
// ============================================================

import { DataSource } from 'typeorm';

export const normArea = (x: string) => String(x || '').toLowerCase().replace(/[^a-z]/g, '');
const AREA_STOP = new Set(['and', 'the', 'of', 'a', 'activities', 'studies', 'language']);
const areaTokens = (x: string) => String(x || '').toLowerCase().split(/[^a-z]+/).filter(w => w && !AREA_STOP.has(w));
const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  if (!a || !b) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const cur = [i + 1];
    for (let j = 0; j < b.length; j++) cur.push(Math.min(prev[j + 1] + 1, cur[j] + 1, prev[j] + (a[i] === b[j] ? 0 : 1)));
    prev = cur;
  }
  return prev[b.length];
};

// Tolerant match so variant spellings are treated as the same learning area:
// "Intergrated Science" vs "Integrated Science", "Mathematics" vs "Mathematical
// Activities", "Creative Arts" vs "Creative Activities", "C.R.E" vs "CRE".
export const areaMatch = (a: string, b: string) => {
  const na = normArea(a), nb = normArea(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const ta = areaTokens(a), tb = areaTokens(b);
  for (const w of ta) if (tb.includes(w)) return true;
  for (const wa of ta) for (const wb of tb) if (wa.length >= 6 && wb.length >= 6 && wa.slice(0, 6) === wb.slice(0, 6)) return true;
  return levenshtein(na, nb) <= Math.max(2, Math.round(0.15 * Math.max(na.length, nb.length)));
};

// Indigenous Language is deliberately excluded from marklists and report cards.
export const isIndigenousLanguage = (a: string) => /indigenous|indeg/i.test(a);

// Canonical learning areas for a grade (the "marklist" rubric). Collapses variant
// spellings ("Creative Activities" / "Creative Arts") into one entry, and drops
// Indigenous Language entirely.
export async function getGradeLearningAreas(dataSource: DataSource, gradeLevel: string, tenantId: string): Promise<string[]> {
  const rows = await dataSource.query(
    `SELECT DISTINCT learning_area AS area FROM assessment_templates
      WHERE grade_level = $1 AND (tenant_id IS NULL OR tenant_id::text = $2)
      ORDER BY learning_area`,
    [gradeLevel || '', tenantId],
  ).catch(() => []);
  const raw = rows.map((r: any) => String(r.area).trim()).filter(Boolean).filter((a: string) => !isIndigenousLanguage(a));
  const merged: string[] = [];
  for (const area of raw) {
    if (!merged.some(m => areaMatch(m, area))) merged.push(area);
  }
  return merged;
}

// Resolves a raw subject string (from assessment_results) to its canonical rubric
// area name, so variant spellings collapse into the same report-card row/column.
export function resolveLearningArea(subject: string, canonicalAreas: string[]): string | undefined {
  const exact = canonicalAreas.find(a => a.toLowerCase().trim() === String(subject || '').toLowerCase().trim());
  if (exact) return exact;
  return canonicalAreas.find(a => areaMatch(a, subject));
}
