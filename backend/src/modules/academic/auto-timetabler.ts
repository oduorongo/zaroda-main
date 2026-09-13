// ── src/modules/academic/auto-timetabler.ts ──────────────────
// Deterministic, KICD-compliant block timetable generator.
// No AI / no external calls — pure constraint solving so it runs reliably on
// any school's server. Writes into the existing `timetable_periods` table so
// the current grid and PDF read it unchanged.
//
// Covers ECDE (pre-primary), Lower Primary (G1–3), Upper Primary (G4–6) and
// Junior School (G7–9), using the official KICD period structures + lesson
// allocations already encoded in kicd-timetable.constants.ts.
//
// Rules enforced (from the MoE/KICD guidelines):
//   • Exact lessons per learning area per week (Tables 1–4).
//   • PPI plotted ONCE per week (Friday, first lesson).
//   • Creative / Creative Arts & Sports / PE plotted in the slot BEFORE a break.
//   • Similar areas (language group; maths/science group) never back-to-back.
//   • At most ONE double lesson per week, only for JS practicals
//     (Integrated Science, Pre-Technical, Agriculture, Creative Arts & Sports).
//   • A teacher is never double-booked in the same day+period across streams.
//   • Even spread of each area across the days of the week.

import { DataSource } from 'typeorm';
import {
  getGradeBand, getPeriodStructure, getLearningAreaAllocations,
  allowsDoubleLesson, mustBeBeforeBreak,
} from './kicd-timetable.constants';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// How many of the day's FIRST periods count as "early morning" for Maths/
// English/Kiswahili (see wantsEarly below). 4, not 3: with Kiswahili added
// to the early-priority group, 3 subjects now compete for the same limited
// pre-break periods (one of which a beforeBreak subject like Creative Arts
// usually also occupies daily) — 3 periods x 5 days wasn't enough room for
// all of them and pushed Maths/English into the afternoon far more than
// before (reported live). Period 4 still ends well before midday in every
// band's period structure, so it's a reasonable widening of "morning".
const EARLY_PERIOD_WINDOW = 4;

// Creative Arts / Creative Arts & Sports (the only `beforeBreak` subjects) were
// consistently grabbing whichever "before a break" period fell earliest in
// the day — a beforeBreak subject has no other placement pull competing with
// that. Reserving only Period 2 wasn't enough: Junior School's structure has
// a SECOND qualifying before-a-break period (Period 4) that also falls inside
// the early window, so CA&S kept eating into Maths/English/Kiswahili's
// capacity there and Maths still ended up double-booked on a day (reported
// live: Grade 7, Maths in the afternoon on a day it was already scheduled).
// Excluding beforeBreak subjects from the ENTIRE early window (not just one
// period within it) closes that gap for every band's structure at once —
// CA/CAS still have at least one other qualifying before-a-break period
// outside the window in every band (before lunch), plus the whole afternoon
// if genuinely needed.

// Similarity groups — members must not follow one another consecutively.
const SIMILAR_GROUPS: string[][] = [
  ['english', 'kiswahili', 'indigenous', 'language', 'lugha', 'literacy', 'ksl', 'sign'],
  ['mathematic', 'math', 'numeracy', 'number', 'science', 'integrated science', 'pre-tech', 'pretechnical', 'pre-technical'],
];

function groupOf(subject: string): number {
  const s = subject.toLowerCase();
  for (let i = 0; i < SIMILAR_GROUPS.length; i++) {
    if (SIMILAR_GROUPS[i].some(k => s.includes(k))) return i;
  }
  return -1;
}

const isPpi = (name: string) => /pastoral|ppi|religious programs/i.test(name);

// Some KICD learning-area labels used here for period allocation (the official
// long-form names, e.g. from the MoE timetable guideline tables) differ in
// wording from the shorter canonical subject names schools actually pick from
// when assigning a teacher to a stream (frontend/lib/cbc/constants.ts
// LEARNING_AREAS — kept short there so marks/report-card columns stay
// readable). Without this, the exact per-stream lookup and even the fuzzy
// substring fallback both failed for these — e.g. "Mathematical Activities"
// (this file) vs "Mathematics Activities" (assignment picker) share no
// contiguous substring — so the subject was plotted with NO teacher, and
// others (e.g. "Kiswahili / Kenya Sign Language" vs "Kiswahili") only ever
// matched via the loose cross-stream fallback instead of the actual per-stream
// assignment, which could pick the wrong teacher. Aliasing to the canonical
// short name before matching fixes both; the timetable still displays the
// full official label (`lesson.subject`, unchanged) either way.
// The "Kiswahili / Kenya Sign Language (KSL)" long forms were dropped from
// kicd-timetable.constants.ts (now plain "Kiswahili"/"Kiswahili Language
// Activities", matching the assignment picker exactly), so those no longer
// need an alias here — kept only the ones still needed.
const SUBJECT_MATCH_ALIASES: Record<string, string> = {
  // ECDE (pre_primary)
  'mathematical activities': 'mathematics activities',
  'creative activities': 'creative arts activities',
  'religious activities': 'religious education activities',
  // Junior School (grade_7_9)
  'social studies (including life skills)': 'social studies',
};
function matchKey(subject: string): string {
  const s = subject.toLowerCase().trim();
  return SUBJECT_MATCH_ALIASES[s] || s;
}

interface Lesson {
  subject: string;
  beforeBreak: boolean;
  double: boolean;     // this lesson is the start of a double (JS practicals)
  groupId: number;
}

interface PlacedSlot {
  day: string;
  periodLabel: string;
  periodNumber: number;
  subject: string;
  teacherId: string | null;
  teacherName: string | null;
  dayOrder: number;
  periodOrder: number;
}

export interface AutoTimetableResult {
  streamId: string;
  streamName: string;
  gradeLevel: string;
  placed: number;
  expected: number;
  unplaced: string[];
  warnings: string[];
}

// A teacher available to teach a subject.
interface TeacherOpt { id: string; name: string; subjects: string[]; streamId?: string | null; }

export class AutoTimetabler {
  constructor(private ds: DataSource) {}

  // Global teacher usage across all streams in one generation run:
  //   teacherId -> Set of "day|periodNumber"
  private teacherUsage = new Map<string, Set<string>>();
  // Exact per-stream assignment: `${streamId}|${subject.toLowerCase()}` → teacherId
  private streamSubjectTeacher = new Map<string, string>();
  // Once the fuzzy fallback (step 2 below) picks a teacher for a given
  // `${streamId}|${subject}` with no exact assignment on record, remember that
  // choice and reuse it for every other lesson of the same subject+stream this
  // run — otherwise, if that person happened to be busy for one particular
  // lesson's slot but free for others, the fallback would search again from
  // scratch and could land on a DIFFERENT teacher for a different lesson of the
  // exact same subject in the exact same class (reported live: "Kiswahili
  // Grade 5 is assigned to more than 1 teacher").
  private fallbackTeacherChosen = new Map<string, string>();

  private isTeacherFree(teacherId: string, day: string, periodNumber: number) {
    const used = this.teacherUsage.get(teacherId);
    return !used || !used.has(`${day}|${periodNumber}`);
  }
  private markTeacher(teacherId: string, day: string, periodNumber: number) {
    if (!this.teacherUsage.has(teacherId)) this.teacherUsage.set(teacherId, new Set());
    this.teacherUsage.get(teacherId)!.add(`${day}|${periodNumber}`);
  }

  // Pick a teacher for a subject+stream who is free at this day/period.
  // `classTeacherId`, when given, is this stream's own class teacher — the last-
  // resort fallback for ECDE/Lower Primary, where (per actual Kenyan primary
  // practice, and consistent with SchemeService.assertAssignedToTeach elsewhere
  // in this app) one class teacher normally teaches every subject for their own
  // class rather than schools running subject specialists that young.
  private pickTeacher(
    subject: string, streamId: string, teachers: TeacherOpt[], day: string, periodNumber: number,
    classTeacherId?: string | null,
  ): TeacherOpt | null {
    const sl = matchKey(subject);

    // 1) EXACT per-stream assignment wins: the teacher set to teach this subject in THIS stream.
    const exactId = this.streamSubjectTeacher.get(`${streamId}|${sl}`);
    if (exactId) {
      const exact = teachers.find(t => t.id === exactId);
      if (exact && this.isTeacherFree(exact.id, day, periodNumber)) return exact;
      // If assigned but busy this slot, leave unassigned rather than picking someone else.
      if (exact) return null;
    }

    // 2) Fallback (no per-stream assignment): any teacher who lists this subject —
    // but once chosen for this subject+stream, stick with them (see
    // fallbackTeacherChosen above) instead of re-searching per lesson.
    const cacheKey = `${streamId}|${sl}`;
    const chosenId = this.fallbackTeacherChosen.get(cacheKey);
    if (chosenId) {
      const chosen = teachers.find(t => t.id === chosenId);
      if (chosen && this.isTeacherFree(chosen.id, day, periodNumber)) return chosen;
      // Busy this slot — leave unassigned rather than substituting someone else
      // for just this one lesson (same principle as the exact-assignment case).
      if (chosen) return null;
    }

    const matches = teachers.filter(t =>
      t.subjects.some(sub => {
        const a = matchKey(sub);
        return a === sl || a.includes(sl) || sl.includes(a);
      }),
    );
    const ordered = [
      ...matches.filter(t => t.streamId === streamId),
      ...matches.filter(t => t.streamId !== streamId),
    ];
    for (const t of ordered) {
      if (this.isTeacherFree(t.id, day, periodNumber)) {
        this.fallbackTeacherChosen.set(cacheKey, t.id);
        return t;
      }
    }

    // 3) Last resort: this stream's own class teacher, if free — covers subjects
    // with no dedicated assignment-picker entry at all (e.g. Indigenous Language
    // Activities) and schools that never bothered assigning per-subject teachers
    // for their youngest classes.
    if (classTeacherId) {
      const ct = teachers.find(t => t.id === classTeacherId);
      if (ct && this.isTeacherFree(ct.id, day, periodNumber)) return ct;
    }
    return null;
  }

  // Build the pool of individual lessons for a grade band.
  private buildLessonPool(gradeLevel: string): Lesson[] {
    const band = getGradeBand(gradeLevel);
    const allocations = getLearningAreaAllocations(band);
    const canDouble = allowsDoubleLesson(band);
    const pool: Lesson[] = [];

    for (const a of allocations) {
      if (isPpi(a.name)) { continue; } // PPI handled separately (once, Friday)
      let remaining = a.lessons;
      const wantsDouble = canDouble && (a as any).doubleAllowed;
      // For a double-allowed practical, make the first two lessons a double block.
      if (wantsDouble && remaining >= 2) {
        pool.push({ subject: a.name, beforeBreak: !!a.beforeBreak, double: true, groupId: groupOf(a.name) });
        remaining -= 2; // the double consumes two slots but is plotted as one placement that fills 2
      }
      for (let i = 0; i < remaining; i++) {
        pool.push({ subject: a.name, beforeBreak: !!a.beforeBreak, double: false, groupId: groupOf(a.name) });
      }
    }
    return pool;
  }

  // Generate one stream's timetable (in memory). Returns placed slots + diagnostics.
  private planStream(
    stream: { id: string; name: string; gradeLevel: string; classTeacherId?: string | null },
    teachers: TeacherOpt[],
  ): { slots: PlacedSlot[]; result: AutoTimetableResult } {
    const band = getGradeBand(stream.gradeLevel);
    // Class-teacher fallback only for the bands where that's actually how Kenyan
    // primary schools run (one teacher, whole class) — Upper Primary/Junior
    // School have real subject specialists, so an unassigned subject there
    // should surface as unplaced/no-teacher rather than being silently
    // absorbed by whoever happens to be the class teacher.
    const classTeacherId = ['pre_primary', 'grade_1_3'].includes(band) ? stream.classTeacherId : null;
    const structure = getPeriodStructure(band);
    // Lesson periods only, in order; remember which are "before a break".
    const lessonPeriods = structure.filter(p => p.type === 'lesson');
    // A lesson period is "before break" if the very next structure entry is a break/lunch.
    const beforeBreakNums = new Set<number>();
    for (let i = 0; i < structure.length; i++) {
      if (structure[i].type === 'lesson') {
        const next = structure[i + 1];
        if (next && (next.type === 'break' || next.type === 'lunch')) beforeBreakNums.add(structure[i].period);
      }
    }

    const pool = this.buildLessonPool(stream.gradeLevel);
    const warnings: string[] = [];

    // ── Per-day repetition cap ──────────────────────────────────────
    // A learning area may appear at most ONCE per day, EXCEPT where its weekly
    // allocation exceeds the 5 weekdays — then it needs (lessons - 5) day(s) with a
    // second lesson. e.g. Creative Arts/Activities = 6/week → exactly ONE day may have
    // two; everything else stays once per day. For JS, the only twice-in-a-day case is
    // the practical DOUBLE (two adjacent periods), handled separately below.
    const weeklyAlloc: Record<string, number> = {};
    for (const a of getLearningAreaAllocations(band)) {
      if (!isPpi(a.name)) weeklyAlloc[a.name.toLowerCase()] = a.lessons;
    }
    const numDays = DAYS.length; // 5
    // How many days this subject is ALLOWED to carry a 2nd lesson this week.
    const doubleUpDaysAllowed = (subject: string): number => {
      const n = weeklyAlloc[subject.toLowerCase()] || 0;
      return Math.max(0, n - numDays);
    };
    // Track, per subject, how many days already have 2 of it.
    const doubleUpDaysUsed: Record<string, number> = {};

    // Grid: day -> periodNumber -> placed subject (string) | null
    const grid: Record<string, Record<number, PlacedSlot | null>> = {};
    DAYS.forEach(d => { grid[d] = {}; lessonPeriods.forEach(p => { grid[d][p.period] = null; }); });

    // 1) PPI placement.
    //    If this band has a DEDICATED ppi slot in its structure (Junior School — Friday
    //    after 3:20 pm), use it: PPI does NOT consume a learning-area lesson, so all daily
    //    lessons fit. Otherwise (ECDE/primary) PPI takes Friday's first lesson slot.
    const dedicatedPpi = structure.find(p => p.type === 'ppi');
    const firstPeriod = lessonPeriods[0]?.period;
    let ppiSlot: PlacedSlot | null = null;
    if (dedicatedPpi) {
      ppiSlot = {
        day: 'Friday',
        periodLabel: dedicatedPpi.label || 'PPI',
        periodNumber: 999,
        subject: 'Pastoral Programme of Instruction (PPI)',
        teacherId: null, teacherName: null,
        dayOrder: DAYS.indexOf('Friday'), periodOrder: 999,
      };
    } else if (firstPeriod != null) {
      grid['Friday'][firstPeriod] = this.place('Friday', lessonPeriods[0], 'Pastoral Programme of Instruction (PPI)', null, null, lessonPeriods);
    }

    // Mathematics, English & Kiswahili are core literacy/numeracy — schedule
    // them in the first three periods of the day where possible. Defined before
    // the pool sort below since it now needs this to rank placement priority,
    // not just scoring.
    const wantsEarly = (subject: string): boolean => {
      const s = subject.toLowerCase();
      return /\bmathematic|\bmaths?\b|\benglish\b|\bkiswahili\b/.test(s);
    };

    // 2) Order the pool. Doubles and before-break subjects (rare — usually just
    //    one practical/Creative Arts area) are placed first in a flat pass, same
    //    as before: they're few enough that sequencing them against each other
    //    barely matters.
    //
    //    Every ORDINARY subject, though, is placed ROUND-ROBIN rather than one
    //    subject fully finished before the next starts. Fully placing subjects
    //    one at a time (even in a good priority order — tried fewest-lessons-
    //    first, then wants-early-first) kept hitting the same failure mode:
    //    whichever subject got processed first in its tier greedily claimed
    //    whichever 4-5 days it liked, and by the time same-tier subjects with
    //    an EQUAL weekly count (e.g. Kiswahili/Science & Technology/Agriculture,
    //    all 4/week in Upper Primary) got their turn, Monday–Wednesday were
    //    already fully saturated — leaving the last one of the tied group only
    //    2 days to work with for its 4 required lessons, forcing it to double
    //    up on both of them (exactly what was reported: Agriculture twice on
    //    both Thursday AND Friday, despite being under the 5/week threshold
    //    that's supposed to forbid appearing twice in a single day).
    //
    //    Round-robin fixes the "one subject hogs the week" failure at the
    //    root: round 1 gives every subject in a group its FIRST lesson before
    //    anyone gets a second; round 2 gives everyone still needing more their
    //    second, and so on. Subjects with equal weekly counts now compete for
    //    each round's slot at the same time instead of one exhausting the
    //    week before the next has a chance.
    //
    //    But round-robin has its own edge case: in a zero-slack week (total
    //    demand exactly equals total capacity — common once PPI/breaks are
    //    accounted for), EXACTLY one lesson somewhere must go unplaced or
    //    double up a day. Which subject absorbs that is decided by who's
    //    still "in play" in the final round — and since a subject needs more
    //    rounds the more lessons/week it has, the interleaved round-robin
    //    structurally exposes the HIGHEST-count subjects to that risk, not
    //    the smallest one (confirmed live: Mathematical Activities landed on
    //    4/5 instead of a smaller, less core area yielding). Running
    //    "wants early" subjects (Maths/English/Kiswahili) as their OWN
    //    round-robin phase, fully placed before the ordinary phase even
    //    starts, guarantees they claim their full allocation from the whole
    //    week's capacity first — any unavoidable zero-slack shortfall then
    //    lands on an ordinary subject instead, same as originally intended.
    const lessonsBySubject: Record<string, number> = {};
    pool.forEach(u => { lessonsBySubject[u.subject] = (lessonsBySubject[u.subject] || 0) + 1; });

    const specialFirst = pool.filter(l => l.double || l.beforeBreak)
      .sort((a, b) => (a.double === b.double ? 0 : a.double ? -1 : 1));
    const remaining = pool.filter(l => !l.double && !l.beforeBreak);

    const roundRobinPhase = (lessons: Lesson[], subjectOrder: string[]): Lesson[] => {
      const queueBySubject: Record<string, Lesson[]> = {};
      for (const l of lessons) (queueBySubject[l.subject] ||= []).push(l);
      const out: Lesson[] = [];
      for (let more = true; more; ) {
        more = false;
        for (const subj of subjectOrder) {
          const q = queueBySubject[subj];
          if (q?.length) { out.push(q.shift()!); more = true; }
        }
      }
      return out;
    };
    const byAscendingCount = (subjects: string[]) =>
      subjects.sort((a, b) => (lessonsBySubject[a] || 0) - (lessonsBySubject[b] || 0));

    const earlyLessons = remaining.filter(l => wantsEarly(l.subject));
    const ordinaryLessons = remaining.filter(l => !wantsEarly(l.subject));
    const earlyRoundRobin = roundRobinPhase(earlyLessons, byAscendingCount(Array.from(new Set(earlyLessons.map(l => l.subject)))));
    const ordinaryRoundRobin = roundRobinPhase(ordinaryLessons, byAscendingCount(Array.from(new Set(ordinaryLessons.map(l => l.subject)))));
    const roundRobin = [...earlyRoundRobin, ...ordinaryRoundRobin];

    pool.length = 0;
    pool.push(...specialFirst, ...roundRobin);

    const expected = pool.length + 1; // learning-area lessons + the one weekly PPI
    const unplaced: string[] = [];

    // Helper: does placing `subject` at (day,periodNumber) break the "no similar back-to-back" rule?
    const similarAdjacent = (day: string, periodNumber: number, gid: number): boolean => {
      if (gid < 0) return false;
      const idx = lessonPeriods.findIndex(p => p.period === periodNumber);
      const prev = lessonPeriods[idx - 1], next = lessonPeriods[idx + 1];
      for (const nb of [prev, next]) {
        if (!nb) continue;
        const cell = grid[day][nb.period];
        if (cell && groupOf(cell.subject) === gid) return true;
      }
      return false;
    };
    const countOnDay = (day: string, subject: string): number =>
      lessonPeriods.reduce((n, p) => n + (grid[day][p.period]?.subject === subject ? 1 : 0), 0);
    // Has this subject already landed in this exact period-of-day on some OTHER
    // day this week? Used to stop a subject camping in the same period every
    // day (e.g. English always Period 1) — a learning area should vary its
    // period across the week. Creative Arts / Creative Arts & Sports are the
    // deliberate exception: they're the `beforeBreak` subjects, which by
    // definition must sit in whichever period sits right before a break, so
    // they're expected to repeat that same period daily.
    const periodUsedByOtherDay = (subject: string, periodNumber: number): boolean =>
      DAYS.some(d => grid[d][periodNumber]?.subject === subject);

    // 3) Place each lesson.
    for (const lesson of pool) {
      // Resolve this lesson's exact per-stream teacher (if one is assigned) BEFORE
      // picking a slot, not after — with several streams generated in one run
      // (e.g. Grades 7–9 sharing one subject teacher), the same teacher is very
      // often already booked at whatever slot looks "best" for THIS stream purely
      // by subject-placement heuristics. Checking their real availability only
      // after committing to a slot meant that slot got left teacherless instead
      // of the search trying a different day/period where they're actually free —
      // reported live as learning areas suddenly missing their teacher once
      // several streams were generated together. Threading availability into the
      // search itself (main pass + both relax passes below) fixes that; only the
      // final two "fill the grid no matter what" fallbacks ignore it, so a
      // genuinely over-committed teacher still yields a filled (if teacherless)
      // slot rather than a permanently blank one.
      const exactTeacherId = this.streamSubjectTeacher.get(`${stream.id}|${matchKey(lesson.subject)}`);
      const exactTeacherFree = (day: string, periodNumber: number) =>
        !exactTeacherId || this.isTeacherFree(exactTeacherId, day, periodNumber);

      let best: { day: string; period: any } | null = null;
      let bestScore = -Infinity;

      for (const day of DAYS) {
        for (let pi = 0; pi < lessonPeriods.length; pi++) {
          const p = lessonPeriods[pi];
          if (grid[day][p.period]) continue;                       // slot taken
          if (lesson.beforeBreak && !beforeBreakNums.has(p.period)) continue; // must be before a break
          if (lesson.beforeBreak && pi < EARLY_PERIOD_WINDOW) continue; // reserved for Maths/English/Kiswahili
          if (lesson.double) {
            const nextP = lessonPeriods[pi + 1];
            if (!nextP || grid[day][nextP.period]) continue;       // need 2 consecutive free
            if (!exactTeacherFree(day, p.period) || !exactTeacherFree(day, nextP.period)) continue;
          } else if (!exactTeacherFree(day, p.period)) continue;
          if (similarAdjacent(day, p.period, lesson.groupId)) continue;

          // Mathematics, English & Kiswahili should sit in the early periods of
          // the day. Enforced in the main pass; relaxed fallbacks below only
          // trigger if the early window is already full.
          if (wantsEarly(lesson.subject) && pi >= EARLY_PERIOD_WINDOW) continue;

          // Hard per-day cap: a subject may not appear twice in a day unless its weekly
          // allocation earns it a double-up day and one is still available.
          if (!lesson.double) {
            const already = countOnDay(day, lesson.subject);
            if (already >= 1) {
              const allowance = doubleUpDaysAllowed(lesson.subject);
              const usedElsewhere = doubleUpDaysUsed[lesson.subject.toLowerCase()] || 0;
              if (already >= 2 || usedElsewhere >= allowance) continue;
            }
          }

          // Score: prefer days where this subject isn't already plotted (even spread),
          // and prefer earlier days/periods for determinism.
          const onDay = countOnDay(day, lesson.subject);
          let score = -onDay * 100 - DAYS.indexOf(day) - pi * 0.1;
          // Extra pull toward the very front for Maths/English/Kiswahili.
          if (wantsEarly(lesson.subject)) score += (EARLY_PERIOD_WINDOW - pi) * 5;
          // Steer away from repeating the same period-of-day this subject already
          // used — a strong preference, not an absolute ban, since "wants early"
          // subjects (only 3 legal periods for up to 5 daily lessons) can be
          // mathematically forced to repeat one; Creative Arts/Creative Arts &
          // Sports are meant to repeat theirs every day, so they're exempt.
          if (!lesson.beforeBreak && periodUsedByOtherDay(lesson.subject, p.period)) score -= 30;
          if (score > bestScore) { bestScore = score; best = { day, period: p }; }
        }
      }

      // Relax the before-break rule if nothing fit (still valid, just less ideal).
      // The early window stays reserved for Maths/English/Kiswahili even here —
      // CA/CAS should genuinely prefer the afternoon over taking it back.
      if (!best && lesson.beforeBreak) {
        for (const day of DAYS) {
          for (let pi = 0; pi < lessonPeriods.length; pi++) {
            const p = lessonPeriods[pi];
            if (grid[day][p.period]) continue;
            if (pi < EARLY_PERIOD_WINDOW) continue;
            if (!exactTeacherFree(day, p.period)) continue;
            if (similarAdjacent(day, p.period, lesson.groupId)) continue;
            if (!lesson.double && countOnDay(day, lesson.subject) >= 1) {
              const allowance = doubleUpDaysAllowed(lesson.subject);
              if (countOnDay(day, lesson.subject) >= 2 || (doubleUpDaysUsed[lesson.subject.toLowerCase()] || 0) >= allowance) continue;
            }
            best = { day, period: p }; break;
          }
          if (best) break;
        }
      }
      // Last resort: any free slot where the assigned teacher is still free —
      // still honour the per-day cap so nothing appears twice in a day beyond
      // its earned allowance.
      if (!best) {
        for (const day of DAYS) {
          for (let pi = 0; pi < lessonPeriods.length; pi++) {
            const p = lessonPeriods[pi];
            if (grid[day][p.period]) continue;
            if (lesson.beforeBreak && pi < EARLY_PERIOD_WINDOW) continue;
            if (!exactTeacherFree(day, p.period)) continue;
            if (!lesson.double && countOnDay(day, lesson.subject) >= 1) {
              const allowance = doubleUpDaysAllowed(lesson.subject);
              if (countOnDay(day, lesson.subject) >= 2 || (doubleUpDaysUsed[lesson.subject.toLowerCase()] || 0) >= allowance) continue;
            }
            best = { day, period: p }; break;
          }
          if (best) break;
        }
      }
      // Give up on the early-window reservation too, but still respect the day cap —
      // a genuinely over-committed teacher (assigned to more lessons than the
      // week has slots for) shouldn't leave the subject entirely unplaced.
      if (!best) {
        for (const day of DAYS) {
          for (const p of lessonPeriods) {
            if (grid[day][p.period]) continue;
            if (!lesson.double && countOnDay(day, lesson.subject) >= 1) {
              const allowance = doubleUpDaysAllowed(lesson.subject);
              if (countOnDay(day, lesson.subject) >= 2 || (doubleUpDaysUsed[lesson.subject.toLowerCase()] || 0) >= allowance) continue;
            }
            best = { day, period: p }; break;
          }
          if (best) break;
        }
      }
      // Absolute last resort: this greedy, non-backtracking placer can still box
      // itself into a corner in a zero-slack week (total weekly lessons across
      // every learning area exactly equal to total period slots, e.g. Upper
      // Primary's 34 + 1 PPI = 35 = 7 periods × 5 days) — an earlier subject can
      // take a day this one needed, even with the priority ordering above doing
      // its best to avoid that. When that happens, a genuinely BLANK grid cell
      // (visible, unmistakably wrong — a period with no lesson and no teacher at
      // all) is worse than this subject appearing on a day it's already on, so
      // fill any remaining free slot outright rather than leave it empty.
      if (!best) {
        for (const day of DAYS) {
          for (const p of lessonPeriods) {
            if (grid[day][p.period]) continue;
            best = { day, period: p }; break;
          }
          if (best) break;
        }
      }

      if (!best) { unplaced.push(lesson.subject); continue; }

      // If this placement makes the subject's 2nd on that day, spend a double-up day.
      if (!lesson.double && countOnDay(best.day, lesson.subject) >= 1) {
        const k = lesson.subject.toLowerCase();
        doubleUpDaysUsed[k] = (doubleUpDaysUsed[k] || 0) + 1;
      }

      const pi = lessonPeriods.findIndex(p => p.period === best!.period.period);
      const tchr = this.pickTeacher(lesson.subject, stream.id, teachers, best.day, best.period.period, classTeacherId);
      grid[best.day][best.period.period] = this.place(best.day, best.period, lesson.subject, tchr?.id || null, tchr?.name || null, lessonPeriods);
      if (tchr) this.markTeacher(tchr.id, best.day, best.period.period);

      // Place the second half of a double in the next consecutive slot.
      if (lesson.double) {
        const nextP = lessonPeriods[pi + 1];
        if (nextP && !grid[best.day][nextP.period]) {
          grid[best.day][nextP.period] = this.place(best.day, nextP, lesson.subject, tchr?.id || null, tchr?.name || null, lessonPeriods);
          if (tchr) this.markTeacher(tchr.id, best.day, nextP.period);
        }
      }
    }

    // Flatten grid → slots
    const slots: PlacedSlot[] = [];
    DAYS.forEach(d => lessonPeriods.forEach(p => { const c = grid[d][p.period]; if (c) slots.push(c); }));
    if (ppiSlot) slots.push(ppiSlot);  // dedicated JS Friday PPI (after 3:20 pm)

    const placed = slots.length;
    if (unplaced.length === 1) {
      // Expected only on Lower Primary (31→30) where PPI takes a daily slot: one lower-priority
      // lesson yields, exactly as the KICD sample timetable (Appendix 2) does.
      warnings.push(`${unplaced[0]} has one fewer lesson this week (PPI occupies a slot), per the KICD sample timetable.`);
    } else if (unplaced.length > 1) {
      warnings.push(`${unplaced.length} lesson(s) could not be placed and were skipped — review teacher load/streams.`);
    }

    return {
      slots,
      result: { streamId: stream.id, streamName: stream.name, gradeLevel: stream.gradeLevel, placed, expected, unplaced, warnings },
    };
  }

  private place(day: string, period: any, subject: string, teacherId: string | null, teacherName: string | null, lessonPeriods: any[]): PlacedSlot {
    return {
      day,
      periodLabel: `Period ${period.period}`,
      periodNumber: period.period,
      subject,
      teacherId,
      teacherName,
      dayOrder: DAYS.indexOf(day),
      periodOrder: lessonPeriods.findIndex(p => p.period === period.period),
    };
  }

  // ── Public: generate for one or many streams, write to DB ────
  async generate(tenantId: string, streamIds: string[] | null): Promise<{ results: AutoTimetableResult[] }> {
    // Load streams
    const allStreams = await this.ds.query(
      `SELECT id::text AS id, name, grade_level AS "gradeLevel", class_teacher_id::text AS "classTeacherId"
         FROM streams WHERE tenant_id::text = $1`,
      [tenantId],
    );
    const streams = (streamIds && streamIds.length)
      ? allStreams.filter((s: any) => streamIds.includes(s.id))
      : allStreams;
    if (!streams.length) return { results: [] };

    // Load teachers (subjects comma-string → array). Includes hoi/dhois — the
    // school signup flow makes the founding admin a 'hoi' by default (see
    // AuthService.signup), and Heads/Deputy Heads very commonly keep an actual
    // teaching load, especially at smaller schools. Excluding them meant any
    // subject assigned to the HOI in teacher_stream_subjects could never resolve
    // to a teacher here at all — they were never in this candidate pool to match
    // against, regardless of the subject name matching itself.
    const teacherRows = await this.ds.query(
      `SELECT id::text AS id, first_name AS "firstName", last_name AS "lastName",
              subjects, stream_id::text AS "streamId"
       FROM users
       WHERE tenant_id::text = $1
         AND role IN ('class_teacher','subject_teacher','overall_class_teacher','hoi','dhois')`,
      [tenantId],
    ).catch(() => []);
    const teachers: TeacherOpt[] = teacherRows.map((t: any) => ({
      id: t.id,
      name: `${t.firstName} ${t.lastName}`.trim(),
      streamId: t.streamId,
      subjects: typeof t.subjects === 'string' && t.subjects.length
        ? t.subjects.split(',').map((s: string) => s.trim()).filter(Boolean)
        : Array.isArray(t.subjects) ? t.subjects : [],
    }));

    // Precise per-stream assignments: which teacher teaches which subject in which stream.
    // Key: `${streamId}|${subject.toLowerCase()}` → teacherId
    const streamSubjectRows = await this.ds.query(
      `SELECT teacher_id::text AS "teacherId", stream_id::text AS "streamId", subject
         FROM teacher_stream_subjects WHERE tenant_id::text = $1`,
      [tenantId],
    ).catch(() => []);
    this.streamSubjectTeacher = new Map();
    for (const r of streamSubjectRows) {
      this.streamSubjectTeacher.set(`${r.streamId}|${matchKey(String(r.subject))}`, r.teacherId);
    }

    // Reset cross-stream teacher usage for this run
    this.teacherUsage = new Map();
    this.fallbackTeacherChosen = new Map();

    const results: AutoTimetableResult[] = [];

    // Plan all streams (in memory), then persist in one transaction.
    const allSlots: { streamId: string; slots: PlacedSlot[] }[] = [];
    // Plot larger grade bands first (junior) so their teacher needs are reserved first.
    const order = [...streams].sort((a, b) => bandRank(b.gradeLevel) - bandRank(a.gradeLevel));
    for (const s of order) {
      const { slots, result } = this.planStream(s, teachers);
      allSlots.push({ streamId: s.id, slots });
      results.push(result);
    }

    await this.ds.transaction(async (m) => {
      for (const { streamId, slots } of allSlots) {
        // Replace this stream's timetable
        await m.query(`DELETE FROM timetable_periods WHERE tenant_id = $1 AND stream_id = $2`, [tenantId, streamId]);
        for (const sl of slots) {
          await m.query(
            `INSERT INTO timetable_periods
               (tenant_id, stream_id, day, period_label, subject, teacher_id, teacher_name, day_order, period_order, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
            [tenantId, streamId, sl.day, sl.periodLabel, sl.subject, sl.teacherId, sl.teacherName, sl.dayOrder, sl.periodOrder],
          );
        }
      }
    });

    // Sort results back to the streams' natural order
    results.sort((a, b) => a.streamName.localeCompare(b.streamName));
    return { results };
  }

  // Whole-school master grid: every stream's lessons grouped by day/period.
  async masterGrid(tenantId: string) {
    const rows = await this.ds.query(
      `SELECT tp.stream_id::text AS "streamId", s.name AS "streamName", s.grade_level AS "gradeLevel",
              tp.day, tp.period_label AS "periodLabel", tp.subject,
              tp.teacher_name AS "teacherName", tp.day_order AS "dayOrder", tp.period_order AS "periodOrder"
       FROM timetable_periods tp
       JOIN streams s ON s.id = tp.stream_id
       WHERE tp.tenant_id = $1
       ORDER BY s.name, tp.day_order, tp.period_order`,
      [tenantId],
    ).catch(() => []);
    return { lessons: rows };
  }
}

// Rank grade bands so junior (most subjects/teachers) is scheduled first.
function bandRank(gradeLevel: string): number {
  const b = getGradeBand(gradeLevel);
  return { grade_7_9: 4, grade_4_6: 3, grade_1_3: 2, pre_primary: 1, foundation: 1, intermediate: 2, pre_vocational: 4 }[b] ?? 1;
}
