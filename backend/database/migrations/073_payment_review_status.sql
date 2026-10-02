-- ============================================================
-- MODULE 73: 'review' status for payments the gateway disputes
--
-- Payment callbacks no longer settle anything by themselves: the gateway is asked
-- to confirm each payment, for the amount we stored when the push was created.
-- When it reports success for a different amount, the transaction is parked as
-- 'review' for a person to look at instead of being credited.
--
-- Constraints only — no row is changed. NOT VALID so existing rows are not
-- re-checked; the rule applies to every insert/update from here on.
-- (subscription_payments.status is plain text with no check, so needs nothing.)
-- ============================================================

ALTER TABLE mpesa_transactions DROP CONSTRAINT IF EXISTS mpesa_transactions_status_check;
ALTER TABLE mpesa_transactions ADD CONSTRAINT mpesa_transactions_status_check
  CHECK (status IN ('pending','completed','failed','cancelled','matched','unmatched','unverified','review')) NOT VALID;

ALTER TABLE pr_wallet_transactions DROP CONSTRAINT IF EXISTS pr_wallet_transactions_status_check;
ALTER TABLE pr_wallet_transactions ADD CONSTRAINT pr_wallet_transactions_status_check
  CHECK (status IN ('pending','paid','failed','completed','review')) NOT VALID;

ALTER TABLE sms_wallet_transactions DROP CONSTRAINT IF EXISTS sms_wallet_transactions_status_check;
ALTER TABLE sms_wallet_transactions ADD CONSTRAINT sms_wallet_transactions_status_check
  CHECK (status IN ('pending','paid','failed','completed','review')) NOT VALID;
