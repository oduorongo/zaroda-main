// ── src/modules/onboarding/teacher-onboard.module.ts ─────────
// Admin generates a per-school onboarding link (shared via WhatsApp).
// Teachers open it and self-onboard into that school/tenant.
//
//   POST  /api/v1/teacher-onboard/generate     (admin, authed) → link + WhatsApp text
//   GET   /api/v1/teacher-onboard/validate/:token  (public)    → { valid, schoolName }
//   POST  /api/v1/teacher-onboard/accept       (public)        → creates teacher + credentials
//   GET   /api/v1/teacher-onboard/mine         (admin, authed) → current link + stats
import {
  Module, Controller, Injectable, Get, Post, Body, Param, Request,
  UseGuards, BadRequestException, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Repository,
} from 'typeorm';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Entity('teacher_onboard_links')
export class TeacherOnboardLink {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'school_id', nullable: true }) schoolId: string;
  @Column({ name: 'token_hash' }) tokenHash: string;
  @Column({ name: 'token_prefix', nullable: true }) tokenPrefix: string;
  @Column({ name: 'invite_url' }) inviteUrl: string;
  @Column({ name: 'created_by', nullable: true }) createdBy: string;
  @Column({ name: 'school_name', nullable: true }) schoolName: string;
  @Column({ name: 'uses_count', default: 0 }) usesCount: number;
  @Column({ name: 'max_uses', default: 200 }) maxUses: number;
  @Column({ name: 'expires_at' }) expiresAt: Date;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

const buildWhatsApp = (school: string, url: string) =>
`👋 *Join ${school} on ZARODA School Management System*

You've been invited to set up your teacher account. It takes about a minute:

1. Tap the link below
2. Enter your name, email and phone
3. Pick the learning areas you teach (and your class, if you're a class teacher)

You'll get your login details immediately and can start managing your marks, attendance and report cards right away.

👉 ${url}

(This link is for ${school} staff only.)`;

@Injectable()
export class TeacherOnboardService {
  constructor(
    @InjectRepository(TeacherOnboardLink) private linkRepo: Repository<TeacherOnboardLink>,
    private dataSource: DataSource,
  ) {}

  private appBase() {
    return (process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3001').replace(/\/$/, '');
  }

  // Admin generates (or reuses) the active onboarding link for their school.
  async generate(user: any, regenerate = false) {
    const tenantId = user.tenantId;
    if (!tenantId) throw new BadRequestException('No school context');

    // School name for the share message
    const srow = await this.dataSource.query(
      `SELECT name FROM schools WHERE tenant_id::text = $1 LIMIT 1`, [tenantId],
    ).catch(() => []);
    const schoolName = srow[0]?.name || 'our school';

    // Reuse an existing active, unexpired link unless regenerating
    if (!regenerate) {
      const existing = await this.linkRepo.findOne({
        where: { tenantId, isActive: true },
        order: { createdAt: 'DESC' },
      });
      if (existing && existing.expiresAt > new Date()) {
        return {
          inviteUrl: existing.inviteUrl,
          schoolName,
          expiresAt: existing.expiresAt,
          usesCount: existing.usesCount,
          maxUses: existing.maxUses,
          shareMessage: buildWhatsApp(schoolName, existing.inviteUrl),
          whatsappUrl: `https://wa.me/?text=${encodeURIComponent(buildWhatsApp(schoolName, existing.inviteUrl))}`,
        };
      }
    } else {
      // Deactivate previous links for this tenant
      await this.linkRepo.update({ tenantId, isActive: true }, { isActive: false });
    }

    const rawToken  = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const prefix    = rawToken.slice(0, 8);
    const inviteUrl = `${this.appBase()}/onboard/${rawToken}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.linkRepo.save(this.linkRepo.create({
      tenantId, schoolId: user.schoolId, tokenHash, tokenPrefix: prefix,
      inviteUrl, createdBy: user.id, schoolName, expiresAt, isActive: true,
    }));

    return {
      inviteUrl, schoolName, expiresAt, usesCount: 0, maxUses: 200,
      shareMessage: buildWhatsApp(schoolName, inviteUrl),
      whatsappUrl: `https://wa.me/?text=${encodeURIComponent(buildWhatsApp(schoolName, inviteUrl))}`,
    };
  }

  // Public: validate a token (used by the onboarding page on load)
  async validate(token: string) {
    const hash = crypto.createHash('sha256').update(token || '').digest('hex');
    const link = await this.linkRepo.findOne({ where: { tokenHash: hash, isActive: true } });
    if (!link) return { valid: false, reason: 'This onboarding link is invalid or has been disabled.' };
    if (link.expiresAt < new Date()) return { valid: false, reason: 'This onboarding link has expired.' };
    if (link.usesCount >= link.maxUses) return { valid: false, reason: 'This onboarding link has reached its limit.' };
    return { valid: true, schoolName: link.schoolName };
  }

  // Public: a teacher self-onboards into the tenant behind the token.
  async accept(token: string, body: {
    fullName: string; email: string; phone?: string;
    role?: string; streamId?: string; subjects?: string[];
    password?: string;
  }) {
    const hash = crypto.createHash('sha256').update(token || '').digest('hex');
    const link = await this.linkRepo.findOne({ where: { tokenHash: hash, isActive: true } });
    if (!link) throw new NotFoundException('This onboarding link is invalid or disabled.');
    if (link.expiresAt < new Date()) throw new BadRequestException('This onboarding link has expired.');
    if (link.usesCount >= link.maxUses) throw new BadRequestException('This onboarding link has reached its limit.');

    const fullName = (body.fullName || '').trim();
    const email    = (body.email || '').toLowerCase().trim();
    if (fullName.split(/\s+/).length < 2) throw new BadRequestException('Enter your first and last name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new BadRequestException('Enter a valid email address.');

    // An address already in use is not automatically a refusal. A teacher who signed
    // up for Professional Records owns a one-person 'individual' tenant keyed to this
    // email, and telling them to "log in instead" only returns them to that tenant —
    // never to the school whose link they just opened. Absorb that account into this
    // school instead, keeping their login and the work they have already paid for.
    // Anything else on the address (a real school account) is still refused.
    const dup = await this.dataSource.query(
      `SELECT u.id, u.password_hash AS "passwordHash", u.tenant_id AS "tenantId",
              u.school_id AS "schoolId", t.account_type AS "accountType"
         FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id
        WHERE lower(btrim(u.email)) = $1 LIMIT 1`, [email]);
    if (dup.length) {
      const found = dup[0];
      if (found.accountType !== 'individual') {
        throw new BadRequestException('An account with this email already exists. Please log in instead.');
      }
      // An individual tenant is provisioned for exactly one person; if others have
      // since been attached to it, moving the owner out would strand them.
      const siblings = await this.dataSource.query(
        `SELECT count(*)::int AS n FROM users WHERE tenant_id = $1`, [found.tenantId]);
      if ((siblings[0]?.n || 0) > 1) {
        throw new BadRequestException('This email belongs to an account that cannot be moved automatically. Please contact ZARODA support.');
      }
      // The invite link is shareable (up to 200 uses), so possession of it proves
      // nothing about who owns this address — require the account's own password
      // before moving it, or anyone holding the link could pull someone else's
      // account (and their wallet balance) into their school.
      const supplied = (body.password || '').trim();
      if (!supplied || !(await bcrypt.compare(supplied, found.passwordHash))) {
        throw new UnauthorizedException("This email already has a ZARODA teacher account. Enter that account's existing password to move it to this school.");
      }
      return this.absorbIndividual(found, link, { fullName, email, phone: body.phone, role: body.role, streamId: body.streamId, subjects: body.subjects });
    }

    const allowedRoles = ['subject_teacher', 'class_teacher', 'overall_class_teacher'];
    const role = allowedRoles.includes(body.role || '') ? body.role : 'subject_teacher';

    const parts = fullName.split(/\s+/);
    const firstName = parts.shift() as string;
    const lastName  = parts.join(' ');

    // The teacher chooses their own password during self-onboarding (copy-pasting a
    // system password that bundles username+password was error-prone). Fall back to a
    // generated one only if none was provided.
    const gen = () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
      const block = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      return `${block()}-${block()}-${block()}`;
    };
    const chosen = (body.password || '').trim();
    if (chosen && chosen.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters.');
    }
    const plain = chosen || gen();
    const passwordHash = await bcrypt.hash(plain, 12);
    const teacherSetOwnPassword = !!chosen;
    const subjects = Array.isArray(body.subjects) ? body.subjects.join(',') : '';

    const inserted = await this.dataSource.query(
      `INSERT INTO users
         (email, password_hash, first_name, last_name, phone, role,
          tenant_id, school_id, stream_id, subjects,
          is_active, email_verified, must_change_password, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,false,$11,NOW(),NOW())
       RETURNING id`,
      [
        email, passwordHash, firstName, lastName, body.phone || null, role,
        link.tenantId, link.schoolId,
        body.streamId && body.streamId.length ? body.streamId : null,
        subjects,
        !teacherSetOwnPassword,   // only force a change if we generated the password
      ],
    );
    const userId = inserted[0]?.id;

    // Count the use + record the signup
    await this.linkRepo.increment({ id: link.id }, 'usesCount', 1);
    await this.dataSource.query(
      `INSERT INTO teacher_onboard_signups (link_id, tenant_id, user_id, teacher_name, email)
       VALUES ($1,$2,$3,$4,$5)`,
      [link.id, link.tenantId, userId, `${firstName} ${lastName}`, email],
    ).catch(() => null);

    return {
      success: true,
      schoolName: link.schoolName,
      teacherSetOwnPassword,
      credentials: { username: email, password: teacherSetOwnPassword ? '(the password you chose)' : plain },
      message: teacherSetOwnPassword
        ? 'Account created. Log in with your email and the password you chose.'
        : 'Account created. Use these credentials to log in. You will be asked to set a new password.',
    };
  }

  // Tenant-scoped tables an individual (Professional Records) account can fill.
  // Ordered as a checklist rather than a query plan: everything here has to land
  // in the new tenant, or the teacher loses work they paid real money for.
  private static readonly PR_TABLES = [
    'schemes_of_work', 'scheme_weeks', 'lesson_plans', 'lesson_notes',
    'records_of_work', 'learner_progress_entries', 'teacher_documents',
    'pr_wallets', 'pr_wallet_transactions', 'professional_records_audit',
    'teacher_stream_subjects',
  ];

  /** Column names present on a table, or [] if the table does not exist here.
   *  Schemas drift between environments, so each move is built from what is
   *  actually there instead of assuming every table carries a school_id. */
  private async columnsOf(table: string): Promise<string[]> {
    const rows = await this.dataSource.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = $1`, [table],
    ).catch(() => []);
    return rows.map((r: any) => r.column_name);
  }

  /** Move an existing one-person individual account into the tenant behind an
   *  onboarding link: the user row, and everything they generated under the old
   *  tenant. The old tenant row itself is deliberately left in place — tenants
   *  cascade-delete their dependents, so removing it is how this operation would
   *  destroy the very data it exists to preserve. It is simply left empty. */
  private async absorbIndividual(
    found: { id: string; tenantId: string; schoolId: string },
    link: TeacherOnboardLink,
    body: { fullName: string; email: string; phone?: string; role?: string; streamId?: string; subjects?: string[] },
  ) {
    const allowedRoles = ['subject_teacher', 'class_teacher', 'overall_class_teacher'];
    const role = allowedRoles.includes(body.role || '') ? body.role : 'subject_teacher';
    const parts = body.fullName.split(/s+/);
    const firstName = parts.shift() as string;
    const lastName = parts.join(' ');
    const subjects = Array.isArray(body.subjects) ? body.subjects.join(',') : '';

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      for (const table of TeacherOnboardService.PR_TABLES) {
        const cols = await this.columnsOf(table);
        if (!cols.includes('tenant_id')) continue;   // table absent in this schema
        const sets = ['tenant_id = $1'];
        if (cols.includes('school_id')) sets.push('school_id = $2');
        await runner.query(
          `UPDATE ${table} SET ${sets.join(', ')} WHERE tenant_id = $3`,
          [link.tenantId, link.schoolId, found.tenantId],
        );
      }

      // The streams and subjects an individual account generates are synthetic —
      // "Grade 5 (self)" placeholders invented per scheme, not real classes. They
      // have to come along so the moved schemes still resolve their foreign keys,
      // but they are retired on arrival so they never show up in the school's own
      // class and subject lists as classes nobody created.
      for (const table of ['streams', 'subject_catalogue']) {
        const cols = await this.columnsOf(table);
        if (!cols.includes('tenant_id')) continue;
        const sets = ['tenant_id = $1'];
        if (cols.includes('school_id'))  sets.push('school_id = $2');
        if (cols.includes('is_active'))  sets.push('is_active = false');
        if (cols.includes('deleted_at')) sets.push('deleted_at = COALESCE(deleted_at, NOW())');
        await runner.query(
          `UPDATE ${table} SET ${sets.join(', ')} WHERE tenant_id = $3`,
          [link.tenantId, link.schoolId, found.tenantId],
        );
      }

      // They keep their own password, so must_change_password stays off.
      await runner.query(
        `UPDATE users
            SET tenant_id = $1, school_id = $2, role = $3, stream_id = $4,
                subjects = $5, first_name = $6, last_name = $7,
                phone = COALESCE($8, phone), updated_at = NOW()
          WHERE id = $9`,
        [
          link.tenantId, link.schoolId, role,
          body.streamId && body.streamId.length ? body.streamId : null,
          subjects, firstName, lastName, body.phone || null, found.id,
        ],
      );

      await runner.query(
        `UPDATE teacher_onboard_links SET uses_count = uses_count + 1 WHERE id = $1`, [link.id]);
      await runner.query(
        `INSERT INTO teacher_onboard_signups (link_id, tenant_id, user_id, teacher_name, email)
         VALUES ($1,$2,$3,$4,$5)`,
        [link.id, link.tenantId, found.id, `${firstName} ${lastName}`, body.email],
      ).catch(() => null);

      await runner.commitTransaction();
    } catch (err) {
      await runner.rollbackTransaction();
      throw err;
    } finally {
      await runner.release();
    }

    return {
      success: true,
      schoolName: link.schoolName,
      teacherSetOwnPassword: true,
      absorbed: true,
      credentials: { username: body.email, password: '(your existing password)' },
      message: `Your existing ZARODA account has joined ${link.schoolName}. Log in with the same email and password you already use — your Professional Records and wallet balance came with you.`,
    };
  }

  async mine(user: any) {
    const link = await this.linkRepo.findOne({
      where: { tenantId: user.tenantId, isActive: true }, order: { createdAt: 'DESC' },
    });
    if (!link) return { exists: false };
    const signups = await this.dataSource.query(
      `SELECT teacher_name AS "teacherName", email, created_at AS "createdAt"
         FROM teacher_onboard_signups WHERE link_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [link.id],
    ).catch(() => []);
    return {
      exists: true,
      inviteUrl: link.inviteUrl,
      schoolName: link.schoolName,
      expiresAt: link.expiresAt,
      usesCount: link.usesCount,
      maxUses: link.maxUses,
      signups,
    };
  }
}

@Controller('teacher-onboard')
export class TeacherOnboardController {
  constructor(private svc: TeacherOnboardService) {}

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  generate(@Request() req: any, @Body('regenerate') regenerate?: boolean) {
    return this.svc.generate(req.user, !!regenerate);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@Request() req: any) {
    return this.svc.mine(req.user);
  }

  // Public — no auth (teacher isn't a user yet)
  @Get('validate/:token')
  validate(@Param('token') token: string) {
    return this.svc.validate(token);
  }

  @Post('accept')
  accept(@Body() body: any) {
    return this.svc.accept(body?.token, body);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([TeacherOnboardLink])],
  controllers: [TeacherOnboardController],
  providers: [TeacherOnboardService],
})
export class TeacherOnboardModule {}
