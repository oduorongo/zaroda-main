-- ============================================================
-- Professional Records referral rewards: a teacher who refers another
-- teacher gets a flat KES 30 wallet credit (one free scheme) the first
-- time the referred teacher actually pays for a generation — not on
-- signup, so a throwaway account costs the abuser real money to trigger.
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- pr_wallet_transactions already supports arbitrary type/reference_type values —
-- 'referral_bonus' rows use type='topup' (it's a credit) and reference_type=
-- 'referral' with reference_id = the referred teacher's user id, so a partial
-- unique index enforces "at most one bonus per referred teacher" without a new table.
CREATE UNIQUE INDEX IF NOT EXISTS pr_wallet_txn_one_referral_bonus_per_referee
  ON pr_wallet_transactions (reference_id)
  WHERE reference_type = 'referral';
