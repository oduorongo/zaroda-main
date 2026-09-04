import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, DataSource } from 'typeorm';
import { PrWallet, PrWalletTransaction } from './entities';
import { User } from '../auth/entities/user.entity';
import { initiateStkPush, checkPaymentStatus, parseTumaCallback, normalisePhoneForTuma } from '../../common/tuma';

// Referral reward: a teacher who refers another teacher gets this flat wallet
// credit the first time the REFERRED teacher pays for a generation — not at
// signup, so a throwaway account costs the abuser a real debit to trigger.
const REFERRAL_BONUS_KES = 30;

// Wallet-based, per-item billing: a teacher tops up their wallet via M-Pesa
// STK push in whatever amount they like, then each generated item debits a
// fixed price from the balance. Replaces the earlier pay-per-flow/tiered
// purchase model (never went live — no ANTHROPIC_API_KEY was configured in
// production yet).
//
// Priced against estimated AI cost (Sonnet for the scheme, Haiku for lesson
// plans/notes — see ai-generator.service.ts). Not yet verified against real
// usage, so these are starting estimates to revisit once real token usage is
// logged.
export const ITEM_PRICE_KES = {
  scheme: 30,       // Scheme of Work — once per scheme (e.g. per subject/term)
  lesson_plan: 2,   // Lesson Plan — each
  lesson_notes: 2,  // Lesson Notes — each
} as const;
export type PrItemType = keyof typeof ITEM_PRICE_KES;

const ITEM_LABEL: Record<PrItemType, string> = {
  scheme: 'Scheme of Work',
  lesson_plan: 'Lesson Plan',
  lesson_notes: 'Lesson Notes',
};

function callbackUrl(): string {
  const base = (process.env.APP_URL || '').replace(/\/$/, '');
  return `${base}/api/v1/professional-records/mpesa/callback`;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(PrWallet) private walletRepo: Repository<PrWallet>,
    @InjectRepository(PrWalletTransaction) private txnRepo: Repository<PrWalletTransaction>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private dataSource: DataSource,
  ) {}

  private async findOrCreateWallet(tenantId: string, teacherId: string, manager?: EntityManager): Promise<PrWallet> {
    const repo = manager ? manager.getRepository(PrWallet) : this.walletRepo;
    let wallet = await repo.findOne({ where: { tenantId, teacherId } });
    if (!wallet) {
      wallet = await repo.save(repo.create({ tenantId, teacherId, balance: 0 }));
    }
    return wallet;
  }

  async getBalance(tenantId: string, teacherId: string) {
    const wallet = await this.findOrCreateWallet(tenantId, teacherId);
    return { balance: Number(wallet.balance), prices: ITEM_PRICE_KES };
  }

  async getTransactions(tenantId: string, teacherId: string) {
    return this.txnRepo.find({ where: { tenantId, teacherId }, order: { createdAt: 'DESC' } });
  }

  // ── TOP UP (via Tuma STK push) ─────────────────────────────
  async topUp(tenantId: string, teacherId: string, phone: string, amount: number) {
    const normalizedPhone = normalisePhoneForTuma(phone);
    if (!normalizedPhone) throw new BadRequestException('Enter a valid M-Pesa phone number.');
    if (!amount || amount < 10) throw new BadRequestException('Enter an amount of at least KES 10.');

    const txn = await this.txnRepo.save(this.txnRepo.create({
      tenantId, teacherId, type: 'topup', amount, phone: normalizedPhone, status: 'pending',
      description: 'Wallet top-up',
    }));

    const result = await initiateStkPush({
      amount,
      phone: normalizedPhone,
      description: 'Professional Records — wallet top-up',
      callbackUrl: callbackUrl(),
    });
    if (!result.ok) {
      await this.txnRepo.update(txn.id, { status: 'failed', resultDesc: result.detail });
      throw new BadRequestException(result.detail || 'Could not start the M-Pesa payment. Please try again.');
    }

    await this.txnRepo.update(txn.id, { merchantRequestId: result.merchantRequestId });

    return {
      transactionId: txn.id,
      merchantRequestId: result.merchantRequestId,
      amount,
      message: `STK push sent to ${normalizedPhone}. Enter your M-Pesa PIN to top up KES ${amount}.`,
    };
  }

  // Credits the wallet exactly once for a topup transaction, guarded by only
  // crediting from 'pending' — the webhook and the poll-status fallback can
  // both race to call this for the same transaction.
  private async creditTopUp(txn: PrWalletTransaction, mpesaReceiptNumber?: string) {
    return this.dataSource.transaction(async (manager) => {
      const txnRepo = manager.getRepository(PrWalletTransaction);
      const fresh = await txnRepo.findOne({ where: { id: txn.id } });
      if (!fresh || fresh.status !== 'pending') return; // already settled

      const wallet = await this.findOrCreateWallet(fresh.tenantId, fresh.teacherId, manager);
      const balanceAfter = Number(wallet.balance) + Number(fresh.amount);
      await manager.getRepository(PrWallet).update(wallet.id, { balance: balanceAfter });
      await txnRepo.update(fresh.id, { status: 'paid', mpesaReceiptNumber, balanceAfter });
    });
  }

  // ── WEBHOOK (Tuma calls this — no auth) ───────────────────
  async handleCallback(body: any): Promise<void> {
    const parsed = parseTumaCallback(body);
    if (!parsed.merchantRequestId) {
      this.logger.warn(`Tuma callback with no merchant_request_id: ${JSON.stringify(body).slice(0, 500)}`);
      return;
    }
    const txn = await this.txnRepo.findOne({ where: { merchantRequestId: parsed.merchantRequestId } });
    if (!txn) return;

    if (parsed.success) {
      await this.creditTopUp(txn, parsed.mpesaReceipt);
    } else {
      await this.txnRepo.update(txn.id, { status: 'failed' });
    }
  }

  // ── POLL STATUS ────────────────────────────────────────────
  // Also actively re-checks with Tuma in case its webhook never arrives.
  async getTopUpStatus(tenantId: string, teacherId: string, id: string) {
    const txn = await this.txnRepo.findOne({ where: { id, tenantId, teacherId, type: 'topup' } });
    if (!txn) throw new BadRequestException('Top-up not found.');
    if (txn.status !== 'pending' || !txn.merchantRequestId) {
      return { status: txn.status, transactionId: txn.id };
    }

    const result = await checkPaymentStatus(txn.merchantRequestId);
    if (result.ok && result.status && /success|completed/i.test(result.status)) {
      await this.creditTopUp(txn, result.mpesaReceipt);
      return { status: 'paid', transactionId: txn.id };
    }
    return { status: txn.status, transactionId: txn.id };
  }

  // Cheap read-only pre-check, so callers can fail fast before spending AI
  // tokens on a generation the teacher can't actually afford — the real,
  // race-safe check happens in debit() when the record is actually saved.
  async assertAffordable(tenantId: string, teacherId: string, itemType: PrItemType) {
    const wallet = await this.findOrCreateWallet(tenantId, teacherId);
    const price = ITEM_PRICE_KES[itemType];
    const balance = Number(wallet.balance);
    if (balance < price) {
      throw new BadRequestException(
        `Insufficient wallet balance. ${ITEM_LABEL[itemType]} costs KES ${price}, wallet has KES ${balance}. Top up to continue.`,
      );
    }
  }

  // ── DEBIT FOR A GENERATED ITEM ─────────────────────────────
  // `manager` lets the caller run this inside its own transaction, alongside
  // saving the generated record, so a failed save never leaves a stray debit.
  async debit(
    tenantId: string, teacherId: string, itemType: PrItemType,
    referenceId?: string, manager?: EntityManager,
  ) {
    const run = async (m: EntityManager) => {
      const walletRepo = m.getRepository(PrWallet);
      // Lock the row so two concurrent generations can't both read the same
      // balance and both succeed when only one item is actually affordable.
      const rows = await m.query(
        `SELECT * FROM pr_wallets WHERE tenant_id = $1 AND teacher_id = $2 FOR UPDATE`,
        [tenantId, teacherId],
      );
      let wallet: PrWallet = rows[0];
      if (!wallet) wallet = await walletRepo.save(walletRepo.create({ tenantId, teacherId, balance: 0 }));

      const price = ITEM_PRICE_KES[itemType];
      const balance = Number(wallet.balance);
      if (balance < price) {
        throw new BadRequestException(
          `Insufficient wallet balance. ${ITEM_LABEL[itemType]} costs KES ${price}, wallet has KES ${balance}. Top up to continue.`,
        );
      }

      const balanceAfter = balance - price;
      await walletRepo.update(wallet.id, { balance: balanceAfter });
      await m.getRepository(PrWalletTransaction).save(m.getRepository(PrWalletTransaction).create({
        tenantId, teacherId, type: 'debit', amount: price, balanceAfter,
        description: ITEM_LABEL[itemType], referenceType: itemType, referenceId, status: 'completed',
      }));

      // Referral bonus: only on this teacher's very first-ever debit (this row we
      // just inserted), so a referral only pays out once real money changed hands.
      // The referee's wallet row is locked for the whole transaction (see the
      // SELECT ... FOR UPDATE above), so this count is race-safe per referee.
      const priorDebits = await m.getRepository(PrWalletTransaction).count({ where: { tenantId, teacherId, type: 'debit' } });
      if (priorDebits === 1) {
        const referee = await m.getRepository(User).findOne({ where: { id: teacherId } });
        if (referee?.referredBy) await this.creditReferralBonus(referee.referredBy, teacherId, m);
      }
    };

    if (manager) return run(manager);
    return this.dataSource.transaction(run);
  }

  // Credits the referrer's wallet once for a given referee — the partial unique
  // index on (reference_id) WHERE reference_type='referral' is the real guard
  // against double-crediting; inserting the transaction row before touching the
  // balance means a duplicate attempt fails before any money moves.
  private async creditReferralBonus(referrerId: string, refereeId: string, manager: EntityManager) {
    const referrer = await manager.getRepository(User).findOne({ where: { id: referrerId } });
    if (!referrer?.tenantId) return;

    const wallet = await this.findOrCreateWallet(referrer.tenantId, referrerId, manager);
    try {
      await manager.getRepository(PrWalletTransaction).save(manager.getRepository(PrWalletTransaction).create({
        tenantId: referrer.tenantId, teacherId: referrerId, type: 'topup', amount: REFERRAL_BONUS_KES,
        balanceAfter: Number(wallet.balance) + REFERRAL_BONUS_KES,
        description: 'Referral bonus — your referral generated their first item',
        referenceType: 'referral', referenceId: refereeId, status: 'paid',
      }));
    } catch (err: any) {
      if (err?.code === '23505') return; // already credited for this referee
      throw err;
    }
    await manager.getRepository(PrWallet).update(wallet.id, { balance: Number(wallet.balance) + REFERRAL_BONUS_KES });
  }
}
