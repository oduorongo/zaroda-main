-- ============================================================
-- ZARODA SCHOOL MANAGEMENT SYSTEM
-- MODULE 03: Finance — Database Schema
-- Covers: Fee Structures · Invoices · Payments · MPESA
--         Payroll · Expenses · Cashbook · Ledger
--         FPE/FDJSE/FDSSE Government Funds (Kenya Handbook)
--         Scholarships · Debtor Tracking · Budgets
-- Depends on: Module 01 (tenants, schools, users)
--             Module 02 (learners, streams)
-- ============================================================

-- ============================================================
-- 1. FINANCIAL YEARS & TERMS
-- ============================================================
CREATE TABLE financial_years (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year_label    VARCHAR(9)  NOT NULL,           -- "2025/2026"
  start_date    DATE        NOT NULL,
  end_date      DATE        NOT NULL,
  is_current    BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, year_label)
);

CREATE TABLE school_terms (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  financial_year_id UUID NOT NULL REFERENCES financial_years(id),
  term_label      VARCHAR(10) NOT NULL CHECK (term_label IN ('term_1','term_2','term_3')),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  is_current      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(financial_year_id, term_label)
);

-- ============================================================
-- 2. FEE STRUCTURES
-- ============================================================
CREATE TABLE fee_structures (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,         -- "Grade 4-6 Day Scholar 2025/2026"
  grade_band      VARCHAR(20)  NOT NULL
                  CHECK (grade_band IN ('ecde','primary','junior','senior')),
  academic_year   VARCHAR(9)   NOT NULL,
  category        VARCHAR(20)  NOT NULL DEFAULT 'day'
                  CHECK (category IN ('day','boarding','day_boarding')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE fee_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fee_structure_id  UUID NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,       -- "Tuition Fee", "Activity Fee", "Transport Fee"
  fee_type          VARCHAR(30)  NOT NULL
                    CHECK (fee_type IN (
                      'tuition','activity','transport','boarding','meals',
                      'uniform','pta','development','exam','caution','other'
                    )),
  term              VARCHAR(10)  NOT NULL CHECK (term IN ('term_1','term_2','term_3','annual')),
  amount            NUMERIC(12,2) NOT NULL,
  is_mandatory      BOOLEAN NOT NULL DEFAULT true,
  is_refundable     BOOLEAN NOT NULL DEFAULT false,
  instalment_allowed BOOLEAN NOT NULL DEFAULT true,
  description       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. LEARNER FEE ACCOUNTS (one per learner per term)
-- ============================================================
CREATE TABLE learner_fee_accounts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id        UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  fee_structure_id  UUID NOT NULL REFERENCES fee_structures(id),
  academic_year     VARCHAR(9)  NOT NULL,
  term              VARCHAR(10) NOT NULL CHECK (term IN ('term_1','term_2','term_3')),

  -- Charges
  total_billed      NUMERIC(12,2) NOT NULL DEFAULT 0,
  discounts         NUMERIC(12,2) NOT NULL DEFAULT 0,
  scholarship_credit NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_payable       NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Payments
  total_paid        NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_due       NUMERIC(12,2) GENERATED ALWAYS AS (net_payable - total_paid) STORED,
  overpayment       NUMERIC(12,2) GENERATED ALWAYS AS (GREATEST(total_paid - net_payable, 0)) STORED,

  status            VARCHAR(20) NOT NULL DEFAULT 'unpaid'
                    CHECK (status IN ('unpaid','partial','paid','overpaid','waived')),
  due_date          DATE,
  notes             TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(learner_id, academic_year, term)
);

-- ============================================================
-- 4. SCHOOL INVOICES (per learner per term)
-- ============================================================
CREATE TABLE school_invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  fee_account_id  UUID NOT NULL REFERENCES learner_fee_accounts(id),
  invoice_number  VARCHAR(30) UNIQUE NOT NULL,   -- SCH-2025-00001
  academic_year   VARCHAR(9)  NOT NULL,
  term            VARCHAR(10) NOT NULL,
  amount          NUMERIC(12,2) NOT NULL,
  discount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(12,2) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'unpaid'
                  CHECK (status IN ('unpaid','partial','paid','void','waived')),
  due_date        DATE NOT NULL,
  issued_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  issued_by       UUID REFERENCES users(id),
  notes           TEXT,
  line_items      JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. PAYMENTS (fee receipts)
-- ============================================================
CREATE TABLE fee_payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  invoice_id      UUID REFERENCES school_invoices(id),
  fee_account_id  UUID REFERENCES learner_fee_accounts(id),

  receipt_number  VARCHAR(30) UNIQUE NOT NULL,   -- RCP-2025-00001
  amount          NUMERIC(12,2) NOT NULL,
  payment_method  VARCHAR(20) NOT NULL
                  CHECK (payment_method IN ('mpesa','bank','cash','cheque','scholarship','discount')),
  academic_year   VARCHAR(9)  NOT NULL,
  term            VARCHAR(10) NOT NULL,
  payment_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- M-Pesa specific
  mpesa_ref         VARCHAR(30),                 -- e.g. QKJ4XG2Z1P
  mpesa_phone       VARCHAR(20),
  mpesa_confirmed   BOOLEAN DEFAULT false,

  -- Bank specific
  bank_name         VARCHAR(100),
  bank_ref          VARCHAR(50),
  bank_slip_no      VARCHAR(50),

  -- Cheque specific
  cheque_number     VARCHAR(30),
  cheque_bank       VARCHAR(100),

  narration         TEXT,
  received_by       UUID REFERENCES users(id),
  reversed          BOOLEAN NOT NULL DEFAULT false,
  reversed_by       UUID REFERENCES users(id),
  reversed_at       TIMESTAMPTZ,
  reversal_reason   TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. MPESA DARAJA TRANSACTIONS (STK Push / C2B callbacks)
-- ============================================================
CREATE TABLE mpesa_transactions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  checkout_request_id VARCHAR(100) UNIQUE,        -- from STK push
  merchant_request_id VARCHAR(100),
  mpesa_receipt_number VARCHAR(30),
  phone_number        VARCHAR(20),
  amount              NUMERIC(12,2),
  account_reference   VARCHAR(50),                -- learner admission number
  transaction_desc    TEXT,
  result_code         INTEGER,
  result_desc         TEXT,
  transaction_date    TIMESTAMPTZ,
  status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','completed','failed','cancelled')),
  matched_payment_id  UUID REFERENCES fee_payments(id),
  raw_callback        JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. SCHOLARSHIPS & SPONSORSHIPS
-- ============================================================
CREATE TABLE scholarships (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  sponsor_name    VARCHAR(255),
  sponsor_contact VARCHAR(255),
  type            VARCHAR(20) NOT NULL CHECK (type IN ('full','partial','conditional')),
  coverage_pct    NUMERIC(5,2),                   -- e.g. 50.00 for 50%
  fixed_amount    NUMERIC(12,2),                  -- or fixed amount per term
  applicable_fees VARCHAR(30)[] DEFAULT '{}',     -- fee_types covered
  academic_year   VARCHAR(9),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE learner_scholarships (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id     UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  scholarship_id UUID NOT NULL REFERENCES scholarships(id),
  academic_year  VARCHAR(9)  NOT NULL,
  start_term     VARCHAR(10) NOT NULL,
  end_term       VARCHAR(10),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  notes          TEXT,
  approved_by    UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(learner_id, scholarship_id, academic_year)
);

-- ============================================================
-- 8. EXPENSES (school expenditure)
-- ============================================================
CREATE TABLE expense_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(150) NOT NULL,
  code        VARCHAR(20),
  parent_id   UUID REFERENCES expense_categories(id),
  fund_type   VARCHAR(20)  CHECK (fund_type IN ('fpe','fdjse','fdsse','school_own','donor',NULL)),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE expenses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  category_id     UUID NOT NULL REFERENCES expense_categories(id),
  expense_number  VARCHAR(30) UNIQUE NOT NULL,     -- EXP-2025-00001
  description     TEXT NOT NULL,
  amount          NUMERIC(12,2) NOT NULL,
  expense_date    DATE NOT NULL,
  academic_year   VARCHAR(9)  NOT NULL,
  term            VARCHAR(10) NOT NULL,
  fund_source     VARCHAR(20) NOT NULL DEFAULT 'school_own'
                  CHECK (fund_source IN ('fpe','fdjse','fdsse','school_own','donor','pta')),
  payment_method  VARCHAR(20) CHECK (payment_method IN ('cash','bank','mpesa','cheque')),
  supplier_name   VARCHAR(255),
  lpo_number      VARCHAR(30),                     -- Local Purchase Order
  receipt_number  VARCHAR(30),
  voucher_number  VARCHAR(30),                     -- Payment Voucher
  approved_by     UUID REFERENCES users(id),
  paid_by         UUID REFERENCES users(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','approved','paid','rejected','cancelled')),
  attachment_url  TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- ============================================================
-- 9. GOVERNMENT FUNDS — FPE / FDJSE / FDSSE
-- Kenya: Free Primary Education / Free Day JSE / Free Day SSE
-- As per Handbook on Financial Management for Public Schools
-- ============================================================
CREATE TABLE government_fund_receipts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  fund_type       VARCHAR(10) NOT NULL CHECK (fund_type IN ('fpe','fdjse','fdsse')),
  academic_year   VARCHAR(9)  NOT NULL,
  term            VARCHAR(10) NOT NULL,
  amount_expected NUMERIC(12,2) NOT NULL,          -- based on enrolled learner count × capitation
  amount_received NUMERIC(12,2) NOT NULL DEFAULT 0,
  receipt_date    DATE,
  treasury_ref    VARCHAR(50),                     -- Treasury/CBA reference
  bank_ref        VARCHAR(50),
  enrolled_count  INTEGER,                         -- learners at time of capitation
  capitation_rate NUMERIC(8,2),                    -- per-learner rate (e.g. KES 1,420 FPE)
  notes           TEXT,
  received_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FPE/FDJSE/FDSSE expenditure (tracked separately per fund)
CREATE TABLE government_fund_expenditures (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  fund_type       VARCHAR(10) NOT NULL CHECK (fund_type IN ('fpe','fdjse','fdsse')),
  fund_receipt_id UUID REFERENCES government_fund_receipts(id),
  academic_year   VARCHAR(9)  NOT NULL,
  term            VARCHAR(10) NOT NULL,
  -- Kenya Handbook vote heads
  vote_head       VARCHAR(50) NOT NULL,            -- see vote_head constraints below
  vote_head_code  VARCHAR(10),
  description     TEXT NOT NULL,
  amount          NUMERIC(12,2) NOT NULL,
  expenditure_date DATE NOT NULL,
  voucher_number  VARCHAR(30),
  payee_name      VARCHAR(255),
  approved_by     UUID REFERENCES users(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'approved'
                  CHECK (status IN ('draft','approved','paid')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fpe_vote_head CHECK (
    fund_type != 'fpe' OR vote_head IN (
      'Instructional Materials','Curricular Activities',
      'Professional Development','Infrastructure & Maintenance',
      'Health Services','School Management'
    )
  ),
  CONSTRAINT fdjse_vote_head CHECK (
    fund_type != 'fdjse' OR vote_head IN (
      'Instructional Materials','Assessment & Examinations',
      'Curricular Activities','School Management',
      'Infrastructure & Maintenance','Professional Development'
    )
  ),
  CONSTRAINT fdsse_vote_head CHECK (
    fund_type != 'fdsse' OR vote_head IN (
      'Instructional Materials','Assessment & Examinations',
      'Curricular Activities','School Management',
      'Infrastructure & Maintenance','Professional Development',
      'Boarding & Welfare'
    )
  )
);

-- ============================================================
-- 10. PAYROLL
-- ============================================================
CREATE TABLE payroll_periods (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_label  VARCHAR(20) NOT NULL,              -- "January 2025"
  month         SMALLINT    NOT NULL,
  year          SMALLINT    NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','processing','approved','paid','closed')),
  approved_by   UUID REFERENCES users(id),
  paid_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, month, year)
);

CREATE TABLE staff_payroll (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payroll_period_id UUID NOT NULL REFERENCES payroll_periods(id),
  staff_id          UUID NOT NULL REFERENCES users(id),

  -- Earnings
  basic_salary      NUMERIC(12,2) NOT NULL DEFAULT 0,
  house_allowance   NUMERIC(12,2) NOT NULL DEFAULT 0,
  transport_allow   NUMERIC(12,2) NOT NULL DEFAULT 0,
  medical_allow     NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_allowances  NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross_pay         NUMERIC(12,2) GENERATED ALWAYS AS
                    (basic_salary + house_allowance + transport_allow + medical_allow + other_allowances) STORED,

  -- Deductions (Kenya statutory)
  paye              NUMERIC(12,2) NOT NULL DEFAULT 0,   -- PAYE tax (KRA)
  nhif              NUMERIC(12,2) NOT NULL DEFAULT 0,   -- NHIF → SHIF
  nssf              NUMERIC(12,2) NOT NULL DEFAULT 0,   -- NSSF
  housing_levy      NUMERIC(12,2) NOT NULL DEFAULT 0,   -- Affordable Housing Levy 1.5%
  loan_deductions   NUMERIC(12,2) NOT NULL DEFAULT 0,
  sacco_deductions  NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_deductions  NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_deductions  NUMERIC(12,2) GENERATED ALWAYS AS
                    (paye + nhif + nssf + housing_levy + loan_deductions + sacco_deductions + other_deductions) STORED,

  net_pay           NUMERIC(12,2) GENERATED ALWAYS AS
                    (basic_salary + house_allowance + transport_allow + medical_allow + other_allowances
                     - paye - nhif - nssf - housing_levy - loan_deductions - sacco_deductions - other_deductions) STORED,

  payment_method    VARCHAR(20) CHECK (payment_method IN ('bank','mpesa','cash')),
  bank_account      VARCHAR(30),
  payment_ref       VARCHAR(50),
  is_paid           BOOLEAN NOT NULL DEFAULT false,
  paid_at           TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(payroll_period_id, staff_id)
);

-- ============================================================
-- 11. BUDGETS
-- ============================================================
CREATE TABLE budgets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year VARCHAR(9)  NOT NULL,
  term          VARCHAR(10) NOT NULL,
  fund_source   VARCHAR(20) NOT NULL,
  category_id   UUID REFERENCES expense_categories(id),
  vote_head     VARCHAR(100),
  budgeted_amount NUMERIC(12,2) NOT NULL,
  approved_by   UUID REFERENCES users(id),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, academic_year, term, fund_source, category_id)
);

-- ============================================================
-- 12. CASHBOOK (double-entry ledger foundation)
-- ============================================================
CREATE TABLE cashbook_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  entry_date      DATE NOT NULL,
  academic_year   VARCHAR(9)  NOT NULL,
  term            VARCHAR(10) NOT NULL,

  entry_type      VARCHAR(10) NOT NULL CHECK (entry_type IN ('receipt','payment')),
  fund_source     VARCHAR(20) NOT NULL,            -- school_own | fpe | fdjse | fdsse
  account_code    VARCHAR(20),
  description     TEXT NOT NULL,
  reference       VARCHAR(50),                     -- receipt/voucher/cheque number
  payee_payer     VARCHAR(255),

  debit           NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit          NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance         NUMERIC(12,2),                   -- running balance (computed by service)

  linked_payment_id UUID REFERENCES fee_payments(id),
  linked_expense_id UUID REFERENCES expenses(id),
  linked_payroll_id UUID REFERENCES staff_payroll(id),
  linked_fund_id    UUID REFERENCES government_fund_receipts(id),

  entered_by      UUID REFERENCES users(id),
  approved_by     UUID REFERENCES users(id),
  is_reconciled   BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 13. NOTIFICATION REMINDERS (fee SMS)
-- ============================================================
CREATE TABLE fee_reminder_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id  UUID NOT NULL REFERENCES learners(id),
  balance_due NUMERIC(12,2),
  channel     VARCHAR(10) NOT NULL CHECK (channel IN ('sms','whatsapp','email')),
  sent_to     VARCHAR(255),
  message     TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'sent',
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_fee_struct_school     ON fee_structures(school_id, academic_year);
CREATE INDEX idx_fee_account_learner   ON learner_fee_accounts(learner_id);
CREATE INDEX idx_fee_account_year_term ON learner_fee_accounts(academic_year, term);
CREATE INDEX idx_fee_account_status    ON learner_fee_accounts(status);
CREATE INDEX idx_invoice_learner       ON school_invoices(learner_id);
CREATE INDEX idx_invoice_status        ON school_invoices(status);
CREATE INDEX idx_invoice_due_date      ON school_invoices(due_date);
CREATE INDEX idx_payment_learner       ON fee_payments(learner_id);
CREATE INDEX idx_payment_method        ON fee_payments(payment_method);
CREATE INDEX idx_payment_date          ON fee_payments(payment_date DESC);
CREATE INDEX idx_mpesa_receipt         ON mpesa_transactions(mpesa_receipt_number);
CREATE INDEX idx_mpesa_checkout        ON mpesa_transactions(checkout_request_id);
CREATE INDEX idx_mpesa_phone           ON mpesa_transactions(phone_number);
CREATE INDEX idx_expense_date          ON expenses(expense_date DESC);
CREATE INDEX idx_expense_fund          ON expenses(fund_source);
CREATE INDEX idx_expense_status        ON expenses(status);
CREATE INDEX idx_gov_fund_type_year    ON government_fund_receipts(fund_type, academic_year);
CREATE INDEX idx_gov_exp_fund_year     ON government_fund_expenditures(fund_type, academic_year, term);
CREATE INDEX idx_payroll_period        ON staff_payroll(payroll_period_id);
CREATE INDEX idx_payroll_staff         ON staff_payroll(staff_id);
CREATE INDEX idx_cashbook_date         ON cashbook_entries(entry_date DESC);
CREATE INDEX idx_cashbook_fund         ON cashbook_entries(fund_source);
CREATE INDEX idx_budget_year_term      ON budgets(academic_year, term);

-- ============================================================
-- RLS — Tenant Isolation
-- ============================================================
DO $$ DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'financial_years','school_terms','fee_structures','fee_items',
    'learner_fee_accounts','school_invoices','fee_payments','mpesa_transactions',
    'scholarships','learner_scholarships','expense_categories','expenses',
    'government_fund_receipts','government_fund_expenditures',
    'payroll_periods','staff_payroll','budgets','cashbook_entries','fee_reminder_logs'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'')::UUID)',
      tbl
    );
  END LOOP;
END $$;

-- Updated_at triggers
DO $$ DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'fee_structures','learner_fee_accounts','school_invoices',
    'mpesa_transactions','scholarships','expenses',
    'government_fund_receipts','budgets'
  ]) LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      replace(tbl,'-','_'), tbl
    );
  END LOOP;
END $$;

-- ============================================================
-- SEED: Default Expense Categories (Kenya public school)
-- ============================================================
-- Applied per tenant on onboarding via service layer
-- Categories follow Kenya Handbook vote heads:
-- FPE Vote Heads: Instructional Materials, Curricular Activities,
--   Professional Development, Infrastructure & Maintenance,
--   Health Services, School Management
-- FDJSE/FDSSE: same + Assessment & Examinations + Boarding & Welfare
-- Own Funds: Utilities, Cleaning, Security, Bank Charges, etc.
