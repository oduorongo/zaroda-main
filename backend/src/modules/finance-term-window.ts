// Which dates a school term covers, for the finance books (cash book, ledger, trial balance, cash
// flow, income & expenditure). Receipts record their term but expenses do not, so a book is narrowed
// to a term by DATE, using the term closing dates the school keeps in Settings -> Term Dates
// (schools.settings.termDates: term_1_close, term_2_close, term_3_close).
//
// A term runs from the day after the previous term closed (so the holiday spending lands in the term
// it was spent before) up to the day its own term closes. Term 1 starts when the financial year
// starts; Term 3 runs to the end of the financial year, so the end-of-year holiday is part of it.

export type TermKey = 'term_1' | 'term_2' | 'term_3';
export const TERM_KEYS: TermKey[] = ['term_1', 'term_2', 'term_3'];

export const isTermKey = (v: unknown): v is TermKey => TERM_KEYS.includes(v as TermKey);
export const termLabel = (t: TermKey) => t.replace('term_', 'Term ');

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar day after an ISO date (YYYY-MM-DD), computed in UTC so no time zone can shift it. */
export function dayAfter(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export interface TermWindow {
  from: string;
  to: string;
}
export type TermWindowResult = { ok: true; window: TermWindow } | { ok: false; message: string };

export function termWindow(term: TermKey, termDates: Record<string, unknown> | null | undefined, yearFrom: string, yearTo: string): TermWindowResult {
  const dates = termDates || {};
  const close = (t: TermKey): string => {
    const raw = String(dates[`${t}_close`] ?? '').trim().slice(0, 10);
    return ISO.test(raw) ? raw : '';
  };
  const where = 'Open Settings -> Term Dates and enter the date each term closes.';
  const needs = (...terms: TermKey[]): string | null => {
    const missing = terms.filter((t) => !close(t));
    return missing.length ? `To report by term, the school's term closing dates must be set. Missing: ${missing.map(termLabel).join(', ')} closing date. ${where}` : null;
  };

  const required: Record<TermKey, TermKey[]> = { term_1: ['term_1'], term_2: ['term_1', 'term_2'], term_3: ['term_2'] };
  const missing = needs(...required[term]);
  if (missing) return { ok: false, message: missing };

  const c1 = close('term_1');
  const c2 = close('term_2');
  // The closing dates this term depends on must lie inside the financial year being reported, and be in order.
  for (const t of required[term]) {
    const c = close(t);
    if (c < yearFrom || c > yearTo) {
      return {
        ok: false,
        message: `The ${termLabel(t)} closing date (${c}) is outside the selected financial year (${yearFrom} to ${yearTo}). Term dates in Settings apply to one year at a time - update them, or choose the financial year they belong to.`,
      };
    }
  }
  if (term === 'term_2' && c2 <= c1) {
    return { ok: false, message: `The Term 2 closing date (${c2}) must be after the Term 1 closing date (${c1}). Check Settings -> Term Dates.` };
  }

  const window: TermWindow = term === 'term_1' ? { from: yearFrom, to: c1 } : term === 'term_2' ? { from: dayAfter(c1), to: c2 } : { from: dayAfter(c2), to: yearTo };
  if (window.from > window.to) {
    return { ok: false, message: `${termLabel(term)} would cover no days (${window.from} to ${window.to}). Check Settings -> Term Dates against the financial year.` };
  }
  return { ok: true, window };
}
