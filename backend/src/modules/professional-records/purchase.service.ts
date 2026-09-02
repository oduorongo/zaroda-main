import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { PrPurchase } from './entities';
import { initiateStkPush, checkPaymentStatus, parseTumaCallback, normalisePhoneForTuma } from '../../common/tuma';

// One flat fee unlocks one complete pipeline: a Scheme of Work plus every lesson
// plan and lesson notes record generated from it. No subscription tiers — this
// is intentionally independent of the tenant's own subscription/trial state.
//
// Priced against estimated AI cost (Sonnet for the scheme, Haiku for lesson
// plans/notes — see ai-generator.service.ts) for a moderate-load subject over
// a term. Not yet verified against real usage — ANTHROPIC_API_KEY isn't live
// yet, so this is a starting estimate, not a measured number. A subject with
// many lessons/week (e.g. 7/week) can still exceed this in AI cost since the
// fee is unlimited-use per pipeline — revisit once real token usage is logged.
const FLOW_PRICE_KES = 150;

function callbackUrl(): string {
  const base = (process.env.APP_URL || '').replace(/\/$/, '');
  return `${base}/api/v1/professional-records/mpesa/callback`;
}

@Injectable()
export class PurchaseService {
  private readonly logger = new Logger(PurchaseService.name);

  constructor(
    @InjectRepository(PrPurchase) private purchaseRepo: Repository<PrPurchase>,
  ) {}

  // ── INITIATE PAYMENT (via Tuma) ───────────────────────────
  async initiate(tenantId: string, teacherId: string, phone: string) {
    const normalizedPhone = normalisePhoneForTuma(phone);
    if (!normalizedPhone) throw new BadRequestException('Enter a valid M-Pesa phone number.');

    const purchase = await this.purchaseRepo.save(this.purchaseRepo.create({
      tenantId, teacherId, phone: normalizedPhone, amount: FLOW_PRICE_KES, status: 'pending',
    }));

    const result = await initiateStkPush({
      amount: FLOW_PRICE_KES,
      phone: normalizedPhone,
      description: 'Professional Records — scheme to lesson notes',
      callbackUrl: callbackUrl(),
    });
    if (!result.ok) {
      await this.purchaseRepo.update(purchase.id, { status: 'failed', resultDesc: result.detail });
      throw new BadRequestException(result.detail || 'Could not start the M-Pesa payment. Please try again.');
    }

    await this.purchaseRepo.update(purchase.id, { merchantRequestId: result.merchantRequestId });

    return {
      purchaseId: purchase.id,
      merchantRequestId: result.merchantRequestId,
      amount: FLOW_PRICE_KES,
      message: `STK push sent to ${normalizedPhone}. Enter your M-Pesa PIN to pay KES ${FLOW_PRICE_KES}.`,
    };
  }

  // ── WEBHOOK (Tuma calls this — no auth) ───────────────────
  async handleCallback(body: any): Promise<void> {
    const parsed = parseTumaCallback(body);
    if (!parsed.merchantRequestId) {
      this.logger.warn(`Tuma callback with no merchant_request_id: ${JSON.stringify(body).slice(0, 500)}`);
      return;
    }
    const purchase = await this.purchaseRepo.findOne({ where: { merchantRequestId: parsed.merchantRequestId } });
    if (!purchase) return;

    if (parsed.success) {
      await this.purchaseRepo.update(purchase.id, { status: 'paid', mpesaReceiptNumber: parsed.mpesaReceipt });
    } else {
      await this.purchaseRepo.update(purchase.id, { status: 'failed' });
    }
  }

  // ── POLL STATUS ────────────────────────────────────────────
  // Also actively re-checks with Tuma in case its webhook never arrives.
  async getStatus(tenantId: string, teacherId: string, id: string) {
    const purchase = await this.purchaseRepo.findOne({ where: { id, tenantId, teacherId } });
    if (!purchase) throw new BadRequestException('Purchase not found.');
    if (purchase.status !== 'pending' || !purchase.merchantRequestId) {
      return { status: purchase.status, purchaseId: purchase.id };
    }

    const result = await checkPaymentStatus(purchase.merchantRequestId);
    if (result.ok && result.status && /success|completed/i.test(result.status)) {
      await this.purchaseRepo.update(purchase.id, { status: 'paid', mpesaReceiptNumber: result.mpesaReceipt });
      return { status: 'paid', purchaseId: purchase.id };
    }
    return { status: purchase.status, purchaseId: purchase.id };
  }

  // ── FIND AN UNCONSUMED PAID PURCHASE ──────────────────────
  // `manager` lets the caller run this inside its own transaction, so the
  // find-then-consume pair is atomic and a teacher can't spend one payment twice.
  async findConsumablePurchase(tenantId: string, teacherId: string, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(PrPurchase) : this.purchaseRepo;
    return repo.findOne({
      where: { tenantId, teacherId, status: 'paid', schemeId: null as any },
      order: { createdAt: 'ASC' },
    });
  }

  assertPaid(purchase: PrPurchase | null) {
    if (!purchase) {
      throw new BadRequestException(`Payment required. Pay KES ${FLOW_PRICE_KES} via M-Pesa to generate a scheme of work.`);
    }
  }

  async markConsumed(purchaseId: string, schemeId: string, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(PrPurchase) : this.purchaseRepo;
    await repo.update(purchaseId, { schemeId, status: 'consumed' });
  }
}
