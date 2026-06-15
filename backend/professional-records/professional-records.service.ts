// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// MODULE 05: Professional Records — NestJS Backend
// Full KICD CBC AI Pipeline:
//   Generate → Scheme of Work → Lesson Plan → Lesson Notes
//   → Record of Work → Learner Progress Record
// All powered by Claude Sonnet 4
// ============================================================

// ─────────────────────────────────────────────────────────────
// src/modules/professional-records/dto/professional-records.dto.ts
// ─────────────────────────────────────────────────────────────
import {
  IsNotEmpty, IsOptional, IsString, IsEnum,
  IsUUID, IsNumber, IsArray, IsBoolean
} from 'class-validator';

export class GenerateSchemeDto {
  @IsNotEmpty() @IsUUID()   streamId: string;
  @IsNotEmpty() @IsUUID()   subjectId: string;
  @IsNotEmpty() @IsString() subjectName: string;         // "Mathematics"
  @IsNotEmpty() @IsString() gradeLevel: string;          // "grade_4"
  @IsNotEmpty() @IsString() academicYear: string;
  @IsNotEmpty() @IsEnum(['term_1','term_2','term_3']) term: string;
  @IsOptional() @IsNumber() totalWeeks?: number;         // default: 12
  @IsOptional() @IsNumber() periodsPerWeek?: number;     // default: 5
  @IsOptional() @IsString() schoolContext?: string;      // e.g. "Day school, mixed, urban"
  @IsOptional() @IsArray()  strandFocus?: string[];      // override strand coverage
}

export class GenerateLessonPlanDto {
  @IsNotEmpty() @IsUUID()   schemeId: string;
  @IsNotEmpty() @IsUUID()   schemeWeekId: string;
  @IsOptional() @IsString() lessonDate?: string;
  @IsOptional() @IsNumber() durationMinutes?: number;    // default: 40
}

export class GenerateLessonNotesDto {
  @IsNotEmpty() @IsUUID()   lessonPlanId: string;
  @IsOptional() @IsString() additionalContext?: string;
}

export class RecordWorkCoveredDto {
  @IsNotEmpty() @IsUUID()   streamId: string;
  @IsNotEmpty() @IsUUID()   subjectId: string;
  @IsNotEmpty() @IsString() academicYear: string;
  @IsNotEmpty() @IsString() term: string;
  @IsNotEmpty() @IsNumber() weekNumber: number;
  @IsNotEmpty() @IsString() lessonDate: string;
  @IsNotEmpty() @IsString() topic: string;
  @IsOptional() @IsString() subTopic?: string;
  @IsOptional() @IsString() strand?: string;
  @IsOptional() @IsString() subStrand?: string;
  @IsOptional() @IsString() activities?: string;
  @IsNotEmpty() @IsEnum(['covered','partially_covered','not_covered','postponed']) coverageStatus: string;
  @IsOptional() @IsString() reasonIfNotCovered?: string;
  @IsOptional() @IsNumber() learnerCount?: number;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsUUID()   lessonNoteId?: string;
}

export class GenerateLearnerProgressDto {
  @IsNotEmpty() @IsUUID()   streamId: string;
  @IsNotEmpty() @IsUUID()   subjectId: string;
  @IsNotEmpty() @IsString() academicYear: string;
  @IsNotEmpty() @IsString() term: string;
  @IsNotEmpty() @IsString() strand: string;
  @IsNotEmpty() @IsString() subStrand: string;
  @IsOptional() learnerIds?: string[];             // if empty, all active in stream
}

export class SubmitForApprovalDto {
  @IsNotEmpty() @IsString() recordType: 'scheme_of_work' | 'lesson_plan' | 'lesson_notes';
  @IsNotEmpty() @IsUUID()   recordId: string;
  @IsOptional() @IsUUID()   submittedTo?: string;  // HOI UUID, defaults to school HOI
}

export class ReviewRecordDto {
  @IsNotEmpty() @IsEnum(['approved','rejected','revision_requested']) action: string;
  @IsOptional() @IsString() comment?: string;
}


// ─────────────────────────────────────────────────────────────
// src/modules/professional-records/services/ai-generator.service.ts
// Core Claude AI generation engine
// ─────────────────────────────────────────────────────────────
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-20250514';

// Kenya CBC grade band helper
function gradeBand(gradeLevel: string): 'lower_primary' | 'upper_primary' | 'junior' | 'senior' {
  if (['playgroup','pp1','pp2','grade_1','grade_2','grade_3'].includes(gradeLevel)) return 'lower_primary';
  if (['grade_4','grade_5','grade_6'].includes(gradeLevel)) return 'upper_primary';
  if (['grade_7','grade_8','grade_9'].includes(gradeLevel)) return 'junior';
  return 'senior';
}

function performanceLevelScale(gradeLevel: string): string {
  const senior = ['grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'];
  return senior.includes(gradeLevel)
    ? 'EE1 (Exceeding Expectation 1) | EE2 | ME1 (Meeting Expectation 1) | ME2 | AE1 (Approaching Expectation 1) | AE2 | BE1 (Below Expectation 1) | BE2'
    : 'EE (Exceeding Expectation) | ME (Meeting Expectation) | AE (Approaching Expectation) | BE (Below Expectation)';
}

@Injectable()
export class AiGeneratorService {
  private claude: Anthropic;
  private readonly logger = new Logger(AiGeneratorService.name);

  constructor() {
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  // ── GENERATE SCHEME OF WORK ────────────────────────────────
  async generateSchemeOfWork(params: {
    subjectName: string;
    gradeLevel:  string;
    term:        string;
    academicYear: string;
    totalWeeks:  number;
    periodsPerWeek: number;
    schoolContext?: string;
    strandFocus?: string[];
  }): Promise<{ weeks: SchemeWeekData[]; title: string; tokens: number }> {
    const band    = gradeBand(params.gradeLevel);
    const grade   = params.gradeLevel.replace('_',' ').replace(/\b\w/g, c => c.toUpperCase());
    const termLabel = params.term.replace('_',' ').replace(/\b\w/g, c => c.toUpperCase());

    const prompt = `You are a KICD-certified curriculum expert generating a CBC/CBE-aligned Scheme of Work for Kenyan schools.

CONTEXT:
- Subject: ${params.subjectName}
- Grade Level: ${grade}
- Term: ${termLabel}, ${params.academicYear}
- Grade Band: ${band}
- Total Weeks: ${params.totalWeeks}
- Periods per Week: ${params.periodsPerWeek}
- School Context: ${params.schoolContext || 'Mixed day school, Kenya'}
${params.strandFocus?.length ? `- Priority Strands: ${params.strandFocus.join(', ')}` : ''}

REQUIREMENTS:
1. Follow the KICD ${params.subjectName} syllabus for ${grade} exactly
2. Distribute strands and sub-strands appropriately across ${params.totalWeeks} weeks
3. Each week must have clear, measurable Specific Learning Outcomes (SLOs)
4. Include Key Inquiry Questions that stimulate critical thinking
5. Learning experiences must be learner-centred and activity-based (CBC approach)
6. Assessment methods must align with CBC formative assessment principles
7. Week 1 should include orientation/introduction activities
8. Final week should include revision/consolidation
9. Use authentic Kenyan contexts, examples, and resources

Return ONLY valid JSON (no preamble, no markdown fences):
{
  "title": "Scheme of Work — ${params.subjectName} ${grade} ${termLabel} ${params.academicYear}",
  "weeks": [
    {
      "weekNumber": 1,
      "dates": "Jan 6 – Jan 10, 2025",
      "strand": "Strand name from KICD syllabus",
      "subStrand": "Sub-strand name",
      "specificLearningOutcomes": "By the end of the lesson, the learner should be able to...",
      "keyInquiryQuestions": "1. ...\n2. ...",
      "learningExperiences": "Learners will...",
      "learningResources": "Textbook pg X, charts, realia...",
      "assessmentMethods": "Observation, oral questions, written exercise",
      "periods": ${params.periodsPerWeek},
      "remarks": ""
    }
  ]
}`;

    const response = await this.callClaude(prompt, 4096);
    const parsed   = this.parseJson(response.text, 'Scheme of Work');

    if (!parsed.weeks || !Array.isArray(parsed.weeks)) {
      throw new BadRequestException('AI returned invalid scheme structure');
    }

    return { weeks: parsed.weeks, title: parsed.title, tokens: response.tokens };
  }

  // ── GENERATE LESSON PLAN ───────────────────────────────────
  async generateLessonPlan(params: {
    subjectName:   string;
    gradeLevel:    string;
    strand:        string;
    subStrand:     string;
    slos:          string;
    keyInquiryQuestions: string;
    learningExperiences: string;
    learningResources:   string;
    durationMinutes: number;
    lessonDate?:   string;
    schoolContext?: string;
  }): Promise<LessonPlanData & { tokens: number }> {
    const grade = params.gradeLevel.replace('_',' ').replace(/\b\w/g, c => c.toUpperCase());

    const prompt = `You are a KICD-certified Kenyan teacher generating a detailed CBC/CBE lesson plan.

LESSON CONTEXT:
- Subject: ${params.subjectName}
- Grade: ${grade}
- Strand: ${params.strand}
- Sub-Strand: ${params.subStrand}
- Specific Learning Outcomes: ${params.slos}
- Key Inquiry Questions: ${params.keyInquiryQuestions}
- Duration: ${params.durationMinutes} minutes
- Lesson Date: ${params.lessonDate || 'TBD'}
- Resources from Scheme: ${params.learningResources}
- School Context: ${params.schoolContext || 'Mixed day school, Kenya'}

REQUIREMENTS:
1. Follow KICD CBC lesson plan format exactly
2. Introduction (5–10 min): set induction, link to prior learning, pose key inquiry question
3. Lesson Development (main activity, 25–30 min): learner-centred, activity-based
4. Conclusion (5 min): summary, exit activity, link to next lesson
5. Assessment must be formative — observation, oral questions, written tasks
6. Include extended activities for fast learners
7. Include support activities for learners who need help
8. Core Competencies: select relevant ones from: Communication & Collaboration, Critical Thinking & Problem Solving, Creativity & Imagination, Citizenship, Digital Literacy, Learning to Learn, Self-Efficacy
9. Values: select from: Love, Responsibility, Respect, Unity, Peace, Patriotism, Social Justice, Integrity
10. PCIs (Pertinent & Contemporary Issues): select relevant ones

Return ONLY valid JSON:
{
  "strand": "...",
  "subStrand": "...",
  "specificLearningOutcomes": "...",
  "keyInquiryQuestions": "...",
  "coreCompetencies": ["..."],
  "values": ["..."],
  "pertinentIssues": "...",
  "linkToOtherSubjects": "...",
  "introduction": "...",
  "lessonDevelopment": "...",
  "conclusion": "...",
  "assessment": "...",
  "extendedActivities": "...",
  "supportActivities": "...",
  "learningMaterials": "...",
  "referenceBooks": "..."
}`;

    const response = await this.callClaude(prompt, 2048);
    const parsed   = this.parseJson(response.text, 'Lesson Plan');
    return { ...parsed, tokens: response.tokens };
  }

  // ── GENERATE LESSON NOTES ──────────────────────────────────
  async generateLessonNotes(params: {
    subjectName:    string;
    gradeLevel:     string;
    strand:         string;
    subStrand:      string;
    slos:           string;
    lessonDevelopment: string;
    assessment:     string;
    additionalContext?: string;
  }): Promise<LessonNotesData & { tokens: number }> {
    const grade = params.gradeLevel.replace('_',' ').replace(/\b\w/g, c => c.toUpperCase());

    const prompt = `You are a KICD-certified Kenyan teacher writing detailed lesson notes.

LESSON INFO:
- Subject: ${params.subjectName}, ${grade}
- Strand: ${params.strand} / ${params.subStrand}
- SLOs: ${params.slos}
- Lesson Development Summary: ${params.lessonDevelopment}
${params.additionalContext ? `- Additional Context: ${params.additionalContext}` : ''}

Generate comprehensive lesson notes that a teacher will use during delivery. Include:
1. Teacher content — the actual subject matter to be taught (detailed notes)
2. Board work — what the teacher writes on the board
3. Worked examples — step-by-step solutions or examples
4. Learner activities — what learners do (detailed instructions)
5. Probing questions — questions to check understanding at each stage
6. Expected learner responses
7. Assessment evidence — what to look for to confirm learning

Return ONLY valid JSON:
{
  "topic": "...",
  "subTopic": "...",
  "teacherContent": "...",
  "boardWork": "...",
  "examples": "...",
  "activities": "...",
  "questions": "...",
  "assessmentEvidence": "...",
  "expectedResponses": "..."
}`;

    const response = await this.callClaude(prompt, 2048);
    const parsed   = this.parseJson(response.text, 'Lesson Notes');
    return { ...parsed, tokens: response.tokens };
  }

  // ── GENERATE LEARNER PROGRESS RECORDS ─────────────────────
  async generateLearnerProgressRecords(params: {
    learners: { id: string; firstName: string; lastName: string; gender: string }[];
    subjectName: string;
    gradeLevel:  string;
    strand:      string;
    subStrand:   string;
    sloAssessed: string;
    assessmentContext: string;   // brief desc of what was observed
  }): Promise<{ records: LearnerProgressData[]; tokens: number }> {
    const grade      = params.gradeLevel.replace('_',' ').replace(/\b\w/g, c => c.toUpperCase());
    const perfLevels = performanceLevelScale(params.gradeLevel);

    const learnerList = params.learners
      .map((l, i) => `${i+1}. ${l.firstName} ${l.lastName} (${l.gender})`)
      .join('\n');

    const prompt = `You are a CBC-trained Kenyan teacher recording learner progress.

ASSESSMENT CONTEXT:
- Subject: ${params.subjectName}, ${grade}
- Strand: ${params.strand}
- Sub-Strand: ${params.subStrand}
- SLO Assessed: ${params.sloAssessed}
- Observation Context: ${params.assessmentContext}

PERFORMANCE LEVELS: ${perfLevels}

LEARNERS:
${learnerList}

For each learner, assign a realistic, varied performance level and write brief evidence (one sentence) 
of what the learner did that shows this level. Be realistic — not everyone exceeds expectation.

Return ONLY valid JSON:
{
  "records": [
    {
      "learnerId": "use position number as placeholder e.g. 1",
      "performanceLevel": "EE|ME|AE|BE (or numbered variant for G7-12)",
      "evidence": "One-sentence observation of what this learner did",
      "teacherComment": "Brief actionable comment (max 15 words)",
      "supportNeeded": false
    }
  ]
}`;

    const response = await this.callClaude(prompt, 2048);
    const parsed   = this.parseJson(response.text, 'Learner Progress');

    // Map position back to actual learner IDs
    const mapped = parsed.records.map((r: any, i: number) => ({
      ...r,
      learnerId: params.learners[i]?.id || r.learnerId,
    }));

    return { records: mapped, tokens: response.tokens };
  }

  // ── PRIVATE: Call Claude ───────────────────────────────────
  private async callClaude(prompt: string, maxTokens: number): Promise<{ text: string; tokens: number }> {
    try {
      const response = await this.claude.messages.create({
        model:      MODEL,
        max_tokens: maxTokens,
        messages:   [{ role: 'user', content: prompt }],
      });

      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as any).text)
        .join('');

      return { text, tokens: response.usage?.output_tokens || 0 };
    } catch (err: any) {
      this.logger.error(`Claude API error: ${err.message}`);
      throw new BadRequestException(`AI generation failed: ${err.message}`);
    }
  }

  private parseJson(raw: string, context: string): any {
    try {
      const clean = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch {
      throw new BadRequestException(`Could not parse AI response for ${context}. Please try again.`);
    }
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/professional-records/services/scheme.service.ts
// ─────────────────────────────────────────────────────────────
import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

@Injectable()
export class SchemeService {
  constructor(
    @InjectRepository(SchemeOfWork)   private schemeRepo:  Repository<SchemeOfWork>,
    @InjectRepository(SchemeWeek)     private weekRepo:    Repository<SchemeWeek>,
    @InjectRepository(TeacherDocument)private docRepo:     Repository<TeacherDocument>,
    @InjectRepository(PrAudit)        private auditRepo:   Repository<PrAudit>,
    private aiGenerator: AiGeneratorService,
    private dataSource:  DataSource,
  ) {}

  // ── GENERATE SCHEME OF WORK (AI) ──────────────────────────
  async generate(tenantId: string, schoolId: string, teacherId: string, dto: GenerateSchemeDto) {
    // Check for existing scheme (prevent duplicates)
    const existing = await this.schemeRepo.findOne({
      where: { tenantId, teacherId, streamId: dto.streamId, subjectId: dto.subjectId,
               academicYear: dto.academicYear, term: dto.term as any },
    });
    if (existing && existing.status !== 'rejected') {
      throw new BadRequestException(
        `A scheme of work already exists for this subject/stream/term. Status: ${existing.status}`
      );
    }

    const totalWeeks    = dto.totalWeeks    || 12;
    const periodsPerWeek = dto.periodsPerWeek || 5;

    // Call AI
    const { weeks, title, tokens } = await this.aiGenerator.generateSchemeOfWork({
      subjectName:   dto.subjectName,
      gradeLevel:    dto.gradeLevel,
      term:          dto.term,
      academicYear:  dto.academicYear,
      totalWeeks,
      periodsPerWeek,
      schoolContext: dto.schoolContext,
      strandFocus:   dto.strandFocus,
    });

    return this.dataSource.transaction(async (manager) => {
      // Save scheme header
      const scheme = manager.create(SchemeOfWork, {
        tenantId, schoolId, teacherId,
        streamId:    dto.streamId,
        subjectId:   dto.subjectId,
        academicYear: dto.academicYear,
        term:        dto.term as any,
        gradeLevel:  dto.gradeLevel,
        title,
        aiGenerated: true,
        aiModel:     'claude-sonnet-4-20250514',
        generationTokens: tokens,
        status:      'draft',
      });
      await manager.save(SchemeOfWork, scheme);

      // Save all weeks
      for (const w of weeks) {
        await manager.save(SchemeWeek, manager.create(SchemeWeek, {
          tenantId,
          schemeId:                scheme.id,
          weekNumber:              w.weekNumber,
          dates:                   w.dates,
          strand:                  w.strand,
          subStrand:               w.subStrand,
          specificLearningOutcomes: w.specificLearningOutcomes,
          keyInquiryQuestions:     w.keyInquiryQuestions,
          learningExperiences:     w.learningExperiences,
          learningResources:       w.learningResources,
          assessmentMethods:       w.assessmentMethods,
          periods:                 w.periods || periodsPerWeek,
          remarks:                 '',
        }));
      }

      return {
        schemeId:    scheme.id,
        title,
        totalWeeks:  weeks.length,
        status:      'draft',
        message:     `Scheme of Work generated: ${weeks.length} weeks. Review and submit for approval.`,
      };
    });
  }

  // ── GET SCHEME (with weeks) ────────────────────────────────
  async findOne(tenantId: string, schemeId: string) {
    const scheme = await this.schemeRepo.findOne({
      where: { id: schemeId, tenantId },
      relations: ['weeks'],
    });
    if (!scheme) throw new NotFoundException('Scheme of work not found');
    return scheme;
  }

  // ── LIST (for teacher or admin) ────────────────────────────
  async findAll(tenantId: string, filters: {
    teacherId?: string; streamId?: string; subjectId?: string;
    academicYear?: string; term?: string; status?: string;
  }) {
    const qb = this.schemeRepo.createQueryBuilder('s')
      .where('s.tenant_id = :tenantId AND s.deleted_at IS NULL', { tenantId })
      .orderBy('s.created_at', 'DESC');

    if (filters.teacherId)   qb.andWhere('s.teacher_id = :tid',    { tid: filters.teacherId });
    if (filters.streamId)    qb.andWhere('s.stream_id = :sid',     { sid: filters.streamId });
    if (filters.academicYear) qb.andWhere('s.academic_year = :yr', { yr: filters.academicYear });
    if (filters.term)        qb.andWhere('s.term = :term',         { term: filters.term });
    if (filters.status)      qb.andWhere('s.status = :status',     { status: filters.status });

    return qb.getMany();
  }

  // ── SUBMIT FOR APPROVAL ────────────────────────────────────
  async submit(tenantId: string, schemeId: string, teacherId: string, submittedTo?: string) {
    const scheme = await this.schemeRepo.findOne({ where: { id: schemeId, tenantId, teacherId } });
    if (!scheme) throw new NotFoundException('Scheme not found');
    if (!['draft','revision_requested'].includes(scheme.status)) {
      throw new BadRequestException(`Cannot submit — current status: ${scheme.status}`);
    }

    await this.schemeRepo.update(schemeId, {
      status:      'submitted',
      submittedAt: new Date(),
      submittedTo,
    });

    await this.auditRepo.save({
      tenantId, recordType: 'scheme_of_work', recordId: schemeId,
      action: 'submitted', actorId: teacherId, actorRole: 'teacher',
    });

    return { message: 'Scheme submitted for approval.' };
  }

  // ── REVIEW (HOI / Admin) ───────────────────────────────────
  async review(tenantId: string, schemeId: string, reviewerId: string, dto: ReviewRecordDto) {
    const scheme = await this.schemeRepo.findOne({ where: { id: schemeId, tenantId } });
    if (!scheme) throw new NotFoundException('Scheme not found');
    if (scheme.status !== 'submitted') {
      throw new BadRequestException('Only submitted schemes can be reviewed');
    }

    await this.schemeRepo.update(schemeId, {
      status:        dto.action as any,
      reviewedBy:    reviewerId,
      reviewedAt:    new Date(),
      reviewComment: dto.comment,
    });

    await this.auditRepo.save({
      tenantId, recordType: 'scheme_of_work', recordId: schemeId,
      action: dto.action, actorId: reviewerId, actorRole: 'hoi',
      comment: dto.comment,
    });

    return { message: `Scheme ${dto.action}.`, comment: dto.comment };
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/professional-records/services/lesson-plan.service.ts
// ─────────────────────────────────────────────────────────────
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

@Injectable()
export class LessonPlanService {
  constructor(
    @InjectRepository(LessonPlan)     private planRepo:   Repository<LessonPlan>,
    @InjectRepository(SchemeOfWork)   private schemeRepo: Repository<SchemeOfWork>,
    @InjectRepository(SchemeWeek)     private weekRepo:   Repository<SchemeWeek>,
    @InjectRepository(SubjectCatalogue) private subjRepo: Repository<SubjectCatalogue>,
    @InjectRepository(PrAudit)        private auditRepo:  Repository<PrAudit>,
    private aiGenerator: AiGeneratorService,
    private dataSource:  DataSource,
  ) {}

  async generate(tenantId: string, teacherId: string, dto: GenerateLessonPlanDto) {
    const scheme = await this.schemeRepo.findOne({
      where: { id: dto.schemeId, tenantId, teacherId },
    });
    if (!scheme) throw new NotFoundException('Scheme not found');

    const week = await this.weekRepo.findOne({ where: { id: dto.schemeWeekId } });
    if (!week)   throw new NotFoundException('Scheme week not found');

    const subject = await this.subjRepo.findOne({ where: { id: scheme.subjectId } });

    const planData = await this.aiGenerator.generateLessonPlan({
      subjectName:         subject?.name || 'Unknown Subject',
      gradeLevel:          scheme.gradeLevel,
      strand:              week.strand,
      subStrand:           week.subStrand,
      slos:                week.specificLearningOutcomes,
      keyInquiryQuestions: week.keyInquiryQuestions || '',
      learningExperiences: week.learningExperiences,
      learningResources:   week.learningResources || '',
      durationMinutes:     dto.durationMinutes || 40,
      lessonDate:          dto.lessonDate,
    });

    const plan = await this.planRepo.save(
      this.planRepo.create({
        tenantId,
        teacherId,
        schemeId:    dto.schemeId,
        schemeWeekId: dto.schemeWeekId,
        streamId:    scheme.streamId,
        subjectId:   scheme.subjectId,
        lessonDate:  dto.lessonDate ? new Date(dto.lessonDate) : null,
        lessonNumber: week.weekNumber,
        durationMinutes: dto.durationMinutes || 40,
        gradeLevel:  scheme.gradeLevel,

        strand:                     planData.strand,
        subStrand:                  planData.subStrand,
        specificLearningOutcomes:   planData.specificLearningOutcomes,
        keyInquiryQuestions:        planData.keyInquiryQuestions,
        coreCompetencies:           planData.coreCompetencies,
        values:                     planData.values,
        pertinentIssues:            planData.pertinentIssues,
        linkToOtherSubjects:        planData.linkToOtherSubjects,
        introduction:               planData.introduction,
        lessonDevelopment:          planData.lessonDevelopment,
        conclusion:                 planData.conclusion,
        assessment:                 planData.assessment,
        extendedActivities:         planData.extendedActivities,
        supportActivities:          planData.supportActivities,
        learningMaterials:          planData.learningMaterials,
        referenceBooks:             planData.referenceBooks,
        aiGenerated: true,
        aiModel:     'claude-sonnet-4-20250514',
        status:      'draft',
      })
    );

    return { planId: plan.id, status: 'draft', message: 'Lesson plan generated. Review and submit.' };
  }

  async submit(tenantId: string, planId: string, teacherId: string) {
    await this.planRepo.update({ id: planId, tenantId, teacherId }, {
      status: 'submitted', submittedAt: new Date(),
    });
    await this.auditRepo.save({
      tenantId, recordType: 'lesson_plan', recordId: planId,
      action: 'submitted', actorId: teacherId, actorRole: 'teacher',
    });
    return { message: 'Lesson plan submitted for approval.' };
  }

  async review(tenantId: string, planId: string, reviewerId: string, dto: ReviewRecordDto) {
    await this.planRepo.update({ id: planId, tenantId }, {
      status:      dto.action as any,
      reviewedBy:  reviewerId,
      reviewedAt:  new Date(),
      reviewComment: dto.comment,
    });
    await this.auditRepo.save({
      tenantId, recordType: 'lesson_plan', recordId: planId,
      action: dto.action, actorId: reviewerId, actorRole: 'hoi', comment: dto.comment,
    });
    return { message: `Lesson plan ${dto.action}.` };
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/professional-records/services/records.service.ts
// Lesson Notes + Records of Work + Learner Progress
// ─────────────────────────────────────────────────────────────
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

@Injectable()
export class RecordsService {
  constructor(
    @InjectRepository(LessonNote)              private notesRepo:    Repository<LessonNote>,
    @InjectRepository(LessonPlan)              private planRepo:     Repository<LessonPlan>,
    @InjectRepository(RecordOfWork)            private rowRepo:      Repository<RecordOfWork>,
    @InjectRepository(LearnerProgressEntry)    private lpeRepo:      Repository<LearnerProgressEntry>,
    @InjectRepository(Learner)                 private learnerRepo:  Repository<Learner>,
    @InjectRepository(SubjectCatalogue)        private subjRepo:     Repository<SubjectCatalogue>,
    @InjectRepository(PrAudit)                 private auditRepo:    Repository<PrAudit>,
    private aiGenerator: AiGeneratorService,
    private dataSource:  DataSource,
  ) {}

  // ── GENERATE LESSON NOTES ──────────────────────────────────
  async generateNotes(tenantId: string, teacherId: string, dto: GenerateLessonNotesDto) {
    const plan = await this.planRepo.findOne({
      where: { id: dto.lessonPlanId, tenantId, teacherId },
      relations: ['subject'],
    });
    if (!plan) throw new NotFoundException('Lesson plan not found');

    const notesData = await this.aiGenerator.generateLessonNotes({
      subjectName:       plan.subject?.name || 'Subject',
      gradeLevel:        plan.gradeLevel,
      strand:            plan.strand,
      subStrand:         plan.subStrand,
      slos:              plan.specificLearningOutcomes,
      lessonDevelopment: plan.lessonDevelopment,
      assessment:        plan.assessment,
      additionalContext: dto.additionalContext,
    });

    const notes = await this.notesRepo.save(
      this.notesRepo.create({
        tenantId,
        teacherId,
        lessonPlanId: dto.lessonPlanId,
        streamId:     plan.streamId,
        subjectId:    plan.subjectId,
        lessonDate:   plan.lessonDate || new Date(),
        gradeLevel:   plan.gradeLevel,
        topic:        notesData.topic,
        subTopic:     notesData.subTopic,
        teacherContent:     notesData.teacherContent,
        boardWork:          notesData.boardWork,
        examples:           notesData.examples,
        activities:         notesData.activities,
        questions:          notesData.questions,
        assessmentEvidence: notesData.assessmentEvidence,
        expectedResponses:  notesData.expectedResponses,
        coverageStatus:     'pending',
        aiGenerated: true,
        aiModel:     'claude-sonnet-4-20250514',
        status:      'draft',
      })
    );

    return { notesId: notes.id, status: 'draft', message: 'Lesson notes generated.' };
  }

  // ── RECORD OF WORK COVERED ────────────────────────────────
  async recordWork(tenantId: string, teacherId: string, dto: RecordWorkCoveredDto) {
    const row = await this.rowRepo.save(
      this.rowRepo.create({
        tenantId,
        teacherId,
        streamId:    dto.streamId,
        subjectId:   dto.subjectId,
        lessonNoteId: dto.lessonNoteId,
        academicYear: dto.academicYear,
        term:         dto.term,
        weekNumber:   dto.weekNumber,
        lessonDate:   new Date(dto.lessonDate),
        topic:        dto.topic,
        subTopic:     dto.subTopic,
        strand:       dto.strand,
        subStrand:    dto.subStrand,
        activities:   dto.activities,
        coverageStatus: dto.coverageStatus as any,
        reasonIfNotCovered: dto.reasonIfNotCovered,
        learnerCount: dto.learnerCount,
        remarks:      dto.remarks,
      })
    );

    // Auto-update lesson notes coverage status
    if (dto.lessonNoteId) {
      await this.notesRepo.update(dto.lessonNoteId, {
        coverageStatus: dto.coverageStatus as any,
        deliveryRemarks: dto.remarks,
      });
    }

    return { rowId: row.id, message: 'Record of work saved.' };
  }

  // ── GENERATE LEARNER PROGRESS RECORDS (AI) ────────────────
  async generateProgressRecords(tenantId: string, teacherId: string, dto: GenerateLearnerProgressDto) {
    const subject = await this.subjRepo.findOne({ where: { id: dto.subjectId } });

    // Get all active learners in stream
    const learners = await this.learnerRepo.find({
      where: { tenantId, streamId: dto.streamId, status: 'active', deletedAt: null },
      order: { lastName: 'ASC', firstName: 'ASC' },
    });

    if (learners.length === 0) throw new NotFoundException('No active learners in stream');

    // Target batch: all or specific
    const targetLearners = dto.learnerIds?.length
      ? learners.filter(l => dto.learnerIds!.includes(l.id))
      : learners;

    const { records, tokens } = await this.aiGenerator.generateLearnerProgressRecords({
      learners:         targetLearners.map(l => ({ id: l.id, firstName: l.firstName, lastName: l.lastName, gender: l.gender })),
      subjectName:      subject?.name || 'Subject',
      gradeLevel:       targetLearners[0]?.gradeLevel || 'grade_4',
      strand:           dto.strand,
      subStrand:        dto.subStrand,
      sloAssessed:      `${dto.strand} — ${dto.subStrand}`,
      assessmentContext: `${dto.strand}: ${dto.subStrand} — ${dto.term.replace('_',' ')} ${dto.academicYear}`,
    });

    // Save all progress records
    return this.dataSource.transaction(async (manager) => {
      const saved = [];
      for (const r of records) {
        const existing = await this.lpeRepo.findOne({
          where: {
            tenantId, learnerId: r.learnerId, subjectId: dto.subjectId,
            strand: dto.strand, subStrand: dto.subStrand,
            academicYear: dto.academicYear, term: dto.term,
          },
        });

        const data = {
          tenantId, teacherId,
          learnerId:  r.learnerId,
          streamId:   dto.streamId,
          subjectId:  dto.subjectId,
          academicYear: dto.academicYear,
          term:       dto.term,
          strand:     dto.strand,
          subStrand:  dto.subStrand,
          performanceLevel: r.performanceLevel,
          evidence:         r.evidence,
          teacherComment:   r.teacherComment,
          supportNeeded:    r.supportNeeded,
          aiGenerated:      true,
        };

        if (existing) {
          await manager.update(LearnerProgressEntry, existing.id, data);
          saved.push({ learnerId: r.learnerId, action: 'updated' });
        } else {
          await manager.save(LearnerProgressEntry, manager.create(LearnerProgressEntry, data));
          saved.push({ learnerId: r.learnerId, action: 'created' });
        }
      }

      return {
        recorded: saved.length,
        saved,
        message: `Learner progress records generated for ${saved.length} learners.`,
      };
    });
  }

  // ── GET RECORDS OF WORK (running log) ─────────────────────
  async getRecordsOfWork(tenantId: string, teacherId: string, filters: {
    streamId?: string; subjectId?: string; academicYear?: string; term?: string;
  }) {
    const qb = this.rowRepo.createQueryBuilder('r')
      .where('r.tenant_id = :tenantId AND r.teacher_id = :teacherId', { tenantId, teacherId })
      .orderBy('r.lesson_date', 'DESC');

    if (filters.streamId)    qb.andWhere('r.stream_id = :sid',       { sid: filters.streamId });
    if (filters.subjectId)   qb.andWhere('r.subject_id = :subjId',   { subjId: filters.subjectId });
    if (filters.academicYear) qb.andWhere('r.academic_year = :yr',   { yr: filters.academicYear });
    if (filters.term)        qb.andWhere('r.term = :term',           { term: filters.term });

    return qb.getMany();
  }

  // ── GET TEACHER FOLDER ─────────────────────────────────────
  async getTeacherFolder(tenantId: string, teacherId: string, filters?: {
    academicYear?: string; term?: string; subjectName?: string;
  }) {
    const qb = this.dataSource.getRepository(TeacherDocument)
      .createQueryBuilder('d')
      .where('d.tenant_id = :tenantId AND d.teacher_id = :teacherId', { tenantId, teacherId })
      .orderBy('d.created_at', 'DESC');

    if (filters?.academicYear) qb.andWhere('d.academic_year = :yr',        { yr: filters.academicYear });
    if (filters?.term)         qb.andWhere('d.term = :term',               { term: filters.term });
    if (filters?.subjectName)  qb.andWhere('d.subject_name ILIKE :subj',   { subj: `%${filters.subjectName}%` });

    const docs = await qb.getMany();

    // Group by document type
    return {
      schemesOfWork:       docs.filter(d => d.documentType === 'scheme_of_work'),
      lessonPlans:         docs.filter(d => d.documentType === 'lesson_plan'),
      lessonNotes:         docs.filter(d => d.documentType === 'lesson_notes'),
      recordsOfWork:       docs.filter(d => d.documentType === 'record_of_work'),
      learnerProgressRecords: docs.filter(d => d.documentType === 'learner_progress_record'),
      total:               docs.length,
    };
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/professional-records/professional-records.controller.ts
// ─────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Patch, Body, Param,
  Query, UseGuards, HttpCode, HttpStatus
} from '@nestjs/common';

@Controller('api/v1/professional-records')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProfessionalRecordsController {
  constructor(
    private schemeService:     SchemeService,
    private lessonPlanService: LessonPlanService,
    private recordsService:    RecordsService,
  ) {}

  // ── SCHEMES OF WORK ───────────────────────────────────────
  @Post('schemes/generate')
  @Roles('class_teacher','subject_teacher','overall_class_teacher','hoi')
  generateScheme(@CurrentUser() u: User, @Body() dto: GenerateSchemeDto) {
    return this.schemeService.generate(u.tenantId, u.schoolId, u.id, dto);
  }

  @Get('schemes')
  @Roles('class_teacher','subject_teacher','overall_class_teacher','hoi','dhois','school_admin','tenant_owner')
  listSchemes(@CurrentUser() u: User, @Query() filters: any) {
    const teacherFilter = ['hoi','dhois','school_admin','tenant_owner'].includes(u.role)
      ? filters
      : { ...filters, teacherId: u.id };
    return this.schemeService.findAll(u.tenantId, teacherFilter);
  }

  @Get('schemes/:id')
  @Roles('class_teacher','subject_teacher','overall_class_teacher','hoi','dhois','school_admin','tenant_owner')
  getScheme(@CurrentUser() u: User, @Param('id') id: string) {
    return this.schemeService.findOne(u.tenantId, id);
  }

  @Post('schemes/:id/submit')
  @Roles('class_teacher','subject_teacher','overall_class_teacher')
  submitScheme(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Body('submittedTo') submittedTo?: string,
  ) {
    return this.schemeService.submit(u.tenantId, id, u.id, submittedTo);
  }

  @Patch('schemes/:id/review')
  @Roles('hoi','dhois','school_admin','tenant_owner')
  reviewScheme(@CurrentUser() u: User, @Param('id') id: string, @Body() dto: ReviewRecordDto) {
    return this.schemeService.review(u.tenantId, id, u.id, dto);
  }

  // ── LESSON PLANS ──────────────────────────────────────────
  @Post('lesson-plans/generate')
  @Roles('class_teacher','subject_teacher','overall_class_teacher')
  generateLessonPlan(@CurrentUser() u: User, @Body() dto: GenerateLessonPlanDto) {
    return this.lessonPlanService.generate(u.tenantId, u.id, dto);
  }

  @Post('lesson-plans/:id/submit')
  @Roles('class_teacher','subject_teacher','overall_class_teacher')
  submitLessonPlan(@CurrentUser() u: User, @Param('id') id: string) {
    return this.lessonPlanService.submit(u.tenantId, id, u.id);
  }

  @Patch('lesson-plans/:id/review')
  @Roles('hoi','dhois','school_admin','tenant_owner')
  reviewLessonPlan(@CurrentUser() u: User, @Param('id') id: string, @Body() dto: ReviewRecordDto) {
    return this.lessonPlanService.review(u.tenantId, id, u.id, dto);
  }

  // ── LESSON NOTES ──────────────────────────────────────────
  @Post('lesson-notes/generate')
  @Roles('class_teacher','subject_teacher','overall_class_teacher')
  generateLessonNotes(@CurrentUser() u: User, @Body() dto: GenerateLessonNotesDto) {
    return this.recordsService.generateNotes(u.tenantId, u.id, dto);
  }

  // ── RECORDS OF WORK ───────────────────────────────────────
  @Post('records-of-work')
  @Roles('class_teacher','subject_teacher','overall_class_teacher')
  recordWork(@CurrentUser() u: User, @Body() dto: RecordWorkCoveredDto) {
    return this.recordsService.recordWork(u.tenantId, u.id, dto);
  }

  @Get('records-of-work')
  @Roles('class_teacher','subject_teacher','overall_class_teacher','hoi','dhois')
  getRecordsOfWork(@CurrentUser() u: User, @Query() filters: any) {
    return this.recordsService.getRecordsOfWork(u.tenantId, u.id, filters);
  }

  // ── LEARNER PROGRESS RECORDS ──────────────────────────────
  @Post('learner-progress/generate')
  @Roles('class_teacher','subject_teacher','overall_class_teacher')
  generateLearnerProgress(@CurrentUser() u: User, @Body() dto: GenerateLearnerProgressDto) {
    return this.recordsService.generateProgressRecords(u.tenantId, u.id, dto);
  }

  @Get('learner-progress')
  @Roles('class_teacher','subject_teacher','overall_class_teacher','hoi','dhois')
  getLearnerProgress(@CurrentUser() u: User, @Query() filters: any) {
    return this.recordsService.lpeRepo.find({
      where: { tenantId: u.tenantId, teacherId: u.id, ...filters },
      order: { assessmentDate: 'DESC' },
    });
  }

  // ── TEACHER FOLDER ────────────────────────────────────────
  @Get('folder')
  @Roles('class_teacher','subject_teacher','overall_class_teacher','hoi','dhois')
  getFolder(@CurrentUser() u: User, @Query() filters: any) {
    return this.recordsService.getTeacherFolder(u.tenantId, u.id, filters);
  }

  // ── PENDING APPROVALS (HOI dashboard) ────────────────────
  @Get('pending-approvals')
  @Roles('hoi','dhois','school_admin','tenant_owner')
  async getPendingApprovals(@CurrentUser() u: User) {
    const [schemes, plans, notes] = await Promise.all([
      this.schemeService.findAll(u.tenantId, { status: 'submitted' }),
      this.lessonPlanService.planRepo.find({
        where: { tenantId: u.tenantId, status: 'submitted' as any },
        order: { submittedAt: 'ASC' },
      }),
      this.recordsService.notesRepo.find({
        where: { tenantId: u.tenantId, status: 'submitted' as any },
        order: { submittedAt: 'ASC' },
      }),
    ]);

    return {
      schemesOfWork: schemes,
      lessonPlans:   plans,
      lessonNotes:   notes,
      total:         schemes.length + plans.length + notes.length,
    };
  }
}
