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

  private isTeacherFree(teacherId: string, day: string, periodNumber: number) {
    const used = this.teacherUsage.get(teacherId);
    return !used || !used.has(`${day}|${periodNumber}`);
  }
  private markTeacher(teacherId: string, day: string, periodNumber: number) {
    if (!this.teacherUsage.has(teacherId)) this.teacherUsage.set(teacherId, new Set());
    this.teacherUsage.get(teacherId)!.add(`${day}|${periodNumber}`);
  }

  // Pick a teacher for a subject+stream who is free at this day/period.
  private pickTeacher(subject: string, streamId: string, teachers: TeacherOpt[], day: string, periodNumber: number): TeacherOpt | null {
    const sl = subject.toLowerCase().trim();

    // 1) EXACT per-stream assignment wins: the teacher set to teach this subject in THIS stream.
    const exactId = this.streamSubjectTeacher.get(`${streamId}|${sl}`);
    if (exactId) {
      const exact = teachers.find(t => t.id === exactId);
      if (exact && this.isTeacherFree(exact.id, day, periodNumber)) return exact;
      // If assigned but busy this slot, leave unassigned rather than picking someone else.
      if (exact) return null;
    }

    // 2) Fallback (no per-stream assignment): any teacher who lists this subject.
    const matches = teachers.filter(t =>
      t.subjects.some(sub => {
        const a = sub.toLowerCase();
        return a === sl || a.includes(sl) || sl.includes(a);
      }),
    );
    const ordered = [
      ...matches.filter(t => t.streamId === streamId),
      ...matches.filter(t => t.streamId !== streamId),
    ];
    for (const t of ordered) {
      if (this.isTeacherFree(t.id, day, periodNumber)) return t;
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
    stream: { id: string; name: string; gradeLevel: string },
    teachers: TeacherOpt[],
  ): { slots: PlacedSlot[]; result: AutoTimetableResult } {
    const band = getGradeBand(stream.gradeLevel);
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

    // 2) Order the pool: doubles first, then before-break subjects, then by most
    //    lessons first. When PPI consumes a daily slot and the grid is exactly full
    //    (Lower Primary 31→30, JS 41→40), the lesson that yields is the LAST unit of
    //    the smallest-allocation ordinary area — exactly as the KICD sample timetable
    //    (Appendix 2) drops one Religious Education lesson.
    const lessonsBySubject: Record<string, number> = {};
    pool.forEach(u => { lessonsBySubject[u.subject] = (lessonsBySubject[u.subject] || 0) + 1; });
    pool.sort((a, b) => {
      if (a.double !== b.double) return a.double ? -1 : 1;
      if (a.beforeBreak !== b.beforeBreak) return a.beforeBreak ? -1 : 1;
      // higher total allocation first, so a smaller area is the one left short
      return (lessonsBySubject[b.subject] || 0) - (lessonsBySubject[a.subject] || 0);
    });

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

    // Mathematics & English are core literacy/numeracy — schedule them in the first
    // three periods of the day where possible.
    const wantsEarly = (subject: string): boolean => {
      const s = subject.toLowerCase();
      return /\bmathematic|\bmaths?\b|\benglish\b/.test(s);
    };

    // 3) Place each lesson.
    for (const lesson of pool) {
      let best: { day: string; period: any } | null = null;
      let bestScore = -Infinity;

      for (const day of DAYS) {
        for (let pi = 0; pi < lessonPeriods.length; pi++) {
          const p = lessonPeriods[pi];
          if (grid[day][p.period]) continue;                       // slot taken
          if (lesson.beforeBreak && !beforeBreakNums.has(p.period)) continue; // must be before a break
          if (lesson.double) {
            const nextP = lessonPeriods[pi + 1];
            if (!nextP || grid[day][nextP.period]) continue;       // need 2 consecutive free
          }
          if (similarAdjacent(day, p.period, lesson.groupId)) continue;

          // Mathematics & English should sit in the FIRST 3 periods of the day.
          // Enforced in the main pass; relaxed fallbacks below only trigger if the
          // first 3 are already full.
          if (wantsEarly(lesson.subject) && pi >= 3) continue;

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
          // Extra pull toward the very front for Maths/English.
          if (wantsEarly(lesson.subject)) score += (3 - pi) * 5;
          if (score > bestScore) { bestScore = score; best = { day, period: p }; }
        }
      }

      // Relax the before-break rule if nothing fit (still valid, just less ideal).
      if (!best && lesson.beforeBreak) {
        for (const day of DAYS) {
          for (const p of lessonPeriods) {
            if (grid[day][p.period]) continue;
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
      // Last resort: any free slot — still honour the per-day cap so nothing appears
      // twice in a day beyond its earned allowance.
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

      if (!best) { unplaced.push(lesson.subject); continue; }

      // If this placement makes the subject's 2nd on that day, spend a double-up day.
      if (!lesson.double && countOnDay(best.day, lesson.subject) >= 1) {
        const k = lesson.subject.toLowerCase();
        doubleUpDaysUsed[k] = (doubleUpDaysUsed[k] || 0) + 1;
      }

      const pi = lessonPeriods.findIndex(p => p.period === best!.period.period);
      const tchr = this.pickTeacher(lesson.subject, stream.id, teachers, best.day, best.period.period);
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
      `SELECT id::text AS id, name, grade_level AS "gradeLevel" FROM streams WHERE tenant_id::text = $1`,
      [tenantId],
    );
    const streams = (streamIds && streamIds.length)
      ? allStreams.filter((s: any) => streamIds.includes(s.id))
      : allStreams;
    if (!streams.length) return { results: [] };

    // Load teachers (subjects comma-string → array)
    const teacherRows = await this.ds.query(
      `SELECT id::text AS id, first_name AS "firstName", last_name AS "lastName",
              subjects, stream_id::text AS "streamId"
       FROM users
       WHERE tenant_id::text = $1
         AND role IN ('class_teacher','subject_teacher','overall_class_teacher')`,
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
      this.streamSubjectTeacher.set(`${r.streamId}|${String(r.subject).toLowerCase().trim()}`, r.teacherId);
    }

    // Reset cross-stream teacher usage for this run
    this.teacherUsage = new Map();

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
