import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  LessonNote, LessonPlan, RecordOfWork, LearnerProgressEntry,
  SubjectCatalogue, PrAudit, TeacherDocument,
} from './entities';
import { Learner } from '../academic/academic.module';
import { AiGeneratorService } from './ai-generator.service';
import { WalletService } from './wallet.service';
import { GenerateLessonNotesDto, RecordWorkCoveredDto, GenerateLearnerProgressDto } from './dto';

@Injectable()
export class RecordsService {
  constructor(
    @InjectRepository(LessonNote) public notesRepo: Repository<LessonNote>,
    @InjectRepository(LessonPlan) private planRepo: Repository<LessonPlan>,
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
  async generateNotes(tenantId: string, teacherId: string, dto: GenerateLessonNotesDto) {
    const plan = await this.planRepo.findOne({
      where: { id: dto.lessonPlanId, tenantId, teacherId },
    });
    if (!plan) throw new NotFoundException('Lesson plan not found');

    await this.walletService.assertAffordable(tenantId, teacherId, 'lesson_notes');

    const subject = await this.subjRepo.findOne({ where: { id: plan.subjectId } });

    const notesData = await this.aiGenerator.generateLessonNotes({
      subjectName: subject?.name || 'Subject',
      gradeLevel: plan.gradeLevel,
      strand: plan.strand,
      subStrand: plan.subStrand,
      slos: plan.specificLearningOutcomes,
      lessonDevelopment: plan.lessonDevelopment,
      assessment: plan.assessment,
      additionalContext: dto.additionalContext,
    });

    const notes = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(
        this.notesRepo.create({
          tenantId,
          teacherId,
          lessonPlanId: dto.lessonPlanId,
          streamId: plan.streamId,
          subjectId: plan.subjectId,
          lessonDate: plan.lessonDate || new Date(),
          gradeLevel: plan.gradeLevel,
          topic: notesData.topic,
          subTopic: notesData.subTopic,
          teacherContent: notesData.teacherContent,
          boardWork: notesData.boardWork,
          examples: notesData.examples,
          activities: notesData.activities,
          questions: notesData.questions,
          assessmentEvidence: notesData.assessmentEvidence,
          expectedResponses: notesData.expectedResponses,
          coverageStatus: 'pending',
          aiGenerated: true,
          aiModel: 'claude-sonnet-4-20250514',
          status: 'draft',
        }),
      );
      await this.walletService.debit(tenantId, teacherId, 'lesson_notes', saved.id, manager);
      return saved;
    });

    return { notesId: notes.id, status: 'draft', message: 'Lesson notes generated.' };
  }

  async findNotes(tenantId: string, filters: { teacherId?: string; lessonPlanId?: string }) {
    return this.notesRepo.find({
      where: { tenantId, ...filters },
      order: { createdAt: 'DESC' as any },
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
