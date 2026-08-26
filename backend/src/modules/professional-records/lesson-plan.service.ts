import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { LessonPlan, SchemeOfWork, SchemeWeek, SubjectCatalogue, PrAudit } from './entities';
import { AiGeneratorService } from './ai-generator.service';
import { GenerateLessonPlanDto, ReviewRecordDto } from './dto';

@Injectable()
export class LessonPlanService {
  constructor(
    @InjectRepository(LessonPlan) private planRepo: Repository<LessonPlan>,
    @InjectRepository(SchemeOfWork) private schemeRepo: Repository<SchemeOfWork>,
    @InjectRepository(SchemeWeek) private weekRepo: Repository<SchemeWeek>,
    @InjectRepository(SubjectCatalogue) private subjRepo: Repository<SubjectCatalogue>,
    @InjectRepository(PrAudit) private auditRepo: Repository<PrAudit>,
    private aiGenerator: AiGeneratorService,
    private dataSource: DataSource,
  ) {}

  // Public accessor used by the controller's HOI "pending approvals" dashboard.
  findByStatus(tenantId: string, status: string) {
    return this.planRepo.find({ where: { tenantId, status }, order: { submittedAt: 'ASC' } });
  }

  async generate(tenantId: string, teacherId: string, dto: GenerateLessonPlanDto) {
    const scheme = await this.schemeRepo.findOne({
      where: { id: dto.schemeId, tenantId, teacherId },
    });
    if (!scheme) throw new NotFoundException('Scheme not found');

    const week = await this.weekRepo.findOne({ where: { id: dto.schemeWeekId } });
    if (!week) throw new NotFoundException('Scheme week not found');

    const subject = await this.subjRepo.findOne({ where: { id: scheme.subjectId } });

    const planData = await this.aiGenerator.generateLessonPlan({
      subjectName: subject?.name || 'Unknown Subject',
      gradeLevel: scheme.gradeLevel,
      strand: week.strand,
      subStrand: week.subStrand,
      slos: week.specificLearningOutcomes,
      keyInquiryQuestions: week.keyInquiryQuestions || '',
      learningExperiences: week.learningExperiences,
      learningResources: week.learningResources || '',
      durationMinutes: dto.durationMinutes || 40,
      lessonDate: dto.lessonDate,
    });

    const plan = await this.planRepo.save(
      this.planRepo.create({
        tenantId,
        teacherId,
        schemeId: dto.schemeId,
        schemeWeekId: dto.schemeWeekId,
        streamId: scheme.streamId,
        subjectId: scheme.subjectId,
        lessonDate: dto.lessonDate ? new Date(dto.lessonDate) : null,
        lessonNumber: week.weekNumber,
        durationMinutes: dto.durationMinutes || 40,
        gradeLevel: scheme.gradeLevel,

        strand: planData.strand,
        subStrand: planData.subStrand,
        specificLearningOutcomes: planData.specificLearningOutcomes,
        keyInquiryQuestions: planData.keyInquiryQuestions,
        coreCompetencies: planData.coreCompetencies,
        values: planData.values,
        pertinentIssues: planData.pertinentIssues,
        linkToOtherSubjects: planData.linkToOtherSubjects,
        introduction: planData.introduction,
        lessonDevelopment: planData.lessonDevelopment,
        conclusion: planData.conclusion,
        assessment: planData.assessment,
        extendedActivities: planData.extendedActivities,
        supportActivities: planData.supportActivities,
        learningMaterials: planData.learningMaterials,
        referenceBooks: planData.referenceBooks,
        aiGenerated: true,
        aiModel: 'claude-sonnet-4-20250514',
        status: 'draft',
      }),
    );

    return { planId: plan.id, status: 'draft', message: 'Lesson plan generated. Review and submit.' };
  }

  async findOne(tenantId: string, planId: string) {
    const plan = await this.planRepo.findOne({ where: { id: planId, tenantId } });
    if (!plan) throw new NotFoundException('Lesson plan not found');
    return plan;
  }

  async findAll(tenantId: string, filters: { teacherId?: string; schemeId?: string; status?: string }) {
    const qb = this.planRepo.createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .orderBy('p.created_at', 'DESC');
    if (filters.teacherId) qb.andWhere('p.teacher_id = :tid', { tid: filters.teacherId });
    if (filters.schemeId) qb.andWhere('p.scheme_id = :sid', { sid: filters.schemeId });
    if (filters.status) qb.andWhere('p.status = :status', { status: filters.status });
    return qb.getMany();
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
      status: dto.action,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reviewComment: dto.comment,
    });
    await this.auditRepo.save({
      tenantId, recordType: 'lesson_plan', recordId: planId,
      action: dto.action, actorId: reviewerId, actorRole: 'hoi', comment: dto.comment,
    });
    return { message: `Lesson plan ${dto.action}.` };
  }
}
