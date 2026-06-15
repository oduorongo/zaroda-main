import {
  Injectable, UnauthorizedException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService }    from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt       from 'bcryptjs';

import { User }     from './entities/user.entity';
import { Tenant }   from './entities/tenant.entity';
import { School }   from './entities/school.entity';
import { SignupDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)   private userRepo:   Repository<User>,
    @InjectRepository(Tenant) private tenantRepo: Repository<Tenant>,
    @InjectRepository(School) private schoolRepo: Repository<School>,
    private jwtService:    JwtService,
    private configService: ConfigService,
    private dataSource:    DataSource,
  ) {}

  // ── Login ───────────────────────────────────────────────
  async login(email: string, password: string) {
    const user = await this.userRepo.findOne({
      where:  { email: email.toLowerCase().trim() },
      select: ['id','email','passwordHash','firstName','lastName','role','tenantId','schoolId','streamId','streamName','subjects','isActive'],
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid email or password');

    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    const tokens = await this.generateTokens(user);
    return {
      accessToken:  tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id:         user.id,
        email:      user.email,
        firstName:  user.firstName,
        lastName:   user.lastName,
        role:       user.role,
        tenantId:   user.tenantId,
        schoolId:   user.schoolId,
        streamId:   user.streamId,
        streamName: user.streamName,
        subjects:   user.subjects || [],
      },
    };
  }

  // ── Signup ──────────────────────────────────────────────
  async signup(dto: SignupDto) {
    const existing = await this.userRepo.findOne({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // KNEC code is the unique school identifier — block duplicate registration
      if (dto.knecCode) {
        const dup = await this.tenantRepo.findOne({ where: { knecCode: dto.knecCode.trim() } });
        if (dup) {
          throw new ConflictException('A school with this KNEC code is already registered on ZARODA');
        }
      }

      const tenant = this.tenantRepo.create({
        name:          dto.schoolName,
        knecCode:      dto.knecCode ? dto.knecCode.trim() : undefined,
        county:        dto.county,
        subCounty:     dto.subCounty,
        zone:          dto.zone,
        keCountyId:    dto.countyId    ? parseInt(dto.countyId)    : undefined,
        keSubCountyId: dto.subCountyId ? parseInt(dto.subCountyId) : undefined,
        keZoneId:      dto.zoneId      ? parseInt(dto.zoneId)      : undefined,
        status:        'trial',
        trialEndsAt:   new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        subscriptionTier: 'trial',
      });
      const savedTenant = await queryRunner.manager.save(Tenant, tenant);

      const school = this.schoolRepo.create({
        name:      dto.schoolName,
        knecCode:  dto.knecCode ? dto.knecCode.trim() : undefined,
        phone:     dto.phone || '',
        tenantId:  savedTenant.id,
        county:    dto.county,
        subCounty: dto.subCounty,
        zone:      dto.zone,
      });
      const savedSchool = await queryRunner.manager.save(School, school);

      const passwordHash = await bcrypt.hash(dto.password, 12);
      const user = this.userRepo.create({
        email:        dto.email.toLowerCase().trim(),
        passwordHash,
        firstName:    dto.adminFirstName,
        lastName:     dto.adminLastName,
        phone:        dto.phone,
        role:         'hoi',
        tenantId:     savedTenant.id,
        schoolId:     savedSchool.id,
        isActive:     true,
        emailVerified:false,
      });
      const savedUser = await queryRunner.manager.save(User, user);

      await queryRunner.commitTransaction();

      const tokens = await this.generateTokens(savedUser);
      return {
        message:      'School account created successfully. Your 14-day free trial starts now.',
        accessToken:  tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id:        savedUser.id,
          email:     savedUser.email,
          firstName: savedUser.firstName,
          lastName:  savedUser.lastName,
          role:      savedUser.role,
          tenantId:  savedTenant.id,
          schoolId:  savedSchool.id,
        },
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ── Refresh Token ───────────────────────────────────────
  async refreshToken(token: string) {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_REFRESH_SECRET', 'zaroda-refresh-secret'),
      });
      const user = await this.userRepo.findOne({ where: { id: payload.sub } });
      if (!user || !user.isActive) throw new UnauthorizedException('Invalid refresh token');
      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  // ── Current user ────────────────────────────────────────
  async getMe(userId: string) {
    return this.userRepo.findOne({
      where:  { id: userId },
      select: ['id','email','firstName','lastName','role','tenantId','schoolId','streamId','streamName','subjects','phone','lastLoginAt'],
    });
  }

  async logout(_userId: string) {
    return { message: 'Logged out successfully' };
  }

  // ── Generate JWT pair ───────────────────────────────────
  private async generateTokens(user: any) {
    const payload = { sub: user.id, email: user.email, role: user.role, tenantId: user.tenantId, schoolId: user.schoolId };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret:    this.configService.get('JWT_SECRET', 'zaroda-dev-secret'),
        expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret:    this.configService.get('JWT_REFRESH_SECRET', 'zaroda-refresh-secret'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
