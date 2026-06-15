// ── src/modules/pdf/cbc-report.helper.ts ─────────────────────
// Shared CBC logic for report cards: points, average points, and
// auto-generated CBC-compliant teacher comments + core competencies.
//
// KNEC scales:
//   Grades 7–12 → 8-level (EE1…BE2), reported with POINTS (8…1).
//   ECDE–Grade 6 → 4-level (EE/ME/AE/BE).

export const SENIOR_GRADES = [
  'grade_7','grade_8','grade_9','grade_10','grade_11','grade_12',
];

export function isSeniorGrade(gradeLevel?: string): boolean {
  return SENIOR_GRADES.includes(gradeLevel || '');
}

// 8-level code → points (grades 7–12)
const LEVEL8_POINTS: Record<string, number> = {
  EE1: 8, EE2: 7, ME1: 6, ME2: 5, AE1: 4, AE2: 3, BE1: 2, BE2: 1,
};
// 4-level code → indicative points (used only if a senior learner has 4-level codes stored)
const LEVEL4_POINTS: Record<string, number> = { EE: 8, ME: 6, AE: 3, BE: 1 };

// % → points (8-point KNEC scale)
export function percentToPoints(pct: number): number {
  if (pct >= 90) return 8;
  if (pct >= 75) return 7;
  if (pct >= 58) return 6;
  if (pct >= 41) return 5;
  if (pct >= 31) return 4;
  if (pct >= 21) return 3;
  if (pct >= 11) return 2;
  return 1;
}

// Resolve points for one result, preferring an explicit % then the stored level code.
export function pointsForResult(r: { percent?: number | null; level?: string | null }): number | null {
  if (r.percent != null && !isNaN(Number(r.percent))) return percentToPoints(Number(r.percent));
  if (r.level && LEVEL8_POINTS[r.level] != null) return LEVEL8_POINTS[r.level];
  if (r.level && LEVEL4_POINTS[r.level] != null) return LEVEL4_POINTS[r.level];
  return null;
}

// Average points across results (rounded to 1 dp). Returns null if none.
export function averagePoints(results: { percent?: number | null; level?: string | null }[]): number | null {
  const pts = results.map(pointsForResult).filter((p): p is number => p != null);
  if (!pts.length) return null;
  return Math.round((pts.reduce((a, b) => a + b, 0) / pts.length) * 10) / 10;
}

// Map an average-points figure to a mean grade band label (senior).
export function meanGradeBand(avgPts: number | null): string {
  if (avgPts == null) return '—';
  if (avgPts >= 7.5) return 'EE1';
  if (avgPts >= 6.5) return 'EE2';
  if (avgPts >= 5.5) return 'ME1';
  if (avgPts >= 4.5) return 'ME2';
  if (avgPts >= 3.5) return 'AE1';
  if (avgPts >= 2.5) return 'AE2';
  if (avgPts >= 1.5) return 'BE1';
  return 'BE2';
}

// Family of a level code: EE / ME / AE / BE
function levelFamily(level: string): 'EE' | 'ME' | 'AE' | 'BE' {
  const f = (level || 'ME').replace(/[0-9]/g, '');
  return (['EE','ME','AE','BE'].includes(f) ? f : 'ME') as any;
}

// The 7 CBC core competencies (KICD).
export const CBC_CORE_COMPETENCIES = [
  'Communication and Collaboration',
  'Critical Thinking and Problem Solving',
  'Creativity and Imagination',
  'Citizenship',
  'Digital Literacy',
  'Learning to Learn',
  'Self-Efficacy',
];

/**
 * Determine which core competencies a learner has demonstrably achieved,
 * derived from their per-learning-area performance (CBC is competency-based,
 * so strong areas evidence specific competencies).
 */
export function coreCompetenciesAchieved(
  results: { subject?: string; level?: string | null }[],
): string[] {
  const strong = results.filter(r => ['EE','ME'].includes(levelFamily(r.level || '')));
  const achieved = new Set<string>();

  for (const r of strong) {
    const s = (r.subject || '').toLowerCase();
    if (/english|kiswahili|language|literacy|indigenous/.test(s)) {
      achieved.add('Communication and Collaboration');
      achieved.add('Learning to Learn');
    }
    if (/math|science|integrated science|pre-tech|technical/.test(s)) {
      achieved.add('Critical Thinking and Problem Solving');
    }
    if (/art|creative|music|movement|craft/.test(s)) {
      achieved.add('Creativity and Imagination');
    }
    if (/social|citizenship|cre|ire|hre|religious|life skills/.test(s)) {
      achieved.add('Citizenship');
      achieved.add('Self-Efficacy');
    }
    if (/computer|digital|ict|coding/.test(s)) {
      achieved.add('Digital Literacy');
    }
    if (/agri|nutrition|home science|physical|health|sport/.test(s)) {
      achieved.add('Self-Efficacy');
      achieved.add('Learning to Learn');
    }
  }
  // Always credit Communication + Learning to Learn for an overall meeting/exceeding learner
  const eeMe = strong.length >= Math.ceil(results.length / 2);
  if (eeMe) { achieved.add('Communication and Collaboration'); achieved.add('Learning to Learn'); }

  return CBC_CORE_COMPETENCIES.filter(c => achieved.has(c));
}

/**
 * CBC-compliant auto class-teacher comment.
 * Competency-based language (no ranking/percentage talk), keyed to the overall level
 * and the strongest/weakest learning areas, ending with a forward-looking next step.
 */
export function cbcTeacherComment(opts: {
  firstName: string;
  overallLevel: string;            // e.g. EE1 / ME / AE2
  results: { subject?: string; level?: string | null }[];
}): string {
  const { firstName, overallLevel, results } = opts;
  const fam = levelFamily(overallLevel);

  const strong = results.filter(r => levelFamily(r.level || '') === 'EE').map(r => r.subject).filter(Boolean);
  const meeting = results.filter(r => levelFamily(r.level || '') === 'ME').map(r => r.subject).filter(Boolean);
  const support = results.filter(r => ['AE','BE'].includes(levelFamily(r.level || ''))).map(r => r.subject).filter(Boolean);

  const list = (arr: any[]) => arr.slice(0, 3).join(', ');

  const opener: Record<string, string> = {
    EE: `${firstName} has exceeded expectations this term, demonstrating strong mastery of competencies across most learning areas.`,
    ME: `${firstName} has met expectations this term, showing solid and consistent acquisition of the expected competencies.`,
    AE: `${firstName} is approaching expectations and is steadily developing the targeted competencies.`,
    BE: `${firstName} is working towards the expected competencies and will benefit from guided, scaffolded support.`,
  };

  let body = opener[fam];
  if (strong.length) body += ` Particular strength is evident in ${list(strong)}.`;
  else if (meeting.length) body += ` Competency is well demonstrated in ${list(meeting)}.`;

  const nextStep: Record<string, string> = {
    EE: ` To grow further, ${firstName} should take on extended, open-ended tasks and peer-mentoring opportunities.`,
    ME: ` With continued practice and active participation, ${firstName} can move towards exceeding expectations.`,
    AE: support.length
      ? ` Focused practice in ${list(support)}, with teacher and parental support, will strengthen these competencies.`
      : ` Focused practice and active participation will strengthen these competencies.`,
    BE: support.length
      ? ` A structured remediation plan in ${list(support)}, supported at home and school, is recommended.`
      : ` A structured remediation plan, supported at home and school, is recommended.`,
  };
  body += nextStep[fam];
  return body;
}

/** CBC-compliant HOI / head-teacher remark, keyed to overall level. */
export function cbcHoiComment(firstName: string, overallLevel: string): string {
  const fam = levelFamily(overallLevel);
  const map: Record<string, string> = {
    EE: `An excellent competency profile. ${firstName} is encouraged to sustain this exemplary effort and support peers.`,
    ME: `A commendable competency profile. ${firstName} should keep building on these strengths each term.`,
    AE: `${firstName} is making steady progress. Consistent effort and support will move performance to the next level.`,
    BE: `${firstName} needs close support from both school and home to build the foundational competencies.`,
  };
  return map[fam];
}
