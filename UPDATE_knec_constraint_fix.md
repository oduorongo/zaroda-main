# ZARODA SMS — Fix: KNEC registry reload (ON CONFLICT constraint error)

Copy the whole folder over your working copy, restart the backend.

## The error
`there is no unique or exclusion constraint matching the ON CONFLICT specification` — the existing
knec_school_registry table had no UNIQUE constraint on knec_code (created by an older definition),
so `INSERT … ON CONFLICT (knec_code)` couldn't run.

## The fix
Migration `029_knec_registry_reload.sql` now, before the inserts:
1. de-duplicates any existing rows by knec_code,
2. adds the UNIQUE(knec_code) constraint if it's missing (guarded so it's a no-op if already there),
then loads all 2,407 codes with ON CONFLICT DO NOTHING.
029 failed last boot (so it wasn't recorded as applied) and will re-run automatically with this fix.

## After deploying
Restart the backend. Watch for `✅ migration applied: 029_knec_registry_reload.sql` and then
`ℹ️  KNEC registry: 2407 codes available for signup lookup` (instead of 0).
