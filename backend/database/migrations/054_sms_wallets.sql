-- ============================================================
-- SMS wallet: a per-tenant (school) wallet billed per message sent through
-- Communication (announcements, fee reminders). Tops up via Tuma M-Pesa STK
-- push, same pattern as the Professional Records wallet — see 045_pr_wallets.sql.
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE,
  balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('topup', 'debit')),
  amount NUMERIC(10,2) NOT NULL,
  sms_count INT,
  balance_after NUMERIC(10,2),
  description TEXT,
  reference_type VARCHAR(30),
  reference_id VARCHAR(100),
  phone VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'paid', 'failed', 'completed')),
  merchant_request_id VARCHAR(100),
  mpesa_receipt_number VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_wallet_txn_tenant ON sms_wallet_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_wallet_txn_merchant ON sms_wallet_transactions(merchant_request_id);
