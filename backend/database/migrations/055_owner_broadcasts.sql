-- ============================================================
-- Owner broadcast history: the platform-owner's Communication page (send to
-- school admins / all users / incomplete-setup schools) had no persisted
-- record at all — every send vanished the moment the toast disappeared, with
-- no way to review what was sent or retry a partial failure.
-- ============================================================
CREATE TABLE IF NOT EXISTS owner_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audience VARCHAR(20) NOT NULL,
  title VARCHAR(255),
  message TEXT NOT NULL,
  channel VARCHAR(10) NOT NULL CHECK (channel IN ('sms', 'email')),
  recipient_count INT NOT NULL DEFAULT 0,
  sent INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  failed_numbers TEXT[],
  detail TEXT,
  sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_owner_broadcasts_created ON owner_broadcasts(created_at DESC);
