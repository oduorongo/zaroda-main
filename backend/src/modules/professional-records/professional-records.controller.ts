import {
  Controller, Get, Post, Patch, Body, Param,
  Query, UseGuards, Res,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SchemeService } from './scheme.service';
import { LessonPlanService } from './lesson-plan.service';
import { RecordsService } from './records.service';
import { WalletService, ITEM_PRICE_KES } from './wallet.service';
import {
  GenerateSchemeDto, GenerateLessonPlanDto, GenerateLessonNotesDto,
  RecordWorkCoveredDto, GenerateLearnerProgressDto, ReviewRecordDto,
} from './dto';

type AuthUser = { id: string; tenantId: string; schoolId?: string; role: string };

const ALL_GENERATOR_ROLES = ['class_teacher', 'subject_teacher', 'overall_class_teacher', 'hoi', 'dhois', 'school_admin', 'tenant_owner'];

@Controller('professional-records')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProfessionalRecordsController {
  constructor(
    private schemeService: SchemeService,
    private lessonPlanService: LessonPlanService,
    private recordsService: RecordsService,
    private walletService: WalletService,
  ) {}

  // Subject picker for the "Generate" forms — scoped to what this user actually
  // teaches (or, for HOI/admin, every subject taught anywhere in the school).
  @Get('subjects')
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher', 'hoi', 'dhois', 'school_admin', 'tenant_owner')
  listSubjects(@CurrentUser() u: AuthUser) {
    return this.schemeService.listSubjectsForUser(u.tenantId, u.schoolId, u.id, u.role);
  }

  // ── WALLET (M-Pesa top-up, then per-item billing) ─────────
  // A teacher tops up their wallet in any amount, then each generated item
  // debits a fixed price: Scheme of Work KES 30, Lesson Plan KES 2, Lesson
  // Notes KES 2. No exemptions — everyone who generates pays.
  @Get('wallet')
  @Roles(...ALL_GENERATOR_ROLES)
  getWallet(@CurrentUser() u: AuthUser) {
    return this.walletService.getBalance(u.tenantId, u.id);
  }

  @Get('wallet/transactions')
  @Roles(...ALL_GENERATOR_ROLES)
  getWalletTransactions(@CurrentUser() u: AuthUser) {
    return this.walletService.getTransactions(u.tenantId, u.id);
  }

  @Get('wallet/prices')
  @Roles(...ALL_GENERATOR_ROLES)
  getPrices() {
    return ITEM_PRICE_KES;
  }

  @Post('wallet/topup')
  @Roles(...ALL_GENERATOR_ROLES)
  topUpWallet(
    @CurrentUser() u: AuthUser, @Body('phone') phone: string, @Body('amount') amount: number,
  ) {
    return this.walletService.topUp(u.tenantId, u.id, phone, Number(amount));
  }

  @Get('wallet/topup/status/:id')
  @Roles(...ALL_GENERATOR_ROLES)
  getTopUpStatus(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.walletService.getTopUpStatus(u.tenantId, u.id, id);
  }

  // ── SCHEMES OF WORK ───────────────────────────────────────
  @Post('schemes/generate')
  @Roles(...ALL_GENERATOR_ROLES)
  generateScheme(@CurrentUser() u: AuthUser, @Body() dto: GenerateSchemeDto) {
    return this.schemeService.generate(u.tenantId, u.schoolId, u.id, u.role, dto);
  }

  @Get('schemes')
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher', 'hoi', 'dhois', 'school_admin', 'tenant_owner')
  listSchemes(@CurrentUser() u: AuthUser, @Query() filters: any) {
    const teacherFilter = ['hoi', 'dhois', 'school_admin', 'tenant_owner'].includes(u.role)
      ? filters
      : { ...filters, teacherId: u.id };
    return this.schemeService.findAll(u.tenantId, teacherFilter);
  }

  @Get('schemes/:id')
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher', 'hoi', 'dhois', 'school_admin', 'tenant_owner')
  getScheme(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.schemeService.findOne(u.tenantId, id);
  }

  // Printable document — same HTML for browser print-to-PDF and the Word (.doc)
  // download, distinguished only by the response headers.
  @Get('schemes/:id/html')
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher', 'hoi', 'dhois', 'school_admin', 'tenant_owner')
  async getSchemeHtml(
    @CurrentUser() u: AuthUser, @Param('id') id: string,
    @Query('font') font: string, @Query('download') download: string,
    @Res() res: any,
  ) {
    const html = await this.schemeService.renderHtml(u.tenantId, id, font);
    if (download === 'doc') {
      res.set({
        'Content-Type': 'application/msword; charset=utf-8',
        'Content-Disposition': `attachment; filename="scheme-of-work-${id}.doc"`,
      });
    } else {
      res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    res.send(html);
  }

  @Post('schemes/:id/submit')
  @Roles(...ALL_GENERATOR_ROLES)
  submitScheme(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body('submittedTo') submittedTo?: string,
  ) {
    return this.schemeService.submit(u.tenantId, id, u.id, submittedTo);
  }

  @Patch('schemes/:id/review')
  @Roles('hoi', 'dhois', 'school_admin', 'tenant_owner')
  reviewScheme(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ReviewRecordDto) {
    return this.schemeService.review(u.tenantId, id, u.id, dto);
  }

  // ── LESSON PLANS ──────────────────────────────────────────
  @Post('lesson-plans/generate')
  @Roles(...ALL_GENERATOR_ROLES)
  generateLessonPlan(@CurrentUser() u: AuthUser, @Body() dto: GenerateLessonPlanDto) {
    return this.lessonPlanService.generate(u.tenantId, u.id, dto);
  }

  @Get('lesson-plans')
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher', 'hoi', 'dhois', 'school_admin', 'tenant_owner')
  listLessonPlans(@CurrentUser() u: AuthUser, @Query() filters: any) {
    const teacherFilter = ['hoi', 'dhois', 'school_admin', 'tenant_owner'].includes(u.role)
      ? filters
      : { ...filters, teacherId: u.id };
    return this.lessonPlanService.findAll(u.tenantId, teacherFilter);
  }

  @Get('lesson-plans/:id')
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher', 'hoi', 'dhois', 'school_admin', 'tenant_owner')
  getLessonPlan(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.lessonPlanService.findOne(u.tenantId, id);
  }

  @Get('lesson-plans/:id/html')
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher', 'hoi', 'dhois', 'school_admin', 'tenant_owner')
  async getLessonPlanHtml(
    @CurrentUser() u: AuthUser, @Param('id') id: string,
    @Query('font') font: string, @Query('download') download: string,
    @Res() res: any,
  ) {
    const html = await this.lessonPlanService.renderHtml(u.tenantId, id, font);
    if (download === 'doc') {
      res.set({
        'Content-Type': 'application/msword; charset=utf-8',
        'Content-Disposition': `attachment; filename="lesson-plan-${id}.doc"`,
      });
    } else {
      res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    res.send(html);
  }

  @Post('lesson-plans/:id/submit')
  @Roles(...ALL_GENERATOR_ROLES)
  submitLessonPlan(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.lessonPlanService.submit(u.tenantId, id, u.id);
  }

  @Patch('lesson-plans/:id/review')
  @Roles('hoi', 'dhois', 'school_admin', 'tenant_owner')
  reviewLessonPlan(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ReviewRecordDto) {
    return this.lessonPlanService.review(u.tenantId, id, u.id, dto);
  }

  // ── LESSON NOTES ──────────────────────────────────────────
  @Post('lesson-notes/generate')
  @Roles(...ALL_GENERATOR_ROLES)
  generateLessonNotes(@CurrentUser() u: AuthUser, @Body() dto: GenerateLessonNotesDto) {
    return this.recordsService.generateNotes(u.tenantId, u.id, dto);
  }

  @Get('lesson-notes')
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher', 'hoi', 'dhois')
  listLessonNotes(@CurrentUser() u: AuthUser, @Query() filters: any) {
    const teacherFilter = ['hoi', 'dhois'].includes(u.role) ? filters : { ...filters, teacherId: u.id };
    return this.recordsService.findNotes(u.tenantId, teacherFilter);
  }

  @Get('lesson-notes/:id/html')
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher', 'hoi', 'dhois', 'school_admin', 'tenant_owner')
  async getLessonNotesHtml(
    @CurrentUser() u: AuthUser, @Param('id') id: string,
    @Query('font') font: string, @Query('download') download: string, @Query('variant') variant: string,
    @Res() res: any,
  ) {
    const v = variant === 'learner' ? 'learner' : 'teacher';
    const html = await this.recordsService.renderNotesHtml(u.tenantId, id, font, v);
    if (download === 'doc') {
      res.set({
        'Content-Type': 'application/msword; charset=utf-8',
        'Content-Disposition': `attachment; filename="lesson-notes-${v}-${id}.doc"`,
      });
    } else {
      res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    res.send(html);
  }

  // ── RECORDS OF WORK ───────────────────────────────────────
  @Post('records-of-work')
  @Roles(...ALL_GENERATOR_ROLES)
  recordWork(@CurrentUser() u: AuthUser, @Body() dto: RecordWorkCoveredDto) {
    return this.recordsService.recordWork(u.tenantId, u.id, dto);
  }

  @Get('records-of-work')
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher', 'hoi', 'dhois')
  getRecordsOfWork(@CurrentUser() u: AuthUser, @Query() filters: any) {
    return this.recordsService.getRecordsOfWork(u.tenantId, u.id, filters);
  }

  // ── LEARNER PROGRESS RECORDS ──────────────────────────────
  @Post('learner-progress/generate')
  @Roles(...ALL_GENERATOR_ROLES)
  generateLearnerProgress(@CurrentUser() u: AuthUser, @Body() dto: GenerateLearnerProgressDto) {
    return this.recordsService.generateProgressRecords(u.tenantId, u.id, dto);
  }

  @Get('learner-progress')
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher', 'hoi', 'dhois')
  getLearnerProgress(@CurrentUser() u: AuthUser, @Query() filters: any) {
    return this.recordsService.getLearnerProgress(u.tenantId, u.id, filters);
  }

  // ── TEACHER FOLDER ────────────────────────────────────────
  @Get('folder')
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher', 'hoi', 'dhois')
  getFolder(@CurrentUser() u: AuthUser, @Query() filters: any) {
    return this.recordsService.getTeacherFolder(u.tenantId, u.id, filters);
  }

  // ── PENDING APPROVALS (HOI dashboard) ────────────────────
  @Get('pending-approvals')
  @Roles('hoi', 'dhois', 'school_admin', 'tenant_owner')
  async getPendingApprovals(@CurrentUser() u: AuthUser) {
    const [schemes, plans, notes] = await Promise.all([
      this.schemeService.findByStatus(u.tenantId, 'submitted'),
      this.lessonPlanService.findByStatus(u.tenantId, 'submitted'),
      this.recordsService.notesRepo.find({
        where: { tenantId: u.tenantId, status: 'submitted' },
        order: { submittedAt: 'ASC' as any },
      }),
    ]);

    return {
      schemesOfWork: schemes,
      lessonPlans: plans,
      lessonNotes: notes,
      total: schemes.length + plans.length + notes.length,
    };
  }
}

// Tuma calls this server-to-server — it carries no JWT, so it lives on its own
// unguarded controller rather than inside the guarded one above.
@Controller('professional-records')
export class ProfessionalRecordsPaymentsController {
  constructor(private walletService: WalletService) {}

  @Post('mpesa/callback')
  async mpesaCallback(@Body() body: any) {
    await this.walletService.handleCallback(body);
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }
}
