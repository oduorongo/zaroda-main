import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Put, Query, Request, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SchoolOnly } from '../../common/decorators/access.decorator';
import { currentSchoolYear, schoolYearOr } from '../../common/school-year';
import { schoolHeadInfo } from '../../common/school-letterhead';
import { safeImageSrc } from '../../common/security';

/** KJSEA subject codes. Each candidate sits one religious education paper: 908, 909 or 910. */
export const KJSEA_SUBJECTS = [
  { code: '901', name: 'English' },
  { code: '902', name: 'Kiswahili' },
  { code: '903', name: 'Mathematics' },
  { code: '905', name: 'Integrated Science' },
  { code: '906', name: 'Agriculture' },
  { code: '907', name: 'Social Studies' },
  { code: '908', name: 'CRE' },
  { code: '909', name: 'IRE' },
  { code: '910', name: 'HRE' },
  { code: '911', name: 'Creative Arts & Sports' },
  { code: '912', name: 'Pre-Technical Studies' },
];
const CODES = new Set(KJSEA_SUBJECTS.map(s => s.code));
const RE_CODES = ['908', '909', '910'];

/** Only these roles enter KJSEA points; every other member of staff can view the analysis. */
const EDIT_ROLES = ['hoi', 'dhois', 'school_admin', 'tenant_owner', 'super_admin', 'dos'];

@Injectable()
export class KjseaService {
  constructor(private ds: DataSource) {}

  /**
   * The year's KJSEA candidates and their points. Candidates are found, not entered: the Grade 9 learners of that
   * year. That is anyone still in Grade 9 now (for the current year, leaving out next year's Grade 9s who were
   * promoted in), anyone who left Grade 9 through a promotion that year (completed Junior School, moved on,
   * transferred or repeating), and anyone who already has results for that year.
   */
  async get(user: any, yearParam: unknown) {
    const tenantId = user.tenantId;
    const year = schoolYearOr(yearParam);
    const learners = await this.ds.query(
      `WITH ids AS (
         SELECT l.id::text AS id FROM learners l
          WHERE l.tenant_id::text = $1 AND l.grade_level = 'grade_9' AND l.is_active = true AND $3::boolean
            AND NOT EXISTS (SELECT 1 FROM learner_promotions p
                             WHERE p.tenant_id::text = $1 AND p.learner_id::text = l.id::text AND p.school_year = $2
                               AND p.action = 'promote' AND p.to_grade = 'grade_9' AND p.undone_at IS NULL)
         UNION
         SELECT p.learner_id::text FROM learner_promotions p
          WHERE p.tenant_id::text = $1 AND p.school_year = $2 AND p.from_grade = 'grade_9' AND p.undone_at IS NULL
         UNION
         SELECT k.learner_id::text FROM kjsea_results k WHERE k.tenant_id::text = $1 AND k.school_year = $2
       )
       SELECT l.id::text AS id, TRIM(l.first_name || ' ' || COALESCE(l.last_name, '')) AS name,
              l.admission_number AS "admissionNumber", l.gender, s.name AS stream,
              COALESCE(k.points, '{}'::jsonb) AS points
         FROM ids
         JOIN learners l ON l.id::text = ids.id AND l.tenant_id::text = $1
         LEFT JOIN streams s ON s.id::text = l.stream_id::text
         LEFT JOIN kjsea_results k ON k.tenant_id::text = $1 AND k.learner_id::text = l.id::text AND k.school_year = $2
        ORDER BY l.first_name, l.last_name`,
      [tenantId, year, year === currentSchoolYear()]);
    // The same letterhead the report cards and mark lists carry: badge, name, contacts, motto.
    const head = await schoolHeadInfo(this.ds, tenantId);
    return {
      year, currentYear: currentSchoolYear(),
      school: { name: head.name || '', logo: safeImageSrc(head.logo) || null, address: head.address || '', phone: head.phone || '', email: head.email || '', motto: head.motto || '' },
      canEdit: EDIT_ROLES.includes(user.role),
      subjects: KJSEA_SUBJECTS,
      learners,
    };
  }

  /** dto = { year, rows: [{ learnerId, points: { "901": 7, ... } }] }. A blank or missing subject is left out. */
  async save(user: any, dto: any) {
    if (!EDIT_ROLES.includes(user.role)) {
      throw new ForbiddenException('Only the HOI, a deputy, the Director of Studies or a school administrator can enter KJSEA points.');
    }
    const tenantId = user.tenantId;
    const year = schoolYearOr(dto?.year);
    const rows: any[] = Array.isArray(dto?.rows) ? dto.rows : [];
    if (!rows.length) throw new BadRequestException('Nothing to save.');

    const clean = rows.map(r => {
      const points: Record<string, number> = {};
      for (const [code, v] of Object.entries(r?.points || {})) {
        if (v === null || v === undefined || v === '') continue;
        const n = Number(v);
        if (!CODES.has(code)) throw new BadRequestException(`${code} is not a KJSEA subject code.`);
        if (!Number.isInteger(n) || n < 1 || n > 8) throw new BadRequestException(`Points must be whole numbers from 1 to 8 (got ${v} for ${code}).`);
        points[code] = n;
      }
      if (RE_CODES.filter(c => c in points).length > 1) {
        throw new BadRequestException('A candidate sits only one of 908, 909 and 910.');
      }
      return { learnerId: String(r?.learnerId || ''), points };
    });

    const ids = clean.map(r => r.learnerId);
    const found = await this.ds.query(
      `SELECT id::text AS id FROM learners WHERE tenant_id::text = $1 AND id::text = ANY($2::text[])`, [tenantId, ids]);
    const ok = new Set(found.map((f: any) => f.id));
    if (clean.some(r => !ok.has(r.learnerId))) throw new BadRequestException('One of these learners is not in your school.');

    await this.ds.transaction(async (m) => {
      for (const r of clean) {
        if (!Object.keys(r.points).length) {
          await m.query(`DELETE FROM kjsea_results WHERE tenant_id::text = $1 AND learner_id::text = $2 AND school_year = $3`,
            [tenantId, r.learnerId, year]);
          continue;
        }
        await m.query(
          `INSERT INTO kjsea_results (tenant_id, learner_id, school_year, points, updated_by, updated_at)
           VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
           ON CONFLICT (tenant_id, learner_id, school_year)
           DO UPDATE SET points = EXCLUDED.points, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
          [tenantId, r.learnerId, year, JSON.stringify(r.points), user.id || null]);
      }
    });
    return { saved: clean.length };
  }
}

@Controller('academic/kjsea')
@SchoolOnly()
@UseGuards(JwtAuthGuard)
export class KjseaController {
  constructor(private svc: KjseaService) {}

  /** Every member of staff can view; parents and learners are refused globally. */
  @Get()
  get(@Request() req: any, @Query('year') year: string) {
    return this.svc.get(req.user, year);
  }

  @Put()
  save(@Request() req: any, @Body() dto: any) {
    return this.svc.save(req.user, dto);
  }
}
