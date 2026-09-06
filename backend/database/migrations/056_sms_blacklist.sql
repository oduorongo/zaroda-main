-- ============================================================
-- SMS blacklist: numbers Africa's Talking has told us are opted out of
-- promotional SMS (status "UserInBlacklist", statusCode 406). A telco-level
-- block can't be worked around — the number itself can never be warned by
-- SMS, so we track it here and warn admins in-app *before* they send to it
-- again, instead of silently wasting a send on it every time.
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_blacklist (
  phone_number VARCHAR(20) PRIMARY KEY,
  status_code INT,
  status_text VARCHAR(50),
  first_flagged_at TIMESTAMPTZ DEFAULT NOW(),
  last_flagged_at TIMESTAMPTZ DEFAULT NOW(),
  flagged_count INT NOT NULL DEFAULT 1
);
