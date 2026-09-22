import { DataSource } from 'typeorm';

/**
 * The fee structure rendered as a bare <table>, with no document around it.
 *
 * Shared because it is printed in two places — on its own from Finance, and as
 * the second page of an end-of-year report card — and a parent comparing the
 * two must not find them disagreeing. Returns '' when nothing is billed, so a
 * caller can decide whether an empty section is worth a page.
 */
export async function feeStructureTableHtml(
  ds: DataSource,
  tenantId: string,
  opts: { gradeLevel?: string; term?: string; academicYear?: string } = {},
): Promise<string> {
  const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
  const ksh = (n: any) => 'KES ' + Number(n || 0).toLocaleString('en-KE');

  const rows = await ds.query(
    `SELECT name, grade_level AS "gradeLevel", term, academic_year AS "academicYear",
            category, amount, COALESCE(is_mandatory,true) AS "isMandatory"
       FROM fee_items
      WHERE tenant_id::text = $1
        AND ($2::text IS NULL OR grade_level = $2 OR grade_level IS NULL)
        AND ($3::text IS NULL OR term = $3 OR term IS NULL)
        AND ($4::text IS NULL OR academic_year = $4 OR academic_year IS NULL)
      ORDER BY COALESCE(priority,100) ASC, name ASC`,
    [tenantId, opts.gradeLevel || null, opts.term || null, opts.academicYear || null],
  ).catch(() => []);

  if (!(rows as any[]).length) return '';

  const total = (rows as any[]).reduce((s, r) => s + Number(r.amount || 0), 0);
  const body = (rows as any[]).map(r =>
    `<tr><td>${esc(r.name)}</td><td>${esc(r.category || '')}</td>`
    + `<td>${esc(r.gradeLevel ? String(r.gradeLevel).replace(/_/g, ' ') : 'All classes')}</td>`
    + `<td>${esc(r.term ? String(r.term).replace('term_', 'Term ') : 'All terms')}</td>`
    + `<td class="n" style="text-align:right">${ksh(r.amount)}</td>`
    + `<td>${r.isMandatory ? 'Required' : 'Optional'}</td></tr>`).join('');

  return `<table><thead><tr><th>Vote head</th><th>Category</th><th>Class</th><th>Term</th>`
    + `<th class="n" style="text-align:right">Amount</th><th>Required?</th></tr></thead>`
    + `<tbody>${body}</tbody>`
    + `<tfoot><tr><td colspan="4">Total payable</td>`
    + `<td class="n" style="text-align:right">${ksh(total)}</td><td></td></tr></tfoot></table>`;
}
