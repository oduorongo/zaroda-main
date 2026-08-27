import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SchemeOfWork, SchemeWeek, TeacherDocument, PrAudit, SubjectCatalogue } from './entities';
import { Tenant } from '../auth/entities/tenant.entity';
import { AiGeneratorService } from './ai-generator.service';
import { PurchaseService } from './purchase.service';
import { GenerateSchemeDto, ReviewRecordDto } from './dto';

@Injectable()
export class SchemeService {
  constructor(
    @InjectRepository(SchemeOfWork) private schemeRepo: Repository<SchemeOfWork>,
    @InjectRepository(SchemeWeek) private weekRepo: Repository<SchemeWeek>,
    @InjectRepository(TeacherDocument) private docRepo: Repository<TeacherDocument>,
    @InjectRepository(PrAudit) private auditRepo: Repository<PrAudit>,
    @InjectRepository(SubjectCatalogue) private subjectRepo: Repository<SubjectCatalogue>,
    @InjectRepository(Tenant) private tenantRepo: Repository<Tenant>,
    private aiGenerator: AiGeneratorService,
    private purchaseService: PurchaseService,
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
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const isIndividual = tenant?.accountType === 'individual';

    // Individual accounts (a teacher without a school tenant) have no
    // teacher_stream_subjects assignments to check against, and no real
    // streams/subject_catalogue rows to pick from — find-or-create both by
    // name instead of requiring the school-tenant UUID pickers.
    let streamId = dto.streamId;
    let subjectId = dto.subjectId;
    if (isIndividual) {
      const streamName = dto.streamName || `${dto.gradeLevel} (self)`;
      const streamRows = await this.dataSource.query(
        `SELECT id FROM streams WHERE tenant_id::text = $1 AND name = $2 LIMIT 1`,
        [tenantId, streamName],
      ).catch(() => []);
      streamId = streamRows[0]?.id;
      if (!streamId) {
        const inserted = await this.dataSource.query(
          `INSERT INTO streams (tenant_id, school_id, name, grade_level, class_teacher_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [tenantId, schoolId, streamName, dto.gradeLevel, teacherId],
        );
        streamId = inserted[0].id;
      }

      let subjectRow = await this.subjectRepo.findOne({ where: { tenantId, name: dto.subjectName } });
      if (!subjectRow) {
        subjectRow = await this.subjectRepo.save(this.subjectRepo.create({
          tenantId, schoolId, name: dto.subjectName, category: 'core', gradeBand: 'primary',
        }));
      }
      subjectId = subjectRow.id;
    } else {
      if (!streamId || !subjectId) throw new BadRequestException('Select a stream and subject.');
      await this.assertAssignedToTeach(tenantId, teacherId, role, streamId, dto.subjectName);
    }

    // Pay-per-flow, not subscription: every generator (teachers, HOI, admin — no
    // exemptions) must have an unconsumed paid M-Pesa purchase before we spend AI
    // tokens generating anything. Re-checked atomically inside the transaction below
    // to close the race between this pre-check and the actual consume.
    this.purchaseService.assertPaid(await this.purchaseService.findConsumablePurchase(tenantId, teacherId));

    const existing = await this.schemeRepo.findOne({
      where: {
        tenantId, teacherId, streamId, subjectId,
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
    const startWeek = dto.startWeek || 1;
    const columns = dto.columns?.length
      ? dto.columns
      : ['keyInquiry', 'learningExperiences', 'resources', 'assessment', 'reflection'];

    const { weeks, title, tokens } = await this.aiGenerator.generateSchemeOfWork({
      subjectName: dto.subjectName,
      gradeLevel: dto.gradeLevel,
      term: dto.term,
      academicYear: dto.academicYear,
      totalWeeks,
      periodsPerWeek,
      schoolContext: dto.schoolContext,
      strandFocus: dto.strandFocus,
      columns,
      specialWeeks: dto.specialWeeks,
    });

    return this.dataSource.transaction(async (manager) => {
      const purchase = await this.purchaseService.findConsumablePurchase(tenantId, teacherId, manager);
      this.purchaseService.assertPaid(purchase);

      const scheme = manager.create(SchemeOfWork, {
        tenantId, schoolId, teacherId,
        streamId,
        subjectId,
        academicYear: dto.academicYear,
        term: dto.term,
        gradeLevel: dto.gradeLevel,
        title,
        aiGenerated: true,
        aiModel: 'claude-sonnet-4-20250514',
        generationTokens: tokens,
        // Individual accounts have no HOI to approve anything — self-certified instead.
        status: isIndividual ? 'approved' : 'draft',
        schoolName: dto.schoolName,
        teacherName: dto.teacherName,
        tscNumber: dto.tscNumber,
        signOffLine: dto.signOffLine || 'Checked by D.H.O.I.',
        curriculumEdition: dto.curriculumEdition,
        startWeek,
        columns,
        defaultFont: dto.defaultFont || 'Times New Roman',
      });
      await manager.save(SchemeOfWork, scheme);

      for (const [i, w] of weeks.entries()) {
        await manager.save(SchemeWeek, manager.create(SchemeWeek, {
          tenantId,
          schemeId: scheme.id,
          weekNumber: startWeek + i,
          dates: w.dates,
          strand: w.strand,
          subStrand: w.subStrand,
          specificLearningOutcomes: w.specificLearningOutcomes,
          keyInquiryQuestions: w.keyInquiryQuestions,
          learningExperiences: w.learningExperiences,
          learningResources: w.learningResources,
          assessmentMethods: w.assessmentMethods,
          reflectionNotes: w.reflectionNotes,
          coreCompetencies: w.coreCompetencies,
          values: w.values,
          pertinentIssues: w.pertinentIssues,
          periods: w.periods || periodsPerWeek,
          remarks: '',
        }));
      }

      await this.purchaseService.markConsumed(purchase!.id, scheme.id, manager);

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

  // ── RENDER PRINTABLE DOCUMENT ──────────────────────────────
  // Honors the columns selected at generation time and an optional font override
  // (falls back to the scheme's own default). Used for both the browser
  // print-to-PDF flow and the Word (.doc) download — same HTML either way.
  async renderHtml(tenantId: string, schemeId: string, fontOverride?: string): Promise<string> {
    const scheme = await this.findOne(tenantId, schemeId);
    const weeks = [...(scheme.weeks || [])].sort((a, b) => a.weekNumber - b.weekNumber);
    const cols = new Set(scheme.columns?.length ? scheme.columns : ['keyInquiry', 'learningExperiences', 'resources', 'assessment', 'reflection']);
    const font = fontOverride || scheme.defaultFont || 'Times New Roman';
    const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const grade = String(scheme.gradeLevel || '').replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const term = String(scheme.term || '').replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    const headCols: string[] = ['Wk', 'Dates', 'Strand', 'Sub-Strand', 'SLOs'];
    if (cols.has('keyInquiry')) headCols.push('Key Inquiry Questions');
    if (cols.has('learningExperiences')) headCols.push('Learning Experiences');
    if (cols.has('resources')) headCols.push('Resources');
    if (cols.has('assessment')) headCols.push('Assessment');
    if (cols.has('corePV')) headCols.push('Core Competencies / Values / PCIs');
    if (cols.has('reflection')) headCols.push('Reflection');

    const rows = weeks.map((w) => {
      const cells: string[] = [
        String(w.weekNumber), esc(w.dates), esc(w.strand), esc(w.subStrand), esc(w.specificLearningOutcomes),
      ];
      if (cols.has('keyInquiry')) cells.push(esc(w.keyInquiryQuestions));
      if (cols.has('learningExperiences')) cells.push(esc(w.learningExperiences));
      if (cols.has('resources')) cells.push(esc(w.learningResources));
      if (cols.has('assessment')) cells.push(esc(w.assessmentMethods));
      if (cols.has('corePV')) cells.push(esc([w.coreCompetencies?.join(', '), w.values?.join(', '), w.pertinentIssues].filter(Boolean).join(' | ')));
      if (cols.has('reflection')) cells.push(esc(w.reflectionNotes));
      return `<tr>${cells.map((c) => `<td style="border:1px solid #999;padding:6px;vertical-align:top;font-size:11px;white-space:pre-wrap">${c}</td>`).join('')}</tr>`;
    }).join('');

    return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(scheme.title)}</title>
<style>
  body{font-family:'${esc(font)}',serif;margin:24px;color:#111}
  h1{font-size:18px;text-align:center;margin:0 0 4px}
  .meta{font-size:12px;margin-bottom:14px}
  .meta div{margin-bottom:2px}
  table{border-collapse:collapse;width:100%}
  th{border:1px solid #999;padding:6px;font-size:11px;background:#f0f0f0;text-align:left}
  .sig{margin-top:36px;font-size:12px;display:flex;justify-content:space-between}
  @media print{@page{size:landscape;margin:12mm}}
</style></head>
<body onload="window.print && window.print()">
  <h1>${esc(scheme.title)}</h1>
  <div class="meta">
    <div><b>School:</b> ${esc(scheme.schoolName || '')} &nbsp; <b>Teacher:</b> ${esc(scheme.teacherName || '')} ${scheme.tscNumber ? `&nbsp; <b>TSC No:</b> ${esc(scheme.tscNumber)}` : ''}</div>
    <div><b>Grade:</b> ${esc(grade)} &nbsp; <b>Term:</b> ${esc(term)} &nbsp; <b>Year:</b> ${esc(scheme.academicYear)} ${scheme.curriculumEdition ? `&nbsp; <b>Curriculum:</b> ${esc(scheme.curriculumEdition)}` : ''}</div>
  </div>
  <table><thead><tr>${headCols.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
  <div class="sig">
    <div>Prepared by: ${esc(scheme.teacherName || '_______________________')}</div>
    <div>${esc(scheme.signOffLine || 'Checked by D.H.O.I.')}: _______________________</div>
  </div>
</body></html>`;
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
