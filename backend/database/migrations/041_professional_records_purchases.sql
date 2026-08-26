-- ============================================================
-- Professional Records: pay-per-flow purchases
-- A teacher pays a fixed fee once, which unlocks generating one
-- Scheme of Work plus every lesson plan and lesson notes record
-- generated from it. No subscription — a flat one-off charge per
-- scheme, settled via M-Pesa STK push, independent of the tenant's
-- own subscription/trial state.
-- ============================================================
CREATE TABLE IF NOT EXISTS pr_purchases (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  teacher_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheme_id             UUID REFERENCES schemes_of_work(id) ON DELETE SET NULL,

  amount                NUMERIC(10,2) NOT NULL DEFAULT 50,
  phone                 VARCHAR(15),

  checkout_request_id   VARCHAR(100),
  merchant_request_id   VARCHAR(100),
  mpesa_receipt_number  VARCHAR(50),

  status                VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','paid','consumed','failed')),
  result_desc           TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pr_purchases_teacher   ON pr_purchases(teacher_id);
CREATE INDEX IF NOT EXISTS idx_pr_purchases_checkout  ON pr_purchases(checkout_request_id);
CREATE INDEX IF NOT EXISTS idx_pr_purchases_status    ON pr_purchases(tenant_id, teacher_id, status);

DO $$ BEGIN
  ALTER TABLE pr_purchases ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation ON pr_purchases USING (tenant_id = current_setting('app.tenant_id')::UUID);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_pr_purchases_updated_at BEFORE UPDATE ON pr_purchases
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
