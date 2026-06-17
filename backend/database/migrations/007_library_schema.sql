-- ============================================================
-- ZARODA SCHOOL MANAGEMENT SYSTEM
-- MODULE 06: Library — Database Schema
-- COMPLETELY FREE — No fines, no charges, no overdue penalties
-- Covers: Book Catalogue · Barcode · Borrowing & Returns
--         Reservations · Inventory · Search
-- ============================================================

CREATE TABLE library_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(150) NOT NULL,
  description TEXT,
  parent_id   UUID REFERENCES library_categories(id),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

CREATE TABLE library_books (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  category_id      UUID REFERENCES library_categories(id),

  -- Identification
  isbn             VARCHAR(20),
  barcode          VARCHAR(50) UNIQUE,           -- e.g. ZARLIB20250001
  accession_number VARCHAR(20) UNIQUE,           -- e.g. LIB-2025-0001

  -- Bibliographic
  title            VARCHAR(500) NOT NULL,
  author           VARCHAR(500) NOT NULL,
  publisher        VARCHAR(255),
  edition          VARCHAR(50),
  publication_year SMALLINT,
  subject          VARCHAR(255),                 -- matches CBC learning area
  grade_level      VARCHAR(20),                  -- target grade
  language         VARCHAR(30) DEFAULT 'English',
  pages            SMALLINT,
  description      TEXT,
  cover_url        TEXT,

  -- Inventory
  total_copies     SMALLINT NOT NULL DEFAULT 1,
  available_copies SMALLINT NOT NULL DEFAULT 1,
  copies_on_loan   SMALLINT NOT NULL DEFAULT 0,
  copies_damaged   SMALLINT NOT NULL DEFAULT 0,
  copies_lost      SMALLINT NOT NULL DEFAULT 0,

  -- Acquisition
  purchase_date    DATE,
  purchase_price   NUMERIC(10,2),
  donor_name       VARCHAR(255),
  acquisition_type VARCHAR(20) DEFAULT 'purchased'
                   CHECK (acquisition_type IN ('purchased','donated','transferred','government')),

  -- Status
  status           VARCHAR(20) NOT NULL DEFAULT 'available'
                   CHECK (status IN ('available','all_on_loan','decommissioned','lost')),
  location         VARCHAR(100),                 -- shelf/section reference
  is_reference     BOOLEAN NOT NULL DEFAULT false, -- reference books cannot leave library
  is_active        BOOLEAN NOT NULL DEFAULT true,

  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

-- Individual physical copy tracking
CREATE TABLE library_copies (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  book_id      UUID NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
  copy_number  SMALLINT NOT NULL,
  barcode      VARCHAR(50) UNIQUE,
  condition    VARCHAR(20) NOT NULL DEFAULT 'good'
               CHECK (condition IN ('new','good','fair','poor','damaged','lost')),
  is_available BOOLEAN NOT NULL DEFAULT true,
  current_loan_id UUID,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── BORROWING — NO FINES, NO CHARGES ─────────────────────────
-- The library is a completely free service.
-- Late returns are tracked only for librarian awareness (reminders only).
-- No money is collected. No penalties are applied.
CREATE TABLE library_loans (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  book_id       UUID NOT NULL REFERENCES library_books(id),
  copy_id       UUID REFERENCES library_copies(id),
  borrower_id   UUID NOT NULL REFERENCES users(id),
  borrower_type VARCHAR(10) NOT NULL CHECK (borrower_type IN ('learner','teacher','staff')),
  issued_by     UUID REFERENCES users(id),

  issue_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date      DATE NOT NULL,
  return_date   DATE,

  -- Status — 'overdue' is informational only, triggers a reminder, not a charge
  status        VARCHAR(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','returned','overdue','lost','renewed')),
  renewals_count SMALLINT NOT NULL DEFAULT 0,
  max_renewals  SMALLINT NOT NULL DEFAULT 2,

  -- Condition on return (for librarian record only)
  return_condition VARCHAR(20) CHECK (return_condition IN ('good','fair','poor','damaged','lost')),
  return_notes  TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FK back to copies
ALTER TABLE library_copies ADD CONSTRAINT fk_copy_current_loan
  FOREIGN KEY (current_loan_id) REFERENCES library_loans(id) ON DELETE SET NULL;

-- ── RESERVATIONS ──────────────────────────────────────────────
CREATE TABLE library_reservations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  book_id      UUID NOT NULL REFERENCES library_books(id),
  borrower_id  UUID NOT NULL REFERENCES users(id),
  reserved_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','fulfilled','cancelled','expired')),
  notified     BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── LIBRARY SETTINGS — NO FINE FIELDS ─────────────────────────
CREATE TABLE library_settings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  loan_period_days  SMALLINT NOT NULL DEFAULT 14,
  max_books_learner SMALLINT NOT NULL DEFAULT 3,
  max_books_teacher SMALLINT NOT NULL DEFAULT 5,
  grace_period_days SMALLINT NOT NULL DEFAULT 2,       -- days before reminder sent
  reservation_expiry_hours SMALLINT NOT NULL DEFAULT 72,
  allow_renewals    BOOLEAN NOT NULL DEFAULT true,
  max_renewals      SMALLINT NOT NULL DEFAULT 2,
  send_due_reminder BOOLEAN NOT NULL DEFAULT true,
  reminder_days_before SMALLINT NOT NULL DEFAULT 2,
  -- No fine fields — library is completely free
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, school_id)
);

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX idx_books_tenant        ON library_books(tenant_id, is_active);
CREATE INDEX idx_books_barcode       ON library_books(barcode);
CREATE INDEX idx_books_accession     ON library_books(accession_number);
CREATE INDEX idx_books_isbn          ON library_books(isbn);
CREATE INDEX idx_books_title         ON library_books USING gin(to_tsvector('english', title));
CREATE INDEX idx_books_author        ON library_books USING gin(to_tsvector('english', author));
CREATE INDEX idx_books_subject       ON library_books(subject);
CREATE INDEX idx_books_grade         ON library_books(grade_level);
CREATE INDEX idx_books_status        ON library_books(status);
CREATE INDEX idx_copies_book         ON library_copies(book_id);
CREATE INDEX idx_copies_barcode      ON library_copies(barcode);
CREATE INDEX idx_loans_borrower      ON library_loans(borrower_id);
CREATE INDEX idx_loans_book          ON library_loans(book_id);
CREATE INDEX idx_loans_status        ON library_loans(status);
CREATE INDEX idx_loans_due_date      ON library_loans(due_date) WHERE status = 'active';
CREATE INDEX idx_reservations_book   ON library_reservations(book_id, status);
CREATE INDEX idx_reservations_user   ON library_reservations(borrower_id);

-- ── RLS ───────────────────────────────────────────────────────
DO $$ DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'library_categories','library_books','library_copies',
    'library_loans','library_reservations','library_settings'
  ]) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'')::UUID)',
      tbl
    );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

DO $$ DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['library_books','library_copies','library_loans','library_settings']) LOOP
    BEGIN
      EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      replace(tbl,'-','_'), tbl
    );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;
