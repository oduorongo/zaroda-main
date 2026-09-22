-- ============================================================
-- MODULE 69: Opening balances, so the final books can be carried forward
--
-- financial_years has existed since migration 004 but nothing has ever used it.
-- The accounting reports ran over every transaction a tenant had ever recorded
-- and opened from nil, which means they could show a school its first year and
-- nothing after: a second year's books need the first year's closing cash and
-- bank brought forward as its opening balance.
-- ============================================================

-- The table is declared in 004, but 004 aborts partway on databases built from
-- the TypeORM entities, so it is not assumed to exist.
CREATE TABLE IF NOT EXISTS financial_years (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year_label    VARCHAR(9)  NOT NULL,
  start_date    DATE        NOT NULL,
  end_date      DATE        NOT NULL,
  is_current    BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, year_label)
);

-- Cash in hand and at bank at the first day of the year. Held on the year
-- itself rather than in a separate table: there is exactly one opening position
-- per year, and splitting it across two tables invites them to disagree.
ALTER TABLE financial_years ADD COLUMN IF NOT EXISTS opening_cash NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE financial_years ADD COLUMN IF NOT EXISTS opening_bank NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Records that the opening figures were carried from the prior year's close
-- rather than typed in, which is what an auditor asks about first.
ALTER TABLE financial_years ADD COLUMN IF NOT EXISTS opening_source   TEXT;
ALTER TABLE financial_years ADD COLUMN IF NOT EXISTS opening_set_at   TIMESTAMPTZ;
ALTER TABLE financial_years ADD COLUMN IF NOT EXISTS opening_set_by   UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_financial_years_tenant ON financial_years(tenant_id, start_date DESC);

-- Only one year can be current per tenant. Enforced rather than left to the
-- application, because two current years makes every report ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_years_one_current
  ON financial_years(tenant_id) WHERE is_current;

-- Give every tenant a current year to post into, spanning the Kenyan school
-- calendar year, so the books have a period the day this ships. Opening
-- balances stay nil: a real figure is the school's to enter.
INSERT INTO financial_years (tenant_id, year_label, start_date, end_date, is_current)
SELECT t.id,
       to_char(CURRENT_DATE, 'YYYY'),
       date_trunc('year', CURRENT_DATE)::date,
       (date_trunc('year', CURRENT_DATE) + INTERVAL '1 year - 1 day')::date,
       TRUE
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM financial_years f WHERE f.tenant_id = t.id)
ON CONFLICT (tenant_id, year_label) DO NOTHING;
