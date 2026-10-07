// CAT (Continuous Assessment Test) — formative, question-level marks.
// Created and edited only by the subject teacher assigned to the stream + subject
// (teacher_stream_subjects); academic admins get read-only access to every CAT.
// Kept apart from exams/assessment_results: never feeds the mark list or report cards.

import {
  Module, Controller, Get, Post, Patch, Put, Delete, Param, Query, Body, Request, UseGuards,
  BadRequestException, ForbiddenException, NotFoundException, ConflictException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SchoolOnly } from '../../common/decorators/access.decorator';

const ADMIN_ROLES = ['hoi', 'dhois', 'school_admin', 'tenant_owner', 'super_admin', 'dos'];
const TEACHER_ROLES = ['class_teacher', 'subject_teacher', 'overall_class_teacher'];
const TERMS = ['term_1', 'term_2', 'term_3'];

@Controller('cats')
@SchoolOnly()
@UseGuards(JwtAuthGuard)
export class CatController {
  constructor(private readonly ds: DataSource) {}

  private allow(user: any) {
    if (!ADMIN_ROLES.includes(user.role) && !TEACHER_ROLES.includes(user.role)) {
      throw new ForbiddenException('You do not have access to CATs.');
    }
  }

  private assignments(user: any) {
    return this.ds.query(
      `SELECT tss.stream_id::text AS "streamId", s.name AS "streamName", s.grade_level AS "gradeLevel", tss.subject
         FROM teacher_stream_subjects tss JOIN streams s ON s.id::text = tss.stream_id::text
        WHERE tss.tenant_id::text = $1 AND tss.teacher_id::text = $2 AND s.tenant_id::text = $1
        ORDER BY s.name, tss.subject`,
      [user.tenantId, user.id],
    );
  }

  private async load(user: any, id: string) {
    this.allow(user);
    const rows = await this.ds.query(
      `SELECT c.id, c.teacher_id::text AS "teacherId", c.stream_id::text AS "streamId", c.subject, c.title,
              c.term, c.academic_year AS "academicYear", c.cat_date AS "catDate",
              s.name AS "streamName", s.grade_level AS "gradeLevel",
              TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS "teacherName"
         FROM cats c
         LEFT JOIN streams s ON s.id::text = c.stream_id::text
         LEFT JOIN users u ON u.id::text = c.teacher_id::text
        WHERE c.id::text = $1 AND c.tenant_id::text = $2 AND c.deleted_at IS NULL AND c.subject IS NOT NULL`,
      [id, user.tenantId],
    ).catch(() => []);
    const cat = rows[0];
    if (!cat) throw new NotFoundException('CAT not found.');
    const canEdit = cat.teacherId === String(user.id);
    if (!canEdit && !ADMIN_ROLES.includes(user.role)) throw new ForbiddenException('This CAT belongs to another teacher.');
    return { ...cat, canEdit };
  }

  private async loadForEdit(user: any, id: string) {
    const cat = await this.load(user, id);
    if (!cat.canEdit) throw new ForbiddenException('Read-only: only the subject teacher who created this CAT can change it.');
    return cat;
  }

  private async scoreCount(catId: string) {
    const r = await this.ds.query(`SELECT COUNT(*)::int AS n FROM cat_scores WHERE cat_id::text = $1`, [catId]);
    return r[0]?.n || 0;
  }

  @Get()
  async list(@Request() req: any, @Query() q: any) {
    const u = req.user;
    this.allow(u);
    const admin = ADMIN_ROLES.includes(u.role);
    const cats = await this.ds.query(
      `SELECT c.id, c.teacher_id::text AS "teacherId", c.stream_id::text AS "streamId", c.subject, c.title,
              c.term, c.cat_date AS "catDate", s.name AS "streamName",
              TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS "teacherName",
              (SELECT COUNT(*)::int FROM cat_questions q WHERE q.cat_id = c.id) AS "questionCount",
              (SELECT COALESCE(SUM(max_marks),0)::float FROM cat_questions q WHERE q.cat_id = c.id) AS "maxTotal",
              (SELECT COUNT(DISTINCT learner_id)::int FROM cat_scores sc WHERE sc.cat_id = c.id) AS "learnersMarked"
         FROM cats c
         LEFT JOIN streams s ON s.id::text = c.stream_id::text
         LEFT JOIN users u ON u.id::text = c.teacher_id::text
        WHERE c.tenant_id::text = $1 AND c.deleted_at IS NULL AND c.subject IS NOT NULL
          AND ($2::boolean OR c.teacher_id::text = $3)
          AND ($4::text IS NULL OR c.stream_id::text = $4)
          AND ($5::text IS NULL OR c.term = $5)
        ORDER BY c.cat_date DESC NULLS LAST, c.created_at DESC`,
      [u.tenantId, admin, u.id, q.streamId || null, q.term || null],
    );
    return { cats, assignments: await this.assignments(u), readOnlyAll: admin };
  }

  @Post()
  async create(@Request() req: any, @Body() dto: any) {
    const u = req.user;
    this.allow(u);
    const title = String(dto.title || '').trim();
    if (!title || !dto.streamId || !dto.subject) throw new BadRequestException('Title, stream and subject are required.');
    if (!TERMS.includes(dto.term)) throw new BadRequestException('Pick a term.');
    const mine = await this.assignments(u);
    const a = mine.find((r: any) => r.streamId === String(dto.streamId) && r.subject.toLowerCase() === String(dto.subject).toLowerCase());
    if (!a) throw new ForbiddenException('You can only create a CAT for a subject and stream you are assigned to teach.');
    const rows = await this.ds.query(
      `INSERT INTO cats (tenant_id, teacher_id, stream_id, subject, title, term, academic_year, cat_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [u.tenantId, u.id, a.streamId, a.subject, title, dto.term, dto.academicYear || null, dto.catDate || null],
    );
    return { id: rows[0].id };
  }

  @Get(':id')
  async get(@Request() req: any, @Param('id') id: string) {
    const cat = await this.load(req.user, id);
    const [questions, learners, scores] = await Promise.all([
      this.ds.query(
        `SELECT id, number, max_marks::float AS "maxMarks", strand, sub_strand AS "subStrand", substrand_id AS "substrandId"
           FROM cat_questions WHERE cat_id::text = $1 ORDER BY number`, [id]),
      this.ds.query(
        `SELECT id, first_name AS "firstName", last_name AS "lastName", admission_number AS "admissionNumber"
           FROM learners WHERE tenant_id::text = $1 AND stream_id::text = $2 AND is_active = true
          ORDER BY first_name, last_name`, [req.user.tenantId, cat.streamId]),
      this.ds.query(
        `SELECT question_id AS "questionId", learner_id AS "learnerId", score::float AS score
           FROM cat_scores WHERE cat_id::text = $1`, [id]),
    ]);
    return { cat, questions, learners, scores, locked: scores.length > 0 };
  }

  @Patch(':id')
  async update(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    await this.loadForEdit(req.user, id);
    const title = dto.title != null ? String(dto.title).trim() : null;
    if (title === '') throw new BadRequestException('Title cannot be empty.');
    await this.ds.query(
      `UPDATE cats SET title = COALESCE($2, title), cat_date = COALESCE($3::date, cat_date), updated_at = NOW()
        WHERE id::text = $1`,
      [id, title, dto.catDate || null],
    );
    return { message: 'CAT updated' };
  }

  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    await this.loadForEdit(req.user, id);
    await this.ds.query(`UPDATE cats SET deleted_at = NOW() WHERE id::text = $1`, [id]);
    return { message: 'CAT deleted' };
  }

  // Replaces the question set. Once marks exist only strand labels may change —
  // adding, removing or re-scoring questions would silently change learners' totals.
  @Put(':id/questions')
  async saveQuestions(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    const u = req.user;
    await this.loadForEdit(u, id);
    const qs: any[] = Array.isArray(dto.questions) ? dto.questions : [];
    if (!qs.length) throw new BadRequestException('Add at least one question.');
    const numbers = new Set<number>();
    for (const q of qs) {
      const n = Number(q.number), m = Number(q.maxMarks);
      if (!Number.isInteger(n) || n < 1) throw new BadRequestException('Question numbers must be whole numbers from 1.');
      if (numbers.has(n)) throw new BadRequestException(`Question ${n} appears twice.`);
      if (!(m > 0) || m > 1000) throw new BadRequestException(`Question ${n} needs max marks above 0.`);
      numbers.add(n);
    }
    const label = (v: any) => (v != null && String(v).trim() ? String(v).trim().slice(0, 200) : null);

    if (await this.scoreCount(id)) {
      const existing = await this.ds.query(
        `SELECT id, number, max_marks::float AS "maxMarks" FROM cat_questions WHERE cat_id::text = $1`, [id]);
      const same = existing.length === qs.length && qs.every(q =>
        existing.some((e: any) => e.number === Number(q.number) && e.maxMarks === Number(q.maxMarks)));
      if (!same) throw new ConflictException('Marks are already entered for this CAT, so questions and max marks are locked. Clear the marks first to change them.');
      for (const q of qs) {
        await this.ds.query(
          `UPDATE cat_questions SET strand = $3, sub_strand = $4, substrand_id = $5 WHERE cat_id::text = $1 AND number = $2`,
          [id, Number(q.number), label(q.strand), label(q.subStrand), q.substrandId || null]);
      }
      return { message: 'Strands updated' };
    }

    await this.ds.transaction(async (m) => {
      await m.query(`DELETE FROM cat_questions WHERE cat_id::text = $1`, [id]);
      for (const q of qs) {
        await m.query(
          `INSERT INTO cat_questions (tenant_id, cat_id, number, max_marks, strand, sub_strand, substrand_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [u.tenantId, id, Number(q.number), Number(q.maxMarks), label(q.strand), label(q.subStrand), q.substrandId || null]);
      }
      await m.query(`UPDATE cats SET updated_at = NOW() WHERE id::text = $1`, [id]);
    });
    return { message: 'Questions saved' };
  }

  // Grid save: [{ learnerId, questionId, score }]; a blank score clears that cell.
  @Put(':id/scores')
  async saveScores(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    const u = req.user;
    const cat = await this.loadForEdit(u, id);
    const cells: any[] = Array.isArray(dto.scores) ? dto.scores : [];
    const questions = await this.ds.query(
      `SELECT id::text AS id, number, max_marks::float AS "maxMarks" FROM cat_questions WHERE cat_id::text = $1`, [id]);
    const qById = new Map<string, any>(questions.map((q: any) => [q.id, q]));
    const learnerRows = await this.ds.query(
      `SELECT id::text AS id FROM learners WHERE tenant_id::text = $1 AND stream_id::text = $2`, [u.tenantId, cat.streamId]);
    const learnerIds = new Set(learnerRows.map((r: any) => r.id));

    await this.ds.transaction(async (m) => {
      for (const c of cells) {
        const q = qById.get(String(c.questionId));
        if (!q) throw new BadRequestException('Unknown question in this CAT.');
        if (!learnerIds.has(String(c.learnerId))) throw new BadRequestException('Learner is not in this stream.');
        if (c.score === null || c.score === undefined || c.score === '') {
          await m.query(`DELETE FROM cat_scores WHERE question_id::text = $1 AND learner_id::text = $2`, [q.id, c.learnerId]);
          continue;
        }
        const s = Number(c.score);
        if (isNaN(s) || s < 0 || s > q.maxMarks) throw new BadRequestException(`Q${q.number}: score must be between 0 and ${q.maxMarks}.`);
        await m.query(
          `INSERT INTO cat_scores (tenant_id, cat_id, question_id, learner_id, score) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (question_id, learner_id) DO UPDATE SET score = EXCLUDED.score, updated_at = NOW()`,
          [u.tenantId, id, q.id, c.learnerId, s]);
      }
    });
    return { message: 'Marks saved' };
  }

  @Delete(':id/scores')
  async clearScores(@Request() req: any, @Param('id') id: string) {
    await this.loadForEdit(req.user, id);
    await this.ds.query(`DELETE FROM cat_scores WHERE cat_id::text = $1`, [id]);
    return { message: 'Marks cleared — questions are unlocked' };
  }
}

@Module({ controllers: [CatController] })
export class CatModule {}
