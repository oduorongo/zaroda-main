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

/** Parse a value to an integer, returning null for missing/blank/non-numeric input
 *  (so a stray "NaN" or undefined never reaches a smallint/integer DB column). */
function toIntOrNull(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

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

    // Block users whose school has been suspended by the platform owner. The owner
    // (super_admin) has no tenant and is never blocked. Also fetch school_levels here
    // so the frontend can gate senior-school-only UI without a second round trip.
    let schoolLevels: string[] = [];
    let ownership = 'public';
    if (user.role !== 'super_admin' && user.tenantId) {
      const t = await this.dataSource.query(
        `SELECT status, school_levels AS "schoolLevels", ownership FROM tenants WHERE id = $1 LIMIT 1`, [user.tenantId],
      ).catch(() => []);
      if (t.length && t[0].status === 'suspended') {
        throw new UnauthorizedException('This school account has been suspended. Please contact ZARODA support.');
      }
      schoolLevels = (t.length && t[0].schoolLevels) || [];
      ownership = (t.length && t[0].ownership) || 'public';
    }

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
        schoolLevels,
        ownership,
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
        // Parse location ids defensively: a missing or non-numeric value (e.g. the
        // frontend sending "NaN" or an empty pick) must become null, not NaN, or the
        // smallint insert fails with "invalid input syntax for type smallint: NaN".
        keCountyId:    toIntOrNull(dto.countyId),
        keSubCountyId: toIntOrNull(dto.subCountyId),
        keZoneId:      toIntOrNull(dto.zoneId),
        status:        'trial',
        trialEndsAt:   new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        subscriptionTier: 'trial',
        schoolLevels:  Array.isArray(dto.schoolLevels) ? dto.schoolLevels.filter(l => ['primary_js','senior'].includes(l)) : [],
        ownership:     dto.ownership === 'private' ? 'private' : 'public',
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
          schoolLevels: savedTenant.schoolLevels || [],
          ownership: savedTenant.ownership || 'public',
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
        expiresIn: this.configService.get('JWT_EXPIRES_IN', '12h'),
      }),
      this.jwtService.signAsync(payload, {
        secret:    this.configService.get('JWT_REFRESH_SECRET', 'zaroda-refresh-secret'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  // ── Password reset (self-service email link) ─────────────
  private async ensureResetTable() {
    await this.dataSource.query(
      `CREATE TABLE IF NOT EXISTS password_resets (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id uuid, email text, token_hash text, expires_at timestamptz,
         used boolean DEFAULT false, created_at timestamptz DEFAULT NOW())`,
    ).catch(() => null);
  }

  /** Always returns a generic success (never reveals whether the email exists). If the email
   *  matches an active user, generates a one-time token and emails the reset link. */
  async forgotPassword(email: string, appUrl?: string) {
    const generic = { ok: true, message: 'If that email is registered, a reset link has been sent.' };
    const cleaned = (email || '').toLowerCase().trim();
    if (!cleaned) return generic;
    await this.ensureResetTable();
    const user = await this.userRepo.findOne({ where: { email: cleaned } });
    if (!user || !user.isActive) return generic;

    const crypto = eval('require')('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate previous unused tokens for this user, then store the new one.
    await this.dataSource.query(`UPDATE password_resets SET used = true WHERE user_id = $1 AND used = false`, [user.id]).catch(() => null);
    await this.dataSource.query(
      `INSERT INTO password_resets (user_id, email, token_hash, expires_at) VALUES ($1,$2,$3,$4)`,
      [user.id, cleaned, tokenHash, expires.toISOString()],
    ).catch(() => null);

    const base = (appUrl || process.env.FRONTEND_URL || 'https://zarodasolutions.app').replace(/\/+$/, '');
    const link = `${base}/auth/reset-password?token=${token}&email=${encodeURIComponent(cleaned)}`;
    const { sendEmail } = eval('require')('../../common/messaging');
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
        <div style="background:#1a2e5a;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">ZARODA — Password Reset</h2>
        </div>
        <div style="border:1px solid #eee;border-top:none;padding:20px;border-radius:0 0 8px 8px">
          <p>Hello ${user.firstName || ''},</p>
          <p>We received a request to reset your ZARODA account password. Click the button below to set a new password. This link expires in <b>1 hour</b>.</p>
          <p style="text-align:center;margin:24px 0">
            <a href="${link}" style="background:#f5820a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block">Reset my password</a>
          </p>
          <p style="font-size:12px;color:#666">If the button doesn't work, copy this link into your browser:<br>${link}</p>
          <p style="font-size:12px;color:#666">If you didn't request this, you can safely ignore this email — your password won't change.</p>
        </div>
      </div>`;
    await sendEmail(cleaned, 'Reset your ZARODA password', html).catch(() => null);
    return generic;
  }

  /** Consume a reset token and set a new password. */
  async resetPassword(email: string, token: string, newPassword: string) {
    const cleaned = (email || '').toLowerCase().trim();
    if (!cleaned || !token || !newPassword || newPassword.length < 6) {
      throw new UnauthorizedException('Invalid request. Password must be at least 6 characters.');
    }
    await this.ensureResetTable();
    const crypto = eval('require')('crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const rows = await this.dataSource.query(
      `SELECT id, user_id FROM password_resets
        WHERE email = $1 AND token_hash = $2 AND used = false AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1`,
      [cleaned, tokenHash],
    ).catch(() => []);
    if (!rows.length) throw new UnauthorizedException('This reset link is invalid or has expired. Please request a new one.');

    const hash = await bcrypt.hash(newPassword, 10);
    await this.dataSource.query(
      `UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1`,
      [rows[0].user_id, hash],
    ).catch(() => { throw new UnauthorizedException('Could not update password.'); });
    await this.dataSource.query(`UPDATE password_resets SET used = true WHERE id = $1`, [rows[0].id]).catch(() => null);
    return { ok: true, message: 'Your password has been reset. You can now log in.' };
  }
}
