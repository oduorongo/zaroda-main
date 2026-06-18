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
              COALESCE(c.n, 0)::int AS "learnersCount"
       FROM streams s
       LEFT JOIN (
         SELECT stream_id::text AS sid, COUNT(*) AS n FROM learners
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

      // Streams where this user is the (overall) class teacher — full mark-list rights
      if (['class_teacher', 'overall_class_teacher'].includes(user.role)) {
        const crows = await this.dataSource.query(
          `SELECT id::text AS id FROM streams
           WHERE tenant_id::text = $1 AND class_teacher_id::text = $2`,
          [tenantId, user.id],
        ).catch(() => []);
        classTeacherStreams = crows.map((r: any) => r.id);
      }
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

      // Enforce per-record: a teacher may only save marks for a learning area in a
      // stream they're assigned to teach it (or their own class as class teacher).
      if (!teaches(r.subject || '', streamId)) {
        throw new BadRequestException(`You can only enter marks for learning areas you teach in your assigned classes (blocked: ${r.subject}).`);
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
  private isSenior(gradeLevel: string): boolean {
    return ['grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'].includes(gradeLevel || '');
  }

  // Class mark list: every learner × every subject for a stream/term, with totals & rank
  async getMarkList(tenantId: string, streamId: string, term?: string, examType?: string) {
    // Grade of the stream — decides whether points apply
    const sgrade = await this.dataSource.query(
      `SELECT grade_level FROM streams WHERE id::text = $1 LIMIT 1`, [streamId],
    ).catch(() => []);
    const gradeLevel = sgrade[0]?.grade_level || '';
    const usePoints = this.isSenior(gradeLevel);

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
       ORDER BY l.first_name`,
      [tenantId, streamId, term || null, examType || null],
    ).catch(() => []);

    // Group by learner → subjects, compute average % and (for senior) total points
    const byLearner: Record<string, any> = {};
    for (const r of rows) {
      if (!byLearner[r.learnerId]) {
        byLearner[r.learnerId] = {
          learnerId: r.learnerId, firstName: r.firstName, lastName: r.lastName,
          admissionNumber: r.admissionNumber, subjects: {}, totalPercent: 0, totalPoints: 0, count: 0,
        };
      }
      const e = byLearner[r.learnerId];
      const pts = (usePoints && r.percent != null) ? this.percentToPoints(Number(r.percent)) : null;
      e.subjects[r.subject] = { percent: r.percent, level: r.level, rawScore: r.rawScore, points: pts };
      if (r.percent != null) { e.totalPercent += Number(r.percent); e.count++; if (pts != null) e.totalPoints += pts; }
    }
    const list = Object.values(byLearner).map((e: any) => ({
      ...e,
      averagePercent: e.count ? Math.round(e.totalPercent / e.count) : 0,
      // Senior: total points across subjects + average points; else points stay null
      totalPoints: usePoints ? e.totalPoints : null,
      averagePoints: usePoints && e.count ? Math.round((e.totalPoints / e.count) * 10) / 10 : null,
    })).sort((a: any, b: any) =>
      usePoints ? (b.totalPoints - a.totalPoints) : (b.averagePercent - a.averagePercent),
    );
    list.forEach((e: any, i: number) => (e.rank = i + 1));
    return { gradeLevel, usePoints, learners: list };
  }

  // ── Exams ────────────────────────────────────────────────
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
      .where('l.tenant_id = :tenantId', { tenantId })
      .andWhere('l.is_active = true');

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
    // Teachers may only add learners to a class they own
    if (actor && this.isTeacherRole(actor.role) && !this.isHoiRole(actor.role)) {
      const ownStream = actor.streamId;
      if (!dto.streamId || dto.streamId !== ownStream) {
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
          const gen = () => {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
            const block = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
            return `${block()}-${block()}-${block()}`;
          };
          const plain = gen();
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

    // Teachers may only remove learners from their own class
    if (this.isTeacherRole(actor.role) && !this.isHoiRole(actor.role)) {
      if (learner.streamId !== actor.streamId) {
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
    // A class teacher may only edit learners in the class they manage.
    if (!this.isHoiRole(actor.role)) {
      const lr = await this.dataSource.query(
        `SELECT stream_id FROM learners WHERE id::text = $1 AND tenant_id::text = $2 LIMIT 1`,
        [learnerId, tenantId],
      ).catch(() => []);
      if (!lr.length) throw new BadRequestException('Learner not found.');
      if (String(lr[0].stream_id) !== String(actor.streamId)) {
        throw new BadRequestException('You can only edit learners in your own class.');
      }
    }
    const fields: string[] = []; const vals: any[] = []; let i = 1;
    const map: Record<string, string> = {
      fullName: 'full', firstName: 'first_name', lastName: 'last_name', gender: 'gender',
      gradeLevel: 'grade_level', streamId: 'stream_id', admissionNumber: 'admission_number',
      guardianPhone: 'guardian_phone', residence: 'residence',
    };
    // fullName splits into first/last
    if (dto.fullName) {
      const parts = String(dto.fullName).trim().split(/\s+/);
      fields.push(`first_name = $${i++}`); vals.push(parts.shift() || dto.fullName);
      fields.push(`last_name = $${i++}`); vals.push(parts.join(' ') || '');
    }
    for (const [k, col] of Object.entries(map)) {
      if (k === 'fullName' || k === 'firstName' || k === 'lastName') continue;
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

  async setLearnerActive(tenantId: string, learnerId: string, actor: any, active: boolean) {
    if (!this.isHoiRole(actor.role) && !this.isTeacherRole(actor.role)) {
      throw new BadRequestException('You do not have permission to deactivate learners.');
    }
    // A class teacher may only deactivate learners in the class they manage.
    if (!this.isHoiRole(actor.role)) {
      const lr = await this.dataSource.query(
        `SELECT stream_id FROM learners WHERE id::text = $1 AND tenant_id::text = $2 LIMIT 1`,
        [learnerId, tenantId],
      ).catch(() => []);
      if (!lr.length) throw new BadRequestException('Learner not found.');
      if (String(lr[0].stream_id) !== String(actor.streamId)) {
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
    const map: Record<string, string> = {
      fullName: 'full_name', email: 'email', phone: 'phone', subjects: 'subjects', role: 'role',
      streamId: 'stream_id',
    };
    for (const [k, col] of Object.entries(map)) {
      if (dto[k] !== undefined) {
        let v = dto[k];
        if (k === 'streamId' && (v === '' || v === null)) v = null;  // FK can't take ''
        fields.push(`${col} = $${i++}`); vals.push(v);
      }
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
        `SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND role IN ('class_teacher','subject_teacher','overall_class_teacher','hoi','dhois')`,
        [tenantId],
      ).then(r => parseInt(r[0]?.count||'0')).catch(()=>0),
      this.dataSource.query(`SELECT COUNT(*) FROM schemes_of_work WHERE tenant_id = $1 AND status = 'submitted'`, [tenantId]).then(r => parseInt(r[0]?.count||'0')).catch(()=>0),
      this.dataSource.query(`SELECT COUNT(*) FROM incidents WHERE tenant_id = $1 AND status = 'open'`, [tenantId]).then(r => parseInt(r[0]?.count||'0')).catch(()=>0),
    ]);

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

    return {
      totalLearners, totalStreams, totalTeachers,
      attendanceRate, feesCollected, newAdmissions,
      pendingApprovals, openIncidents,
      boys, girls, unspecified, totalPopulation, parentCount,
    };
  }

  // ── Teachers ─────────────────────────────────────────────
  async getTeachers(tenantId: string) {
    return this.dataSource.query(
      `SELECT id, first_name AS "firstName", last_name AS "lastName", email, phone,
              role, stream_name AS "streamName", id_number AS "idNumber",
              tsc_number AS "tscNumber", subjects
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
         (email, password_hash, first_name, last_name, phone, role,
          tenant_id, school_id, stream_id, stream_name, id_number, tsc_number,
          subjects, is_active, email_verified, must_change_password, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,false,true,NOW(),NOW())
       RETURNING id, email, first_name AS "firstName", last_name AS "lastName", subjects`,
      [
        email, passwordHash,
        dto.firstName, dto.lastName, dto.phone || null,
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
    return this.academicService.getMarkList(req.user.tenantId, q.streamId, q.term, q.examType);
  }

  @Get('exams')
  getExams(@Request() req: any) {
    return this.academicService.getExams(req.user.tenantId);
  }

  @Post('exams')
  createExam(@Request() req: any, @Body() dto: any) {
    return this.academicService.createExam(req.user.tenantId, req.user.role, dto);
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
