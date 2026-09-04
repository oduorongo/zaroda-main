import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  LessonNote, LessonPlan, RecordOfWork, LearnerProgressEntry,
  SubjectCatalogue, PrAudit, TeacherDocument, SchemeOfWork, SchemeWeek,
} from './entities';
import { Learner } from '../academic/academic.module';
import { AiGeneratorService } from './ai-generator.service';
import { WalletService } from './wallet.service';
import { GenerateLessonNotesDto, RecordWorkCoveredDto, GenerateLearnerProgressDto } from './dto';
import { documentShell, escHtml, isKiswahiliSubject, label as translate } from './document-render.util';

@Injectable()
export class RecordsService {
  constructor(
    @InjectRepository(LessonNote) public notesRepo: Repository<LessonNote>,
    @InjectRepository(LessonPlan) private planRepo: Repository<LessonPlan>,
    @InjectRepository(SchemeOfWork) private schemeRepo: Repository<SchemeOfWork>,
    @InjectRepository(SchemeWeek) private weekRepo: Repository<SchemeWeek>,
    @InjectRepository(RecordOfWork) private rowRepo: Repository<RecordOfWork>,
    @InjectRepository(LearnerProgressEntry) public lpeRepo: Repository<LearnerProgressEntry>,
    @InjectRepository(Learner) private learnerRepo: Repository<Learner>,
    @InjectRepository(SubjectCatalogue) private subjRepo: Repository<SubjectCatalogue>,
    @InjectRepository(PrAudit) private auditRepo: Repository<PrAudit>,
    private aiGenerator: AiGeneratorService,
    private walletService: WalletService,
    private dataSource: DataSource,
  ) {}

  // ── GENERATE LESSON NOTES ──────────────────────────────────
  // Either from an existing lesson plan, or directly from a scheme week —
  // letting a teacher skip the lesson plan step entirely when they just want notes.
  async generateNotes(tenantId: string, teacherId: string, dto: GenerateLessonNotesDto) {
    if (!dto.lessonPlanId && !(dto.schemeId && dto.schemeWeekId)) {
      throw new BadRequestException('Provide either lessonPlanId, or schemeId + schemeWeekId.');
    }

    await this.walletService.assertAffordable(tenantId, teacherId, 'lesson_notes');

    let notesData: any;
    let base: {
      lessonPlanId: string | null; schemeId: string | null; schemeWeekId: string | null; lessonSlot: number | null;
      streamId: string; subjectId: string; lessonDate: Date; gradeLevel: string;
      strand: string; subStrand: string;
    };

    if (dto.lessonPlanId) {
      const plan = await this.planRepo.findOne({ where: { id: dto.lessonPlanId, tenantId, teacherId } });
      if (!plan) throw new NotFoundException('Lesson plan not found');

      // schemeWeekId/lessonSlot are always populated below (even on the lessonPlanId
      // path) so this dedupe check catches a duplicate regardless of which route
      // generated the first note for this specific lesson.
      if (plan.schemeWeekId) {
        const dupe = await this.notesRepo.findOne({ where: { tenantId, teacherId, schemeWeekId: plan.schemeWeekId, lessonSlot: plan.lessonSlot } });
        if (dupe) throw new BadRequestException('Lesson notes already exist for this lesson. Open them instead of generating another.');
      }

      const subject = await this.subjRepo.findOne({ where: { id: plan.subjectId } });
      notesData = await this.aiGenerator.generateLessonNotes({
        subjectName: subject?.name || 'Subject',
        gradeLevel: plan.gradeLevel,
        strand: plan.strand,
        subStrand: plan.subStrand,
        slos: plan.specificLearningOutcomes,
        lessonDevelopment: plan.lessonDevelopment,
        assessment: plan.assessment,
        additionalContext: dto.additionalContext,
      });
      base = {
        lessonPlanId: plan.id, schemeId: plan.schemeId, schemeWeekId: plan.schemeWeekId, lessonSlot: plan.lessonSlot,
        streamId: plan.streamId, subjectId: plan.subjectId,
        lessonDate: plan.lessonDate || new Date(), gradeLevel: plan.gradeLevel,
        strand: plan.strand, subStrand: plan.subStrand,
      };
    } else {
      const scheme = await this.schemeRepo.findOne({ where: { id: dto.schemeId, tenantId, teacherId } });
      if (!scheme) throw new NotFoundException('Scheme not found');
      const week = await this.weekRepo.findOne({ where: { id: dto.schemeWeekId, schemeId: scheme.id } });
      if (!week) throw new NotFoundException('Scheme week not found');

      // A week can hold several lessons — notes are generated for ONE of them.
      const lessons = week.lessons || [];
      const lessonSlot = lessons.length ? (dto.lessonSlot || 1) : 1;
      const lesson = lessons.find((l) => l.lessonNumber === lessonSlot);
      if (lessons.length && !lesson) throw new BadRequestException(`This week has no lesson ${lessonSlot}.`);

      const dupe = await this.notesRepo.findOne({ where: { tenantId, teacherId, schemeWeekId: week.id, lessonSlot } });
      if (dupe) throw new BadRequestException('Lesson notes already exist for this lesson. Open them instead of generating another.');

      const subject = await this.subjRepo.findOne({ where: { id: scheme.subjectId } });
      notesData = await this.aiGenerator.generateLessonNotes({
        subjectName: subject?.name || 'Subject',
        gradeLevel: scheme.gradeLevel,
        strand: week.strand,
        subStrand: week.subStrand,
        slos: lesson ? lesson.specificLearningOutcomes : week.specificLearningOutcomes,
        lessonDevelopment: lesson ? lesson.learningExperiences : week.learningExperiences,
        assessment: week.assessmentMethods || '',
        additionalContext: dto.additionalContext,
      });
      base = {
        lessonPlanId: null, schemeId: scheme.id, schemeWeekId: week.id, lessonSlot,
        streamId: scheme.streamId, subjectId: scheme.subjectId,
        lessonDate: new Date(), gradeLevel: scheme.gradeLevel,
        strand: week.strand, subStrand: week.subStrand,
      };
    }

    let notes;
    try {
      notes = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(
        this.notesRepo.create({
          tenantId,
          teacherId,
          ...base,
          topic: notesData.topic,
          subTopic: notesData.subTopic,
          slosCovered: notesData.slosCovered,
          introduction: notesData.introduction,
          teacherContent: notesData.teacherContent,
          keyVocabulary: notesData.keyVocabulary,
          summary: notesData.summary,
          reviewQuestions: notesData.reviewQuestions,
          referenceMaterials: notesData.referenceMaterials,
          learnerContent: notesData.learnerContent,
          coverageStatus: 'pending',
          aiGenerated: true,
          aiModel: 'claude-haiku-4-5-20251001',
          generationTokens: notesData.tokens,
          status: 'draft',
        }),
      );
      await this.walletService.debit(tenantId, teacherId, 'lesson_notes', saved.id, manager);
      return saved;
      });
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new BadRequestException('Lesson notes already exist for this lesson. Open them instead of generating another.');
      }
      throw err;
    }

    return { notesId: notes.id, status: 'draft', message: 'Lesson notes generated.' };
  }

  async findNotes(tenantId: string, filters: { teacherId?: string; lessonPlanId?: string }) {
    return this.notesRepo.find({
      where: { tenantId, ...filters },
      order: { createdAt: 'DESC' as any },
    });
  }

  // Resolves the scheme a lesson note belongs to, whichever path it was generated
  // from — via its lesson plan, or directly (schemeId set on the note itself).
  private async resolveNoteScheme(tenantId: string, note: LessonNote): Promise<SchemeOfWork | null> {
    if (note.schemeId) return this.schemeRepo.findOne({ where: { id: note.schemeId, tenantId } });
    if (note.lessonPlanId) {
      const plan = await this.planRepo.findOne({ where: { id: note.lessonPlanId, tenantId } });
      if (plan) return this.schemeRepo.findOne({ where: { id: plan.schemeId, tenantId } });
    }
    return null;
  }

  // ── RENDER PRINTABLE DOCUMENT (PDF/Word, watermarked) ─────
  // variant 'teacher' includes the full teaching notes; 'learner' is the
  // simplified, plain-language handout version of the same lesson.
  // Mirrors the official KICD Lesson Notes grid template (School/Learning Area/Grade,
  // Term/Week/Date, Strand/Sub-Strand, SLOs Covered, Introduction, Content, Key
  // Vocabulary, Summary, Review Questions with answers, References). variant
  // 'learner' renders just the simplified learner-facing content instead.
  async renderNotesHtml(tenantId: string, notesId: string, fontOverride?: string, variant: 'teacher' | 'learner' = 'teacher', wordSafe?: boolean): Promise<string> {
    const notes = await this.notesRepo.findOne({ where: { id: notesId, tenantId } });
    if (!notes) throw new NotFoundException('Lesson notes not found');
    const scheme = await this.resolveNoteScheme(tenantId, notes);
    const subject = await this.subjRepo.findOne({ where: { id: notes.subjectId } });
    const kiswahili = isKiswahiliSubject(subject?.name);
    const week = notes.schemeWeekId
      ? await this.weekRepo.findOne({ where: { id: notes.schemeWeekId } })
      : (notes.lessonPlanId ? await this.planRepo.findOne({ where: { id: notes.lessonPlanId } }) : null);
    const font = fontOverride || scheme?.defaultFont || 'Times New Roman';
    const grade = String(notes.gradeLevel || '').replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const term = scheme?.term ? String(scheme.term).replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';
    const weekNumber = (week as any)?.weekNumber ?? (week as any)?.lessonNumber ?? '';
    const L = (s: string) => translate(s, kiswahili);

    const lbl = (s: string) => `<td style="border:1px solid #999;padding:5px;font-size:11px;font-weight:bold;background:#f0f0f0;white-space:nowrap">${escHtml(L(s))}</td>`;
    const val = (v: any, colspan = 1) => `<td colspan="${colspan}" style="border:1px solid #999;padding:5px;font-size:11px;white-space:pre-wrap">${escHtml(v || '')}</td>`;

    const headerGrid = `<table style="border-collapse:collapse;width:100%;margin-bottom:8px">
      <tr>${lbl('School')}${val(scheme?.schoolName)}${lbl('Learning Area')}${val(subject?.name)}${lbl('Grade')}${val(grade)}</tr>
      <tr>${lbl('Term')}${val(term)}${lbl('Week')}${val(weekNumber)}${lbl('Date')}${val(String(notes.lessonDate).slice(0, 10))}</tr>
      <tr>${lbl('Strand')}${val(notes.strand, 5)}</tr>
      <tr>${lbl('Sub-Strand')}${val(notes.subStrand, 5)}</tr>
      <tr>${lbl('Specific Learning Outcomes Covered')}${val(notes.slosCovered, 5)}</tr>
    </table>`;

    const bodyHtml = variant === 'learner'
      ? `<table style="border-collapse:collapse;width:100%">
          <tr>${lbl('Topic')}${val(notes.subTopic ? `${notes.topic} — ${notes.subTopic}` : notes.topic, 5)}</tr>
          <tr>${lbl('Content')}${val(notes.learnerContent || notes.teacherContent, 5)}</tr>
        </table>`
      : `<table style="border-collapse:collapse;width:100%">
          <tr>${lbl('Introduction')}${val(notes.introduction, 5)}</tr>
          <tr>${lbl('Content')}${val(notes.teacherContent, 5)}</tr>
          <tr>${lbl('Key Vocabulary')}${val(notes.keyVocabulary, 5)}</tr>
          <tr>${lbl('Summary')}${val(notes.summary, 5)}</tr>
          <tr>${lbl('Review Questions (with answers)')}${val(notes.reviewQuestions, 5)}</tr>
          <tr>${lbl('References')}${val(notes.referenceMaterials, 5)}</tr>
        </table>`;

    return documentShell({
      title: `Lesson Notes${variant === 'learner' ? ' (Learner Copy)' : ''} — ${notes.topic}`,
      font,
      schoolName: scheme?.schoolName || '',
      headerHtml: '',
      bodyHtml: headerGrid + bodyHtml,
      footerHtml: variant === 'learner'
        ? `<div>${L('Name')}: ________________________</div><div>${L('Class')}: ________________________</div>`
        : `<div>${L('Teacher')}: ${escHtml(scheme?.teacherName || '_______________________')} &nbsp; ${L('Sign')}: ________ &nbsp; ${L('Date')}: ________</div>` +
          `<div>${L('Checked by D.H.O.I.')}: ________ &nbsp; ${L('Sign')}: ________ &nbsp; ${L('Date')}: ________</div>`,
      wordSafe,
    });
  }

  // ── RECORD OF WORK COVERED ────────────────────────────────
  async recordWork(tenantId: string, teacherId: string, dto: RecordWorkCoveredDto) {
    const row = await this.rowRepo.save(
      this.rowRepo.create({
        tenantId,
        teacherId,
        streamId: dto.streamId,
        subjectId: dto.subjectId,
        lessonNoteId: dto.lessonNoteId,
        academicYear: dto.academicYear,
        term: dto.term,
        weekNumber: dto.weekNumber,
        lessonDate: new Date(dto.lessonDate),
        topic: dto.topic,
        subTopic: dto.subTopic,
        strand: dto.strand,
        subStrand: dto.subStrand,
        activities: dto.activities,
        coverageStatus: dto.coverageStatus,
        reasonIfNotCovered: dto.reasonIfNotCovered,
        learnerCount: dto.learnerCount,
        remarks: dto.remarks,
      }),
    );

    if (dto.lessonNoteId) {
      await this.notesRepo.update(dto.lessonNoteId, {
        coverageStatus: dto.coverageStatus,
        deliveryRemarks: dto.remarks,
      });
    }

    return { rowId: row.id, message: 'Record of work saved.' };
  }

  // ── GENERATE LEARNER PROGRESS RECORDS (AI) ────────────────
  async generateProgressRecords(tenantId: string, teacherId: string, dto: GenerateLearnerProgressDto) {
    const subject = await this.subjRepo.findOne({ where: { id: dto.subjectId } });

    const learners = await this.learnerRepo.find({
      where: { tenantId, streamId: dto.streamId, isActive: true },
      order: { lastName: 'ASC', firstName: 'ASC' },
    });

    if (learners.length === 0) throw new NotFoundException('No active learners in stream');

    const targetLearners = dto.learnerIds?.length
      ? learners.filter((l) => dto.learnerIds!.includes(l.id))
      : learners;

    const { records } = await this.aiGenerator.generateLearnerProgressRecords({
      learners: targetLearners.map((l) => ({ id: l.id, firstName: l.firstName, lastName: l.lastName, gender: l.gender })),
      subjectName: subject?.name || 'Subject',
      gradeLevel: targetLearners[0]?.gradeLevel || 'grade_4',
      strand: dto.strand,
      subStrand: dto.subStrand,
      sloAssessed: `${dto.strand} — ${dto.subStrand}`,
      assessmentContext: `${dto.strand}: ${dto.subStrand} — ${dto.term.replace('_', ' ')} ${dto.academicYear}`,
    });

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

        const data: any = {
          tenantId, teacherId,
          learnerId: r.learnerId,
          streamId: dto.streamId,
          subjectId: dto.subjectId,
          academicYear: dto.academicYear,
          term: dto.term,
          strand: dto.strand,
          subStrand: dto.subStrand,
          performanceLevel: r.performanceLevel,
          evidence: r.evidence,
          teacherComment: r.teacherComment,
          supportNeeded: r.supportNeeded,
          aiGenerated: true,
          assessmentDate: new Date(),
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

    if (filters.streamId) qb.andWhere('r.stream_id = :sid', { sid: filters.streamId });
    if (filters.subjectId) qb.andWhere('r.subject_id = :subjId', { subjId: filters.subjectId });
    if (filters.academicYear) qb.andWhere('r.academic_year = :yr', { yr: filters.academicYear });
    if (filters.term) qb.andWhere('r.term = :term', { term: filters.term });

    return qb.getMany();
  }

  async getLearnerProgress(tenantId: string, teacherId: string, filters: any) {
    return this.lpeRepo.find({
      where: { tenantId, teacherId, ...filters },
      order: { assessmentDate: 'DESC' as any },
    });
  }

  // ── GET TEACHER FOLDER ─────────────────────────────────────
  async getTeacherFolder(tenantId: string, teacherId: string, filters?: {
    academicYear?: string; term?: string; subjectName?: string;
  }) {
    const qb = this.dataSource.getRepository(TeacherDocument)
      .createQueryBuilder('d')
      .where('d.tenant_id = :tenantId AND d.teacher_id = :teacherId', { tenantId, teacherId })
      .orderBy('d.created_at', 'DESC');

    if (filters?.academicYear) qb.andWhere('d.academic_year = :yr', { yr: filters.academicYear });
    if (filters?.term) qb.andWhere('d.term = :term', { term: filters.term });
    if (filters?.subjectName) qb.andWhere('d.subject_name ILIKE :subj', { subj: `%${filters.subjectName}%` });

    const docs = await qb.getMany();

    return {
      schemesOfWork: docs.filter((d) => d.documentType === 'scheme_of_work'),
      lessonPlans: docs.filter((d) => d.documentType === 'lesson_plan'),
      lessonNotes: docs.filter((d) => d.documentType === 'lesson_notes'),
      recordsOfWork: docs.filter((d) => d.documentType === 'record_of_work'),
      learnerProgressRecords: docs.filter((d) => d.documentType === 'learner_progress_record'),
      total: docs.length,
    };
  }
}
