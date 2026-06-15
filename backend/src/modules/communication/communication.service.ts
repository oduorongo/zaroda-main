// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// MODULE 04: Communication — NestJS Backend
// Services: SmsService · EmailService · PushService
//           AnnouncementService · CampaignService
//           MessageThreadService · RetoolingService
// ============================================================

// ─────────────────────────────────────────────────────────────
// src/modules/communication/dto/communication.dto.ts
// ─────────────────────────────────────────────────────────────
import {
  IsNotEmpty, IsOptional, IsString, IsEnum,
  IsBoolean, IsUUID, IsArray, IsDateString
} from 'class-validator';

export class SendSmsDto {
  @IsNotEmpty() @IsString() to: string;             // phone number
  @IsNotEmpty() @IsString() message: string;
  @IsOptional() @IsUUID()   recipientId?: string;
  @IsOptional() @IsString() templateCategory?: string;
}

export class SendEmailDto {
  @IsNotEmpty() @IsString() to: string;
  @IsNotEmpty() @IsString() subject: string;
  @IsNotEmpty() @IsString() body: string;
  @IsOptional() @IsUUID()   recipientId?: string;
  @IsOptional() @IsBoolean() isHtml?: boolean;
}

export class CreateAnnouncementDto {
  @IsNotEmpty() @IsString() title: string;
  @IsNotEmpty() @IsString() body: string;
  @IsOptional() @IsString() category?: string;
  @IsNotEmpty() @IsEnum(['all','admins','teachers','learners','parents']) audience: string;
  @IsOptional()             audienceFilter?: Record<string, any>;
  @IsOptional() @IsEnum(['low','normal','high','urgent']) priority?: string;
  @IsOptional() @IsBoolean() publish?: boolean;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsBoolean() sendPush?: boolean;
  @IsOptional() @IsBoolean() sendSms?: boolean;
}

export class CreateCampaignDto {
  @IsNotEmpty() @IsString() name: string;
  @IsNotEmpty() @IsString() campaignType: string;
  @IsNotEmpty() @IsEnum(['sms','email','push']) channel: string;
  @IsNotEmpty() @IsEnum(['all','admins','teachers','learners','parents','debtors','stream','grade']) audience: string;
  @IsOptional()             audienceFilter?: Record<string, any>;
  @IsNotEmpty() @IsString() messageBody: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsUUID()   templateId?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
}

export class BulkFeeReminderDto {
  @IsNotEmpty() @IsString() academicYear: string;
  @IsNotEmpty() @IsString() term: string;
  @IsOptional() @IsString() streamId?: string;
  @IsOptional()             minBalance?: number;
  @IsNotEmpty() @IsEnum(['sms','whatsapp','email']) channel: string;
  @IsOptional() @IsString() customMessage?: string;
}

export class SendThreadMessageDto {
  @IsOptional() @IsUUID()   threadId?: string;
  @IsNotEmpty() @IsUUID()   learnerId: string;
  @IsNotEmpty() @IsString() body: string;
  @IsOptional() @IsString() subject?: string;
}

export class PushSubscribeDto {
  @IsNotEmpty() @IsString() endpoint: string;
  @IsNotEmpty() @IsString() p256dh: string;
  @IsNotEmpty() @IsString() auth: string;
  @IsOptional() @IsString() userAgent?: string;
}


// ─────────────────────────────────────────────────────────────
// src/modules/communication/services/sms.service.ts
// Africa's Talking SMS integration
// ─────────────────────────────────────────────────────────────
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly AT_BASE = 'https://api.africastalking.com/version1';

  constructor(
    @InjectRepository(MessageOutbox)          private outboxRepo:  Repository<MessageOutbox>,
    @InjectRepository(CommunicationSettings)  private settingsRepo: Repository<CommunicationSettings>,
  ) {}

  // ── SEND SINGLE SMS ────────────────────────────────────────
  async send(tenantId: string, to: string, message: string, opts: {
    recipientId?:  string;
    recipientType?: string;
    campaignId?:   string;
    templateId?:   string;
    sentBy?:       string;
    scheduledAt?:  Date;
  } = {}): Promise<{ queued: boolean; outboxId: string }> {
    const outbox = await this.outboxRepo.save(
      this.outboxRepo.create({
        tenantId,
        channel:       'sms',
        toAddress:     this.normalizePhone(to),
        body:          message,
        recipientId:   opts.recipientId,
        recipientType: opts.recipientType as any,
        campaignId:    opts.campaignId,
        templateId:    opts.templateId,
        sentBy:        opts.sentBy,
        scheduledAt:   opts.scheduledAt || new Date(),
        status:        'pending',
      })
    );

    // Fire and forget — background job picks up pending outbox
    this.dispatchSms(tenantId, outbox).catch(err =>
      this.logger.error(`SMS dispatch failed: ${err.message}`)
    );

    return { queued: true, outboxId: outbox.id };
  }

  // ── DISPATCH VIA AFRICA'S TALKING ─────────────────────────
  private async dispatchSms(tenantId: string, outbox: MessageOutbox) {
    const settings = await this.settingsRepo.findOne({ where: { tenantId } });
    if (!settings?.smsEnabled || !settings.atApiKey) {
      await this.outboxRepo.update(outbox.id, {
        status: 'failed', failedReason: 'SMS not configured for this school',
      });
      return;
    }

    await this.outboxRepo.update(outbox.id, { status: 'sending', attempts: 1 });

    try {
      const params = new URLSearchParams({
        username: settings.atUsername,
        to:       outbox.toAddress,
        message:  outbox.body,
        from:     settings.atSenderId || 'ZARODA',
      });

      const { data } = await axios.post(
        `${this.AT_BASE}/messaging`,
        params.toString(),
        {
          headers: {
            'apiKey':       settings.atApiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept':       'application/json',
          },
        }
      );

      const recipient = data?.SMSMessageData?.Recipients?.[0];
      const status    = recipient?.status === 'Success' ? 'sent' : 'failed';

      await this.outboxRepo.update(outbox.id, {
        status,
        providerRef:    recipient?.messageId,
        providerStatus: recipient?.status,
        sentAt:         new Date(),
        failedReason:   status === 'failed' ? recipient?.status : null,
      });

    } catch (err: any) {
      const attempts = (outbox.attempts || 0) + 1;
      await this.outboxRepo.update(outbox.id, {
        status:       attempts >= outbox.maxAttempts ? 'failed' : 'pending',
        attempts,
        failedReason: err.message,
      });
    }
  }

  // ── SEND BULK (campaign) ───────────────────────────────────
  async sendBulk(tenantId: string, recipients: {
    phone: string; userId?: string; vars?: Record<string, string>;
  }[], template: string, campaignId?: string, sentBy?: string) {
    const results = { sent: 0, failed: 0, total: recipients.length };

    // Africa's Talking supports bulk — batch in groups of 100
    const chunks = this.chunk(recipients, 100);
    for (const chunk of chunks) {
      await Promise.allSettled(
        chunk.map(r =>
          this.send(tenantId, r.phone, this.interpolate(template, r.vars || {}), {
            recipientId: r.userId, campaignId, sentBy,
          }).then(() => results.sent++)
          .catch(() => results.failed++)
        )
      );
    }
    return results;
  }

  // ── AFRICA'S TALKING DELIVERY WEBHOOK ─────────────────────
  async handleDeliveryReport(body: {
    id: string; status: string; phoneNumber: string; failureReason?: string;
  }) {
    await this.outboxRepo.update(
      { providerRef: body.id },
      {
        providerStatus: body.status,
        deliveredAt:    body.status === 'Success' ? new Date() : null,
        status:         body.status === 'Success' ? 'delivered' : 'failed',
        failedReason:   body.failureReason,
      }
    );
  }

  // ── HELPERS ────────────────────────────────────────────────
  normalizePhone(phone: string): string {
    const clean = phone.replace(/\s+/g, '').replace('+', '');
    if (clean.startsWith('0') && clean.length === 10) return '254' + clean.slice(1);
    if (clean.startsWith('7') && clean.length === 9)  return '254' + clean;
    return clean;
  }

  interpolate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
      arr.slice(i * size, i * size + size)
    );
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/communication/services/email.service.ts
// SMTP email service
// ─────────────────────────────────────────────────────────────
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @InjectRepository(MessageOutbox)         private outboxRepo:   Repository<MessageOutbox>,
    @InjectRepository(CommunicationSettings) private settingsRepo: Repository<CommunicationSettings>,
  ) {}

  async send(tenantId: string, to: string, subject: string, body: string, opts: {
    isHtml?:      boolean;
    recipientId?: string;
    campaignId?:  string;
    sentBy?:      string;
  } = {}) {
    const outbox = await this.outboxRepo.save(
      this.outboxRepo.create({
        tenantId,
        channel:     'email',
        toAddress:   to,
        subject,
        body,
        recipientId: opts.recipientId,
        campaignId:  opts.campaignId,
        sentBy:      opts.sentBy,
        status:      'pending',
      })
    );

    this.dispatchEmail(tenantId, outbox, opts.isHtml).catch(err =>
      this.logger.error(`Email dispatch failed: ${err.message}`)
    );

    return { queued: true, outboxId: outbox.id };
  }

  private async dispatchEmail(tenantId: string, outbox: MessageOutbox, isHtml = false) {
    const settings = await this.settingsRepo.findOne({ where: { tenantId } });
    if (!settings?.emailEnabled || !settings.smtpHost) {
      await this.outboxRepo.update(outbox.id, {
        status: 'failed', failedReason: 'Email not configured',
      });
      return;
    }

    await this.outboxRepo.update(outbox.id, { status: 'sending', attempts: 1 });

    try {
      const transporter = nodemailer.createTransport({
        host:   settings.smtpHost,
        port:   settings.smtpPort || 587,
        secure: settings.smtpPort === 465,
        auth: { user: settings.smtpUser, pass: settings.smtpPass },
      });

      const info = await transporter.sendMail({
        from:    `"${settings.smtpFromName || 'ZARODA SMS'}" <${settings.smtpFromEmail}>`,
        to:      outbox.toAddress,
        subject: outbox.subject,
        [isHtml ? 'html' : 'text']: outbox.body,
      });

      await this.outboxRepo.update(outbox.id, {
        status:      'sent',
        providerRef: info.messageId,
        sentAt:      new Date(),
      });

    } catch (err: any) {
      const attempts = (outbox.attempts || 0) + 1;
      await this.outboxRepo.update(outbox.id, {
        status:       attempts >= outbox.maxAttempts ? 'failed' : 'pending',
        attempts,
        failedReason: err.message,
      });
    }
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/communication/services/push.service.ts
// Web Push (PWA) notifications
// ─────────────────────────────────────────────────────────────
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webpush from 'web-push';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectRepository(PushSubscription)      private subRepo:      Repository<PushSubscription>,
    @InjectRepository(MessageOutbox)         private outboxRepo:   Repository<MessageOutbox>,
    @InjectRepository(CommunicationSettings) private settingsRepo: Repository<CommunicationSettings>,
  ) {}

  async subscribe(tenantId: string, userId: string, dto: PushSubscribeDto) {
    const existing = await this.subRepo.findOne({
      where: { userId, endpoint: dto.endpoint },
    });
    if (existing) {
      await this.subRepo.update(existing.id, { isActive: true });
      return existing;
    }
    return this.subRepo.save(this.subRepo.create({
      tenantId, userId,
      endpoint:  dto.endpoint,
      p256dh:    dto.p256dh,
      auth:      dto.auth,
      userAgent: dto.userAgent,
      isActive:  true,
    }));
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.subRepo.update({ userId, endpoint }, { isActive: false });
  }

  async sendToUser(tenantId: string, userId: string, title: string, body: string, data?: any) {
    const settings = await this.settingsRepo.findOne({ where: { tenantId } });
    if (!settings?.pushEnabled || !settings.vapidPublicKey) return;

    webpush.setVapidDetails(
      'mailto:noreply@zarodasolutions.app',
      settings.vapidPublicKey,
      settings.vapidPrivateKey,
    );

    const subs = await this.subRepo.find({ where: { userId, isActive: true } });
    const payload = JSON.stringify({ title, body, data, icon: '/logo-192.png', badge: '/badge.png' });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err: any) {
        if (err.statusCode === 410) {
          // Subscription expired — deactivate
          await this.subRepo.update(sub.id, { isActive: false });
        }
      }
    }
  }

  async sendToAudience(tenantId: string, userIds: string[], title: string, body: string) {
    const results = { sent: 0, failed: 0 };
    await Promise.allSettled(
      userIds.map(uid =>
        this.sendToUser(tenantId, uid, title, body)
          .then(() => results.sent++)
          .catch(() => results.failed++)
      )
    );
    return results;
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/communication/services/announcement.service.ts
// ─────────────────────────────────────────────────────────────
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class AnnouncementService {
  constructor(
    @InjectRepository(Announcement)      private annoRepo:  Repository<Announcement>,
    @InjectRepository(AnnouncementRead)  private readRepo:  Repository<AnnouncementRead>,
    @InjectRepository(User)              private userRepo:  Repository<User>,
    private pushService:  PushService,
    private smsService:   SmsService,
  ) {}

  // ── CREATE ANNOUNCEMENT ────────────────────────────────────
  async create(tenantId: string, schoolId: string, dto: CreateAnnouncementDto, createdBy: string) {
    const announcement = await this.annoRepo.save(
      this.annoRepo.create({
        tenantId,
        schoolId,
        title:          dto.title,
        body:           dto.body,
        category:       dto.category || 'general',
        audience:       dto.audience,
        audienceFilter: dto.audienceFilter || {},
        priority:       dto.priority || 'normal',
        isPublished:    dto.publish || false,
        publishedAt:    dto.publish ? new Date() : null,
        expiresAt:      dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdBy,
      })
    );

    if (dto.publish) {
      await this.notifyAudience(tenantId, announcement, dto.sendPush, dto.sendSms);
    }

    return announcement;
  }

  // ── PUBLISH ────────────────────────────────────────────────
  async publish(tenantId: string, id: string, userId: string, sendPush = true, sendSms = false) {
    const announcement = await this.annoRepo.findOne({ where: { id, tenantId } });
    if (!announcement) throw new NotFoundException('Announcement not found');

    await this.annoRepo.update(id, {
      isPublished: true, publishedAt: new Date(),
    });

    await this.notifyAudience(tenantId, announcement, sendPush, sendSms);
    return { message: 'Announcement published and notifications sent.' };
  }

  // ── GET FEED (for a user based on their role) ─────────────
  async getFeed(tenantId: string, userId: string, userRole: string, page = 1, limit = 20) {
    const roleAudience = this.roleToAudience(userRole);

    const announcements = await this.annoRepo
      .createQueryBuilder('a')
      .where('a.tenant_id = :tenantId', { tenantId })
      .andWhere('a.is_published = true')
      .andWhere('a.deleted_at IS NULL')
      .andWhere('(a.expires_at IS NULL OR a.expires_at > NOW())')
      .andWhere('(a.audience = \'all\' OR a.audience IN (:...audiences))', {
        audiences: [roleAudience, 'all'],
      })
      .orderBy('a.priority = \'urgent\'', 'DESC')
      .addOrderBy('a.published_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    // Mark which ones user has read
    const readIds = await this.readRepo
      .createQueryBuilder('ar')
      .where('ar.user_id = :userId AND ar.announcement_id IN (:...ids)', {
        userId, ids: announcements.map(a => a.id),
      })
      .select('ar.announcement_id')
      .getMany()
      .then(rs => new Set(rs.map(r => r.announcementId)));

    return announcements.map(a => ({ ...a, isRead: readIds.has(a.id) }));
  }

  // ── MARK READ ──────────────────────────────────────────────
  async markRead(tenantId: string, announcementId: string, userId: string) {
    await this.readRepo
      .createQueryBuilder()
      .insert()
      .into(AnnouncementRead)
      .values({ tenantId, announcementId, userId })
      .onConflict('(announcement_id, user_id) DO NOTHING')
      .execute();

    // Increment view count
    await this.annoRepo.increment({ id: announcementId }, 'viewCount', 1);
  }

  // ── NOTIFY AUDIENCE ────────────────────────────────────────
  private async notifyAudience(
    tenantId: string, announcement: Announcement,
    sendPush = true, sendSms = false
  ) {
    const users = await this.getAudienceUsers(tenantId, announcement.audience, announcement.audienceFilter);

    if (sendPush && users.length > 0) {
      const userIds = users.map(u => u.id);
      await this.pushService.sendToAudience(
        tenantId, userIds, announcement.title,
        announcement.body.substring(0, 200)
      );
      await this.annoRepo.update(announcement.id, { pushSent: true, pushSentAt: new Date() });
    }

    if (sendSms) {
      const phones = users
        .filter(u => u.phone)
        .map(u => ({ phone: u.phone, userId: u.id }));

      const shortBody = `${announcement.title}: ${announcement.body.substring(0, 100)}... ZARODA SMS`;
      await this.smsService.sendBulk(tenantId, phones, shortBody);
    }
  }

  private async getAudienceUsers(tenantId: string, audience: string, filter: any = {}) {
    const qb = this.userRepo.createQueryBuilder('u')
      .where('u.tenant_id = :tenantId', { tenantId })
      .andWhere('u.status = \'active\'');

    switch (audience) {
      case 'teachers':
        qb.andWhere('u.role IN (:...roles)', { roles: ['class_teacher','subject_teacher','overall_class_teacher','hoi','dhois'] });
        break;
      case 'admins':
        qb.andWhere('u.role IN (:...roles)', { roles: ['tenant_owner','school_admin','hoi','dhois','bursar'] });
        break;
      case 'parents':
        qb.andWhere('u.role = \'parent\'');
        break;
      case 'learners':
        qb.andWhere('u.role = \'learner\'');
        break;
      // 'all' — no role filter
    }

    if (filter.schoolId) qb.andWhere('u.school_id = :schoolId', { schoolId: filter.schoolId });

    return qb.select(['u.id','u.phone','u.email','u.firstName','u.lastName']).getMany();
  }

  private roleToAudience(role: string): string {
    if (['class_teacher','subject_teacher','overall_class_teacher'].includes(role)) return 'teachers';
    if (['tenant_owner','school_admin','hoi','dhois','bursar'].includes(role))       return 'admins';
    if (role === 'parent')  return 'parents';
    if (role === 'learner') return 'learners';
    return 'all';
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/communication/services/campaign.service.ts
// Bulk campaigns including fee reminders
// ─────────────────────────────────────────────────────────────
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

@Injectable()
export class CampaignService {
  constructor(
    @InjectRepository(MessageCampaign)   private campaignRepo: Repository<MessageCampaign>,
    @InjectRepository(LearnerFeeAccount) private accountRepo:  Repository<LearnerFeeAccount>,
    @InjectRepository(Learner)           private learnerRepo:  Repository<Learner>,
    @InjectRepository(User)              private userRepo:     Repository<User>,
    private smsService:   SmsService,
    private emailService: EmailService,
    private pushService:  PushService,
    private dataSource:   DataSource,
  ) {}

  // ── BULK FEE REMINDERS ─────────────────────────────────────
  async sendFeeReminders(tenantId: string, schoolId: string, dto: BulkFeeReminderDto, sentBy: string) {
    // Build debtor list
    const qb = this.accountRepo
      .createQueryBuilder('fa')
      .innerJoin('fa.learner', 'l')
      .leftJoin('l.stream', 's')
      .leftJoin('l.parent', 'p')
      .where('fa.tenant_id = :tenantId', { tenantId })
      .andWhere('fa.academic_year = :year', { year: dto.academicYear })
      .andWhere('fa.term = :term', { term: dto.term })
      .andWhere('fa.balance_due > 0')
      .select([
        'l.id AS "learnerId"',
        'l.first_name AS "firstName"', 'l.last_name AS "lastName"',
        'l.admission_number AS "admissionNo"',
        'l.guardian_name AS "guardianName"',
        'l.guardian_phone AS "guardianPhone"',
        'l.guardian_email AS "guardianEmail"',
        'p.phone AS "parentPhone"', 'p.email AS "parentEmail"',
        's.name AS "streamName"',
        'fa.balance_due AS "balanceDue"',
        'fa.due_date AS "dueDate"',
      ]);

    if (dto.streamId) qb.andWhere('l.stream_id = :streamId', { streamId: dto.streamId });
    if (dto.minBalance) qb.andWhere('fa.balance_due >= :min', { min: dto.minBalance });

    const debtors = await qb.getRawMany();
    if (debtors.length === 0) return { sent: 0, message: 'No debtors found matching criteria' };

    // Get school settings for paybill
    const settings = await this.dataSource.getRepository(CommunicationSettings)
      .findOne({ where: { tenantId } });

    const campaign = await this.campaignRepo.save(
      this.campaignRepo.create({
        tenantId,
        name:          `Fee Reminder — ${dto.term.replace('_',' ')} ${dto.academicYear}`,
        campaignType:  'fee_reminder',
        channel:       dto.channel as any,
        audience:      'parents',
        audienceFilter: { academicYear: dto.academicYear, term: dto.term },
        messageBody:   dto.customMessage || this.defaultFeeReminderTemplate(),
        totalRecipients: debtors.length,
        status:        'sending',
        startedAt:     new Date(),
        createdBy:     sentBy,
      })
    );

    let sent = 0, failed = 0;

    for (const debtor of debtors) {
      const phone = debtor.guardianPhone || debtor.parentPhone;
      const email = debtor.guardianEmail || debtor.parentEmail;
      const vars  = {
        guardian_name: debtor.guardianName || 'Parent/Guardian',
        learner_name:  `${debtor.firstName} ${debtor.lastName}`,
        admission_no:  debtor.admissionNo,
        balance_due:   parseFloat(debtor.balanceDue).toLocaleString('en-KE', { minimumFractionDigits: 2 }),
        term:          dto.term.replace('_', ' '),
        academic_year: dto.academicYear,
        due_date:      debtor.dueDate ? new Date(debtor.dueDate).toLocaleDateString('en-KE') : 'ASAP',
        stream_name:   debtor.streamName || '',
      };

      const message = dto.customMessage
        ? this.smsService.interpolate(dto.customMessage, vars)
        : this.smsService.interpolate(this.defaultFeeReminderTemplate(), vars);

      try {
        if (dto.channel === 'sms' && phone) {
          await this.smsService.send(tenantId, phone, message, {
            campaignId: campaign.id, sentBy,
          });
          sent++;
        } else if (dto.channel === 'email' && email) {
          await this.emailService.send(
            tenantId, email,
            `Fee Reminder — ${debtor.firstName} ${debtor.lastName}`,
            message, { campaignId: campaign.id, sentBy }
          );
          sent++;
        } else if (dto.channel === 'whatsapp' && phone) {
          // WhatsApp is link-based — create click-to-chat links
          sent++; // tracked as queued
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    await this.campaignRepo.update(campaign.id, {
      sentCount:  sent,
      failedCount: failed,
      status:     'completed',
      completedAt: new Date(),
    });

    return {
      campaignId:  campaign.id,
      totalTargets: debtors.length,
      sent,
      failed,
      message: `Fee reminders sent: ${sent} successful, ${failed} failed.`,
    };
  }

  // ── RETOOLING BROADCAST ────────────────────────────────────
  // Admin broadcasts professional info to: All/Admins/Teachers/Learners/Parents
  async sendRetooling(tenantId: string, schoolId: string, dto: CreateCampaignDto, sentBy: string) {
    const users = await this.getTargetUsers(tenantId, dto.audience, dto.audienceFilter);

    const campaign = await this.campaignRepo.save(
      this.campaignRepo.create({
        tenantId,
        name:          dto.name,
        campaignType:  'retooling',
        channel:       dto.channel as any,
        audience:      dto.audience as any,
        messageBody:   dto.messageBody,
        subject:       dto.subject,
        totalRecipients: users.length,
        status:        'sending',
        startedAt:     new Date(),
        createdBy:     sentBy,
      })
    );

    let sent = 0, failed = 0;

    for (const user of users) {
      try {
        if (dto.channel === 'sms' && user.phone) {
          await this.smsService.send(tenantId, user.phone, dto.messageBody, {
            recipientId: user.id, campaignId: campaign.id, sentBy,
          });
        } else if (dto.channel === 'email' && user.email) {
          await this.emailService.send(tenantId, user.email, dto.subject || 'Message from School', dto.messageBody, {
            recipientId: user.id, campaignId: campaign.id, sentBy,
          });
        } else if (dto.channel === 'push') {
          await this.pushService.sendToUser(tenantId, user.id, dto.subject || 'School Notice', dto.messageBody);
        }
        sent++;
      } catch { failed++; }
    }

    await this.campaignRepo.update(campaign.id, {
      sentCount: sent, failedCount: failed,
      status: 'completed', completedAt: new Date(),
    });

    return { campaignId: campaign.id, sent, failed, total: users.length };
  }

  private async getTargetUsers(tenantId: string, audience: string, filter: any = {}) {
    const qb = this.userRepo.createQueryBuilder('u')
      .where('u.tenant_id = :tenantId AND u.status = \'active\'', { tenantId });

    const ROLE_MAP: Record<string, string[]> = {
      admins:   ['tenant_owner','school_admin','hoi','dhois','bursar'],
      teachers: ['class_teacher','subject_teacher','overall_class_teacher','hoi','dhois'],
      learners: ['learner'],
      parents:  ['parent'],
    };

    if (audience !== 'all' && ROLE_MAP[audience]) {
      qb.andWhere('u.role IN (:...roles)', { roles: ROLE_MAP[audience] });
    }

    return qb.select(['u.id','u.phone','u.email','u.firstName']).getMany();
  }

  private defaultFeeReminderTemplate(): string {
    return 'Dear {{guardian_name}}, {{learner_name}} ({{admission_no}}) has an outstanding fee balance of KES {{balance_due}} for {{term}} {{academic_year}}. Due: {{due_date}}. Pay via M-Pesa. ZARODA SMS +254781230805';
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/communication/services/thread.service.ts
// Parent-Teacher direct messaging
// ─────────────────────────────────────────────────────────────
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class ThreadService {
  constructor(
    @InjectRepository(MessageThread)  private threadRepo:  Repository<MessageThread>,
    @InjectRepository(ThreadMessage)  private msgRepo:     Repository<ThreadMessage>,
    @InjectRepository(Learner)        private learnerRepo: Repository<Learner>,
    private pushService: PushService,
  ) {}

  async sendMessage(tenantId: string, senderId: string, senderRole: string, dto: SendThreadMessageDto) {
    let thread: MessageThread;

    if (dto.threadId) {
      thread = await this.threadRepo.findOne({ where: { id: dto.threadId, tenantId } });
      if (!thread) throw new NotFoundException('Thread not found');
    } else {
      // Create new thread
      const learner = await this.learnerRepo.findOne({ where: { id: dto.learnerId, tenantId } });
      if (!learner) throw new NotFoundException('Learner not found');

      // Find class teacher for this learner
      const classTeacher = await this.learnerRepo.manager.findOne(TeacherAllocation, {
        where: { streamId: learner.streamId, role: 'class_teacher', isActive: true },
      });

      const teacherId = senderRole === 'parent'
        ? classTeacher?.teacherId
        : senderId;
      const parentId = senderRole === 'parent'
        ? senderId
        : learner.parentId;

      if (!teacherId || !parentId) {
        throw new ForbiddenException('Cannot create thread — missing parent or teacher assignment');
      }

      thread = await this.threadRepo.save(
        this.threadRepo.create({
          tenantId,
          learnerId:  dto.learnerId,
          parentId,
          teacherId,
          subject:    dto.subject || `Re: ${learner.firstName} ${learner.lastName}`,
          status:     'open',
          lastMessageAt: new Date(),
        })
      );
    }

    const message = await this.msgRepo.save(
      this.msgRepo.create({
        tenantId,
        threadId:   thread.id,
        senderId,
        senderRole,
        body:       dto.body,
        isRead:     false,
      })
    );

    // Update thread last activity
    await this.threadRepo.update(thread.id, { lastMessageAt: new Date() });

    // Push notification to the other party
    const recipientId = senderRole === 'parent' ? thread.teacherId : thread.parentId;
    await this.pushService.sendToUser(
      tenantId, recipientId,
      'New Message',
      dto.body.substring(0, 100),
      { threadId: thread.id }
    );

    return { threadId: thread.id, messageId: message.id };
  }

  async getThreads(tenantId: string, userId: string, role: string) {
    const field = role === 'parent' ? 'parent_id' : 'teacher_id';
    return this.threadRepo
      .createQueryBuilder('t')
      .where(`t.tenant_id = :tenantId AND t.${field} = :userId`, { tenantId, userId })
      .leftJoin('t.learner', 'l')
      .addSelect(['l.firstName','l.lastName','l.admissionNumber'])
      .orderBy('t.last_message_at', 'DESC')
      .getMany();
  }

  async getMessages(tenantId: string, threadId: string, userId: string) {
    const thread = await this.threadRepo.findOne({ where: { id: threadId, tenantId } });
    if (!thread || (thread.parentId !== userId && thread.teacherId !== userId)) {
      throw new ForbiddenException('Access denied');
    }

    // Mark unread messages as read
    await this.msgRepo.update(
      { threadId, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    return this.msgRepo.find({
      where: { threadId },
      order: { createdAt: 'ASC' },
    });
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/communication/communication.controller.ts
// ─────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Patch, Body, Param,
  Query, UseGuards, HttpCode, HttpStatus, Req
} from '@nestjs/common';

@Controller('api/v1/communication')
export class CommunicationController {
  constructor(
    private smsService:          SmsService,
    private emailService:        EmailService,
    private pushService:         PushService,
    private announcementService: AnnouncementService,
    private campaignService:     CampaignService,
    private threadService:       ThreadService,
  ) {}

  // ── ANNOUNCEMENTS ─────────────────────────────────────────
  @Post('announcements')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin','tenant_owner','school_admin','hoi','dhois')
  createAnnouncement(@CurrentUser() u: User, @Body() dto: CreateAnnouncementDto) {
    return this.announcementService.create(u.tenantId, u.schoolId, dto, u.id);
  }

  @Patch('announcements/:id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin','tenant_owner','school_admin','hoi')
  publishAnnouncement(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Body('sendPush') sendPush: boolean,
    @Body('sendSms')  sendSms:  boolean,
  ) {
    return this.announcementService.publish(u.tenantId, id, u.id, sendPush, sendSms);
  }

  @Get('announcements/feed')
  @UseGuards(JwtAuthGuard)
  getAnnouncementFeed(
    @CurrentUser() u: User,
    @Query('page') page: number,
  ) {
    return this.announcementService.getFeed(u.tenantId, u.id, u.role, page);
  }

  @Post('announcements/:id/read')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(@CurrentUser() u: User, @Param('id') id: string) {
    return this.announcementService.markRead(u.tenantId, id, u.id);
  }

  // ── CAMPAIGNS / RETOOLING ─────────────────────────────────
  @Post('campaigns/fee-reminders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tenant_owner','school_admin','hoi','bursar')
  sendFeeReminders(@CurrentUser() u: User, @Body() dto: BulkFeeReminderDto) {
    return this.campaignService.sendFeeReminders(u.tenantId, u.schoolId, dto, u.id);
  }

  @Post('campaigns/retooling')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin','tenant_owner','school_admin','hoi')
  sendRetooling(@CurrentUser() u: User, @Body() dto: CreateCampaignDto) {
    return this.campaignService.sendRetooling(u.tenantId, u.schoolId, dto, u.id);
  }

  @Post('campaigns')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tenant_owner','school_admin','hoi')
  createCampaign(@CurrentUser() u: User, @Body() dto: CreateCampaignDto) {
    return this.campaignService.sendRetooling(u.tenantId, u.schoolId, dto, u.id);
  }

  @Get('campaigns')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tenant_owner','school_admin','hoi','bursar')
  getCampaigns(@CurrentUser() u: User) {
    return this.campaignService.getCampaigns(u.tenantId);
  }

  // ── DIRECT MESSAGING (Parent ↔ Teacher) ──────────────────
  @Post('threads/messages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('parent','class_teacher','subject_teacher','overall_class_teacher','hoi')
  sendMessage(@CurrentUser() u: User, @Body() dto: SendThreadMessageDto) {
    return this.threadService.sendMessage(u.tenantId, u.id, u.role, dto);
  }

  @Get('threads')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('parent','class_teacher','subject_teacher','overall_class_teacher')
  getThreads(@CurrentUser() u: User) {
    return this.threadService.getThreads(u.tenantId, u.id, u.role);
  }

  @Get('threads/:id/messages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('parent','class_teacher','subject_teacher','overall_class_teacher','hoi')
  getMessages(@CurrentUser() u: User, @Param('id') id: string) {
    return this.threadService.getMessages(u.tenantId, id, u.id);
  }

  // ── PUSH NOTIFICATIONS ────────────────────────────────────
  @Post('push/subscribe')
  @UseGuards(JwtAuthGuard)
  subscribePush(@CurrentUser() u: User, @Body() dto: PushSubscribeDto) {
    return this.pushService.subscribe(u.tenantId, u.id, dto);
  }

  @Post('push/unsubscribe')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  unsubscribePush(@CurrentUser() u: User, @Body('endpoint') endpoint: string) {
    return this.pushService.unsubscribe(u.id, endpoint);
  }

  // ── SEND SINGLE SMS (admin use) ───────────────────────────
  @Post('sms/send')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin','tenant_owner','school_admin','hoi')
  sendSms(@CurrentUser() u: User, @Body() dto: SendSmsDto) {
    return this.smsService.send(u.tenantId, dto.to, dto.message, {
      recipientId: dto.recipientId, sentBy: u.id,
    });
  }

  // ── AFRICA'S TALKING DELIVERY WEBHOOK (PUBLIC) ────────────
  @Post('sms/delivery-report')
  @HttpCode(HttpStatus.OK)
  atDeliveryReport(@Body() body: any) {
    return this.smsService.handleDeliveryReport({
      id:            body.id,
      status:        body.status,
      phoneNumber:   body.phoneNumber,
      failureReason: body.failureReason,
    });
  }
}
