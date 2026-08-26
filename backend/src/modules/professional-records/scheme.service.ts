import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SchemeOfWork, SchemeWeek, TeacherDocument, PrAudit, SubjectCatalogue } from './entities';
import { AiGeneratorService } from './ai-generator.service';
import { GenerateSchemeDto, ReviewRecordDto } from './dto';

@Injectable()
export class SchemeService {
  constructor(
    @InjectRepository(SchemeOfWork) private schemeRepo: Repository<SchemeOfWork>,
    @InjectRepository(SchemeWeek) private weekRepo: Repository<SchemeWeek>,
    @InjectRepository(TeacherDocument) private docRepo: Repository<TeacherDocument>,
    @InjectRepository(PrAudit) private auditRepo: Repository<PrAudit>,
    @InjectRepository(SubjectCatalogue) private subjectRepo: Repository<SubjectCatalogue>,
    private aiGenerator: AiGeneratorService,
    private dataSource: DataSource,
  ) {}

  // subject_catalogue is never seeded elsewhere in this app — every other module treats
  // subjects as free-text strings (teacher_stream_subjects.subject etc). So rather than
  // require a pre-populated catalogue, self-heal it here: derive the real subject names
  // this user actually teaches from teacher_stream_subjects, and find-or-create a
  // subject_catalogue row per name so it has a stable id to hang scheme records off.
  async listSubjectsForUser(tenantId: string, schoolId: string, teacherId: string, role: string) {
    const isPriv = ['hoi', 'dhois', 'school_admin', 'tenant_owner'].includes(role);

    let names: string[];
    if (isPriv) {
      const rows = await this.dataSource.query(
        `SELECT DISTINCT subject FROM teacher_stream_subjects WHERE tenant_id::text = $1`,
        [tenantId],
      ).catch(() => []);
      names = rows.map((r: any) => r.subject);
    } else {
      const ownRows = await this.dataSource.query(
        `SELECT DISTINCT subject FROM teacher_stream_subjects
          WHERE tenant_id::text = $1 AND teacher_id::text = $2`,
        [tenantId, teacherId],
      ).catch(() => []);
      // Class teacher of a stream may generate for any subject taught in that stream.
      const classRows = await this.dataSource.query(
        `SELECT DISTINCT tss.subject FROM teacher_stream_subjects tss
           JOIN streams s ON s.id = tss.stream_id
          WHERE s.tenant_id::text = $1 AND s.class_teacher_id::text = $2`,
        [tenantId, teacherId],
      ).catch(() => []);
      names = Array.from(new Set([...ownRows, ...classRows].map((r: any) => r.subject)));
    }
    names = names.filter(Boolean);
    if (!names.length) return [];

    const result: SubjectCatalogue[] = [];
    for (const name of names) {
      let row = await this.subjectRepo.findOne({ where: { tenantId, name } });
      if (!row) {
        row = await this.subjectRepo.save(this.subjectRepo.create({
          tenantId, schoolId, name, category: 'core', gradeBand: 'primary',
        }));
      }
      result.push(row);
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Public accessor so the controller can query for the pending-approvals dashboard
  // without reaching into a private repo field.
  findByStatus(tenantId: string, status: string) {
    return this.schemeRepo.find({ where: { tenantId, status }, order: { submittedAt: 'ASC' } });
  }

  // A teacher may only generate a scheme for a (stream, subject) they are actually
  // assigned to teach, or for any subject in a stream where they are the class teacher.
  // HOI/admin roles generating on a teacher's behalf are exempt.
  private async assertAssignedToTeach(
    tenantId: string, teacherId: string, role: string, streamId: string, subjectName: string,
  ) {
    if (['hoi', 'dhois', 'school_admin', 'tenant_owner'].includes(role)) return;

    const classTeacherRows = await this.dataSource.query(
      `SELECT id FROM streams WHERE tenant_id::text = $1 AND id::text = $2 AND class_teacher_id::text = $3`,
      [tenantId, streamId, teacherId],
    ).catch(() => []);
    if (classTeacherRows.length > 0) return;

    const assignmentRows = await this.dataSource.query(
      `SELECT subject FROM teacher_stream_subjects
        WHERE tenant_id::text = $1 AND teacher_id::text = $2 AND stream_id::text = $3`,
      [tenantId, teacherId, streamId],
    ).catch(() => []);
    const teaches = assignmentRows.some((r: any) =>
      String(r.subject).toLowerCase().includes(subjectName.toLowerCase()) ||
      subjectName.toLowerCase().includes(String(r.subject).toLowerCase()),
    );
    if (!teaches) {
      throw new BadRequestException('You are not assigned to teach this subject for this class.');
    }
  }

  // ── GENERATE SCHEME OF WORK (AI) ──────────────────────────
  async generate(tenantId: string, schoolId: string, teacherId: string, role: string, dto: GenerateSchemeDto) {
    await this.assertAssignedToTeach(tenantId, teacherId, role, dto.streamId, dto.subjectName);

    const existing = await this.schemeRepo.findOne({
      where: {
        tenantId, teacherId, streamId: dto.streamId, subjectId: dto.subjectId,
        academicYear: dto.academicYear, term: dto.term,
      },
    });
    if (existing && existing.status !== 'rejected') {
      throw new BadRequestException(
        `A scheme of work already exists for this subject/stream/term. Status: ${existing.status}`,
      );
    }

    const totalWeeks = dto.totalWeeks || 12;
    const periodsPerWeek = dto.periodsPerWeek || 5;

    const { weeks, title, tokens } = await this.aiGenerator.generateSchemeOfWork({
      subjectName: dto.subjectName,
      gradeLevel: dto.gradeLevel,
      term: dto.term,
      academicYear: dto.academicYear,
      totalWeeks,
      periodsPerWeek,
      schoolContext: dto.schoolContext,
      strandFocus: dto.strandFocus,
    });

    return this.dataSource.transaction(async (manager) => {
      const scheme = manager.create(SchemeOfWork, {
        tenantId, schoolId, teacherId,
        streamId: dto.streamId,
        subjectId: dto.subjectId,
        academicYear: dto.academicYear,
        term: dto.term,
        gradeLevel: dto.gradeLevel,
        title,
        aiGenerated: true,
        aiModel: 'claude-sonnet-4-20250514',
        generationTokens: tokens,
        status: 'draft',
      });
      await manager.save(SchemeOfWork, scheme);

      for (const w of weeks) {
        await manager.save(SchemeWeek, manager.create(SchemeWeek, {
          tenantId,
          schemeId: scheme.id,
          weekNumber: w.weekNumber,
          dates: w.dates,
          strand: w.strand,
          subStrand: w.subStrand,
          specificLearningOutcomes: w.specificLearningOutcomes,
          keyInquiryQuestions: w.keyInquiryQuestions,
          learningExperiences: w.learningExperiences,
          learningResources: w.learningResources,
          assessmentMethods: w.assessmentMethods,
          periods: w.periods || periodsPerWeek,
          remarks: '',
        }));
      }

      return {
        schemeId: scheme.id,
        title,
        totalWeeks: weeks.length,
        status: 'draft',
        message: `Scheme of Work generated: ${weeks.length} weeks. Review and submit for approval.`,
      };
    });
  }

  // ── GET SCHEME (with weeks) ────────────────────────────────
  async findOne(tenantId: string, schemeId: string) {
    const scheme = await this.schemeRepo.findOne({
      where: { id: schemeId, tenantId },
      relations: ['weeks'],
    });
    if (!scheme) throw new NotFoundException('Scheme of work not found');
    return scheme;
  }

  // ── LIST (for teacher or admin) ────────────────────────────
  async findAll(tenantId: string, filters: {
    teacherId?: string; streamId?: string; subjectId?: string;
    academicYear?: string; term?: string; status?: string;
  }) {
    const qb = this.schemeRepo.createQueryBuilder('s')
      .where('s.tenant_id = :tenantId AND s.deleted_at IS NULL', { tenantId })
      .orderBy('s.created_at', 'DESC');

    if (filters.teacherId) qb.andWhere('s.teacher_id = :tid', { tid: filters.teacherId });
    if (filters.streamId) qb.andWhere('s.stream_id = :sid', { sid: filters.streamId });
    if (filters.academicYear) qb.andWhere('s.academic_year = :yr', { yr: filters.academicYear });
    if (filters.term) qb.andWhere('s.term = :term', { term: filters.term });
    if (filters.status) qb.andWhere('s.status = :status', { status: filters.status });

    return qb.getMany();
  }

  // ── SUBMIT FOR APPROVAL ────────────────────────────────────
  async submit(tenantId: string, schemeId: string, teacherId: string, submittedTo?: string) {
    const scheme = await this.schemeRepo.findOne({ where: { id: schemeId, tenantId, teacherId } });
    if (!scheme) throw new NotFoundException('Scheme not found');
    if (!['draft', 'revision_requested'].includes(scheme.status)) {
      throw new BadRequestException(`Cannot submit — current status: ${scheme.status}`);
    }

    await this.schemeRepo.update(schemeId, {
      status: 'submitted',
      submittedAt: new Date(),
      submittedTo,
    });

    await this.auditRepo.save({
      tenantId, recordType: 'scheme_of_work', recordId: schemeId,
      action: 'submitted', actorId: teacherId, actorRole: 'teacher',
    });

    return { message: 'Scheme submitted for approval.' };
  }

  // ── REVIEW (HOI / Admin) ───────────────────────────────────
  async review(tenantId: string, schemeId: string, reviewerId: string, dto: ReviewRecordDto) {
    const scheme = await this.schemeRepo.findOne({ where: { id: schemeId, tenantId } });
    if (!scheme) throw new NotFoundException('Scheme not found');
    if (scheme.status !== 'submitted') {
      throw new BadRequestException('Only submitted schemes can be reviewed');
    }

    await this.schemeRepo.update(schemeId, {
      status: dto.action,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reviewComment: dto.comment,
    });

    await this.auditRepo.save({
      tenantId, recordType: 'scheme_of_work', recordId: schemeId,
      action: dto.action, actorId: reviewerId, actorRole: 'hoi',
      comment: dto.comment,
    });

    return { message: `Scheme ${dto.action}.`, comment: dto.comment };
  }
}
