// lib/cbc/constants.ts
// Single source of truth for Kenya CBC/CBE structure, competencies, and grading.

// ─────────────────────────────────────────────────────────────
// EDUCATION STRUCTURE (full Kenya CBC/CBE)
// ─────────────────────────────────────────────────────────────
export interface GradeLevel { value: string; label: string; band: string; }

export const GRADE_LEVELS: GradeLevel[] = [
  // ECDE
  { value: 'playgroup', label: 'Play Group', band: 'ECDE' },
  { value: 'pp1',       label: 'PP1',        band: 'ECDE' },
  { value: 'pp2',       label: 'PP2',        band: 'ECDE' },
  // Primary
  { value: 'grade_1', label: 'Grade 1', band: 'Primary' },
  { value: 'grade_2', label: 'Grade 2', band: 'Primary' },
  { value: 'grade_3', label: 'Grade 3', band: 'Primary' },
  { value: 'grade_4', label: 'Grade 4', band: 'Primary' },
  { value: 'grade_5', label: 'Grade 5', band: 'Primary' },
  { value: 'grade_6', label: 'Grade 6', band: 'Primary' },
  // Junior School
  { value: 'grade_7', label: 'Grade 7', band: 'Junior School' },
  { value: 'grade_8', label: 'Grade 8', band: 'Junior School' },
  { value: 'grade_9', label: 'Grade 9', band: 'Junior School' },
  // Senior School
  { value: 'grade_10', label: 'Grade 10', band: 'Senior School' },
  { value: 'grade_11', label: 'Grade 11', band: 'Senior School' },
  { value: 'grade_12', label: 'Grade 12', band: 'Senior School' },
];

export const EDUCATION_BANDS = ['ECDE', 'Primary', 'Junior School', 'Senior School'] as const;

// Restrict the ECDE/Primary/Junior/Senior bands to what a school actually runs
// (schoolLevels: 'primary_js' and/or 'senior'). Unset/empty means legacy/unknown
// tenant — show every band rather than hiding grades a real school might need.
export function bandsForSchoolLevels(levels?: string[]): readonly string[] {
  if (!levels || levels.length === 0) return EDUCATION_BANDS;
  const out: string[] = [];
  if (levels.includes('primary_js')) out.push('ECDE', 'Primary', 'Junior School');
  if (levels.includes('senior')) out.push('Senior School');
  return out;
}

// ─────────────────────────────────────────────────────────────
// SENIOR SCHOOL (Grades 10–12): 4 CORE areas + 3–4 electives per learner
// ─────────────────────────────────────────────────────────────
export const SENIOR_CORE_AREAS = [
  'English', 'Kiswahili', 'Core Mathematics', 'Community Service Learning',
];

// Elective learning areas a senior-school learner may choose from (KICD pathways).
export const SENIOR_ELECTIVES = [
  // STEM
  'Mathematics', 'Biology', 'Chemistry', 'Physics', 'General Science',
  'Agriculture', 'Computer Studies', 'Home Science', 'Drawing & Design',
  'Aviation Technology', 'Building & Construction', 'Electrical Technology',
  'Metal Technology', 'Power Mechanics', 'Wood Technology', 'Media Technology',
  // Arts & Sports Science
  'Sports & Recreation', 'Physical Education', 'Music', 'Dance', 'Theatre & Film',
  'Fine Art',
  // Social Sciences
  'History & Citizenship', 'Geography', 'Christian Religious Education',
  'Islamic Religious Education', 'Hindu Religious Education', 'Business Studies',
  'Literature in English', 'Fasihi ya Kiswahili', 'Kenyan Sign Language',
  'Arabic', 'French', 'German', 'Mandarin Chinese',
];

/** A senior learner's full set of learning areas = 4 core + their chosen electives. */
export function seniorAreasFor(electives?: string[] | null): string[] {
  return [...SENIOR_CORE_AREAS, ...((electives || []).filter(Boolean))];
}

// ─────────────────────────────────────────────────────────────
// SENIOR SCHOOL PATHWAYS & TRACKS
// ─────────────────────────────────────────────────────────────
export const SENIOR_PATHWAYS = [
  {
    pathway: 'STEM',
    tracks: ['Pure Sciences', 'Applied Sciences', 'Technical & Engineering', 'Career & Technology Studies'],
  },
  {
    pathway: 'Arts & Sports Science',
    tracks: ['Sports Science', 'Performing Arts', 'Visual & Applied Arts'],
  },
  {
    pathway: 'Social Sciences',
    tracks: ['Languages & Literature', 'Humanities & Business Studies'],
  },
];

// ─────────────────────────────────────────────────────────────
// 7 CBC CORE COMPETENCIES (assessed alongside performance level)
// ─────────────────────────────────────────────────────────────
export const CORE_COMPETENCIES = [
  { key: 'communication',  label: 'Communication & Collaboration' },
  { key: 'critical',       label: 'Critical Thinking & Problem Solving' },
  { key: 'creativity',     label: 'Creativity & Imagination' },
  { key: 'citizenship',    label: 'Citizenship' },
  { key: 'digital',        label: 'Digital Literacy' },
  { key: 'learning',       label: 'Learning to Learn' },
  { key: 'selfefficacy',   label: 'Self-efficacy' },
];

// ─────────────────────────────────────────────────────────────
// PERFORMANCE LEVELS with EXACT percentage ranges (from spec)
// ─────────────────────────────────────────────────────────────
export interface PerfLevel { code: string; label: string; min: number; max: number; color: string; points?: number; }

// ECDE → Grade 6 : 4 levels (best = 4 per learning area)
export const LEVELS_4: PerfLevel[] = [
  { code: 'EE', label: 'Exceeding Expectation',  min: 76, max: 100, color: '#16a34a', points: 4 },
  { code: 'ME', label: 'Meeting Expectation',    min: 51, max: 75,  color: '#2563eb', points: 3 },
  { code: 'AE', label: 'Approaching Expectation',min: 26, max: 50,  color: '#f59e0b', points: 2 },
  { code: 'BE', label: 'Below Expectation',      min: 0,  max: 25,  color: '#dc2626', points: 1 },
];

// Grades 7 → 12 : 8 levels. `points` drive the performance-level total
// (best = 8 per learning area; 9 areas → 72). Range runs BE2 (1) … EE1 (8).
export const LEVELS_8: PerfLevel[] = [
  { code: 'EE1', label: 'Exceeding Expectation 1',   min: 90, max: 100, color: '#15803d', points: 8 },
  { code: 'EE2', label: 'Exceeding Expectation 2',   min: 75, max: 89,  color: '#16a34a', points: 7 },
  { code: 'ME1', label: 'Meeting Expectation 1',     min: 58, max: 74,  color: '#2563eb', points: 6 },
  { code: 'ME2', label: 'Meeting Expectation 2',     min: 41, max: 57,  color: '#3b82f6', points: 5 },
  { code: 'AE1', label: 'Approaching Expectation 1', min: 31, max: 40,  color: '#f59e0b', points: 4 },
  { code: 'AE2', label: 'Approaching Expectation 2', min: 21, max: 30,  color: '#fb923c', points: 3 },
  { code: 'BE1', label: 'Below Expectation 1',       min: 11, max: 20,  color: '#dc2626', points: 2 },
  { code: 'BE2', label: 'Below Expectation 2',       min: 0,  max: 10,  color: '#b91c1c', points: 1 },
];

// Which scale applies to a grade?
export function isSeniorScale(gradeLevel: string): boolean {
  return ['grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'].includes(gradeLevel);
}

export function levelsFor(gradeLevel: string): PerfLevel[] {
  return isSeniorScale(gradeLevel) ? LEVELS_8 : LEVELS_4;
}

// Convert a raw percentage into the correct CBC performance level
export function percentToLevel(percent: number, gradeLevel: string): PerfLevel {
  const scale = levelsFor(gradeLevel);
  return scale.find(l => percent >= l.min && percent <= l.max) || scale[scale.length - 1];
}

// Overall performance level = the level the learner achieves in the MOST learning areas (the
// mode of their per-area levels). This guarantees the overall level reflects actual per-subject
// performance. Ties are broken toward the HIGHER level. `codes` is the list of per-area level
// codes the learner earned (one per area with a mark).
export function overallLevelByMode(codes: string[], gradeLevel: string): PerfLevel | null {
  const scale = levelsFor(gradeLevel);           // ordered best → worst
  if (!codes.length) return null;
  const count: Record<string, number> = {};
  for (const c of codes) count[c] = (count[c] || 0) + 1;
  let best: PerfLevel | null = null;
  let bestCount = -1;
  // Walk the scale best → worst; on a tie the earlier (higher) level wins.
  for (const lvl of scale) {
    const n = count[lvl.code] || 0;
    if (n > bestCount) { bestCount = n; best = lvl; }
  }
  return best;
}

// Overall level from the POINTS TOTAL: express the total as a fraction of the maximum possible
// (areas × max-per-area) and map that fraction to the band's level using the standard cutoffs.
// This guarantees the overall level tracks the Points column exactly — the SAME total always
// gives the SAME level, and the level never contradicts the ranking.
export function levelFromPointsTotal(totalPoints: number, areaCount: number, gradeLevel: string): PerfLevel {
  const scale = levelsFor(gradeLevel);
  const maxPerArea = scale[0].points;                 // 8 senior, 4 lower
  const max = Math.max(1, areaCount * maxPerArea);
  const pct = (totalPoints / max) * 100;
  // Walk best → worst and take the first band whose minimum the percentage reaches. Using only
  // the lower bound (>= min) avoids the gaps between integer band maxima (e.g. 40.3% would fall
  // between AE1's max of 40 and ME2's min of 41 if we also checked <= max).
  return scale.find(l => pct >= l.min) || scale[scale.length - 1];
}

// Overall performance level derived from the AVERAGE POINTS per learning area (kept for other
// callers). avgPoints is rounded to the nearest whole point and mapped to that band's level code.
export function levelFromAvgPoints(avgPoints: number, gradeLevel: string): PerfLevel {
  const scale = levelsFor(gradeLevel);
  const maxPts = scale[0].points;
  const idx = Math.max(1, Math.min(maxPts, Math.round(avgPoints)));
  return scale.find(l => l.points === idx) || scale[scale.length - 1];
}

// Points for a level code on a grade's scale (EE1=8 … BE2=1; EE=4 … BE=1).
export function pointsForLevel(code: string, gradeLevel: string): number {
  const scale = levelsFor(gradeLevel);
  return scale.find(l => l.code === code)?.points ?? 0;
}

// Max points achievable per learning area for this grade (8 for senior, 4 for lower).
export function maxPointsPerArea(gradeLevel: string): number {
  return isSeniorScale(gradeLevel) ? 8 : 4;
}

// Performance-level total for a learner: sum of points across learning areas, plus the
// maximum (areaCount × maxPerArea, e.g. 9 × 8 = 72) and the average percentage.
export function performanceTotal(
  levelCodes: string[],
  gradeLevel: string,
): { points: number; max: number; areas: number } {
  const per = maxPointsPerArea(gradeLevel);
  const points = levelCodes.reduce((sum, c) => sum + pointsForLevel(c, gradeLevel), 0);
  return { points, max: levelCodes.length * per, areas: levelCodes.length };
}

// ─────────────────────────────────────────────────────────────
// LEARNING AREAS by band
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// LEARNING AREAS — KICD rationalised (2024+), accurate per level
// Lower Primary (Grade 1-3): 7 areas · Upper Primary (Grade 4-6): 8
// Junior School (Grade 7-9): 9 compulsory · Senior School: 7 (selectable)
// ─────────────────────────────────────────────────────────────
export const LEARNING_AREAS: Record<string, string[]> = {
  // Canonical KICD names — MUST match the seeded assessment rubric exactly so marks flow
  // Enter Marks → mark list → report card with uniform column names across all grades.
  'ECDE': [
    'Language Activities', 'Mathematics Activities', 'Creative Arts Activities',
    'Environmental Activities', 'Religious Education Activities',
  ],
  'Lower Primary': [
    'English Language Activities', 'Kiswahili Language Activities',
    'Mathematics Activities', 'Religious Education Activities',
    'Environmental Activities', 'Creative Arts Activities',
  ],
  'Upper Primary': [
    'English', 'Kiswahili', 'Mathematics', 'Religious Education',
    'Science & Technology', 'Agriculture', 'Social Studies', 'Creative Arts',
  ],
  'Junior School': [
    'English', 'Kiswahili', 'Mathematics',
    'Religious Education', 'Social Studies', 'Integrated Science',
    'Pre-technical Studies', 'Agriculture', 'Creative Arts and Sports',
  ],
  'Senior School': [
    'English', 'Kiswahili', 'Core Mathematics', 'Community Service Learning',
  ],
};

// Resolve learning areas by the SPECIFIC grade (not just band),
// because Lower Primary and Upper Primary differ under KICD.
export function learningAreasFor(gradeLevel: string): string[] {
  if (['playgroup','pp1','pp2'].includes(gradeLevel)) return LEARNING_AREAS['ECDE'];
  if (['grade_1','grade_2','grade_3'].includes(gradeLevel)) return LEARNING_AREAS['Lower Primary'];
  if (['grade_4','grade_5','grade_6'].includes(gradeLevel)) return LEARNING_AREAS['Upper Primary'];
  if (['grade_7','grade_8','grade_9'].includes(gradeLevel)) return LEARNING_AREAS['Junior School'];
  if (['grade_10','grade_11','grade_12'].includes(gradeLevel)) return LEARNING_AREAS['Senior School'];
  return LEARNING_AREAS['Upper Primary'];
}

// Human-readable level label for a grade
export function levelBandLabel(gradeLevel: string): string {
  if (['playgroup','pp1','pp2'].includes(gradeLevel)) return 'ECDE';
  if (['grade_1','grade_2','grade_3'].includes(gradeLevel)) return 'Lower Primary';
  if (['grade_4','grade_5','grade_6'].includes(gradeLevel)) return 'Upper Primary';
  if (['grade_7','grade_8','grade_9'].includes(gradeLevel)) return 'Junior School';
  if (['grade_10','grade_11','grade_12'].includes(gradeLevel)) return 'Senior School';
  return 'Primary';
}

// ──────────────────────────────────────────────────────────────
// Tolerant learning-area name matching.
// Teachers' saved subject names and the rubric area names can differ by spelling
// ("Intergrated Science" vs "Integrated Science"), word family ("Mathematics" vs
// "Mathematical Activities"), extra words ("Creative Arts" vs "Creative Arts and
// Sports"), or punctuation ("C.R.E" vs "CRE"). This matcher reconciles them so a
// saved mark always lands on the right rubric column / report-card row.
const _normLA = (x: string) => String(x || '').toLowerCase().replace(/[^a-z]/g, '');
const _stopwords = new Set(['and', 'the', 'of', 'a', 'activities', 'studies', 'language']);
const _tokensLA = (x: string) =>
  new Set(String(x || '').toLowerCase().split(/[^a-z]+/).filter(w => w && !_stopwords.has(w)));
const _lev = (a: string, b: string): number => {
  if (a === b) return 0;
  if (!a || !b) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const cur = [i + 1];
    for (let j = 0; j < b.length; j++) {
      cur.push(Math.min(prev[j + 1] + 1, cur[j] + 1, prev[j] + (a[i] === b[j] ? 0 : 1)));
    }
    prev = cur;
  }
  return prev[b.length];
};

/** True if two learning-area names refer to the same area (tolerant of spelling/word variants). */
export function learningAreaMatches(a: string, b: string): boolean {
  const na = _normLA(a), nb = _normLA(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  // shared significant word
  const ta = _tokensLA(a), tb = _tokensLA(b);
  for (const w of ta) if (tb.has(w)) return true;
  // shared 6-char word stem (Mathematic-s / Mathematic-al)
  for (const wa of ta) for (const wb of tb) {
    if (wa.length >= 6 && wb.length >= 6 && wa.slice(0, 6) === wb.slice(0, 6)) return true;
  }
  // whole-string fuzzy (handles transpositions/typos like Intergrated/Integrated)
  if (_lev(na, nb) <= Math.max(2, Math.round(0.15 * Math.max(na.length, nb.length)))) return true;
  return false;
}

/** Find the canonical area in `columns` that matches `saved`, or null. */
export function matchLearningArea(saved: string, columns: string[]): string | null {
  // exact-normalised first, then tolerant
  const ns = _normLA(saved);
  const exact = columns.find(c => _normLA(c) === ns);
  if (exact) return exact;
  return columns.find(c => learningAreaMatches(c, saved)) || null;
}
