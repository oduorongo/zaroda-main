// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// MODULE 03: Finance — NestJS Backend
// Services: FeeService · MpesaService · PaymentService
//           ExpenseService · PayrollService · ReportService
//           GovernmentFundService · BudgetService
// ============================================================

// ─────────────────────────────────────────────────────────────
// src/modules/finance/dto/finance.dto.ts
// ─────────────────────────────────────────────────────────────
import {
  IsNotEmpty, IsOptional, IsString, IsNumber,
  IsEnum, IsUUID, IsDateString, IsBoolean, Min
} from 'class-validator';

export class CreateFeeStructureDto {
  @IsNotEmpty() @IsString() name: string;
  @IsNotEmpty() @IsEnum(['ecde','primary','junior','senior']) gradeBand: string;
  @IsNotEmpty() @IsString() academicYear: string;
  @IsNotEmpty() @IsEnum(['day','boarding','day_boarding']) category: string;
  items: {
    name: string;
    feeType: string;
    term: string;
    amount: number;
    isMandatory?: boolean;
  }[];
}

export class GenerateInvoicesDto {
  @IsNotEmpty() @IsUUID()   streamId: string;
  @IsNotEmpty() @IsString() academicYear: string;
  @IsNotEmpty() @IsString() term: 'term_1' | 'term_2' | 'term_3';
  @IsNotEmpty() @IsUUID()   feeStructureId: string;
  applyScholarships?: boolean;
  dueDate?: string;
}

export class RecordPaymentDto {
  @IsNotEmpty() @IsUUID()   learnerId: string;
  @IsNotEmpty() @IsUUID()   invoiceId: string;
  @IsNotEmpty() @IsNumber() @Min(1) amount: number;
  @IsNotEmpty() @IsEnum(['mpesa','bank','cash','cheque','scholarship','discount']) paymentMethod: string;
  @IsOptional() @IsString() mpesaRef?: string;
  @IsOptional() @IsString() mpesaPhone?: string;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() bankRef?: string;
  @IsOptional() @IsString() chequeNumber?: string;
  @IsOptional() @IsString() narration?: string;
  @IsOptional() @IsString() paymentDate?: string;
}

export class MpesaStkPushDto {
  @IsNotEmpty() @IsString() phone: string;        // 2547XXXXXXXX
  @IsNotEmpty() @IsNumber() @Min(1) amount: number;
  @IsNotEmpty() @IsString() accountRef: string;   // admission number
  @IsNotEmpty() @IsString() description: string;
}

export class RecordExpenseDto {
  @IsNotEmpty() @IsUUID()   categoryId: string;
  @IsNotEmpty() @IsString() description: string;
  @IsNotEmpty() @IsNumber() @Min(0) amount: number;
  @IsNotEmpty() @IsString() expenseDate: string;
  @IsNotEmpty() @IsString() academicYear: string;
  @IsNotEmpty() @IsString() term: string;
  @IsNotEmpty() @IsEnum(['fpe','fdjse','fdsse','school_own','donor','pta']) fundSource: string;
  @IsOptional() @IsString() supplierName?: string;
  @IsOptional() @IsString() lpoNumber?: string;
  @IsOptional() @IsString() voucherNumber?: string;
  @IsOptional() @IsString() paymentMethod?: string;
}

export class CreatePayrollDto {
  @IsNotEmpty() @IsNumber() month: number;
  @IsNotEmpty() @IsNumber() year: number;
  entries: {
    staffId: string;
    basicSalary: number;
    houseAllowance?: number;
    transportAllow?: number;
    medicalAllow?: number;
    otherAllowances?: number;
    loanDeductions?: number;
    saccoDeductions?: number;
    otherDeductions?: number;
  }[];
}

export class GovFundReceiptDto {
  @IsNotEmpty() @IsEnum(['fpe','fdjse','fdsse']) fundType: string;
  @IsNotEmpty() @IsString() academicYear: string;
  @IsNotEmpty() @IsString() term: string;
  @IsNotEmpty() @IsNumber() amountReceived: number;
  @IsNotEmpty() @IsNumber() amountExpected: number;
  @IsOptional() @IsString() receiptDate?: string;
  @IsOptional() @IsString() treasuryRef?: string;
  @IsOptional() @IsNumber() enrolledCount?: number;
  @IsOptional() @IsNumber() capitationRate?: number;
}


// ─────────────────────────────────────────────────────────────
// src/modules/finance/services/fee.service.ts
// ─────────────────────────────────────────────────────────────
import {
  Injectable, NotFoundException, BadRequestException, ConflictException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

// ZARODA SMS subscription pricing — per stream per year
// ALL modules included at no extra charge:
//   Academic · Finance · Communication · Professional Records
//   Library (FREE — no extra charge) · Sports (school-level)
//   Discipline · User Guide
// ZARODA Sports Base = separate FREE system, API-connected, not billed here
const ZARODA_RATES = {
  primary: 2400,   // Grade 1–9 (Primary + Junior)
  senior:  3360,   // Grade 10–12 (Senior School)
};
const MULTI_STREAM_DISCOUNT = 0.30; // 30% off for 3+ streams (full school onboarding)

@Injectable()
export class FeeService {
  constructor(
    @InjectRepository(FeeStructure)      private feeStructureRepo: Repository<FeeStructure>,
    @InjectRepository(FeeItem)           private feeItemRepo:      Repository<FeeItem>,
    @InjectRepository(LearnerFeeAccount) private accountRepo:      Repository<LearnerFeeAccount>,
    @InjectRepository(SchoolInvoice)     private invoiceRepo:      Repository<SchoolInvoice>,
    @InjectRepository(LearnerScholarship)private scholarshipRepo:  Repository<LearnerScholarship>,
    @InjectRepository(Learner)           private learnerRepo:      Repository<Learner>,
    @InjectRepository(Subscription)      private subRepo:          Repository<Subscription>,
    private dataSource: DataSource,
  ) {}

  // ── CREATE FEE STRUCTURE ───────────────────────────────────
  async createFeeStructure(tenantId: string, schoolId: string, dto: CreateFeeStructureDto, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const structure = manager.create(FeeStructure, {
        tenantId, schoolId,
        name:         dto.name,
        gradeBand:    dto.gradeBand,
        academicYear: dto.academicYear,
        category:     dto.category,
        createdBy:    userId,
      });
      await manager.save(FeeStructure, structure);

      const items = dto.items.map(item => manager.create(FeeItem, {
        tenantId,
        feeStructureId: structure.id,
        name:           item.name,
        feeType:        item.feeType,
        term:           item.term,
        amount:         item.amount,
        isMandatory:    item.isMandatory ?? true,
      }));
      await manager.save(FeeItem, items);

      return { ...structure, items };
    });
  }

  // ── GENERATE INVOICES FOR STREAM ──────────────────────────
  async generateStreamInvoices(tenantId: string, schoolId: string, dto: GenerateInvoicesDto, userId: string) {
    const structure = await this.feeStructureRepo.findOne({
      where: { id: dto.feeStructureId, tenantId },
      relations: ['items'],
    });
    if (!structure) throw new NotFoundException('Fee structure not found');

    const learners = await this.learnerRepo.find({
      where: { tenantId, streamId: dto.streamId, status: 'active', deletedAt: null },
    });
    if (learners.length === 0) throw new BadRequestException('No active learners in this stream');

    const termItems = structure.items.filter(i => i.term === dto.term || i.term === 'annual');

    return this.dataSource.transaction(async (manager) => {
      const generated = [];

      for (const learner of learners) {
        // Calculate scholarship credit
        let scholarshipCredit = 0;
        if (dto.applyScholarships) {
          scholarshipCredit = await this.calculateScholarshipCredit(
            tenantId, learner.id, termItems, dto.academicYear
          );
        }

        const totalBilled = termItems.reduce((s, i) => s + Number(i.amount), 0);
        const netPayable  = Math.max(totalBilled - scholarshipCredit, 0);

        // Upsert fee account
        let account = await manager.findOne(LearnerFeeAccount, {
          where: { learnerId: learner.id, academicYear: dto.academicYear, term: dto.term },
        });
        if (!account) {
          account = manager.create(LearnerFeeAccount, {
            tenantId,
            learnerId:        learner.id,
            feeStructureId:   dto.feeStructureId,
            academicYear:     dto.academicYear,
            term:             dto.term,
            totalBilled,
            scholarshipCredit,
            netPayable,
            totalPaid:        0,
            status:           'unpaid',
            dueDate:          dto.dueDate ? new Date(dto.dueDate) : this.defaultDueDate(dto.term),
          });
          await manager.save(LearnerFeeAccount, account);
        }

        // Generate invoice
        const invoiceNumber = await this.generateInvoiceNumber(tenantId);
        const invoice = manager.create(SchoolInvoice, {
          tenantId,
          learnerId:    learner.id,
          feeAccountId: account.id,
          invoiceNumber,
          academicYear: dto.academicYear,
          term:         dto.term,
          amount:       totalBilled,
          discount:     scholarshipCredit,
          totalAmount:  netPayable,
          status:       'unpaid',
          dueDate:      account.dueDate,
          issuedBy:     userId,
          lineItems:    termItems.map(i => ({
            name: i.name, type: i.feeType, amount: i.amount, term: i.term,
          })),
        });
        await manager.save(SchoolInvoice, invoice);

        generated.push({
          learnerId:     learner.id,
          learnerName:   `${learner.firstName} ${learner.lastName}`,
          admissionNo:   learner.admissionNumber,
          invoiceNumber,
          totalBilled,
          scholarshipCredit,
          netPayable,
        });
      }

      return {
        invoicesGenerated: generated.length,
        invoices: generated,
        message: `${generated.length} invoices generated for ${dto.term.replace('_',' ')} ${dto.academicYear}`,
      };
    });
  }

  // ── GET DEBTORS (overdue balances) ────────────────────────
  async getDebtors(tenantId: string, academicYear: string, term: string) {
    const debtors = await this.accountRepo
      .createQueryBuilder('fa')
      .innerJoin('fa.learner', 'l')
      .innerJoin('l.stream', 's')
      .where('fa.tenant_id = :tenantId', { tenantId })
      .andWhere('fa.academic_year = :academicYear', { academicYear })
      .andWhere('fa.term = :term', { term })
      .andWhere('fa.balance_due > 0')
      .orderBy('fa.balance_due', 'DESC')
      .select([
        'l.id            AS "learnerId"',
        'l.first_name    AS "firstName"',
        'l.last_name     AS "lastName"',
        'l.admission_number AS "admissionNumber"',
        'l.guardian_phone   AS "guardianPhone"',
        's.name          AS "streamName"',
        'fa.net_payable  AS "netPayable"',
        'fa.total_paid   AS "totalPaid"',
        'fa.balance_due  AS "balanceDue"',
        'fa.due_date     AS "dueDate"',
        'fa.status       AS "status"',
      ])
      .getRawMany();

    const totalOutstanding = debtors.reduce((s, d) => s + parseFloat(d.balanceDue), 0);
    return { debtors, totalOutstanding, count: debtors.length };
  }

  // ── ZARODA SUBSCRIPTION BILLING (with discount) ───────────
  async calculateZarodaBill(tenantId: string): Promise<{
    streams: any[]; subtotal: number; discount: number; total: number; discountApplied: boolean;
  }> {
    const subscriptions = await this.subRepo.find({
      where: { tenantId, status: 'active' },
      relations: ['stream'],
    });

    const streams = subscriptions.map(s => ({
      streamId:   s.streamId,
      streamName: s.stream?.name,
      plan:       s.plan,
      annualRate: ZARODA_RATES[s.plan] || ZARODA_RATES.primary,
    }));

    const subtotal = streams.reduce((t, s) => t + s.annualRate, 0);
    const discountApplied = streams.length >= 3;
    const discountAmount  = discountApplied ? subtotal * MULTI_STREAM_DISCOUNT : 0;
    const total = subtotal - discountAmount;

    return {
      streams,
      subtotal,
      discount:        parseFloat(discountAmount.toFixed(2)),
      total:           parseFloat(total.toFixed(2)),
      discountApplied,
    };
  }

  // ── HELPERS ────────────────────────────────────────────────
  private async generateInvoiceNumber(tenantId: string): Promise<string> {
    const year  = new Date().getFullYear();
    const count = await this.invoiceRepo.count({ where: { tenantId } });
    return `SCH-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  private async generateReceiptNumber(tenantId: string): Promise<string> {
    const year  = new Date().getFullYear();
    const count = await this.dataSource.getRepository(FeePayment).count({ where: { tenantId } });
    return `RCP-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  private defaultDueDate(term: string): Date {
    const d = new Date();
    const offsets: Record<string, number> = { term_1: 30, term_2: 30, term_3: 30 };
    d.setDate(d.getDate() + (offsets[term] || 30));
    return d;
  }

  private async calculateScholarshipCredit(
    tenantId: string, learnerId: string, items: FeeItem[], academicYear: string
  ): Promise<number> {
    const learnerScholarships = await this.scholarshipRepo.find({
      where: { tenantId, learnerId, academicYear, isActive: true },
      relations: ['scholarship'],
    });

    let credit = 0;
    for (const ls of learnerScholarships) {
      const s = ls.scholarship;
      const totalApplicable = items
        .filter(i => !s.applicableFees?.length || s.applicableFees.includes(i.feeType))
        .reduce((t, i) => t + Number(i.amount), 0);

      if (s.type === 'full') {
        credit += totalApplicable;
      } else if (s.coveragePct) {
        credit += totalApplicable * (Number(s.coveragePct) / 100);
      } else if (s.fixedAmount) {
        credit += Number(s.fixedAmount);
      }
    }
    return parseFloat(credit.toFixed(2));
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/finance/services/mpesa.service.ts
// M-Pesa Daraja API — STK Push + C2B Callback
// ─────────────────────────────────────────────────────────────
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';

@Injectable()
export class MpesaService {
  private readonly logger = new Logger(MpesaService.name);
  private readonly baseUrl = 'https://api.safaricom.co.ke'; // prod
  // private readonly baseUrl = 'https://sandbox.safaricom.co.ke'; // sandbox

  constructor(
    @InjectRepository(MpesaTransaction) private mpesaRepo: Repository<MpesaTransaction>,
    @InjectRepository(FeePayment)       private paymentRepo: Repository<FeePayment>,
    @InjectRepository(LearnerFeeAccount)private accountRepo: Repository<LearnerFeeAccount>,
  ) {}

  // ── GET OAUTH TOKEN ────────────────────────────────────────
  private async getAccessToken(): Promise<string> {
    const key    = process.env.MPESA_CONSUMER_KEY;
    const secret = process.env.MPESA_CONSUMER_SECRET;
    const creds  = Buffer.from(`${key}:${secret}`).toString('base64');

    const { data } = await axios.get(
      `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${creds}` } }
    );
    return data.access_token;
  }

  // ── STK PUSH (Lipa Na M-Pesa Online) ──────────────────────
  async stkPush(tenantId: string, dto: MpesaStkPushDto): Promise<{
    checkoutRequestId: string; merchantRequestId: string; message: string;
  }> {
    const token     = await this.getAccessToken();
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey   = process.env.MPESA_PASSKEY;
    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
    const password  = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

    // Format phone: 0712345678 → 254712345678
    const phone = dto.phone.startsWith('0')
      ? '254' + dto.phone.slice(1)
      : dto.phone.replace('+', '');

    const payload = {
      BusinessShortCode: shortcode,
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   'CustomerPayBillOnline',
      Amount:            Math.ceil(dto.amount),
      PartyA:            phone,
      PartyB:            shortcode,
      PhoneNumber:       phone,
      CallBackURL:       `${process.env.APP_URL}/api/v1/finance/mpesa/callback`,
      AccountReference:  dto.accountRef,
      TransactionDesc:   dto.description,
    };

    const { data } = await axios.post(
      `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Save pending transaction
    await this.mpesaRepo.save(this.mpesaRepo.create({
      tenantId,
      checkoutRequestId:  data.CheckoutRequestID,
      merchantRequestId:  data.MerchantRequestID,
      phoneNumber:        phone,
      amount:             dto.amount,
      accountReference:   dto.accountRef,
      transactionDesc:    dto.description,
      status:             'pending',
    }));

    return {
      checkoutRequestId: data.CheckoutRequestID,
      merchantRequestId: data.MerchantRequestID,
      message: `STK push sent to ${phone}. Awaiting M-Pesa PIN.`,
    };
  }

  // ── STK CALLBACK (Safaricom calls this) ───────────────────
  async handleStkCallback(body: any): Promise<void> {
    const stk = body.Body?.stkCallback;
    if (!stk) return;

    const checkoutId = stk.CheckoutRequestID;
    const txn = await this.mpesaRepo.findOne({ where: { checkoutRequestId: checkoutId } });
    if (!txn) return;

    if (stk.ResultCode === 0) {
      // Success
      const items = stk.CallbackMetadata?.Item || [];
      const get   = (name: string) => items.find((i: any) => i.Name === name)?.Value;

      const receiptNumber = get('MpesaReceiptNumber');
      const amount        = get('Amount');
      const phone         = get('PhoneNumber');
      const txDate        = get('TransactionDate');

      await this.mpesaRepo.update(txn.id, {
        mpesaReceiptNumber: receiptNumber,
        amount:             amount,
        status:             'completed',
        transactionDate:    txDate ? new Date(String(txDate)) : new Date(),
        rawCallback:        body,
        resultCode:         0,
        resultDesc:         stk.ResultDesc,
      });

      // Auto-reconcile: match admission number in accountReference
      await this.autoReconcile(txn.tenantId, txn, receiptNumber, amount, phone);

    } else {
      await this.mpesaRepo.update(txn.id, {
        status:     'failed',
        resultCode: stk.ResultCode,
        resultDesc: stk.ResultDesc,
        rawCallback: body,
      });
    }
  }

  // ── AUTO-RECONCILIATION ────────────────────────────────────
  private async autoReconcile(
    tenantId: string, txn: MpesaTransaction,
    receiptNumber: string, amount: number, phone: string
  ) {
    try {
      // Find learner by admission number (accountReference)
      const learner = await this.paymentRepo.manager.findOne(Learner, {
        where: { tenantId, admissionNumber: txn.accountReference },
      });
      if (!learner) return;

      // Find unpaid invoice
      const account = await this.accountRepo.findOne({
        where: { tenantId, learnerId: learner.id, status: 'unpaid' },
        order: { createdAt: 'DESC' },
      });
      if (!account) return;

      const invoice = await this.paymentRepo.manager.findOne(SchoolInvoice, {
        where: { tenantId, feeAccountId: account.id, status: 'unpaid' },
      });

      // Create payment record
      const year  = new Date().getFullYear();
      const count = await this.paymentRepo.count({ where: { tenantId } });
      const receiptNum = `RCP-${year}-${String(count + 1).padStart(5, '0')}`;

      const payment = await this.paymentRepo.save(this.paymentRepo.create({
        tenantId,
        learnerId:     learner.id,
        invoiceId:     invoice?.id,
        feeAccountId:  account.id,
        receiptNumber: receiptNum,
        amount,
        paymentMethod:  'mpesa',
        academicYear:   account.academicYear,
        term:           account.term,
        mpesaRef:       receiptNumber,
        mpesaPhone:     String(phone),
        mpesaConfirmed: true,
        narration:      `M-Pesa auto-reconciled. Ref: ${receiptNumber}`,
      }));

      // Update M-Pesa transaction
      await this.mpesaRepo.update(txn.id, { matchedPaymentId: payment.id });

      // Update fee account balance
      const newPaid = Number(account.totalPaid) + Number(amount);
      const newStatus = newPaid >= Number(account.netPayable)
        ? (newPaid > Number(account.netPayable) ? 'overpaid' : 'paid')
        : 'partial';

      await this.accountRepo.update(account.id, {
        totalPaid: newPaid,
        status:    newStatus,
      });

      // Update invoice
      if (invoice) {
        await this.paymentRepo.manager.update(SchoolInvoice, invoice.id, {
          status: newStatus === 'paid' || newStatus === 'overpaid' ? 'paid' : 'partial',
        });
      }

      // Post to cashbook
      await this.postToCashbook(tenantId, learner, payment, account);

      this.logger.log(`Auto-reconciled M-Pesa ${receiptNumber} → ${learner.admissionNumber} KES ${amount}`);
    } catch (err) {
      this.logger.error(`Auto-reconcile failed: ${err.message}`);
    }
  }

  private async postToCashbook(tenantId: string, learner: any, payment: any, account: any) {
    const year  = new Date().getFullYear();
    const count = await this.paymentRepo.manager.count(CashbookEntry, { where: { tenantId } });
    await this.paymentRepo.manager.save(CashbookEntry, {
      tenantId,
      schoolId:    learner.schoolId,
      entryDate:   new Date(),
      academicYear: account.academicYear,
      term:        account.term,
      entryType:   'receipt',
      fundSource:  'school_own',
      description: `Fee payment — ${learner.firstName} ${learner.lastName} (${learner.admissionNumber})`,
      reference:   payment.receiptNumber,
      payeePayer:  `${learner.guardianName || learner.firstName + ' ' + learner.lastName}`,
      debit:       payment.amount,
      credit:      0,
      linkedPaymentId: payment.id,
    });
  }

  // ── CHECK STK STATUS ───────────────────────────────────────
  async checkStkStatus(checkoutRequestId: string): Promise<any> {
    const token     = await this.getAccessToken();
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey   = process.env.MPESA_PASSKEY;
    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
    const password  = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

    const { data } = await axios.post(
      `${this.baseUrl}/mpesa/stkpushquery/v1/query`,
      { BusinessShortCode: shortcode, Password: password, Timestamp: timestamp, CheckoutRequestID: checkoutRequestId },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return data;
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/finance/services/payment.service.ts
// Manual payments + receipt generation
// ─────────────────────────────────────────────────────────────
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(FeePayment)        private paymentRepo: Repository<FeePayment>,
    @InjectRepository(LearnerFeeAccount) private accountRepo: Repository<LearnerFeeAccount>,
    @InjectRepository(SchoolInvoice)     private invoiceRepo: Repository<SchoolInvoice>,
    @InjectRepository(CashbookEntry)     private cashbookRepo: Repository<CashbookEntry>,
    private dataSource: DataSource,
  ) {}

  async record(tenantId: string, dto: RecordPaymentDto, receivedBy: string) {
    const invoice = await this.invoiceRepo.findOne({
      where: { id: dto.invoiceId, tenantId },
      relations: ['learner','feeAccount'],
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'void') throw new BadRequestException('Invoice is voided');

    return this.dataSource.transaction(async (manager) => {
      const year  = new Date().getFullYear();
      const count = await manager.count(FeePayment, { where: { tenantId } });
      const receiptNumber = `RCP-${year}-${String(count + 1).padStart(5, '0')}`;

      const payment = manager.create(FeePayment, {
        tenantId,
        learnerId:     dto.learnerId,
        invoiceId:     dto.invoiceId,
        feeAccountId:  invoice.feeAccountId,
        receiptNumber,
        amount:        dto.amount,
        paymentMethod: dto.paymentMethod as any,
        academicYear:  invoice.academicYear,
        term:          invoice.term,
        paymentDate:   dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
        mpesaRef:      dto.mpesaRef,
        mpesaPhone:    dto.mpesaPhone,
        bankName:      dto.bankName,
        bankRef:       dto.bankRef,
        chequeNumber:  dto.chequeNumber,
        narration:     dto.narration,
        receivedBy,
      });
      await manager.save(FeePayment, payment);

      // Update fee account
      const account = invoice.feeAccount;
      const newPaid  = Number(account.totalPaid) + Number(dto.amount);
      const netPayable = Number(account.netPayable);
      const newStatus = newPaid >= netPayable
        ? (newPaid > netPayable ? 'overpaid' : 'paid')
        : 'partial';

      await manager.update(LearnerFeeAccount, account.id, {
        totalPaid: newPaid, status: newStatus,
      });

      // Update invoice
      const invoicePaid = Number(invoice.totalAmount);
      await manager.update(SchoolInvoice, invoice.id, {
        status: newPaid >= invoicePaid ? 'paid' : 'partial',
      });

      // Post to cashbook
      const learner = invoice.learner;
      const cbCount = await manager.count(CashbookEntry, { where: { tenantId } });
      await manager.save(CashbookEntry, manager.create(CashbookEntry, {
        tenantId,
        schoolId:    learner.schoolId,
        entryDate:   payment.paymentDate,
        academicYear: invoice.academicYear,
        term:        invoice.term,
        entryType:   'receipt',
        fundSource:  'school_own',
        description: `Fee — ${learner.firstName} ${learner.lastName} (${learner.admissionNumber})`,
        reference:   receiptNumber,
        payeePayer:  learner.guardianName || learner.firstName + ' ' + learner.lastName,
        debit:       dto.amount,
        credit:      0,
        linkedPaymentId: payment.id,
        enteredBy:   receivedBy,
      }));

      return {
        receiptNumber,
        paymentId:   payment.id,
        amount:      dto.amount,
        balance:     Math.max(netPayable - newPaid, 0),
        status:      newStatus,
        message:     `Payment of KES ${dto.amount.toLocaleString()} recorded. Receipt: ${receiptNumber}`,
      };
    });
  }

  async getReceipt(tenantId: string, receiptNumber: string) {
    const payment = await this.paymentRepo.findOne({
      where: { tenantId, receiptNumber },
      relations: ['learner','learner.stream','invoice'],
    });
    if (!payment) throw new NotFoundException('Receipt not found');
    return payment;
  }

  async getLearnerStatement(tenantId: string, learnerId: string, academicYear?: string) {
    const qb = this.paymentRepo.createQueryBuilder('p')
      .where('p.tenant_id = :tenantId AND p.learner_id = :learnerId', { tenantId, learnerId })
      .orderBy('p.payment_date', 'DESC');
    if (academicYear) qb.andWhere('p.academic_year = :academicYear', { academicYear });
    return qb.getMany();
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/finance/services/report.service.ts
// Cashbook · Ledger · Trial Balance · Income Statement
// ─────────────────────────────────────────────────────────────
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

@Injectable()
export class FinanceReportService {
  constructor(
    @InjectRepository(CashbookEntry)     private cashbookRepo: Repository<CashbookEntry>,
    @InjectRepository(FeePayment)        private paymentRepo:  Repository<FeePayment>,
    @InjectRepository(Expense)           private expenseRepo:  Repository<Expense>,
    @InjectRepository(GovFundReceipt)    private govFundRepo:  Repository<GovFundReceipt>,
    @InjectRepository(GovFundExpenditure)private govExpRepo:   Repository<GovFundExpenditure>,
    @InjectRepository(Budget)            private budgetRepo:   Repository<Budget>,
    private dataSource: DataSource,
  ) {}

  // ── CASHBOOK ───────────────────────────────────────────────
  async getCashbook(tenantId: string, schoolId: string, params: {
    academicYear: string; term: string; fundSource?: string;
    dateFrom?: string; dateTo?: string;
  }) {
    const qb = this.cashbookRepo.createQueryBuilder('cb')
      .where('cb.tenant_id = :tenantId AND cb.school_id = :schoolId', { tenantId, schoolId })
      .andWhere('cb.academic_year = :academicYear', { params })
      .andWhere('cb.term = :term', { params })
      .orderBy('cb.entry_date', 'ASC')
      .addOrderBy('cb.created_at', 'ASC');

    if (params.fundSource) qb.andWhere('cb.fund_source = :fundSource', { fundSource: params.fundSource });
    if (params.dateFrom)   qb.andWhere('cb.entry_date >= :dateFrom',   { dateFrom: params.dateFrom });
    if (params.dateTo)     qb.andWhere('cb.entry_date <= :dateTo',     { dateTo: params.dateTo });

    const entries = await qb.getMany();

    // Compute running balance
    let runningBalance = 0;
    const withBalance = entries.map(e => {
      runningBalance += Number(e.debit) - Number(e.credit);
      return { ...e, runningBalance: parseFloat(runningBalance.toFixed(2)) };
    });

    const totalReceipts = entries.reduce((s, e) => s + Number(e.debit), 0);
    const totalPayments = entries.reduce((s, e) => s + Number(e.credit), 0);

    return {
      entries: withBalance,
      summary: {
        totalReceipts: parseFloat(totalReceipts.toFixed(2)),
        totalPayments: parseFloat(totalPayments.toFixed(2)),
        closingBalance: parseFloat(runningBalance.toFixed(2)),
      },
    };
  }

  // ── TRIAL BALANCE ──────────────────────────────────────────
  async getTrialBalance(tenantId: string, schoolId: string, academicYear: string, term: string) {
    const result = await this.dataSource.query(`
      SELECT
        fund_source,
        SUM(debit)  AS total_debit,
        SUM(credit) AS total_credit,
        SUM(debit) - SUM(credit) AS net_balance
      FROM cashbook_entries
      WHERE tenant_id = $1
        AND school_id = $2
        AND academic_year = $3
        AND term = $4
      GROUP BY fund_source
      ORDER BY fund_source
    `, [tenantId, schoolId, academicYear, term]);

    const totalDebit  = result.reduce((s: number, r: any) => s + parseFloat(r.total_debit),  0);
    const totalCredit = result.reduce((s: number, r: any) => s + parseFloat(r.total_credit), 0);

    return {
      accounts:    result,
      totalDebit:  parseFloat(totalDebit.toFixed(2)),
      totalCredit: parseFloat(totalCredit.toFixed(2)),
      balanced:    Math.abs(totalDebit - totalCredit) < 0.01,
    };
  }

  // ── INCOME STATEMENT ───────────────────────────────────────
  async getIncomeStatement(tenantId: string, schoolId: string, academicYear: string, term: string) {
    const [feeIncome, otherIncome, expenses, govFunds] = await Promise.all([
      this.dataSource.query(`
        SELECT COALESCE(SUM(amount),0) AS total
        FROM fee_payments
        WHERE tenant_id = $1 AND academic_year = $2 AND term = $3 AND reversed = false
      `, [tenantId, academicYear, term]),

      this.dataSource.query(`
        SELECT COALESCE(SUM(debit),0) AS total
        FROM cashbook_entries
        WHERE tenant_id = $1 AND school_id = $2 AND academic_year = $3 AND term = $4
          AND fund_source = 'school_own' AND entry_type = 'receipt'
      `, [tenantId, schoolId, academicYear, term]),

      this.dataSource.query(`
        SELECT COALESCE(SUM(amount),0) AS total, fund_source
        FROM expenses
        WHERE tenant_id = $1 AND academic_year = $2 AND term = $3 AND status = 'paid'
        GROUP BY fund_source
      `, [tenantId, academicYear, term]),

      this.govFundRepo.find({ where: { tenantId, academicYear, term } }),
    ]);

    const totalFeeIncome  = parseFloat(feeIncome[0]?.total  || '0');
    const totalGovFunds   = govFunds.reduce((s: number, g: any) => s + Number(g.amountReceived), 0);
    const totalExpenses   = expenses.reduce((s: number, e: any) => s + parseFloat(e.total), 0);
    const totalIncome     = totalFeeIncome + totalGovFunds;
    const surplus         = totalIncome - totalExpenses;

    return {
      income: {
        feesCollected:   totalFeeIncome,
        governmentFunds: totalGovFunds,
        govFundBreakdown: govFunds,
        totalIncome,
      },
      expenditure: {
        byFundSource: expenses,
        totalExpenses,
      },
      surplus: parseFloat(surplus.toFixed(2)),
      academicYear,
      term,
    };
  }

  // ── GOVERNMENT FUNDS SUMMARY (Kenya Handbook format) ───────
  async getGovFundStatement(
    tenantId: string, schoolId: string,
    fundType: 'fpe' | 'fdjse' | 'fdsse',
    academicYear: string, term: string
  ) {
    const receipts = await this.govFundRepo.find({
      where: { tenantId, schoolId, fundType: fundType as any, academicYear, term },
    });

    const expenditures = await this.govExpRepo.find({
      where: { tenantId, schoolId, fundType: fundType as any, academicYear, term },
    });

    const totalReceived = receipts.reduce((s, r) => s + Number(r.amountReceived), 0);
    const totalSpent    = expenditures.reduce((s, e) => s + Number(e.amount), 0);
    const balance       = totalReceived - totalSpent;

    // Group expenditure by vote head
    const byVoteHead = expenditures.reduce((acc: any, e) => {
      if (!acc[e.voteHead]) acc[e.voteHead] = 0;
      acc[e.voteHead] += Number(e.amount);
      return acc;
    }, {});

    const FUND_NAMES = { fpe: 'Free Primary Education', fdjse: 'Free Day Junior Secondary', fdsse: 'Free Day Senior Secondary' };

    return {
      fundType:    fundType.toUpperCase(),
      fundName:    FUND_NAMES[fundType],
      academicYear,
      term,
      receipts,
      totalReceived: parseFloat(totalReceived.toFixed(2)),
      expenditures,
      byVoteHead,
      totalSpent:    parseFloat(totalSpent.toFixed(2)),
      balance:       parseFloat(balance.toFixed(2)),
      // Kenya Handbook: % utilization per vote head
      utilization:   Object.entries(byVoteHead).map(([head, amount]: any) => ({
        voteHead: head,
        amount:   parseFloat(amount.toFixed(2)),
        pct:      totalReceived > 0 ? parseFloat((amount / totalReceived * 100).toFixed(1)) : 0,
      })),
    };
  }

  // ── DEBTORS AGEING REPORT ──────────────────────────────────
  async getAgingReport(tenantId: string, academicYear: string) {
    const result = await this.dataSource.query(`
      SELECT
        l.first_name || ' ' || l.last_name AS "learnerName",
        l.admission_number AS "admissionNo",
        s.name AS "streamName",
        fa.net_payable AS "totalCharged",
        fa.total_paid  AS "totalPaid",
        fa.balance_due AS "balanceDue",
        fa.due_date,
        CASE
          WHEN fa.due_date >= CURRENT_DATE THEN 'current'
          WHEN CURRENT_DATE - fa.due_date <= 30 THEN '1-30 days'
          WHEN CURRENT_DATE - fa.due_date <= 60 THEN '31-60 days'
          WHEN CURRENT_DATE - fa.due_date <= 90 THEN '61-90 days'
          ELSE 'over 90 days'
        END AS "agingBucket"
      FROM learner_fee_accounts fa
      JOIN learners l ON l.id = fa.learner_id
      LEFT JOIN streams s ON s.id = l.stream_id
      WHERE fa.tenant_id = $1
        AND fa.academic_year = $2
        AND fa.balance_due > 0
      ORDER BY fa.balance_due DESC
    `, [tenantId, academicYear]);

    // Group by aging bucket
    const buckets: Record<string, number> = {};
    for (const r of result) {
      buckets[r.agingBucket] = (buckets[r.agingBucket] || 0) + parseFloat(r.balanceDue);
    }

    return { debtors: result, agingSummary: buckets, totalOutstanding: result.reduce((s: number, r: any) => s + parseFloat(r.balanceDue), 0) };
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/finance/finance.controller.ts
// ─────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Patch, Body, Param,
  Query, UseGuards, HttpCode, HttpStatus, Req, RawBodyRequest
} from '@nestjs/common';
import { Request } from 'express';

@Controller('api/v1/finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceController {
  constructor(
    private feeService:     FeeService,
    private mpesaService:   MpesaService,
    private paymentService: PaymentService,
    private reportService:  FinanceReportService,
    private payrollService: PayrollService,
    private govFundService: GovernmentFundService,
  ) {}

  // ── FEE STRUCTURES ────────────────────────────────────────
  @Post('fee-structures')
  @Roles('tenant_owner','school_admin','hoi','bursar')
  createFeeStructure(@CurrentUser() u: User, @Body() dto: CreateFeeStructureDto) {
    return this.feeService.createFeeStructure(u.tenantId, u.schoolId, dto, u.id);
  }

  @Post('invoices/generate')
  @Roles('tenant_owner','school_admin','hoi','bursar')
  generateInvoices(@CurrentUser() u: User, @Body() dto: GenerateInvoicesDto) {
    return this.feeService.generateStreamInvoices(u.tenantId, u.schoolId, dto, u.id);
  }

  @Get('invoices/learner/:learnerId')
  @Roles('tenant_owner','school_admin','hoi','bursar','parent','learner')
  getLearnerInvoices(@CurrentUser() u: User, @Param('learnerId') id: string) {
    return this.paymentService.getLearnerStatement(u.tenantId, id);
  }

  @Get('debtors')
  @Roles('tenant_owner','school_admin','hoi','bursar')
  getDebtors(
    @CurrentUser() u: User,
    @Query('academicYear') year: string,
    @Query('term') term: string,
  ) {
    return this.feeService.getDebtors(u.tenantId, year, term);
  }

  // ── PAYMENTS ──────────────────────────────────────────────
  @Post('payments')
  @Roles('tenant_owner','school_admin','hoi','bursar')
  @HttpCode(HttpStatus.CREATED)
  recordPayment(@CurrentUser() u: User, @Body() dto: RecordPaymentDto) {
    return this.paymentService.record(u.tenantId, dto, u.id);
  }

  @Get('receipts/:receiptNumber')
  @Roles('tenant_owner','school_admin','hoi','bursar','parent')
  getReceipt(@CurrentUser() u: User, @Param('receiptNumber') ref: string) {
    return this.paymentService.getReceipt(u.tenantId, ref);
  }

  @Get('statement/learner/:learnerId')
  @Roles('tenant_owner','school_admin','hoi','bursar','parent','learner')
  getStatement(
    @CurrentUser() u: User,
    @Param('learnerId') id: string,
    @Query('academicYear') year?: string,
  ) {
    return this.paymentService.getLearnerStatement(u.tenantId, id, year);
  }

  // ── MPESA ─────────────────────────────────────────────────
  @Post('mpesa/stk-push')
  @Roles('tenant_owner','school_admin','hoi','bursar','parent')
  stkPush(@CurrentUser() u: User, @Body() dto: MpesaStkPushDto) {
    return this.mpesaService.stkPush(u.tenantId, dto);
  }

  @Post('mpesa/callback')
  @HttpCode(HttpStatus.OK)
  // PUBLIC — Safaricom calls this
  async mpesaCallback(@Req() req: any) {
    await this.mpesaService.handleStkCallback(req.body);
    return { ResultCode: 0, ResultDesc: 'Success' };
  }

  @Get('mpesa/status/:checkoutRequestId')
  checkMpesaStatus(@Param('checkoutRequestId') id: string) {
    return this.mpesaService.checkStkStatus(id);
  }

  // ── EXPENSES ──────────────────────────────────────────────
  @Post('expenses')
  @Roles('tenant_owner','school_admin','hoi','bursar')
  recordExpense(@CurrentUser() u: User, @Body() dto: RecordExpenseDto) {
    return this.expenseService.record(u.tenantId, u.schoolId, dto, u.id);
  }

  // ── GOVERNMENT FUNDS ──────────────────────────────────────
  @Post('gov-funds/receipts')
  @Roles('tenant_owner','school_admin','hoi','bursar')
  recordGovFund(@CurrentUser() u: User, @Body() dto: GovFundReceiptDto) {
    return this.govFundService.recordReceipt(u.tenantId, u.schoolId, dto, u.id);
  }

  @Get('gov-funds/statement/:fundType')
  @Roles('tenant_owner','school_admin','hoi','bursar')
  getGovFundStatement(
    @CurrentUser() u: User,
    @Param('fundType') fundType: 'fpe' | 'fdjse' | 'fdsse',
    @Query('academicYear') year: string,
    @Query('term') term: string,
  ) {
    return this.reportService.getGovFundStatement(u.tenantId, u.schoolId, fundType, year, term);
  }

  // ── REPORTS ───────────────────────────────────────────────
  @Get('reports/cashbook')
  @Roles('tenant_owner','school_admin','hoi','bursar')
  getCashbook(@CurrentUser() u: User, @Query() params: any) {
    return this.reportService.getCashbook(u.tenantId, u.schoolId, params);
  }

  @Get('reports/trial-balance')
  @Roles('tenant_owner','school_admin','hoi','bursar')
  getTrialBalance(@CurrentUser() u: User, @Query('academicYear') year: string, @Query('term') term: string) {
    return this.reportService.getTrialBalance(u.tenantId, u.schoolId, year, term);
  }

  @Get('reports/income-statement')
  @Roles('tenant_owner','school_admin','hoi','bursar')
  getIncomeStatement(@CurrentUser() u: User, @Query('academicYear') year: string, @Query('term') term: string) {
    return this.reportService.getIncomeStatement(u.tenantId, u.schoolId, year, term);
  }

  @Get('reports/aging')
  @Roles('tenant_owner','school_admin','hoi','bursar')
  getAgingReport(@CurrentUser() u: User, @Query('academicYear') year: string) {
    return this.reportService.getAgingReport(u.tenantId, year);
  }

  // ── PAYROLL ───────────────────────────────────────────────
  @Post('payroll')
  @Roles('tenant_owner','school_admin','hoi','bursar')
  createPayroll(@CurrentUser() u: User, @Body() dto: CreatePayrollDto) {
    return this.payrollService.create(u.tenantId, dto, u.id);
  }

  @Patch('payroll/:id/approve')
  @Roles('tenant_owner','hoi')
  approvePayroll(@CurrentUser() u: User, @Param('id') id: string) {
    return this.payrollService.approve(u.tenantId, id, u.id);
  }

  // ── ZARODA SUBSCRIPTION BILL ──────────────────────────────
  @Get('zaroda-bill')
  @Roles('tenant_owner')
  getZarodaBill(@CurrentUser() u: User) {
    return this.feeService.calculateZarodaBill(u.tenantId);
  }
}
