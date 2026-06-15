// ── src/modules/location/location.module.ts ──────────────
import { Module }     from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository }  from 'typeorm';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

// ── Entities ──────────────────────────────────────────────
@Entity('ke_counties')
export class KeCounty {
  @PrimaryGeneratedColumn()    id:     number;
  @Column()                    code:   string;
  @Column()                    name:   string;
  @Column()                    region: string;
}

@Entity('ke_sub_counties')
export class KeSubCounty {
  @PrimaryGeneratedColumn()              id:       number;
  @Column({ name: 'county_id' })         countyId: number;
  @Column()                              name:     string;
}

@Entity('ke_zones')
export class KeZone {
  @PrimaryGeneratedColumn()                 id:          number;
  @Column({ name: 'sub_county_id' })        subCountyId: number;
  @Column()                                 name:        string;
}

@Entity('knec_school_registry')
export class KnecSchool {
  @PrimaryGeneratedColumn('uuid')        id:        string;
  @Column({ name: 'knec_code' })         knecCode:  string;
  @Column({ nullable: true })            name:      string;
  @Column({ nullable: true })            level:     string;
  @Column({ nullable: true })            county:    string;
  @Column({ name: 'sub_county', nullable: true }) subCounty: string;
  @Column({ nullable: true })            zone:      string;
  @Column({ nullable: true })            category:  string;
}

// ── Service ───────────────────────────────────────────────
@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(KeCounty)    private countyRepo:    Repository<KeCounty>,
    @InjectRepository(KeSubCounty) private subCountyRepo: Repository<KeSubCounty>,
    @InjectRepository(KeZone)      private zoneRepo:      Repository<KeZone>,
    @InjectRepository(KnecSchool)  private schoolRepo:    Repository<KnecSchool>,
  ) {}

  getCounties() {
    return this.countyRepo.find({ order: { name: 'ASC' } });
  }

  getSubCounties(countyId: number) {
    return this.subCountyRepo.find({ where: { countyId }, order: { name: 'ASC' } });
  }

  getZones(subCountyId: number) {
    return this.zoneRepo.find({ where: { subCountyId }, order: { name: 'ASC' } });
  }

  // Look up a school by its KNEC code (the unique identifier)
  async lookupSchool(knecCode: string) {
    const raw = (knecCode || '').trim();
    if (!raw) return { found: false };

    // Normalise the way the registry stores codes (strip spaces/punctuation, upper-case).
    const norm = raw.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    const digits = raw.replace(/\D/g, '');

    // Try, in order: exact, normalised exact, digits-only exact, then a safe prefix match.
    let school =
      (await this.schoolRepo.findOne({ where: { knecCode: raw } })) ||
      (await this.schoolRepo.findOne({ where: { knecCode: norm } }));

    if (!school && digits) {
      school = await this.schoolRepo
        .createQueryBuilder('s')
        .where("regexp_replace(s.knec_code, '[^0-9]', '', 'g') = :d", { d: digits })
        .getOne()
        .catch(() => null);
    }
    if (!school && norm.length >= 6) {
      school = await this.schoolRepo
        .createQueryBuilder('s')
        .where('UPPER(s.knec_code) = :n', { n: norm })
        .getOne()
        .catch(() => null);
    }

    if (!school) return { found: false };
    return {
      found:     true,
      knecCode:  school.knecCode,
      name:      school.name || '',
      level:     school.level,
      county:    school.county,
      subCounty: school.subCounty,
      zone:      school.zone,
      category:  school.category,
    };
  }

  // Type-ahead search by name or partial code (optional helper)
  async searchSchools(q: string) {
    const term = `%${(q || '').trim()}%`;
    return this.schoolRepo.createQueryBuilder('s')
      .where('s.knec_code ILIKE :term OR s.name ILIKE :term', { term })
      .orderBy('s.name', 'ASC')
      .limit(10)
      .getMany()
      .catch(() => []);
  }

  // Diagnostic: how many codes are loaded (used to confirm the registry is populated)
  async registryStatus() {
    const total = await this.schoolRepo.count().catch(() => 0);
    const sample = await this.schoolRepo.createQueryBuilder('s')
      .orderBy('s.knec_code', 'ASC').limit(3).getMany().catch(() => []);
    return { total, sample: sample.map(s => ({ knecCode: s.knecCode, name: s.name })) };
  }
}

// ── Controller (public — no auth required) ────────────────
@Controller('location')
export class LocationController {
  constructor(private locationService: LocationService) {}

  @Get('counties')
  getCounties() { return this.locationService.getCounties(); }

  @Get('counties/:id/sub-counties')
  getSubCounties(@Param('id') id: string) {
    return this.locationService.getSubCounties(parseInt(id));
  }

  @Get('sub-counties/:id/zones')
  getZones(@Param('id') id: string) {
    return this.locationService.getZones(parseInt(id));
  }

  // ── Diagnostic: confirm the KNEC registry is populated ──
  // Visit /api/v1/location/registry-status to see how many codes are loaded.
  @Get('registry-status')
  registryStatus() { return this.locationService.registryStatus(); }

  // ── School lookup by KNEC code (public, used during signup) ──
  @Get('schools/:knecCode')
  lookupSchool(@Param('knecCode') knecCode: string) {
    return this.locationService.lookupSchool(knecCode);
  }

  @Get('schools')
  searchSchools(@Query('q') q: string) {
    return this.locationService.searchSchools(q);
  }
}

// ── Module ────────────────────────────────────────────────
@Module({
  imports:     [TypeOrmModule.forFeature([KeCounty, KeSubCounty, KeZone, KnecSchool])],
  controllers: [LocationController],
  providers:   [LocationService],
  exports:     [LocationService],
})
export class LocationModule {}
