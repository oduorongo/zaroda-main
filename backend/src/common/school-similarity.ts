import { DataSource } from 'typeorm';

// Catches the same school signing up twice under different KNEC codes, e.g.
// "Starlight Comp Sch" vs "Starlight Primary School". A warning, not a block:
// different schools can genuinely share a name.

const EXPAND: Record<string, string> = {
  sch: 'school', schl: 'school', pri: 'primary', pry: 'primary', prim: 'primary', sec: 'secondary',
  comp: 'comprehensive', compr: 'comprehensive', acad: 'academy', jnr: 'junior', jr: 'junior',
  snr: 'senior', st: 'saint', mt: 'mount',
};
// Level/type words: "Starlight Primary" and "Starlight Comprehensive" are usually the same school
// after the CBC rename. Gender words (girls, boys) are kept — those really are different schools.
const GENERIC = new Set([
  'school', 'schools', 'primary', 'secondary', 'comprehensive', 'academy', 'junior', 'senior', 'high',
  'mixed', 'day', 'boarding', 'and', 'the', 'of', 'centre', 'center', 'educational', 'education',
  'preparatory', 'prep', 'pre', 'kindergarten', 'nursery', 'integrated', 'jss', 'sss', 'ecde',
]);

export function schoolNameCore(name: string): string {
  return String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/['’`]/g, '')
    .split(/[^a-z0-9]+/).filter(Boolean)
    .map(t => EXPAND[t] || t).filter(t => !GENERIC.has(t)).map(t => t.replace(/ight/g, 'ite')).join(' ');
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** 1 = same core name, ~0.9 = typo, 0.8 = one name's words all inside the other's; 0 = unrelated. */
export function schoolNameSimilarity(a: string, b: string): number {
  const x = schoolNameCore(a), y = schoolNameCore(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const ratio = 1 - levenshtein(x, y) / Math.max(x.length, y.length);
  if (ratio >= 0.75 && Math.min(x.length, y.length) >= 5) return ratio;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const st = short.split(' '), lt = new Set(long.split(' '));
  if (st.length >= 2 && short.length >= 8 && st.every(t => lt.has(t))) return 0.8;
  return 0;
}

export interface SimilarSchool { name: string; county: string | null; subCounty: string | null; knecHint: string | null; score: number }

/** Existing school accounts whose name looks like `name`, best and same-county first (max 5). */
export async function findSimilarSchools(ds: DataSource, name: string, opts: { county?: string; excludeTenantId?: string } = {}): Promise<SimilarSchool[]> {
  if (!schoolNameCore(name)) return [];
  const rows = await ds.query(
    `SELECT id::text AS id, name, county, sub_county AS "subCounty", knec_code AS "knecCode"
       FROM tenants WHERE COALESCE(account_type, 'school') <> 'individual' AND name IS NOT NULL`,
  ).catch(() => []);
  const county = String(opts.county || '').toLowerCase().trim();
  return rows
    .filter((r: any) => r.id !== opts.excludeTenantId)
    .map((r: any) => ({ r, score: schoolNameSimilarity(name, r.name) }))
    .filter(({ score }: any) => score > 0)
    .sort((a: any, b: any) => {
      const ca = county && String(a.r.county || '').toLowerCase() === county ? 1 : 0;
      const cb = county && String(b.r.county || '').toLowerCase() === county ? 1 : 0;
      return cb - ca || b.score - a.score;
    })
    .slice(0, 5)
    .map(({ r, score }: any) => ({
      name: r.name, county: r.county || null, subCounty: r.subCounty || null, score: Math.round(score * 100) / 100,
      knecHint: r.knecCode ? `${String(r.knecCode).slice(0, 3)}•••${String(r.knecCode).slice(-2)}` : null,
    }));
}
