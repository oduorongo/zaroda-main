-- ============================================================
-- Professional Records: wallet-based per-item billing
-- Replaces the pay-per-flow / tiered purchase model (never went live —
-- no ANTHROPIC_API_KEY was configured in production yet) with a wallet
-- a teacher tops up via M-Pesa STK push, then spends per item generated:
--   Scheme of Work  = KES 30 (once per scheme, e.g. per subject/term)
--   Lesson Plan     = KES 2 (each)
--   Lesson Notes    = KES 2 (each)
-- ============================================================
DROP TABLE IF EXISTS pr_purchases;

CREATE TABLE IF NOT EXISTS pr_wallets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  teacher_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance     NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, teacher_id)
);

CREATE TABLE IF NOT EXISTS pr_wallet_transactions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  teacher_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  type                  VARCHAR(10) NOT NULL CHECK (type IN ('topup','debit')),
  amount                NUMERIC(10,2) NOT NULL,
  balance_after         NUMERIC(10,2),
  description           TEXT,
  reference_type        VARCHAR(20),
  reference_id          UUID,

  phone                 VARCHAR(15),
  checkout_request_id   VARCHAR(100),
  merchant_request_id   VARCHAR(100),
  mpesa_receipt_number  VARCHAR(50),

  status                VARCHAR(20) NOT NULL DEFAULT 'completed'
                        CHECK (status IN ('pending','paid','failed','completed')),
  result_desc           TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pr_wallets_teacher     ON pr_wallets(tenant_id, teacher_id);
CREATE INDEX IF NOT EXISTS idx_pr_wallet_txn_teacher  ON pr_wallet_transactions(tenant_id, teacher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pr_wallet_txn_merchant ON pr_wallet_transactions(merchant_request_id);

DO $$ BEGIN
  ALTER TABLE pr_wallets ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation ON pr_wallets USING (tenant_id = current_setting('app.tenant_id')::UUID);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE pr_wallet_transactions ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation ON pr_wallet_transactions USING (tenant_id = current_setting('app.tenant_id')::UUID);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_pr_wallets_updated_at BEFORE UPDATE ON pr_wallets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_pr_wallet_txn_updated_at BEFORE UPDATE ON pr_wallet_transactions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
