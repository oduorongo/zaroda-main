import {
  Controller, Get, Post, Patch, Body, Param,
  Query, UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SchemeService } from './scheme.service';
import { LessonPlanService } from './lesson-plan.service';
import { RecordsService } from './records.service';
import { SubjectCatalogue } from './entities';
import {
  GenerateSchemeDto, GenerateLessonPlanDto, GenerateLessonNotesDto,
  RecordWorkCoveredDto, GenerateLearnerProgressDto, ReviewRecordDto,
} from './dto';

type AuthUser = { id: string; tenantId: string; schoolId?: string; role: string };

@Controller('professional-records')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProfessionalRecordsController {
  constructor(
    private schemeService: SchemeService,
    private lessonPlanService: LessonPlanService,
    private recordsService: RecordsService,
    @InjectRepository(SubjectCatalogue) private subjectRepo: Repository<SubjectCatalogue>,
  ) {}

  // Subject picker for the "Generate" forms — every teacher-facing role may read this list.
  @Get('subjects')
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher', 'hoi', 'dhois', 'school_admin', 'tenant_owner')
  listSubjects(@CurrentUser() u: AuthUser) {
    return this.subjectRepo.find({ where: { tenantId: u.tenantId, isActive: true }, order: { name: 'ASC' } });
  }

  // ── SCHEMES OF WORK ───────────────────────────────────────
  @Post('schemes/generate')
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher', 'hoi')
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

  @Post('schemes/:id/submit')
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher')
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
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher')
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

  @Post('lesson-plans/:id/submit')
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher')
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
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher')
  generateLessonNotes(@CurrentUser() u: AuthUser, @Body() dto: GenerateLessonNotesDto) {
    return this.recordsService.generateNotes(u.tenantId, u.id, dto);
  }

  @Get('lesson-notes')
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher', 'hoi', 'dhois')
  listLessonNotes(@CurrentUser() u: AuthUser, @Query() filters: any) {
    const teacherFilter = ['hoi', 'dhois'].includes(u.role) ? filters : { ...filters, teacherId: u.id };
    return this.recordsService.findNotes(u.tenantId, teacherFilter);
  }

  // ── RECORDS OF WORK ───────────────────────────────────────
  @Post('records-of-work')
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher')
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
  @Roles('class_teacher', 'subject_teacher', 'overall_class_teacher')
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
