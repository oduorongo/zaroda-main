// ── src/modules/auth/school-settings.controller.ts ───────────
// GET/PATCH /api/v1/schools/settings
// Lets a school admin edit school profile + report-card branding.
// Brand colours live in schools.settings (JSONB) so no schema change is needed.
import {
  Controller, Get, Patch, Body, UseGuards, Request, Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { School } from './entities/school.entity';

export class UpdateSchoolSettingsDto {
  @IsOptional() @IsString() schoolName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() knecCode?: string;
  @IsOptional() @IsString() principalName?: string;
  @IsOptional() @IsString() motto?: string;
  // Report-card branding
  @IsOptional() @IsString() brandPrimary?: string;     // header / table heading colour
  @IsOptional() @IsString() brandPrimaryDeep?: string;  // logo text / deep shade
  @IsOptional() @IsString() brandAccent?: string;       // accent (gold by default)
  @IsOptional() @IsString() badgeBase64?: string;       // school badge/logo (data URL) for report cards
}

@Injectable()
export class SchoolSettingsService {
  constructor(
    @InjectRepository(School) private schoolRepo: Repository<School>,
  ) {}

  async get(tenantId: string) {
    const school = await this.schoolRepo.findOne({ where: { tenantId } });
    if (!school) return null;
    const s = (school as any).settings || {};
    return {
      schoolName:    school.name,
      phone:         (school as any).phone || '',
      email:         (school as any).email || '',
      address:       (school as any).address || '',
      knecCode:      (school as any).knecCode || '',
      principalName: (school as any).principalName || '',
      motto:         s.motto || '',
      brandPrimary:     s.brandPrimary     || '#1a2e5a',
      brandPrimaryDeep: s.brandPrimaryDeep || '#0f1c38',
      brandAccent:      s.brandAccent      || '#d4af37',
      badgeBase64:      s.badgeBase64      || '',
    };
  }

  async update(tenantId: string, dto: UpdateSchoolSettingsDto) {
    const school = await this.schoolRepo.findOne({ where: { tenantId } });
    if (!school) return null;

    if (dto.schoolName !== undefined) (school as any).name = dto.schoolName;
    if (dto.phone !== undefined) (school as any).phone = dto.phone;
    if (dto.email !== undefined) (school as any).email = dto.email;
    if (dto.address !== undefined) (school as any).address = dto.address;
    if (dto.knecCode !== undefined) (school as any).knecCode = dto.knecCode;
    if (dto.principalName !== undefined) (school as any).principalName = dto.principalName;

    const settings = { ...((school as any).settings || {}) };
    for (const k of ['motto', 'brandPrimary', 'brandPrimaryDeep', 'brandAccent', 'badgeBase64'] as const) {
      if (dto[k] !== undefined) settings[k] = dto[k];
    }
    (school as any).settings = settings;

    await this.schoolRepo.save(school);
    return this.get(tenantId);
  }
}

@Controller('schools')
@UseGuards(JwtAuthGuard)
export class SchoolSettingsController {
  constructor(private readonly svc: SchoolSettingsService) {}

  @Get('settings')
  get(@Request() req: any) {
    return this.svc.get(req.user.tenantId);
  }

  @Patch('settings')
  update(@Request() req: any, @Body() dto: UpdateSchoolSettingsDto) {
    return this.svc.update(req.user.tenantId, dto);
  }
}
