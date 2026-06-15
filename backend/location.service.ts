// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// LOCATION SERVICE + SUPER ADMIN MARKETING DASHBOARD
// Stack: Node.js · NestJS · PostgreSQL
// ============================================================

// ─────────────────────────────────────────────────────────────
// src/modules/location/location.service.ts
// Cascading county → sub-county → zone dropdowns
// ─────────────────────────────────────────────────────────────
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(KeCounty)    private countyRepo:    Repository<KeCounty>,
    @InjectRepository(KeSubCounty) private subCountyRepo: Repository<KeSubCounty>,
    @InjectRepository(KeZone)      private zoneRepo:      Repository<KeZone>,
    private dataSource: DataSource,
  ) {}

  // All 47 counties — load once, cache on client
  async getCounties() {
    return this.countyRepo.find({ order: { name: 'ASC' } });
  }

  // Sub-counties for a county
  async getSubCounties(countyId: number) {
    return this.subCountyRepo.find({
      where: { countyId },
      order: { name: 'ASC' },
    });
  }

  // Zones for a sub-county
  async getZones(subCountyId: number) {
    return this.zoneRepo.find({
      where: { subCountyId },
      order: { name: 'ASC' },
    });
  }

  // Resolve plain text → FK IDs (for migrating existing tenant data)
  async resolveLocation(county: string, subCounty: string, zone?: string): Promise<{
    keCountyId?: number; keSubCountyId?: number; keZoneId?: number;
  }> {
    const countyRow = await this.countyRepo
      .createQueryBuilder('c')
      .where('LOWER(c.name) = LOWER(:county)', { county })
      .getOne();
    if (!countyRow) return {};

    const subRow = await this.subCountyRepo
      .createQueryBuilder('sc')
      .where('sc.county_id = :cid AND LOWER(sc.name) = LOWER(:sub)', {
        cid: countyRow.id, sub: subCounty,
      })
      .getOne();
    if (!subRow) return { keCountyId: countyRow.id };

    if (!zone) return { keCountyId: countyRow.id, keSubCountyId: subRow.id };

    const zoneRow = await this.zoneRepo
      .createQueryBuilder('z')
      .where('z.sub_county_id = :sid AND LOWER(z.name) = LOWER(:zone)', {
        sid: subRow.id, zone,
      })
      .getOne();

    return {
      keCountyId:    countyRow.id,
      keSubCountyId: subRow.id,
      keZoneId:      zoneRow?.id,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// src/modules/location/location.controller.ts
// Public endpoints — no auth required for dropdown data
// ─────────────────────────────────────────────────────────────
import { Controller, Get, Param } from '@nestjs/common';

@Controller('api/v1/location')
export class LocationController {
  constructor(private locationService: LocationService) {}

  @Get('counties')
  getCounties() {
    return this.locationService.getCounties();
  }

  @Get('counties/:countyId/sub-counties')
  getSubCounties(@Param('countyId') id: string) {
    return this.locationService.getSubCounties(parseInt(id));
  }

  @Get('sub-counties/:subCountyId/zones')
  getZones(@Param('subCountyId') id: string) {
    return this.locationService.getZones(parseInt(id));
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/admin/super-admin.service.ts
// Marketing pipeline — super_admin role only
// Schools never see any of this
// ─────────────────────────────────────────────────────────────
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

@Injectable()
export class SuperAdminService {
  constructor(
    @InjectRepository(Tenant)       private tenantRepo:  Repository<Tenant>,
    @InjectRepository(InviteSignup) private signupRepo:  Repository<InviteSignup>,
    private dataSource: DataSource,
  ) {}

  // ── MARKETING PIPELINE ────────────────────────────────────
  async getMarketingPipeline(filters: {
    countyId?:    number;
    subCountyId?: number;
    zoneId?:      number;
    status?:      string;
    dateFrom?:    string;
    dateTo?:      string;
    search?:      string;
    page?:        number;
    limit?:       number;
  }) {
    const { page = 1, limit = 50 } = filters;

    const qb = this.signupRepo
      .createQueryBuilder('s')
      .leftJoin('ke_counties',     'c',  'c.id  = s.ke_county_id')
      .leftJoin('ke_sub_counties', 'sc', 'sc.id = s.ke_sub_county_id')
      .leftJoin('ke_zones',        'z',  'z.id  = s.ke_zone_id')
      .leftJoin('tenants',         't',  't.id  = s.tenant_id')
      .select([
        's.id', 's.school_name', 's.admin_name', 's.admin_email',
        's.signed_up_at', 's.onboarding_completed_at',
        's.county', 's.sub_county', 's.zone',
        'c.name  AS ke_county_name',
        'sc.name AS ke_sub_county_name',
        'z.name  AS ke_zone_name',
        't.status AS tenant_status',
        't.subscription_tier',
        't.trial_ends_at',
        's.invite_id',
      ])
      .orderBy('s.signed_up_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.countyId)    qb.andWhere('s.ke_county_id    = :cid',   { cid: filters.countyId });
    if (filters.subCountyId) qb.andWhere('s.ke_sub_county_id = :sid',  { sid: filters.subCountyId });
    if (filters.zoneId)      qb.andWhere('s.ke_zone_id       = :zid',  { zid: filters.zoneId });
    if (filters.status)      qb.andWhere('t.status           = :st',   { st:  filters.status });
    if (filters.dateFrom)    qb.andWhere('s.signed_up_at    >= :from', { from: filters.dateFrom });
    if (filters.dateTo)      qb.andWhere('s.signed_up_at    <= :to',   { to:   filters.dateTo });
    if (filters.search)      qb.andWhere('s.school_name ILIKE :q',     { q:   `%${filters.search}%` });

    const [data, total] = await qb.getRawManyAndCount();
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ── COUNTY-LEVEL SUMMARY (for heatmap) ───────────────────
  async getGeographicSummary() {
    return this.dataSource.query(`
      SELECT
        c.code            AS county_code,
        c.name            AS county_name,
        c.region,
        COUNT(s.id)                                         AS total_signups,
        COUNT(s.id) FILTER (WHERE t.status = 'active')     AS paying_schools,
        COUNT(s.id) FILTER (WHERE t.status = 'trial')      AS on_trial,
        COUNT(s.id) FILTER (WHERE t.id IS NULL)            AS not_yet_onboarded,
        ROUND(
          COUNT(s.id) FILTER (WHERE t.status = 'active')::numeric
          / NULLIF(COUNT(s.id), 0) * 100, 1
        )                                                   AS conversion_pct
      FROM ke_counties c
      LEFT JOIN invite_signups s ON s.ke_county_id = c.id
      LEFT JOIN tenants t        ON t.id = s.tenant_id
      GROUP BY c.id, c.code, c.name, c.region
      ORDER BY total_signups DESC, c.name ASC
    `);
  }

  // ── ZONE BREAKDOWN (for targeted outreach) ───────────────
  async getZoneBreakdown(subCountyId: number) {
    return this.dataSource.query(`
      SELECT
        z.id                                               AS zone_id,
        z.name                                             AS zone_name,
        sc.name                                            AS sub_county,
        c.name                                             AS county,
        COUNT(s.id)                                        AS total_signups,
        COUNT(s.id) FILTER (WHERE t.status = 'active')    AS paying,
        COUNT(s.id) FILTER (WHERE t.status = 'trial')     AS on_trial
      FROM ke_zones z
      JOIN ke_sub_counties sc ON sc.id = z.sub_county_id
      JOIN ke_counties c      ON c.id  = sc.county_id
      LEFT JOIN invite_signups s ON s.ke_zone_id = z.id
      LEFT JOIN tenants t        ON t.id = s.tenant_id
      WHERE z.sub_county_id = $1
      GROUP BY z.id, z.name, sc.name, c.name
      ORDER BY total_signups DESC
    `, [subCountyId]);
  }

  // ── ALL TENANTS (filterable by location) ─────────────────
  async getAllTenants(filters: {
    countyId?: number; subCountyId?: number; zoneId?: number;
    status?: string; search?: string; page?: number; limit?: number;
  }) {
    const { page = 1, limit = 30 } = filters;

    const qb = this.tenantRepo
      .createQueryBuilder('t')
      .leftJoin('ke_counties',     'c',  'c.id  = t.ke_county_id')
      .leftJoin('ke_sub_counties', 'sc', 'sc.id = t.ke_sub_county_id')
      .leftJoin('ke_zones',        'z',  'z.id  = t.ke_zone_id')
      .select([
        't.id', 't.name', 't.subdomain', 't.status',
        't.subscription_tier', 't.trial_ends_at',
        't.county', 't.sub_county', 't.zone',
        't.phone', 't.email', 't.created_at',
        'c.name  AS county_name',
        'sc.name AS sub_county_name',
        'z.name  AS zone_name',
      ])
      .where('t.deleted_at IS NULL')
      .orderBy('t.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.countyId)    qb.andWhere('t.ke_county_id     = :cid',  { cid: filters.countyId });
    if (filters.subCountyId) qb.andWhere('t.ke_sub_county_id = :sid',  { sid: filters.subCountyId });
    if (filters.zoneId)      qb.andWhere('t.ke_zone_id       = :zid',  { zid: filters.zoneId });
    if (filters.status)      qb.andWhere('t.status           = :st',   { st:  filters.status });
    if (filters.search)      qb.andWhere('t.name ILIKE :q',            { q:  `%${filters.search}%` });

    const [data, total] = await qb.getRawManyAndCount();
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ── UPDATE TENANT LOCATION ────────────────────────────────
  async updateTenantLocation(tenantId: string, dto: {
    county?: string; subCounty?: string; zone?: string;
    keCountyId?: number; keSubCountyId?: number; keZoneId?: number;
  }) {
    await this.tenantRepo.update(tenantId, {
      county:           dto.county,
      subCounty:        dto.subCounty,
      zone:             dto.zone,
      keCountyId:       dto.keCountyId,
      keSubCountyId:    dto.keSubCountyId,
      keZoneId:         dto.keZoneId,
      locationVerified: true,
    });
    return { message: 'Location updated.' };
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/admin/super-admin.controller.ts
// Role guard: super_admin only — schools never reach these routes
// ─────────────────────────────────────────────────────────────
import { Controller, Get, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';

@Controller('api/v1/super-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')            // ← schools have no access to this prefix
export class SuperAdminController {
  constructor(private superAdminService: SuperAdminService) {}

  @Get('marketing/pipeline')
  getPipeline(@Query() filters: any) {
    return this.superAdminService.getMarketingPipeline(filters);
  }

  @Get('marketing/geographic')
  getGeographic() {
    return this.superAdminService.getGeographicSummary();
  }

  @Get('marketing/zone-breakdown/:subCountyId')
  getZoneBreakdown(@Param('subCountyId') id: string) {
    return this.superAdminService.getZoneBreakdown(parseInt(id));
  }

  @Get('tenants')
  getAllTenants(@Query() filters: any) {
    return this.superAdminService.getAllTenants(filters);
  }

  @Patch('tenants/:id/location')
  updateLocation(@Param('id') id: string, @Body() dto: any) {
    return this.superAdminService.updateTenantLocation(id, dto);
  }
}
