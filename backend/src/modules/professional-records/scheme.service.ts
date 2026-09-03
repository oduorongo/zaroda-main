import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SchemeOfWork, SchemeWeek, TeacherDocument, PrAudit, SubjectCatalogue } from './entities';
import { Tenant } from '../auth/entities/tenant.entity';
import { AiGeneratorService } from './ai-generator.service';
import { WalletService } from './wallet.service';
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
    private walletService: WalletService,
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

    // Wallet-based, not subscription: every generator (teachers, HOI, admin — no
    // exemptions) must have enough wallet balance before we spend AI tokens
    // generating anything. Re-debited atomically inside the transaction below,
    // which is the race-safe check — this is just a fast fail.
    await this.walletService.assertAffordable(tenantId, teacherId, 'scheme');

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

    const { weeks, title, tokens, lessonsPerWeek } = await this.aiGenerator.generateSchemeOfWork({
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
      doubleLessonSlots: dto.doubleLessonSlots,
    });

    return this.dataSource.transaction(async (manager) => {
      const scheme = manager.create(SchemeOfWork, {
        tenantId, schoolId, teacherId,
        streamId,
        subjectId,
        academicYear: dto.academicYear,
        term: dto.term,
        gradeLevel: dto.gradeLevel,
        title,
        aiGenerated: true,
        aiModel: 'claude-sonnet-5',
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
        lessonsPerWeek,
      });
      await manager.save(SchemeOfWork, scheme);
      await this.walletService.debit(tenantId, teacherId, 'scheme', scheme.id, manager);

      for (const [i, w] of weeks.entries()) {
        await manager.save(SchemeWeek, manager.create(SchemeWeek, {
          tenantId,
          schemeId: scheme.id,
          weekNumber: startWeek + i,
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
          lessons: w.lessons || [],
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

    // A transparent, tiled watermark of the school name on every page — so a
    // generated scheme can't be handed to a teacher at another school without
    // the origin school being visibly stamped across it. Not optional/removable
    // via any column toggle; schoolName is a required field precisely for this.
    const watermarkText = esc(scheme.schoolName || '').toUpperCase();
    const watermarkSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='140'>` +
      `<text x='0' y='90' font-family='Arial, sans-serif' font-size='26' font-weight='bold' fill='rgba(0,0,0,0.08)'>${watermarkText}</text></svg>`;
    const watermarkDataUri = `data:image/svg+xml,${encodeURIComponent(watermarkSvg)}`;

    const headCols: string[] = ['Wk', 'Lesson', 'Strand', 'Sub-Strand'];
    if (cols.has('keyInquiry')) headCols.push('Key Inquiry Questions');
    if (cols.has('learningExperiences')) headCols.push('Learning Experiences');
    headCols.push('SLOs');
    if (cols.has('resources')) headCols.push('Resources');
    if (cols.has('assessment')) headCols.push('Assessment');
    if (cols.has('corePV')) headCols.push('Core Competencies / Values / PCIs');
    if (cols.has('reflection')) headCols.push('Reflection');
    const totalCols = headCols.length;

    const td = (c: string, extra = '') =>
      `<td style="border:1px solid #999;padding:6px;vertical-align:top;font-size:11px;white-space:pre-wrap${extra}">${c}</td>`;

    const rows = weeks.map((w) => {
      // A non-teaching week (mid-term break, summative assessment, exam week) has no
      // lessons — give it its own clearly marked row spanning the whole table instead
      // of trying to fit a break/exam label into per-lesson rows.
      if (!w.lessons || w.lessons.length === 0) {
        return `<tr style="background:#fdf3d8">` +
          td(String(w.weekNumber), ';font-weight:bold;text-align:center') +
          `<td colspan="${totalCols - 1}" style="border:1px solid #999;padding:6px;font-size:12px;font-weight:bold;text-align:center;text-transform:uppercase;letter-spacing:.5px">${esc(w.strand)}</td>` +
          `</tr>`;
      }

      // Each lesson is its own row — Wk/Strand/Sub-Strand and the week-level columns
      // (Resources/Assessment/CorePV/Reflection) are row-spanned down the week's rows
      // instead of repeating on every lesson.
      const weekSpanCell = (c: string) => `<td rowspan="${w.lessons.length}" style="border:1px solid #999;padding:6px;vertical-align:top;font-size:11px;white-space:pre-wrap">${c}</td>`;
      const resourcesCell = cols.has('resources') ? weekSpanCell(esc(w.learningResources)) : '';
      const assessmentCell = cols.has('assessment') ? weekSpanCell(esc(w.assessmentMethods)) : '';
      const corePVCell = cols.has('corePV') ? weekSpanCell(esc([w.coreCompetencies?.join(', '), w.values?.join(', '), w.pertinentIssues].filter(Boolean).join(' | '))) : '';
      const reflectionCell = cols.has('reflection') ? weekSpanCell(esc(w.reflectionNotes)) : '';

      return w.lessons.map((lesson, i) => {
        const lessonLabel = `${lesson.lessonNumber}${lesson.isDouble ? ' (Double)' : ''}`;
        const rowCells: string[] = [];
        if (i === 0) {
          rowCells.push(weekSpanCell(String(w.weekNumber)));
          rowCells.push(td(esc(lessonLabel)));
          rowCells.push(weekSpanCell(esc(w.strand)));
          rowCells.push(weekSpanCell(esc(w.subStrand)));
        } else {
          rowCells.push(td(esc(lessonLabel)));
        }
        if (cols.has('keyInquiry')) rowCells.push(td(esc(lesson.keyInquiryQuestions)));
        if (cols.has('learningExperiences')) rowCells.push(td(esc(lesson.learningExperiences)));
        rowCells.push(td(esc(lesson.specificLearningOutcomes)));
        if (i === 0) {
          rowCells.push(resourcesCell, assessmentCell, corePVCell, reflectionCell);
        }
        return `<tr>${rowCells.join('')}</tr>`;
      }).join('');
    }).join('');

    return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(scheme.title)}</title>
<style>
  body{
    font-family:'${esc(font)}',serif;margin:24px;color:#111;
    background-image:url("${watermarkDataUri}");background-repeat:repeat;background-position:0 0;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
  }
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
