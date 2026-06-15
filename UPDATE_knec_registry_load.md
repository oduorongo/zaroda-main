# ZARODA SMS — Update: KNEC school code registry loaded for signup

Applied directly into the live codebase (cumulative with all prior updates).
Copy the whole `ZARODA/` folder over your working copy and restart the backend to apply.

## What was done
Extracted KNEC school codes (and names where available) from the two uploaded files and loaded
them into the existing `knec_school_registry` table, which signup already uses to identify a
school by its KNEC code.

Sources:
- `Kenya_KNEC_Codes_Combined.xlsx` (KNEC Code + School Name)
- `CANDIDATURE_2025.xls` (KPSEA, KJSEA, KCSE sheets — headers were buried a few rows down and
  parsed accordingly)

Result:
- **2,407 unique KNEC codes** loaded
  - 608 with a school name
  - 1,799 stored **without** a name (code only), exactly as requested
- **Duplicate codes were de-duplicated.** The same code appears across sheets/files (a KNEC
  centre code is reused across exam levels and sometimes maps to different names) — each code is
  stored once, keeping the first non-empty name found.

## Files
- **backend/database/migrations/022_knec_registry_bulk_load.sql** (new)
  - Relaxes `knec_school_registry.name` to allow NULL (codes without names).
  - Bulk-inserts all 2,407 codes with `ON CONFLICT (knec_code) DO NOTHING`, so it is idempotent
    and will not overwrite any existing registry rows (e.g. the sample Manyonge entry).
- **backend/src/modules/location/location.module.ts**
  - The `KnecSchool` entity `name` column is now nullable to match.

## How it's used at signup
Signup already calls `GET /location/schools/:knecCode` (`lookupSchool`) and the type-ahead
`searchSchools`, both of which read `knec_school_registry`. Once migration 022 runs, entering a
KNEC code at signup will resolve against this list; for codes that have a name, the name is
returned for confirmation, and codes without names still resolve (name comes back empty/NULL).

## How to apply
The backend auto-runs every `.sql` in `database/migrations` once (tracked in `_migrations`),
in filename order. `022_...` runs after all earlier migrations on the next boot. No manual step
beyond deploying and restarting the backend.

## Reference deliverable
`KNEC_Codes_Loaded.xlsx` (provided separately) lists every code and name that was loaded, so you
can audit or share the list.

## Note
Names are stored as they appear in the source files (uppercase, e.g. "AKONJO",
"ST JOSEPH CATHOLIC"). If you want title-case display names, that can be normalised later without
affecting the codes.
