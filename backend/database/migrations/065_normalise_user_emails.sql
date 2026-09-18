-- Normalise login emails.
--
-- users.email is the login username and login looks it up lowercased and trimmed, but the
-- HOI teacher-edit form used to write whatever was typed. A row stored as "J.Kabasa@Gmail.com"
-- (or with a pasted trailing space) therefore never matched the lookup: the account was
-- unreachable no matter how many times its password was reset. The code paths are fixed;
-- this repairs the rows already in the database.
--
-- Collision safety: two different rows can normalise to the SAME address (e.g. "a@x.com" and
-- "A@X.com" are distinct under the case-sensitive UNIQUE constraint, but identical once
-- lowercased). Rewriting both would violate that constraint and abort the migration, so any
-- address with more than one row is left exactly as it is and reported as a NOTICE for manual
-- review — those are genuine duplicate accounts and a human has to decide which one survives.

DO $$
DECLARE
  fixed     int := 0;
  colliding int := 0;
  rec       record;
BEGIN
  -- Repair only rows whose normalised address is unique across the whole table.
  WITH norm AS (
    SELECT id, lower(btrim(email)) AS e
      FROM users
     WHERE email IS NOT NULL
  ), uniq AS (
    SELECT e FROM norm GROUP BY e HAVING count(*) = 1
  )
  UPDATE users u
     SET email = n.e
    FROM norm n
    JOIN uniq q ON q.e = n.e
   WHERE u.id = n.id
     AND u.email <> n.e;
  GET DIAGNOSTICS fixed = ROW_COUNT;

  IF fixed > 0 THEN
    RAISE NOTICE '065: normalised % user email(s)', fixed;
  END IF;

  -- Report anything left over, rather than silently skipping it.
  FOR rec IN
    SELECT lower(btrim(email)) AS e, count(*) AS n
      FROM users
     WHERE email IS NOT NULL
     GROUP BY 1 HAVING count(*) > 1
  LOOP
    colliding := colliding + 1;
    RAISE NOTICE '065: NOT normalised — % accounts share the address "%" (resolve manually)', rec.n, rec.e;
  END LOOP;

  -- Belt and braces: a functional unique index makes a future case-variant duplicate
  -- impossible at the database level. Only creatable once the table is actually clean,
  -- so skip it (with a notice) when unresolved collisions remain.
  IF colliding = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (lower(btrim(email)));
  ELSE
    RAISE NOTICE '065: skipping users_email_lower_uq — % duplicate address group(s) must be resolved first', colliding;
  END IF;
END $$;

-- Supports the case-insensitive login lookup (lower(btrim(email)) = $1). Redundant when the
-- unique index above exists, but present for the collision case where it was skipped.
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(btrim(email)));
