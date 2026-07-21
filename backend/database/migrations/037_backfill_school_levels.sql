-- ============================================================
-- MODULE 37: Backfill school_levels for tenants created after migration 035
-- but before the frontend actually collected it (school_levels left '{}').
-- Same rule as 035: a stream in grade_10/11/12 implies 'senior'; anything
-- grade_9 and below implies 'primary_js'. Tenants with no streams yet are
-- left as '{}' (unknown) — nothing to infer from.
-- ============================================================

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
WHERE t.id = agg.tenant_id
  AND t.school_levels = '{}';
