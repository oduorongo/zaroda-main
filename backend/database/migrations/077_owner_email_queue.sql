-- Owner bulk email goes out through a queue so it fits the provider's daily cap
-- (Resend free tier: 100/day). A job sends what the rolling 24-hour allowance permits.
CREATE TABLE IF NOT EXISTS owner_email_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID REFERENCES owner_broadcasts(id) ON DELETE CASCADE,
  email        VARCHAR(255) NOT NULL,
  subject      VARCHAR(255) NOT NULL,
  html         TEXT NOT NULL,
  text_body    TEXT,
  status       VARCHAR(12) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  attempts     INT NOT NULL DEFAULT 0,
  detail       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_owner_email_queue_status    ON owner_email_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_owner_email_queue_sent_at   ON owner_email_queue(sent_at) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS idx_owner_email_queue_broadcast ON owner_email_queue(broadcast_id);

