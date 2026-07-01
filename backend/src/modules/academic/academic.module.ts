// ── src/modules/academic/academic.module.ts ──────────────
import { Module }        from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import * as bcrypt from 'bcryptjs';
import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, Request, Delete, BadRequestException,
} from '@nestjs/common';
import { Injectable }     from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  getGradeBand, getPeriodStructure, getLearningAreaAllocations,
  getLessonDurationMinutes, getLessonsPerWeek, allowsDoubleLesson,
  calculateJuniorCbe, calculatePrimaryCbe,
  TIMETABLING_COMMITTEE_ROLES,
} from './kicd-timetable.constants';
import { AutoTimetabler } from './auto-timetabler';
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

// ── Entities ──────────────────────────────────────────────
@Entity('streams')
export class Stream {
  @PrimaryGeneratedColumn('uuid') id:              string;
  @Column()                       name:            string;
  @Column({ name: 'tenant_id' })  tenantId:        string;
  @Column({ name: 'school_id' })  schoolId:        string;
  @Column({ name: 'grade_level', nullable: true }) gradeLevel: string;
  @Column({ name: 'class_teacher_id', nullable: true }) classTeacherId: string;
  @Column({ name: 'class_teacher_name', nullable: true }) classTeacherName: string;
  @Column({ name: 'learners_count', default: 0 }) learnersCount: number;
  @Column({ name: 'academic_year', nullable: true }) academicYear: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Entity('learners')
export class Learner {
  @PrimaryGeneratedColumn('uuid') id:              string;
  @Column({ name: 'tenant_id' })  tenantId:        string;
  @Column({ name: 'first_name' }) firstName:       string;
  @Column({ name: 'last_name' })  lastName:        string;
  @Column({ name: 'admission_number' }) admissionNumber: string;
  @Column({ name: 'stream_id', nullable: true }) streamId: string;
  @Column({ name: 'grade_level', nullable: true }) gradeLevel: string;
  @Column({ nullable: true })     gender:          string;
  @Column({ name: 'date_of_birth', nullable: true }) dateOfBirth: Date;
  @Column({ name: 'guardian_name',  nullable: true }) guardianName:  string;
  @Column({ name: 'guardian_phone', nullable: true }) guardianPhone: string;
  @Column({ name: 'guardian_email', nullable: true }) guardianEmail: string;
  @Column({ name: 'middle_name',     nullable: true }) middleName:    string;
  @Column({ name: 'birth_cert_no',   nullable: true }) birthCertNo:   string;
  @Column({ name: 'upi_number',      nullable: true }) upiNumber:     string;
  @Column({ name: 'previous_school', nullable: true }) previousSchool:string;
  @Column({ nullable: true })     pathway:         string;
  @Column({ nullable: true })     track:           string;
  // Senior School (Grades 10–12): the 3–4 elective learning areas this learner chose,
  // on top of the 4 core areas. Stored as a JSON array of canonical area names.
  @Column({ name: 'electives', type: 'jsonb', nullable: true }) electives: string[];
  @Column({ name: 'guardian_relation', nullable: true }) guardianRelation: string;
  @Column({ name: 'guardian_id_no',  nullable: true }) guardianIdNo:  string;
  @Column({ nullable: true })     residence:       string;
  @Column({ name: 'admission_date',  nullable: true, type: 'date' }) admissionDate: string;
  @Column({ default: 'enrolled' }) status:         string;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Entity('attendance')
export class Attendance {
  @PrimaryGeneratedColumn('uuid') id:         string;
  @Column({ name: 'tenant_id' })  tenantId:   string;
  @Column({ name: 'learner_id' }) learnerId:  string;
  @Column({ name: 'stream_id' })  streamId:   string;
  @Column({ type: 'date' })       date:       string;
  @Column({ default: 'present' }) status:     string;  // present|absent|late|excused
  @Column({ name: 'recorded_by', nullable: true }) recordedBy: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Entity('assessment_results')
export class AssessmentResult {
  @PrimaryGeneratedColumn('uuid') id:           string;
  @Column({ name: 'tenant_id' })  tenantId:     string;
  @Column({ name: 'learner_id' }) learnerId:    string;
  @Column({ name: 'stream_id', nullable: true }) streamId: string;
  @Column({ name: 'grade_level', nullable: true }) gradeLevel: string;
  @Column()                       subject:      string;
  @Column({ name: 'raw_score', type: 'float', nullable: true })  rawScore: number;
  @Column({ name: 'max_score', type: 'float', nullable: true })  maxScore: number;
  @Column({ type: 'float', nullable: true })  percent: number;
  @Column({ name: 'exam_type', nullable: true }) examType: string;
  @Column({ name: 'exam_id', nullable: true })   examId:   string;
  @Column({ nullable: true })     strand:       string;
  @Column({ nullable: true })     level:        string;  // EE/ME/AE/BE
  @Column({ nullable: true })     term:         string;
  @Column({ name: 'academic_year', nullable: true }) academicYear: string;
  @Column({ name: 'teacher_comment', nullable: true }) teacherComment: string;
  @Column({ name: 'class_teacher_comment', nullable: true }) classTeacherComment: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

// ── Service ───────────────────────────────────────────────
@Injectable()
export class AcademicService {
  constructor(
    @InjectRepository(Stream)           private streamRepo:  Repository<Stream>,
    @InjectRepository(Learner)          private learnerRepo: Repository<Learner>,
    @InjectRepository(Attendance)       private attRepo:     Repository<Attendance>,
    @InjectRepository(AssessmentResult) private resultRepo:  Repository<AssessmentResult>,
    private dataSource: DataSource,
  ) {}

  // ── Streams ──────────────────────────────────────────────
  getStreams(tenantId: string) {
    // Live learner count per stream (the static column was never maintained).
    // Cast join keys to text so it works whether columns are uuid or varchar.
    return this.dataSource.query(
      `SELECT s.id, s.name, s.grade_level AS "gradeLevel",
              s.class_teacher_id AS "classTeacherId", s.class_teacher_name AS "classTeacherName",
              s.academic_year AS "academicYear",
              COALESCE(c.n, 0)::int AS "learnersCount",
              COALESCE(c.boys, 0)::int AS "boys",
              COALESCE(c.girls, 0)::int AS "girls"
       FROM streams s
       LEFT JOIN (
         SELECT stream_id::text AS sid, COUNT(*) AS n,
                COUNT(*) FILTER (WHERE LOWER(gender) IN ('male','m','boy'))   AS boys,
                COUNT(*) FILTER (WHERE LOWER(gender) IN ('female','f','girl')) AS girls
         FROM learners
         WHERE tenant_id::text = $1 AND is_active = true GROUP BY stream_id::text
       ) c ON c.sid = s.id::text
       WHERE s.tenant_id::text = $1
       ORDER BY s.name`,
      [tenantId],
    ).catch(() => this.streamRepo.find({ where: { tenantId }, order: { name: 'ASC' } }));
  }

  // ── Assessment results / mark list ───────────────────────
  async bulkSaveResults(user: any, dto: any) {
    const tenantId = user.tenantId;
    const records = dto.records || [];
    if (!records.length) return { message: 'No records', saved: 0 };

    // Restriction: only admin/HOI, or a teacher who teaches the learning area.
    // Exception: a class teacher (or overall class teacher) may manage the FULL
    // mark list for their OWN class — i.e. save any subject for that stream.
    const admin = this.isHoiRole(user.role);
    let mySubjects: string[] = [];
    let classTeacherStreams: string[] = [];
    // Per-stream assignments: { streamId -> Set(subject) }. A subject teacher may only
    // save marks for a learning area IN A STREAM they're actually assigned to teach it.
    const streamSubjectMap: Record<string, string[]> = {};
    if (!admin) {
      if (!this.isTeacherRole(user.role)) {
        throw new BadRequestException('You do not have permission to enter marks.');
      }
      const urows = await this.dataSource.query(
        `SELECT subjects FROM users WHERE id::text = $1 LIMIT 1`, [user.id],
      ).catch(() => []);
      mySubjects = (urows[0]?.subjects || '').split(',').map((s: string) => s.trim()).filter(Boolean);

      // Load the teacher's exact (stream, subject) assignments.
      const ssRows = await this.dataSource.query(
        `SELECT stream_id::text AS "streamId", subject FROM teacher_stream_subjects
          WHERE tenant_id::text = $1 AND teacher_id::text = $2`,
        [tenantId, user.id],
      ).catch(() => []);
      for (const r of ssRows) {
        (streamSubjectMap[r.streamId] = streamSubjectMap[r.streamId] || []).push(String(r.subject));
      }

      // Streams where this user is the class teacher (via streams.class_teacher_id) —
      // full mark-list rights for that stream, regardless of their exact role string.
      const crows = await this.dataSource.query(
        `SELECT id::text AS id FROM streams
         WHERE tenant_id::text = $1 AND class_teacher_id::text = $2`,
        [tenantId, user.id],
      ).catch(() => []);
      classTeacherStreams = crows.map((r: any) => r.id);
    }
    const subjMatch = (area: string, subj: string) =>
      area.toLowerCase().includes(subj.toLowerCase()) || subj.toLowerCase().includes(area.toLowerCase());
    const hasPerStreamData = Object.keys(streamSubjectMap).length > 0;
    const teaches = (area: string, streamId?: string | null) => {
      if (admin) return true;
      const sid = streamId ? String(streamId) : null;
      // Class teacher of THIS stream → may save any subject for it.
      if (sid && classTeacherStreams.includes(sid)) return true;
      // Preferred path: the teacher has explicit per-stream assignments. They may only
      // save a learning area in a stream they're assigned to teach it.
      if (hasPerStreamData) {
        if (sid && streamSubjectMap[sid]) {
          return streamSubjectMap[sid].some(s => subjMatch(area, s));
        }
        return false;  // has assignments, but not for this stream → blocked (no cross-stream)
      }
      // Fallback for teachers with no per-stream rows yet (legacy / flat assignment only):
      // allow if the learning area is in their general subject list. This keeps older
      // accounts working until they're re-assigned per stream.
      if (mySubjects.length) {
        return mySubjects.some(s => subjMatch(area, s));
      }
      // No assignments of any kind recorded → allow (school hasn't scoped this teacher;
      // better to let them save than to hard-block legitimate mark entry).
      return true;
    };

    let saved = 0;
    let lastError = '';
    for (const r of records) {
      // Resolve the record's stream FIRST (from the learner if not supplied), so the
      // per-stream permission check below always has the correct stream to test against.
      let streamId = r.streamId || null;
      let gradeLevel = r.gradeLevel || null;
      if (!streamId && r.learnerId) {
        const lr = await this.dataSource.query(
          `SELECT stream_id, grade_level FROM learners WHERE id::text = $1 LIMIT 1`,
          [r.learnerId],
        ).catch(() => []);
        if (lr.length) { streamId = lr[0].stream_id; gradeLevel = gradeLevel || lr[0].grade_level; }
      }
      // Always trust the STREAM's grade level over whatever the (possibly stale) client
      // sent — a stale page could still think a corrected class is the old grade and save
      // marks under the wrong subject name. Pulling grade from the stream prevents that.
      if (streamId) {
        const sg = await this.dataSource.query(
          `SELECT grade_level FROM streams WHERE id::text = $1 LIMIT 1`, [streamId],
        ).catch(() => []);
        if (sg.length && sg[0].grade_level) gradeLevel = sg[0].grade_level;
      }
      // Normalise the creative-arts naming to the grade band so marks can't be split
      // across "Creative Arts" (primary) vs "Creative Arts and Sports" (junior) by a
      // stale page. This keeps a class's marks under one consistent subject name.
      if (/^creative arts/i.test(String(r.subject || ''))) {
        const isJunior = ['grade_7','grade_8','grade_9'].includes(gradeLevel || '');
        r.subject = isJunior ? 'Creative Arts and Sports' : 'Creative Arts';
      }

      // Enforce per-record: a teacher may only save marks for a learning area in a
      // stream they're assigned to teach it (or their own class as class teacher).
      if (!teaches(r.subject || '', streamId)) {
        throw new BadRequestException(`You can only enter marks for learning areas you teach in your assigned classes (blocked: ${r.subject}).`);
      }

      // SAFETY: never let a blank/invalid record delete an existing real mark. If no valid
      // numeric score was sent, skip this record entirely (do NOT delete-then-insert-null).
      // This stops a stale or accidental empty save from wiping previously-entered marks.
      const rawNum = Number(r.rawScore);
      if (r.rawScore === null || r.rawScore === undefined || r.rawScore === '' || isNaN(rawNum)) {
        continue;
      }

      // Replace any existing result for the same learner/subject/term/exam, then insert
      await this.dataSource.query(
        `DELETE FROM assessment_results
         WHERE tenant_id::text = $1 AND learner_id::text = $2 AND subject = $3
           AND COALESCE(term,'') = COALESCE($4,'') AND COALESCE(exam_type,'') = COALESCE($5,'')`,
        [tenantId, r.learnerId, r.subject, r.term || null, r.examType || null],
      ).catch(() => null);

      await this.dataSource.query(
        `INSERT INTO assessment_results
           (tenant_id, learner_id, stream_id, grade_level, subject, raw_score, max_score, percent,
            level, exam_type, exam_id, term, academic_year, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())`,
        [
          tenantId, r.learnerId, streamId, gradeLevel, r.subject,
          r.rawScore ?? null, r.maxScore ?? null, r.percent ?? null,
          r.level || null, r.examType || null, r.examId || null,
          r.term || null, r.academicYear || null,
        ],
      ).then(() => { saved++; }).catch((e: any) => {
        lastError = e.message || String(e);
        console.error(`mark save failed for learner ${r.learnerId}/${r.subject}: ${lastError}`);
      });
    }
    if (saved === 0 && records.length > 0) {
      throw new BadRequestException(`Marks could not be saved: ${lastError || 'unknown error'}`);
    }
    return { message: 'Marks saved', saved };
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
  // Senior (8-level) code for a percentage. Lower grades use the 4-level codes.
  private percentToLevelCode(pct: number, senior: boolean): string {
    if (senior) {
      if (pct >= 90) return 'EE1'; if (pct >= 75) return 'EE2';
      if (pct >= 58) return 'ME1'; if (pct >= 41) return 'ME2';
      if (pct >= 31) return 'AE1'; if (pct >= 21) return 'AE2';
      if (pct >= 11) return 'BE1'; return 'BE2';
    }
    if (pct >= 76) return 'EE'; if (pct >= 51) return 'ME';
    if (pct >= 26) return 'AE'; return 'BE';
  }
  private isSenior(gradeLevel: string): boolean {
    return ['grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'].includes(gradeLevel || '');
  }

  /** Default parent password derived from the email's first part + the year, e.g.
   *  "john.doe@gmail.com" → "johndoe2026". Easy to communicate; the parent is forced to
   *  change it on first login (must_change_password=true). Padded to a safe minimum length. */
  private parentDefaultPassword(email: string): string {
    let prefix = String(email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!prefix) prefix = 'parent';
    if (prefix.length < 3) prefix = (prefix + 'parent').slice(0, 6);
    return `${prefix}2026`;
  }

  /** Returns true if `actor` (a non-HOI teacher) may manage a learner in `streamId` —
   *  i.e. they are the class teacher of that stream, or it's their primary stream. */
  private async actorOwnsStream(tenantId: string, actor: any, streamId: any): Promise<boolean> {
    if (this.isHoiRole(actor.role)) return true;
    const owned = await this.dataSource.query(
      `SELECT id::text AS id FROM streams WHERE tenant_id::text = $1 AND class_teacher_id::text = $2`,
      [tenantId, actor.id],
    ).catch(() => []);
    const ids = new Set<string>(owned.map((r: any) => String(r.id)));
    if (actor.streamId) ids.add(String(actor.streamId));
    return ids.has(String(streamId));
  }

  /**
   * Per-assessment term mark sheet. For one stream + term, returns every assessment
   * (exam) created in that term, and for each learner their performance level + points
   * in each learning area per assessment, the per-assessment total (e.g. /72 for 9
   * areas at 8 pts), and a term average across the assessments. This drives both the
   * per-assessment mark lists and the multi-column report card.
   */
  async getTermMarkSheet(tenantId: string, streamId: string, term: string) {
    const sgrade = await this.dataSource.query(
      `SELECT grade_level FROM streams WHERE id::text = $1 LIMIT 1`, [streamId],
    ).catch(() => []);
    const gradeLevel = sgrade[0]?.grade_level || '';
    const senior = this.isSenior(gradeLevel);
    const maxPer = senior ? 8 : 4;

    // Assessments (exams) that have marks in this stream+term, in creation order.
    const assessments = await this.dataSource.query(
      `SELECT DISTINCT e.id, e.name, e.exam_type AS "examType", e.created_at
         FROM exams e
        WHERE e.tenant_id::text = $1 AND ($2::text IS NULL OR e.term = $2)
        ORDER BY e.created_at ASC`,
      [tenantId, term || null],
    ).catch(() => []);

    // All results for this stream+term (optionally scoped to those assessments).
    const rows = await this.dataSource.query(
      `SELECT ar.learner_id AS "learnerId", ar.exam_id AS "examId",
              l.first_name AS "firstName", l.last_name AS "lastName",
              l.admission_number AS "admissionNumber",
              ar.subject, ar.percent
         FROM assessment_results ar
         LEFT JOIN learners l ON l.id::text = ar.learner_id::text
        WHERE ar.tenant_id::text = $1 AND ar.stream_id::text = $2
          AND ($3::text IS NULL OR ar.term = $3)
        ORDER BY l.first_name`,
      [tenantId, streamId, term || null],
    ).catch(() => []);

    // learner → { exam_id → { area → {percent, level, points} }, totals }
    const learners: Record<string, any> = {};
    for (const r of rows) {
      const L = (learners[r.learnerId] = learners[r.learnerId] || {
        learnerId: r.learnerId, firstName: r.firstName, lastName: r.lastName,
        admissionNumber: r.admissionNumber, byAssessment: {},
      });
      const examKey = r.examId || 'unlinked';
      const blk = (L.byAssessment[examKey] = L.byAssessment[examKey] || { areas: {}, points: 0, max: 0, count: 0, percentSum: 0 });
      if (r.percent != null) {
        const pct = Number(r.percent);
        const level = this.percentToLevelCode(pct, senior);
        const pts = senior ? this.percentToPoints(pct) : (pct >= 76 ? 4 : pct >= 51 ? 3 : pct >= 26 ? 2 : 1);
        blk.areas[r.subject] = { percent: pct, level, points: pts };
        blk.points += pts; blk.max += maxPer; blk.count++; blk.percentSum += pct;
      }
    }

    const list = Object.values(learners).map((L: any) => {
      let termPoints = 0, termMax = 0, termPctSum = 0, termCount = 0;
      for (const a of assessments) {
        const blk = L.byAssessment[a.id];
        if (blk) { termPoints += blk.points; termMax += blk.max; termPctSum += blk.percentSum; termCount += blk.count; }
      }
      return {
        ...L,
        termTotalPoints: senior ? termPoints : null,
        termAveragePercent: termCount ? Math.round(termPctSum / termCount) : 0,
      };
    }).sort((a: any, b: any) =>
      senior ? (b.termTotalPoints - a.termTotalPoints) : (b.termAveragePercent - a.termAveragePercent));

    return {
      gradeLevel, senior, maxPointsPerArea: maxPer,
      assessments,    // [{ id, name, examType }]
      learners: list, // each with byAssessment[examId] = { areas, points, max }
    };
  }

  // Class mark list: every learner × every subject for a stream/term, with totals & rank
  async getMarkList(tenantId: string, streamId: string, term?: string, examType?: string, examId?: string) {
    // Grade of the stream — decides whether points apply
    const sgrade = await this.dataSource.query(
      `SELECT grade_level FROM streams WHERE id::text = $1 LIMIT 1`, [streamId],
    ).catch(() => []);
    const gradeLevel = sgrade[0]?.grade_level || '';
    const usePoints = this.isSenior(gradeLevel);

    // Authoritative learning-area list for this class — the SAME set the PDF uses (seeded
    // rubric). Averages divide by the FULL number of areas, so a missing mark counts as a gap
    // and screen + PDF always agree. Fall back to whatever subjects have marks if the rubric
    // isn't seeded for this grade.
    const areaRows = await this.dataSource.query(
      `SELECT DISTINCT learning_area AS area FROM assessment_templates
        WHERE grade_level = $1 AND (tenant_id IS NULL OR tenant_id::text = $2)
        ORDER BY learning_area`,
      [gradeLevel, tenantId],
    ).catch(() => []);
    let areas: string[] = (areaRows as any[]).map(r => String(r.area)).filter(Boolean)
      .filter(a => !/indigenous|indeg/i.test(a));

    const rows = await this.dataSource.query(
      `SELECT ar.learner_id AS "learnerId",
              l.first_name AS "firstName", l.last_name AS "lastName",
              l.admission_number AS "admissionNumber",
              ar.subject, ar.raw_score AS "rawScore", ar.max_score AS "maxScore",
              ar.percent, ar.level, ar.exam_type AS "examType", ar.term
       FROM assessment_results ar
       LEFT JOIN learners l ON l.id::text = ar.learner_id::text
       WHERE ar.tenant_id::text = $1 AND ar.stream_id::text = $2
         AND ($3::text IS NULL OR ar.term = $3)
         AND ($4::text IS NULL OR ar.exam_type = $4)
         AND ($5::text IS NULL OR ar.exam_id::text = $5)
       ORDER BY l.first_name`,
      [tenantId, streamId, term || null, examType || null, examId || null],
    ).catch(() => []);

    // If the rubric has no areas seeded, derive the area set from the marks present.
    if (!areas.length) {
      areas = Array.from(new Set((rows as any[]).map(r => String(r.subject)).filter(Boolean)));
    }
    const areaCount = areas.length || 1;

    // Group by learner → subjects.
    const byLearner: Record<string, any> = {};
    for (const r of rows) {
      if (!byLearner[r.learnerId]) {
        byLearner[r.learnerId] = {
          learnerId: r.learnerId, firstName: r.firstName, lastName: r.lastName,
          admissionNumber: r.admissionNumber, subjects: {}, totalPercent: 0, totalPoints: 0, count: 0,
        };
      }
      const e = byLearner[r.learnerId];
      // Points scale stays grade-appropriate: 1-8 for senior (Grade 7-12), 1-4 for lower bands.
      const pts = (r.percent != null)
        ? (usePoints ? this.percentToPoints(Number(r.percent))
                     : (Number(r.percent) >= 76 ? 4 : Number(r.percent) >= 51 ? 3 : Number(r.percent) >= 26 ? 2 : 1))
        : null;
      e.subjects[r.subject] = { percent: r.percent, level: r.level, rawScore: r.rawScore, points: pts };
      if (r.percent != null) { e.totalPercent += Number(r.percent); e.count++; if (pts != null) e.totalPoints += pts; }
    }
    const list = Object.values(byLearner).map((e: any) => ({
      ...e,
      // Precise average (for ranking) divides by the FULL number of areas (missing marks = gap).
      // Displayed value is rounded, but ranking uses the precise value so learners whose true
      // averages differ (e.g. 74.4 vs 74.6) are never falsely tied by rounding.
      averagePercentExact: e.totalPercent / areaCount,
      averagePercent: Math.round(e.totalPercent / areaCount),
      // Total points: 1-8 scale for senior, 1-4 for lower — computed for all classes.
      totalPoints: e.totalPoints,
      averagePoints: Math.round((e.totalPoints / areaCount) * 10) / 10,
    })).sort((a: any, b: any) => {
      // Uniform ranking across ALL classes: precise total % first, then total points, then name.
      if (b.averagePercentExact !== a.averagePercentExact) return b.averagePercentExact - a.averagePercentExact;
      if ((b.totalPoints || 0) !== (a.totalPoints || 0)) return (b.totalPoints || 0) - (a.totalPoints || 0);
      return `${a.firstName||''} ${a.lastName||''}`.trim().localeCompare(`${b.firstName||''} ${b.lastName||''}`.trim());
    });
    list.forEach((e: any, i: number) => (e.rank = i + 1));
    return { gradeLevel, usePoints, areas, learners: list };
  }

  // ── Stream performance analytics ─────────────────────────────
  // Aggregates assessment_results for one stream into: per-learning-area averages,
  // CBC performance-level distribution, term-over-term trend, and learner ranking.
  // Permission: admin/HOI, or the class teacher who owns the stream.
  async getStreamAnalytics(user: any, streamId: string, term?: string) {
    const tenantId = user.tenantId;
    const owns = await this.actorOwnsStream(tenantId, user, streamId);
    if (!owns) throw new BadRequestException('You can only view analytics for your own class.');

    const sgrade = await this.dataSource.query(
      `SELECT grade_level FROM streams WHERE id::text = $1 LIMIT 1`, [streamId],
    ).catch(() => []);
    const gradeLevel = sgrade[0]?.grade_level || '';
    const senior = this.isSenior(gradeLevel);

    // Pull every mark for the stream (optionally filtered to a term).
    const rows = await this.dataSource.query(
      `SELECT ar.learner_id AS "learnerId", l.first_name AS "firstName", l.last_name AS "lastName",
              l.admission_number AS "adm", ar.subject, ar.percent, ar.term
         FROM assessment_results ar
         LEFT JOIN learners l ON l.id::text = ar.learner_id::text
        WHERE ar.tenant_id::text = $1 AND ar.stream_id::text = $2
          AND ($3::text IS NULL OR ar.term = $3)
          AND ar.percent IS NOT NULL`,
      [tenantId, streamId, term || null],
    ).catch(() => []);

    // Per-learning-area average %.
    const byArea: Record<string, { sum: number; n: number }> = {};
    // CBC level distribution across all marks.
    const levelDist: Record<string, number> = {};
    // Per-learner average (for ranking).
    const byLearner: Record<string, { name: string; adm: string; sum: number; n: number }> = {};
    // Term trend: average % per term.
    const byTerm: Record<string, { sum: number; n: number }> = {};

    for (const r of rows) {
      const pct = Number(r.percent);
      if (isNaN(pct)) continue;
      (byArea[r.subject] ||= { sum: 0, n: 0 }); byArea[r.subject].sum += pct; byArea[r.subject].n++;
      const code = this.percentToLevelCode(pct, senior);
      levelDist[code] = (levelDist[code] || 0) + 1;
      const lid = r.learnerId;
      (byLearner[lid] ||= { name: `${r.firstName || ''} ${r.lastName || ''}`.trim(), adm: r.adm || '', sum: 0, n: 0 });
      byLearner[lid].sum += pct; byLearner[lid].n++;
      const t = r.term || 'term_?';
      (byTerm[t] ||= { sum: 0, n: 0 }); byTerm[t].sum += pct; byTerm[t].n++;
    }

    const areas = Object.entries(byArea)
      .map(([subject, v]) => ({ subject, average: Math.round(v.sum / v.n), level: this.percentToLevelCode(Math.round(v.sum / v.n), senior), count: v.n }))
      .sort((a, b) => b.average - a.average);

    const distribution = Object.entries(levelDist)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);

    const ranking = Object.entries(byLearner)
      .map(([learnerId, v]) => ({ learnerId, name: v.name, adm: v.adm, average: Math.round(v.sum / v.n), level: this.percentToLevelCode(Math.round(v.sum / v.n), senior) }))
      .sort((a, b) => b.average - a.average)
      .map((e, i) => ({ ...e, rank: i + 1 }));

    const trend = Object.entries(byTerm)
      .map(([t, v]) => ({ term: t, average: Math.round(v.sum / v.n) }))
      .sort((a, b) => a.term.localeCompare(b.term));

    const classAverage = ranking.length
      ? Math.round(ranking.reduce((s, r) => s + r.average, 0) / ranking.length) : 0;

    return {
      gradeLevel, senior, term: term || 'all',
      learnerCount: ranking.length,
      classAverage,
      classLevel: ranking.length ? this.percentToLevelCode(classAverage, senior) : '',
      areas,            // per-learning-area averages (best→worst)
      distribution,     // level distribution
      ranking,          // learners best→worst
      trend,            // avg % per term
    };
  }

  // ── School-wide analytics (admin/HOI only) ───────────────────
  // Aggregates every mark in the school into: per-grade averages, per-learning-area
  // averages school-wide, whole-school CBC level distribution, term trend, and a
  // stream leaderboard (each class's average). Optionally filter by grade and/or term.
  async getSchoolAnalytics(user: any, gradeLevel?: string, term?: string) {
    if (!this.isHoiRole(user.role)) {
      throw new BadRequestException('School analytics are available to administrators only.');
    }
    const tenantId = user.tenantId;

    const rows = await this.dataSource.query(
      `SELECT ar.subject, ar.percent, ar.term, ar.learner_id AS "learnerId",
              s.id::text AS "streamId", s.name AS "streamName", s.grade_level AS "gradeLevel"
         FROM assessment_results ar
         JOIN streams s ON s.id::text = ar.stream_id::text
        WHERE ar.tenant_id::text = $1 AND ar.percent IS NOT NULL
          AND ($2::text IS NULL OR s.grade_level = $2)
          AND ($3::text IS NULL OR ar.term = $3)`,
      [tenantId, gradeLevel || null, term || null],
    ).catch(() => []);

    const isSeniorGrade = (g: string) => this.isSenior(g);

    const byGrade: Record<string, { sum: number; n: number; learners: Set<string> }> = {};
    const byArea: Record<string, { sum: number; n: number }> = {};
    const byStream: Record<string, { name: string; grade: string; sum: number; n: number; learners: Set<string> }> = {};
    const byTerm: Record<string, { sum: number; n: number }> = {};
    const levelDistByBand: { junior: Record<string, number>; primary: Record<string, number> } = { junior: {}, primary: {} };
    const allLearners = new Set<string>();
    let totalSum = 0, totalN = 0;

    for (const r of rows) {
      const pct = Number(r.percent);
      if (isNaN(pct)) continue;
      const g = r.gradeLevel || 'unknown';
      const senior = isSeniorGrade(g);
      (byGrade[g] ||= { sum: 0, n: 0, learners: new Set() });
      byGrade[g].sum += pct; byGrade[g].n++; byGrade[g].learners.add(r.learnerId);
      (byArea[r.subject] ||= { sum: 0, n: 0 }); byArea[r.subject].sum += pct; byArea[r.subject].n++;
      (byStream[r.streamId] ||= { name: r.streamName, grade: g, sum: 0, n: 0, learners: new Set() });
      byStream[r.streamId].sum += pct; byStream[r.streamId].n++; byStream[r.streamId].learners.add(r.learnerId);
      const t = r.term || 'term_?'; (byTerm[t] ||= { sum: 0, n: 0 }); byTerm[t].sum += pct; byTerm[t].n++;
      const code = this.percentToLevelCode(pct, senior);
      const bucket = senior ? levelDistByBand.junior : levelDistByBand.primary;
      bucket[code] = (bucket[code] || 0) + 1;
      allLearners.add(r.learnerId);
      totalSum += pct; totalN++;
    }

    const grades = Object.entries(byGrade)
      .map(([g, v]) => ({ gradeLevel: g, average: Math.round(v.sum / v.n), level: this.percentToLevelCode(Math.round(v.sum / v.n), isSeniorGrade(g)), learners: v.learners.size }))
      .sort((a, b) => a.gradeLevel.localeCompare(b.gradeLevel));

    const areas = Object.entries(byArea)
      .map(([subject, v]) => ({ subject, average: Math.round(v.sum / v.n), count: v.n }))
      .sort((a, b) => b.average - a.average);

    const streams = Object.entries(byStream)
      .map(([streamId, v]) => ({ streamId, name: v.name, gradeLevel: v.grade, average: Math.round(v.sum / v.n), level: this.percentToLevelCode(Math.round(v.sum / v.n), isSeniorGrade(v.grade)), learners: v.learners.size }))
      .sort((a, b) => b.average - a.average)
      .map((e, i) => ({ ...e, rank: i + 1 }));

    const trend = Object.entries(byTerm)
      .map(([t, v]) => ({ term: t, average: Math.round(v.sum / v.n) }))
      .sort((a, b) => a.term.localeCompare(b.term));

    const distributionPrimary = Object.entries(levelDistByBand.primary).map(([code, count]) => ({ code, count }));
    const distributionJunior  = Object.entries(levelDistByBand.junior).map(([code, count]) => ({ code, count }));

    const schoolAverage = totalN ? Math.round(totalSum / totalN) : 0;

    return {
      gradeFilter: gradeLevel || 'all',
      term: term || 'all',
      learnerCount: allLearners.size,
      schoolAverage,
      grades,                 // per-grade averages
      areas,                  // school-wide per-learning-area averages
      streams,                // stream leaderboard
      trend,                  // school avg % per term
      distributionPrimary,    // CBC 4-level (grades 1-6)
      distributionJunior,     // 8-level (grades 7-12)
    };
  }

  // ── Subject-teacher analytics ────────────────────────────────
  // For a learning-area teacher: shows ONLY the subjects they teach, each compared across
  // the classes they teach it in. Returns, per subject: class-by-class averages, the level
  // distribution for that subject, term trend, and an overall average. Scoped strictly to
  // the teacher's own (stream, subject) assignments.
  async getSubjectTeacherAnalytics(user: any, subjectFilter?: string, term?: string) {
    const tenantId = user.tenantId;

    // The teacher's exact (stream, subject) assignments.
    const ssRows = await this.dataSource.query(
      `SELECT stream_id::text AS "streamId", subject FROM teacher_stream_subjects
        WHERE tenant_id::text = $1 AND teacher_id::text = $2`,
      [tenantId, user.id],
    ).catch(() => []);

    // Admins teach nothing specific; if an admin opens this, fall back to all subjects.
    const admin = this.isHoiRole(user.role);
    if (!ssRows.length && !admin) {
      return { subjects: [], data: [], note: 'You have no learning-area assignments yet. Ask your admin to assign your subjects.' };
    }

    // subject -> set of streamIds the teacher teaches it in
    const subjectStreams: Record<string, Set<string>> = {};
    for (const r of ssRows) {
      (subjectStreams[r.subject] ||= new Set()).add(r.streamId);
    }
    const mySubjects = Object.keys(subjectStreams).sort();
    const chosen = subjectFilter && subjectStreams[subjectFilter] ? subjectFilter : mySubjects[0];
    if (!chosen) return { subjects: [], data: null };

    const streamIds = Array.from(subjectStreams[chosen]);
    if (!streamIds.length) return { subjects: mySubjects, chosen, data: null };

    // Pull marks for this subject in exactly those streams.
    const rows = await this.dataSource.query(
      `SELECT ar.percent, ar.term, ar.learner_id AS "learnerId",
              s.id::text AS "streamId", s.name AS "streamName", s.grade_level AS "gradeLevel"
         FROM assessment_results ar
         JOIN streams s ON s.id::text = ar.stream_id::text
        WHERE ar.tenant_id::text = $1 AND ar.subject = $2
          AND ar.stream_id::text = ANY($3::text[])
          AND ($4::text IS NULL OR ar.term = $4)
          AND ar.percent IS NOT NULL`,
      [tenantId, chosen, streamIds, term || null],
    ).catch(() => []);

    const byStream: Record<string, { name: string; grade: string; sum: number; n: number; learners: Set<string> }> = {};
    const byTerm: Record<string, { sum: number; n: number }> = {};
    const levelDist: Record<string, number> = {};
    let totalSum = 0, totalN = 0; const allLearners = new Set<string>();

    for (const r of rows) {
      const pct = Number(r.percent); if (isNaN(pct)) continue;
      const senior = this.isSenior(r.gradeLevel || '');
      (byStream[r.streamId] ||= { name: r.streamName, grade: r.gradeLevel, sum: 0, n: 0, learners: new Set() });
      const st = byStream[r.streamId]; st.sum += pct; st.n++; st.learners.add(r.learnerId);
      const t = r.term || 'term_?'; (byTerm[t] ||= { sum: 0, n: 0 }); byTerm[t].sum += pct; byTerm[t].n++;
      const code = this.percentToLevelCode(pct, senior);
      levelDist[code] = (levelDist[code] || 0) + 1;
      totalSum += pct; totalN++; allLearners.add(r.learnerId);
    }

    const classes = Object.entries(byStream)
      .map(([streamId, v]) => ({ streamId, name: v.name, gradeLevel: v.grade, average: Math.round(v.sum / v.n), level: this.percentToLevelCode(Math.round(v.sum / v.n), this.isSenior(v.grade)), learners: v.learners.size }))
      .sort((a, b) => b.average - a.average);

    const trend = Object.entries(byTerm)
      .map(([t, v]) => ({ term: t, average: Math.round(v.sum / v.n) }))
      .sort((a, b) => a.term.localeCompare(b.term));

    const distribution = Object.entries(levelDist).map(([code, count]) => ({ code, count }));

    return {
      subjects: mySubjects,           // the teacher's subjects (for the picker)
      chosen,                         // the subject being shown
      term: term || 'all',
      overallAverage: totalN ? Math.round(totalSum / totalN) : 0,
      learnerCount: allLearners.size,
      classes,                        // class-by-class averages for this subject
      distribution,                   // level distribution for this subject
      trend,                          // term trend for this subject
    };
  }

  // ── Parent analytics ─────────────────────────────────────────
  // For a parent: lists their children (learners whose guardian_email matches the parent's
  // account email), and for a chosen child returns per-learning-area performance, level,
  // term trend, the child's overall average, and how the child compares to their class
  // average — WITHOUT exposing any other named learner.
  async getParentAnalytics(user: any, learnerId?: string, term?: string) {
    const tenantId = user.tenantId;
    const email = String(user.email || '').toLowerCase().trim();

    // Find this parent's children by guardian email (the established linkage), scoped to
    // the parent's tenant.
    const children = await this.dataSource.query(
      `SELECT id::text AS id, first_name AS "firstName", last_name AS "lastName",
              stream_id::text AS "streamId", grade_level AS "gradeLevel"
         FROM learners
        WHERE tenant_id::text = $1 AND LOWER(guardian_email) = $2
        ORDER BY first_name`,
      [tenantId, email],
    ).catch(() => []);

    if (!children.length) {
      return { children: [], note: 'No children are linked to your account yet. Please contact the school office.' };
    }

    const childList = children.map((c: any) => ({ id: c.id, name: `${c.firstName || ''} ${c.lastName || ''}`.trim() }));
    const chosen = (learnerId && children.find((c: any) => c.id === learnerId)) || children[0];

    const senior = this.isSenior(chosen.gradeLevel || '');

    // The child's own marks.
    const myRows = await this.dataSource.query(
      `SELECT subject, percent, term FROM assessment_results
        WHERE tenant_id::text = $1 AND learner_id::text = $2
          AND ($3::text IS NULL OR term = $3) AND percent IS NOT NULL`,
      [tenantId, chosen.id, term || null],
    ).catch(() => []);

    // The class average per subject (for comparison), computed across the child's stream
    // — aggregated, never exposing other learners by name.
    const classRows = await this.dataSource.query(
      `SELECT subject, AVG(percent) AS "avgPct" FROM assessment_results
        WHERE tenant_id::text = $1 AND stream_id::text = $2
          AND ($3::text IS NULL OR term = $3) AND percent IS NOT NULL
        GROUP BY subject`,
      [tenantId, chosen.streamId, term || null],
    ).catch(() => []);
    const classAvgBySubject: Record<string, number> = {};
    for (const r of classRows) classAvgBySubject[r.subject] = Math.round(Number(r.avgPct));

    const byArea: Record<string, { sum: number; n: number }> = {};
    const byTerm: Record<string, { sum: number; n: number }> = {};
    let totalSum = 0, totalN = 0;
    for (const r of myRows) {
      const pct = Number(r.percent); if (isNaN(pct)) continue;
      (byArea[r.subject] ||= { sum: 0, n: 0 }); byArea[r.subject].sum += pct; byArea[r.subject].n++;
      const t = r.term || 'term_?'; (byTerm[t] ||= { sum: 0, n: 0 }); byTerm[t].sum += pct; byTerm[t].n++;
      totalSum += pct; totalN++;
    }

    const areas = Object.entries(byArea)
      .map(([subject, v]) => {
        const avg = Math.round(v.sum / v.n);
        return {
          subject, average: avg, level: this.percentToLevelCode(avg, senior),
          classAverage: classAvgBySubject[subject] ?? null,
        };
      })
      .sort((a, b) => b.average - a.average);

    const trend = Object.entries(byTerm)
      .map(([t, v]) => ({ term: t, average: Math.round(v.sum / v.n) }))
      .sort((a, b) => a.term.localeCompare(b.term));

    const overallAverage = totalN ? Math.round(totalSum / totalN) : 0;
    // Child's overall vs class overall (aggregate of class subject averages).
    const classOverall = Object.values(classAvgBySubject).length
      ? Math.round(Object.values(classAvgBySubject).reduce((a, b) => a + b, 0) / Object.values(classAvgBySubject).length)
      : null;

    return {
      children: childList,
      chosen: { id: chosen.id, name: `${chosen.firstName || ''} ${chosen.lastName || ''}`.trim(), gradeLevel: chosen.gradeLevel },
      term: term || 'all',
      overallAverage,
      overallLevel: totalN ? this.percentToLevelCode(overallAverage, senior) : '',
      classOverall,
      areas,     // per-subject: child average + level + class average
      trend,     // child's term trend
      hasMarks: totalN > 0,
    };
  }

  // ── Parent: list my children ─────────────────────────────────
  // Finds learners whose guardian_email matches the parent's account email. This is the
  // endpoint the parent portal uses to show the child cards.
  async getMyChildren(user: any) {
    const tenantId = user.tenantId;
    const email = String(user.email || '').toLowerCase().trim();
    if (!email) return [];
    const rows = await this.dataSource.query(
      `SELECT l.id::text AS id, l.first_name AS "firstName", l.last_name AS "lastName",
              l.admission_number AS "admissionNumber", l.grade_level AS "gradeLevel",
              s.name AS "streamName", s.id::text AS "streamId"
         FROM learners l
         LEFT JOIN streams s ON s.id::text = l.stream_id::text
        WHERE l.tenant_id::text = $1 AND LOWER(l.guardian_email) = $2
        ORDER BY l.first_name`,
      [tenantId, email],
    ).catch(() => []);

    // Attach a current performance level (overall average → CBC level) per child.
    const out: any[] = [];
    for (const c of rows) {
      const agg = await this.dataSource.query(
        `SELECT AVG(percent) AS "avg" FROM assessment_results
          WHERE tenant_id::text = $1 AND learner_id::text = $2 AND percent IS NOT NULL`,
        [tenantId, c.id],
      ).catch(() => []);
      const avg = agg[0]?.avg != null ? Math.round(Number(agg[0].avg)) : null;

      // Real fee balance: billed (fee items for grade) minus total paid.
      const paidRow = await this.dataSource.query(
        `SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE tenant_id::text = $1 AND learner_id::text = $2`,
        [tenantId, c.id],
      ).catch(() => [{ paid: 0 }]);
      const billedRow = await this.dataSource.query(
        `SELECT COALESCE(SUM(amount),0) AS billed FROM fee_items
          WHERE tenant_id::text = $1 AND (grade_level IS NULL OR grade_level = $2)`,
        [tenantId, c.gradeLevel || null],
      ).catch(() => [{ billed: 0 }]);
      const balance = Number(billedRow[0]?.billed || 0) - Number(paidRow[0]?.paid || 0);

      out.push({
        id: c.id, firstName: c.firstName, lastName: c.lastName,
        admissionNumber: c.admissionNumber,
        stream: c.streamName ? { name: c.streamName, id: c.streamId } : null,
        currentLevel: avg != null ? this.percentToLevelCode(avg, this.isSenior(c.gradeLevel || '')) : null,
        attendanceRate: null,   // attendance integration can fill this later
        balance,
      });
    }
    return out;
  }

  async getExams(tenantId: string) {
    return this.dataSource.query(
      `SELECT id, name, exam_type AS "examType", term, academic_year AS "academicYear",
              start_date AS "startDate", end_date AS "endDate", max_score AS "maxScore", status
       FROM exams WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    ).catch(() => []);
  }

  async createExam(tenantId: string, actorRole: string, dto: any) {
    // Item 6: only the admin / HOI may create exams
    if (!this.isHoiRole(actorRole)) {
      throw new BadRequestException('Only the school administrator can create exams.');
    }
    const rows = await this.dataSource.query(
      `INSERT INTO exams
         (tenant_id, name, exam_type, term, academic_year, start_date, end_date, max_score, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'scheduled',NOW())
       RETURNING id, name`,
      [
        tenantId, dto.name, dto.examType || 'end_term', dto.term || 'term_1',
        dto.academicYear || '2025/2026', dto.startDate || null, dto.endDate || null,
        dto.maxScore || 100,
      ],
    ).catch((e: any) => { throw e; });
    return { message: 'Exam created', exam: rows[0] };
  }

  // HOI/admin deletes a created exam. Refuses if marks already exist for it unless
  // ?force=true, so an exam with entered marks isn't wiped by accident.
  async deleteExam(tenantId: string, actorRole: string, examId: string, force?: boolean) {
    if (!this.isHoiRole(actorRole)) {
      throw new BadRequestException('Only the school administrator can delete exams.');
    }
    const cnt = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM assessment_results WHERE tenant_id::text = $1 AND exam_id::text = $2`,
      [tenantId, examId],
    ).catch(() => [{ n: 0 }]);
    const markCount = cnt[0]?.n || 0;
    if (markCount > 0 && !force) {
      return { needsConfirm: true, markCount, message: `This assessment has ${markCount} marks entered. Delete anyway?` };
    }
    if (markCount > 0 && force) {
      await this.dataSource.query(
        `DELETE FROM assessment_results WHERE tenant_id::text = $1 AND exam_id::text = $2`,
        [tenantId, examId],
      ).catch(() => null);
    }
    await this.dataSource.query(
      `DELETE FROM exams WHERE id::text = $1 AND tenant_id::text = $2`, [examId, tenantId],
    ).catch((e: any) => { throw new BadRequestException(e.message); });
    return { deleted: true, removedMarks: force ? markCount : 0 };
  }

  getStream(tenantId: string, id: string) {
    return this.streamRepo.findOne({ where: { id, tenantId } });
  }

  createStream(tenantId: string, schoolId: string, dto: any) {
    if (!schoolId) {
      throw new BadRequestException('No school is linked to your account. Please log out and log in again.');
    }
    const stream = this.streamRepo.create({ ...dto, tenantId, schoolId });
    return this.streamRepo.save(stream);
  }

  /**
   * Rename a stream and/or set its class teacher. Lets schools fix streams that were
   * created with only a grade name (e.g. "Grade 7" → "Grade 7 Blue") without losing
   * the learners already registered under that stream.
   */
  async updateStream(tenantId: string, streamId: string, dto: any) {
    const sets: string[] = []; const vals: any[] = []; let i = 1;
    if (dto.name !== undefined && String(dto.name).trim()) {
      sets.push(`name = $${i++}`); vals.push(String(dto.name).trim());
    }
    if (dto.classTeacherId !== undefined) {
      // A stream has one class teacher; clear that teacher from any other stream first.
      const tid = dto.classTeacherId || null;
      if (tid) {
        let tname = dto.classTeacherName || null;
        if (!tname) {
          const tr = await this.dataSource.query(
            `SELECT first_name, last_name FROM users WHERE id::text = $1 LIMIT 1`, [tid],
          ).catch(() => []);
          if (tr.length) tname = `${tr[0].first_name || ''} ${tr[0].last_name || ''}`.trim();
        }
        await this.dataSource.query(
          `UPDATE streams SET class_teacher_id = NULL, class_teacher_name = NULL
            WHERE tenant_id::text = $1 AND class_teacher_id::text = $2`,
          [tenantId, tid],
        ).catch(() => null);
        sets.push(`class_teacher_id = $${i++}`);   vals.push(tid);
        sets.push(`class_teacher_name = $${i++}`); vals.push(tname);
      } else {
        sets.push(`class_teacher_id = NULL`);
        sets.push(`class_teacher_name = NULL`);
      }
    }
    if (!sets.length) return { message: 'Nothing to update' };
    vals.push(streamId, tenantId);
    await this.dataSource.query(
      `UPDATE streams SET ${sets.join(', ')} WHERE id::text = $${i++} AND tenant_id::text = $${i}`,
      vals,
    ).catch((e: any) => { throw new BadRequestException(e.message); });
    return { message: 'Stream updated', id: streamId };
  }

  /**
   * Create a class (grade level) with one or more streams in a single action.
   * A grade like "Grade 7" is split into streams (Blue, Red, …) because one class
   * of 500 learners can't sit in a single room.
   * dto = { gradeLevel, academicYear, streams: [{ name, classTeacherId? }] }
   */
  async createClassWithStreams(tenantId: string, schoolId: string, dto: any) {
    if (!schoolId) {
      throw new BadRequestException('No school is linked to your account. Please log out and log in again.');
    }
    if (!dto?.gradeLevel) throw new BadRequestException('Select a grade level.');
    const streams = Array.isArray(dto.streams) ? dto.streams.filter((s: any) => s?.name?.trim()) : [];
    if (!streams.length) throw new BadRequestException('Add at least one stream (e.g. Blue, Red).');

    const gradeLabel = String(dto.gradeLevel).replace('grade_', 'Grade ').replace('pp', 'PP');
    const created: any[] = [];
    for (const s of streams) {
      // Stream name like "Grade 7 Blue"; if the user typed a full name keep it,
      // otherwise prefix the grade so streams read naturally in lists.
      const raw = String(s.name).trim();
      const name = /grade|pp|^g\d/i.test(raw) ? raw : `${gradeLabel} ${raw}`;
      const row = this.streamRepo.create({
        tenantId, schoolId,
        gradeLevel:     dto.gradeLevel,
        name,
        classTeacherId: s.classTeacherId || null,
        academicYear:   dto.academicYear || null,
      });
      created.push(await this.streamRepo.save(row));
    }
    return { message: `${created.length} stream(s) created under ${gradeLabel}`, streams: created };
  }

  // ── Learners ─────────────────────────────────────────────
  async getLearners(tenantId: string, filters: any) {
    const qb = this.learnerRepo.createQueryBuilder('l')
      .where('l.tenant_id = :tenantId', { tenantId });

    // status: 'active' (default) | 'inactive' | 'all'
    const status = filters.status || 'active';
    if (status === 'active')        qb.andWhere('l.is_active = true');
    else if (status === 'inactive') qb.andWhere('l.is_active = false');
    // 'all' → no is_active filter

    if (filters.search) {
      qb.andWhere(
        '(l.first_name ILIKE :q OR l.last_name ILIKE :q OR l.admission_number ILIKE :q)',
        { q: `%${filters.search}%` },
      );
    }
    if (filters.streamId) qb.andWhere('l.stream_id = :sid', { sid: filters.streamId });

    return qb.orderBy('l.last_name').getMany();
  }

  getLearnersByStream(tenantId: string, streamId: string) {
    return this.learnerRepo.find({
      where:  { tenantId, streamId, isActive: true },
      order:  { lastName: 'ASC', firstName: 'ASC' },
    });
  }

  async createLearner(tenantId: string, schoolId: string, dto: any, actor?: any) {
    // Teachers may only add learners to a class they own — any stream where they are
    // class teacher, not just their single primary stream.
    if (actor && this.isTeacherRole(actor.role) && !this.isHoiRole(actor.role)) {
      if (!dto.streamId || !(await this.actorOwnsStream(tenantId, actor, dto.streamId))) {
        throw new BadRequestException('You can only add learners to your own class.');
      }
    }
    const learner = this.learnerRepo.create({ ...dto, tenantId, schoolId: schoolId || actor?.schoolId });
    // Single full-name field → split into first/last for storage.
    if (dto.fullName && !dto.firstName) {
      const parts = String(dto.fullName).trim().split(/\s+/);
      (learner as any).firstName = parts.shift() || dto.fullName;
      (learner as any).lastName = parts.join(' ') || '';
    }
    // grade_level is NOT NULL in the DB but the teacher form doesn't send it — derive it
    // from the stream the learner is being added to.
    if ((!dto.gradeLevel || !String(dto.gradeLevel).trim()) && dto.streamId) {
      const srow = await this.dataSource.query(
        `SELECT grade_level FROM streams WHERE id::text = $1 LIMIT 1`, [dto.streamId],
      ).catch(() => []);
      (learner as any).gradeLevel = srow[0]?.grade_level || 'grade_1';
    }
    if (!(learner as any).gradeLevel) (learner as any).gradeLevel = 'grade_1';
    // gender has a strict CHECK (male|female); an empty string violates it. Normalise,
    // defaulting to 'male' only to satisfy the constraint when unspecified.
    const g = String((dto.gender || '')).toLowerCase().trim();
    (learner as any).gender = (g === 'female' || g === 'f') ? 'female' : (g === 'male' || g === 'm') ? 'male' : 'male';
    // academic_year was relaxed but set a sensible default if absent.
    if (!(learner as any).academicYear) (learner as any).academicYear = '2025/2026';
    // Admission number is optional — auto-generate if left blank.
    if (!dto.admissionNumber || !String(dto.admissionNumber).trim()) {
      (learner as any).admissionNumber = 'ADM-' + Date.now().toString().slice(-7);
    }
    const saved = await this.learnerRepo.save(learner);

    // If a guardian email was supplied, create a parent login (optional) and
    // return one-time credentials so the admin can share them with the parent.
    let parentCredentials: { username: string; password: string } | undefined;
    const guardianEmail = (dto.guardianEmail || '').toLowerCase().trim();
    if (guardianEmail) {
      try {
        const existing = await this.dataSource.query(
          `SELECT id FROM users WHERE email = $1 LIMIT 1`, [guardianEmail],
        );
        if (!existing.length) {
          const plain = this.parentDefaultPassword(guardianEmail);
          const hash  = await bcrypt.hash(plain, 12);
          const gName = (dto.guardianName || 'Parent').trim().split(/\s+/);
          await this.dataSource.query(
            `INSERT INTO users
               (email, password_hash, first_name, last_name, phone, role,
                tenant_id, school_id, is_active, email_verified, must_change_password, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,'parent',$6,$7,true,false,true,NOW(),NOW())`,
            [
              guardianEmail, hash,
              gName.shift() || 'Parent', gName.join(' ') || (dto.lastName || ''),
              dto.guardianPhone || null, tenantId, schoolId || actor?.schoolId,
            ],
          );
          parentCredentials = { username: guardianEmail, password: plain };
        }
      } catch {
        // Never fail the admission because of parent-account creation
      }
    }

    return parentCredentials
      ? { ...(saved as any), parentCredentials }
      : saved;
  }

  // Bulk-register learners into a stream (e.g. parsed from a KNEC/CBA class list).
  // Each item: { firstName, lastName, gender, admissionNumber? }. Keeps a provided
  // admission number; skips any that already exist in the school.
  async bulkCreate(tenantId: string, schoolId: string, dto: any, registeredBy?: string) {
    console.log(`📥 bulkCreate: tenant=${tenantId} school=${schoolId} stream=${dto?.streamId} count=${Array.isArray(dto?.learners) ? dto.learners.length : 'N/A'}`);
    if (!dto?.streamId) throw new BadRequestException('No stream selected for the upload.');
    const stream = await this.streamRepo.findOne({ where: { id: dto.streamId, tenantId } });
    if (!stream) throw new BadRequestException('Stream not found for this school.');
    const effectiveSchoolId = schoolId || (stream as any).schoolId;
    if (!effectiveSchoolId) throw new BadRequestException('Could not determine the school for these learners.');
    const items: any[] = Array.isArray(dto.learners) ? dto.learners : [];
    if (!items.length) throw new BadRequestException('No learners to upload.');
    const created: any[] = [];
    const errors:  any[] = [];

    for (const [i, raw] of items.entries()) {
      try {
        if (!raw.firstName && !raw.lastName) { errors.push({ row: i + 1, name: '(blank)', error: 'Missing name' }); continue; }
        const admissionNumber = (raw.admissionNumber && String(raw.admissionNumber).trim())
          ? String(raw.admissionNumber).trim()
          : 'ADM-' + Date.now().toString().slice(-7) + i;
        // admission_number is UNIQUE across the whole table, so check globally (not per-school).
        const exists = await this.learnerRepo.findOne({ where: { admissionNumber } as any });
        if (exists) { errors.push({ row: i + 1, name: `${raw.firstName} ${raw.lastName}`, error: `Admission no. ${admissionNumber} already exists` }); continue; }
        const learner = this.learnerRepo.create({
          firstName:    raw.firstName || raw.lastName,
          lastName:     raw.lastName  || raw.firstName,
          gender:       raw.gender || 'male',
          admissionNumber,
          tenantId,
          schoolId:     effectiveSchoolId,
          streamId:     dto.streamId,
          gradeLevel:   (stream as any).gradeLevel,
          academicYear: dto.academicYear || (stream as any).academicYear || '2025/2026',
          status:       'active',
        } as any);
        await this.learnerRepo.save(learner);
        created.push({ row: i + 1, admissionNumber, name: `${raw.firstName} ${raw.lastName}` });
      } catch (err: any) {
        console.error(`❌ bulkCreate row ${i + 1} failed:`, err?.message);
        errors.push({ row: i + 1, name: `${raw.firstName} ${raw.lastName}`, error: err?.message || 'save failed' });
      }
    }

    console.log(`✅ bulkCreate done: ${created.length} created, ${errors.length} failed`);
    return {
      registered: created.length,
      failed:     errors.length,
      created, errors,
      summary: `${created.length} learners registered${errors.length ? `, ${errors.length} skipped/failed` : ''}.`,
    };
  }

  async deleteLearner(tenantId: string, learnerId: string, actor: any) {
    const learner = await this.learnerRepo.findOne({ where: { id: learnerId, tenantId } });
    if (!learner) throw new BadRequestException('Learner not found');

    // Teachers may only remove learners from a class they own (any stream they are
    // class teacher of, not just their single primary stream).
    if (this.isTeacherRole(actor.role) && !this.isHoiRole(actor.role)) {
      if (!(await this.actorOwnsStream(tenantId, actor, learner.streamId))) {
        throw new BadRequestException('You can only remove learners from your own class.');
      }
    }
    await this.learnerRepo.delete({ id: learnerId, tenantId });
    return { message: 'Learner removed', id: learnerId };
  }

  async deleteTeacher(tenantId: string, actorRole: string, teacherId: string, actorId: string) {
    // Only school admins / HOI may delete teachers
    if (!this.isHoiRole(actorRole)) {
      throw new BadRequestException('Only a school administrator can remove a teacher.');
    }
    if (teacherId === actorId) {
      throw new BadRequestException('You cannot delete your own account.');
    }
    const rows = await this.dataSource.query(
      `DELETE FROM users WHERE id = $1 AND tenant_id = $2
         AND role IN ('class_teacher','subject_teacher','overall_class_teacher','hoi','dhois')
       RETURNING id`,
      [teacherId, tenantId],
    ).catch(() => []);
    if (!rows.length) throw new BadRequestException('Teacher not found');
    // Clean up their teacher allocations
    await this.dataSource.query(`DELETE FROM teacher_allocations WHERE teacher_id = $1 AND tenant_id = $2`, [teacherId, tenantId]).catch(()=>null);
    return { message: 'Teacher removed', id: teacherId };
  }

  // Transfer the HOI role to another already-onboarded teacher.
  // The person who signed the school up is assumed HOI, but may not be the real one.
  async transferHoi(tenantId: string, actorRole: string, actorId: string, newHoiTeacherId: string) {
    if (!this.isHoiRole(actorRole)) {
      throw new BadRequestException('Only the current HOI or a school administrator can transfer the HOI role.');
    }
    if (!newHoiTeacherId) throw new BadRequestException('Select the teacher to become HOI.');
    // Target must be an onboarded teacher in this school
    const target = await this.dataSource.query(
      `SELECT id, role FROM users WHERE id::text = $1 AND tenant_id::text = $2 LIMIT 1`,
      [newHoiTeacherId, tenantId],
    ).catch(() => []);
    if (!target.length) throw new BadRequestException('Teacher not found in this school.');
    // Demote the current HOI(s) to class_teacher, promote the target to hoi.
    await this.dataSource.query(
      `UPDATE users SET role = 'class_teacher' WHERE tenant_id::text = $1 AND role = 'hoi'`,
      [tenantId],
    ).catch(() => null);
    await this.dataSource.query(
      `UPDATE users SET role = 'hoi' WHERE id::text = $1 AND tenant_id::text = $2`,
      [newHoiTeacherId, tenantId],
    ).catch((e: any) => { throw new BadRequestException(e.message); });
    return { message: 'HOI role transferred', newHoiId: newHoiTeacherId };
  }

  // ── Edit / deactivate (learners & teachers) ──
  async updateLearner(tenantId: string, learnerId: string, actor: any, dto: any) {
    if (!this.isHoiRole(actor.role) && !this.isTeacherRole(actor.role)) {
      throw new BadRequestException('You do not have permission to edit learners.');
    }
    // A class teacher may only edit learners in a class they manage — any stream where
    // they are class teacher, not just their primary stream (matches the teacher UI).
    if (!this.isHoiRole(actor.role)) {
      const lr = await this.dataSource.query(
        `SELECT stream_id FROM learners WHERE id::text = $1 AND tenant_id::text = $2 LIMIT 1`,
        [learnerId, tenantId],
      ).catch(() => []);
      if (!lr.length) throw new BadRequestException('Learner not found.');
      if (!(await this.actorOwnsStream(tenantId, actor, lr[0].stream_id))) {
        throw new BadRequestException('You can only edit learners in your own class.');
      }
    }
    const fields: string[] = []; const vals: any[] = []; let i = 1;
    const map: Record<string, string> = {
      firstName: 'first_name', lastName: 'last_name', gender: 'gender',
      gradeLevel: 'grade_level', streamId: 'stream_id', admissionNumber: 'admission_number',
      guardianPhone: 'guardian_phone', residence: 'residence',
    };
    // fullName splits into first/last (handled here, not in the column map)
    if (dto.fullName) {
      const parts = String(dto.fullName).trim().split(/\s+/);
      fields.push(`first_name = $${i++}`); vals.push(parts.shift() || dto.fullName);
      fields.push(`last_name = $${i++}`); vals.push(parts.join(' ') || '');
    }
    for (const [k, col] of Object.entries(map)) {
      if (k === 'firstName' || k === 'lastName') continue;  // already covered via fullName when sent
      if (dto[k] !== undefined) { fields.push(`${col} = $${i++}`); vals.push(dto[k]); }
    }
    if (!fields.length) return { message: 'Nothing to update' };
    vals.push(learnerId, tenantId);
    await this.dataSource.query(
      `UPDATE learners SET ${fields.join(', ')} WHERE id::text = $${i++} AND tenant_id::text = $${i}`,
      vals,
    ).catch((e: any) => { throw new BadRequestException(e.message); });
    return { message: 'Learner updated', id: learnerId };
  }

  // View the parent-login status for a learner: whether a parent account exists, and
  // the email/phone it uses. (Never returns the password — that's only shown once at
  // create/reset time.)
  async getParentAccess(tenantId: string, learnerId: string) {
    const lr = (await this.dataSource.query(
      `SELECT first_name AS "firstName", last_name AS "lastName",
              guardian_name AS "guardianName", guardian_phone AS "guardianPhone",
              guardian_email AS "guardianEmail"
         FROM learners WHERE id::text = $1 AND tenant_id::text = $2 LIMIT 1`,
      [learnerId, tenantId],
    ).catch(() => []))[0];
    if (!lr) throw new BadRequestException('Learner not found.');
    let parent: any = null;
    if (lr.guardianEmail) {
      const u = (await this.dataSource.query(
        `SELECT id, email, first_name AS "firstName", last_name AS "lastName", is_active AS "isActive"
           FROM users WHERE email = $1 AND role = 'parent' LIMIT 1`,
        [String(lr.guardianEmail).toLowerCase().trim()],
      ).catch(() => []))[0];
      if (u) parent = u;
    }
    return {
      learnerName: `${lr.firstName || ''} ${lr.lastName || ''}`.trim(),
      guardianName: lr.guardianName, guardianPhone: lr.guardianPhone, guardianEmail: lr.guardianEmail,
      hasAccount: !!parent,
      parentEmail: parent?.email || null,
    };
  }

  // Create a parent login for an existing learner, or reset the existing parent's
  // password. Returns the login email + a fresh one-time password to share. If a
  // guardian email isn't on file yet, accepts one in the body to set it.
  async parentAccess(tenantId: string, schoolId: string, learnerId: string, actor: any, dto: any) {
    if (!this.isHoiRole(actor.role) && !this.isTeacherRole(actor.role)) {
      throw new BadRequestException('You do not have permission to manage parent access.');
    }
    const lr = (await this.dataSource.query(
      `SELECT first_name AS "firstName", last_name AS "lastName",
              guardian_name AS "guardianName", guardian_phone AS "guardianPhone",
              guardian_email AS "guardianEmail", school_id AS "schoolId"
         FROM learners WHERE id::text = $1 AND tenant_id::text = $2 LIMIT 1`,
      [learnerId, tenantId],
    ).catch(() => []))[0];
    if (!lr) throw new BadRequestException('Learner not found.');

    // Allow setting/updating the guardian email + details in the same action.
    const email = String(dto?.guardianEmail || lr.guardianEmail || '').toLowerCase().trim();
    if (!email) throw new BadRequestException('A parent email is required to create their login.');
    const gName = String(dto?.guardianName || lr.guardianName || 'Parent').trim().split(/\s+/);
    const phone = dto?.guardianPhone || lr.guardianPhone || null;

    // Persist guardian details on the learner if newly provided.
    if (dto?.guardianEmail || dto?.guardianName || dto?.guardianPhone) {
      await this.dataSource.query(
        `UPDATE learners SET guardian_email = COALESCE($1, guardian_email),
                guardian_name = COALESCE($2, guardian_name),
                guardian_phone = COALESCE($3, guardian_phone)
           WHERE id::text = $4 AND tenant_id::text = $5`,
        [email, dto?.guardianName || null, phone, learnerId, tenantId],
      ).catch(() => null);
    }

    const plain = this.parentDefaultPassword(email);
    const hash = await bcrypt.hash(plain, 12);

    const existing = (await this.dataSource.query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`, [email],
    ).catch(() => []))[0];

    if (existing) {
      await this.dataSource.query(
        `UPDATE users SET password_hash = $2, role = 'parent', is_active = true,
                must_change_password = true WHERE id = $1`,
        [existing.id, hash],
      ).catch((e: any) => { throw new BadRequestException(e.message); });
    } else {
      await this.dataSource.query(
        `INSERT INTO users
           (email, password_hash, first_name, last_name, phone, role,
            tenant_id, school_id, is_active, email_verified, must_change_password, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,'parent',$6,$7,true,false,true,NOW(),NOW())`,
        [email, hash, gName.shift() || 'Parent', gName.join(' ') || (lr.lastName || ''),
         phone, tenantId, lr.schoolId || schoolId],
      ).catch((e: any) => { throw new BadRequestException(e.message); });
    }
    return {
      message: existing ? 'Parent password reset' : 'Parent account created',
      learnerName: `${lr.firstName || ''} ${lr.lastName || ''}`.trim(),
      credentials: { email, password: plain },
    };
  }
  async setLearnerActive(tenantId: string, learnerId: string, actor: any, active: boolean) {
    if (!this.isHoiRole(actor.role) && !this.isTeacherRole(actor.role)) {
      throw new BadRequestException('You do not have permission to deactivate learners.');
    }
    // A class teacher may only deactivate learners in a class they manage.
    if (!this.isHoiRole(actor.role)) {
      const lr = await this.dataSource.query(
        `SELECT stream_id FROM learners WHERE id::text = $1 AND tenant_id::text = $2 LIMIT 1`,
        [learnerId, tenantId],
      ).catch(() => []);
      if (!lr.length) throw new BadRequestException('Learner not found.');
      if (!(await this.actorOwnsStream(tenantId, actor, lr[0].stream_id))) {
        throw new BadRequestException('You can only manage learners in your own class.');
      }
    }
    await this.dataSource.query(
      `UPDATE learners SET is_active = $1 WHERE id::text = $2 AND tenant_id::text = $3`,
      [active, learnerId, tenantId],
    ).catch((e: any) => { throw new BadRequestException(e.message); });
    return { message: active ? 'Learner reactivated' : 'Learner deactivated', id: learnerId };
  }

  async updateTeacher(tenantId: string, actorRole: string, teacherId: string, dto: any) {
    if (!this.isHoiRole(actorRole)) {
      throw new BadRequestException('Only a school administrator can edit teachers.');
    }
    const fields: string[] = []; const vals: any[] = []; let i = 1;
    // users has no full_name column — split into first_name / last_name.
    if (dto.fullName !== undefined) {
      const parts = String(dto.fullName).trim().split(/\s+/);
      const firstName = parts.shift() || '';
      const lastName  = parts.join(' ') || '';
      fields.push(`first_name = $${i++}`); vals.push(firstName);
      fields.push(`last_name = $${i++}`);  vals.push(lastName);
    }
    const map: Record<string, string> = {
      email: 'email', phone: 'phone', subjects: 'subjects', role: 'role',
      streamId: 'stream_id',
    };
    for (const [k, col] of Object.entries(map)) {
      if (dto[k] !== undefined) {
        let v = dto[k];
        if (k === 'streamId' && (v === '' || v === null)) v = null;  // FK can't take ''
        fields.push(`${col} = $${i++}`); vals.push(v);
      }
    }
    // Gender, normalised to male/female (or null) to satisfy any CHECK constraint.
    if (dto.gender !== undefined) {
      const g = String(dto.gender || '').toLowerCase();
      fields.push(`gender = $${i++}`); vals.push(['male','female'].includes(g) ? g : null);
    }
    if (fields.length) {
      vals.push(teacherId, tenantId);
      await this.dataSource.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id::text = $${i++} AND tenant_id::text = $${i}`,
        vals,
      ).catch((e: any) => { throw new BadRequestException(e.message); });
    }
    // Per-stream subject assignments (also resyncs the flat subjects CSV + primary stream)
    if (dto.streamSubjects !== undefined) {
      await this.saveStreamSubjects(tenantId, teacherId, dto.streamSubjects);
    }

    // Class-teacher-of-stream assignments. classTeacherStreamIds = the streams this
    // teacher is the class teacher of. Each stream has exactly one class teacher, so
    // assigning here first clears this teacher from any stream they previously owned,
    // then claims the chosen streams (removing whoever held them before).
    if (dto.classTeacherStreamIds !== undefined) {
      const ids: string[] = Array.isArray(dto.classTeacherStreamIds) ? dto.classTeacherStreamIds.filter(Boolean) : [];
      const teacherName = (dto.fullName || '').trim() || null;
      // Release any streams this teacher currently owns but is no longer assigned to.
      await this.dataSource.query(
        `UPDATE streams SET class_teacher_id = NULL, class_teacher_name = NULL
          WHERE tenant_id::text = $1 AND class_teacher_id::text = $2`,
        [tenantId, teacherId],
      ).catch(() => null);
      // Claim the selected streams (taking ownership from any previous holder).
      for (const sid of ids) {
        await this.dataSource.query(
          `UPDATE streams SET class_teacher_id = $1, class_teacher_name = $2
            WHERE id::text = $3 AND tenant_id::text = $4`,
          [teacherId, teacherName, sid, tenantId],
        ).catch(() => null);
      }
    }
    return { message: 'Teacher updated', id: teacherId };
  }

  async setTeacherActive(tenantId: string, actorRole: string, actorId: string, teacherId: string, active: boolean) {
    if (!this.isHoiRole(actorRole)) {
      throw new BadRequestException('Only a school administrator can deactivate teachers.');
    }
    if (teacherId === actorId) throw new BadRequestException('You cannot deactivate your own account.');
    await this.dataSource.query(
      `UPDATE users SET is_active = $1 WHERE id::text = $2 AND tenant_id::text = $3`,
      [active, teacherId, tenantId],
    ).catch((e: any) => { throw new BadRequestException(e.message); });
    return { message: active ? 'Teacher reactivated' : 'Teacher deactivated', id: teacherId };
  }

  private isTeacherRole(role: string) {
    return ['class_teacher','subject_teacher','overall_class_teacher','hoi','dhois'].includes(role);
  }
  private isHoiRole(role: string) {
    return ['hoi','dhois','school_admin','tenant_owner','super_admin'].includes(role);
  }

  // ── Attendance ───────────────────────────────────────────
  getAttendance(tenantId: string, filters: any) {
    const qb = this.attRepo.createQueryBuilder('a')
      .where('a.tenant_id = :tenantId', { tenantId });
    if (filters.streamId)  qb.andWhere('a.stream_id = :sid',  { sid:  filters.streamId });
    if (filters.learnerId) qb.andWhere('a.learner_id = :lid', { lid:  filters.learnerId });
    if (filters.date)      qb.andWhere('a.date = :date',       { date: filters.date });
    // Date-range support for history
    if (filters.from)      qb.andWhere('a.date >= :from',      { from: filters.from });
    if (filters.to)        qb.andWhere('a.date <= :to',        { to:   filters.to });
    return qb.orderBy('a.date', 'DESC').getMany();
  }

  // Full attendance history for ONE learner, newest first
  async getLearnerHistory(tenantId: string, learnerId: string, from?: string, to?: string) {
    const qb = this.attRepo.createQueryBuilder('a')
      .where('a.tenant_id = :tenantId', { tenantId })
      .andWhere('a.learner_id = :lid', { lid: learnerId });
    if (from) qb.andWhere('a.date >= :from', { from });
    if (to)   qb.andWhere('a.date <= :to',   { to });
    const records = await qb.orderBy('a.date', 'DESC').getMany();

    // Trend summary
    const total   = records.length;
    const present = records.filter(r => r.status === 'present').length;
    const absent  = records.filter(r => r.status === 'absent').length;
    const late    = records.filter(r => r.status === 'late').length;
    const excused = records.filter(r => r.status === 'excused').length;
    const rate    = total ? Math.round((present / total) * 100) : 0;

    // Monthly breakdown for a trend line
    const byMonth: Record<string, { present: number; total: number }> = {};
    records.forEach(r => {
      const m = (r.date || '').slice(0, 7); // YYYY-MM
      if (!byMonth[m]) byMonth[m] = { present: 0, total: 0 };
      byMonth[m].total++;
      if (r.status === 'present') byMonth[m].present++;
    });
    const trend = Object.entries(byMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({ month, rate: v.total ? Math.round((v.present / v.total) * 100) : 0, days: v.total }));

    return {
      summary: { total, present, absent, late, excused, rate },
      trend,
      records,
    };
  }

  // Per-learner attendance rates across a whole stream (for ranking / at-risk lists)
  async getStreamAttendanceSummary(tenantId: string, streamId: string, from?: string, to?: string) {
    return this.dataSource.query(
      `SELECT a.learner_id AS "learnerId",
              l.first_name || ' ' || l.last_name AS "learnerName",
              l.admission_number AS "admissionNumber",
              COUNT(*) AS total,
              SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) AS present,
              SUM(CASE WHEN a.status='absent'  THEN 1 ELSE 0 END) AS absent,
              SUM(CASE WHEN a.status='late'    THEN 1 ELSE 0 END) AS late,
              ROUND(100.0 * SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0)) AS rate
       FROM attendance a
       LEFT JOIN learners l ON l.id = a.learner_id
       WHERE a.tenant_id = $1 AND a.stream_id = $2
         AND ($3::date IS NULL OR a.date >= $3)
         AND ($4::date IS NULL OR a.date <= $4)
       GROUP BY a.learner_id, l.first_name, l.last_name, l.admission_number
       ORDER BY rate ASC`,   // lowest attendance first = at-risk learners surface at top
      [tenantId, streamId, from || null, to || null],
    ).catch(() => []);
  }

  async bulkSaveAttendance(tenantId: string, dto: any, userId: string) {
    const records = dto.records.map((r: any) => ({
      tenantId,
      learnerId:  r.learnerId,
      streamId:   dto.streamId,
      date:       dto.date,
      status:     r.status,
      recordedBy: userId,
    }));

    // Upsert — delete existing for same stream+date then insert fresh
    await this.attRepo.delete({ tenantId, streamId: dto.streamId, date: dto.date });
    const entities = this.attRepo.create(records);
    await this.attRepo.save(entities);
    return { message: 'Attendance saved', count: records.length };
  }

  // ── Timetable ────────────────────────────────────────────
  async getTimetable(tenantId: string, streamId: string) {
    // Returns the KICD timetable for a stream from the database
    return this.dataSource.query(
      `SELECT id, day, period_label AS "periodLabel", subject,
              teacher_id AS "teacherId", teacher_name AS "teacherName",
              day_order AS "dayOrder", period_order AS "periodOrder"
       FROM timetable_periods
       WHERE tenant_id = $1 AND stream_id = $2
       ORDER BY day_order, period_order`,
      [tenantId, streamId],
    ).catch(() => []);
  }

  // Assign (or replace) a single lesson slot — links subject + teacher to a period
  async assignLesson(tenantId: string, dto: any) {
    // Remove any existing lesson in this stream/day/period, then insert the new one
    await this.dataSource.query(
      `DELETE FROM timetable_periods
       WHERE tenant_id = $1 AND stream_id = $2 AND day = $3 AND period_label = $4`,
      [tenantId, dto.streamId, dto.day, dto.periodLabel],
    ).catch(() => null);

    await this.dataSource.query(
      `INSERT INTO timetable_periods
         (tenant_id, stream_id, day, period_label, subject, teacher_id, teacher_name, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [tenantId, dto.streamId, dto.day, dto.periodLabel, dto.subject, dto.teacherId || null, dto.teacherName || null],
    ).catch(() => null);

    return { message: 'Lesson assigned', ...dto };
  }

  async clearLesson(tenantId: string, dto: any) {
    await this.dataSource.query(
      `DELETE FROM timetable_periods
       WHERE tenant_id = $1 AND stream_id = $2 AND day = $3 AND period_label = $4`,
      [tenantId, dto.streamId, dto.day, dto.periodLabel],
    ).catch(() => null);
    return { message: 'Lesson cleared' };
  }

  // Auto-generate KICD-compliant timetables for one/all streams (deterministic solver).
  async autoGenerateTimetable(tenantId: string, streamIds: string[] | null) {
    const solver = new AutoTimetabler(this.dataSource);
    return solver.generate(tenantId, streamIds && streamIds.length ? streamIds : null);
  }

  // Whole-school master/block grid: every stream's lessons in one view.
  async masterTimetable(tenantId: string) {
    const solver = new AutoTimetabler(this.dataSource);
    return solver.masterGrid(tenantId);
  }

  // A teacher's personal schedule — every lesson they teach, across streams
  async getTeacherTimetable(tenantId: string, teacherId: string) {
    return this.dataSource.query(
      `SELECT tp.day, tp.period_label AS "periodLabel", tp.subject,
              tp.period_order AS "periodOrder", tp.day_order AS "dayOrder",
              s.name AS "streamName", s.grade_level AS "gradeLevel"
       FROM timetable_periods tp
       LEFT JOIN streams s ON s.id = tp.stream_id
       WHERE tp.tenant_id = $1 AND tp.teacher_id = $2
       ORDER BY tp.day_order, tp.period_order`,
      [tenantId, teacherId],
    ).catch(() => []);
  }

  // ── Dashboard summary ─────────────────────────────────────
  async getDashboard(tenantId: string) {
    const [totalLearners, totalStreams, totalTeachers, pendingApprovals, openIncidents] = await Promise.all([
      this.learnerRepo.count({ where: { tenantId, isActive: true } }),
      this.streamRepo.count({ where: { tenantId } }),
      this.dataSource.query(
        `SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND role IN ('class_teacher','subject_teacher','overall_class_teacher','hoi','dhois','school_admin','tenant_owner','bursar','games_dept')`,
        [tenantId],
      ).then(r => parseInt(r[0]?.count||'0')).catch(()=>0),
      this.dataSource.query(`SELECT COUNT(*) FROM schemes_of_work WHERE tenant_id = $1 AND status = 'submitted'`, [tenantId]).then(r => parseInt(r[0]?.count||'0')).catch(()=>0),
      this.dataSource.query(`SELECT COUNT(*) FROM incidents WHERE tenant_id = $1 AND status = 'open'`, [tenantId]).then(r => parseInt(r[0]?.count||'0')).catch(()=>0),
    ]);

    // Staff gender split (for the dashboard staff card) — includes teaching staff and admins.
    const teacherGender = await this.dataSource.query(
      `SELECT COUNT(*) FILTER (WHERE LOWER(gender) IN ('male','m'))   AS "maleTeachers",
              COUNT(*) FILTER (WHERE LOWER(gender) IN ('female','f')) AS "femaleTeachers"
         FROM users WHERE tenant_id = $1
           AND role IN ('class_teacher','subject_teacher','overall_class_teacher','hoi','dhois','school_admin','tenant_owner','bursar','games_dept')`,
      [tenantId],
    ).then(r => ({ male: parseInt(r[0]?.maleTeachers||'0'), female: parseInt(r[0]?.femaleTeachers||'0') })).catch(() => ({ male: 0, female: 0 }));
    const maleTeachers = teacherGender.male;
    const femaleTeachers = teacherGender.female;

    // Attendance rate (present / total records) over the last 30 days
    const attendanceRate = await this.dataSource.query(
      `SELECT ROUND(100.0 * SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0)) AS rate
       FROM attendance WHERE tenant_id = $1 AND date >= CURRENT_DATE - INTERVAL '30 days'`,
      [tenantId],
    ).then(r => parseInt(r[0]?.rate||'0')).catch(()=>0);

    // Fees collected (sum of amount_paid)
    const feesCollected = await this.dataSource.query(
      `SELECT COALESCE(SUM(amount_paid),0) AS total FROM invoices WHERE tenant_id = $1`,
      [tenantId],
    ).then(r => parseFloat(r[0]?.total||'0')).catch(()=>0);

    const newAdmissions = await this.learnerRepo.count({ where: { tenantId, isActive: true } }).catch(()=>0);

    // Item 11: learner gender split + total school population
    const genderRows = await this.dataSource.query(
      `SELECT LOWER(COALESCE(gender,'')) AS gender, COUNT(*) AS n
       FROM learners WHERE tenant_id::text = $1 AND is_active = true
       GROUP BY LOWER(COALESCE(gender,''))`,
      [tenantId],
    ).catch(() => []);
    let boys = 0, girls = 0, unspecified = 0;
    for (const r of genderRows) {
      const n = parseInt(r.n || '0');
      if (r.gender === 'male' || r.gender === 'm' || r.gender === 'boy') boys += n;
      else if (r.gender === 'female' || r.gender === 'f' || r.gender === 'girl') girls += n;
      else unspecified += n;
    }
    const totalPopulation = boys + girls + unspecified;

    // Item 10: count parents by UNIQUE phone number (avoid double-count)
    const parentCount = await this.dataSource.query(
      `SELECT COUNT(DISTINCT NULLIF(TRIM(guardian_phone), '')) AS n
       FROM learners WHERE tenant_id::text = $1 AND is_active = true AND guardian_phone IS NOT NULL`,
      [tenantId],
    ).then(r => parseInt(r[0]?.n || '0')).catch(() => 0);

    // ── Top performing classes (real): average % per stream from assessment_results ──
    const topClasses = await this.dataSource.query(
      `SELECT s.name AS name, ROUND(AVG(ar.percent)) AS score
         FROM assessment_results ar JOIN streams s ON s.id::text = ar.stream_id::text
        WHERE ar.tenant_id::text = $1 AND ar.percent IS NOT NULL
        GROUP BY s.name HAVING COUNT(*) > 0
        ORDER BY score DESC LIMIT 5`,
      [tenantId],
    ).then((r: any[]) => r.map(x => ({ name: x.name, score: Math.round(Number(x.score)) }))).catch(() => []);

    // ── Upcoming events (real): exams/assessments dated today or later ──
    const upcomingEvents = await this.dataSource.query(
      `SELECT name, exam_type AS "examType", start_date AS "startDate", term
         FROM exams
        WHERE tenant_id::text = $1 AND start_date IS NOT NULL AND start_date >= CURRENT_DATE
        ORDER BY start_date ASC LIMIT 5`,
      [tenantId],
    ).catch(() => []);

    // ── Assessment upload progress (real): for each recent assessment, how many learners
    // have marks vs the school population, so admins see completion at a glance. ──
    const assessmentProgress = await this.dataSource.query(
      `SELECT e.id, e.name, e.term, e.exam_type AS "examType",
              (SELECT COUNT(DISTINCT ar.learner_id) FROM assessment_results ar
                WHERE ar.tenant_id::text = $1 AND ar.exam_id::text = e.id::text) AS "marksEntered",
              (SELECT COUNT(*) FROM learners l WHERE l.tenant_id::text = $1 AND l.is_active = true) AS "totalLearners"
         FROM exams e WHERE e.tenant_id::text = $1
        ORDER BY e.created_at DESC LIMIT 6`,
      [tenantId],
    ).then((r: any[]) => r.map(x => {
      const entered = Number(x.marksEntered) || 0;
      const total = Number(x.totalLearners) || 0;
      return { id: x.id, name: x.name, term: x.term, examType: x.examType, entered, total,
        percent: total ? Math.round((entered / total) * 100) : 0 };
    })).catch(() => []);

    // ── Enrollment trend (real): cumulative active learners by month, last 6 months ──
    const enrollmentRows = await this.dataSource.query(
      `WITH months AS (
         SELECT generate_series(date_trunc('month', CURRENT_DATE) - interval '5 months',
                                date_trunc('month', CURRENT_DATE), interval '1 month') AS m
       )
       SELECT to_char(months.m, 'Mon') AS label,
              (SELECT COUNT(*) FROM learners l
                WHERE l.tenant_id::text = $1
                  AND COALESCE(l.admission_date, l.created_at::date) <= (months.m + interval '1 month - 1 day')
              )::int AS total
         FROM months ORDER BY months.m ASC`,
      [tenantId],
    ).then((r: any[]) => r.map(x => ({ label: x.label, total: Number(x.total) || 0 }))).catch(() => []);
    const enrollmentTrend = enrollmentRows;

    return {
      totalLearners, totalStreams, totalTeachers,
      attendanceRate, feesCollected, newAdmissions,
      pendingApprovals, openIncidents,
      boys, girls, unspecified, totalPopulation, parentCount,
      topClasses, upcomingEvents, assessmentProgress,
      enrollmentTrend,
      maleTeachers, femaleTeachers,
    };
  }

  // ── Teacher: assessment upload progress (own classes) ────────
  // For a class/subject teacher: per created assessment, how many of THEIR learners have
  // marks entered vs the total in their classes. Scoped to streams they own or teach in.
  async getTeacherAssessmentProgress(user: any) {
    const tenantId = user.tenantId;
    if (this.isHoiRole(user.role)) {
      // Admins use the school-wide version on the main dashboard.
      return [];
    }
    // Streams the teacher owns (class teacher) or is assigned to teach in.
    const owned = await this.dataSource.query(
      `SELECT id::text AS id FROM streams WHERE tenant_id::text = $1 AND class_teacher_id::text = $2`,
      [tenantId, user.id],
    ).catch(() => []);
    const assigned = await this.dataSource.query(
      `SELECT DISTINCT stream_id::text AS id FROM teacher_stream_subjects
        WHERE tenant_id::text = $1 AND teacher_id::text = $2`,
      [tenantId, user.id],
    ).catch(() => []);
    const streamIds = Array.from(new Set([...owned.map((r: any) => r.id), ...assigned.map((r: any) => r.id)]));
    if (!streamIds.length) return [];

    // Total learners across the teacher's streams.
    const totalRow = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM learners
        WHERE tenant_id::text = $1 AND is_active = true AND stream_id::text = ANY($2::text[])`,
      [tenantId, streamIds],
    ).catch(() => [{ n: 0 }]);
    const totalLearners = totalRow[0]?.n || 0;

    // Per assessment: distinct learners (in the teacher's streams) who have marks.
    const rows = await this.dataSource.query(
      `SELECT e.id, e.name, e.term, e.exam_type AS "examType",
              (SELECT COUNT(DISTINCT ar.learner_id) FROM assessment_results ar
                WHERE ar.tenant_id::text = $1 AND ar.exam_id::text = e.id::text
                  AND ar.stream_id::text = ANY($2::text[])) AS "marksEntered"
         FROM exams e WHERE e.tenant_id::text = $1
        ORDER BY e.created_at DESC LIMIT 6`,
      [tenantId, streamIds],
    ).catch(() => []);

    return rows.map((x: any) => {
      const entered = Number(x.marksEntered) || 0;
      return { id: x.id, name: x.name, term: x.term, examType: x.examType,
        entered, total: totalLearners, percent: totalLearners ? Math.round((entered / totalLearners) * 100) : 0 };
    });
  }

  // ── Teachers ─────────────────────────────────────────────
  async getTeachers(tenantId: string) {
    return this.dataSource.query(
      `SELECT id, first_name AS "firstName", last_name AS "lastName", email, phone,
              role, stream_name AS "streamName", id_number AS "idNumber",
              tsc_number AS "tscNumber", gender, subjects
       FROM users
       WHERE tenant_id = $1 AND role IN ('class_teacher','subject_teacher','overall_class_teacher','hoi','dhois')
       ORDER BY first_name`,
      [tenantId],
    ).then(rows => rows.map((r: any) => ({
      ...r,
      // simple-array comes back as comma string from raw SQL; normalise to array
      subjects: typeof r.subjects === 'string' && r.subjects.length
        ? r.subjects.split(',') : (Array.isArray(r.subjects) ? r.subjects : []),
    }))).catch(() => []);
  }

  // Onboard a teacher with the subjects they teach
  async createTeacher(tenantId: string, schoolId: string, dto: any) {
    if (!dto.email || !dto.email.trim()) {
      throw new BadRequestException('Email is required — it becomes the teacher\'s login username.');
    }
    const subjectsCsv = Array.isArray(dto.subjects) ? dto.subjects.join(',') : (dto.subjects || '');

    // Generate a secure, human-shareable password (e.g. "Kx7p-9Qm-3Rt")
    const gen = () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
      const block = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      return `${block()}-${block()}-${block()}`;
    };
    const plainPassword = gen();
    const passwordHash  = await bcrypt.hash(plainPassword, 12);

    // Email is the teacher's username (now required).
    const email = dto.email.toLowerCase().trim();

    // Block duplicate emails (clean error instead of a DB crash)
    const existing = await this.dataSource.query(`SELECT id FROM users WHERE email = $1`, [email]).catch(() => []);
    if (existing.length) {
      throw new BadRequestException('A user with this email already exists. Use a different email.');
    }

    const rows = await this.dataSource.query(
      `INSERT INTO users
         (email, password_hash, first_name, last_name, phone, gender, role,
          tenant_id, school_id, stream_id, stream_name, id_number, tsc_number,
          subjects, is_active, email_verified, must_change_password, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,false,true,NOW(),NOW())
       RETURNING id, email, first_name AS "firstName", last_name AS "lastName", subjects`,
      [
        email, passwordHash,
        dto.firstName, dto.lastName, dto.phone || null,
        (['male','female'].includes(String(dto.gender||'').toLowerCase()) ? String(dto.gender).toLowerCase() : null),
        dto.role || 'subject_teacher',
        tenantId, schoolId, dto.streamId || null, dto.streamName || null,
        dto.idNumber || null, dto.tscNumber || null, subjectsCsv,
      ],
    ).catch((e: any) => { throw e; });

    // Persist per-stream subject assignments (if provided) + sync the flat CSV.
    await this.saveStreamSubjects(tenantId, rows[0].id, dto.streamSubjects);

    // Return the plain password ONCE so the admin can share it. Never stored in plain text.
    return {
      message: 'Teacher onboarded',
      teacher: rows[0],
      credentials: { username: email, password: plainPassword },
    };
  }

  /**
   * Save which learning areas a teacher teaches in which stream.
   * `streamSubjects` = [{ streamId, subjects: string[] }]. Replaces all existing rows
   * for the teacher. Also rebuilds users.subjects (union) and sets a primary stream_id
   * so older code paths keep working.
   */
  async saveStreamSubjects(tenantId: string, teacherId: string, streamSubjects?: { streamId: string; subjects: string[] }[]) {
    if (!Array.isArray(streamSubjects)) return; // nothing supplied → leave existing data untouched
    await this.dataSource.query(
      `DELETE FROM teacher_stream_subjects WHERE tenant_id::text = $1 AND teacher_id::text = $2`,
      [tenantId, teacherId],
    ).catch(() => null);

    const unionSubjects = new Set<string>();
    let primaryStream: string | null = null;
    let primaryStreamName: string | null = null;

    for (const ss of streamSubjects) {
      if (!ss?.streamId || !Array.isArray(ss.subjects)) continue;
      if (!primaryStream) primaryStream = ss.streamId;
      for (const subj of ss.subjects) {
        const s = String(subj).trim();
        if (!s) continue;
        unionSubjects.add(s);
        await this.dataSource.query(
          `INSERT INTO teacher_stream_subjects (tenant_id, teacher_id, stream_id, subject, created_at)
           VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (teacher_id, stream_id, subject) DO NOTHING`,
          [tenantId, teacherId, ss.streamId, s],
        ).catch(() => null);
      }
    }
    if (primaryStream) {
      const sn = await this.dataSource.query(`SELECT name FROM streams WHERE id::text = $1 LIMIT 1`, [primaryStream]).catch(() => []);
      primaryStreamName = sn[0]?.name || null;
    }
    // Sync the flat CSV + primary stream on the user record
    await this.dataSource.query(
      `UPDATE users SET subjects = $1, stream_id = $2, stream_name = $3 WHERE id::text = $4 AND tenant_id::text = $5`,
      [Array.from(unionSubjects).join(','), primaryStream, primaryStreamName, teacherId, tenantId],
    ).catch(() => null);
  }

  // Per-stream subject assignments for one teacher (for the edit form).
  async getTeacherStreamSubjects(tenantId: string, teacherId: string) {
    const rows = await this.dataSource.query(
      `SELECT stream_id::text AS "streamId", subject FROM teacher_stream_subjects
        WHERE tenant_id::text = $1 AND teacher_id::text = $2`,
      [tenantId, teacherId],
    ).catch(() => []);
    const byStream: Record<string, string[]> = {};
    rows.forEach((r: any) => { (byStream[r.streamId] = byStream[r.streamId] || []).push(r.subject); });
    return Object.entries(byStream).map(([streamId, subjects]) => ({ streamId, subjects }));
  }

  // ── Subject allocation (senior school) ───────────────────
  async allocateSubjects(tenantId: string, dto: any) {
    // Persist which subjects belong to a pathway/track for this school
    for (const subject of (dto.subjects || [])) {
      await this.dataSource.query(
        `INSERT INTO subject_allocations (tenant_id, pathway, track, subject, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT DO NOTHING`,
        [tenantId, dto.pathway, dto.track, subject],
      ).catch(() => null);
    }
    return { message: 'Subjects allocated', pathway: dto.pathway, track: dto.track, count: (dto.subjects||[]).length };
  }

  // ── Teacher allocation ───────────────────────────────────
  async getAllocations(tenantId: string) {
    return this.dataSource.query(
      `SELECT ta.id, ta.subject,
              u.first_name || ' ' || u.last_name AS "teacherName",
              s.name AS "streamName"
       FROM teacher_allocations ta
       LEFT JOIN users   u ON u.id = ta.teacher_id
       LEFT JOIN streams s ON s.id = ta.stream_id
       WHERE ta.tenant_id = $1
       ORDER BY u.first_name`,
      [tenantId],
    ).catch(() => []);
  }

  async allocateTeacher(tenantId: string, dto: any) {
    await this.dataSource.query(
      `INSERT INTO teacher_allocations (tenant_id, teacher_id, subject, stream_id, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [tenantId, dto.teacherId, dto.subject, dto.streamId],
    ).catch(() => null);
    return { message: 'Teacher allocated', ...dto };
  }
}

// ── Controller ────────────────────────────────────────────
@Controller('academic')
@UseGuards(JwtAuthGuard)
export class AcademicController {
  constructor(private academicService: AcademicService) {}

  // Dashboard
  @Get('dashboard')
  dashboard(@Request() req: any) {
    return this.academicService.getDashboard(req.user.tenantId);
  }

  // Streams
  @Get('streams')
  getStreams(@Request() req: any) {
    return this.academicService.getStreams(req.user.tenantId);
  }

  @Get('streams/:id')
  getStream(@Request() req: any, @Param('id') id: string) {
    return this.academicService.getStream(req.user.tenantId, id);
  }

  @Post('streams')
  createStream(@Request() req: any, @Body() dto: any) {
    return this.academicService.createStream(req.user.tenantId, req.user.schoolId, dto);
  }

  @Post('classes')
  createClassWithStreams(@Request() req: any, @Body() dto: any) {
    return this.academicService.createClassWithStreams(req.user.tenantId, req.user.schoolId, dto);
  }

  @Patch('streams/:id')
  updateStream(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.academicService.updateStream(req.user.tenantId, id, dto);
  }

  // Learners
  @Get('learners')
  getLearners(@Request() req: any, @Query() q: any) {
    return this.academicService.getLearners(req.user.tenantId, q);
  }

  @Get('streams/:id/learners')
  getLearnersByStream(@Request() req: any, @Param('id') id: string) {
    return this.academicService.getLearnersByStream(req.user.tenantId, id);
  }

  @Post('learners')
  createLearner(@Request() req: any, @Body() dto: any) {
    return this.academicService.createLearner(req.user.tenantId, req.user.schoolId, dto, req.user);
  }

  @Post('learners/bulk')
  bulkCreateLearners(@Request() req: any, @Body() dto: any) {
    return this.academicService.bulkCreate(req.user.tenantId, req.user.schoolId, dto, req.user.id);
  }

  @Delete('learners/:id')
  deleteLearner(@Request() req: any, @Param('id') id: string) {
    return this.academicService.deleteLearner(req.user.tenantId, id, req.user);
  }

  @Patch('learners/:id')
  updateLearner(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.academicService.updateLearner(req.user.tenantId, id, req.user, dto);
  }

  @Get('learners/:id/parent-access')
  getParentAccess(@Request() req: any, @Param('id') id: string) {
    return this.academicService.getParentAccess(req.user.tenantId, id);
  }

  @Post('learners/:id/parent-access')
  parentAccess(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.academicService.parentAccess(req.user.tenantId, req.user.schoolId, id, req.user, dto);
  }

  @Patch('learners/:id/active')
  setLearnerActive(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.academicService.setLearnerActive(req.user.tenantId, id, req.user, dto.active !== false);
  }

  // Attendance
  @Get('attendance')
  getAttendance(@Request() req: any, @Query() q: any) {
    return this.academicService.getAttendance(req.user.tenantId, q);
  }

  // Attendance history + trend for one learner
  @Get('attendance/learner/:learnerId')
  getLearnerHistory(@Request() req: any, @Param('learnerId') learnerId: string, @Query() q: any) {
    return this.academicService.getLearnerHistory(req.user.tenantId, learnerId, q.from, q.to);
  }

  // Per-learner attendance rates across a stream (at-risk ranking)
  @Get('attendance/summary')
  getStreamSummary(@Request() req: any, @Query() q: any) {
    return this.academicService.getStreamAttendanceSummary(req.user.tenantId, q.streamId, q.from, q.to);
  }

  @Post('attendance/bulk')
  bulkSaveAttendance(@Request() req: any, @Body() dto: any) {
    return this.academicService.bulkSaveAttendance(req.user.tenantId, dto, req.user.id);
  }

  // Assessment Results
  @Post('assessment-results/bulk')
  bulkSaveResults(@Request() req: any, @Body() dto: any) {
    return this.academicService.bulkSaveResults(req.user, dto);
  }

  @Get('mark-list')
  getMarkList(@Request() req: any, @Query() q: any) {
    return this.academicService.getMarkList(req.user.tenantId, q.streamId, q.term, q.examType, q.examId);
  }

  @Get('analytics/stream')
  getStreamAnalytics(@Request() req: any, @Query() q: any) {
    return this.academicService.getStreamAnalytics(req.user, q.streamId, q.term);
  }

  @Get('analytics/school')
  getSchoolAnalytics(@Request() req: any, @Query() q: any) {
    return this.academicService.getSchoolAnalytics(req.user, q.gradeLevel, q.term);
  }

  @Get('analytics/subject')
  getSubjectTeacherAnalytics(@Request() req: any, @Query() q: any) {
    return this.academicService.getSubjectTeacherAnalytics(req.user, q.subject, q.term);
  }

  @Get('analytics/parent')
  getParentAnalytics(@Request() req: any, @Query() q: any) {
    return this.academicService.getParentAnalytics(req.user, q.learnerId, q.term);
  }

  @Get('my-children')
  getMyChildren(@Request() req: any) {
    return this.academicService.getMyChildren(req.user);
  }

  @Get('my-assessment-progress')
  getTeacherAssessmentProgress(@Request() req: any) {
    return this.academicService.getTeacherAssessmentProgress(req.user);
  }

  @Get('term-mark-sheet')
  getTermMarkSheet(@Request() req: any, @Query() q: any) {
    return this.academicService.getTermMarkSheet(req.user.tenantId, q.streamId, q.term);
  }

  @Get('exams')
  getExams(@Request() req: any) {
    return this.academicService.getExams(req.user.tenantId);
  }

  @Post('exams')
  createExam(@Request() req: any, @Body() dto: any) {
    return this.academicService.createExam(req.user.tenantId, req.user.role, dto);
  }

  @Delete('exams/:id')
  deleteExam(@Request() req: any, @Param('id') id: string, @Query() q: any) {
    return this.academicService.deleteExam(req.user.tenantId, req.user.role, id, q.force === 'true');
  }

  // Timetable
  @Get('timetable')
  getTimetable(@Request() req: any, @Query('streamId') streamId: string) {
    return this.academicService.getTimetable(req.user.tenantId, streamId);
  }

  @Post('timetable')
  assignLesson(@Request() req: any, @Body() dto: any) {
    return this.academicService.assignLesson(req.user.tenantId, dto);
  }

  @Post('timetable/clear')
  clearLesson(@Request() req: any, @Body() dto: any) {
    return this.academicService.clearLesson(req.user.tenantId, dto);
  }

  // Auto-generate KICD block timetable(s). Body: { streamIds?: string[] } — omit for all streams.
  @Post('timetable/auto-generate')
  autoGenerate(@Request() req: any, @Body() dto: any) {
    return this.academicService.autoGenerateTimetable(req.user.tenantId, dto?.streamIds || null);
  }

  // Whole-school master/block timetable (all streams).
  @Get('timetable/master')
  masterTimetable(@Request() req: any) {
    return this.academicService.masterTimetable(req.user.tenantId);
  }

  // A teacher's own schedule across all streams
  @Get('my-timetable')
  myTimetable(@Request() req: any) {
    return this.academicService.getTeacherTimetable(req.user.tenantId, req.user.id);
  }

  // ── KICD timetable reference (official structure per grade band) ──
  // Returns the exact period structure, lesson duration, lessons/week, and
  // learning-area allocation for a grade level, straight from the MoE/KICD
  // guidelines. The timetable grid uses this so it strictly matches the doc.
  @Get('timetable/structure')
  timetableStructure(@Query('gradeLevel') gradeLevel: string) {
    const band = getGradeBand(gradeLevel || 'grade_7');
    return {
      gradeLevel, band,
      lessonsPerWeek:   getLessonsPerWeek(band),
      lessonDuration:   getLessonDurationMinutes(band),
      allowsDouble:     allowsDoubleLesson(band),
      periods:          getPeriodStructure(band),
      allocations:      getLearningAreaAllocations(band),
    };
  }

  // ── Curriculum Based Establishment (Section B) ──
  // streams = number of streams in the school. schoolType: 'primary' (G1–6) or 'junior' (G7–9).
  @Get('cbe')
  cbe(@Query('schoolType') schoolType: string, @Query('streams') streams: string) {
    const n = Math.max(1, parseInt(streams || '1', 10) || 1);
    if (schoolType === 'junior') return calculateJuniorCbe(n);
    return calculatePrimaryCbe(n);
  }

  // The timetabling committee roles (governance reference)
  @Get('timetable/committee')
  committee() {
    return { roles: TIMETABLING_COMMITTEE_ROLES };
  }

  // ── Admissions ───────────────────────────────────────────
  @Get('admissions')
  getAdmissions(@Request() req: any) {
    return this.academicService.getLearners(req.user.tenantId, {});
  }

  @Post('admissions')
  createAdmission(@Request() req: any, @Body() dto: any) {
    // A full admission creates a learner record with placement + guardian details
    return this.academicService.createLearner(req.user.tenantId, req.user.schoolId, {
      ...dto, status: dto.status || 'enrolled',
    });
  }

  // ── Teachers ─────────────────────────────────────────────
  @Get('teachers')
  getTeachers(@Request() req: any) {
    return this.academicService.getTeachers(req.user.tenantId);
  }

  @Get('teachers/:id/stream-subjects')
  getTeacherStreamSubjects(@Request() req: any, @Param('id') id: string) {
    return this.academicService.getTeacherStreamSubjects(req.user.tenantId, id);
  }

  @Post('teachers')
  createTeacher(@Request() req: any, @Body() dto: any) {
    return this.academicService.createTeacher(req.user.tenantId, req.user.schoolId, dto);
  }

  @Delete('teachers/:id')
  deleteTeacher(@Request() req: any, @Param('id') id: string) {
    return this.academicService.deleteTeacher(req.user.tenantId, req.user.role, id, req.user.id);
  }

  @Patch('teachers/:id')
  updateTeacher(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.academicService.updateTeacher(req.user.tenantId, req.user.role, id, dto);
  }

  @Patch('teachers/:id/active')
  setTeacherActive(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.academicService.setTeacherActive(req.user.tenantId, req.user.role, req.user.id, id, dto.active !== false);
  }

  @Post('teachers/transfer-hoi')
  transferHoi(@Request() req: any, @Body() dto: any) {
    return this.academicService.transferHoi(req.user.tenantId, req.user.role, req.user.id, dto.newHoiTeacherId);
  }

  // ── Subject allocation (senior school) ───────────────────
  @Post('subject-allocations')
  allocateSubjects(@Request() req: any, @Body() dto: any) {
    return this.academicService.allocateSubjects(req.user.tenantId, dto);
  }

  // ── Teacher allocation ───────────────────────────────────
  @Get('allocations')
  getAllocations(@Request() req: any) {
    return this.academicService.getAllocations(req.user.tenantId);
  }

  @Post('allocations')
  allocateTeacher(@Request() req: any, @Body() dto: any) {
    return this.academicService.allocateTeacher(req.user.tenantId, dto);
  }
}

// ── Import guard (defined in auth module, re-imported here) ──

// ── Module ───────────────────────────────────────────────
@Module({
  imports: [TypeOrmModule.forFeature([Stream, Learner, Attendance, AssessmentResult])],
  controllers: [AcademicController],
  providers:   [AcademicService],
  exports:     [AcademicService],
})
export class AcademicModule {}
