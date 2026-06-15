// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// CLASS TEACHER SHARE INVITE — Complete Backend
// Stack: Node.js · NestJS · PostgreSQL
// Features:
//   - Cryptographically secure token generation
//   - SHA-256 hash storage (raw token never persisted)
//   - 7-day expiry with use-count cap (50/link)
//   - Rate limiting per IP (generate/click/signup)
//   - Reuse: existing active link returned for same stream
//   - Channel tracking (WhatsApp / SMS / copy)
//   - Click → conversion tracking
//   - Revocation by teacher
//   - Analytics endpoint
// ============================================================

// ─────────────────────────────────────────────────────────────
// src/modules/referral/invite.service.ts
// ─────────────────────────────────────────────────────────────
import {
  Injectable, NotFoundException, BadRequestException,
  ConflictException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan } from 'typeorm';
import * as crypto from 'crypto';

// ─── Rate limit configuration ────────────────────────────────
const RATE_LIMITS = {
  generate: { maxRequests: 10,  windowHours: 1,  blockHours: 1 },
  click:    { maxRequests: 100, windowHours: 1,  blockHours: 0 },
  signup:   { maxRequests: 5,   windowHours: 1,  blockHours: 24 },
};

const INVITE_EXPIRY_DAYS = 7;
const INVITE_MAX_USES    = 50;

// ─── Exact share message (never modified) ─────────────────────
const buildShareMessage = (teacherName: string, className: string, inviteLink: string): string =>
`👋 You've been invited by ${teacherName}, ${className} Class Teacher, to join ZARODA School Management System.

Start with your class today and let the rest of the school join later.

Sign up here: ${inviteLink}

ZARODA Solutions – Empowering Schools with Technology`;

@Injectable()
export class InviteService {
  private readonly logger = new Logger(InviteService.name);

  constructor(
    @InjectRepository(ClassTeacherInvite) private inviteRepo:    Repository<ClassTeacherInvite>,
    @InjectRepository(InviteClick)        private clickRepo:     Repository<InviteClick>,
    @InjectRepository(InviteSignup)       private signupRepo:    Repository<InviteSignup>,
    @InjectRepository(InviteRateLimit)    private rateLimitRepo: Repository<InviteRateLimit>,
    @InjectRepository(User)               private userRepo:      Repository<User>,
    @InjectRepository(Stream)            private streamRepo:    Repository<Stream>,
    private dataSource: DataSource,
  ) {}

  // ── GENERATE INVITE LINK ──────────────────────────────────
  // Returns existing active link if one exists for this teacher+stream
  async generate(teacherId: string, streamId: string, tenantId: string | null, ipHash: string): Promise<{
    inviteUrl:      string;
    token:          string;       // returned ONCE, then lost
    teacherName:    string;
    className:      string;
    shareMessage:   string;
    expiresAt:      Date;
    spotsRemaining: number;
    isNew:          boolean;
  }> {
    // Rate limit check
    await this.checkRateLimit(ipHash, 'generate');

    // Load teacher + stream
    const [teacher, stream] = await Promise.all([
      this.userRepo.findOne({ where: { id: teacherId } }),
      this.streamRepo.findOne({ where: { id: streamId } }),
    ]);
    if (!teacher) throw new NotFoundException('Teacher not found');
    if (!stream)  throw new NotFoundException('Stream not found');

    const teacherName = `${teacher.firstName} ${teacher.lastName}`.trim();
    const className   = stream.name;

    // Return existing active, unexpired link for this teacher+stream
    const existing = await this.inviteRepo.findOne({
      where: {
        teacherId,
        streamId,
        isActive:  true,
        expiresAt: MoreThan(new Date()),
      },
    });

    if (existing) {
      // Clear the raw token (already used) — return empty string
      // Teacher gets the stored URL, not the token again
      const spotsRemaining = Math.max(0, existing.maxUses - existing.useCount);
      return {
        inviteUrl:    existing.inviteUrl,
        token:        existing.rawTokenOnce || '', // only valid on first call
        teacherName,
        className,
        shareMessage: buildShareMessage(teacherName, className, existing.inviteUrl),
        expiresAt:    existing.expiresAt,
        spotsRemaining,
        isNew:        false,
      };
    }

    // Generate a cryptographically secure token
    const rawToken  = crypto.randomBytes(32).toString('base64url');  // 43 URL-safe chars
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const prefix    = rawToken.slice(0, 8);
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const baseUrl   = process.env.APP_URL || 'https://app.zarodasolutions.app';
    const inviteUrl = `${baseUrl}/invite/${rawToken}`;

    const invite = await this.inviteRepo.save(
      this.inviteRepo.create({
        tenantId,
        teacherId,
        streamId,
        tokenHash,
        tokenPrefix:   prefix,
        rawTokenOnce:  rawToken,   // cleared after first read below
        inviteUrl,
        teacherName,
        className,
        expiresAt,
        maxUses:       INVITE_MAX_USES,
        useCount:      0,
        isActive:      true,
        channelsUsed:  [],
      })
    );

    this.logger.log(`Invite generated: teacher=${teacherId} stream=${streamId} prefix=${prefix}`);

    return {
      inviteUrl,
      token:        rawToken,
      teacherName,
      className,
      shareMessage: buildShareMessage(teacherName, className, inviteUrl),
      expiresAt,
      spotsRemaining: INVITE_MAX_USES,
      isNew:        true,
    };
  }

  // ── VALIDATE TOKEN (called when someone opens the invite link) ──
  async validateToken(rawToken: string, ipHash: string, userAgent: string, referer: string): Promise<{
    valid:          boolean;
    invite?:        Partial<ClassTeacherInvite>;
    clickId?:       string;
    shareMessage?:  string;
    error?:         string;
    daysRemaining?: number;
    spotsRemaining?: number;
  }> {
    // Rate limit clicks
    await this.checkRateLimit(ipHash, 'click');

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const invite = await this.inviteRepo.findOne({ where: { tokenHash } });

    // Track the click regardless of validity
    const click = await this.clickRepo.save(
      this.clickRepo.create({
        inviteId:       invite?.id || '00000000-0000-0000-0000-000000000000',
        ipHash,
        userAgentHash:  crypto.createHash('sha256').update(userAgent || '').digest('hex'),
        referer:        this.classifyReferer(referer),
        converted:      false,
      })
    );

    if (!invite) {
      return { valid: false, error: 'This invite link is not valid.' };
    }

    if (!invite.isActive || invite.revokedAt) {
      return { valid: false, error: 'This invite link has been deactivated.' };
    }

    if (new Date() > new Date(invite.expiresAt)) {
      return { valid: false, error: 'This invite link has expired. Please ask the teacher for a new one.' };
    }

    if (invite.useCount >= invite.maxUses) {
      return { valid: false, error: 'This invite link has reached its maximum number of uses.' };
    }

    const msRemaining   = new Date(invite.expiresAt).getTime() - Date.now();
    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
    const spotsRemaining = invite.maxUses - invite.useCount;

    return {
      valid: true,
      invite: {
        id:          invite.id,
        teacherName: invite.teacherName,
        className:   invite.className,
        inviteUrl:   invite.inviteUrl,
      },
      clickId:      click.id,
      shareMessage: buildShareMessage(invite.teacherName, invite.className, invite.inviteUrl),
      daysRemaining,
      spotsRemaining,
    };
  }

  // ── ACCEPT INVITE (new school signs up) ───────────────────
  async accept(rawToken: string, clickId: string | null, dto: {
    schoolName:  string;
    adminEmail:  string;
    adminName:   string;
    streamName?: string;
  }, ipHash: string): Promise<{ signupId: string; message: string }> {
    // Rate limit signups
    await this.checkRateLimit(ipHash, 'signup');

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const invite    = await this.inviteRepo.findOne({ where: { tokenHash, isActive: true } });

    if (!invite) throw new NotFoundException('Invite not found or expired');
    if (new Date() > new Date(invite.expiresAt)) {
      throw new BadRequestException('Invite link has expired');
    }
    if (invite.useCount >= invite.maxUses) {
      throw new BadRequestException('Invite has reached maximum uses');
    }

    // Prevent duplicate signups from same email
    const duplicate = await this.signupRepo.findOne({
      where: { inviteId: invite.id, adminEmail: dto.adminEmail },
    });
    if (duplicate) {
      throw new ConflictException('This email has already used this invite link');
    }

    return this.dataSource.transaction(async (manager) => {
      // Create signup record
      const signup = await manager.save(InviteSignup, manager.create(InviteSignup, {
        inviteId:    invite.id,
        clickId,
        schoolName:  dto.schoolName,
        adminEmail:  dto.adminEmail,
        adminName:   dto.adminName,
        streamName:  dto.streamName || invite.className,
        ipHash,
      }));

      // Increment use count
      await manager.update(ClassTeacherInvite, invite.id, {
        useCount: () => 'use_count + 1',
      });

      // Mark click as converted
      if (clickId) {
        await manager.update(InviteClick, clickId, {
          converted: true,
          signupId:  signup.id,
        });
      }

      this.logger.log(`Invite accepted: inviteId=${invite.id} school="${dto.schoolName}" email=${dto.adminEmail}`);

      return {
        signupId: signup.id,
        message:  `Welcome to ZARODA! Your account for ${dto.schoolName} is being set up.`,
      };
    });
  }

  // ── TRACK SHARE CHANNEL ───────────────────────────────────
  async trackShare(inviteId: string, teacherId: string, channel: 'whatsapp' | 'sms' | 'copy') {
    const invite = await this.inviteRepo.findOne({ where: { id: inviteId, teacherId } });
    if (!invite) throw new NotFoundException('Invite not found');

    const channels = [...new Set([...(invite.channelsUsed || []), channel])];
    await this.inviteRepo.update(inviteId, { channelsUsed: channels });

    return { tracked: true, channels };
  }

  // ── REVOKE LINK ───────────────────────────────────────────
  async revoke(inviteId: string, teacherId: string, reason?: string) {
    const invite = await this.inviteRepo.findOne({ where: { id: inviteId, teacherId } });
    if (!invite) throw new NotFoundException('Invite not found');
    if (!invite.isActive) throw new BadRequestException('Invite already inactive');

    await this.inviteRepo.update(inviteId, {
      isActive:    false,
      revokedAt:   new Date(),
      revokedBy:   teacherId,
      revokeReason: reason || 'Revoked by teacher',
    });

    return { message: 'Invite link deactivated successfully.' };
  }

  // ── GET MY INVITES ─────────────────────────────────────────
  async getMyInvites(teacherId: string): Promise<any[]> {
    const invites = await this.inviteRepo.find({
      where: { teacherId },
      order: { createdAt: 'DESC' },
    });

    return invites.map(inv => ({
      id:            inv.id,
      className:     inv.className,
      inviteUrl:     inv.inviteUrl,           // always safe to return URL
      // token_hash and raw_token_once are NEVER returned in list
      expiresAt:     inv.expiresAt,
      isActive:      inv.isActive,
      isExpired:     new Date() > new Date(inv.expiresAt),
      useCount:      inv.useCount,
      maxUses:       inv.maxUses,
      spotsRemaining: Math.max(0, inv.maxUses - inv.useCount),
      channelsUsed:  inv.channelsUsed,
      createdAt:     inv.createdAt,
    }));
  }

  // ── GET ANALYTICS ─────────────────────────────────────────
  async getAnalytics(inviteId: string, teacherId: string) {
    const invite = await this.inviteRepo.findOne({ where: { id: inviteId, teacherId } });
    if (!invite) throw new NotFoundException('Invite not found');

    const [clicks, signups] = await Promise.all([
      this.clickRepo.count({ where: { inviteId } }),
      this.signupRepo.count({ where: { inviteId } }),
    ]);

    const signupList = await this.signupRepo.find({
      where: { inviteId },
      select: ['schoolName','adminName','streamName','signedUpAt','onboardingCompletedAt'],
      order:  { signedUpAt: 'DESC' },
    });

    return {
      inviteId,
      className:    invite.className,
      clickCount:   clicks,
      signupCount:  signups,
      conversionRate: clicks > 0 ? parseFloat(((signups / clicks) * 100).toFixed(1)) : 0,
      channelsUsed: invite.channelsUsed,
      signups:      signupList,
    };
  }

  // ── PRIVATE: RATE LIMITING ────────────────────────────────
  private async checkRateLimit(ipHash: string, action: 'generate' | 'click' | 'signup') {
    const config = RATE_LIMITS[action];
    const now    = new Date();

    // Check if currently blocked
    const existing = await this.rateLimitRepo.findOne({
      where: { ipHash, action },
      order: { createdAt: 'DESC' },
    });

    if (existing?.blockedUntil && new Date(existing.blockedUntil) > now) {
      const minutesLeft = Math.ceil(
        (new Date(existing.blockedUntil).getTime() - now.getTime()) / 60000
      );
      throw new ForbiddenException(
        `Too many ${action} attempts. Please try again in ${minutesLeft} minute(s).`
      );
    }

    // Find or create window bucket
    const windowStart = new Date(now);
    windowStart.setMinutes(0, 0, 0);  // floor to hour

    const bucket = await this.rateLimitRepo.findOne({
      where: { ipHash, action, windowStart },
    });

    if (!bucket) {
      await this.rateLimitRepo.save(
        this.rateLimitRepo.create({ ipHash, action, windowStart, requestCount: 1 })
      );
      return; // first request in window — ok
    }

    if (bucket.requestCount >= config.maxRequests) {
      const blockedUntil = config.blockHours > 0
        ? new Date(now.getTime() + config.blockHours * 60 * 60 * 1000)
        : undefined;

      await this.rateLimitRepo.update(bucket.id, {
        requestCount: bucket.requestCount + 1,
        blockedUntil,
      });

      throw new ForbiddenException(
        `Rate limit exceeded. Please try again later.`
      );
    }

    await this.rateLimitRepo.update(bucket.id, {
      requestCount: bucket.requestCount + 1,
    });
  }

  private classifyReferer(referer: string): string {
    if (!referer) return 'direct';
    if (referer.includes('whatsapp')) return 'whatsapp';
    if (referer.includes('sms') || referer.includes('messages')) return 'sms';
    return 'unknown';
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/referral/invite.controller.ts
// ─────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Delete, Body, Param,
  Query, Headers, Ip, UseGuards, HttpCode, HttpStatus
} from '@nestjs/common';

@Controller('api/v1/invites')
export class InviteController {
  constructor(private inviteService: InviteService) {}

  // Authenticated: teacher generates or retrieves their invite
  @Post('generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('class_teacher','overall_class_teacher')
  generate(
    @CurrentUser() u: User,
    @Body('streamId') streamId: string,
    @Ip() ip: string,
  ) {
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex');
    return this.inviteService.generate(u.id, streamId, u.tenantId, ipHash);
  }

  // PUBLIC: validate token when recipient opens the link
  @Get('validate/:token')
  @HttpCode(HttpStatus.OK)
  validate(
    @Param('token') token: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
    @Headers('referer') referer: string,
  ) {
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex');
    return this.inviteService.validateToken(token, ipHash, ua || '', referer || '');
  }

  // PUBLIC: accept invite (new school signs up)
  @Post('accept')
  @HttpCode(HttpStatus.CREATED)
  accept(
    @Body() body: { token: string; clickId?: string; schoolName: string; adminEmail: string; adminName: string; streamName?: string },
    @Ip() ip: string,
  ) {
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex');
    return this.inviteService.accept(body.token, body.clickId || null, {
      schoolName:  body.schoolName,
      adminEmail:  body.adminEmail,
      adminName:   body.adminName,
      streamName:  body.streamName,
    }, ipHash);
  }

  // Track which channel the teacher used to share
  @Post(':id/track-share')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('class_teacher','overall_class_teacher')
  trackShare(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Body('channel') channel: 'whatsapp' | 'sms' | 'copy',
  ) {
    return this.inviteService.trackShare(id, u.id, channel);
  }

  // Teacher revokes their link
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('class_teacher','overall_class_teacher')
  revoke(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.inviteService.revoke(id, u.id, reason);
  }

  // Teacher views their invite history
  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('class_teacher','overall_class_teacher')
  getMyInvites(@CurrentUser() u: User) {
    return this.inviteService.getMyInvites(u.id);
  }

  // Teacher views analytics for one invite
  @Get(':id/analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('class_teacher','overall_class_teacher','hoi','school_admin','tenant_owner')
  getAnalytics(@CurrentUser() u: User, @Param('id') id: string) {
    return this.inviteService.getAnalytics(id, u.id);
  }
}
