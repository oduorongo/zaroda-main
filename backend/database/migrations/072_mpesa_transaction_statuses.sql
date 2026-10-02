-- ============================================================
-- MODULE 72: Let mpesa_transactions hold every status the app writes
--
-- 004 created mpesa_transactions with CHECK (status IN ('pending','completed',
-- 'failed','cancelled')), but reconciliation also writes 'matched' and
-- 'unmatched', and an unauthenticated C2B confirmation is now kept as
-- 'unverified' (stored for the record, never applied to a learner's balance).
-- Those writes were being rejected by the old check.
--
-- Constraint only — no row is changed. NOT VALID so existing rows are not
-- re-checked; the rule applies to every insert/update from here on.
-- ============================================================

ALTER TABLE mpesa_transactions DROP CONSTRAINT IF EXISTS mpesa_transactions_status_check;

ALTER TABLE mpesa_transactions ADD CONSTRAINT mpesa_transactions_status_check
  CHECK (status IN ('pending','completed','failed','cancelled','matched','unmatched','unverified')) NOT VALID;
