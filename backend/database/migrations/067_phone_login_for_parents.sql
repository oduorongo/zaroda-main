-- Let parents log in by phone number when they have no email on record.
--
-- users.email was NOT NULL, so a parent with no email address could never get a login row
-- at all — the app silently skipped creating one. Email stays the login identifier for every
-- other role (teachers, HOI, bursar, ...); this only frees parents from requiring it. Phone
-- becomes a second login identifier, so it must be unique across all users — otherwise two
-- accounts could collide on the same number and login couldn't tell them apart.

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- A blank string isn't "no phone" — treat it the same as NULL so it doesn't fight the
-- uniqueness check below (many legacy rows have '' rather than a real NULL).
UPDATE users SET phone = NULL WHERE phone IS NOT NULL AND btrim(phone) = '';

-- Existing rows were entered free-form (some with spaces, some missing the country code),
-- so two rows can already describe the same number differently and collide once compared
-- as-is. Only add the uniqueness guarantee once the data is actually clean, same pattern as
-- migration 065's email cleanup — report and skip rather than fail the whole migration.
DO $$
DECLARE colliding int := 0; rec record;
BEGIN
  FOR rec IN
    SELECT phone, count(*) AS n FROM users WHERE phone IS NOT NULL GROUP BY 1 HAVING count(*) > 1
  LOOP
    colliding := colliding + 1;
    RAISE NOTICE '067: NOT unique-indexed — % accounts share the phone number "%" (resolve manually)', rec.n, rec.phone;
  END LOOP;

  IF colliding = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS users_phone_uq ON users (phone) WHERE phone IS NOT NULL;
  ELSE
    RAISE NOTICE '067: skipping users_phone_uq — % duplicate phone group(s) must be resolved first', colliding;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_phone_login ON users (phone) WHERE phone IS NOT NULL;
