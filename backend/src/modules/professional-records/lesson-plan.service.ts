import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { LessonPlan, SchemeOfWork, SchemeWeek, SubjectCatalogue, PrAudit } from './entities';
import { AiGeneratorService } from './ai-generator.service';
import { WalletService } from './wallet.service';
import { GenerateLessonPlanDto, ReviewRecordDto } from './dto';
import { documentShell, field, escHtml } from './document-render.util';

@Injectable()
export class LessonPlanService {
  constructor(
    @InjectRepository(LessonPlan) private planRepo: Repository<LessonPlan>,
    @InjectRepository(SchemeOfWork) private schemeRepo: Repository<SchemeOfWork>,
    @InjectRepository(SchemeWeek) private weekRepo: Repository<SchemeWeek>,
    @InjectRepository(SubjectCatalogue) private subjRepo: Repository<SubjectCatalogue>,
    @InjectRepository(PrAudit) private auditRepo: Repository<PrAudit>,
    private aiGenerator: AiGeneratorService,
    private walletService: WalletService,
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

    await this.walletService.assertAffordable(tenantId, teacherId, 'lesson_plan');

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

    const plan = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(
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
          aiModel: 'claude-sonnet-5',
          status: 'draft',
        }),
      );
      await this.walletService.debit(tenantId, teacherId, 'lesson_plan', saved.id, manager);
      return saved;
    });

    return { planId: plan.id, status: 'draft', message: 'Lesson plan generated. Review and submit.' };
  }

  async findOne(tenantId: string, planId: string) {
    const plan = await this.planRepo.findOne({ where: { id: planId, tenantId } });
    if (!plan) throw new NotFoundException('Lesson plan not found');
    return plan;
  }

  // ── RENDER PRINTABLE DOCUMENT (PDF/Word, watermarked) ─────
  async renderHtml(tenantId: string, planId: string, fontOverride?: string): Promise<string> {
    const plan = await this.findOne(tenantId, planId);
    const scheme = await this.schemeRepo.findOne({ where: { id: plan.schemeId, tenantId } });
    const font = fontOverride || scheme?.defaultFont || 'Times New Roman';
    const grade = String(plan.gradeLevel || '').replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    const headerHtml =
      `<div><b>School:</b> ${escHtml(scheme?.schoolName || '')} &nbsp; <b>Teacher:</b> ${escHtml(scheme?.teacherName || '')} ${scheme?.tscNumber ? `&nbsp; <b>TSC No:</b> ${escHtml(scheme.tscNumber)}` : ''}</div>` +
      `<div><b>Grade:</b> ${escHtml(grade)} &nbsp; <b>Duration:</b> ${escHtml(plan.durationMinutes)} min ${plan.lessonDate ? `&nbsp; <b>Date:</b> ${escHtml(String(plan.lessonDate).slice(0, 10))}` : ''}</div>`;

    const bodyHtml = [
      field('Strand', plan.strand),
      field('Sub-Strand', plan.subStrand),
      field('Specific Learning Outcomes', plan.specificLearningOutcomes),
      field('Key Inquiry Questions', plan.keyInquiryQuestions),
      field('Core Competencies', plan.coreCompetencies),
      field('Values', plan.values),
      field('Pertinent Issues', plan.pertinentIssues),
      field('Link to Other Subjects', plan.linkToOtherSubjects),
      field('Introduction', plan.introduction),
      field('Lesson Development', plan.lessonDevelopment),
      field('Conclusion', plan.conclusion),
      field('Assessment', plan.assessment),
      field('Extended Activities', plan.extendedActivities),
      field('Support Activities', plan.supportActivities),
      field('Learning Materials', plan.learningMaterials),
      field('Reference Books', plan.referenceBooks),
    ].join('');

    return documentShell({
      title: `Lesson Plan — ${plan.strand} / ${plan.subStrand}`,
      font,
      schoolName: scheme?.schoolName || '',
      headerHtml,
      bodyHtml,
      footerHtml: `<div>Prepared by: ${escHtml(scheme?.teacherName || '_______________________')}</div><div>Checked by: _______________________</div>`,
    });
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
