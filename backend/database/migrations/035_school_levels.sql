-- ============================================================
-- MODULE 35: School level(s) per tenant — Primary/JS vs Senior School
-- Lets a school declare which bands it runs, so senior-school-only UI
-- (pathways, electives, subject allocation) doesn't leak into schools
-- that have no senior grades, and vice versa.
-- ============================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS school_levels TEXT[] NOT NULL DEFAULT '{}';

-- Backfill already-onboarded schools from their existing streams, so nobody
-- has to re-select anything. A stream in grade_10/11/12 implies 'senior';
-- anything else (ecde/pp1/pp2/grade_1..9) implies 'primary_js'. Tenants with
-- no streams yet are left as '{}' (treated as "unknown" — UI shows both
-- until the school sets it explicitly).
UPDATE tenants t
SET school_levels = agg.levels
FROM (
  SELECT tenant_id, ARRAY_AGG(DISTINCT level ORDER BY level) AS levels
  FROM (
    SELECT tenant_id,
      CASE WHEN grade_level IN ('grade_10','grade_11','grade_12') THEN 'senior'
           ELSE 'primary_js' END AS level
    FROM streams
    WHERE deleted_at IS NULL
  ) x
  GROUP BY tenant_id
) agg
WHERE t.id = agg.tenant_id;
