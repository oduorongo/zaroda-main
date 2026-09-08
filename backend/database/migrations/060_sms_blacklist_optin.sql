-- ============================================================
-- Track confirmed opt-in on blacklisted numbers, per Africa's Talking support's
-- own guidance: UserInBlacklist (406) means the subscriber opted out on the
-- telco side (dial *456*9# -> 5 Marketing messages -> Activate all promo
-- messages to opt back in). Retrying blind wastes sends, so once an admin has
-- actually confirmed with the guardian/parent that they've re-activated, we
-- flag it here and stop treating that number as blocked.
-- ============================================================
ALTER TABLE sms_blacklist ADD COLUMN IF NOT EXISTS opted_in_confirmed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sms_blacklist ADD COLUMN IF NOT EXISTS opted_in_confirmed_at TIMESTAMPTZ;
ALTER TABLE sms_blacklist ADD COLUMN IF NOT EXISTS opted_in_confirmed_by UUID;
