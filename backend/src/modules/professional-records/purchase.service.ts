import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import axios from 'axios';
import { PrPurchase } from './entities';

// One flat fee unlocks one complete pipeline: a Scheme of Work plus every lesson
// plan and lesson notes record generated from it. No subscription tiers — this
// is intentionally independent of the tenant's own subscription/trial state.
const FLOW_PRICE_KES = 50;
const BASE_URL = 'https://api.safaricom.co.ke';

@Injectable()
export class PurchaseService {
  private readonly logger = new Logger(PurchaseService.name);

  constructor(
    @InjectRepository(PrPurchase) private purchaseRepo: Repository<PrPurchase>,
  ) {}

  private async getAccessToken(): Promise<string> {
    const key = process.env.MPESA_CONSUMER_KEY;
    const secret = process.env.MPESA_CONSUMER_SECRET;
    const creds = Buffer.from(`${key}:${secret}`).toString('base64');
    const { data } = await axios.get(
      `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${creds}` } },
    );
    return data.access_token;
  }

  // ── INITIATE PAYMENT ──────────────────────────────────────
  async initiate(tenantId: string, teacherId: string, phone: string) {
    if (!phone) throw new BadRequestException('A phone number is required.');
    const normalizedPhone = phone.startsWith('0') ? '254' + phone.slice(1) : phone.replace('+', '');

    const purchase = await this.purchaseRepo.save(this.purchaseRepo.create({
      tenantId, teacherId, phone: normalizedPhone, amount: FLOW_PRICE_KES, status: 'pending',
    }));

    try {
      const token = await this.getAccessToken();
      const shortcode = process.env.MPESA_SHORTCODE;
      const passkey = process.env.MPESA_PASSKEY;
      const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
      const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

      const { data } = await axios.post(
        `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
        {
          BusinessShortCode: shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: 'CustomerPayBillOnline',
          Amount: Math.ceil(FLOW_PRICE_KES),
          PartyA: normalizedPhone,
          PartyB: shortcode,
          PhoneNumber: normalizedPhone,
          CallBackURL: `${process.env.APP_URL}/api/v1/professional-records/mpesa/callback`,
          AccountReference: purchase.id,
          TransactionDesc: 'Professional Records — scheme to lesson notes',
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      await this.purchaseRepo.update(purchase.id, {
        checkoutRequestId: data.CheckoutRequestID,
        merchantRequestId: data.MerchantRequestID,
      });

      return {
        purchaseId: purchase.id,
        checkoutRequestId: data.CheckoutRequestID,
        amount: FLOW_PRICE_KES,
        message: `STK push sent to ${normalizedPhone}. Enter your M-Pesa PIN to pay KES ${FLOW_PRICE_KES}.`,
      };
    } catch (err: any) {
      this.logger.error(`M-Pesa STK push failed: ${err.message}`);
      await this.purchaseRepo.update(purchase.id, { status: 'failed', resultDesc: err.message });
      throw new BadRequestException('Could not start the M-Pesa payment. Please try again.');
    }
  }

  // ── STK CALLBACK (Safaricom calls this — no auth) ─────────
  async handleCallback(body: any): Promise<void> {
    const stk = body?.Body?.stkCallback;
    if (!stk) return;

    const purchase = await this.purchaseRepo.findOne({ where: { checkoutRequestId: stk.CheckoutRequestID } });
    if (!purchase) return;

    if (stk.ResultCode === 0) {
      const items = stk.CallbackMetadata?.Item || [];
      const get = (name: string) => items.find((i: any) => i.Name === name)?.Value;
      await this.purchaseRepo.update(purchase.id, {
        status: 'paid',
        mpesaReceiptNumber: get('MpesaReceiptNumber'),
        resultDesc: stk.ResultDesc,
      });
    } else {
      await this.purchaseRepo.update(purchase.id, { status: 'failed', resultDesc: stk.ResultDesc });
    }
  }

  // ── POLL STATUS ────────────────────────────────────────────
  async getStatus(tenantId: string, teacherId: string, id: string) {
    const purchase = await this.purchaseRepo.findOne({ where: { id, tenantId, teacherId } });
    if (!purchase) throw new BadRequestException('Purchase not found.');
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
