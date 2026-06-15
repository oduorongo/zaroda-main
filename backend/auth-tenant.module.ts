// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// MODULE 01: Auth + Tenant Onboarding — NestJS Backend
// Stack: NestJS · TypeORM · PostgreSQL · Redis · JWT · bcrypt
// ============================================================
// FILE STRUCTURE (paste into your NestJS project):
//
// src/
//   modules/
//     auth/
//       auth.module.ts
//       auth.controller.ts
//       auth.service.ts
//       strategies/
//         jwt.strategy.ts
//         refresh.strategy.ts
//       guards/
//         jwt-auth.guard.ts
//         roles.guard.ts
//       decorators/
//         roles.decorator.ts
//         current-user.decorator.ts
//       dto/
//         login.dto.ts
//         register-invite.dto.ts
//         refresh-token.dto.ts
//         verify-mfa.dto.ts
//     tenant/
//       tenant.module.ts
//       tenant.controller.ts
//       tenant.service.ts
//       dto/
//         create-tenant.dto.ts
//         onboard-school.dto.ts
//         onboard-stream.dto.ts
//     common/
//       middleware/
//         tenant.middleware.ts
//       entities/
//         base.entity.ts
// ============================================================

// ─────────────────────────────────────────────────────────────
// src/modules/common/entities/base.entity.ts
// ─────────────────────────────────────────────────────────────
import {
  PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn
} from 'typeorm';

export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date;
}


// ─────────────────────────────────────────────────────────────
// src/modules/tenant/entities/tenant.entity.ts
// ─────────────────────────────────────────────────────────────
import { Entity, Column, OneToMany } from 'typeorm';

export type TenantStatus = 'trial' | 'active' | 'suspended' | 'cancelled';
export type SubscriptionTier = 'free' | 'primary' | 'senior';

@Entity('tenants')
export class Tenant extends BaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column({ name: 'knec_code', length: 20, unique: true, nullable: true })
  knecCode: string;

  @Column({ length: 100, unique: true })
  subdomain: string;

  @Column({ name: 'logo_url', nullable: true })
  logoUrl: string;

  @Column({ name: 'primary_color', length: 7, default: '#1a2e5a' })
  primaryColor: string;

  @Column({ name: 'secondary_color', length: 7, default: '#d4af37' })
  secondaryColor: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  county: string;

  @Column({ name: 'sub_county', nullable: true })
  subCounty: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 20, default: 'trial' })
  status: TenantStatus;

  @Column({ name: 'trial_ends_at', type: 'timestamptz' })
  trialEndsAt: Date;

  @Column({ name: 'subscription_tier', type: 'varchar', length: 20, default: 'free' })
  subscriptionTier: SubscriptionTier;

  @Column({ type: 'jsonb', default: '{}' })
  settings: Record<string, any>;
}


// ─────────────────────────────────────────────────────────────
// src/modules/tenant/entities/school.entity.ts
// ─────────────────────────────────────────────────────────────
export type SchoolType = 'ecde' | 'primary' | 'junior' | 'senior' | 'combined';
export type SchoolCategory = 'day' | 'boarding' | 'day_boarding';
export type GenderType = 'mixed' | 'boys' | 'girls';

@Entity('schools')
export class School extends BaseEntity {
  @Column({ name: 'school_id', type: 'uuid' })
  schoolId: string;  // parent school reference for multi-campus

  @Column({ name: 'knec_code', length: 20, unique: true, nullable: true })
  knecCode: string;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'school_type', type: 'varchar', length: 30 })
  schoolType: SchoolType;

  @Column({ type: 'varchar', length: 20, default: 'day' })
  category: SchoolCategory;

  @Column({ name: 'gender_type', type: 'varchar', length: 20, default: 'mixed' })
  genderType: GenderType;

  @Column({ nullable: true }) address: string;
  @Column({ nullable: true }) county: string;
  @Column({ name: 'sub_county', nullable: true }) subCounty: string;
  @Column({ nullable: true }) ward: string;
  @Column({ nullable: true }) phone: string;
  @Column({ nullable: true }) email: string;
  @Column({ name: 'principal_name', nullable: true }) principalName: string;
  @Column({ name: 'logo_url', nullable: true }) logoUrl: string;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @Column({ type: 'jsonb', default: '{}' }) settings: Record<string, any>;
}


// ─────────────────────────────────────────────────────────────
// src/modules/auth/entities/user.entity.ts
// ─────────────────────────────────────────────────────────────
export type UserRole =
  | 'super_admin' | 'tenant_owner' | 'school_admin'
  | 'hoi' | 'dhois' | 'class_teacher' | 'subject_teacher'
  | 'overall_class_teacher' | 'games_dept' | 'bursar'
  | 'parent' | 'learner';

export type UserStatus = 'pending' | 'active' | 'suspended' | 'deactivated';

@Entity('users')
export class User extends BaseEntity {
  @Column({ name: 'school_id', type: 'uuid', nullable: true })
  schoolId: string;

  @Column({ length: 255, unique: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ name: 'first_name', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', length: 100 })
  lastName: string;

  @Column({ name: 'other_names', length: 100, nullable: true })
  otherNames: string;

  @Column({ nullable: true })
  gender: string;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: Date;

  @Column({ name: 'national_id', nullable: true })
  nationalId: string;

  @Column({ name: 'tsc_number', nullable: true })
  tscNumber: string;

  @Column({ name: 'profile_photo_url', nullable: true })
  profilePhotoUrl: string;

  @Column({ type: 'varchar', length: 30 })
  role: UserRole;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: UserStatus;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date;

  @Column({ name: 'mfa_enabled', default: false })
  mfaEnabled: boolean;

  @Column({ name: 'mfa_secret', nullable: true })
  mfaSecret: string;

  @Column({ name: 'registration_token', nullable: true })
  registrationToken: string;

  @Column({ name: 'token_expires_at', type: 'timestamptz', nullable: true })
  tokenExpiresAt: Date;

  @Column({ name: 'password_reset_token', nullable: true })
  passwordResetToken: string;

  @Column({ name: 'reset_token_expires', type: 'timestamptz', nullable: true })
  resetTokenExpires: Date;

  @Column({ type: 'jsonb', default: '{}' })
  settings: Record<string, any>;

  // Virtual — never stored
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/tenant/dto/create-tenant.dto.ts
// ─────────────────────────────────────────────────────────────
import {
  IsEmail, IsNotEmpty, IsOptional, IsString,
  Length, Matches, MinLength
} from 'class-validator';

export class CreateTenantDto {
  @IsNotEmpty()
  @IsString()
  @Length(3, 255)
  schoolName: string;

  @IsOptional()
  @IsString()
  @Length(5, 20)
  knecCode?: string;

  // Subdomain auto-generated from schoolName if not provided
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'Subdomain must be lowercase letters, numbers, hyphens only' })
  @Length(3, 100)
  subdomain?: string;

  @IsNotEmpty()
  @IsString()
  schoolType: 'ecde' | 'primary' | 'junior' | 'senior' | 'combined';

  @IsNotEmpty()
  @IsString()
  county: string;

  @IsOptional()
  @IsString()
  subCounty?: string;

  @IsNotEmpty()
  @IsString()
  phone: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  address?: string;

  // Tenant Owner (Director) account
  @IsNotEmpty()
  @IsString()
  ownerFirstName: string;

  @IsNotEmpty()
  @IsString()
  ownerLastName: string;

  @IsNotEmpty()
  @IsEmail()
  ownerEmail: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  ownerPassword: string;

  @IsNotEmpty()
  @IsString()
  ownerPhone: string;
}

export class OnboardStreamDto {
  @IsNotEmpty()
  @IsString()
  gradeLevelName: string;       // "Grade 4 North"

  @IsNotEmpty()
  @IsString()
  gradeLevel: string;           // "grade_4"

  @IsNotEmpty()
  @IsString()
  academicYear: string;         // "2025/2026"

  @IsNotEmpty()
  @IsString()
  term: 'term_1' | 'term_2' | 'term_3';

  @IsOptional()
  capacity?: number;
}

export class GenerateInviteLinkDto {
  @IsNotEmpty()
  role: 'class_teacher' | 'subject_teacher' | 'overall_class_teacher' | 'games_dept' | 'bursar';

  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsOptional()
  @IsString()
  streamId?: string;
}


// ─────────────────────────────────────────────────────────────
// src/modules/auth/dto/login.dto.ts
// ─────────────────────────────────────────────────────────────
export class LoginDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  mfaCode?: string;
}

export class SelfRegisterDto {
  @IsNotEmpty()
  @IsString()
  token: string;               // registration invite token

  @IsNotEmpty()
  firstName: string;

  @IsNotEmpty()
  lastName: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsNotEmpty()
  phone: string;

  @IsOptional()
  nationalId?: string;

  @IsOptional()
  tscNumber?: string;
}

export class ForgotPasswordDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsNotEmpty()
  token: string;

  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;
}


// ─────────────────────────────────────────────────────────────
// src/modules/common/middleware/tenant.middleware.ts
// Sets PostgreSQL session variable app.tenant_id for RLS
// ─────────────────────────────────────────────────────────────
import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(Tenant)
    private tenantRepo: Repository<Tenant>,
    private dataSource: DataSource,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Resolve tenant from subdomain: starlight.zarodasms.app → "starlight"
    const host = req.hostname;
    const subdomain = host.split('.')[0];

    // Skip for super admin domain
    if (subdomain === 'admin' || subdomain === 'www') {
      req['tenantId'] = '00000000-0000-0000-0000-000000000001';
      return next();
    }

    const tenant = await this.tenantRepo.findOne({
      where: { subdomain, deletedAt: null },
    });

    if (!tenant) {
      throw new NotFoundException(`School not found: ${subdomain}`);
    }

    if (tenant.status === 'suspended') {
      return res.status(403).json({
        message: 'Your subscription is suspended. Please contact support.',
        contact: '+254781230805',
      });
    }

    // Attach to request for downstream use
    req['tenantId'] = tenant.id;
    req['tenant'] = tenant;

    // Set PostgreSQL session variable for RLS enforcement
    await this.dataSource.query(`SET app.tenant_id = '${tenant.id}'`);

    next();
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/auth/strategies/jwt.strategy.ts
// ─────────────────────────────────────────────────────────────
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;        // user UUID
  tenantId: string;
  role: UserRole;
  schoolId?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private config: ConfigService,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.userRepo.findOne({
      where: { id: payload.sub, deletedAt: null },
    });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Account is not active');
    }
    return user;
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/auth/guards/roles.guard.ts
// ─────────────────────────────────────────────────────────────
import {
  Injectable, CanActivate, ExecutionContext, ForbiddenException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Access denied. Required role(s): ${requiredRoles.join(', ')}`
      );
    }
    return true;
  }
}

// src/modules/auth/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

// src/modules/auth/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);


// ─────────────────────────────────────────────────────────────
// src/modules/auth/auth.service.ts  (CORE)
// ─────────────────────────────────────────────────────────────
import {
  Injectable, UnauthorizedException, ConflictException,
  BadRequestException, NotFoundException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as speakeasy from 'speakeasy';
import { Redis } from 'ioredis';
import { InjectRedis } from '@liaoliaots/nestjs-redis';

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY  = '15m';
const REFRESH_TOKEN_EXPIRY = '30d';
const REFRESH_TOKEN_EXPIRY_SECONDS = 60 * 60 * 24 * 30;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)         private userRepo:    Repository<User>,
    @InjectRepository(RefreshToken) private tokenRepo:   Repository<RefreshToken>,
    @InjectRepository(AuditLog)     private auditRepo:   Repository<AuditLog>,
    private jwtService:  JwtService,
    private config:      ConfigService,
    private dataSource:  DataSource,
    @InjectRedis()       private redis: Redis,
  ) {}

  // ── LOGIN ──────────────────────────────────────────────────
  async login(dto: LoginDto, ipAddress: string, userAgent: string) {
    const user = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase(), deletedAt: null },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      await this.logAudit(null, null, 'user.login_failed', 'users', null, { email: dto.email }, ipAddress, userAgent);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException(`Account ${user.status}. Contact your school admin.`);
    }

    // MFA check
    if (user.mfaEnabled) {
      if (!dto.mfaCode) {
        return { requiresMfa: true };
      }
      const valid = speakeasy.totp.verify({
        secret: user.mfaSecret,
        encoding: 'base32',
        token: dto.mfaCode,
        window: 1,
      });
      if (!valid) throw new UnauthorizedException('Invalid MFA code');
    }

    // Update last login
    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    const tokens = await this.generateTokenPair(user, ipAddress, userAgent);

    await this.logAudit(user.tenantId, user.id, 'user.login', 'users', user.id, null, ipAddress, userAgent);

    return {
      accessToken:  tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn:    900,   // 15 min in seconds
      user: this.sanitizeUser(user),
    };
  }

  // ── SELF-REGISTER via invite link ──────────────────────────
  async selfRegister(dto: SelfRegisterDto, ipAddress: string) {
    const inviteData = await this.redis.get(`invite:${dto.token}`);
    if (!inviteData) {
      throw new BadRequestException('Invite link is invalid or has expired');
    }

    const invite = JSON.parse(inviteData);
    const existingUser = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase() },
    });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = this.userRepo.create({
      tenantId:    invite.tenantId,
      schoolId:    invite.schoolId,
      email:       dto.email.toLowerCase(),
      phone:       dto.phone,
      firstName:   dto.firstName,
      lastName:    dto.lastName,
      nationalId:  dto.nationalId,
      tscNumber:   dto.tscNumber,
      passwordHash,
      role:        invite.role,
      status:      'active',
      emailVerifiedAt: new Date(),  // considered verified via invite
    });

    await this.userRepo.save(user);
    await this.redis.del(`invite:${dto.token}`);

    await this.logAudit(invite.tenantId, user.id, 'user.self_registered', 'users', user.id, null, ipAddress, '');

    return { message: 'Account created successfully. You can now log in.' };
  }

  // ── REFRESH TOKEN rotation ─────────────────────────────────
  async refreshTokens(refreshToken: string, ipAddress: string, userAgent: string) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.tokenRepo.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token invalid or expired');
    }

    // Revoke old token (rotation)
    await this.tokenRepo.update(stored.id, { revokedAt: new Date() });

    const user = await this.userRepo.findOne({ where: { id: stored.userId } });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User not active');
    }

    return this.generateTokenPair(user, ipAddress, userAgent);
  }

  // ── LOGOUT ─────────────────────────────────────────────────
  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.tokenRepo.update({ tokenHash }, { revokedAt: new Date() });
    return { message: 'Logged out successfully' };
  }

  // ── FORGOT PASSWORD ────────────────────────────────────────
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase(), deletedAt: null },
    });
    // Always return success to prevent email enumeration
    if (!user) return { message: 'If that email exists, a reset link has been sent.' };

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetHash  = crypto.createHash('sha256').update(resetToken).digest('hex');

    await this.userRepo.update(user.id, {
      passwordResetToken: resetHash,
      resetTokenExpires: new Date(Date.now() + 3_600_000), // 1 hour
    });

    // Queue email notification (NotificationQueue)
    const resetUrl = `https://${user['tenantSubdomain']}.zarodasms.app/reset-password?token=${resetToken}`;
    await this.queueNotification(user, 'email', 'Password Reset — ZARODA SMS',
      `Click to reset your password: ${resetUrl}\n\nThis link expires in 1 hour.`
    );

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  // ── RESET PASSWORD ─────────────────────────────────────────
  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');
    const user = await this.userRepo.findOne({
      where: { passwordResetToken: tokenHash },
    });

    if (!user || !user.resetTokenExpires || user.resetTokenExpires < new Date()) {
      throw new BadRequestException('Reset token is invalid or has expired');
    }

    const newHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.userRepo.update(user.id, {
      passwordHash: newHash,
      passwordResetToken: null,
      resetTokenExpires: null,
    });

    // Revoke all refresh tokens for this user
    await this.tokenRepo.update({ userId: user.id }, { revokedAt: new Date() });

    return { message: 'Password reset successfully. Please log in.' };
  }

  // ── SETUP MFA ──────────────────────────────────────────────
  async setupMfa(userId: string) {
    const secret = speakeasy.generateSecret({ name: 'ZARODA SMS', length: 20 });
    // Temporarily store secret until user confirms with a valid TOTP code
    await this.redis.set(`mfa_setup:${userId}`, secret.base32, 'EX', 600);
    return {
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url,
      qrCodeUrl:  `https://chart.googleapis.com/chart?chs=200x200&chld=M|0&cht=qr&chl=${encodeURIComponent(secret.otpauth_url)}`,
    };
  }

  async confirmMfa(userId: string, code: string) {
    const secret = await this.redis.get(`mfa_setup:${userId}`);
    if (!secret) throw new BadRequestException('MFA setup session expired');

    const valid = speakeasy.totp.verify({ secret, encoding: 'base32', token: code, window: 1 });
    if (!valid) throw new BadRequestException('Invalid MFA code');

    await this.userRepo.update(userId, { mfaEnabled: true, mfaSecret: secret });
    await this.redis.del(`mfa_setup:${userId}`);
    return { message: 'MFA enabled successfully' };
  }

  // ── PRIVATE HELPERS ────────────────────────────────────────
  private async generateTokenPair(user: User, ipAddress: string, userAgent: string) {
    const payload: JwtPayload = {
      sub:      user.id,
      tenantId: user.tenantId,
      role:     user.role,
      schoolId: user.schoolId,
    };

    const accessToken  = this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const refreshToken = crypto.randomBytes(48).toString('hex');
    const tokenHash    = this.hashToken(refreshToken);

    await this.tokenRepo.save({
      userId:     user.id,
      tenantId:   user.tenantId,
      tokenHash,
      deviceInfo: { ipAddress, userAgent },
      expiresAt:  new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000),
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private sanitizeUser(user: User) {
    const { passwordHash, mfaSecret, passwordResetToken, registrationToken, ...safe } = user as any;
    return safe;
  }

  private async logAudit(
    tenantId: string, userId: string, action: string,
    entityType: string, entityId: string,
    oldValues: any, ipAddress: string, userAgent: string,
  ) {
    await this.auditRepo.save({
      tenantId, userId, action, entityType, entityId,
      oldValues, ipAddress, userAgent,
    });
  }

  private async queueNotification(user: User, channel: string, subject: string, body: string) {
    // Insert into notification_queue table — picked up by background job
    // Implementation in Communication Module
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/tenant/tenant.service.ts  (CORE)
// ─────────────────────────────────────────────────────────────
import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Redis } from 'ioredis';
import { InjectRedis } from '@liaoliaots/nestjs-redis';

const ANNUAL_RATES = {
  primary: 2190,   // KES per stream per year
  senior:  3285,   // KES per stream per year
};

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant)       private tenantRepo: Repository<Tenant>,
    @InjectRepository(School)       private schoolRepo: Repository<School>,
    @InjectRepository(Stream)       private streamRepo: Repository<Stream>,
    @InjectRepository(User)         private userRepo:   Repository<User>,
    @InjectRepository(Invoice)      private invoiceRepo: Repository<Invoice>,
    @InjectRepository(Subscription) private subRepo:    Repository<Subscription>,
    private dataSource: DataSource,
    @InjectRedis() private redis: Redis,
  ) {}

  // ── FULL TENANT ONBOARDING (transactional) ─────────────────
  async onboard(dto: CreateTenantDto, ipAddress: string) {
    // 1. Check subdomain availability
    const subdomain = dto.subdomain || this.generateSubdomain(dto.schoolName);
    const existingTenant = await this.tenantRepo.findOne({ where: { subdomain } });
    if (existingTenant) {
      throw new ConflictException(`Subdomain "${subdomain}" is already taken`);
    }

    if (dto.knecCode) {
      const existingKnec = await this.tenantRepo.findOne({ where: { knecCode: dto.knecCode } });
      if (existingKnec) {
        throw new ConflictException(`KNEC code ${dto.knecCode} is already registered`);
      }
    }

    const ownerEmail = dto.ownerEmail.toLowerCase();
    const existingUser = await this.userRepo.findOne({ where: { email: ownerEmail } });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    // 2. Run all inserts in a transaction
    return this.dataSource.transaction(async (manager) => {
      // Create tenant
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
      const tenant = manager.create(Tenant, {
        name:    dto.schoolName,
        knecCode: dto.knecCode,
        subdomain,
        county:   dto.county,
        subCounty: dto.subCounty,
        phone:    dto.phone,
        email:    dto.email,
        address:  dto.address,
        status:   'trial',
        trialEndsAt,
        subscriptionTier: 'free',
      });
      await manager.save(Tenant, tenant);

      // Create school record
      const school = manager.create(School, {
        tenantId:   tenant.id,
        name:       dto.schoolName,
        knecCode:   dto.knecCode,
        schoolType: dto.schoolType,
        county:     dto.county,
        subCounty:  dto.subCounty,
        phone:      dto.phone,
        email:      dto.email,
        address:    dto.address,
        isActive:   true,
      });
      await manager.save(School, school);

      // Create tenant owner (Director) account
      const passwordHash = await bcrypt.hash(dto.ownerPassword, 12);
      const owner = manager.create(User, {
        tenantId:  tenant.id,
        schoolId:  school.id,
        email:     ownerEmail,
        phone:     dto.ownerPhone,
        firstName: dto.ownerFirstName,
        lastName:  dto.ownerLastName,
        passwordHash,
        role:   'tenant_owner',
        status: 'active',
        emailVerifiedAt: new Date(),
      });
      await manager.save(User, owner);

      // Generate onboarding invoice (2 weeks trial — zero amount)
      const invoiceNumber = await this.generateInvoiceNumber();
      const invoice = manager.create(Invoice, {
        tenantId: tenant.id,
        invoiceNumber,
        amountKes:  0,
        taxAmount:  0,
        totalAmount: 0,
        status:   'paid',
        dueDate:  trialEndsAt,
        paidAt:   new Date(),
        notes:    '2-Week Free Trial — No charge',
        lineItems: [{ description: '14-day free trial', amount: 0 }],
      });
      await manager.save(Invoice, invoice);

      // Queue welcome email + SMS
      await this.queueWelcomeNotifications(manager, tenant, owner, subdomain);

      return {
        tenantId:  tenant.id,
        schoolId:  school.id,
        subdomain,
        trialEndsAt,
        portalUrl: `https://${subdomain}.zarodasms.app`,
        message:   `Welcome to ZARODA SMS! Your 14-day trial is active. Access your portal at https://${subdomain}.zarodasms.app`,
        invoice:   { invoiceNumber, total: 0, status: 'Trial — No charge' },
      };
    });
  }

  // ── ADD A STREAM (triggers subscription + invoice) ─────────
  async addStream(tenantId: string, schoolId: string, dto: OnboardStreamDto) {
    const school = await this.schoolRepo.findOne({ where: { id: schoolId, tenantId } });
    if (!school) throw new NotFoundException('School not found');

    const plan: 'primary' | 'senior' = this.getPlanForGrade(dto.gradeLevel);
    const annualRate = ANNUAL_RATES[plan];
    const monthlyRate = parseFloat((annualRate / 12).toFixed(2));

    return this.dataSource.transaction(async (manager) => {
      const stream = manager.create(Stream, {
        tenantId,
        schoolId,
        name:         dto.gradeLevelName,
        gradeLevel:   dto.gradeLevel,
        academicYear: dto.academicYear,
        term:         dto.term,
        capacity:     dto.capacity || 40,
        isActive:     true,
      });
      await manager.save(Stream, stream);

      const endsAt = new Date();
      endsAt.setFullYear(endsAt.getFullYear() + 1);

      const subscription = manager.create(Subscription, {
        tenantId,
        streamId:     stream.id,
        plan,
        billingCycle: 'annual',
        amountKes:    annualRate,
        startsAt:     new Date(),
        endsAt,
        status:       'active',
        autoRenew:    true,
      });
      await manager.save(Subscription, subscription);

      // Generate invoice for this stream
      const invoiceNumber = await this.generateInvoiceNumber();
      const invoice = manager.create(Invoice, {
        tenantId,
        invoiceNumber,
        subscriptionId: subscription.id,
        amountKes:    annualRate,
        taxAmount:    0,
        totalAmount:  annualRate,
        status:       'unpaid',
        dueDate:      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        notes:        `Stream: ${dto.gradeLevelName} | Plan: ${plan} | ${dto.academicYear} ${dto.term.replace('_',' ')}`,
        lineItems: [{
          description: `${dto.gradeLevelName} — ${plan === 'senior' ? 'Senior School' : 'Primary/Junior'} Stream`,
          annualRate,
          monthlyRate,
          billingNote: 'Pay annually (KES ' + annualRate + ') or monthly (KES ' + monthlyRate + '/month)',
        }],
      });
      await manager.save(Invoice, invoice);

      return {
        streamId: stream.id,
        subscriptionId: subscription.id,
        invoice: {
          invoiceNumber,
          annualAmount:  annualRate,
          monthlyAmount: monthlyRate,
          dueDate: invoice.dueDate,
          status: 'unpaid',
        },
        message: `Stream "${dto.gradeLevelName}" added. Invoice KES ${annualRate} (or KES ${monthlyRate}/month) generated.`,
      };
    });
  }

  // ── GENERATE TEACHER INVITE LINK ────────────────────────────
  async generateInviteLink(tenantId: string, schoolId: string, dto: GenerateInviteLinkDto) {
    const token = crypto.randomBytes(32).toString('hex');
    const ttl   = 72 * 60 * 60;  // 72 hours

    const inviteData = {
      tenantId,
      schoolId: dto.schoolId || schoolId,
      streamId: dto.streamId,
      role:     dto.role,
      createdAt: new Date().toISOString(),
    };

    await this.redis.set(`invite:${token}`, JSON.stringify(inviteData), 'EX', ttl);

    const baseUrl = await this.getTenantSubdomain(tenantId);
    const inviteUrl = `https://${baseUrl}.zarodasms.app/register?token=${token}`;

    // WhatsApp-ready message
    const waMessage = encodeURIComponent(
      `You have been invited to join ZARODA SMS as ${dto.role.replace(/_/g,' ')}.\n\nClick to register:\n${inviteUrl}\n\nLink expires in 72 hours.\n\nFor support: +254781230805`
    );

    return {
      token,
      inviteUrl,
      whatsAppShareUrl: `https://wa.me/?text=${waMessage}`,
      expiresIn: '72 hours',
      role: dto.role,
    };
  }

  // ── PRIVATE HELPERS ────────────────────────────────────────
  private generateSubdomain(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .substring(0, 50);
  }

  private getPlanForGrade(gradeLevel: string): 'primary' | 'senior' {
    const seniorGrades = ['grade_10','grade_11','grade_12'];
    return seniorGrades.includes(gradeLevel) ? 'senior' : 'primary';
  }

  private async generateInvoiceNumber(): Promise<string> {
    const year  = new Date().getFullYear();
    const count = await this.invoiceRepo.count();
    return `ZAR-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  private async getTenantSubdomain(tenantId: string): Promise<string> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    return tenant?.subdomain || 'portal';
  }

  private async queueWelcomeNotifications(manager: any, tenant: Tenant, owner: User, subdomain: string) {
    const portalUrl = `https://${subdomain}.zarodasms.app`;
    await manager.save('notification_queue', [{
      tenantId: tenant.id,
      recipient: owner.id,
      channel: 'email',
      toAddress: owner.email,
      subject: 'Welcome to ZARODA SMS — Your Portal is Ready!',
      body: `Dear ${owner.firstName},\n\nWelcome to ZARODA School Management System!\n\nYour school portal is ready:\n${portalUrl}\n\nEmail: ${owner.email}\n\nYour 14-day free trial is now active.\n\nFor support: WhatsApp +254781230805\nwww.zarodasolutions.app\n\nPowered by ZARODA SOLUTIONS — INNOVATIVE. RELIABLE. FORWARD.`,
    }, {
      tenantId: tenant.id,
      recipient: owner.id,
      channel: 'sms',
      toAddress: owner.phone,
      subject: null,
      body: `ZARODA SMS: Welcome ${owner.firstName}! Portal: ${portalUrl} | 14-day trial active. Support: +254781230805`,
    }]);
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/auth/auth.controller.ts
// ─────────────────────────────────────────────────────────────
import {
  Controller, Post, Body, Req, Res, Get,
  UseGuards, HttpCode, HttpStatus, Patch
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })  // 10 attempts/min per IP
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req.ip, req.headers['user-agent'] || '');
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async selfRegister(@Body() dto: SelfRegisterDto, @Req() req: Request) {
    return this.authService.selfRegister(dto, req.ip);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body('refreshToken') token: string, @Req() req: Request) {
    return this.authService.refreshTokens(token, req.ip, req.headers['user-agent'] || '');
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body('refreshToken') token: string) {
    return this.authService.logout(token);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('mfa/setup')
  @UseGuards(JwtAuthGuard)
  async setupMfa(@CurrentUser() user: User) {
    return this.authService.setupMfa(user.id);
  }

  @Post('mfa/confirm')
  @UseGuards(JwtAuthGuard)
  async confirmMfa(@CurrentUser() user: User, @Body('code') code: string) {
    return this.authService.confirmMfa(user.id, code);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: User) {
    return user;
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/tenant/tenant.controller.ts
// ─────────────────────────────────────────────────────────────
import { Controller, Post, Body, Req, Get, Param, UseGuards } from '@nestjs/common';

@Controller('api/v1')
export class TenantController {
  constructor(private tenantService: TenantService) {}

  // PUBLIC — school self-registration
  @Post('onboard')
  async onboard(@Body() dto: CreateTenantDto, @Req() req: Request) {
    return this.tenantService.onboard(dto, req.ip);
  }

  // PROTECTED — HOI/Admin adds a stream
  @Post('schools/:schoolId/streams')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tenant_owner', 'school_admin', 'hoi')
  async addStream(
    @CurrentUser() user: User,
    @Param('schoolId') schoolId: string,
    @Body() dto: OnboardStreamDto,
  ) {
    return this.tenantService.addStream(user.tenantId, schoolId, dto);
  }

  // PROTECTED — Generate teacher invite link
  @Post('schools/:schoolId/invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tenant_owner', 'school_admin', 'hoi', 'dhois')
  async generateInvite(
    @CurrentUser() user: User,
    @Param('schoolId') schoolId: string,
    @Body() dto: GenerateInviteLinkDto,
  ) {
    return this.tenantService.generateInviteLink(user.tenantId, schoolId, dto);
  }

  // PROTECTED — Super admin: list all tenants
  @Get('admin/tenants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  async listTenants() {
    return this.tenantService.listTenants();
  }
}
