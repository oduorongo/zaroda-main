/** The school year a mark belongs to: the calendar year in Nairobi (Kenyan schools run January to November). */
export const currentSchoolYear = (d = new Date()): number =>
  Number(new Intl.DateTimeFormat('en', { timeZone: 'Africa/Nairobi', year: 'numeric' }).format(d));

/** A year sent with a request (?year=2025), else the current school year. */
export const schoolYearOr = (v: unknown): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : currentSchoolYear();
};
