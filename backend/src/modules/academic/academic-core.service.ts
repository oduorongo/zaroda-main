// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// MODULE 02: Academic Core — NestJS Backend
// Covers: Learners · Subjects · Allocations · Timetable
//         Attendance · CATs · Exams · CBC · Report Cards
//         AI PDF Registration Parser (Claude Sonnet 4)
// ============================================================

// ─────────────────────────────────────────────────────────────
// src/modules/academic/dto/learner.dto.ts
// ─────────────────────────────────────────────────────────────
import {
  IsNotEmpty, IsOptional, IsString, IsEnum,
  IsDateString, IsBoolean, IsUUID, Length
} from 'class-validator';

export type GradeLevel =
  | 'playgroup' | 'pp1' | 'pp2'
  | 'grade_1' | 'grade_2' | 'grade_3' | 'grade_4' | 'grade_5' | 'grade_6'
  | 'grade_7' | 'grade_8' | 'grade_9'
  | 'grade_10' | 'grade_11' | 'grade_12';

export type LearnerPathway = 'stem' | 'arts_sports' | 'social_sciences';

export class CreateLearnerDto {
  @IsNotEmpty() @IsString() firstName: string;
  @IsNotEmpty() @IsString() lastName: string;
  @IsOptional() @IsString() otherNames?: string;

  @IsNotEmpty()
  @IsEnum(['male','female'])
  gender: 'male' | 'female';

  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() birthCertNumber?: string;
  @IsOptional() @IsString() nemisNumber?: string;

  @IsNotEmpty() @IsString() gradeLevel: GradeLevel;
  @IsNotEmpty() @IsString() academicYear: string;       // "2025/2026"

  @IsOptional() @IsUUID() streamId?: string;
  @IsOptional() @IsString() pathway?: LearnerPathway;
  @IsOptional() electives?: string[];                   // senior school: chosen elective areas
  @IsOptional() @IsString() previousSchool?: string;
  @IsOptional() @IsBoolean() isBoarder?: boolean;
  @IsOptional() @IsString() specialNeeds?: string;

  // Parent/guardian — optional at registration, added later
  @IsOptional() @IsUUID()   parentId?: string;
  @IsOptional() @IsString() guardianName?: string;
  @IsOptional() @IsString() guardianPhone?: string;
  @IsOptional() @IsString() guardianEmail?: string;
  @IsOptional() @IsString() guardianRelation?: string;
}

export class UpdateLearnerDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() fullName?: string;          // convenience: split into first/last on save
  @IsOptional() @IsString() admissionNumber?: string;
  @IsOptional() @IsString() gradeLevel?: string;        // normally synced from stream
  @IsOptional() @IsUUID()   streamId?: string;
  @IsOptional() @IsString() pathway?: LearnerPathway;
  @IsOptional() electives?: string[];                   // senior school: chosen elective areas
  @IsOptional() @IsUUID()   parentId?: string;
  @IsOptional() @IsString() guardianName?: string;
  @IsOptional() @IsString() guardianPhone?: string;
  @IsOptional() @IsString() guardianEmail?: string;
  @IsOptional() @IsString() guardianRelation?: string;
  @IsOptional() @IsBoolean() isBoarder?: boolean;
  @IsOptional() @IsString() dormitory?: string;
  @IsOptional() @IsEnum(['active','transferred','completed','withdrawn']) status?: string;
}

export class BulkRegisterDto {
  @IsNotEmpty() @IsUUID() streamId: string;
  @IsNotEmpty() @IsString() academicYear: string;
  learners: CreateLearnerDto[];   // parsed from PDF
}

export class AllocateSubjectsDto {
  subjectIds: string[];           // UUIDs from subject_catalogue
}

export class AllocateTeacherDto {
  @IsNotEmpty() @IsUUID() teacherId: string;
  @IsNotEmpty() @IsUUID() streamId: string;
  @IsNotEmpty() @IsUUID() subjectId: string;
  @IsNotEmpty() @IsString() academicYear: string;
  @IsNotEmpty() @IsString() term: 'term_1' | 'term_2' | 'term_3';
  @IsNotEmpty() @IsEnum(['class_teacher','subject_teacher','overall_class_teacher']) role: string;
}

export class GenerateTimetableDto {
  @IsNotEmpty() @IsUUID()   schoolId: string;
  @IsNotEmpty() @IsString() academicYear: string;
  @IsNotEmpty() @IsString() term: 'term_1' | 'term_2' | 'term_3';
  streamIds?: string[];           // if empty, generate for all streams in school

  // Period config
  periodsPerDay?: number;         // default: 8
  startTime?: string;             // default: "07:30"
  breakAfterPeriod?: number[];    // default: [3,5] (break after period 3 and 5)
  lunchAfterPeriod?: number;      // default: 5
}

export class RecordAttendanceDto {
  @IsNotEmpty() @IsUUID()   streamId: string;
  @IsNotEmpty() @IsString() sessionDate: string;   // "2025-09-15"
  @IsNotEmpty() @IsString() sessionType: 'morning' | 'lesson' | 'afternoon';
  @IsOptional() @IsUUID()   subjectId?: string;
  @IsOptional()             periodNumber?: number;

  records: {
    learnerId: string;
    status: 'present' | 'absent' | 'late' | 'excused' | 'sick';
    remarks?: string;
  }[];
}

export class EnterCatResultsDto {
  catId: string;
  results: { learnerId: string; score: number; remarks?: string; }[];
}

export class EnterExamResultsDto {
  examPaperId: string;
  results: { learnerId: string; score: number; }[];
}

export class GenerateReportCardsDto {
  @IsNotEmpty() @IsUUID()   streamId: string;
  @IsNotEmpty() @IsString() academicYear: string;
  @IsNotEmpty() @IsString() term: 'term_1' | 'term_2' | 'term_3';
  @IsOptional() @IsUUID()   examId?: string;
  useAiComments?: boolean;   // default: true
}


// ─────────────────────────────────────────────────────────────
// src/modules/academic/services/learner.service.ts
// ─────────────────────────────────────────────────────────────
import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Like, ILike } from 'typeorm';

@Injectable()
export class LearnerService {
  constructor(
    @InjectRepository(Learner)  private learnerRepo: Repository<Learner>,
    @InjectRepository(Stream)   private streamRepo:  Repository<Stream>,
    @InjectRepository(AuditLog) private auditRepo:   Repository<AuditLog>,
    private dataSource: DataSource,
  ) {}

  // ── LIST (paginated, filterable) ───────────────────────────
  async findAll(tenantId: string, query: {
    streamId?: string; gradeLevel?: string; status?: string;
    search?: string; page?: number; limit?: number;
  }) {
    const { streamId, gradeLevel, status, search, page = 1, limit = 50 } = query;
    const qb = this.learnerRepo.createQueryBuilder('l')
      .where('l.tenant_id = :tenantId', { tenantId })
      .andWhere('l.deleted_at IS NULL')
      .orderBy('l.last_name', 'ASC')
      .addOrderBy('l.first_name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (streamId)    qb.andWhere('l.stream_id = :streamId',       { streamId });
    if (gradeLevel)  qb.andWhere('l.grade_level = :gradeLevel',   { gradeLevel });
    if (status)      qb.andWhere('l.status = :status',            { status });
    if (search)      qb.andWhere(
      '(l.first_name ILIKE :q OR l.last_name ILIKE :q OR l.admission_number ILIKE :q OR l.nemis_number ILIKE :q)',
      { q: `%${search}%` }
    );

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ── GET ONE ────────────────────────────────────────────────
  async findOne(tenantId: string, id: string) {
    const learner = await this.learnerRepo.findOne({
      where: { id, tenantId, deletedAt: null },
      relations: ['stream', 'school'],
    });
    if (!learner) throw new NotFoundException('Learner not found');
    return learner;
  }

  // ── CREATE ─────────────────────────────────────────────────
  async create(tenantId: string, schoolId: string, dto: CreateLearnerDto, registeredBy: string) {
    const admissionNumber = await this.generateAdmissionNumber(schoolId);
    const learner = this.learnerRepo.create({
      ...dto,
      tenantId,
      schoolId,
      admissionNumber,
      status: 'active',
      registeredBy,
    });
    await this.learnerRepo.save(learner);
    await this.auditRepo.save({
      tenantId, userId: registeredBy,
      action: 'learner.created', entityType: 'learners', entityId: learner.id,
      newValues: { admissionNumber, name: `${dto.firstName} ${dto.lastName}` },
    });
    return learner;
  }

  // ── BULK CREATE (from PDF parser) ─────────────────────────
  async bulkCreate(tenantId: string, schoolId: string, dto: BulkRegisterDto, registeredBy: string) {
    const stream = await this.streamRepo.findOne({ where: { id: dto.streamId, tenantId } });
    if (!stream) throw new NotFoundException('Stream not found');

    return this.dataSource.transaction(async (manager) => {
      const created = [];
      const errors  = [];

      for (const [i, raw] of dto.learners.entries()) {
        try {
          // Use the admission/assessment number from the list if given (e.g. the KNEC
          // assessment number), otherwise auto-generate one.
          const admissionNumber = (raw as any).admissionNumber?.trim()
            || await this.generateAdmissionNumber(schoolId);
          // Skip duplicates (same admission number already in this school).
          const exists = await manager.findOne(Learner, { where: { schoolId, admissionNumber } as any });
          if (exists) { errors.push({ row: i + 1, name: `${raw.firstName} ${raw.lastName}`, error: `Admission no. ${admissionNumber} already exists` }); continue; }
          const learner = manager.create(Learner, {
            ...raw,
            tenantId,
            schoolId,
            streamId:     dto.streamId,
            academicYear: dto.academicYear,
            admissionNumber,
            gradeLevel:   stream.gradeLevel,
            status:       'active',
            registeredBy,
          });
          await manager.save(Learner, learner);
          created.push({ row: i + 1, admissionNumber, name: `${raw.firstName} ${raw.lastName}` });
        } catch (err) {
          errors.push({ row: i + 1, name: `${raw.firstName} ${raw.lastName}`, error: err.message });
        }
      }

      return {
        registered: created.length,
        failed:     errors.length,
        created,
        errors,
        summary: `${created.length} learners registered successfully${errors.length ? `, ${errors.length} failed` : ''}.`,
      };
    });
  }

  // ── UPDATE ─────────────────────────────────────────────────
  async update(tenantId: string, id: string, dto: UpdateLearnerDto, updatedBy: string) {
    const learner = await this.findOne(tenantId, id);
    const old = { ...learner };

    // Split a combined fullName into first/last (unless explicit names given)
    if (dto.fullName && !dto.firstName && !dto.lastName) {
      const parts = String(dto.fullName).trim().split(/\s+/);
      learner.firstName = parts.shift() || dto.fullName;
      learner.lastName  = parts.join(' ') || learner.lastName;
    }
    const { fullName, ...rest } = dto as any;
    Object.assign(learner, rest);

    // When the class/stream changes, re-sync grade_level from the new stream
    // so report-card learning areas match the learner's actual grade.
    if (dto.streamId && dto.streamId !== old.streamId) {
      const stream = await this.streamRepo.findOne({
        where: { id: dto.streamId, tenantId },
      });
      if (!stream) throw new NotFoundException('Target stream not found');
      learner.streamId   = stream.id;
      learner.gradeLevel = dto.gradeLevel ?? stream.gradeLevel ?? learner.gradeLevel;
    }

    await this.learnerRepo.save(learner);
    await this.auditRepo.save({
      tenantId, userId: updatedBy,
      action: 'learner.updated', entityType: 'learners', entityId: id,
      oldValues: old, newValues: dto,
    });
    return learner;
  }

  // ── TRANSFER ───────────────────────────────────────────────
  async transfer(tenantId: string, learnerId: string, newStreamId: string, userId: string) {
    const learner = await this.findOne(tenantId, learnerId);
    const oldStreamId = learner.streamId;
    learner.streamId = newStreamId;
    await this.learnerRepo.save(learner);
    await this.auditRepo.save({
      tenantId, userId,
      action: 'learner.transferred', entityType: 'learners', entityId: learnerId,
      oldValues: { streamId: oldStreamId }, newValues: { streamId: newStreamId },
    });
    return learner;
  }

  // ── SOFT DELETE ────────────────────────────────────────────
  async remove(tenantId: string, id: string, userId: string) {
    const learner = await this.findOne(tenantId, id);
    await this.learnerRepo.softDelete(id);
    await this.auditRepo.save({
      tenantId, userId,
      action: 'learner.deleted', entityType: 'learners', entityId: id,
      oldValues: { name: learner.fullName },
    });
    return { message: 'Learner record soft-deleted' };
  }

  // ── HELPERS ────────────────────────────────────────────────
  private async generateAdmissionNumber(schoolId: string): Promise<string> {
    const year  = new Date().getFullYear();
    const count = await this.learnerRepo.count({ where: { schoolId } });
    return `ADM/${year}/${String(count + 1).padStart(4, '0')}`;
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/academic/services/pdf-parser.service.ts
// Claude Sonnet 4 — PDF → Learner Records
// ─────────────────────────────────────────────────────────────
import { Injectable, BadRequestException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class PdfParserService {
  private claude: Anthropic;

  constructor() {
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async parseLearnerRegistrationPdf(pdfBuffer: Buffer): Promise<{
    learners: CreateLearnerDto[];
    total: number;
    confidence: number;
    warnings: string[];
  }> {
    const base64Pdf = pdfBuffer.toString('base64');

    const message = await this.claude.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type:   'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf },
          },
          {
            type: 'text',
            text: `You are processing a Kenyan school learner registration document.

Extract EVERY learner record from this PDF — every page, every row.

Return ONLY a valid JSON object (no preamble, no markdown, no backticks) in this exact structure:

{
  "learners": [
    {
      "firstName": "string — required",
      "lastName": "string — required",
      "otherNames": "string or null",
      "gender": "male or female — required",
      "dateOfBirth": "YYYY-MM-DD or null",
      "birthCertNumber": "string or null",
      "nemisNumber": "string or null",
      "gradeLevel": "one of: playgroup|pp1|pp2|grade_1|grade_2|grade_3|grade_4|grade_5|grade_6|grade_7|grade_8|grade_9|grade_10|grade_11|grade_12",
      "previousSchool": "string or null",
      "guardianName": "string or null",
      "guardianPhone": "string or null",
      "guardianRelation": "string or null"
    }
  ],
  "total": <number of learners extracted>,
  "confidence": <0.0 to 1.0 — your confidence in accuracy>,
  "warnings": ["any data quality issues noticed"]
}

Rules:
- Extract every single learner. Do not skip any.
- Normalise gender: Male/M/Boy → "male"; Female/F/Girl → "female"
- Normalise grade: "Grade 4" → "grade_4"; "PP1" → "pp1"; "Form 1" → map to CBC equivalent
- Dates must be YYYY-MM-DD. If day unknown, use "YYYY-MM-01".
- Phone numbers: preserve as-is including country code if present
- If a field is missing or unreadable, use null
- Double-check your total matches the actual count in the learners array`,
          },
        ],
      }],
    });

    const raw = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('');

    let parsed: any;
    try {
      // Strip any accidental markdown fences
      const clean = raw.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      throw new BadRequestException(
        'Could not parse learner data from PDF. Please ensure the PDF contains a clear tabular list of learners.'
      );
    }

    // Validate count integrity
    if (parsed.learners.length !== parsed.total) {
      parsed.warnings = parsed.warnings || [];
      parsed.warnings.push(
        `Warning: Claude reported ${parsed.total} learners but extracted ${parsed.learners.length}. Please verify.`
      );
      parsed.total = parsed.learners.length;
    }

    // Validate required fields
    const valid   = [];
    const invalid = [];
    for (const [i, l] of parsed.learners.entries()) {
      if (!l.firstName || !l.lastName || !l.gender) {
        invalid.push({ row: i + 1, issue: 'Missing required field (firstName, lastName, or gender)', data: l });
      } else {
        valid.push(l);
      }
    }

    if (invalid.length > 0) {
      parsed.warnings.push(`${invalid.length} rows skipped due to missing required fields.`);
    }

    return {
      learners:   valid,
      total:      valid.length,
      confidence: parsed.confidence || 0.9,
      warnings:   parsed.warnings  || [],
    };
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/academic/services/timetable.service.ts
// AI-assisted timetable generation
// ─────────────────────────────────────────────────────────────
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_PERIODS = [
  { period: 1, start: '07:30', end: '08:10' },
  { period: 2, start: '08:10', end: '08:50' },
  { period: 3, start: '08:50', end: '09:30' },
  { period: 4, start: '09:50', end: '10:30' },  // after morning break
  { period: 5, start: '10:30', end: '11:10' },
  { period: 6, start: '11:10', end: '11:50' },
  { period: 7, start: '13:00', end: '13:40' },  // after lunch
  { period: 8, start: '13:40', end: '14:20' },
];

@Injectable()
export class TimetableService {
  private claude: Anthropic;

  constructor(
    @InjectRepository(TimetableSlot)      private slotRepo:        Repository<TimetableSlot>,
    @InjectRepository(TeacherAllocation)  private allocationRepo:  Repository<TeacherAllocation>,
    @InjectRepository(StreamSubject)      private streamSubjRepo:  Repository<StreamSubject>,
    @InjectRepository(Stream)             private streamRepo:      Repository<Stream>,
    private dataSource: DataSource,
  ) {
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  // ── GENERATE TIMETABLE (AI-optimized) ─────────────────────
  async generate(tenantId: string, dto: GenerateTimetableDto) {
    const { schoolId, academicYear, term, streamIds } = dto;

    // 1. Gather all streams to schedule
    const qb = this.streamRepo.createQueryBuilder('s')
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere('s.school_id = :schoolId', { schoolId })
      .andWhere('s.academic_year = :academicYear', { academicYear })
      .andWhere('s.term = :term', { term })
      .andWhere('s.is_active = true');
    if (streamIds?.length) qb.andWhere('s.id IN (:...streamIds)', { streamIds });
    const streams = await qb.getMany();

    // 2. Gather allocations (teacher → stream → subject)
    const allocations = await this.allocationRepo.find({
      where: { tenantId, academicYear, term, isActive: true },
      relations: ['subject', 'teacher'],
    });

    // 3. Gather periods-per-week per subject per stream
    const streamSubjects = await this.streamSubjRepo.find({
      where: { tenantId, academicYear, term },
    });

    // 4. Build constraint map for AI prompt
    const constraintMap = streams.map(stream => ({
      streamId:   stream.id,
      streamName: stream.name,
      gradeLevel: stream.gradeLevel,
      subjects: streamSubjects
        .filter(ss => ss.streamId === stream.id)
        .map(ss => {
          const alloc = allocations.find(a => a.streamId === stream.id && a.subjectId === ss.subjectId);
          return {
            subjectId:     ss.subjectId,
            periodsPerWeek: ss.periodsPerWeek,
            teacherId:     alloc?.teacherId || null,
            teacherName:   alloc ? `${alloc.teacher.firstName} ${alloc.teacher.lastName}` : 'Unallocated',
          };
        }),
    }));

    // 5. Call Claude to generate conflict-free schedule
    const schedule = await this.aiGenerateSchedule(constraintMap, dto);

    // 6. Persist timetable slots (replace existing)
    return this.dataSource.transaction(async (manager) => {
      // Clear existing slots for this school/year/term
      await manager.createQueryBuilder()
        .delete().from(TimetableSlot)
        .where('tenant_id = :tenantId AND academic_year = :academicYear AND term = :term', {
          tenantId, academicYear, term,
        })
        .execute();

      const saved = [];
      for (const slot of schedule.slots) {
        const period = DEFAULT_PERIODS.find(p => p.period === slot.periodNumber);
        const saved_slot = manager.create(TimetableSlot, {
          tenantId,
          schoolId,
          streamId:     slot.streamId,
          subjectId:    slot.subjectId,
          teacherId:    slot.teacherId,
          academicYear,
          term,
          dayOfWeek:    slot.dayOfWeek,
          periodNumber: slot.periodNumber,
          startTime:    period?.start || '07:30',
          endTime:      period?.end   || '08:10',
          slotType:     'lesson',
          generatedAt:  new Date(),
        });
        await manager.save(TimetableSlot, saved_slot);
        saved.push(saved_slot);
      }

      return {
        slotsGenerated: saved.length,
        conflicts:      schedule.conflicts,
        warnings:       schedule.warnings,
        message:        `Timetable generated for ${streams.length} stream(s). ${saved.length} slots created.`,
      };
    });
  }

  // ── GET TIMETABLE (by stream) ──────────────────────────────
  async getByStream(tenantId: string, streamId: string, academicYear: string, term: string) {
    const slots = await this.slotRepo.find({
      where: { tenantId, streamId, academicYear, term: term as any, isActive: true },
      relations: ['subject', 'teacher'],
      order: { dayOfWeek: 'ASC', periodNumber: 'ASC' },
    });

    // Pivot into day → period grid
    const days = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
    const grid = days.map((dayName, idx) => ({
      day: dayName,
      dayNumber: idx + 1,
      periods: DEFAULT_PERIODS.map(p => {
        const slot = slots.find(s => s.dayOfWeek === idx + 1 && s.periodNumber === p.period);
        return {
          period:    p.period,
          startTime: p.start,
          endTime:   p.end,
          subject:   slot?.subject?.name || null,
          subjectId: slot?.subjectId     || null,
          teacher:   slot ? `${slot.teacher?.firstName} ${slot.teacher?.lastName}` : null,
          teacherId: slot?.teacherId     || null,
          room:      slot?.room          || null,
        };
      }),
    }));

    return { streamId, academicYear, term, timetable: grid };
  }

  // ── AI SCHEDULE GENERATION ─────────────────────────────────
  private async aiGenerateSchedule(constraints: any[], dto: GenerateTimetableDto) {
    const prompt = `You are an expert school timetable scheduler for a Kenyan school.

Generate a conflict-free weekly timetable for the following streams.

CONSTRAINTS:
${JSON.stringify(constraints, null, 2)}

RULES:
1. No teacher can be in two streams at the same period/day
2. Each subject must appear exactly periodsPerWeek times per week
3. Spread subjects evenly across the week — no subject on same day twice unless unavoidable
4. 5 school days (Monday=1 to Friday=5), ${dto.periodsPerDay || 8} periods per day
5. Prefer double periods for practical subjects (Science, Art, PE)
6. Return ONLY valid JSON — no preamble, no markdown

Return this exact JSON structure:
{
  "slots": [
    {
      "streamId": "uuid",
      "subjectId": "uuid",
      "teacherId": "uuid or null",
      "dayOfWeek": 1-5,
      "periodNumber": 1-8
    }
  ],
  "conflicts": [],
  "warnings": []
}`;

    const response = await this.claude.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages:   [{ role: 'user', content: prompt }],
    });

    const raw = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('');

    try {
      const clean = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch {
      // Fallback: simple round-robin if AI parse fails
      return this.fallbackSchedule(constraints, dto);
    }
  }

  private fallbackSchedule(constraints: any[], dto: GenerateTimetableDto) {
    // Simple round-robin fallback — distribute subjects across days/periods
    const slots  = [];
    const errors = ['AI timetable generation failed — using basic round-robin fallback'];

    for (const stream of constraints) {
      let day = 1, period = 1;
      for (const subj of stream.subjects) {
        for (let i = 0; i < subj.periodsPerWeek; i++) {
          slots.push({
            streamId:  stream.streamId,
            subjectId: subj.subjectId,
            teacherId: subj.teacherId,
            dayOfWeek: day,
            periodNumber: period,
          });
          period++;
          if (period > (dto.periodsPerDay || 8)) { period = 1; day++; }
          if (day > 5) day = 1;
        }
      }
    }
    return { slots, conflicts: [], warnings: errors };
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/academic/services/attendance.service.ts
// ─────────────────────────────────────────────────────────────
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(AttendanceSession) private sessionRepo: Repository<AttendanceSession>,
    @InjectRepository(AttendanceRecord)  private recordRepo:  Repository<AttendanceRecord>,
    @InjectRepository(Learner)           private learnerRepo: Repository<Learner>,
  ) {}

  // ── RECORD ATTENDANCE (bulk for stream) ───────────────────
  async record(tenantId: string, dto: RecordAttendanceDto, teacherId: string) {
    // Upsert session
    let session = await this.sessionRepo.findOne({
      where: {
        tenantId,
        streamId:    dto.streamId,
        sessionDate: new Date(dto.sessionDate) as any,
        sessionType: dto.sessionType as any,
        periodNumber: dto.periodNumber || null,
      },
    });

    if (!session) {
      session = await this.sessionRepo.save(
        this.sessionRepo.create({
          tenantId,
          streamId:     dto.streamId,
          subjectId:    dto.subjectId,
          teacherId,
          sessionDate:  new Date(dto.sessionDate),
          sessionType:  dto.sessionType as any,
          periodNumber: dto.periodNumber,
          academicYear: new Date().getFullYear() + '/' + (new Date().getFullYear() + 1),
          term:         this.currentTerm(),
        })
      );
    }

    // Upsert each learner record
    const results = [];
    for (const r of dto.records) {
      const existing = await this.recordRepo.findOne({
        where: { sessionId: session.id, learnerId: r.learnerId },
      });
      if (existing) {
        await this.recordRepo.update(existing.id, {
          status: r.status as any, remarks: r.remarks, recordedBy: teacherId,
        });
        results.push({ learnerId: r.learnerId, action: 'updated' });
      } else {
        await this.recordRepo.save(this.recordRepo.create({
          tenantId,
          sessionId:  session.id,
          learnerId:  r.learnerId,
          status:     r.status as any,
          remarks:    r.remarks,
          recordedBy: teacherId,
        }));
        results.push({ learnerId: r.learnerId, action: 'created' });
      }
    }

    return {
      sessionId: session.id,
      date:      dto.sessionDate,
      recorded:  results.length,
      present:   results.filter((_,i) => dto.records[i].status === 'present').length,
      absent:    results.filter((_,i) => dto.records[i].status === 'absent').length,
    };
  }

  // ── GET STREAM ATTENDANCE (for a date) ────────────────────
  async getStreamAttendance(tenantId: string, streamId: string, date: string) {
    const session = await this.sessionRepo.findOne({
      where: { tenantId, streamId, sessionDate: new Date(date) as any, sessionType: 'morning' as any },
    });
    if (!session) return { date, streamId, session: null, records: [] };

    const records = await this.recordRepo.find({
      where: { sessionId: session.id },
      relations: ['learner'],
      order: { learner: { lastName: 'ASC' } },
    });

    return { date, streamId, session, records };
  }

  // ── ATTENDANCE SUMMARY (per learner per term) ─────────────
  async getLearnerSummary(tenantId: string, learnerId: string, academicYear: string, term: string) {
    const result = await this.recordRepo
      .createQueryBuilder('ar')
      .select([
        'COUNT(*) FILTER (WHERE ar.status = \'present\') AS "daysPresent"',
        'COUNT(*) FILTER (WHERE ar.status = \'absent\')  AS "daysAbsent"',
        'COUNT(*) FILTER (WHERE ar.status = \'late\')    AS "daysLate"',
        'COUNT(*)                                         AS "total"',
      ])
      .innerJoin('ar.session', 's')
      .where('ar.learner_id = :learnerId', { learnerId })
      .andWhere('s.academic_year = :academicYear', { academicYear })
      .andWhere('s.term = :term', { term })
      .andWhere('s.session_type = \'morning\'')
      .getRawOne();

    const total   = parseInt(result.total) || 0;
    const present = parseInt(result.daysPresent) || 0;
    return {
      ...result,
      attendancePct: total > 0 ? parseFloat((present / total * 100).toFixed(1)) : 0,
    };
  }

  private currentTerm(): string {
    const month = new Date().getMonth() + 1;
    if (month <= 4)  return 'term_1';
    if (month <= 8)  return 'term_2';
    return 'term_3';
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/academic/services/assessment.service.ts
// CATs + Exams + CBC Performance Levels
// ─────────────────────────────────────────────────────────────
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class AssessmentService {
  constructor(
    @InjectRepository(Cat)        private catRepo:    Repository<Cat>,
    @InjectRepository(CatResult)  private catResRepo: Repository<CatResult>,
    @InjectRepository(Exam)       private examRepo:   Repository<Exam>,
    @InjectRepository(ExamPaper)  private paperRepo:  Repository<ExamPaper>,
    @InjectRepository(ExamResult) private resultRepo: Repository<ExamResult>,
    @InjectRepository(CompetencyAssessment) private compRepo: Repository<CompetencyAssessment>,
  ) {}

  // ── ENTER CAT RESULTS ─────────────────────────────────────
  async enterCatResults(tenantId: string, dto: EnterCatResultsDto, teacherId: string) {
    const cat = await this.catRepo.findOne({ where: { id: dto.catId, tenantId } });
    if (!cat) throw new NotFoundException('CAT not found');

    const saved = [];
    for (const r of dto.results) {
      const existing = await this.catResRepo.findOne({
        where: { catId: dto.catId, learnerId: r.learnerId },
      });
      const data = {
        tenantId,
        catId:     dto.catId,
        learnerId: r.learnerId,
        score:     r.score,
        remarks:   r.remarks,
        enteredBy: teacherId,
      };
      if (existing) {
        await this.catResRepo.update(existing.id, data);
      } else {
        await this.catResRepo.save(this.catResRepo.create(data));
      }
      saved.push(r.learnerId);
    }

    // Update CAT status to marked
    await this.catRepo.update(dto.catId, { status: 'marked' });

    return { catId: dto.catId, resultsEntered: saved.length };
  }

  // ── ENTER EXAM RESULTS ────────────────────────────────────
  async enterExamResults(tenantId: string, dto: EnterExamResultsDto, teacherId: string) {
    const paper = await this.paperRepo.findOne({
      where: { id: dto.examPaperId, tenantId },
      relations: ['subject'],
    });
    if (!paper) throw new NotFoundException('Exam paper not found');

    for (const r of dto.results) {
      const grade         = this.calculateGrade(r.score, paper.maxScore, paper.exam?.examType);
      const performLevel  = this.getCbcPerformanceLevel(r.score, paper.maxScore);

      const existing = await this.resultRepo.findOne({
        where: { examPaperId: dto.examPaperId, learnerId: r.learnerId },
      });
      const data = {
        tenantId,
        examPaperId:      dto.examPaperId,
        learnerId:        r.learnerId,
        score:            r.score,
        grade,
        performanceLevel: performLevel,
        enteredBy:        teacherId,
      };
      if (existing) {
        await this.resultRepo.update(existing.id, data);
      } else {
        await this.resultRepo.save(this.resultRepo.create(data));
      }
    }

    return { examPaperId: dto.examPaperId, resultsEntered: dto.results.length };
  }

  // ── CBC PERFORMANCE LEVEL ─────────────────────────────────
  // ECDE–Grade 6: EE | ME | AE | BE
  // Grade 7–12:   EE1 | EE2 | ME1 | ME2 | AE1 | AE2 | BE1 | BE2
  getCbcPerformanceLevel(score: number, maxScore: number, isUpperSecondary = false): string {
    const pct = (score / maxScore) * 100;
    if (isUpperSecondary) {
      if (pct >= 90) return 'EE1';
      if (pct >= 80) return 'EE2';
      if (pct >= 70) return 'ME1';
      if (pct >= 60) return 'ME2';
      if (pct >= 50) return 'AE1';
      if (pct >= 40) return 'AE2';
      if (pct >= 30) return 'BE1';
      return 'BE2';
    }
    if (pct >= 75) return 'EE';
    if (pct >= 50) return 'ME';
    if (pct >= 25) return 'AE';
    return 'BE';
  }

  // ── GRADE CALCULATION ─────────────────────────────────────
  private calculateGrade(score: number, maxScore: number, examType?: string): string {
    const pct = (score / maxScore) * 100;
    if (pct >= 80) return 'A';
    if (pct >= 75) return 'A-';
    if (pct >= 70) return 'B+';
    if (pct >= 65) return 'B';
    if (pct >= 60) return 'B-';
    if (pct >= 55) return 'C+';
    if (pct >= 50) return 'C';
    if (pct >= 45) return 'C-';
    if (pct >= 40) return 'D+';
    if (pct >= 35) return 'D';
    if (pct >= 30) return 'D-';
    return 'E';
  }

  // ── STREAM ANALYTICS (weakness detection) ────────────────
  async getStreamAnalytics(tenantId: string, streamId: string, examId: string) {
    const results = await this.resultRepo
      .createQueryBuilder('er')
      .select([
        'ep.subject_id   AS "subjectId"',
        'sc.name         AS "subjectName"',
        'AVG(er.score)   AS "avgScore"',
        'MAX(er.score)   AS "maxScore"',
        'MIN(er.score)   AS "minScore"',
        'COUNT(er.id)    AS "candidateCount"',
        `COUNT(er.id) FILTER (WHERE er.score / ep.max_score >= 0.5) AS "passCount"`,
      ])
      .innerJoin('er.examPaper', 'ep')
      .innerJoin('ep.subject',   'sc')
      .where('ep.stream_id = :streamId', { streamId })
      .andWhere('ep.exam_id = :examId',  { examId })
      .groupBy('ep.subject_id, sc.name')
      .orderBy('"avgScore"', 'ASC')
      .getRawMany();

    // Tag subjects with avg < 50% as weak
    return results.map(r => ({
      ...r,
      avgScore:  parseFloat(r.avgScore).toFixed(1),
      passRate:  ((r.passCount / r.candidateCount) * 100).toFixed(1) + '%',
      isWeak:    parseFloat(r.avgScore) < 50,
      tag:       parseFloat(r.avgScore) < 50 ? '⚠ Needs attention' : '✓ On track',
    }));
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/academic/services/report-card.service.ts
// Generates CBC report cards with AI comments
// ─────────────────────────────────────────────────────────────
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class ReportCardService {
  private claude: Anthropic;

  constructor(
    @InjectRepository(ReportCard)        private reportRepo:    Repository<ReportCard>,
    @InjectRepository(ReportCardSubject) private reportSubjRepo: Repository<ReportCardSubject>,
    @InjectRepository(Learner)           private learnerRepo:   Repository<Learner>,
    @InjectRepository(ExamResult)        private resultRepo:    Repository<ExamResult>,
    @InjectRepository(CatResult)         private catResRepo:    Repository<CatResult>,
    @InjectRepository(CompetencyAssessment) private compRepo:   Repository<CompetencyAssessment>,
    private dataSource: DataSource,
  ) {
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  // ── GENERATE REPORT CARDS (full stream) ───────────────────
  async generate(tenantId: string, dto: GenerateReportCardsDto, generatedBy: string) {
    const { streamId, academicYear, term, examId, useAiComments = true } = dto;

    const learners = await this.learnerRepo.find({
      where: { tenantId, streamId, status: 'active', deletedAt: null },
      order: { lastName: 'ASC', firstName: 'ASC' },
    });

    if (learners.length === 0) throw new NotFoundException('No active learners in this stream');

    const generated = [];

    return this.dataSource.transaction(async (manager) => {
      for (const [rank, learner] of learners.entries()) {
        // 1. Gather all subject results for this learner
        const subjects = await this.buildSubjectResults(tenantId, learner.id, streamId, academicYear, term, examId);

        // 2. Calculate aggregates
        const totalMarks   = subjects.reduce((s, r) => s + (r.totalScore || 0), 0);
        const avgScore     = subjects.length > 0 ? totalMarks / subjects.length : 0;
        const grade        = this.overallGrade(avgScore);

        // 3. Attendance summary
        const attendance   = await this.getAttendanceSummary(tenantId, learner.id, academicYear, term);

        // 4. AI comment
        let aiComment = null;
        if (useAiComments) {
          aiComment = await this.generateAiComment(learner, subjects, avgScore, attendance);
        }

        // 5. Upsert report card
        const existing = await this.reportRepo.findOne({
          where: { tenantId, learnerId: learner.id, academicYear, term },
        });

        const reportData = {
          tenantId,
          learnerId:           learner.id,
          streamId,
          examId,
          academicYear,
          term,
          totalMarks,
          averageScore:        parseFloat(avgScore.toFixed(2)),
          grade,
          streamSize:          learners.length,
          attendancePct:       attendance.attendancePct,
          daysPresent:         attendance.daysPresent,
          daysAbsent:          attendance.daysAbsent,
          aiGeneratedComment:  aiComment,
          status:              'generated' as const,
          generatedAt:         new Date(),
        };

        let card: any;
        if (existing) {
          await manager.update(ReportCard, existing.id, reportData);
          card = { ...existing, ...reportData };
        } else {
          card = await manager.save(ReportCard, manager.create(ReportCard, reportData));
        }

        // 6. Save subject breakdown
        for (const subj of subjects) {
          const existingSubj = await this.reportSubjRepo.findOne({
            where: { reportCardId: card.id, subjectId: subj.subjectId },
          });
          if (existingSubj) {
            await manager.update(ReportCardSubject, existingSubj.id, subj);
          } else {
            await manager.save(ReportCardSubject, manager.create(ReportCardSubject, {
              tenantId, reportCardId: card.id, ...subj,
            }));
          }
        }

        generated.push({ learnerId: learner.id, name: learner.fullName, average: avgScore.toFixed(1), grade });
      }

      // Assign class positions based on average score
      generated.sort((a, b) => parseFloat(b.average) - parseFloat(a.average));
      for (const [pos, entry] of generated.entries()) {
        await manager.update(ReportCard,
          { learnerId: entry.learnerId, academicYear, term },
          { classPosition: pos + 1 }
        );
        entry.position = pos + 1;
      }

      return {
        streamId,
        academicYear,
        term,
        cardsGenerated: generated.length,
        results: generated,
        message: `${generated.length} report cards generated successfully.`,
      };
    });
  }

  // ── AI COMMENT GENERATION ─────────────────────────────────
  private async generateAiComment(
    learner: any, subjects: any[], avgScore: number, attendance: any
  ): Promise<string> {
    const strongSubjects = subjects.filter(s => s.totalScore >= (s.maxPossible * 0.7)).map(s => s.subjectName);
    const weakSubjects   = subjects.filter(s => s.totalScore < (s.maxPossible * 0.5)).map(s => s.subjectName);
    const level          = avgScore >= 75 ? 'EE' : avgScore >= 50 ? 'ME' : avgScore >= 25 ? 'AE' : 'BE';

    const prompt = `Generate a professional, encouraging CBC-aligned class teacher comment for a Kenyan school report card.

Learner: ${learner.firstName} ${learner.lastName}
Gender: ${learner.gender}
Average Score: ${avgScore.toFixed(1)}%
Overall Performance Level: ${level} (${this.levelLabel(level)})
Strong subjects: ${strongSubjects.join(', ') || 'None identified'}
Areas for improvement: ${weakSubjects.join(', ') || 'None identified'}
Attendance: ${attendance.attendancePct}% (${attendance.daysPresent} days present)

Requirements:
- 2-3 sentences maximum
- Use learner's first name
- CBC language (competencies, learning outcomes)
- Positive, constructive tone
- Mention one specific strength and one area for growth if applicable
- Return ONLY the comment text, nothing else`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      });
      return (response.content[0] as any).text?.trim() || null;
    } catch {
      return null; // Fail silently — teacher can add manually
    }
  }

  private levelLabel(level: string): string {
    const labels: Record<string, string> = {
      'EE': 'Exceeding Expectation', 'EE1': 'Exceeding Expectation 1', 'EE2': 'Exceeding Expectation 2',
      'ME': 'Meeting Expectation',   'ME1': 'Meeting Expectation 1',   'ME2': 'Meeting Expectation 2',
      'AE': 'Approaching Expectation','AE1':'Approaching Expectation 1','AE2':'Approaching Expectation 2',
      'BE': 'Below Expectation',     'BE1': 'Below Expectation 1',     'BE2': 'Below Expectation 2',
    };
    return labels[level] || level;
  }

  private overallGrade(avgScore: number): string {
    if (avgScore >= 80) return 'A';
    if (avgScore >= 70) return 'B+';
    if (avgScore >= 60) return 'B';
    if (avgScore >= 50) return 'C+';
    if (avgScore >= 40) return 'C';
    if (avgScore >= 30) return 'D';
    return 'E';
  }

  private async buildSubjectResults(
    tenantId: string, learnerId: string,
    streamId: string, academicYear: string, term: string, examId?: string
  ) {
    // Fetch exam results
    const examResults = await this.resultRepo
      .createQueryBuilder('er')
      .innerJoin('er.examPaper', 'ep')
      .innerJoin('ep.subject',   'sc')
      .where('er.learner_id = :learnerId', { learnerId })
      .andWhere('ep.stream_id = :streamId', { streamId })
      .andWhere(examId ? 'ep.exam_id = :examId' : '1=1', { examId })
      .select(['er.score', 'er.grade', 'er.performanceLevel', 'ep.maxScore', 'ep.subjectId', 'sc.name'])
      .getRawMany();

    // Fetch CAT results (aggregate 3 CATs)
    const catResults = await this.catResRepo
      .createQueryBuilder('cr')
      .innerJoin('cr.cat', 'c')
      .where('cr.learner_id = :learnerId', { learnerId })
      .andWhere('c.stream_id = :streamId',    { streamId })
      .andWhere('c.academic_year = :academicYear', { academicYear })
      .andWhere('c.term = :term', { term })
      .select(['cr.score', 'c.catNumber', 'c.maxScore', 'c.subjectId'])
      .getRawMany();

    // Merge into subject rows
    const subjectMap = new Map<string, any>();
    for (const er of examResults) {
      subjectMap.set(er.subjectId, {
        subjectId:    er.subjectId,
        subjectName:  er.name,
        examScore:    er.score,
        maxPossible:  er.maxScore,
        grade:        er.grade,
        performanceLevel: er.performanceLevel,
      });
    }
    for (const cr of catResults) {
      const entry = subjectMap.get(cr.subjectId) || { subjectId: cr.subjectId };
      entry[`cat${cr.catNumber}Score`] = cr.score;
      subjectMap.set(cr.subjectId, entry);
    }

    return Array.from(subjectMap.values()).map(s => {
      const catsTotal  = (s.cat1Score || 0) + (s.cat2Score || 0) + (s.cat3Score || 0);
      const totalScore = (s.examScore || 0) + catsTotal;
      return { ...s, catsTotal, totalScore };
    });
  }

  private async getAttendanceSummary(tenantId: string, learnerId: string, academicYear: string, term: string) {
    // Uses materialized view or direct query
    const result = await this.dataSource.query(`
      SELECT days_present, days_absent, total_sessions, attendance_pct
      FROM attendance_summary
      WHERE tenant_id = $1 AND learner_id = $2 AND academic_year = $3 AND term = $4
      LIMIT 1
    `, [tenantId, learnerId, academicYear, term]);

    return result[0] || { daysPresent: 0, daysAbsent: 0, attendancePct: 0 };
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/academic/academic.controller.ts
// ALL academic endpoints in one controller
// ─────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, UseGuards, UseInterceptors, UploadedFile,
  HttpCode, HttpStatus
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('api/v1')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AcademicController {
  constructor(
    private learnerService:    LearnerService,
    private pdfParserService:  PdfParserService,
    private timetableService:  TimetableService,
    private attendanceService: AttendanceService,
    private assessmentService: AssessmentService,
    private reportCardService: ReportCardService,
  ) {}

  // ── LEARNERS ────────────────────────────────────────────
  @Get('learners')
  @Roles('tenant_owner','school_admin','hoi','dhois','class_teacher','overall_class_teacher')
  getLearners(@CurrentUser() u: User, @Query() q: any) {
    return this.learnerService.findAll(u.tenantId, q);
  }

  @Get('learners/:id')
  @Roles('tenant_owner','school_admin','hoi','dhois','class_teacher','subject_teacher','parent')
  getLearner(@CurrentUser() u: User, @Param('id') id: string) {
    return this.learnerService.findOne(u.tenantId, id);
  }

  @Post('learners')
  @Roles('tenant_owner','school_admin','hoi','dhois','class_teacher')
  @HttpCode(HttpStatus.CREATED)
  createLearner(@CurrentUser() u: User, @Body() dto: CreateLearnerDto) {
    return this.learnerService.create(u.tenantId, u.schoolId, dto, u.id);
  }

  @Patch('learners/:id')
  @Roles('tenant_owner','school_admin','hoi','dhois','class_teacher')
  updateLearner(@CurrentUser() u: User, @Param('id') id: string, @Body() dto: UpdateLearnerDto) {
    return this.learnerService.update(u.tenantId, id, dto, u.id);
  }

  @Delete('learners/:id')
  @Roles('tenant_owner','school_admin','hoi')
  removeLearner(@CurrentUser() u: User, @Param('id') id: string) {
    return this.learnerService.remove(u.tenantId, id, u.id);
  }

  @Patch('learners/:id/transfer')
  @Roles('tenant_owner','school_admin','hoi')
  transferLearner(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Body('newStreamId') newStreamId: string,
  ) {
    return this.learnerService.transfer(u.tenantId, id, newStreamId, u.id);
  }

  // ── PDF BULK REGISTRATION ──────────────────────────────
  @Post('learners/parse-pdf')
  @Roles('tenant_owner','school_admin','hoi','class_teacher')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async parsePdf(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('PDF file is required');
    if (file.mimetype !== 'application/pdf') throw new BadRequestException('File must be a PDF');
    return this.pdfParserService.parseLearnerRegistrationPdf(file.buffer);
  }

  @Post('learners/bulk-register')
  @Roles('tenant_owner','school_admin','hoi','class_teacher')
  @HttpCode(HttpStatus.CREATED)
  bulkRegister(@CurrentUser() u: User, @Body() dto: BulkRegisterDto) {
    return this.learnerService.bulkCreate(u.tenantId, u.schoolId, dto, u.id);
  }

  // ── ALLOCATIONS ────────────────────────────────────────
  @Post('allocations/teachers')
  @Roles('tenant_owner','school_admin','hoi')
  allocateTeacher(@CurrentUser() u: User, @Body() dto: AllocateTeacherDto) {
    return this.allocationService.allocateTeacher(u.tenantId, dto, u.id);
  }

  @Post('streams/:id/subjects')
  @Roles('tenant_owner','school_admin','hoi')
  allocateSubjects(
    @CurrentUser() u: User,
    @Param('id') streamId: string,
    @Body() dto: AllocateSubjectsDto,
    @Query('academicYear') academicYear: string,
    @Query('term') term: string,
  ) {
    return this.allocationService.allocateSubjectsToStream(u.tenantId, streamId, dto, academicYear, term);
  }

  // ── TIMETABLE ──────────────────────────────────────────
  @Post('timetable/generate')
  @Roles('tenant_owner','school_admin','hoi')
  generateTimetable(@CurrentUser() u: User, @Body() dto: GenerateTimetableDto) {
    return this.timetableService.generate(u.tenantId, dto);
  }

  @Get('timetable/stream/:streamId')
  @Roles('tenant_owner','school_admin','hoi','dhois','class_teacher','subject_teacher','learner','parent')
  getTimetable(
    @CurrentUser() u: User,
    @Param('streamId') streamId: string,
    @Query('academicYear') academicYear: string,
    @Query('term') term: string,
  ) {
    return this.timetableService.getByStream(u.tenantId, streamId, academicYear, term);
  }

  // ── ATTENDANCE ─────────────────────────────────────────
  @Post('attendance')
  @Roles('class_teacher','subject_teacher','overall_class_teacher','hoi')
  recordAttendance(@CurrentUser() u: User, @Body() dto: RecordAttendanceDto) {
    return this.attendanceService.record(u.tenantId, dto, u.id);
  }

  @Get('attendance/stream/:streamId')
  @Roles('tenant_owner','school_admin','hoi','dhois','class_teacher','overall_class_teacher')
  getAttendance(
    @CurrentUser() u: User,
    @Param('streamId') streamId: string,
    @Query('date') date: string,
  ) {
    return this.attendanceService.getStreamAttendance(u.tenantId, streamId, date);
  }

  @Get('attendance/learner/:learnerId/summary')
  @Roles('tenant_owner','school_admin','hoi','class_teacher','parent','learner')
  getAttendanceSummary(
    @CurrentUser() u: User,
    @Param('learnerId') learnerId: string,
    @Query('academicYear') academicYear: string,
    @Query('term') term: string,
  ) {
    return this.attendanceService.getLearnerSummary(u.tenantId, learnerId, academicYear, term);
  }

  // ── CATs ───────────────────────────────────────────────
  @Post('cats/:id/results')
  @Roles('class_teacher','subject_teacher','overall_class_teacher')
  enterCatResults(@CurrentUser() u: User, @Param('id') catId: string, @Body() dto: EnterCatResultsDto) {
    return this.assessmentService.enterCatResults(u.tenantId, { ...dto, catId }, u.id);
  }

  // ── EXAMS ──────────────────────────────────────────────
  @Post('exam-papers/:id/results')
  @Roles('class_teacher','subject_teacher','overall_class_teacher','hoi')
  enterExamResults(@CurrentUser() u: User, @Param('id') paperId: string, @Body() dto: EnterExamResultsDto) {
    return this.assessmentService.enterExamResults(u.tenantId, { ...dto, examPaperId: paperId }, u.id);
  }

  @Get('exams/:examId/analytics/stream/:streamId')
  @Roles('tenant_owner','school_admin','hoi','dhois','class_teacher','overall_class_teacher')
  getStreamAnalytics(
    @CurrentUser() u: User,
    @Param('examId') examId: string,
    @Param('streamId') streamId: string,
  ) {
    return this.assessmentService.getStreamAnalytics(u.tenantId, streamId, examId);
  }

  // ── REPORT CARDS ───────────────────────────────────────
  @Post('report-cards/generate')
  @Roles('tenant_owner','school_admin','hoi','class_teacher','overall_class_teacher')
  generateReportCards(@CurrentUser() u: User, @Body() dto: GenerateReportCardsDto) {
    return this.reportCardService.generate(u.tenantId, dto, u.id);
  }

  @Get('report-cards/learner/:learnerId')
  @Roles('tenant_owner','school_admin','hoi','class_teacher','parent','learner')
  getLearnerReportCard(
    @CurrentUser() u: User,
    @Param('learnerId') learnerId: string,
    @Query('academicYear') academicYear: string,
    @Query('term') term: string,
  ) {
    return this.reportCardService.findOne(u.tenantId, learnerId, academicYear, term);
  }

  @Patch('report-cards/:id/approve')
  @Roles('hoi','tenant_owner','school_admin')
  approveReportCard(@CurrentUser() u: User, @Param('id') id: string, @Body('comment') comment: string) {
    return this.reportCardService.approve(u.tenantId, id, u.id, comment);
  }
}
