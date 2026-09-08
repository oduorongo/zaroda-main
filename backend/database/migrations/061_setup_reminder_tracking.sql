-- ============================================================
-- Tracks automatic onboarding-reminder emails (see scripts/send-onboarding-
-- reminders.js, run daily by the zaroda-onboarding-reminders cron service) so
-- the same incomplete-setup school isn't re-emailed every single day forever.
-- ============================================================
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS last_setup_reminder_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS setup_reminder_count INT NOT NULL DEFAULT 0;
