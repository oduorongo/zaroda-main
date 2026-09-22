import {
  Injectable, UnauthorizedException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService }    from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt       from 'bcryptjs';

import { User }     from './entities/user.entity';
import { Tenant }   from './entities/tenant.entity';
import { School }   from './entities/school.entity';
import { SignupDto, SignupIndividualDto, UpgradeToSchoolDto } from './dto';
import { normalisePhone } from '../../common/messaging';
import { sendEmail } from '../../common/messaging';

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

  /** Find a user by email, case- and whitespace-insensitively.
   *  users.email is a plain (case-sensitive) unique column, and some rows were historically
   *  written un-normalised — a mixed-case or space-padded address then never matched an exact
   *  lowercase lookup, locking the account out permanently no matter how often its password was
   *  reset. Matching on lower(btrim(email)) makes login work however the row was stored.
   *  Migration 065 normalises the existing rows; this keeps any stragglers usable. */
  private async findUserByEmail(email: string, columns?: string[]) {
    const cleaned = (email || '').toLowerCase().trim();
    if (!cleaned) return null;
    const qb = this.userRepo.createQueryBuilder('u')
      .where('lower(btrim(u.email)) = :email', { email: cleaned })
      .limit(1);
    if (columns) qb.select(columns.map(c => `u.${c}`));
    return qb.getOne();
  }

  /** Find a user by phone (normalised to +254… before comparing), for parents who log in
   *  without an email — see findUserByEmail's normalisation note; phone gets the same
   *  as-typed tolerance (spaces, a leading 0 instead of +254, etc). */
  private async findUserByPhone(phone: string, columns?: string[]) {
    const cleaned = normalisePhone(phone || '');
    if (!cleaned) return null;
    const qb = this.userRepo.createQueryBuilder('u')
      .where('u.phone = :phone', { phone: cleaned })
      .limit(1);
    if (columns) qb.select(columns.map(c => `u.${c}`));
    return qb.getOne();
  }

  // ── Login ───────────────────────────────────────────────
  // `identifier` is an email for every role except parents, who may only have a phone
  // number on file — try email first (the common case), then fall back to phone so a
  // number typed into the same field still finds the right account.
  async login(identifier: string, password: string) {
    const columns = ['id','email','passwordHash','firstName','lastName','role','tenantId','schoolId','streamId','streamName','subjects','isActive'];
    let user = await this.findUserByEmail(identifier, columns);
    if (!user) user = await this.findUserByPhone(identifier, columns);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email/phone or password');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid email or password');

    // Block users whose school has been suspended by the platform owner. The owner
    // (super_admin) has no tenant and is never blocked. Also fetch school_levels here
    // so the frontend can gate senior-school-only UI without a second round trip.
    let schoolLevels: string[] = [];
    let ownership = 'public';
    let accountType = 'school';
    let planTier = 'essential';
    if (user.role !== 'super_admin' && user.tenantId) {
      const t = await this.dataSource.query(
        `SELECT status, school_levels AS "schoolLevels", ownership, account_type AS "accountType", plan_tier AS "planTier" FROM tenants WHERE id = $1 LIMIT 1`, [user.tenantId],
      ).catch(() => []);
      if (t.length && t[0].status === 'suspended') {
        throw new UnauthorizedException('This school account has been suspended. Please contact ZARODA support.');
      }
      schoolLevels = (t.length && t[0].schoolLevels) || [];
      ownership = (t.length && t[0].ownership) || 'public';
      accountType = (t.length && t[0].accountType) || 'school';
      planTier = (t.length && t[0].planTier) || 'essential';
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
        accountType,
        planTier,
      },
    };
  }

  // ── Signup ──────────────────────────────────────────────
  async signup(dto: SignupDto) {
    const existing = await this.findUserByEmail(dto.email);
    if (existing) {
      // A Professional Records teacher already owns a one-person tenant on this
      // address, so a plain conflict here is a dead end — they have no way to
      // reach the school product except by abandoning the account they have.
      // Point them at the in-place upgrade instead (see upgradeToSchool).
      const owned = existing.tenantId
        ? await this.tenantRepo.findOne({ where: { id: existing.tenantId } })
        : null;
      if (owned && owned.accountType === 'individual') {
        throw new ConflictException(
          'This email already has a ZARODA teacher account. Log in with it and choose "Set up a school account" to add your school — you will keep your existing records.',
        );
      }
      throw new ConflictException('An account with this email already exists');
    }

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

      // Fire-and-forget: sendEmail fails soft and must never block or fail signup.
      const appUrl = process.env.APP_URL || 'https://app.zarodasolutions.app';
      sendEmail(
        savedUser.email,
        `Welcome to ZARODA, ${dto.schoolName}!`,
        `<p>Hi ${dto.adminFirstName},</p>
         <p>Your ZARODA account for <b>${dto.schoolName}</b> is ready, and your 14-day free trial has started.</p>
         <p>A few things to do next to get your school fully set up:</p>
         <ol>
           <li>Create your first class / stream</li>
           <li>Add your teachers</li>
           <li>Admit your students</li>
         </ol>
         <p>Log in any time at <a href="${appUrl}">${appUrl.replace(/^https?:\/\//, '')}</a> to continue — your dashboard will show you what's left.</p>
         <p>— The ZARODA team</p>`,
      );

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

  // ── Individual teacher signup (Professional Records, no school tenant) ──
  // Auto-provisions a one-person tenant + school behind the scenes so every
  // existing tenant-scoped table/query/RLS policy keeps working unchanged —
  // the teacher never sees "tenant" or "school" language for this account.
  async signupIndividual(dto: SignupIndividualDto) {
    const existing = await this.findUserByEmail(dto.email);
    if (existing) throw new ConflictException('An account with this email already exists');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const displayName = `${dto.firstName} ${dto.lastName}`.trim();

      const tenant = this.tenantRepo.create({
        name: displayName,
        accountType: 'individual',
        status: 'active',
        subscriptionTier: 'individual',
      });
      const savedTenant = await queryRunner.manager.save(Tenant, tenant);

      const school = this.schoolRepo.create({
        name: displayName,
        phone: dto.phone || '',
        tenantId: savedTenant.id,
      });
      const savedSchool = await queryRunner.manager.save(School, school);

      // Referral is attributed at signup but rewarded later — only once the referred
      // teacher actually pays for their first generation (see WalletService.debit).
      // A bad/self-referencing id is silently ignored rather than blocking signup.
      let referredBy: string | undefined;
      if (dto.ref) {
        const referrer = await queryRunner.manager.findOne(User, { where: { id: dto.ref } });
        if (referrer && referrer.email.toLowerCase().trim() !== dto.email.toLowerCase().trim()) referredBy = referrer.id;
      }

      const passwordHash = await bcrypt.hash(dto.password, 12);
      const user = this.userRepo.create({
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: 'class_teacher',
        tenantId: savedTenant.id,
        schoolId: savedSchool.id,
        isActive: true,
        emailVerified: false,
        referredBy,
      });
      const savedUser = await queryRunner.manager.save(User, user);

      await queryRunner.commitTransaction();

      const tokens = await this.generateTokens(savedUser);
      return {
        message: 'Account created. You can start generating Professional Records right away.',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: savedUser.id,
          email: savedUser.email,
          firstName: savedUser.firstName,
          lastName: savedUser.lastName,
          role: savedUser.role,
          tenantId: savedTenant.id,
          schoolId: savedSchool.id,
          accountType: 'individual',
        },
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ── Upgrade an individual account to a school account ───
  // A teacher who signed up for Professional Records already owns a one-person
  // tenant keyed to their email, so the school signup form can only ever answer
  // "an account with this email already exists". Rather than forcing a second
  // login on a second address (which would strand their existing records), this
  // converts the tenant they already have into a real school tenant in place:
  // same user id, same email, same password, same Professional Records data.
  async upgradeToSchool(userId: string, dto: UpgradeToSchoolDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException('Account not found');
    if (!user.tenantId || !user.schoolId) {
      throw new BadRequestException('This account has no workspace to upgrade.');
    }

    const tenant = await this.tenantRepo.findOne({ where: { id: user.tenantId } });
    if (!tenant) throw new BadRequestException('This account has no workspace to upgrade.');
    if (tenant.accountType !== 'individual') {
      throw new ConflictException('This is already a school account.');
    }

    // An individual tenant is provisioned for exactly one person. If anything has
    // since attached other users to it, converting would silently hand them a
    // school they never joined — refuse and let support look at it instead.
    const others = await this.userRepo.count({ where: { tenantId: tenant.id } });
    if (others > 1) {
      throw new ConflictException('This workspace has more than one user and cannot be upgraded automatically. Please contact ZARODA support.');
    }

    const knecCode = dto.knecCode ? dto.knecCode.trim() : undefined;
    if (knecCode) {
      const dup = await this.tenantRepo.findOne({ where: { knecCode } });
      if (dup && dup.id !== tenant.id) {
        throw new ConflictException('A school with this KNEC code is already registered on ZARODA');
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // The tenant and school were both named after the teacher at individual
      // signup; every school field below is being set for the first time.
      await queryRunner.manager.update(Tenant, tenant.id, {
        name:          dto.schoolName,
        knecCode:      knecCode,
        county:        dto.county,
        subCounty:     dto.subCounty,
        zone:          dto.zone,
        keCountyId:    toIntOrNull(dto.countyId),
        keSubCountyId: toIntOrNull(dto.subCountyId),
        keZoneId:      toIntOrNull(dto.zoneId),
        accountType:   'school',
        // Same 14-day trial a fresh school signup gets — an individual account
        // has never been through the school subscription gate.
        status:           'trial',
        subscriptionTier: 'trial',
        trialEndsAt:      new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        schoolLevels:  Array.isArray(dto.schoolLevels) ? dto.schoolLevels.filter(l => ['primary_js','senior'].includes(l)) : [],
        ownership:     dto.ownership === 'private' ? 'private' : 'public',
      });

      await queryRunner.manager.update(School, user.schoolId, {
        name:          dto.schoolName,
        knecCode:      knecCode,
        phone:         dto.phone || user.phone || '',
        county:        dto.county,
        subCounty:     dto.subCounty,
        zone:          dto.zone,
        keCountyId:    toIntOrNull(dto.countyId),
        keSubCountyId: toIntOrNull(dto.subCountyId),
        keZoneId:      toIntOrNull(dto.zoneId),
      });

      // They registered the school, so they run it — same role a school signup grants.
      await queryRunner.manager.update(User, user.id, {
        role:  'hoi',
        phone: dto.phone || user.phone,
      });

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    const appUrl = process.env.APP_URL || 'https://app.zarodasolutions.app';
    sendEmail(
      user.email,
      `Welcome to ZARODA, ${dto.schoolName}!`,
      `<p>Hi ${user.firstName},</p>
       <p>Your ZARODA account for <b>${dto.schoolName}</b> is ready, and your 14-day free trial has started.</p>
       <p>You keep the same login you have been using, and all of your Professional Records work is still there.</p>
       <p>A few things to do next to get your school fully set up:</p>
       <ol>
         <li>Create your first class / stream</li>
         <li>Add your teachers</li>
         <li>Admit your students</li>
       </ol>
       <p>Log in any time at <a href="${appUrl}">${appUrl.replace(/^https?:\/\//, '')}</a> to continue — your dashboard will show you what's left.</p>
       <p>— The ZARODA team</p>`,
    );

    // The role is baked into the JWT, so the old tokens still say the previous
    // role — re-issue here or the school UI stays locked until they log out.
    const refreshed = await this.userRepo.findOne({ where: { id: user.id } });
    const tokens = await this.generateTokens(refreshed);
    return {
      message:      'School account created successfully. Your 14-day free trial starts now.',
      accessToken:  tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id:        refreshed.id,
        email:     refreshed.email,
        firstName: refreshed.firstName,
        lastName:  refreshed.lastName,
        role:      refreshed.role,
        tenantId:  refreshed.tenantId,
        schoolId:  refreshed.schoolId,
        accountType: 'school',
      },
    };
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
    const user = await this.userRepo.findOne({
      where:  { id: userId },
      select: ['id','email','firstName','lastName','role','tenantId','schoolId','streamId','streamName','subjects','phone','lastLoginAt'],
    });
    if (!user) return user;

    // Login includes schoolLevels/ownership/accountType (derived from the tenant, not
    // a column on users) — getMe must return the same shape, since this is what
    // rehydrates the session on every page refresh. Without it, accountType silently
    // reverts to undefined after a refresh and individual-account-only UI disappears.
    let schoolLevels: string[] = [];
    let ownership = 'public';
    let accountType = 'school';
    let planTier = 'essential';
    if (user.role !== 'super_admin' && user.tenantId) {
      const t = await this.dataSource.query(
        `SELECT school_levels AS "schoolLevels", ownership, account_type AS "accountType", plan_tier AS "planTier" FROM tenants WHERE id = $1 LIMIT 1`, [user.tenantId],
      ).catch(() => []);
      schoolLevels = (t.length && t[0].schoolLevels) || [];
      ownership = (t.length && t[0].ownership) || 'public';
      accountType = (t.length && t[0].accountType) || 'school';
      planTier = (t.length && t[0].planTier) || 'essential';
    }

    // Whether this user's own phone is on record as having opted out of
    // promotional SMS (Africa's Talking status UserInBlacklist) — only shown to
    // the affected person, since it can't be communicated to them by SMS at all.
    let smsOptedOut = false;
    const normalisedPhone = user.phone ? normalisePhone(user.phone) : null;
    if (normalisedPhone) {
      const b = await this.dataSource.query(
        `SELECT 1 FROM sms_blacklist WHERE phone_number = $1 LIMIT 1`, [normalisedPhone],
      ).catch(() => []);
      smsOptedOut = b.length > 0;
    }

    return { ...user, schoolLevels, ownership, accountType, planTier, smsOptedOut };
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
    const user = await this.findUserByEmail(cleaned);
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
    const emailResult = await sendEmail(cleaned, 'Reset your ZARODA password', html).catch((e: any) => ({ ok: false, detail: e?.message }));
    if (!emailResult?.ok) {
      // eslint-disable-next-line no-console
      console.error(`[forgotPassword] email send failed for ${cleaned}: ${emailResult?.detail}`);
    }
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
