// ============================================================
// ZARODA SMS — Stub Modules
// These return proper empty API responses so the frontend
// renders gracefully while the full business logic is wired.
// Replace each stub with the full service as you build out.
// ============================================================

import { Module, Controller, Get, Post, Patch, Delete, Param, Query, Body, Request, Res, UseGuards } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, DataSource } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

// ═══════════════════════════════════════════════════════════
// FINANCE MODULE
// ═══════════════════════════════════════════════════════════
@Entity('invoices')
class Invoice {
  @PrimaryGeneratedColumn('uuid') id:            string;
  @Column({ name: 'tenant_id' })  tenantId:      string;
  @Column({ name: 'learner_id', nullable: true }) learnerId: string;
  @Column({ name: 'invoice_number', nullable: true }) invoiceNumber: string;
  @Column({ name: 'total_amount', type: 'decimal', default: 0 }) totalAmount: number;
  @Column({ name: 'amount_paid', type: 'decimal', default: 0 }) amountPaid: number;
  @Column({ default: 'unpaid' })  status:        string;
  @Column({ nullable: true })     term:          string;
  @Column({ name: 'academic_year', nullable: true }) academicYear: string;
  @Column({ name: 'due_date', nullable: true })   dueDate: Date;
  @Column({ name: 'issued_date', nullable: true }) issuedDate: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Controller('finance')
@UseGuards(JwtAuthGuard)
class FinanceController {
  constructor(private readonly ds: DataSource) {}

  // ── FEE STRUCTURES (set by HOI / bursar / admin) ──────────
  @Get('fee-structures')
  async getFeeStructures(@Request() req: any) {
    return this.ds.query(
      `SELECT id, name, grade_level AS "gradeLevel", term, academic_year AS "academicYear",
              category, amount, is_mandatory AS "isMandatory", created_at AS "createdAt"
         FROM fee_items WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [req.user.tenantId],
    ).catch(() => []);
  }

  @Post('fee-structures')
  async createFeeStructure(@Request() req: any, @Body() dto: any) {
    const role = req.user.role;
    if (!['hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar'].includes(role)) {
      return { error: 'Only the HOI, bursar or administrator can set fee structures.' };
    }
    if (!dto?.name || !String(dto.name).trim()) {
      return { error: 'Fee name is required.' };
    }
    const rows = await this.ds.query(
      `INSERT INTO fee_items
         (tenant_id, school_id, name, grade_level, term, academic_year, category, amount, is_mandatory, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       RETURNING id, name, grade_level AS "gradeLevel", term, academic_year AS "academicYear",
                 category, amount, is_mandatory AS "isMandatory"`,
      [
        req.user.tenantId, req.user.schoolId || null,
        String(dto.name).trim(), dto.gradeLevel || null, dto.term || null,
        dto.academicYear || null, dto.category || 'tuition',
        Number(dto.amount) || 0, dto.isMandatory !== false,
      ],
    );
    return rows[0];
  }

  @Delete('fee-structures/:id')
  async deleteFeeStructure(@Request() req: any, @Param('id') id: string) {
    await this.ds.query(`DELETE FROM fee_items WHERE id = $1 AND tenant_id = $2`, [id, req.user.tenantId]).catch(() => null);
    return { deleted: true };
  }

  @Get('invoices')
  getInvoices(@Request() req: any, @Query() q: any) {
    // TODO: implement invoice query with learner join
    return [];
  }

  @Get('invoices/:id')
  getInvoice(@Param('id') id: string) { return null; }

  @Post('invoices')
  createInvoice(@Request() req: any, @Body() dto: any) { return { id: 'stub', ...dto }; }

  @Get('receipts')
  getReceipts(@Request() req: any) { return []; }

  @Post('mpesa/stk-push')
  stkPush(@Request() req: any, @Body() dto: { invoiceId: string; phone: string }) {
    // TODO: integrate Safaricom Daraja STK Push
    return { message: 'M-Pesa STK Push sent (configure MPESA_* env vars)', phone: dto.phone };
  }

  @Post('mpesa/callback')
  mpesaCallback(@Body() body: any) {
    // Safaricom sends payment confirmation here
    console.log('M-Pesa callback received:', body);
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  @Get('payroll')
  getPayroll(@Request() req: any) { return []; }

  @Get('dashboard')
  getDashboard(@Request() req: any) {
    return { totalCollected: 0, outstanding: 0, totalLearners: 0, fullyPaid: 0 };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Invoice])],
  controllers: [FinanceController],
})
export class FinanceModule {}


// ═══════════════════════════════════════════════════════════
// COMMUNICATION MODULE
// ═══════════════════════════════════════════════════════════
@Entity('announcements')
class Announcement {
  @PrimaryGeneratedColumn('uuid') id:        string;
  @Column({ name: 'tenant_id' })  tenantId:  string;
  @Column()                       title:     string;
  @Column({ type: 'text' })       content:   string;
  @Column({ default: 'all' })     audience:  string;
  @Column({ default: 'normal' })  priority:  string;
  @Column({ default: 'push' })    channel:   string;
  @Column({ name: 'created_by', nullable: true }) createdBy: string;
  @Column({ name: 'sent_at', nullable: true }) sentAt: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Controller('communication')
@UseGuards(JwtAuthGuard)
class CommunicationController {
  @Get('announcements')
  getAnnouncements(@Request() req: any) { return []; }

  @Post('announcements')
  createAnnouncement(@Request() req: any, @Body() dto: any) {
    // TODO: integrate AT SMS, FCM push, email
    return { id: 'stub', ...dto, sentAt: new Date(), message: 'Announcement queued for delivery' };
  }

  @Get('messages')
  getMessages(@Request() req: any) { return []; }

  @Post('messages')
  sendMessage(@Request() req: any, @Body() dto: any) { return { id: 'stub', ...dto }; }

  @Post('fee-reminders')
  sendFeeReminders(@Request() req: any, @Body() dto: any) {
    // TODO: query outstanding invoices and send personalised SMS/WhatsApp
    return { message: 'Fee reminders sent (configure AT_API_KEY env var)', count: 0 };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Announcement])],
  controllers: [CommunicationController],
})
export class CommunicationModule {}


// ═══════════════════════════════════════════════════════════
// PROFESSIONAL RECORDS MODULE
// ═══════════════════════════════════════════════════════════
@Entity('schemes_of_work')
class SchemeOfWork {
  @PrimaryGeneratedColumn('uuid') id:            string;
  @Column({ name: 'tenant_id' })  tenantId:      string;
  @Column({ name: 'teacher_id' }) teacherId:     string;
  @Column()                       subject:       string;
  @Column()                       grade:         string;
  @Column()                       term:          string;
  @Column({ name: 'academic_year' }) academicYear: string;
  @Column({ default: 'draft' })   status:        string;
  @Column({ name: 'is_ai_generated', default: false }) isAiGenerated: boolean;
  @Column({ name: 'hoi_comment', nullable: true }) hoiComment: string;
  @Column({ nullable: true })     title:         string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Controller('professional-records')
@UseGuards(JwtAuthGuard)
class ProRecordsController {
  @Get('schemes')
  getSchemes(@Request() req: any) { return []; }

  @Post('schemes/generate')
  async generateScheme(@Request() req: any, @Body() dto: any) {
    // TODO: call Anthropic API with KICD prompt
    // Requires: ANTHROPIC_API_KEY in .env
    return {
      id:           'generated-stub',
      subject:      dto.subject,
      grade:        dto.grade,
      term:         dto.term,
      academicYear: dto.academicYear,
      status:       'draft',
      isAiGenerated:true,
      message:      'AI generation ready — set ANTHROPIC_API_KEY in backend .env to enable',
    };
  }

  @Patch('schemes/:id/submit')
  submitScheme(@Param('id') id: string) {
    return { id, status: 'submitted', message: 'Submitted for HOI approval' };
  }

  @Patch('schemes/:id/approve')
  approveScheme(@Param('id') id: string) {
    return { id, status: 'approved' };
  }

  @Patch('schemes/:id/reject')
  rejectScheme(@Param('id') id: string, @Body() dto: any) {
    return { id, status: 'rejected', hoiComment: dto.comment };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([SchemeOfWork])],
  controllers: [ProRecordsController],
})
export class ProfessionalRecordsModule {}


// ═══════════════════════════════════════════════════════════
// LIBRARY MODULE  (No fines — ever)
// ═══════════════════════════════════════════════════════════
@Entity('library_books')
class LibraryBook {
  @PrimaryGeneratedColumn('uuid') id:               string;
  @Column({ name: 'tenant_id' })  tenantId:         string;
  @Column()                       title:            string;
  @Column({ nullable: true })     author:           string;
  @Column({ name: 'accession_number', nullable: true }) accessionNumber: string;
  @Column({ name: 'barcode', nullable: true })      barcode: string;
  @Column({ name: 'is_available', default: true })  isAvailable: boolean;
  @CreateDateColumn({ name: 'created_at' })         createdAt: Date;
}

@Entity('library_loans')
class LibraryLoan {
  @PrimaryGeneratedColumn('uuid') id:           string;
  @Column({ name: 'tenant_id' })  tenantId:     string;
  @Column({ name: 'book_id' })    bookId:       string;
  @Column({ name: 'borrower_name', nullable: true }) borrowerName: string;
  @Column({ name: 'borrower_id', nullable: true })   borrowerId:   string;
  @Column({ name: 'borrower_type', default: 'learner' }) borrowerType: string;
  @Column({ name: 'issued_date', nullable: true })  issuedDate: Date;
  @Column({ name: 'due_date', nullable: true })     dueDate:    Date;
  @Column({ name: 'returned_date', nullable: true })returnedDate: Date;
  @Column({ default: 'active' })  status:       string;
  // NO fine_amount column — library is completely free
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Controller('library')
@UseGuards(JwtAuthGuard)
class LibraryController {
  @Get('books')
  getBooks(@Request() req: any, @Query() q: any) { return []; }

  @Get('books/lookup')
  lookupBook(@Query('q') q: string) {
    return { id: 'stub', title: 'Sample Book', author: 'Author', accessionNumber: q };
  }

  @Post('books')
  addBook(@Request() req: any, @Body() dto: any) { return { id: 'stub', ...dto }; }

  @Get('loans')
  getLoans(@Request() req: any, @Query() q: any) { return []; }

  @Post('loans')
  issueBook(@Request() req: any, @Body() dto: any) {
    return { id: 'stub', ...dto, issuedDate: new Date(),
      dueDate: new Date(Date.now() + 14*24*60*60*1000),
      // No fines recorded — ever
    };
  }

  @Patch('loans/:id/return')
  returnBook(@Param('id') id: string) {
    return { id, status: 'returned', returnedDate: new Date() };
    // No fine calculated — library is free
  }

  @Post('loans/:id/remind')
  sendReminder(@Param('id') id: string) {
    return { message: 'Reminder sent. KES 0 charged.' };
    // No fine charged — ever
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([LibraryBook, LibraryLoan])],
  controllers: [LibraryController],
})
export class LibraryModule {}


// ═══════════════════════════════════════════════════════════
// SPORTS MODULE
// ═══════════════════════════════════════════════════════════
@Controller('sports')
@UseGuards(JwtAuthGuard)
class SportsController {
  @Get('teams')
  getTeams(@Request() req: any) { return []; }

  @Post('teams')
  createTeam(@Request() req: any, @Body() dto: any) { return { id: 'stub', ...dto }; }

  @Get('qualifications')
  getQualifications(@Request() req: any) { return []; }

  @Post('qualifications')
  createQualification(@Request() req: any, @Body() dto: any) { return { id: 'stub', ...dto }; }

  @Post('push-to-base')
  pushToBase(@Request() req: any, @Body() dto: any) {
    return { message: 'Athletes registered at ZARODA Sports Base. Bib numbers assigned.', dto };
  }

  @Get('base/championships')
  getBaseChampionships(@Query() q: any) { return []; }

  @Get('dashboard')
  getDashboard(@Request() req: any) {
    return { totalTeams: 0, totalAthletes: 0, activeChampionships: 0 };
  }
}

@Module({ controllers: [SportsController] })
export class SportsModule {}


// ═══════════════════════════════════════════════════════════
// DISCIPLINE MODULE
// ═══════════════════════════════════════════════════════════
@Entity('incidents')
class Incident {
  @PrimaryGeneratedColumn('uuid') id:          string;
  @Column({ name: 'tenant_id' })  tenantId:    string;
  @Column({ name: 'learner_id', nullable: true }) learnerId: string;
  @Column({ nullable: true })     category:    string;
  @Column({ default: 'minor' })   severity:    string;
  @Column({ type: 'text', nullable: true }) description: string;
  @Column({ name: 'action_taken', nullable: true }) actionTaken: string;
  @Column({ default: 'open' })    status:      string;
  @Column({ name: 'parent_notified', default: false }) parentNotified: boolean;
  @Column({ name: 'reported_by', nullable: true }) reportedBy: string;
  @Column({ name: 'reported_at', nullable: true }) reportedAt: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Controller('discipline')
@UseGuards(JwtAuthGuard)
class DisciplineController {
  @Get('incidents')
  getIncidents(@Request() req: any) { return []; }

  @Post('incidents')
  createIncident(@Request() req: any, @Body() dto: any) {
    return { id: 'stub', ...dto, status: 'open', reportedAt: new Date() };
  }

  @Patch('incidents/:id')
  updateIncident(@Param('id') id: string, @Body() dto: any) { return { id, ...dto }; }

  @Get('counselling')
  getCounselling(@Request() req: any) { return []; }

  @Post('counselling')
  createCounselling(@Request() req: any, @Body() dto: any) { return { id: 'stub', ...dto }; }

  @Get('qaso-report')
  getQasoReport(@Request() req: any) {
    return { message: 'QASO report generation — implement PDF service' };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Incident])],
  controllers: [DisciplineController],
})
export class DisciplineModule {}


// ═══════════════════════════════════════════════════════════
// REFERRAL MODULE (Share invite links)
// ═══════════════════════════════════════════════════════════
import * as crypto from 'crypto';

@Entity('class_teacher_invites')
class ClassTeacherInvite {
  @PrimaryGeneratedColumn('uuid') id:          string;
  @Column({ name: 'teacher_id' }) teacherId:   string;
  @Column({ name: 'tenant_id' })  tenantId:    string;
  @Column({ name: 'token_hash' }) tokenHash:   string; // SHA-256 only — raw token never stored
  @Column({ name: 'teacher_name' }) teacherName: string;
  @Column({ name: 'class_name', nullable: true }) className: string;
  @Column({ name: 'stream_id', nullable: true }) streamId: string;
  @Column({ name: 'uses_count', default: 0 }) usesCount: number;
  @Column({ name: 'max_uses', default: 50 })  maxUses:   number;
  @Column({ name: 'expires_at' }) expiresAt:   Date;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Controller('referral')
@UseGuards(JwtAuthGuard)
class ReferralController {
  @Post('invite/generate')
  generateInvite(@Request() req: any) {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const baseUrl = process.env.APP_URL || 'http://localhost:3001';
    return {
      token:   rawToken,   // returned once, never stored
      inviteUrl: `${baseUrl}/invite/${rawToken}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      maxUses:   50,
    };
  }

  @Get('invite/:token/validate')
  validateInvite(@Param('token') token: string) {
    // TODO: hash token and look up in DB
    return {
      valid:       true,
      teacherName: 'Demo Teacher',
      className:   'Grade 4 North',
    };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([ClassTeacherInvite])],
  controllers: [ReferralController],
})
export class ReferralModule {}


// ═══════════════════════════════════════════════════════════
// PDF MODULE
// ═══════════════════════════════════════════════════════════
@Controller('pdf')
@UseGuards(JwtAuthGuard)
class PdfController {
  constructor(private readonly ds: DataSource) {}

  // Printable mark list (HTML the browser prints / saves as PDF). Self-contained:
  // builds straight from assessment_results for the chosen stream/term/exam, so it
  // doesn't depend on the heavier PDF subsystem.
  @Get('mark-list/html')
  async markListHtml(@Request() req: any, @Query() q: any, @Res() res: any) {
    const tenantId = req.user.tenantId;
    const { streamId, term, examId, examType, academicYear } = q;
    try {
      const stream = (await this.ds.query(
        `SELECT s.name, s.grade_level AS "gradeLevel",
                (SELECT name FROM schools WHERE tenant_id = s.tenant_id LIMIT 1) AS "schoolName"
           FROM streams s WHERE s.id::text = $1 AND s.tenant_id::text = $2 LIMIT 1`,
        [streamId, tenantId],
      ).catch(() => []))[0] || {};

      const examName = examId
        ? ((await this.ds.query(`SELECT name FROM exams WHERE id::text = $1 LIMIT 1`, [examId]).catch(() => []))[0]?.name || '')
        : (examType || '');

      const rows = await this.ds.query(
        `SELECT ar.learner_id AS "learnerId", l.first_name AS "firstName", l.last_name AS "lastName",
                l.admission_number AS "adm", ar.subject, ar.percent, ar.raw_score AS "raw"
           FROM assessment_results ar
           LEFT JOIN learners l ON l.id::text = ar.learner_id::text
          WHERE ar.tenant_id::text = $1 AND ar.stream_id::text = $2
            AND ($3::text IS NULL OR ar.term = $3)
            AND ($4::text IS NULL OR ar.exam_id::text = $4)
          ORDER BY l.first_name`,
        [tenantId, streamId, term || null, examId || null],
      ).catch(() => []);

      const senior = ['grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'].includes(stream.gradeLevel || '');
      const lvl = (p: number) => senior
        ? (p>=90?'EE1':p>=75?'EE2':p>=58?'ME1':p>=41?'ME2':p>=31?'AE1':p>=21?'AE2':p>=11?'BE1':'BE2')
        : (p>=76?'EE':p>=51?'ME':p>=26?'AE':'BE');
      const pts = (p: number) => senior
        ? (p>=90?8:p>=75?7:p>=58?6:p>=41?5:p>=31?4:p>=21?3:p>=11?2:1)
        : (p>=76?4:p>=51?3:p>=26?2:1);

      // Pivot: learner → subject → {percent, level}
      const subjects = Array.from(new Set(rows.map((r: any) => r.subject))).sort();
      const byLearner: Record<string, any> = {};
      for (const r of rows) {
        const L = (byLearner[r.learnerId] = byLearner[r.learnerId] || { name: `${r.firstName||''} ${r.lastName||''}`.trim(), adm: r.adm, marks: {}, points: 0 });
        if (r.percent != null) { L.marks[r.subject] = { pct: Math.round(r.percent), level: lvl(r.percent) }; L.points += pts(r.percent); }
      }
      const learners = Object.values(byLearner).sort((a: any, b: any) => b.points - a.points);
      const maxPoints = subjects.length * (senior ? 8 : 4);

      const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c] as string));
      const head = subjects.map(s => `<th>${esc(s)}</th>`).join('');
      const body = learners.map((L: any, i: number) => `
        <tr>
          <td>${i+1}</td><td style="text-align:left">${esc(L.name)}</td><td>${esc(L.adm||'')}</td>
          ${subjects.map(s => { const m = L.marks[s]; return `<td>${m ? `${m.pct}% <b>${m.level}</b>` : '-'}</td>`; }).join('')}
          <td><b>${L.points}/${maxPoints}</b></td>
        </tr>`).join('');

      const html = `<!doctype html><html><head><meta charset="utf-8"/>
        <title>Mark List — ${esc(stream.name||'')}</title>
        <style>
          body{font-family:Arial,Helvetica,sans-serif;color:#1a2e5a;padding:24px}
          h1{font-size:18px;margin:0}h2{font-size:13px;font-weight:normal;color:#555;margin:2px 0 16px}
          table{width:100%;border-collapse:collapse;font-size:11px}
          th,td{border:1px solid #cfd6e4;padding:5px 6px;text-align:center}
          th{background:#1a2e5a;color:#fff}td{text-align:center}
          tr:nth-child(even) td{background:#f5f7fb}
          .no-print{text-align:center;margin:18px 0}
          @media print{.no-print{display:none}}
        </style></head><body>
        <h1>${esc(stream.schoolName||'ZARODA School')}</h1>
        <h2>Mark List — ${esc(stream.name||'')} · ${esc(examName)} · ${esc((term||'').replace('term_','Term '))} · ${esc(academicYear||'')}</h2>
        <table><thead><tr><th>#</th><th>Learner</th><th>Adm</th>${head}<th>Total</th></tr></thead>
        <tbody>${body || `<tr><td colspan="${subjects.length+4}">No marks found for this assessment.</td></tr>`}</tbody></table>
        <div class="no-print"><button onclick="window.print()" style="background:#1a2e5a;color:#fff;border:none;padding:10px 22px;border-radius:8px;cursor:pointer">Print / Save as PDF</button></div>
        <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400);});</script>
        </body></html>`;
      res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.send(html);
    } catch (e: any) {
      res.status(500).send(`<p style="font-family:sans-serif">Could not build mark list: ${e?.message || 'error'}</p>`);
    }
  }

  @Get('report-card/:learnerId')
  getReportCard(@Param('learnerId') id: string) {
    return { message: 'PDF generation — requires Puppeteer. Run: npm install puppeteer' };
  }

  @Get('invoice/:invoiceId')
  getInvoice(@Param('invoiceId') id: string) {
    return { message: 'Invoice PDF — implement PdfService.generateInvoice()' };
  }

  @Get('receipt/:receiptNumber')
  getReceipt(@Param('receiptNumber') ref: string) {
    return { message: 'Receipt PDF — implement PdfService.generateReceipt()' };
  }

  @Get('bib-sheet/:championshipId')
  getBibSheet(@Param('championshipId') id: string) {
    return { message: 'Bib sheet PDF — implement PdfService.generateBibSheet()' };
  }

  @Get('scheme/:schemeId')
  getScheme(@Param('schemeId') id: string) {
    return { message: 'Scheme PDF — implement PdfService.generateSchemeOfWork()' };
  }

  @Get('payslip/:staffId')
  getPayslip(@Param('staffId') id: string) {
    return { message: 'Payslip PDF — implement PdfService.generatePayslip()' };
  }
}

@Module({ controllers: [PdfController] })
export class PdfModule {}


// ═══════════════════════════════════════════════════════════
// SUPER ADMIN MODULE (platform-wide management + retooling broadcast)
// ═══════════════════════════════════════════════════════════
@Controller('admin')
@UseGuards(JwtAuthGuard)
class AdminController {
  constructor(private readonly ds: DataSource) {}

  // Only the platform owner (super_admin) may cross tenant boundaries. Every method
  // guards on this; a normal school user gets an empty/forbidden response.
  private isOwner(req: any): boolean {
    return req?.user?.role === 'super_admin';
  }

  // Platform-wide list of every school (tenant). Read-only.
  @Get('tenants')
  async getTenants(@Request() req: any, @Query() q: any) {
    if (!this.isOwner(req)) return { error: 'forbidden', data: [] };
    const search = q.search ? `%${q.search}%` : null;
    const rows = await this.ds.query(
      `SELECT t.id, t.name, t.status, t.subscription_tier AS "subscriptionTier",
              t.county, t.sub_county AS "subCounty", t.phone, t.email,
              t.knec_code AS "knecCode", t.trial_ends_at AS "trialEndsAt", t.created_at AS "createdAt",
              (SELECT COUNT(*) FROM users    u WHERE u.tenant_id = t.id) AS "userCount",
              (SELECT COUNT(*) FROM learners l WHERE l.tenant_id = t.id AND l.is_active = true) AS "learnerCount",
              (SELECT COUNT(*) FROM streams  s WHERE s.tenant_id = t.id) AS "streamCount"
         FROM tenants t
        WHERE ($1::text IS NULL OR t.name ILIKE $1)
        ORDER BY t.created_at DESC`,
      [search],
    ).catch(() => []);
    return { data: rows };
  }

  // One school's detail (read-only) — owner drilling into a specific tenant.
  @Get('tenants/:id')
  async getTenant(@Request() req: any, @Param('id') id: string) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    const rows = await this.ds.query(
      `SELECT t.*,
              (SELECT COUNT(*) FROM users    u WHERE u.tenant_id = t.id) AS "userCount",
              (SELECT COUNT(*) FROM learners l WHERE l.tenant_id = t.id AND l.is_active = true) AS "learnerCount",
              (SELECT COUNT(*) FROM streams  s WHERE s.tenant_id = t.id) AS "streamCount"
         FROM tenants t WHERE t.id = $1 LIMIT 1`,
      [id],
    ).catch(() => []);
    if (!rows.length) return { error: 'not found' };
    // The school's users (no password hashes)
    const users = await this.ds.query(
      `SELECT id, first_name AS "firstName", last_name AS "lastName", email, role, is_active AS "isActive"
         FROM users WHERE tenant_id = $1 ORDER BY role, first_name`,
      [id],
    ).catch(() => []);
    return { tenant: rows[0], users };
  }

  // Platform-wide stats across ALL tenants. Read-only.
  @Get('stats')
  async getStats(@Request() req: any) {
    if (!this.isOwner(req)) return { totalTenants: 0, activeTenants: 0, trialTenants: 0, suspendedTenants: 0, totalLearners: 0, totalUsers: 0 };
    const r = await this.ds.query(
      `SELECT
         (SELECT COUNT(*) FROM tenants)                                   AS "totalTenants",
         (SELECT COUNT(*) FROM tenants WHERE status = 'active')           AS "activeTenants",
         (SELECT COUNT(*) FROM tenants WHERE status = 'trial')            AS "trialTenants",
         (SELECT COUNT(*) FROM tenants WHERE status = 'suspended')        AS "suspendedTenants",
         (SELECT COUNT(*) FROM learners WHERE is_active = true)           AS "totalLearners",
         (SELECT COUNT(*) FROM users)                                     AS "totalUsers"`,
    ).catch(() => [{}]);
    return r[0] || {};
  }

  // ── PHASE 2: CONTROL ACTIONS (super_admin only, cross-tenant on purpose) ──────

  // Suspend or reactivate a school. Suspended schools' users are blocked at login
  // (enforced in auth). status: 'suspended' | 'active'.
  @Patch('tenants/:id/status')
  async setTenantStatus(@Request() req: any, @Param('id') id: string, @Body() dto: { status: string }) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    const status = dto?.status;
    if (!['active', 'suspended', 'trial', 'cancelled'].includes(status)) {
      return { error: 'Invalid status. Use active, suspended, trial or cancelled.' };
    }
    await this.ds.query(`UPDATE tenants SET status = $1, updated_at = NOW() WHERE id = $2`, [status, id])
      .catch((e: any) => { throw e; });
    return { id, status };
  }

  // Change a school's subscription tier (free | primary | senior, or custom).
  @Patch('tenants/:id/subscription')
  async setTenantSubscription(@Request() req: any, @Param('id') id: string, @Body() dto: { tier: string; trialEndsAt?: string }) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    if (!dto?.tier) return { error: 'Tier is required.' };
    const sets = ['subscription_tier = $2', 'updated_at = NOW()'];
    const vals: any[] = [id, dto.tier];
    if (dto.trialEndsAt) { sets.push(`trial_ends_at = $${vals.length + 1}`); vals.push(dto.trialEndsAt); }
    await this.ds.query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = $1`, vals)
      .catch((e: any) => { throw e; });
    return { id, tier: dto.tier };
  }

  // Edit a school's core details.
  @Patch('tenants/:id')
  async updateTenant(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    const map: Record<string, string> = {
      name: 'name', phone: 'phone', email: 'email',
      county: 'county', subCounty: 'sub_county', knecCode: 'knec_code',
    };
    const sets: string[] = []; const vals: any[] = [id]; let i = 2;
    for (const [k, col] of Object.entries(map)) {
      if (dto[k] !== undefined) { sets.push(`${col} = $${i++}`); vals.push(dto[k]); }
    }
    if (!sets.length) return { error: 'Nothing to update.' };
    sets.push('updated_at = NOW()');
    await this.ds.query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = $1`, vals)
      .catch((e: any) => { throw e; });
    return { id, updated: true };
  }

  // Reset a school user's password (e.g. an HOI who is locked out). Returns the new
  // temporary password once; the user is asked to change it on next login.
  @Post('users/:id/reset-password')
  async resetUserPassword(@Request() req: any, @Param('id') id: string) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    const bcryptLib = require('bcryptjs');
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const block = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const temp = `${block()}-${block()}`;
    const hash = await bcryptLib.hash(temp, 12);
    const rows = await this.ds.query(
      `UPDATE users SET password_hash = $2, must_change_password = true, is_active = true
        WHERE id = $1 RETURNING email`, [id, hash],
    ).catch(() => []);
    if (!rows.length) return { error: 'User not found.' };
    return { email: rows[0].email, tempPassword: temp };
  }
}

@Module({ controllers: [AdminController] })
export class AdminModule {}
