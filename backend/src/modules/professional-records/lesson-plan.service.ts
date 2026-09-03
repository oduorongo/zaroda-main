import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { LessonPlan, SchemeOfWork, SchemeWeek, SubjectCatalogue, PrAudit } from './entities';
import { AiGeneratorService } from './ai-generator.service';
import { WalletService } from './wallet.service';
import { GenerateLessonPlanDto, ReviewRecordDto } from './dto';
import { documentShell, escHtml } from './document-render.util';

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
          aiModel: 'claude-haiku-4-5-20251001',
          generationTokens: planData.tokens,
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
  // Mirrors the official KICD lesson-plan grid template (School/Learning Area/Grade,
  // Date/Time/Roll, Week/Lesson No./Duration, Strand/Sub-Strand, SLOs, KIQ, Resources,
  // Organisation of Learning, Extended Activities, Core Competencies/Values/PCIs,
  // Links, Assessment, Reflection) rather than a generic field list.
  async renderHtml(tenantId: string, planId: string, fontOverride?: string): Promise<string> {
    const plan = await this.findOne(tenantId, planId);
    const scheme = await this.schemeRepo.findOne({ where: { id: plan.schemeId, tenantId } });
    const subject = await this.subjRepo.findOne({ where: { id: plan.subjectId } });
    const font = fontOverride || scheme?.defaultFont || 'Times New Roman';
    const grade = String(plan.gradeLevel || '').replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    const lbl = (s: string) => `<td style="border:1px solid #999;padding:5px;font-size:11px;font-weight:bold;background:#f0f0f0;white-space:nowrap">${escHtml(s)}</td>`;
    const val = (v: any, colspan = 1) => `<td colspan="${colspan}" style="border:1px solid #999;padding:5px;font-size:11px;white-space:pre-wrap">${escHtml(v || '')}</td>`;
    const sectionLabel = (s: string) => `<tr>${lbl(s)}${val('', 5)}</tr>`;

    const headerGrid = `<table style="border-collapse:collapse;width:100%;margin-bottom:8px">
      <tr>${lbl('School')}${val(scheme?.schoolName)}${lbl('Learning Area')}${val(subject?.name)}${lbl('Grade')}${val(grade)}</tr>
      <tr>${lbl('Date')}${val(plan.lessonDate ? String(plan.lessonDate).slice(0, 10) : '')}${lbl('Time')}${val('')}${lbl('Roll')}${val('')}</tr>
      <tr>${lbl('Week')}${val(plan.lessonNumber)}${lbl('Lesson No.')}${val('')}${lbl('Duration')}${val(`${plan.durationMinutes} min`)}</tr>
      <tr>${lbl('Strand')}${val(plan.strand, 5)}</tr>
      <tr>${lbl('Sub-Strand')}${val(plan.subStrand, 5)}</tr>
    </table>`;

    const detailsGrid = `<table style="border-collapse:collapse;width:100%;margin-bottom:8px">
      <tr>${lbl('Specific Learning Outcomes')}${val(plan.specificLearningOutcomes, 5)}</tr>
      <tr>${lbl('Key Inquiry Question(s)')}${val(plan.keyInquiryQuestions, 5)}</tr>
      <tr>${lbl('Learning Resources')}${val([plan.learningMaterials, plan.referenceBooks].filter(Boolean).join('; '), 5)}</tr>
    </table>`;

    const stage = (name: string, teacher: string, learner: string) =>
      `<tr>${lbl(name)}<td style="border:1px solid #999;padding:5px;font-size:11px;white-space:pre-wrap">${escHtml(teacher)}</td><td style="border:1px solid #999;padding:5px;font-size:11px;white-space:pre-wrap">${escHtml(learner)}</td></tr>`;

    const organisationGrid = `<div style="font-size:12px;font-weight:bold;margin:6px 0 2px">Organisation of Learning</div>
    <table style="border-collapse:collapse;width:100%;margin-bottom:8px">
      <tr>${lbl('Stage')}<th style="border:1px solid #999;padding:5px;font-size:11px;background:#f0f0f0">Teacher Activities</th><th style="border:1px solid #999;padding:5px;font-size:11px;background:#f0f0f0">Learner Activities</th></tr>
      ${stage('Introduction', '', plan.introduction)}
      ${stage('Lesson Development', '', plan.lessonDevelopment)}
      ${stage('Conclusion', '', plan.conclusion)}
    </table>`;

    const tailGrid = `<table style="border-collapse:collapse;width:100%">
      <tr>${lbl('Extended Activities')}${val([plan.extendedActivities, plan.supportActivities ? `Support: ${plan.supportActivities}` : ''].filter(Boolean).join(' — '), 5)}</tr>
      <tr>${lbl('Core Competencies')}<td style="border:1px solid #999;padding:5px;font-size:11px">${escHtml((plan.coreCompetencies || []).join(', '))}</td>${lbl('Values')}<td style="border:1px solid #999;padding:5px;font-size:11px">${escHtml((plan.values || []).join(', '))}</td>${lbl('PCIs')}<td style="border:1px solid #999;padding:5px;font-size:11px">${escHtml(plan.pertinentIssues)}</td></tr>
      <tr>${lbl('Links to Other Learning Areas')}${val(plan.linkToOtherSubjects, 5)}</tr>
      <tr>${lbl('Assessment')}${val(plan.assessment, 5)}</tr>
      <tr>${lbl('Reflection / Self-Evaluation')}${val('', 5)}</tr>
    </table>`;

    const bodyHtml = headerGrid + detailsGrid + organisationGrid + tailGrid;

    return documentShell({
      title: `Lesson Plan — ${plan.strand} / ${plan.subStrand}`,
      font,
      schoolName: scheme?.schoolName || '',
      headerHtml: '',
      bodyHtml,
      footerHtml: `<div>Teacher: ${escHtml(scheme?.teacherName || '_______________________')} &nbsp; Sign: ________ &nbsp; Date: ________</div>` +
        `<div>Checked by D.H.O.I.: ________ &nbsp; Sign: ________ &nbsp; Date: ________</div>`,
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
