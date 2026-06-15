// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// MODULE 08: Discipline & Guidance — NestJS Backend
// Services: IncidentService · DisciplineService
//           CounsellingService · BehaviourService
//           AnalyticsService
// ============================================================

// ─────────────────────────────────────────────────────────────
// src/modules/discipline/dto/discipline.dto.ts
// ─────────────────────────────────────────────────────────────
import {
  IsNotEmpty, IsOptional, IsString, IsEnum,
  IsUUID, IsBoolean, IsArray, IsDateString, IsNumber
} from 'class-validator';

export class CreateIncidentDto {
  @IsNotEmpty() @IsUUID()   learnerId: string;
  @IsOptional() @IsUUID()   categoryId?: string;
  @IsNotEmpty() @IsString() title: string;
  @IsNotEmpty() @IsString() description: string;
  @IsOptional() @IsString() location?: string;
  @IsNotEmpty() @IsDateString() incidentDate: string;
  @IsOptional() @IsString() incidentTime?: string;
  @IsNotEmpty() @IsEnum(['minor','moderate','major','critical']) severity: string;
  @IsOptional() @IsString() witnessedBy?: string;
  @IsOptional() @IsString() otherLearnersInvolved?: string;
  @IsOptional() @IsBoolean() injuriesReported?: boolean;
  @IsOptional() @IsString() injuryDetails?: string;
  @IsOptional() @IsString() notes?: string;
}

export class RecordActionDto {
  @IsNotEmpty() @IsUUID()   incidentId: string;
  @IsNotEmpty() @IsEnum([
    'verbal_warning','written_warning','detention','community_service',
    'parent_called','parent_meeting','suspension_in_school',
    'suspension_external','expulsion','referred_to_counsellor',
    'referred_to_external','no_action','other'
  ]) actionType: string;
  @IsNotEmpty() @IsString() description: string;
  @IsOptional() @IsDateString() actionDate?: string;
  @IsOptional() @IsNumber()  suspensionDays?: number;
  @IsOptional() @IsDateString() suspensionStart?: string;
  @IsOptional() @IsDateString() suspensionEnd?: string;
  @IsOptional() @IsString() reinstatementConditions?: string;
  @IsOptional() @IsUUID()   approvedBy?: string;
  @IsOptional() @IsBoolean() followUpRequired?: boolean;
  @IsOptional() @IsDateString() followUpDate?: string;
}

export class CreateCounsellingDto {
  @IsNotEmpty() @IsUUID()   learnerId: string;
  @IsOptional() @IsUUID()   incidentId?: string;
  @IsNotEmpty() @IsDateString() sessionDate: string;
  @IsOptional() @IsString() sessionTime?: string;
  @IsOptional() @IsNumber() durationMinutes?: number;
  @IsNotEmpty() @IsEnum(['individual','group','crisis','follow_up','referral']) sessionType: string;
  @IsOptional() @IsEnum(['self','teacher','parent','incident','hoi','external']) referralSource?: string;
  @IsOptional() @IsArray()  issuesAddressed?: string[];
  @IsOptional() @IsString() sessionNotes?: string;
  @IsOptional() @IsString() goalsSet?: string;
  @IsOptional() @IsString() progressNotes?: string;
  @IsOptional() @IsEnum(['low','medium','high','critical']) riskLevel?: string;
  @IsOptional() @IsEnum(['resolved','ongoing','referred_external','referred_hoi',
                         'no_further_action','crisis_intervention']) outcome?: string;
  @IsOptional() @IsDateString() nextSessionDate?: string;
  @IsOptional() @IsString() externalReferral?: string;
  @IsOptional() @IsBoolean() parentInformed?: boolean;
  @IsOptional() @IsString() parentInformedNotes?: string;
}

export class RecordBehaviourDto {
  @IsNotEmpty() @IsUUID()   learnerId: string;
  @IsOptional() @IsUUID()   streamId?: string;
  @IsOptional() @IsEnum(['EE','ME','AE','BE']) socialSkills?: string;
  @IsOptional() @IsEnum(['EE','ME','AE','BE']) selfManagement?: string;
  @IsOptional() @IsEnum(['EE','ME','AE','BE']) responsibility?: string;
  @IsOptional() @IsEnum(['EE','ME','AE','BE']) respectForOthers?: string;
  @IsOptional() @IsEnum(['EE','ME','AE','BE']) punctuality?: string;
  @IsOptional() @IsEnum(['EE','ME','AE','BE']) participation?: string;
  @IsOptional() @IsEnum(['EE','ME','AE','BE']) overallBehaviour?: string;
  @IsOptional() @IsString() teacherComment?: string;
  @IsNotEmpty() @IsString() academicYear: string;
  @IsNotEmpty() @IsEnum(['term_1','term_2','term_3']) term: string;
}

export class NotifyParentDto {
  @IsNotEmpty() @IsUUID()   incidentId: string;
  @IsNotEmpty() @IsEnum(['phone_call','sms','email','whatsapp','in_person','letter']) channel: string;
  @IsNotEmpty() @IsString() summary: string;
  @IsOptional() @IsUUID()   parentId?: string;
}


// ─────────────────────────────────────────────────────────────
// src/modules/discipline/services/incident.service.ts
// ─────────────────────────────────────────────────────────────
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

@Injectable()
export class IncidentService {
  constructor(
    @InjectRepository(Incident)               private incidentRepo: Repository<Incident>,
    @InjectRepository(DisciplineAction)       private actionRepo:   Repository<DisciplineAction>,
    @InjectRepository(DisciplineCommunication)private commRepo:     Repository<DisciplineCommunication>,
    @InjectRepository(Learner)                private learnerRepo:  Repository<Learner>,
    @InjectRepository(AuditLog)               private auditRepo:    Repository<AuditLog>,
    private dataSource: DataSource,
  ) {}

  // ── CREATE INCIDENT ────────────────────────────────────────
  async create(tenantId: string, schoolId: string, dto: CreateIncidentDto, reportedBy: string) {
    const learner = await this.learnerRepo.findOne({ where: { id: dto.learnerId, tenantId } });
    if (!learner) throw new NotFoundException('Learner not found');

    const incident = await this.incidentRepo.save(
      this.incidentRepo.create({
        tenantId, schoolId,
        learnerId:    dto.learnerId,
        reportedBy,
        categoryId:   dto.categoryId,
        title:        dto.title,
        description:  dto.description,
        location:     dto.location,
        incidentDate: new Date(dto.incidentDate),
        incidentTime: dto.incidentTime,
        severity:     dto.severity as any,
        witnessedBy:  dto.witnessedBy,
        otherLearnersInvolved: dto.otherLearnersInvolved,
        injuriesReported: dto.injuriesReported || false,
        injuryDetails:    dto.injuryDetails,
        notes:            dto.notes,
        status:           'open',
        parentNotified:   false,
      })
    );

    await this.auditRepo.save({
      tenantId, userId: reportedBy,
      action: 'incident.created', entityType: 'incidents', entityId: incident.id,
      newValues: { learnerId: dto.learnerId, severity: dto.severity, title: dto.title },
    });

    // Auto-escalate critical incidents to HOI
    if (dto.severity === 'critical') {
      // Will be picked up by notification job
    }

    return incident;
  }

  // ── LIST INCIDENTS ─────────────────────────────────────────
  async findAll(tenantId: string, filters: {
    learnerId?: string; severity?: string; status?: string;
    dateFrom?: string; dateTo?: string; page?: number; limit?: number;
  }) {
    const { learnerId, severity, status, dateFrom, dateTo, page = 1, limit = 30 } = filters;

    const qb = this.incidentRepo.createQueryBuilder('i')
      .where('i.tenant_id = :tenantId AND i.deleted_at IS NULL', { tenantId })
      .leftJoin('i.learner', 'l').addSelect(['l.firstName','l.lastName','l.admissionNumber'])
      .leftJoin('i.category', 'c').addSelect(['c.name'])
      .leftJoin('i.reporter', 'r').addSelect(['r.firstName','r.lastName'])
      .orderBy('i.incident_date', 'DESC')
      .addOrderBy('i.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (learnerId) qb.andWhere('i.learner_id = :learnerId',     { learnerId });
    if (severity)  qb.andWhere('i.severity = :severity',        { severity });
    if (status)    qb.andWhere('i.status = :status',            { status });
    if (dateFrom)  qb.andWhere('i.incident_date >= :dateFrom',  { dateFrom });
    if (dateTo)    qb.andWhere('i.incident_date <= :dateTo',    { dateTo });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ── GET ONE (with actions and comms) ──────────────────────
  async findOne(tenantId: string, id: string) {
    const incident = await this.incidentRepo.findOne({
      where: { id, tenantId, deletedAt: null },
      relations: ['learner','learner.stream','category','reporter',
                  'actions','actions.decider','communications'],
    });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }

  // ── RECORD DISCIPLINE ACTION ───────────────────────────────
  async recordAction(tenantId: string, dto: RecordActionDto, decidedBy: string) {
    const incident = await this.incidentRepo.findOne({
      where: { id: dto.incidentId, tenantId },
    });
    if (!incident) throw new NotFoundException('Incident not found');

    // Validate serious actions require HOI approval
    const seriousActions = ['suspension_external','expulsion'];
    if (seriousActions.includes(dto.actionType) && !dto.approvedBy) {
      throw new BadRequestException(
        `${dto.actionType.replace(/_/g,' ')} requires HOI approval. Please set approvedBy.`
      );
    }

    const action = await this.actionRepo.save(
      this.actionRepo.create({
        tenantId,
        incidentId:    dto.incidentId,
        learnerId:     incident.learnerId,
        actionType:    dto.actionType as any,
        actionDate:    dto.actionDate ? new Date(dto.actionDate) : new Date(),
        description:   dto.description,
        suspensionDays: dto.suspensionDays,
        suspensionStart: dto.suspensionStart ? new Date(dto.suspensionStart) : undefined,
        suspensionEnd:   dto.suspensionEnd   ? new Date(dto.suspensionEnd)   : undefined,
        reinstatementConditions: dto.reinstatementConditions,
        decidedBy,
        approvedBy:    dto.approvedBy,
        followUpRequired: dto.followUpRequired || false,
        followUpDate:    dto.followUpDate ? new Date(dto.followUpDate) : undefined,
        status:          'active',
      })
    );

    // Update incident status
    await this.incidentRepo.update(incident.id, { status: 'action_taken' });

    await this.auditRepo.save({
      tenantId, userId: decidedBy,
      action: 'discipline.action_recorded', entityType: 'discipline_actions', entityId: action.id,
      newValues: { actionType: dto.actionType, incidentId: dto.incidentId },
    });

    return action;
  }

  // ── NOTIFY PARENT ──────────────────────────────────────────
  async notifyParent(tenantId: string, dto: NotifyParentDto, notifiedBy: string) {
    const incident = await this.incidentRepo.findOne({
      where: { id: dto.incidentId, tenantId },
      relations: ['learner'],
    });
    if (!incident) throw new NotFoundException('Incident not found');

    // Log the communication
    await this.commRepo.save(this.commRepo.create({
      tenantId,
      incidentId:    dto.incidentId,
      learnerId:     incident.learnerId,
      parentId:      dto.parentId || incident.learner?.parentId,
      communicatedBy: notifiedBy,
      channel:       dto.channel as any,
      direction:     'outgoing',
      summary:       dto.summary,
    }));

    // Mark incident as parent notified
    await this.incidentRepo.update(dto.incidentId, {
      parentNotified:   true,
      parentNotifiedAt: new Date(),
      parentNotifiedBy: notifiedBy,
    });

    // Queue actual notification via Communication Module
    // For SMS/WhatsApp: uses learner.guardianPhone
    // For email: uses learner.guardianEmail

    return { message: `Parent notification logged via ${dto.channel}.` };
  }

  // ── CLOSE INCIDENT ─────────────────────────────────────────
  async close(tenantId: string, id: string, userId: string, notes?: string) {
    const incident = await this.incidentRepo.findOne({ where: { id, tenantId } });
    if (!incident) throw new NotFoundException('Incident not found');

    await this.incidentRepo.update(id, {
      status: 'closed',
      notes:  notes ? `${incident.notes || ''}\n[CLOSED] ${notes}`.trim() : incident.notes,
    });

    await this.auditRepo.save({
      tenantId, userId,
      action: 'incident.closed', entityType: 'incidents', entityId: id,
    });

    return { message: 'Incident closed.' };
  }

  // ── LEARNER HISTORY ────────────────────────────────────────
  async getLearnerHistory(tenantId: string, learnerId: string) {
    const [incidents, actions, behaviour] = await Promise.all([
      this.incidentRepo.find({
        where: { tenantId, learnerId, deletedAt: null },
        relations: ['category','actions'],
        order: { incidentDate: 'DESC' },
      }),
      this.actionRepo.find({
        where: { tenantId, learnerId },
        order: { actionDate: 'DESC' },
      }),
      this.dataSource.getRepository(BehaviourRecord).find({
        where: { tenantId, learnerId },
        order: { recordedDate: 'DESC' },
      }),
    ]);

    const summary = {
      totalIncidents: incidents.length,
      byCategory: incidents.reduce((acc: any, i) => {
        const cat = i.category?.name || 'Uncategorised';
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {}),
      bySeverity: {
        minor:    incidents.filter(i => i.severity === 'minor').length,
        moderate: incidents.filter(i => i.severity === 'moderate').length,
        major:    incidents.filter(i => i.severity === 'major').length,
        critical: incidents.filter(i => i.severity === 'critical').length,
      },
      hasSuspension: actions.some(a =>
        ['suspension_in_school','suspension_external'].includes(a.actionType)
      ),
      latestRiskLevel: behaviour[0]?.overallBehaviour || 'Not assessed',
    };

    return { incidents, actions, behaviour, summary };
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/discipline/services/counselling.service.ts
// ─────────────────────────────────────────────────────────────
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class CounsellingService {
  constructor(
    @InjectRepository(CounsellingSession) private sessionRepo: Repository<CounsellingSession>,
    @InjectRepository(Learner)            private learnerRepo: Repository<Learner>,
  ) {}

  async create(tenantId: string, schoolId: string, dto: CreateCounsellingDto, counsellorId: string) {
    const learner = await this.learnerRepo.findOne({ where: { id: dto.learnerId, tenantId } });
    if (!learner) throw new NotFoundException('Learner not found');

    const session = await this.sessionRepo.save(
      this.sessionRepo.create({
        tenantId, schoolId,
        counsellorId,
        learnerId:     dto.learnerId,
        incidentId:    dto.incidentId,
        sessionDate:   new Date(dto.sessionDate),
        sessionTime:   dto.sessionTime,
        durationMinutes: dto.durationMinutes || 30,
        sessionType:   dto.sessionType as any,
        referralSource: dto.referralSource as any,
        issuesAddressed: dto.issuesAddressed || [],
        sessionNotes:  dto.sessionNotes,
        goalsSet:      dto.goalsSet,
        progressNotes: dto.progressNotes,
        riskLevel:     dto.riskLevel as any || 'low',
        outcome:       dto.outcome as any,
        nextSessionDate: dto.nextSessionDate ? new Date(dto.nextSessionDate) : undefined,
        externalReferral: dto.externalReferral,
        parentInformed: dto.parentInformed || false,
        parentInformedNotes: dto.parentInformedNotes,
        isConfidential: true,
      })
    );

    return session;
  }

  // Counselling records are confidential — only counsellor + HOI can see notes
  async findAll(tenantId: string, counsellorId: string, role: string, filters: any) {
    const qb = this.sessionRepo.createQueryBuilder('s')
      .where('s.tenant_id = :tenantId', { tenantId })
      .leftJoin('s.learner', 'l').addSelect(['l.firstName','l.lastName','l.admissionNumber'])
      .orderBy('s.session_date', 'DESC');

    // Non-HOI users only see their own sessions
    const isAdmin = ['hoi','dhois','school_admin','tenant_owner'].includes(role);
    if (!isAdmin) qb.andWhere('s.counsellor_id = :counsellorId', { counsellorId });

    if (filters.learnerId) qb.andWhere('s.learner_id = :lid', { lid: filters.learnerId });
    if (filters.riskLevel) qb.andWhere('s.risk_level = :rl',  { rl: filters.riskLevel });

    return qb.getMany();
  }

  async findOne(tenantId: string, id: string, requesterId: string, role: string) {
    const session = await this.sessionRepo.findOne({
      where: { id, tenantId },
      relations: ['learner','counsellor'],
    });
    if (!session) throw new NotFoundException('Session not found');

    // Enforce confidentiality
    const isAdmin = ['hoi','dhois','school_admin','tenant_owner'].includes(role);
    if (!isAdmin && session.counsellorId !== requesterId) {
      throw new ForbiddenException('Counselling records are confidential');
    }

    return session;
  }

  async getAtRiskLearners(tenantId: string) {
    return this.sessionRepo
      .createQueryBuilder('s')
      .innerJoin('s.learner', 'l')
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere('s.risk_level IN (:...levels)', { levels: ['high','critical'] })
      .andWhere('s.outcome NOT IN (:...done)', { done: ['resolved','no_further_action'] })
      .select(['l.id','l.firstName','l.lastName','l.admissionNumber','s.riskLevel','s.sessionDate','s.outcome'])
      .orderBy('s.session_date', 'DESC')
      .getMany();
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/discipline/services/analytics.service.ts
// Behaviour analytics + QASO-ready reports
// ─────────────────────────────────────────────────────────────
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

@Injectable()
export class DisciplineAnalyticsService {
  constructor(
    @InjectRepository(Incident)          private incidentRepo:  Repository<Incident>,
    @InjectRepository(DisciplineAction)  private actionRepo:    Repository<DisciplineAction>,
    @InjectRepository(CounsellingSession)private counselRepo:   Repository<CounsellingSession>,
    @InjectRepository(BehaviourRecord)   private behaviourRepo: Repository<BehaviourRecord>,
    private dataSource: DataSource,
  ) {}

  // ── SCHOOL-LEVEL BEHAVIOUR ANALYTICS ─────────────────────
  async getSchoolAnalytics(tenantId: string, schoolId: string, academicYear: string, term?: string) {
    const params: any[] = [tenantId, schoolId, academicYear];
    const termFilter = term ? `AND term = $${params.push(term)}` : '';

    const [incidentStats, actionStats, topCategories, monthlyTrend, counsellingStats] = await Promise.all([
      // Incidents by severity
      this.dataSource.query(`
        SELECT severity, COUNT(*) AS count
        FROM incidents
        WHERE tenant_id = $1 AND school_id = $2
          AND EXTRACT(YEAR FROM incident_date) = LEFT($3,4)::INTEGER
          AND deleted_at IS NULL
        GROUP BY severity
        ORDER BY count DESC
      `, [tenantId, schoolId, academicYear]),

      // Actions taken breakdown
      this.dataSource.query(`
        SELECT da.action_type, COUNT(*) AS count
        FROM discipline_actions da
        JOIN incidents i ON i.id = da.incident_id
        WHERE da.tenant_id = $1 AND i.school_id = $2
          AND EXTRACT(YEAR FROM da.action_date) = LEFT($3,4)::INTEGER
        GROUP BY da.action_type
        ORDER BY count DESC
      `, [tenantId, schoolId, academicYear]),

      // Top incident categories
      this.dataSource.query(`
        SELECT ic.name AS category, COUNT(*) AS count
        FROM incidents i
        JOIN incident_categories ic ON ic.id = i.category_id
        WHERE i.tenant_id = $1 AND i.school_id = $2
          AND EXTRACT(YEAR FROM i.incident_date) = LEFT($3,4)::INTEGER
          AND i.deleted_at IS NULL
        GROUP BY ic.name
        ORDER BY count DESC
        LIMIT 10
      `, [tenantId, schoolId, academicYear]),

      // Monthly incident trend
      this.dataSource.query(`
        SELECT
          TO_CHAR(incident_date,'Month') AS month,
          EXTRACT(MONTH FROM incident_date) AS month_num,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE severity = 'minor')    AS minor,
          COUNT(*) FILTER (WHERE severity = 'moderate') AS moderate,
          COUNT(*) FILTER (WHERE severity = 'major')    AS major,
          COUNT(*) FILTER (WHERE severity = 'critical') AS critical
        FROM incidents
        WHERE tenant_id = $1 AND school_id = $2
          AND EXTRACT(YEAR FROM incident_date) = LEFT($3,4)::INTEGER
          AND deleted_at IS NULL
        GROUP BY TO_CHAR(incident_date,'Month'), EXTRACT(MONTH FROM incident_date)
        ORDER BY month_num
      `, [tenantId, schoolId, academicYear]),

      // Counselling summary
      this.dataSource.query(`
        SELECT
          COUNT(*) AS total_sessions,
          COUNT(*) FILTER (WHERE risk_level = 'high')     AS high_risk,
          COUNT(*) FILTER (WHERE risk_level = 'critical') AS critical_risk,
          COUNT(DISTINCT learner_id)                       AS unique_learners
        FROM counselling_sessions
        WHERE tenant_id = $1 AND school_id = $2
          AND EXTRACT(YEAR FROM session_date) = LEFT($3,4)::INTEGER
      `, [tenantId, schoolId, academicYear]),
    ]);

    // Repeat offenders (3+ incidents)
    const repeatOffenders = await this.dataSource.query(`
      SELECT
        l.first_name, l.last_name, l.admission_number, s.name AS stream,
        COUNT(i.id) AS incident_count,
        MAX(i.incident_date) AS last_incident,
        STRING_AGG(DISTINCT i.severity, ', ') AS severities
      FROM incidents i
      JOIN learners l ON l.id = i.learner_id
      LEFT JOIN streams s ON s.id = l.stream_id
      WHERE i.tenant_id = $1 AND i.school_id = $2
        AND EXTRACT(YEAR FROM i.incident_date) = LEFT($3,4)::INTEGER
        AND i.deleted_at IS NULL
      GROUP BY l.first_name, l.last_name, l.admission_number, s.name
      HAVING COUNT(i.id) >= 3
      ORDER BY incident_count DESC
      LIMIT 20
    `, [tenantId, schoolId, academicYear]);

    return {
      academicYear, schoolId,
      summary: {
        totalIncidents: incidentStats.reduce((s: number, r: any) => s + parseInt(r.count), 0),
        bySeverity:     incidentStats,
        counsellingSessions: counsellingStats[0],
      },
      topCategories,
      actionsTaken:  actionStats,
      monthlyTrend,
      repeatOffenders,
      generatedAt:   new Date().toISOString(),
    };
  }

  // ── QASO-READY REPORT ─────────────────────────────────────
  // Quality Assurance and Standards Officer report format
  async getQasoReport(tenantId: string, schoolId: string, academicYear: string, term: string) {
    const analytics = await this.getSchoolAnalytics(tenantId, schoolId, academicYear, term);

    // Suspension summary for QASO
    const suspensions = await this.dataSource.query(`
      SELECT
        COUNT(*) FILTER (WHERE action_type = 'suspension_in_school') AS in_school,
        COUNT(*) FILTER (WHERE action_type = 'suspension_external')  AS external,
        COUNT(*) FILTER (WHERE action_type = 'expulsion')            AS expulsions,
        COALESCE(SUM(suspension_days), 0)                            AS total_days_lost
      FROM discipline_actions da
      JOIN incidents i ON i.id = da.incident_id
      WHERE da.tenant_id = $1 AND i.school_id = $2
        AND EXTRACT(YEAR FROM da.action_date) = LEFT($3,4)::INTEGER
        AND da.action_date BETWEEN
          CASE $4
            WHEN 'term_1' THEN (LEFT($3,4)::INTEGER || '-01-01')::DATE
            WHEN 'term_2' THEN (LEFT($3,4)::INTEGER || '-05-01')::DATE
            ELSE                (LEFT($3,4)::INTEGER || '-09-01')::DATE
          END
        AND CURRENT_DATE
    `, [tenantId, schoolId, academicYear, term]);

    return {
      reportTitle:   `Discipline & Guidance Report — ${term.replace('_',' ')} ${academicYear}`,
      generatedBy:   'ZARODA SCHOOL MANAGEMENT SYSTEM',
      generatedAt:   new Date().toISOString(),
      academicYear,
      term,
      analytics,
      suspensions:   suspensions[0],
      format:        'QASO-compatible',
      note:          'For submission to Sub-County Quality Assurance and Standards Officer',
    };
  }

  // ── BEHAVIOUR TREND (per learner) ─────────────────────────
  async getLearnerBehaviourTrend(tenantId: string, learnerId: string) {
    const records = await this.behaviourRepo.find({
      where: { tenantId, learnerId },
      order: { academicYear: 'ASC', term: 'ASC' },
    });

    const incidents = await this.incidentRepo.count({
      where: { tenantId, learnerId, deletedAt: null },
    });

    return {
      behaviourHistory: records,
      totalIncidents:   incidents,
      trend:            this.computeTrend(records),
    };
  }

  private computeTrend(records: any[]): 'improving' | 'stable' | 'declining' | 'insufficient_data' {
    if (records.length < 2) return 'insufficient_data';
    const levelScore: Record<string, number> = { EE: 4, ME: 3, AE: 2, BE: 1 };
    const scores = records.map(r => levelScore[r.overallBehaviour] || 0).filter(s => s > 0);
    if (scores.length < 2) return 'insufficient_data';
    const recent   = scores.slice(-2);
    const delta    = recent[1] - recent[0];
    if (delta > 0)  return 'improving';
    if (delta < 0)  return 'declining';
    return 'stable';
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/discipline/discipline.controller.ts
// ─────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Patch, Body, Param,
  Query, UseGuards, HttpCode, HttpStatus
} from '@nestjs/common';

@Controller('api/v1/discipline')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DisciplineController {
  constructor(
    private incidentService:  IncidentService,
    private counsellingService: CounsellingService,
    private behaviourService: BehaviourService,
    private analyticsService: DisciplineAnalyticsService,
  ) {}

  // ── INCIDENTS ─────────────────────────────────────────────
  @Post('incidents')
  @Roles('tenant_owner','school_admin','hoi','dhois','class_teacher','subject_teacher','overall_class_teacher')
  @HttpCode(HttpStatus.CREATED)
  createIncident(@CurrentUser() u: User, @Body() dto: CreateIncidentDto) {
    return this.incidentService.create(u.tenantId, u.schoolId, dto, u.id);
  }

  @Get('incidents')
  @Roles('tenant_owner','school_admin','hoi','dhois','class_teacher','overall_class_teacher')
  listIncidents(@CurrentUser() u: User, @Query() filters: any) {
    return this.incidentService.findAll(u.tenantId, filters);
  }

  @Get('incidents/:id')
  @Roles('tenant_owner','school_admin','hoi','dhois','class_teacher','overall_class_teacher')
  getIncident(@CurrentUser() u: User, @Param('id') id: string) {
    return this.incidentService.findOne(u.tenantId, id);
  }

  @Post('incidents/:id/close')
  @Roles('tenant_owner','school_admin','hoi','dhois')
  closeIncident(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Body('notes') notes?: string,
  ) {
    return this.incidentService.close(u.tenantId, id, u.id, notes);
  }

  // ── DISCIPLINE ACTIONS ────────────────────────────────────
  @Post('actions')
  @Roles('tenant_owner','school_admin','hoi','dhois')
  recordAction(@CurrentUser() u: User, @Body() dto: RecordActionDto) {
    return this.incidentService.recordAction(u.tenantId, dto, u.id);
  }

  // ── PARENT NOTIFICATIONS ──────────────────────────────────
  @Post('notify-parent')
  @Roles('tenant_owner','school_admin','hoi','dhois','class_teacher','overall_class_teacher')
  notifyParent(@CurrentUser() u: User, @Body() dto: NotifyParentDto) {
    return this.incidentService.notifyParent(u.tenantId, dto, u.id);
  }

  // ── LEARNER HISTORY ───────────────────────────────────────
  @Get('learners/:learnerId/history')
  @Roles('tenant_owner','school_admin','hoi','dhois','class_teacher','overall_class_teacher')
  getLearnerHistory(@CurrentUser() u: User, @Param('learnerId') id: string) {
    return this.incidentService.getLearnerHistory(u.tenantId, id);
  }

  @Get('learners/:learnerId/behaviour-trend')
  @Roles('tenant_owner','school_admin','hoi','dhois','class_teacher','parent')
  getBehaviourTrend(@CurrentUser() u: User, @Param('learnerId') id: string) {
    return this.analyticsService.getLearnerBehaviourTrend(u.tenantId, id);
  }

  // ── COUNSELLING ───────────────────────────────────────────
  @Post('counselling')
  @Roles('tenant_owner','school_admin','hoi','dhois','class_teacher')
  createCounsellingSession(@CurrentUser() u: User, @Body() dto: CreateCounsellingDto) {
    return this.counsellingService.create(u.tenantId, u.schoolId, dto, u.id);
  }

  @Get('counselling')
  @Roles('tenant_owner','school_admin','hoi','dhois','class_teacher')
  listCounsellings(@CurrentUser() u: User, @Query() filters: any) {
    return this.counsellingService.findAll(u.tenantId, u.id, u.role, filters);
  }

  @Get('counselling/:id')
  @Roles('tenant_owner','school_admin','hoi','dhois','class_teacher')
  getCounselling(@CurrentUser() u: User, @Param('id') id: string) {
    return this.counsellingService.findOne(u.tenantId, id, u.id, u.role);
  }

  @Get('counselling/at-risk')
  @Roles('tenant_owner','school_admin','hoi','dhois')
  getAtRisk(@CurrentUser() u: User) {
    return this.counsellingService.getAtRiskLearners(u.tenantId);
  }

  // ── BEHAVIOUR RECORDS ─────────────────────────────────────
  @Post('behaviour')
  @Roles('class_teacher','subject_teacher','overall_class_teacher','hoi','dhois')
  recordBehaviour(@CurrentUser() u: User, @Body() dto: RecordBehaviourDto) {
    return this.behaviourService.record(u.tenantId, dto, u.id);
  }

  @Get('behaviour')
  @Roles('tenant_owner','school_admin','hoi','dhois','class_teacher','parent')
  getBehaviour(@CurrentUser() u: User, @Query() filters: any) {
    return this.behaviourService.findAll(u.tenantId, filters);
  }

  // ── ANALYTICS ─────────────────────────────────────────────
  @Get('analytics')
  @Roles('tenant_owner','school_admin','hoi','dhois')
  getAnalytics(
    @CurrentUser() u: User,
    @Query('academicYear') academicYear: string,
    @Query('term') term: string,
  ) {
    return this.analyticsService.getSchoolAnalytics(u.tenantId, u.schoolId, academicYear, term);
  }

  @Get('analytics/qaso-report')
  @Roles('tenant_owner','school_admin','hoi')
  getQasoReport(
    @CurrentUser() u: User,
    @Query('academicYear') academicYear: string,
    @Query('term') term: string,
  ) {
    return this.analyticsService.getQasoReport(u.tenantId, u.schoolId, academicYear, term);
  }
}
