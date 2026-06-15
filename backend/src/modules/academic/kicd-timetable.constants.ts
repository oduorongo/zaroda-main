// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// KICD TIMETABLING CONSTANTS & CBE CALCULATOR
// Source: Kenya MoE — Guidelines for Timetabling and CBE in CBE
// File: src/modules/academic/constants/kicd-timetable.constants.ts
// ============================================================

// ─────────────────────────────────────────────────────────────
// PERIOD STRUCTURES (official per level)
// ─────────────────────────────────────────────────────────────

export type GradeBand =
  | 'pre_primary'   // Playgroup, PP1, PP2
  | 'grade_1_3'     // Grade 1–3
  | 'grade_4_6'     // Grade 4–6
  | 'grade_7_9'     // Grade 7–9 (Junior School)
  | 'foundation'    // Special Needs — Foundation
  | 'intermediate'  // Special Needs — Intermediate
  | 'pre_vocational'// Special Needs — Pre-Vocational

export interface PeriodSlot {
  period:    number;
  startTime: string;
  endTime:   string;
  type:      'lesson' | 'break' | 'assembly' | 'lunch' | 'non_formal' | 'free_choice' | 'ppi' | 'games';
  label?:    string;
}

// ── PRE-PRIMARY (Playgroup, PP1, PP2) ──────────────────────
// 5 lessons/day · 30 min each · Start 9:00am · End 12:00pm
// Reporting 8:30am · 8:30–9:00 health check/roll call
// Breaks: 10 min (1st) + 20 min (2nd)
export const PRE_PRIMARY_PERIODS: PeriodSlot[] = [
  { period: 0, startTime: '08:30', endTime: '09:00', type: 'assembly', label: 'Health Check & Roll Call' },
  { period: 1, startTime: '09:00', endTime: '09:30', type: 'lesson' },
  { period: 2, startTime: '09:30', endTime: '10:00', type: 'lesson' },
  { period: 0, startTime: '10:00', endTime: '10:10', type: 'break', label: 'Health Break 1 (10 min)' },
  { period: 3, startTime: '10:10', endTime: '10:40', type: 'lesson' },
  { period: 0, startTime: '10:40', endTime: '11:00', type: 'break', label: 'Health Break 2 (20 min)' },
  { period: 4, startTime: '11:00', endTime: '11:30', type: 'lesson' },
  { period: 5, startTime: '11:30', endTime: '12:00', type: 'lesson' },
  { period: 0, startTime: '12:00', endTime: '13:00', type: 'lunch', label: 'Lunch Break' },
];

// ── GRADE 1–3 ──────────────────────────────────────────────
// 6 lessons/day + 1 PPI/week = 31 lessons/week · 30 min each
// Reporting 8:00am · 8:00–8:20 health check
// Start 8:20am · End 12:30pm
// Breaks: 10 min (after P2) + 30 min (after P4)
export const GRADE_1_3_PERIODS: PeriodSlot[] = [
  { period: 0, startTime: '08:00', endTime: '08:20', type: 'assembly', label: 'Health Check & Roll Call' },
  { period: 1, startTime: '08:20', endTime: '08:50', type: 'lesson' },
  { period: 2, startTime: '08:50', endTime: '09:20', type: 'lesson' },
  { period: 0, startTime: '09:20', endTime: '09:30', type: 'break', label: 'Health Break 1 (10 min)' },
  { period: 3, startTime: '09:30', endTime: '10:00', type: 'lesson' },
  { period: 4, startTime: '10:00', endTime: '10:30', type: 'lesson' },
  { period: 0, startTime: '10:30', endTime: '11:00', type: 'break', label: 'Health Break 2 (30 min)' },
  { period: 5, startTime: '11:00', endTime: '11:30', type: 'lesson' },
  { period: 6, startTime: '11:30', endTime: '12:00', type: 'lesson' },
  { period: 0, startTime: '12:00', endTime: '12:30', type: 'lunch', label: 'Lunch Break' },
];

// ── GRADE 4–6 ──────────────────────────────────────────────
// 7 lessons/day + 1 PPI/week = 35 lessons/week · 35 min each
// Reporting 8:00am · 8:00–8:20 assembly
// Start 8:20am · End 2:35pm
// Breaks: 20 min (after P2) + 30 min (after P4) + lunch
// Non-formal after 2:35pm
export const GRADE_4_6_PERIODS: PeriodSlot[] = [
  { period: 0, startTime: '08:00', endTime: '08:20', type: 'assembly', label: 'Assembly, Health Check & Roll Call' },
  { period: 1, startTime: '08:20', endTime: '08:55', type: 'lesson' },
  { period: 2, startTime: '08:55', endTime: '09:30', type: 'lesson' },
  { period: 0, startTime: '09:30', endTime: '09:50', type: 'break', label: 'Health Break 1 (20 min)' },
  { period: 3, startTime: '09:50', endTime: '10:25', type: 'lesson' },
  { period: 4, startTime: '10:25', endTime: '11:00', type: 'lesson' },
  { period: 0, startTime: '11:00', endTime: '11:30', type: 'break', label: 'Health Break 2 (30 min)' },
  { period: 5, startTime: '11:30', endTime: '12:05', type: 'lesson' },
  { period: 6, startTime: '12:05', endTime: '12:40', type: 'lesson' },
  { period: 0, startTime: '12:40', endTime: '14:00', type: 'lunch', label: 'Lunch Break' },
  { period: 7, startTime: '14:00', endTime: '14:35', type: 'lesson' },
  { period: 0, startTime: '14:35', endTime: '16:00', type: 'non_formal', label: 'Non-formal Programs' },
];

// ── GRADE 7–9 (Junior School) ──────────────────────────────
// 8 lessons/day + 1 PPI/week = 41 lessons/week · 40 min each
// Reporting 8:00am · 8:00–8:20 roll call/assembly
// Start 8:20am · End 3:20pm
// Breaks: 10 min (after P2) + 30 min (after P4) + 1hr lunch
// ONE double lesson allowed for: Integrated Science, Creative Arts & Sports,
//   Pre-Technical Studies, Agriculture (for practicals)
// Non-formal after 3:20pm
export const GRADE_7_9_PERIODS: PeriodSlot[] = [
  { period: 0, startTime: '08:00', endTime: '08:20', type: 'assembly', label: 'Roll Call / Assembly' },
  { period: 1, startTime: '08:20', endTime: '09:00', type: 'lesson' },
  { period: 2, startTime: '09:00', endTime: '09:40', type: 'lesson' },
  { period: 0, startTime: '09:40', endTime: '09:50', type: 'break', label: 'Health Break 1 (10 min)' },
  { period: 3, startTime: '09:50', endTime: '10:30', type: 'lesson' },
  { period: 4, startTime: '10:30', endTime: '11:10', type: 'lesson' },
  { period: 0, startTime: '11:10', endTime: '11:40', type: 'break', label: 'Health Break 2 (30 min)' },
  { period: 5, startTime: '11:40', endTime: '12:20', type: 'lesson' },
  { period: 6, startTime: '12:20', endTime: '13:00', type: 'lesson' },
  { period: 0, startTime: '13:00', endTime: '14:00', type: 'lunch', label: 'Lunch Break (1 hour)' },
  { period: 7, startTime: '14:00', endTime: '14:40', type: 'lesson' },
  { period: 8, startTime: '14:40', endTime: '15:20', type: 'lesson' },
  { period: 0, startTime: '15:20', endTime: '16:20', type: 'games', label: 'Games / Co-curricular' },
  { period: 0, startTime: '16:20', endTime: '16:45', type: 'ppi', label: 'PPI (Friday only, after 3:20 pm)' },
];

// ── FOUNDATION LEVEL (Special Needs) ──────────────────────
// 4 lessons/day = 20 lessons/week · 30 min each
// Reporting 8:30am · Start 9:00am · End 12:00pm
// Breaks: 30 min after every 2 lessons
export const FOUNDATION_PERIODS: PeriodSlot[] = [
  { period: 0, startTime: '08:00', endTime: '08:30', type: 'free_choice', label: 'Free Choice Activities' },
  { period: 0, startTime: '08:30', endTime: '09:00', type: 'assembly', label: 'Health Check & Roll Call' },
  { period: 1, startTime: '09:00', endTime: '09:30', type: 'lesson' },
  { period: 2, startTime: '09:30', endTime: '10:00', type: 'lesson' },
  { period: 0, startTime: '10:00', endTime: '10:30', type: 'break', label: 'Health Break (30 min)' },
  { period: 3, startTime: '10:30', endTime: '11:00', type: 'lesson' },
  { period: 4, startTime: '11:00', endTime: '11:30', type: 'lesson' },
  { period: 0, startTime: '11:30', endTime: '12:00', type: 'lunch', label: 'Lunch Break' },
];

// ── INTERMEDIATE LEVEL (Special Needs) ────────────────────
// 6 lessons/day = 30 lessons/week · 30 min each
// Reporting 8:00am · Start 8:20am · End 12:10pm
// Breaks: 20 min (after P2) + 30 min (after P4)
export const INTERMEDIATE_PERIODS: PeriodSlot[] = [
  { period: 0, startTime: '08:00', endTime: '08:20', type: 'assembly', label: 'Assembly, Health Check & Roll Call' },
  { period: 1, startTime: '08:20', endTime: '08:50', type: 'lesson' },
  { period: 2, startTime: '08:50', endTime: '09:20', type: 'lesson' },
  { period: 0, startTime: '09:20', endTime: '09:40', type: 'break', label: 'Health Break 1 (20 min)' },
  { period: 3, startTime: '09:40', endTime: '10:10', type: 'lesson' },
  { period: 4, startTime: '10:10', endTime: '10:40', type: 'lesson' },
  { period: 0, startTime: '10:40', endTime: '11:10', type: 'break', label: 'Health Break 2 (30 min)' },
  { period: 5, startTime: '11:10', endTime: '11:40', type: 'lesson' },
  { period: 6, startTime: '11:40', endTime: '12:10', type: 'lesson' },
  { period: 0, startTime: '12:10', endTime: '13:10', type: 'lunch', label: 'Lunch Break' },
];

// ── PRE-VOCATIONAL LEVEL (Special Needs) ──────────────────
// 8 lessons/day + 1 PPI/week = 40 lessons/week · 40 min each
// Start 8:20am · End 3:20pm
// ONE double lesson allowed for Pre-vocational Skills
export const PRE_VOCATIONAL_PERIODS: PeriodSlot[] = [
  { period: 0, startTime: '08:00', endTime: '08:20', type: 'assembly', label: 'Assembly' },
  { period: 1, startTime: '08:20', endTime: '09:00', type: 'lesson' },
  { period: 2, startTime: '09:00', endTime: '09:40', type: 'lesson' },
  { period: 0, startTime: '09:40', endTime: '09:50', type: 'break', label: 'Health Break (10 min)' },
  { period: 3, startTime: '09:50', endTime: '10:30', type: 'lesson' },
  { period: 4, startTime: '10:30', endTime: '11:10', type: 'lesson' },
  { period: 0, startTime: '11:10', endTime: '11:40', type: 'break', label: 'Health Break (30 min)' },
  { period: 5, startTime: '11:40', endTime: '12:20', type: 'lesson' },
  { period: 6, startTime: '12:20', endTime: '13:00', type: 'lesson' },
  { period: 0, startTime: '13:00', endTime: '14:00', type: 'lunch', label: 'Lunch Break' },
  { period: 7, startTime: '14:00', endTime: '14:40', type: 'lesson' },
  { period: 8, startTime: '14:40', endTime: '15:20', type: 'lesson' },
  { period: 0, startTime: '15:20', endTime: '16:00', type: 'non_formal', label: 'Non-formal Programs' },
];


// ─────────────────────────────────────────────────────────────
// LESSON ALLOCATIONS PER LEARNING AREA (KICD Tables 1–7)
// ─────────────────────────────────────────────────────────────

export interface LearningAreaAllocation {
  name:    string;
  lessons: number;
  doubleAllowed?: boolean;    // Grade 7–9 only
  beforeBreak?:   boolean;    // Creative/Sports/PE must be before break
  isPpi?:         boolean;
}

// Table 1: Pre-Primary (25 lessons/week)
export const PRE_PRIMARY_ALLOCATIONS: LearningAreaAllocation[] = [
  { name: 'Language Activities',                     lessons: 5 },
  { name: 'Mathematical Activities',                 lessons: 5 },
  { name: 'Creative Activities',                     lessons: 6, beforeBreak: true },
  { name: 'Environmental Activities',                lessons: 5 },
  { name: 'Religious Activities',                    lessons: 3 },
  { name: 'Pastoral Programme of Instruction (PPI)', lessons: 1, isPpi: true },
];

// Table 2: Grade 1–3 (31 lessons/week)
export const GRADE_1_3_ALLOCATIONS: LearningAreaAllocation[] = [
  { name: 'Indigenous Language Activities',          lessons: 2 },
  { name: 'Kiswahili Language Activities / KSL',     lessons: 4 },
  { name: 'English Language Activities',             lessons: 5 },
  { name: 'Mathematical Activities',                 lessons: 5 },
  { name: 'Religious Education Activities',          lessons: 3 },
  { name: 'Environmental Activities',                lessons: 4 },
  { name: 'Creative Activities',                     lessons: 7, beforeBreak: true },
  { name: 'Pastoral Programme of Instruction (PPI)', lessons: 1, isPpi: true },
];

// Table 3: Grade 4–6 (35 lessons/week)
export const GRADE_4_6_ALLOCATIONS: LearningAreaAllocation[] = [
  { name: 'English',                                 lessons: 5 },
  { name: 'Kiswahili / Kenya Sign Language',         lessons: 4 },
  { name: 'Mathematics',                             lessons: 5 },
  { name: 'Religious Education',                     lessons: 3 },
  { name: 'Science & Technology',                    lessons: 4 },
  { name: 'Agriculture',                             lessons: 4 },
  { name: 'Social Studies',                          lessons: 3 },
  { name: 'Creative Arts',                           lessons: 6, beforeBreak: true },
  { name: 'Pastoral Programme of Instruction (PPI)', lessons: 1, isPpi: true },
];

// Table 4: Grade 7–9 Junior School (41 lessons/week)
// NOTE: ONE double lesson allowed for Integrated Science,
//       Creative Arts & Sports, Pre-Technical Studies, Agriculture
export const GRADE_7_9_ALLOCATIONS: LearningAreaAllocation[] = [
  { name: 'English',                                 lessons: 5 },
  { name: 'Kiswahili / Kenya Sign Language (KSL)',   lessons: 4 },
  { name: 'Mathematics',                             lessons: 5 },
  { name: 'Religious Education',                     lessons: 4 },
  { name: 'Social Studies (Including Life Skills)',  lessons: 4 },
  { name: 'Integrated Science',                      lessons: 5, doubleAllowed: true },
  { name: 'Pre-Technical Studies',                   lessons: 4, doubleAllowed: true },
  { name: 'Agriculture',                             lessons: 4, doubleAllowed: true },
  { name: 'Creative Arts and Sports',                lessons: 5, doubleAllowed: true, beforeBreak: true },
  { name: 'Pastoral Programme of Instruction (PPI)', lessons: 1, isPpi: true },
];

// Table 5: Foundation Level Special Needs (20 lessons/week)
export const FOUNDATION_ALLOCATIONS: LearningAreaAllocation[] = [
  { name: 'Communication and Social Skills',         lessons: 4 },
  { name: 'Activities of Daily Living Skills',       lessons: 4 },
  { name: 'Religious Education',                     lessons: 2 },
  { name: 'Sensory Perception',                      lessons: 1 },
  { name: 'Psychomotor Activities',                  lessons: 2, beforeBreak: true },
  { name: 'Creative Activities',                     lessons: 1 },
  { name: 'Music and Movement',                      lessons: 1 },
  { name: 'Orientation and Mobility',                lessons: 2 },
  { name: 'Pre-numeracy Activities',                 lessons: 2 },
  { name: 'Pastoral Programme of Instruction (PPI)', lessons: 1, isPpi: true },
];

// Table 6: Intermediate Level Special Needs (30 lessons/week)
export const INTERMEDIATE_ALLOCATIONS: LearningAreaAllocation[] = [
  { name: 'Communication and Social Skills',         lessons: 5 },
  { name: 'Daily Living Skills',                     lessons: 4 },
  { name: 'Religious Education',                     lessons: 2 },
  { name: 'Sensory Motor Integration',               lessons: 4 },
  { name: 'Numeracy Activities',                     lessons: 3 },
  { name: 'Art and Craft',                           lessons: 4 },
  { name: 'Music',                                   lessons: 2 },
  { name: 'Movement Activities',                     lessons: 5, beforeBreak: true },
  { name: 'Pastoral Programme of Instruction (PPI)', lessons: 1, isPpi: true },
];

// Table 7: Pre-Vocational Level Special Needs (40 lessons/week)
export const PRE_VOCATIONAL_ALLOCATIONS: LearningAreaAllocation[] = [
  { name: 'Pre-vocational Skills',                   lessons: 18, doubleAllowed: true },
  { name: 'Communication and Functional Literacy',   lessons: 4 },
  { name: 'Daily Living Skills and Nutrition',       lessons: 4 },
  { name: 'Physical Education',                      lessons: 5, beforeBreak: true },
  { name: 'Religious Education',                     lessons: 2 },
  { name: 'Music and Movement',                      lessons: 2 },
  { name: 'Social Studies',                          lessons: 4 },
  { name: 'Pastoral Programme of Instruction (PPI)', lessons: 1, isPpi: true },
];


// ─────────────────────────────────────────────────────────────
// HELPER: Map grade level to band + allocations + periods
// ─────────────────────────────────────────────────────────────

export function getGradeBand(gradeLevel: string): GradeBand {
  if (['playgroup','pp1','pp2'].includes(gradeLevel))               return 'pre_primary';
  if (['grade_1','grade_2','grade_3'].includes(gradeLevel))         return 'grade_1_3';
  if (['grade_4','grade_5','grade_6'].includes(gradeLevel))         return 'grade_4_6';
  if (['grade_7','grade_8','grade_9'].includes(gradeLevel))         return 'grade_7_9';
  return 'grade_7_9'; // grade 10-12 follows similar structure
}

export function getPeriodStructure(band: GradeBand): PeriodSlot[] {
  const map: Record<GradeBand, PeriodSlot[]> = {
    pre_primary:    PRE_PRIMARY_PERIODS,
    grade_1_3:      GRADE_1_3_PERIODS,
    grade_4_6:      GRADE_4_6_PERIODS,
    grade_7_9:      GRADE_7_9_PERIODS,
    foundation:     FOUNDATION_PERIODS,
    intermediate:   INTERMEDIATE_PERIODS,
    pre_vocational: PRE_VOCATIONAL_PERIODS,
  };
  return map[band];
}

export function getLearningAreaAllocations(band: GradeBand): LearningAreaAllocation[] {
  const map: Record<GradeBand, LearningAreaAllocation[]> = {
    pre_primary:    PRE_PRIMARY_ALLOCATIONS,
    grade_1_3:      GRADE_1_3_ALLOCATIONS,
    grade_4_6:      GRADE_4_6_ALLOCATIONS,
    grade_7_9:      GRADE_7_9_ALLOCATIONS,
    foundation:     FOUNDATION_ALLOCATIONS,
    intermediate:   INTERMEDIATE_ALLOCATIONS,
    pre_vocational: PRE_VOCATIONAL_ALLOCATIONS,
  };
  return map[band];
}

export function getLessonDurationMinutes(band: GradeBand): number {
  const map: Record<GradeBand, number> = {
    pre_primary:    30,
    grade_1_3:      30,
    grade_4_6:      35,
    grade_7_9:      40,
    foundation:     30,
    intermediate:   30,
    pre_vocational: 40,
  };
  return map[band];
}

export function getLessonsPerWeek(band: GradeBand): number {
  const map: Record<GradeBand, number> = {
    pre_primary:    25,
    grade_1_3:      31,
    grade_4_6:      35,
    grade_7_9:      41,
    foundation:     20,
    intermediate:   30,
    pre_vocational: 40,
  };
  return map[band];
}

// Only Grade 7–9 allows ONE double lesson (for practical subjects)
export function allowsDoubleLesson(band: GradeBand): boolean {
  return band === 'grade_7_9' || band === 'pre_vocational';
}

// Subjects that MUST be plotted before a break
export function mustBeBeforeBreak(subjectName: string): boolean {
  const beforeBreakSubjects = [
    'creative activities','creative arts','creative arts and sports',
    'sports','physical education','movement activities',
    'psychomotor activities','art and craft',
  ];
  return beforeBreakSubjects.some(s => subjectName.toLowerCase().includes(s));
}


// ─────────────────────────────────────────────────────────────
// CBE CALCULATOR (Section B of guidelines)
// ─────────────────────────────────────────────────────────────

export interface CbeResult {
  totalLessons:       number;
  teachersRequired:   number;
  shortfallLessons:   number;
  shortfallTeachers:  number;
  totalCbe:           number;
  principal:          number;
  deputyPrincipals:   number;
  seniorMasters:      number;
  breakdown:          CbeSubjectBreakdown[];
}

export interface CbeSubjectBreakdown {
  subject:        string;
  lessonsPerWeek: number;  // total across all grades × streams
  teachersNeeded: number;  // raw decimal
}

const MIN_TEACHING_LOAD_PRIMARY  = 27; // lessons/week
const MIN_TEACHING_LOAD_JUNIOR   = 27; // lessons/week
const PRINCIPAL_LESSONS          = 10;
const DEPUTY_PRINCIPAL_LESSONS   = 20;
const SENIOR_MASTER_LESSONS      = 20;
const HEAD_TEACHER_LESSONS       = 15; // primary

// Grade 7–9 CBE (Table 2 + Table 3 logic)
export function calculateJuniorCbe(streams: number): CbeResult {
  const allocations = GRADE_7_9_ALLOCATIONS;
  const grades = 3; // G7, G8, G9

  const breakdown: CbeSubjectBreakdown[] = allocations.map(a => {
    const totalLessons = a.lessons * grades * streams;
    return {
      subject:        a.name,
      lessonsPerWeek: totalLessons,
      teachersNeeded: totalLessons / MIN_TEACHING_LOAD_JUNIOR,
    };
  });

  const teachersRequired = breakdown.reduce((s, b) => s + b.teachersNeeded, 0);

  // Step 2: Shortfall from admin reduced loads
  const { principal, deputyPrincipals, seniorMasters } = getJuniorAdminEstablishment(streams);
  const shortfallLessons =
    (MIN_TEACHING_LOAD_JUNIOR - PRINCIPAL_LESSONS) * principal +
    (MIN_TEACHING_LOAD_JUNIOR - DEPUTY_PRINCIPAL_LESSONS) * deputyPrincipals +
    (MIN_TEACHING_LOAD_JUNIOR - SENIOR_MASTER_LESSONS) * seniorMasters;
  const shortfallTeachers = shortfallLessons / MIN_TEACHING_LOAD_JUNIOR;

  const rawCbe   = teachersRequired + shortfallTeachers;
  const totalCbe = Math.ceil(rawCbe);

  return {
    totalLessons:      allocations.reduce((s, a) => s + a.lessons * grades * streams, 0),
    teachersRequired:  parseFloat(teachersRequired.toFixed(3)),
    shortfallLessons,
    shortfallTeachers: parseFloat(shortfallTeachers.toFixed(3)),
    totalCbe,
    principal,
    deputyPrincipals,
    seniorMasters,
    breakdown,
  };
}

// Grade 1–6 CBE (Table 1 primary)
export function calculatePrimaryCbe(streams: number): CbeResult {
  // Primary: CBE = total classes + 1 (head teacher)
  // Classes = streams × 6 (G1–G6)
  const classes   = streams * 6;
  const totalCbe  = classes + 1; // +1 for head teacher

  // Admin establishment from Table 1
  const { deputyPrincipals, seniorMasters } = getPrimaryAdminEstablishment(streams);

  return {
    totalLessons:      GRADE_4_6_ALLOCATIONS.reduce((s, a) => s + a.lessons, 0) * streams * 3, // approx G4-6
    teachersRequired:  totalCbe,
    shortfallLessons:  0,
    shortfallTeachers: 0,
    totalCbe,
    principal:         1,
    deputyPrincipals,
    seniorMasters,
    breakdown:         [],
  };
}

// Table 3: Principals, Deputies, Senior Masters for Junior School
function getJuniorAdminEstablishment(streams: number): {
  principal: number; deputyPrincipals: number; seniorMasters: number;
} {
  // Based on Appendix 8 / Table 3
  const table: Record<number, { dp: number; sm: number }> = {
    1:  { dp: 1, sm: 1 }, 2:  { dp: 1, sm: 2 },
    3:  { dp: 1, sm: 2 }, 4:  { dp: 1, sm: 4 },
    5:  { dp: 1, sm: 4 }, 6:  { dp: 1, sm: 5 },
    7:  { dp: 1, sm: 5 }, 8:  { dp: 2, sm: 6 },
    9:  { dp: 2, sm: 6 }, 10: { dp: 2, sm: 6 },
    11: { dp: 2, sm: 7 }, 12: { dp: 2, sm: 7 },
  };
  const s = Math.min(streams, 12);
  return { principal: 1, deputyPrincipals: table[s]?.dp || 1, seniorMasters: table[s]?.sm || 1 };
}

// Table 1: Primary school admin establishment
function getPrimaryAdminEstablishment(streams: number): {
  deputyPrincipals: number; seniorMasters: number;
} {
  const table: Record<number, { dp: number; sm: number }> = {
    1:  { dp: 1, sm: 1 }, 2:  { dp: 1, sm: 1 },
    3:  { dp: 1, sm: 2 }, 4:  { dp: 2, sm: 2 },
    5:  { dp: 2, sm: 2 }, 6:  { dp: 2, sm: 3 },
    7:  { dp: 2, sm: 4 }, 8:  { dp: 2, sm: 4 },
    9:  { dp: 2, sm: 4 }, 10: { dp: 2, sm: 5 },
  };
  const s = Math.min(streams, 10);
  return { deputyPrincipals: table[s]?.dp || 1, seniorMasters: table[s]?.sm || 1 };
}


// ─────────────────────────────────────────────────────────────
// TIMETABLE VALIDATION RULES (from guidelines)
// ─────────────────────────────────────────────────────────────

export interface TimetableViolation {
  type:    string;
  message: string;
  day?:    number;
  period?: number;
  stream?: string;
}

export function validateTimetable(
  slots: { streamId: string; subjectName: string; dayOfWeek: number; periodNumber: number }[],
  band:  GradeBand
): TimetableViolation[] {
  const violations: TimetableViolation[] = [];
  const periods = getPeriodStructure(band).filter(p => p.type === 'lesson');
  const breakPeriods = getBreakPeriodNumbers(band);

  // Rule 1: No double lessons (except Grade 7–9 practical subjects — max ONE)
  if (!allowsDoubleLesson(band)) {
    const doubled = slots.filter((slot, i) =>
      slots.some((s2, j) => i !== j &&
        s2.streamId === slot.streamId &&
        s2.subjectName === slot.subjectName &&
        s2.dayOfWeek === slot.dayOfWeek &&
        Math.abs(s2.periodNumber - slot.periodNumber) === 1
      )
    );
    if (doubled.length > 0) {
      violations.push({
        type: 'NO_DOUBLE_LESSONS',
        message: `Double lessons are not permitted for ${band}. Found ${doubled.length / 2} double(s).`,
      });
    }
  }

  // Rule 2: Creative/Sports/PE must be before a break
  const beforeBreakSlots = slots.filter(s => mustBeBeforeBreak(s.subjectName));
  for (const slot of beforeBreakSlots) {
    const nextPeriod = slot.periodNumber + 1;
    const nextIsBreak = breakPeriods.includes(nextPeriod);
    if (!nextIsBreak) {
      violations.push({
        type:    'CREATIVE_NOT_BEFORE_BREAK',
        message: `${slot.subjectName} must be plotted before a break (Day ${slot.dayOfWeek}, Period ${slot.periodNumber}).`,
        day:     slot.dayOfWeek,
        period:  slot.periodNumber,
        stream:  slot.streamId,
      });
    }
  }

  // Rule 3: Similar subjects should not follow each other
  for (const streamId of [...new Set(slots.map(s => s.streamId))]) {
    const streamSlots = slots.filter(s => s.streamId === streamId)
      .sort((a, b) => a.dayOfWeek !== b.dayOfWeek ? a.dayOfWeek - b.dayOfWeek : a.periodNumber - b.periodNumber);

    for (let i = 0; i < streamSlots.length - 1; i++) {
      const curr = streamSlots[i];
      const next = streamSlots[i + 1];
      if (curr.dayOfWeek === next.dayOfWeek &&
          curr.periodNumber + 1 === next.periodNumber &&
          areSimilarSubjects(curr.subjectName, next.subjectName)) {
        violations.push({
          type:    'SIMILAR_SUBJECTS_CONSECUTIVE',
          message: `Similar subjects consecutive: ${curr.subjectName} → ${next.subjectName} (Day ${curr.dayOfWeek}).`,
          day:     curr.dayOfWeek,
          period:  curr.periodNumber,
          stream:  streamId,
        });
      }
    }
  }

  return violations;
}

// Subjects considered "similar" (language-heavy, numeric, etc.)
function areSimilarSubjects(a: string, b: string): boolean {
  const languageGroup = ['english','kiswahili','ksl','indigenous language'];
  const numericGroup  = ['mathematics','science','integrated science'];
  const aLow = a.toLowerCase();
  const bLow = b.toLowerCase();
  const inSame = (group: string[]) =>
    group.some(g => aLow.includes(g)) && group.some(g => bLow.includes(g));
  return inSame(languageGroup) || inSame(numericGroup);
}

// Get period numbers that are FOLLOWED by a break
function getBreakPeriodNumbers(band: GradeBand): number[] {
  const map: Record<GradeBand, number[]> = {
    pre_primary:    [2, 3],  // P2 before break1, P3 before break2
    grade_1_3:      [2, 4],
    grade_4_6:      [2, 4],
    grade_7_9:      [2, 4],
    foundation:     [2, 4],
    intermediate:   [2, 4],
    pre_vocational: [2, 4],
  };
  return map[band] || [2, 4];
}


// ─────────────────────────────────────────────────────────────
// TIMETABLING COMMITTEE MEMBERS (from guidelines Section 1)
// ─────────────────────────────────────────────────────────────
export const TIMETABLING_COMMITTEE_ROLES = [
  'Deputy Head of Institution (Chairperson)',
  'Senior Teacher',
  'Teacher Representative — Pre-Primary',
  'Teacher Representative — Primary',
  'Teacher Representative — Junior School',
  'Head of Subject / Learning Area',
  'Head of Department',
];

// Boarding school daily schedule (Section Notes)
export const BOARDING_SCHOOL_SCHEDULE = {
  classHours:          { start: '08:00', end: '15:30' },
  coCurricularActivities: { start: '15:30', end: '16:45' },
  selfDirectedActivities: { start: '17:00', end: '19:30' },
  eveningPrep:         { start: '19:30', end: '21:30' },
  bedtime:             { start: '21:30', end: '06:00' },
  supervisedRoutine:   { start: '06:00', end: '08:00' },
};
