// ============================================================
// ZARODA SPORTS MANAGEMENT SYSTEM — TWO-TIER BACKEND
// MODULE 07: Sports Service + Controller
// TIER 1: SchoolSportsService  — manages school-level sports
// TIER 2: BaseSportsService    — manages cross-school championships
//         PushQualificationService — the school→base pipeline
// ============================================================

// ─────────────────────────────────────────────────────────────
// src/modules/sports/services/school-sports.service.ts
// ─────────────────────────────────────────────────────────────
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class SchoolSportsService {
  constructor(
    @InjectRepository(SchoolTeam)       private teamRepo:    Repository<SchoolTeam>,
    @InjectRepository(SchoolTeamMember) private memberRepo:  Repository<SchoolTeamMember>,
    @InjectRepository(AthleteProfile)   private profileRepo: Repository<AthleteProfile>,
    @InjectRepository(InternalCompetition) private compRepo: Repository<InternalCompetition>,
    @InjectRepository(InternalFixture)  private fixtureRepo: Repository<InternalFixture>,
    @InjectRepository(QualificationRegister) private qualRepo: Repository<QualificationRegister>,
    @InjectRepository(QualifiedAthlete) private qualAthleteRepo: Repository<QualifiedAthlete>,
    @InjectRepository(TalentReport)     private talentRepo:  Repository<TalentReport>,
    @InjectRepository(Learner)          private learnerRepo: Repository<Learner>,
    private dataSource: DataSource,
  ) {}

  // ── TEAMS ─────────────────────────────────────────────────
  async createTeam(tenantId: string, schoolId: string, dto: any) {
    return this.teamRepo.save(this.teamRepo.create({ tenantId, schoolId, ...dto }));
  }

  async deleteTeam(tenantId: string, teamId: string) {
    const team = await this.teamRepo.findOne({ where: { id: teamId, tenantId } });
    if (!team) throw new NotFoundException('Team not found');
    // Remove squad members first, then the team.
    await this.memberRepo.delete({ teamId, tenantId }).catch(() => null);
    await this.teamRepo.delete({ id: teamId, tenantId });
    return { message: 'Team deleted', id: teamId };
  }

  async addSquadMember(tenantId: string, teamId: string, learnerId: string, position?: string, jersey?: string) {
    const exists = await this.memberRepo.findOne({ where: { teamId, learnerId } });
    if (exists) throw new ConflictException('Learner already in squad');

    const member = await this.memberRepo.save(
      this.memberRepo.create({ tenantId, teamId, learnerId, position, jerseyNumber: jersey, status: 'active' })
    );

    // Auto-create athlete profile if not exists
    const profile = await this.profileRepo.findOne({ where: { tenantId, learnerId } });
    if (!profile) {
      await this.profileRepo.save(this.profileRepo.create({ tenantId, learnerId, isActive: true }));
    }
    return member;
  }

  async getSquad(tenantId: string, teamId: string) {
    return this.memberRepo.find({
      where: { tenantId, teamId, status: 'active' as any },
      relations: ['learner'],
      order: { jerseyNumber: 'ASC' },
    });
  }

  // ── INTERNAL COMPETITIONS ────────────────────────────────
  async createInternalCompetition(tenantId: string, schoolId: string, dto: any, userId: string) {
    return this.compRepo.save(this.compRepo.create({
      tenantId, schoolId, ...dto, status: 'planned', createdBy: userId,
    }));
  }

  async recordInternalResult(tenantId: string, fixtureId: string, homeScore: number, awayScore: number, userId: string) {
    const fixture = await this.fixtureRepo.findOne({ where: { id: fixtureId, tenantId } });
    if (!fixture) throw new NotFoundException('Fixture not found');
    await this.fixtureRepo.update(fixtureId, {
      homeScore, awayScore, status: 'completed', recordedBy: userId,
    });
    return { message: 'Result recorded.' };
  }

  // ── QUALIFICATION REGISTER ────────────────────────────────
  // School nominates qualified teams/athletes for a Base championship
  async createQualification(tenantId: string, schoolId: string, dto: {
    name: string;
    disciplineId: string;
    competitionLevel: string;
    academicYear: string;
    teamId?: string;
    qualifiedVia?: string;
    qualificationDate?: string;
    notes?: string;
  }, userId: string) {
    return this.qualRepo.save(this.qualRepo.create({
      tenantId, schoolId, ...dto, status: 'qualified',
    }));
  }

  async addQualifiedAthlete(tenantId: string, qualificationId: string, dto: {
    learnerId: string; events?: string[]; personalBest?: string; seedPosition?: number;
  }) {
    const qual = await this.qualRepo.findOne({ where: { id: qualificationId, tenantId } });
    if (!qual) throw new NotFoundException('Qualification register not found');

    const exists = await this.qualAthleteRepo.findOne({
      where: { qualificationId, learnerId: dto.learnerId },
    });
    if (exists) throw new ConflictException('Athlete already in this qualification');

    return this.qualAthleteRepo.save(
      this.qualAthleteRepo.create({ tenantId, qualificationId, ...dto })
    );
  }

  async getQualifications(tenantId: string, filters: {
    academicYear?: string; status?: string; competitionLevel?: string;
  }) {
    const qb = this.qualRepo.createQueryBuilder('q')
      .where('q.tenant_id = :tenantId', { tenantId })
      .leftJoin('q.discipline', 'd').addSelect(['d.name','d.category'])
      .leftJoin('q.team', 't').addSelect(['t.name'])
      .orderBy('q.created_at', 'DESC');

    if (filters.academicYear)    qb.andWhere('q.academic_year = :yr',     { yr: filters.academicYear });
    if (filters.status)          qb.andWhere('q.status = :s',             { s: filters.status });
    if (filters.competitionLevel) qb.andWhere('q.competition_level = :l', { l: filters.competitionLevel });

    return qb.getMany();
  }

  // ── GAMES DEPT DASHBOARD ──────────────────────────────────
  async getDashboard(tenantId: string) {
    const [teams, qualifications, topAthletes, pendingPush] = await Promise.all([
      this.teamRepo.count({ where: { tenantId, isActive: true } }),
      this.qualRepo.count({ where: { tenantId } }),
      this.profileRepo.find({
        where: { tenantId, isActive: true },
        relations: ['learner','primaryDiscipline'],
        order: { talentScore: 'DESC' },
        take: 5,
      }),
      this.qualRepo.count({ where: { tenantId, status: 'qualified' as any } }),
    ]);

    return { totalTeams: teams, totalQualifications: qualifications, topAthletes, pendingPush };
  }

  // ── AI TALENT REPORT ──────────────────────────────────────
  async generateTalentReport(tenantId: string, learnerId: string, academicYear: string, term: string) {
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const [learner, profile] = await Promise.all([
      this.learnerRepo.findOne({ where: { id: learnerId, tenantId } }),
      this.profileRepo.findOne({ where: { learnerId, tenantId }, relations: ['primaryDiscipline'] }),
    ]);
    if (!learner) throw new NotFoundException('Athlete not found');

    const prompt = `You are a Kenyan school sports talent analyst.
Athlete: ${learner.firstName} ${learner.lastName}, ${learner.gender}, ${learner.gradeLevel?.replace('_',' ')}
Primary Sport: ${profile?.primaryDiscipline?.name || 'Not specified'}
Height: ${profile?.heightCm || '?'}cm, Weight: ${profile?.weightKg || '?'}kg
Current Talent Score: ${profile?.talentScore || 'Unscored'}/10
Personal Bests: ${JSON.stringify(profile?.personalBests || {})}

Generate a talent assessment. Return ONLY valid JSON:
{
  "talentScore": 0.0-10.0,
  "strengths": ["...","...","..."],
  "areasToImprove": ["...","..."],
  "recommendation": "2 sentences for coach"
}`;

    try {
      const response = await claude.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      });
      const raw    = (response.content[0] as any).text || '';
      const parsed = JSON.parse(raw.replace(/```json|```/g,'').trim());

      await this.talentRepo.save(this.talentRepo.create({
        tenantId, learnerId, academicYear, term,
        disciplineId: profile?.primaryDisciplineId,
        talentScore:  parsed.talentScore,
        strengths:    parsed.strengths,
        areasToImprove: parsed.areasToImprove,
        recommendation: parsed.recommendation,
        aiGenerated:  true,
      }));

      if (profile) await this.profileRepo.update(profile.id, { talentScore: parsed.talentScore });

      return { ...parsed, learnerName: `${learner.firstName} ${learner.lastName}` };
    } catch {
      return { error: 'AI analysis temporarily unavailable', learnerId };
    }
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/sports/services/push-qualification.service.ts
// THE KEY BRIDGE: School → ZARODA Sports Base
// ─────────────────────────────────────────────────────────────
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

@Injectable()
export class PushQualificationService {
  constructor(
    @InjectRepository(QualificationRegister) private qualRepo: Repository<QualificationRegister>,
    @InjectRepository(QualifiedAthlete)      private qAthleteRepo: Repository<QualifiedAthlete>,
    @InjectRepository(BaseChampionship)      private baseChampRepo: Repository<BaseChampionship>,
    @InjectRepository(BaseChampionshipRegistration) private baseRegRepo: Repository<BaseChampionshipRegistration>,
    @InjectRepository(BaseAthlete)           private baseAthleteRepo: Repository<BaseAthlete>,
    @InjectRepository(Learner)               private learnerRepo: Repository<Learner>,
    @InjectRepository(School)               private schoolRepo: Repository<School>,
    private dataSource: DataSource,
  ) {}

  // ── PUSH TEAM / ATHLETES TO BASE CHAMPIONSHIP ─────────────
  // School HOI/Games Dept triggers this when ready to register for Base
  async pushToBase(tenantId: string, schoolId: string, qualificationId: string, baseChampionshipId: string, pushedBy: string) {
    const [qual, baseChamp, school] = await Promise.all([
      this.qualRepo.findOne({
        where: { id: qualificationId, tenantId },
        relations: ['team','team.members','team.members.learner'],
      }),
      this.baseChampRepo.findOne({ where: { id: baseChampionshipId } }),
      this.schoolRepo.findOne({ where: { id: schoolId } }),
    ]);

    if (!qual)      throw new NotFoundException('Qualification register not found');
    if (!baseChamp) throw new NotFoundException('Base championship not found');
    if (qual.status !== 'qualified') {
      throw new BadRequestException(`Cannot push — qualification status is "${qual.status}"`);
    }
    // ZARODA Sports Base is FREE — no payment check needed
    if (baseChamp.status === 'completed' || baseChamp.status === 'cancelled') {
      throw new BadRequestException('Base championship is not accepting registrations');
    }

    return this.dataSource.transaction(async (manager) => {
      // 1. Register school for this Base championship
      let baseReg = await manager.findOne(BaseChampionshipRegistration, {
        where: { championshipId: baseChampionshipId, schoolId },
      });

      if (!baseReg) {
        baseReg = await manager.save(BaseChampionshipRegistration, manager.create(BaseChampionshipRegistration, {
          championshipId: baseChampionshipId,
          tenantId,
          schoolId,
          schoolName:     school?.name || 'Unknown School',
          qualificationId,
          registeredBy:   pushedBy,
          teamName:       qual.team?.name,
          status:         'registered',
        }));
      }

      // 2. Register individual athletes (for athletics) or team members (for team sports)
      const qualifiedAthletes = await manager.find(QualifiedAthlete, {
        where: { qualificationId, tenantId },
        relations: ['learner'],
      });

      const athletesList = qualifiedAthletes.length > 0
        ? qualifiedAthletes
        : (qual.team?.members || []).map((m: any) => ({
            learnerId: m.learnerId,
            learner:   m.learner,
            events:    [],
            personalBest: null,
            seedPosition: null,
          }));

      const registeredAthletes = [];
      let bibCounter = await this.getNextBibNumber(baseChampionshipId, manager);

      for (const qa of athletesList) {
        const learner = qa.learner || await this.learnerRepo.findOne({ where: { id: qa.learnerId } });
        if (!learner) continue;

        const existing = await manager.findOne(BaseAthlete, {
          where: { championshipId: baseChampionshipId, learnerId: qa.learnerId },
        });
        if (existing) continue; // already registered

        const bib = String(bibCounter).padStart(3, '0');
        bibCounter++;

        const baseAthlete = await manager.save(BaseAthlete, manager.create(BaseAthlete, {
          championshipId:  baseChampionshipId,
          registrationId:  baseReg.id,
          tenantId,
          learnerId:       qa.learnerId,
          schoolName:      school?.name || 'Unknown School',
          firstName:       learner.firstName,
          lastName:        learner.lastName,
          gender:          learner.gender,
          dateOfBirth:     learner.dateOfBirth,
          gradeLevel:      learner.gradeLevel,
          events:          qa.events || [],
          personalBest:    qa.personalBest,
          seedPosition:    qa.seedPosition,
          bibNumber:       bib,
          bibAssignedAt:   new Date(),
          status:          'registered',
        }));

        // Write bib back to qualified_athletes
        await manager.update(QualifiedAthlete,
          { qualificationId, learnerId: qa.learnerId },
          { baseBibNumber: bib, baseAthleteId: baseAthlete.id }
        );

        registeredAthletes.push({
          name:      `${learner.firstName} ${learner.lastName}`,
          bibNumber: bib,
          events:    qa.events,
        });
      }

      // 3. Update qualification status
      await manager.update(QualificationRegister, qualificationId, {
        status:            'registered',
        baseChampionshipId,
        pushedAt:          new Date(),
        pushedBy,
      });

      return {
        championshipName: baseChamp.name,
        schoolName:       school?.name,
        registrationId:   baseReg.id,
        athletesRegistered: registeredAthletes.length,
        athletes:         registeredAthletes,
        message:          `✅ ${registeredAthletes.length} athlete(s) successfully registered for "${baseChamp.name}". Bib numbers assigned.`,
      };
    });
  }

  // ── GENERATE BIB SHEET (for a school at a base championship) ─
  async generateBibSheet(baseChampionshipId: string, schoolId: string) {
    const [champ, athletes] = await Promise.all([
      this.baseChampRepo.findOne({ where: { id: baseChampionshipId } }),
      this.baseAthleteRepo.find({
        where: { championshipId: baseChampionshipId },
        order: { bibNumber: 'ASC' },
      }),
    ]);

    if (!champ) throw new NotFoundException('Championship not found');

    const schoolAthletes = schoolId
      ? athletes.filter(a => a.schoolName === athletes.find(x => x.schoolName)?.schoolName)
      : athletes;

    return {
      championship: {
        name:       champ.name,
        level:      champ.level,
        venue:      champ.venue,
        startDate:  champ.startDate,
        academicYear: champ.academicYear,
      },
      athletes: schoolAthletes.map(a => ({
        bibNumber:  a.bibNumber,
        firstName:  a.firstName,
        lastName:   a.lastName,
        schoolName: a.schoolName,
        events:     a.events,
        gender:     a.gender,
        gradeLevel: a.gradeLevel,
      })),
      totalAthletes: schoolAthletes.length,
      generatedAt:   new Date().toISOString(),
      poweredBy:     'ZARODA SPORTS MANAGEMENT SYSTEM — From Registration to Champions',
    };
  }

  private async getNextBibNumber(championshipId: string, manager: any): Promise<number> {
    const result = await manager.query(
      `SELECT COALESCE(MAX(bib_number::integer), 0) + 1 AS next FROM base_athletes WHERE championship_id = $1`,
      [championshipId]
    );
    return result[0]?.next || 1;
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/sports/services/base-sports.service.ts
// Manages the Base championship platform (ZARODA Sports Base)
// ─────────────────────────────────────────────────────────────
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

@Injectable()
export class BaseSportsService {
  constructor(
    @InjectRepository(BaseChampionship)         private champRepo:      Repository<BaseChampionship>,
    @InjectRepository(BaseChampionshipRegistration) private regRepo:    Repository<BaseChampionshipRegistration>,
    @InjectRepository(BaseAthlete)              private athleteRepo:    Repository<BaseAthlete>,
    @InjectRepository(BaseFixture)              private fixtureRepo:    Repository<BaseFixture>,
    @InjectRepository(BaseFixtureResult)        private resultRepo:     Repository<BaseFixtureResult>,
    @InjectRepository(BaseAthleticsResult)      private athResultRepo:  Repository<BaseAthleticsResult>,
    @InjectRepository(BaseStanding)             private standingRepo:   Repository<BaseStanding>,
    private dataSource: DataSource,
  ) {}

  // ── CREATE CHAMPIONSHIP (super admin) ─────────────────────
  async createChampionship(dto: any, createdBy: string) {
    return this.champRepo.save(this.champRepo.create({ ...dto, createdBy, status: 'upcoming' }));
  }

  // ── LIST OPEN CHAMPIONSHIPS (schools browse to register) ──
  async listOpen(filters: { level?: string; academicYear?: string; disciplineId?: string }) {
    const qb = this.champRepo.createQueryBuilder('c')
      .where('c.status IN (:...statuses)', { statuses: ['upcoming','registration_open'] })
      .orderBy('c.start_date', 'ASC');

    if (filters.level)        qb.andWhere('c.level = :level',           { level: filters.level });
    if (filters.academicYear) qb.andWhere('c.academic_year = :yr',      { yr: filters.academicYear });
    if (filters.disciplineId) qb.andWhere('c.discipline_id = :did',     { did: filters.disciplineId });

    return qb.getMany();
  }

  // ── RECORD ATHLETICS RESULT ───────────────────────────────
  async recordAthleticsResult(dto: {
    championshipId: string;
    fixtureId?: string;
    baseAthleteId: string;
    eventName: string;
    heatNumber?: number;
    resultValue?: number;
    resultUnit?: string;
    windSpeed?: number;
    position?: number;
    isPersonalBest?: boolean;
    isChampionshipRecord?: boolean;
    dns?: boolean;
    dnf?: boolean;
    dq?: boolean;
    notes?: string;
  }, recordedBy: string) {
    const result = await this.athResultRepo.save(
      this.athResultRepo.create({ ...dto, recordedBy })
    );

    // Update athlete status to 'competing' if result recorded
    await this.athleteRepo.update(dto.baseAthleteId, { status: 'competing' });

    return result;
  }

  // ── RECORD TEAM MATCH RESULT + UPDATE STANDINGS ───────────
  async recordMatchResult(fixtureId: string, dto: any, recordedBy: string) {
    const fixture = await this.fixtureRepo.findOne({ where: { id: fixtureId } });
    if (!fixture) throw new NotFoundException('Fixture not found');

    return this.dataSource.transaction(async (manager) => {
      const result = await manager.save(BaseFixtureResult, manager.create(BaseFixtureResult, {
        fixtureId, ...dto, recordedBy,
      }));

      await manager.update(BaseFixture, fixtureId, { status: 'completed' });

      if (fixture.homeRegId && fixture.awayRegId && dto.homeScore !== undefined) {
        await this.updateStandings(manager, fixture.championshipId,
          fixture.homeRegId, fixture.awayRegId,
          dto.homeScore, dto.awayScore, dto.isDraw,
          fixture.homeSchoolName, fixture.awaySchoolName
        );
      }

      return result;
    });
  }

  // ── GET STANDINGS ─────────────────────────────────────────
  async getStandings(championshipId: string) {
    const standings = await this.standingRepo.find({
      where: { championshipId },
      order: { points: 'DESC', goalDifference: 'DESC', goalsFor: 'DESC' },
    });
    return standings.map((s, i) => ({ ...s, position: i + 1 }));
  }

  // ── ATHLETICS LEADERBOARD (for an event) ──────────────────
  async getAthleticsLeaderboard(championshipId: string, eventName: string) {
    return this.athResultRepo.find({
      where: { championshipId, eventName },
      relations: ['baseAthlete'],
      order: { resultValue: 'ASC' },        // ascending = faster for time events
    });
  }

  // ── REGISTERED SCHOOLS FOR A CHAMPIONSHIP ─────────────────
  async getRegisteredSchools(championshipId: string) {
    return this.regRepo.find({
      where: { championshipId },
      order: { schoolName: 'ASC' },
    });
  }

  // ── REGISTERED ATHLETES FOR A CHAMPIONSHIP ────────────────
  async getRegisteredAthletes(championshipId: string, schoolId?: string) {
    const qb = this.athleteRepo.createQueryBuilder('a')
      .where('a.championship_id = :championshipId', { championshipId })
      .orderBy('a.bib_number', 'ASC');

    if (schoolId) qb.andWhere('a.tenant_id = :tid', { tid: schoolId });

    return qb.getMany();
  }

  private async updateStandings(
    manager: any, championshipId: string,
    homeRegId: string, awayRegId: string,
    homeScore: number, awayScore: number, isDraw: boolean,
    homeSchoolName: string, awaySchoolName: string,
  ) {
    const upsert = async (regId: string, schoolName: string, gf: number, ga: number, win: boolean, draw: boolean) => {
      let s = await manager.findOne(BaseStanding, { where: { championshipId, registrationId: regId } });
      if (!s) s = manager.create(BaseStanding, { championshipId, registrationId: regId, schoolName });
      s.played       = (s.played || 0) + 1;
      s.won          = (s.won    || 0) + (win  ? 1 : 0);
      s.drawn        = (s.drawn  || 0) + (draw ? 1 : 0);
      s.lost         = (s.lost   || 0) + (!win && !draw ? 1 : 0);
      s.goalsFor     = (s.goalsFor     || 0) + gf;
      s.goalsAgainst = (s.goalsAgainst || 0) + ga;
      await manager.save(BaseStanding, s);
    };

    if (isDraw) {
      await upsert(homeRegId, homeSchoolName, homeScore, awayScore, false, true);
      await upsert(awayRegId, awaySchoolName, awayScore, homeScore, false, true);
    } else if (homeScore > awayScore) {
      await upsert(homeRegId, homeSchoolName, homeScore, awayScore, true,  false);
      await upsert(awayRegId, awaySchoolName, awayScore, homeScore, false, false);
    } else {
      await upsert(homeRegId, homeSchoolName, homeScore, awayScore, false, false);
      await upsert(awayRegId, awaySchoolName, awayScore, homeScore, true,  false);
    }
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/sports/sports.controller.ts — all endpoints
// ─────────────────────────────────────────────────────────────
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';

@Controller('api/v1/sports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SportsController {
  constructor(
    private schoolSports:     SchoolSportsService,
    private pushService:      PushQualificationService,
    private baseSports:       BaseSportsService,
  ) {}

  // ── TIER 1: SCHOOL SPORTS ─────────────────────────────────
  @Get('dashboard')
  @Roles('tenant_owner','school_admin','hoi','games_dept')
  getDashboard(@CurrentUser() u: User) {
    return this.schoolSports.getDashboard(u.tenantId);
  }

  @Post('teams')
  @Roles('tenant_owner','school_admin','hoi','games_dept')
  createTeam(@CurrentUser() u: User, @Body() dto: any) {
    return this.schoolSports.createTeam(u.tenantId, u.schoolId, dto);
  }

  @Delete('teams/:id')
  @Roles('tenant_owner','school_admin','hoi','games_dept')
  deleteTeam(@CurrentUser() u: User, @Param('id') id: string) {
    return this.schoolSports.deleteTeam(u.tenantId, id);
  }

  @Post('teams/:id/members')
  @Roles('tenant_owner','school_admin','hoi','games_dept')
  addMember(@CurrentUser() u: User, @Param('id') teamId: string, @Body() dto: any) {
    return this.schoolSports.addSquadMember(u.tenantId, teamId, dto.learnerId, dto.position, dto.jerseyNumber);
  }

  @Get('teams/:id/squad')
  @Roles('tenant_owner','school_admin','hoi','games_dept','class_teacher','parent','learner')
  getSquad(@CurrentUser() u: User, @Param('id') id: string) {
    return this.schoolSports.getSquad(u.tenantId, id);
  }

  @Post('competitions')
  @Roles('tenant_owner','school_admin','hoi','games_dept')
  createCompetition(@CurrentUser() u: User, @Body() dto: any) {
    return this.schoolSports.createInternalCompetition(u.tenantId, u.schoolId, dto, u.id);
  }

  @Post('competitions/fixtures/:id/result')
  @Roles('tenant_owner','school_admin','hoi','games_dept')
  recordInternalResult(
    @CurrentUser() u: User,
    @Param('id') fixtureId: string,
    @Body() dto: any,
  ) {
    return this.schoolSports.recordInternalResult(u.tenantId, fixtureId, dto.homeScore, dto.awayScore, u.id);
  }

  // ── QUALIFICATION REGISTER ────────────────────────────────
  @Post('qualifications')
  @Roles('tenant_owner','school_admin','hoi','games_dept')
  createQualification(@CurrentUser() u: User, @Body() dto: any) {
    return this.schoolSports.createQualification(u.tenantId, u.schoolId, dto, u.id);
  }

  @Post('qualifications/:id/athletes')
  @Roles('tenant_owner','school_admin','hoi','games_dept')
  addQualifiedAthlete(@CurrentUser() u: User, @Param('id') qualId: string, @Body() dto: any) {
    return this.schoolSports.addQualifiedAthlete(u.tenantId, qualId, dto);
  }

  @Get('qualifications')
  @Roles('tenant_owner','school_admin','hoi','games_dept')
  getQualifications(@CurrentUser() u: User, @Query() filters: any) {
    return this.schoolSports.getQualifications(u.tenantId, filters);
  }

  // ── PUSH TO BASE (the core school→base pipeline) ──────────
  @Post('qualifications/:id/push-to-base')
  @Roles('tenant_owner','school_admin','hoi','games_dept')
  pushToBase(
    @CurrentUser() u: User,
    @Param('id') qualId: string,
    @Body('baseChampionshipId') baseChampionshipId: string,
  ) {
    return this.pushService.pushToBase(u.tenantId, u.schoolId, qualId, baseChampionshipId, u.id);
  }

  // ── AI TALENT ─────────────────────────────────────────────
  @Post('talent/report/:learnerId')
  @Roles('tenant_owner','school_admin','hoi','games_dept')
  generateTalentReport(
    @CurrentUser() u: User,
    @Param('learnerId') id: string,
    @Query('academicYear') year: string,
    @Query('term') term: string,
  ) {
    return this.schoolSports.generateTalentReport(u.tenantId, id, year, term);
  }

  // ── TIER 2: BASE CHAMPIONSHIPS ────────────────────────────
  @Get('base/championships')
  listBaseChampionships(@CurrentUser() u: User, @Query() filters: any) {
    return this.baseSports.listOpen(filters);
  }

  @Post('base/championships')
  @Roles('super_admin')
  createBaseChampionship(@CurrentUser() u: User, @Body() dto: any) {
    return this.baseSports.createChampionship(dto, u.id);
  }

  @Get('base/championships/:id/schools')
  getRegisteredSchools(@Param('id') id: string) {
    return this.baseSports.getRegisteredSchools(id);
  }

  @Get('base/championships/:id/athletes')
  getRegisteredAthletes(@Param('id') id: string, @Query('schoolId') schoolId?: string) {
    return this.baseSports.getRegisteredAthletes(id, schoolId);
  }

  @Get('base/championships/:id/standings')
  getBaseStandings(@Param('id') id: string) {
    return this.baseSports.getStandings(id);
  }

  @Get('base/championships/:id/leaderboard')
  getAthleticsLeaderboard(@Param('id') id: string, @Query('event') event: string) {
    return this.baseSports.getAthleticsLeaderboard(id, event);
  }

  @Post('base/fixtures/:id/result')
  @Roles('super_admin','games_dept')
  recordBaseMatchResult(@CurrentUser() u: User, @Param('id') id: string, @Body() dto: any) {
    return this.baseSports.recordMatchResult(id, dto, u.id);
  }

  @Post('base/athletics-results')
  @Roles('super_admin','games_dept')
  recordAthleticsResult(@CurrentUser() u: User, @Body() dto: any) {
    return this.baseSports.recordAthleticsResult(dto, u.id);
  }

  // ── BIB SHEET ─────────────────────────────────────────────
  @Get('base/championships/:id/bib-sheet')
  @Roles('tenant_owner','school_admin','hoi','games_dept','super_admin')
  getBibSheet(
    @Param('id') champId: string,
    @Query('schoolId') schoolId: string,
  ) {
    return this.pushService.generateBibSheet(champId, schoolId);
  }
}
