import { Module, Injectable, Controller, Get, Post, Body, Param, Query, Request, UseGuards, BadRequestException } from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

// ── Entities ───────────────────────────────────────────────
@Entity('assessment_templates')
export class AssessmentTemplate {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', nullable: true }) tenantId: string;
  @Column({ name: 'grade_level' }) gradeLevel: string;
  @Column({ name: 'learning_area' }) learningArea: string;
}

@Entity('assessment_scores')
export class AssessmentScore {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'learner_id' }) learnerId: string;
  @Column({ name: 'stream_id', nullable: true }) streamId: string;
  @Column({ name: 'grade_level', nullable: true }) gradeLevel: string;
  @Column({ name: 'learning_area', nullable: true }) learningArea: string;
  @Column({ name: 'substrand_id' }) substrandId: string;
  @Column() term: string;
  @Column({ nullable: true }) level: string;
  @Column({ type: 'float', nullable: true }) cat1: number;
  @Column({ type: 'float', nullable: true }) cat2: number;
  @Column({ name: 'end_term', type: 'float', nullable: true }) endTerm: number;
  @Column({ name: 'max_score', type: 'float', nullable: true }) maxScore: number;
  @Column({ name: 'band_score', type: 'float', nullable: true }) bandScore: number;
  @Column({ name: 'recorded_by', nullable: true }) recordedBy: string;
}

// ── Service ────────────────────────────────────────────────
@Injectable()
export class AssessmentService {
  constructor(
    @InjectRepository(AssessmentTemplate) private tplRepo: Repository<AssessmentTemplate>,
    private dataSource: DataSource,
  ) {}

  private isHoi(role: string) {
    return ['hoi', 'dhois', 'school_admin', 'tenant_owner', 'super_admin'].includes(role);
  }
  private isClassTeacher(role: string) {
    return ['class_teacher', 'overall_class_teacher'].includes(role);
  }
  private isTeacher(role: string) {
    return ['class_teacher', 'subject_teacher', 'overall_class_teacher', 'hoi', 'dhois'].includes(role);
  }

  // Each grade band uses a structurally different assessment instrument
  structureFor(gradeLevel: string): 'ecde' | 'numeric' | 'level' {
    if (['playgroup', 'pp1', 'pp2'].includes(gradeLevel)) return 'ecde';     // score-band key
    return 'numeric'; // grades 1-12: numeric CAT1/CAT2/End-Term -> level auto-computed
  }

  // Grades 7-12 report on the 8-level KNEC scale; grades 1-6 and ECDE use 4 levels.
  scaleFor(gradeLevel: string): 4 | 8 {
    return ['grade_7', 'grade_8', 'grade_9', 'grade_10', 'grade_11', 'grade_12'].includes(gradeLevel) ? 8 : 4;
  }
  private isSenior(gradeLevel: string): boolean {
    return ['grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'].includes(gradeLevel || '');
  }
  // 8-point scale (grades 7-12 only): % -> points
  private percentToPoints(pct: number): number {
    if (pct >= 90) return 8;
    if (pct >= 75) return 7;
    if (pct >= 58) return 6;
    if (pct >= 41) return 5;
    if (pct >= 31) return 4;
    if (pct >= 21) return 3;
    if (pct >= 11) return 2;
    return 1;
  }

  // 4-level cutoffs: EE 75-100 · ME 41-74 · AE 21-40 · BE 1-20
  private levelFromPercent(pct: number): string {
    if (pct >= 75) return 'EE';
    if (pct >= 41) return 'ME';
    if (pct >= 21) return 'AE';
    return 'BE';
  }
  // Official KNEC 8-level scale (grades 7-12):
  // EE1 90-100 · EE2 75-89 · ME1 58-74 · ME2 41-57 · AE1 31-40 · AE2 21-30 · BE1 11-20 · BE2 1-10
  private level8FromPercent(pct: number): string {
    if (pct >= 90) return 'EE1';
    if (pct >= 75) return 'EE2';
    if (pct >= 58) return 'ME1';
    if (pct >= 41) return 'ME2';
    if (pct >= 31) return 'AE1';
    if (pct >= 21) return 'AE2';
    if (pct >= 11) return 'BE1';
    return 'BE2';
  }
  // Resolve to the correct scale for the grade
  private levelForGrade(pct: number, gradeLevel: string): string {
    return this.scaleFor(gradeLevel) === 8 ? this.level8FromPercent(pct) : this.levelFromPercent(pct);
  }
  // ECDE score-band key (out of 30): 0-9 BE, 10-19 AE, 20-29 ME, 30 EE
  private levelFromBand(score: number, max = 30): string {
    const pct = max ? (score / max) * 100 : 0;
    if (pct >= 100) return 'EE';
    if (pct >= 66.7) return 'ME';
    if (pct >= 33.3) return 'AE';
    return 'BE';
  }

  // List learning areas available for a grade (global templates + tenant overrides)
  async getLearningAreas(tenantId: string, gradeLevel: string) {
    return this.dataSource.query(
      `SELECT DISTINCT learning_area AS "learningArea"
       FROM assessment_templates
       WHERE grade_level = $1 AND (tenant_id IS NULL OR tenant_id::text = $2)
       ORDER BY learning_area`,
      [gradeLevel, tenantId],
    ).catch(() => []);
  }

  // Full book for a grade + learning area: strands -> sub-strands (+ resource link)
  async getBook(tenantId: string, gradeLevel: string, learningArea: string) {
    const tpl = await this.dataSource.query(
      `SELECT id FROM assessment_templates
       WHERE grade_level = $1 AND learning_area = $2
         AND (tenant_id::text = $3 OR tenant_id IS NULL)
       ORDER BY tenant_id NULLS LAST LIMIT 1`,
      [gradeLevel, learningArea, tenantId],
    ).catch(() => []);
    if (!tpl.length) return { templateId: null, structure: this.structureFor(gradeLevel), scale: this.scaleFor(gradeLevel), strands: [] };
    const templateId = tpl[0].id;
    const rows = await this.dataSource.query(
      `SELECT st.id AS "strandId", st.position AS "strandPos", st.name AS "strandName",
              ss.id AS "substrandId", ss.position AS "subPos", ss.name AS "subName", ss.youtube_url AS "youtubeUrl"
       FROM assessment_strands st
       JOIN assessment_substrands ss ON ss.strand_id = st.id
       WHERE st.template_id::text = $1
       ORDER BY st.position, ss.position`,
      [templateId],
    ).catch(() => []);
    const byStrand: Record<string, any> = {};
    for (const r of rows) {
      if (!byStrand[r.strandId]) byStrand[r.strandId] = { id: r.strandId, name: r.strandName, position: r.strandPos, substrands: [] };
      byStrand[r.strandId].substrands.push({ id: r.substrandId, name: r.subName, position: r.subPos, youtubeUrl: r.youtubeUrl });
    }
    return { templateId, structure: this.structureFor(gradeLevel), scale: this.scaleFor(gradeLevel), strands: Object.values(byStrand) };
  }

  // A learner's saved formative levels for a learning area + term
  async getScores(tenantId: string, learnerId: string, term: string, learningArea?: string) {
    const rows = await this.dataSource.query(
      `SELECT substrand_id AS "substrandId", level
       FROM assessment_scores
       WHERE tenant_id::text = $1 AND learner_id::text = $2 AND term = $3`,
      [tenantId, learnerId, term],
    ).catch(() => []);
    const map: Record<string, any> = {};
    for (const r of rows) map[r.substrandId] = { level: r.level };
    let comment = '';
    if (learningArea) {
      const cr = await this.dataSource.query(
        `SELECT comment FROM assessment_comments
         WHERE tenant_id::text = $1 AND learner_id::text = $2 AND learning_area = $3 AND term = $4 LIMIT 1`,
        [tenantId, learnerId, learningArea, term],
      ).catch(() => []);
      comment = cr[0]?.comment || '';
    }
    return { scores: map, comment };
  }

  // Save scores. Role rules:
  //  - subject teacher: may save only for learning areas they teach
  //  - class teacher / admin: may save any area for their class/school
  async saveScores(user: any, dto: any) {
    const { learnerId, streamId, gradeLevel, learningArea, term, scores } = dto;
    if (!learnerId || !learningArea || !term) {
      throw new BadRequestException('Missing learner, learning area, or term.');
    }
    // Restriction: admin/HOI (any area) OR a teacher who teaches THIS learning area.
    // Class teachers who don't teach the area cannot enter its assessment.
    if (!this.isHoi(user.role)) {
      if (!this.isTeacher(user.role)) {
        throw new BadRequestException('You do not have permission to edit the assessment book.');
      }
      const urows = await this.dataSource.query(
        `SELECT subjects FROM users WHERE id::text = $1 LIMIT 1`, [user.id],
      ).catch(() => []);
      const mySubjects = (urows[0]?.subjects || '').split(',').map((s: string) => s.trim()).filter(Boolean);
      const teaches = mySubjects.some(s => learningArea.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(learningArea.toLowerCase()));
      if (!teaches) {
        throw new BadRequestException('You can only assess learning areas you teach.');
      }
    }
    // FORMATIVE rubric: a performance level (EE/ME/AE/BE) per sub-strand.
    // No numeric scores here — CATs/End-Term are summative and entered separately.
    let saved = 0;
    for (const [substrandId, raw] of Object.entries(scores || {})) {
      const v: any = raw;
      const level = (typeof v === 'object' && v !== null) ? v.level : v;
      if (!level) continue;
      await this.dataSource.query(
        `INSERT INTO assessment_scores
           (tenant_id, learner_id, stream_id, grade_level, learning_area, substrand_id, term, level, recorded_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
         ON CONFLICT (learner_id, substrand_id, term)
         DO UPDATE SET level = EXCLUDED.level, recorded_by = EXCLUDED.recorded_by, updated_at = NOW()`,
        [user.tenantId, learnerId, streamId || null, gradeLevel || null, learningArea, substrandId, term, level, user.id],
      ).then(() => { saved++; }).catch(() => null);
    }
    // Teacher comment for this learning area + term (optional)
    if (dto.comment !== undefined) {
      await this.dataSource.query(
        `INSERT INTO assessment_comments (tenant_id, learner_id, learning_area, term, comment, recorded_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (learner_id, learning_area, term)
         DO UPDATE SET comment = EXCLUDED.comment, recorded_by = EXCLUDED.recorded_by, updated_at = NOW()`,
        [user.tenantId, learnerId, learningArea, term, dto.comment || null, user.id],
      ).catch(() => null);
    }
    return { message: 'Assessment saved', saved };
  }

  // Set/replace the YouTube resource link on a sub-strand (teacher/admin only)
  async setResource(user: any, substrandId: string, youtubeUrl: string) {
    // Only the platform owner curates the learning resource (YouTube) links. All other
    // users can watch the videos but cannot edit them.
    if (user.role !== 'super_admin') {
      throw new BadRequestException('Only the platform owner can edit learning resource links.');
    }
    await this.dataSource.query(
      `UPDATE assessment_substrands SET youtube_url = $1 WHERE id::text = $2`,
      [youtubeUrl || null, substrandId],
    ).catch(() => null);
    return { message: 'Resource saved' };
  }

  // ── SUMMATIVE (CATs & End-Term, admin-created exam events) ──
  // List the exam events the admin has created for this tenant.
  async listExams(tenantId: string) {
    return this.dataSource.query(
      `SELECT id, name, exam_type AS "examType", term, academic_year AS "academicYear"
       FROM exams WHERE tenant_id::text = $1 ORDER BY created_at DESC`,
      [tenantId],
    ).catch(() => []);
  }

  async getReportCard(tenantId: string, learnerId: string, term: string) {
    // Learner + class context
    const lr = await this.dataSource.query(
      `SELECT l.id, l.first_name AS "firstName", l.last_name AS "lastName",
              l.admission_number AS "admissionNumber", l.grade_level AS "gradeLevel",
              l.stream_id AS "streamId", s.name AS "streamName"
       FROM learners l LEFT JOIN streams s ON s.id::text = l.stream_id::text
       WHERE l.id::text = $1 AND l.tenant_id::text = $2 LIMIT 1`,
      [learnerId, tenantId],
    ).catch(() => []);
    const learner = lr[0] || null;
    const gradeLevel = learner?.gradeLevel || '';
    const usePoints = this.isSenior(gradeLevel);

    // The report reads from Enter Marks (assessment_results). End-Term is the
    // determining result per learning area; CATs are shown alongside for reference.
    const allRows = await this.dataSource.query(
      `SELECT subject AS "learningArea", exam_type AS "examType", percent, level, raw_score AS "score"
       FROM assessment_results
       WHERE tenant_id::text = $1 AND learner_id::text = $2 AND term = $3`,
      [tenantId, learnerId, this.markTerm(term)],
    ).catch(() => []);

    // Distinct CAT exam types present (cat_1, cat_2, …) for column labels
    const catTypes = Array.from(new Set(
      allRows.filter((r: any) => /^cat/i.test(r.examType || '')).map((r: any) => r.examType),
    )).sort();
    const catLabels = catTypes.map((t: any) => t.replace('_', ' ').toUpperCase());

    // Group by learning area
    const byArea: Record<string, any> = {};
    for (const r of allRows) {
      (byArea[r.learningArea] ||= { learningArea: r.learningArea, cats: {} });
      if (/^end_term$/i.test(r.examType || '') || !r.examType) {
        byArea[r.learningArea].score = r.score;
        byArea[r.learningArea].percent = r.percent;
        byArea[r.learningArea].level = r.level;
        if (usePoints && r.percent != null) byArea[r.learningArea].points = this.percentToPoints(Number(r.percent));
      } else if (/^cat/i.test(r.examType)) {
        byArea[r.learningArea].cats[r.examType] = r.score;
      }
    }
    let areas = Object.values(byArea).map((a: any) => ({
      learningArea: a.learningArea, score: a.score ?? null, percent: a.percent ?? null,
      level: a.level ?? null, points: a.points ?? null, comment: '',
      cats: catTypes.map((t: any) => ({ label: t.replace('_', ' ').toUpperCase(), score: a.cats[t] ?? null })),
    })).sort((x: any, y: any) => (x.learningArea || '').localeCompare(y.learningArea || ''));
    const source = 'enter_marks';
    const hasEndTerm = areas.some((a: any) => a.level != null);

    // Teacher comments per learning area for this term
    const comments = await this.dataSource.query(
      `SELECT learning_area AS "learningArea", comment
       FROM assessment_comments
       WHERE tenant_id::text = $1 AND learner_id::text = $2 AND term = $3`,
      [tenantId, learnerId, term],
    ).catch(() => []);
    const commentMap: Record<string, string> = {};
    for (const c of comments) commentMap[c.learningArea] = c.comment;
    areas.forEach(a => { a.comment = commentMap[a.learningArea] || ''; });

    // Per-learner aggregates across all learning areas:
    //  - averagePercent: mean % across areas
    //  - averagePoints (senior only): mean of the per-area points
    const pcts = areas.map((a: any) => a.percent).filter((p: any) => p != null).map(Number);
    const ptsArr = areas.map((a: any) => a.points).filter((p: any) => p != null).map(Number);
    const averagePercent = pcts.length ? Math.round(pcts.reduce((x: number, y: number) => x + y, 0) / pcts.length) : null;
    const averagePoints = (usePoints && ptsArr.length)
      ? Math.round((ptsArr.reduce((x: number, y: number) => x + y, 0) / ptsArr.length) * 10) / 10
      : null;
    const totalPoints = usePoints && ptsArr.length ? ptsArr.reduce((x: number, y: number) => x + y, 0) : null;
    // Overall level for the mean (senior: from mean points; else from mean %)
    const overallLevel = averagePercent != null
      ? (usePoints ? this.level8FromPercent(averagePercent) : this.levelFromPercent(averagePercent))
      : null;

    return {
      learner, term, source, areas, catLabels, gradeLevel, usePoints,
      averagePercent, averagePoints, totalPoints, overallLevel,
      hasEndTerm,
      note: hasEndTerm ? null : 'No End-Term marks have been entered for this term yet (use Enter Marks).',
    };
  }

  private markTerm(term: string): string | null {
    return ({ 'Term One': 'term_1', 'Term Two': 'term_2', 'Term Three': 'term_3' } as Record<string, string>)[term] || term;
  }
}

// ── Controller ─────────────────────────────────────────────
@Controller('assessment')
@UseGuards(JwtAuthGuard)
export class AssessmentController {
  constructor(private svc: AssessmentService) {}

  @Get('learning-areas')
  getLearningAreas(@Request() req: any, @Query() q: any) {
    return this.svc.getLearningAreas(req.user.tenantId, q.gradeLevel);
  }

  @Get('book')
  getBook(@Request() req: any, @Query() q: any) {
    return this.svc.getBook(req.user.tenantId, q.gradeLevel, q.learningArea);
  }

  @Get('scores')
  getScores(@Request() req: any, @Query() q: any) {
    return this.svc.getScores(req.user.tenantId, q.learnerId, q.term, q.learningArea);
  }

  @Post('scores')
  saveScores(@Request() req: any, @Body() dto: any) {
    return this.svc.saveScores(req.user, dto);
  }

  @Post('resource')
  setResource(@Request() req: any, @Body() dto: any) {
    return this.svc.setResource(req.user, dto.substrandId, dto.youtubeUrl);
  }

  @Get('report-card')
  getReportCard(@Request() req: any, @Query() q: any) {
    return this.svc.getReportCard(req.user.tenantId, q.learnerId, q.term);
  }

  @Get('exams')
  listExams(@Request() req: any) {
    return this.svc.listExams(req.user.tenantId);
  }
}

// ── Module ─────────────────────────────────────────────────
@Module({
  imports: [TypeOrmModule.forFeature([AssessmentTemplate, AssessmentScore])],
  controllers: [AssessmentController],
  providers: [AssessmentService],
})
export class AssessmentModule {}
