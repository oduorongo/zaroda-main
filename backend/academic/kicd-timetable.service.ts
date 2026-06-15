// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// UPDATED MODULE 02: Timetable Service — KICD Compliant
// Uses: Kenya MoE CBE Timetabling Guidelines (official doc)
// Replaces: generic timetable generation in academic-core.service.ts
// ============================================================

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import {
  getGradeBand, getPeriodStructure, getLearningAreaAllocations,
  getLessonDurationMinutes, getLessonsPerWeek, allowsDoubleLesson,
  mustBeBeforeBreak, validateTimetable, calculateJuniorCbe,
  calculatePrimaryCbe, getBreakPeriodNumbers,
  GRADE_7_9_ALLOCATIONS,
} from './kicd-timetable.constants';

// ─────────────────────────────────────────────────────────────
// KICD-COMPLIANT TIMETABLE SERVICE
// ─────────────────────────────────────────────────────────────
@Injectable()
export class KicdTimetableService {
  private claude: Anthropic;

  constructor(
    @InjectRepository(TimetableSlot)     private slotRepo:       Repository<TimetableSlot>,
    @InjectRepository(TeacherAllocation) private allocationRepo: Repository<TeacherAllocation>,
    @InjectRepository(StreamSubject)     private streamSubjRepo: Repository<StreamSubject>,
    @InjectRepository(Stream)           private streamRepo:      Repository<Stream>,
    private dataSource: DataSource,
  ) {
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  // ── GENERATE KICD-COMPLIANT TIMETABLE ─────────────────────
  async generate(tenantId: string, dto: GenerateTimetableDto) {
    const { schoolId, academicYear, term, streamIds } = dto;

    // 1. Fetch streams
    const qb = this.streamRepo.createQueryBuilder('s')
      .where('s.tenant_id = :tenantId AND s.school_id = :schoolId', { tenantId, schoolId })
      .andWhere('s.academic_year = :academicYear AND s.term = :term', { academicYear, term })
      .andWhere('s.is_active = true');
    if (streamIds?.length) qb.andWhere('s.id IN (:...streamIds)', { streamIds });
    const streams = await qb.getMany();
    if (streams.length === 0) throw new NotFoundException('No active streams found');

    // 2. Determine grade band (from first stream — validate all are same band)
    const band = getGradeBand(streams[0].gradeLevel);
    const periods    = getPeriodStructure(band).filter(p => p.type === 'lesson');
    const lessonSlots = periods.map(p => p.period);
    const allocations = getLearningAreaAllocations(band);
    const breakPeriods = getBreakPeriodNumbers(band);

    // 3. Fetch teacher allocations
    const teacherAllocations = await this.allocationRepo.find({
      where: { tenantId, academicYear, term, isActive: true },
      relations: ['subject'],
    });

    // 4. Build per-stream constraint data
    const constraintData = streams.map(stream => {
      const streamAllocations = allocations.map(la => {
        const teacherAlloc = teacherAllocations.find(ta =>
          ta.streamId === stream.id &&
          ta.subject?.name?.toLowerCase().includes(la.name.toLowerCase().split(' ')[0])
        );
        return {
          subjectName:    la.name,
          periodsPerWeek: la.lessons,
          beforeBreak:    la.beforeBreak || false,
          doubleAllowed:  la.doubleAllowed || false,
          isPpi:          la.isPpi || false,
          teacherId:      teacherAlloc?.teacherId || null,
          teacherName:    teacherAlloc ? `${teacherAlloc.teacher?.firstName} ${teacherAlloc.teacher?.lastName}` : 'TBA',
          subjectId:      teacherAlloc?.subjectId || null,
        };
      });
      return {
        streamId:   stream.id,
        streamName: stream.name,
        gradeLevel: stream.gradeLevel,
        band,
        subjects:   streamAllocations,
      };
    });

    // 5. Use Claude to generate conflict-free, KICD-compliant schedule
    const schedule = await this.aiGenerateKicdSchedule(
      constraintData, band, lessonSlots, breakPeriods, dto
    );

    // 6. Validate against KICD rules
    const violations = validateTimetable(
      schedule.slots.map((s: any) => ({
        streamId:    s.streamId,
        subjectName: s.subjectName,
        dayOfWeek:   s.dayOfWeek,
        periodNumber: s.periodNumber,
      })),
      band
    );

    // 7. Persist slots
    return this.dataSource.transaction(async (manager) => {
      // Clear existing slots
      await manager.createQueryBuilder()
        .delete().from(TimetableSlot)
        .where('tenant_id = :tenantId AND academic_year = :academicYear AND term = :term', {
          tenantId, academicYear, term,
        })
        .execute();

      const allPeriods = getPeriodStructure(band);
      const saved = [];

      for (const slot of schedule.slots) {
        const periodInfo = allPeriods.find(p => p.period === slot.periodNumber && p.type === 'lesson');
        await manager.save(TimetableSlot, manager.create(TimetableSlot, {
          tenantId,
          schoolId,
          streamId:    slot.streamId,
          subjectId:   slot.subjectId,
          teacherId:   slot.teacherId,
          academicYear,
          term,
          dayOfWeek:   slot.dayOfWeek,
          periodNumber: slot.periodNumber,
          startTime:   periodInfo?.startTime || '08:20',
          endTime:     periodInfo?.endTime   || '09:00',
          slotType:    slot.isPpi ? 'ppi' : 'lesson',
          generatedAt: new Date(),
        }));
        saved.push(slot);
      }

      return {
        slotsGenerated: saved.length,
        streams:        streams.length,
        band,
        lessonDuration: getLessonDurationMinutes(band),
        lessonsPerWeek: getLessonsPerWeek(band),
        violations,
        violationCount: violations.length,
        warnings:       schedule.warnings,
        message: violations.length === 0
          ? `✅ KICD-compliant timetable generated: ${saved.length} slots across ${streams.length} stream(s).`
          : `⚠ Timetable generated with ${violations.length} KICD violation(s). Please review.`,
      };
    });
  }

  // ── GET TIMETABLE — Full KICD grid (day × period + breaks) ─
  async getByStream(tenantId: string, streamId: string, academicYear: string, term: string) {
    const stream = await this.streamRepo.findOne({ where: { id: streamId, tenantId } });
    if (!stream) throw new NotFoundException('Stream not found');

    const band       = getGradeBand(stream.gradeLevel);
    const allPeriods = getPeriodStructure(band);

    const slots = await this.slotRepo.find({
      where: { tenantId, streamId, academicYear, term: term as any, isActive: true },
      relations: ['subject','teacher'],
      order: { dayOfWeek: 'ASC', periodNumber: 'ASC' },
    });

    const days = ['Monday','Tuesday','Wednesday','Thursday','Friday'];

    // Build grid including breaks (full official structure)
    const grid = days.map((dayName, dayIdx) => ({
      day:       dayName,
      dayNumber: dayIdx + 1,
      schedule:  allPeriods.map(p => {
        if (p.type !== 'lesson') {
          // Return break/assembly/lunch as non-lesson slot
          return {
            period:    p.period,
            startTime: p.startTime,
            endTime:   p.endTime,
            type:      p.type,
            label:     p.label,
            isLesson:  false,
          };
        }
        const slot = slots.find(s => s.dayOfWeek === dayIdx + 1 && s.periodNumber === p.period);
        return {
          period:    p.period,
          startTime: p.startTime,
          endTime:   p.endTime,
          type:      'lesson',
          isLesson:  true,
          subject:   slot?.subject?.name  || null,
          subjectId: slot?.subjectId      || null,
          teacher:   slot ? `${slot.teacher?.firstName || ''} ${slot.teacher?.lastName || ''}`.trim() : null,
          teacherId: slot?.teacherId      || null,
        };
      }),
    }));

    return {
      streamId, streamName: stream.name,
      gradeLevel:     stream.gradeLevel,
      band,
      academicYear,   term,
      lessonDuration: getLessonDurationMinutes(band),
      lessonsPerWeek: getLessonsPerWeek(band),
      timetable:      grid,
      allocations:    getLearningAreaAllocations(band), // KICD lesson distribution reference
    };
  }

  // ── CBE CALCULATOR ─────────────────────────────────────────
  calculateCbe(schoolType: 'primary' | 'junior', streams: number) {
    if (schoolType === 'junior')  return calculateJuniorCbe(streams);
    if (schoolType === 'primary') return calculatePrimaryCbe(streams);
    throw new BadRequestException('Unsupported school type for CBE calculation');
  }

  // ── KICD-AWARE AI SCHEDULING ───────────────────────────────
  private async aiGenerateKicdSchedule(
    constraints: any[], band: string,
    lessonSlots: number[], breakPeriods: number[],
    dto: GenerateTimetableDto
  ) {
    const allocs = getLearningAreaAllocations(band as any);
    const beforeBreakSubjects = allocs.filter(a => a.beforeBreak).map(a => a.name);
    const doubleAllowedSubjects = allocs.filter(a => a.doubleAllowed).map(a => a.name);

    const prompt = `You are a Kenya school timetable expert generating a KICD CBE-compliant timetable.

OFFICIAL KICD RULES (Kenya MoE Guidelines):
1. No double lessons — EXCEPT for Grade 7-9 practical subjects (ONE double per week maximum): ${doubleAllowedSubjects.join(', ')}
2. These subjects MUST be plotted in the period BEFORE a break: ${beforeBreakSubjects.join(', ')}
3. Similar subjects (language group: English/Kiswahili/Indigenous; numeric group: Math/Science) must NOT follow each other consecutively
4. PPI (Pastoral Programme of Instruction) is plotted ONCE per week — Friday preferred
5. No subject should appear on the same day twice unless unavoidable
6. Distribute subjects evenly: morning and afternoon balance
7. Available lesson periods per day: ${lessonSlots.join(', ')}
8. Break periods fall AFTER periods: ${breakPeriods.join(', ')}
9. School days: Monday(1) to Friday(5)

STREAMS AND SUBJECTS:
${JSON.stringify(constraints, null, 2)}

Generate a conflict-free schedule. No teacher double-booked in same period/day across streams.

Return ONLY valid JSON:
{
  "slots": [
    {
      "streamId": "uuid",
      "subjectId": "uuid or null",
      "subjectName": "exact name",
      "teacherId": "uuid or null",
      "dayOfWeek": 1-5,
      "periodNumber": valid period number,
      "isPpi": false
    }
  ],
  "violations": [],
  "warnings": []
}`;

    try {
      const response = await this.claude.messages.create({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages:   [{ role: 'user', content: prompt }],
      });

      const raw   = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
      const clean = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);

    } catch {
      // Fallback: rule-based KICD scheduler
      return this.kicdFallbackSchedule(constraints, lessonSlots, breakPeriods);
    }
  }

  // ── KICD RULE-BASED FALLBACK SCHEDULER ────────────────────
  private kicdFallbackSchedule(
    constraints: any[], lessonSlots: number[], breakPeriods: number[]
  ) {
    const slots:    any[] = [];
    const warnings: string[] = ['AI scheduling unavailable — using KICD rule-based fallback'];

    // Track teacher usage: teacherId → Set of "dayOfWeek-periodNumber"
    const teacherUsage = new Map<string, Set<string>>();

    for (const stream of constraints) {
      // Sort: beforeBreak subjects first, PPI last, then by lessons desc
      const sorted = [...stream.subjects].sort((a: any, b: any) => {
        if (a.isPpi && !b.isPpi) return 1;
        if (!a.isPpi && b.isPpi) return -1;
        if (a.beforeBreak && !b.beforeBreak) return -1;
        return b.periodsPerWeek - a.periodsPerWeek;
      });

      // Build a pool of valid day-period combinations
      const pool: { day: number; period: number }[] = [];
      for (let day = 1; day <= 5; day++) {
        for (const period of lessonSlots) {
          pool.push({ day, period });
        }
      }

      // Track used slots per stream
      const usedSlots = new Set<string>();
      // Track subject count per day (no same subject twice per day)
      const subjectDayCount = new Map<string, Set<number>>();

      for (const subj of sorted) {
        let placed = 0;
        const target = subj.periodsPerWeek;

        // For PPI: prefer Friday
        const orderedPool = subj.isPpi
          ? [...pool.filter(p => p.day === 5), ...pool.filter(p => p.day !== 5)]
          : pool;

        for (const { day, period } of orderedPool) {
          if (placed >= target) break;

          const slotKey = `${day}-${period}`;
          if (usedSlots.has(slotKey)) continue;

          // Check same subject not on same day twice
          const daySet = subjectDayCount.get(subj.subjectName) || new Set();
          if (daySet.has(day)) continue;

          // Check teacher not double-booked
          const teacherKey = `${subj.teacherId}-${slotKey}`;
          if (subj.teacherId && teacherUsage.has(subj.teacherId)) {
            if (teacherUsage.get(subj.teacherId)!.has(slotKey)) continue;
          }

          // Check beforeBreak rule
          if (subj.beforeBreak) {
            const nextPeriod = period + 1;
            if (!breakPeriods.includes(nextPeriod) && nextPeriod <= lessonSlots[lessonSlots.length - 1]) continue;
          }

          // Place slot
          usedSlots.add(slotKey);
          daySet.add(day);
          subjectDayCount.set(subj.subjectName, daySet);

          if (subj.teacherId) {
            if (!teacherUsage.has(subj.teacherId)) teacherUsage.set(subj.teacherId, new Set());
            teacherUsage.get(subj.teacherId)!.add(slotKey);
          }

          slots.push({
            streamId:    stream.streamId,
            subjectId:   subj.subjectId,
            subjectName: subj.subjectName,
            teacherId:   subj.teacherId,
            dayOfWeek:   day,
            periodNumber: period,
            isPpi:       subj.isPpi || false,
          });
          placed++;
        }

        if (placed < target) {
          warnings.push(`⚠ ${stream.streamName}: Could only place ${placed}/${target} periods for "${subj.subjectName}"`);
        }
      }
    }

    return { slots, violations: [], warnings };
  }
}
