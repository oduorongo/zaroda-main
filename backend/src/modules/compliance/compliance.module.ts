// ─────────────────────────────────────────────────────────────
// COMPLIANCE — Kenya Data Protection Act 2019, Phase 1
//
// Two jobs:
//   1. Expose the PII access trail so a school can answer an ODPC enquiry
//      ("who looked at this child's record, and when").
//   2. Enforce retention: personal data may not be kept indefinitely.
//
// Retention is done by ANONYMISING, not deleting. A school must keep academic
// results (statutory), but it does not need to keep the name, birth certificate
// number, guardian ID or health notes attached to them once a learner has been
// gone for years. Stripping the identifiers satisfies both duties at once;
// deleting the rows would breach the retention one.
// ─────────────────────────────────────────────────────────────
import {
  Module, Injectable, Controller, Get, Patch, Post, Query, Body,
  UseGuards, Request, BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

// Categories a school may shorten. The statutory ones are seeded with
// is_statutory = true in migration 068 and are rejected here.
const USER_SETTABLE = ['alumni_learners', 'attendance', 'audit_logs'];
const MIN_MONTHS = 6;

@Injectable()
export class ComplianceService {
  constructor(@InjectDataSource() private ds: DataSource) {}

  // ── PII ACCESS TRAIL ──────────────────────────────────────
  // Deliberately tenant-scoped and paginated: this table grows fast.
  async accessTrail(tenantId: string, q: {
    learnerId?: string; userId?: string; action?: string;
    from?: string; to?: string; page?: number; limit?: number;
  }) {
    const page  = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));

    const where: string[] = ['a.tenant_id::text = $1'];
    const params: any[] = [tenantId];

    // Reads only — the write trail is a separate question and a separate view.
    where.push(`a.action LIKE '%.viewed' OR a.action LIKE '%.exported'`);

    if (q.learnerId) { params.push(q.learnerId); where.push(`a.entity_id::text = $${params.length}`); }
    if (q.userId)    { params.push(q.userId);    where.push(`a.user_id::text = $${params.length}`); }
    if (q.action)    { params.push(q.action);    where.push(`a.action = $${params.length}`); }
    if (q.from)      { params.push(q.from);      where.push(`a.created_at >= $${params.length}`); }
    if (q.to)        { params.push(q.to);        where.push(`a.created_at < ($${params.length}::date + 1)`); }

    const clause = where.map(w => `(${w})`).join(' AND ');

    const rows = await this.ds.query(
      `SELECT a.id, a.action, a.entity_type AS "entityType", a.entity_id AS "entityId",
              a.record_count AS "recordCount", a.route, a.ip_address AS "ipAddress",
              a.created_at AS "createdAt",
              u.first_name AS "actorFirstName", u.last_name AS "actorLastName",
              u.role AS "actorRole",
              l.first_name AS "learnerFirstName", l.last_name AS "learnerLastName",
              l.admission_number AS "learnerAdmissionNumber"
         FROM audit_logs a
         LEFT JOIN users    u ON u.id = a.user_id
         LEFT JOIN learners l ON l.id = a.entity_id AND a.entity_type = 'learners'
        WHERE ${clause}
        ORDER BY a.created_at DESC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      params,
    );

    const [{ n }] = await this.ds.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs a WHERE ${clause}`, params,
    );

    return { data: rows, total: n, page, limit, pages: Math.ceil(n / limit) };
  }

  // ── RETENTION POLICIES ────────────────────────────────────
  async getPolicies(tenantId: string) {
    return this.ds.query(
      `SELECT category, retention_months AS "retentionMonths",
              is_statutory AS "isStatutory",
              last_purged_at AS "lastPurgedAt", last_purged_count AS "lastPurgedCount",
              updated_at AS "updatedAt"
         FROM data_retention_policies
        WHERE tenant_id::text = $1
        ORDER BY is_statutory ASC, category ASC`,
      [tenantId],
    );
  }

  async setPolicy(tenantId: string, userId: string, category: string, months: number) {
    if (!USER_SETTABLE.includes(category)) {
      throw new BadRequestException(
        'This category is retained under a statutory requirement and its period cannot be shortened here.',
      );
    }
    if (!Number.isInteger(months) || months < MIN_MONTHS) {
      throw new BadRequestException(`Retention must be a whole number of months, at least ${MIN_MONTHS}.`);
    }
    await this.ds.query(
      `UPDATE data_retention_policies
          SET retention_months = $1, updated_by = $2, updated_at = NOW()
        WHERE tenant_id::text = $3 AND category = $4 AND is_statutory = FALSE`,
      [months, userId, tenantId, category],
    );
    return { ok: true };
  }

  // ── PURGE ─────────────────────────────────────────────────
  /**
   * Applies every tenant's retention policy. Safe to run repeatedly: each step
   * only touches rows that are both past the period and not already anonymised.
   */
  async runPurge(): Promise<{ category: string; tenantId: string; count: number }[]> {
    const policies = await this.ds.query(
      `SELECT tenant_id AS "tenantId", category, retention_months AS "months"
         FROM data_retention_policies
        WHERE retention_months IS NOT NULL`,
    );

    const results: { category: string; tenantId: string; count: number }[] = [];

    for (const p of policies) {
      let count = 0;
      try {
        if (p.category === 'alumni_learners')  count = await this.purgeAlumni(p.tenantId, p.months);
        else if (p.category === 'attendance')  count = await this.purgeAttendance(p.tenantId, p.months);
        else if (p.category === 'audit_logs')  count = await this.purgeAuditLogs(p.tenantId, p.months);
        else continue;

        await this.ds.query(
          `UPDATE data_retention_policies
              SET last_purged_at = NOW(), last_purged_count = $1
            WHERE tenant_id = $2 AND category = $3`,
          [count, p.tenantId, p.category],
        );
        results.push({ category: p.category, tenantId: p.tenantId, count });
      } catch (err: any) {
        // One tenant's bad data must not stop every other tenant's purge.
        console.error('[compliance] purge failed', { ...p, err: err?.message });
      }
    }
    return results;
  }

  /**
   * Anonymise learners who left longer ago than the retention period. Academic
   * results stay (statutory) but stop being attached to a named child. The
   * anonymised_at stamp is what makes this idempotent.
   *
   * upi_number and admission_number are deliberately kept: they are the keys the
   * retained results hang off, and on their own they no longer identify a child.
   */
  private async purgeAlumni(tenantId: string, months: number): Promise<number> {
    const res = await this.ds.query(
      `UPDATE learners
          SET first_name = 'Anonymised', last_name = concat('Learner-', left(id::text, 8)),
              middle_name = NULL, date_of_birth = NULL, birth_cert_no = NULL,
              guardian_name = NULL, guardian_phone = NULL, guardian_email = NULL,
              guardian_id_no = NULL, guardian_relation = NULL,
              special_needs = NULL, photo_url = NULL, residence = NULL,
              nationality = NULL, previous_school = NULL,
              anonymised_at = NOW()
        WHERE tenant_id::text = $1
          AND anonymised_at IS NULL
          AND exited_at IS NOT NULL
          AND exited_at < NOW() - ($2 || ' months')::interval
        RETURNING id`,
      [tenantId, months],
    );
    return res.length;
  }

  private async purgeAttendance(tenantId: string, months: number): Promise<number> {
    const res = await this.ds.query(
      `DELETE FROM attendance
        WHERE tenant_id::text = $1
          AND date < (NOW() - ($2 || ' months')::interval)::date
        RETURNING id`,
      [tenantId, months],
    );
    return res.length;
  }

  private async purgeAuditLogs(tenantId: string, months: number): Promise<number> {
    const res = await this.ds.query(
      `DELETE FROM audit_logs
        WHERE tenant_id::text = $1
          AND created_at < NOW() - ($2 || ' months')::interval
        RETURNING id`,
      [tenantId, months],
    );
    return res.length;
  }

  // Sunday 02:00 — low traffic for Kenyan schools.
  @Cron('0 2 * * 0', { timeZone: 'Africa/Nairobi' })
  async scheduledPurge() {
    const results = await this.runPurge();
    const touched = results.filter(r => r.count > 0);
    if (touched.length) console.log('[compliance] retention purge applied', touched);
  }
}

@Controller('compliance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComplianceController {
  constructor(private svc: ComplianceService) {}

  // The access trail names which staff member opened which child's record, so
  // it is itself sensitive — school leadership only, never ordinary teachers.
  @Get('access-trail')
  @Roles('super_admin', 'tenant_owner', 'school_admin', 'hoi', 'dhois')
  accessTrail(@Request() req: any, @Query() q: any) {
    return this.svc.accessTrail(req.user.tenantId, q);
  }

  @Get('retention')
  @Roles('super_admin', 'tenant_owner', 'school_admin', 'hoi', 'dhois')
  getRetention(@Request() req: any) {
    return this.svc.getPolicies(req.user.tenantId);
  }

  @Patch('retention')
  @Roles('super_admin', 'tenant_owner', 'school_admin', 'hoi', 'dhois')
  setRetention(@Request() req: any, @Body() dto: { category: string; retentionMonths: number }) {
    return this.svc.setPolicy(req.user.tenantId, req.user.id, dto.category, Number(dto.retentionMonths));
  }

  // Manual trigger, for when an admin has just shortened a period and wants it
  // applied now rather than at the weekly run.
  @Post('retention/run')
  @Roles('super_admin', 'tenant_owner', 'school_admin', 'hoi', 'dhois')
  async runNow(@Request() req: any) {
    const all = await this.svc.runPurge();
    return { applied: all.filter(r => r.tenantId === req.user.tenantId) };
  }
}

@Module({
  controllers: [ComplianceController],
  providers:   [ComplianceService],
  exports:     [ComplianceService],
})
export class ComplianceModule {}
