# ZARODA SMS — Fix: bulk learner upload failing to save

Copy the whole folder over your working copy, restart the backend.

## The cause
The learners table requires `academic_year` (NOT NULL) and `grade_level` (NOT NULL). The bulk
create was setting grade_level (from the stream) but NOT academic_year, so every insert was rejected
by the database — the upload saved nothing.

## The fix (academic.module.ts `bulkCreate`)
- Sets `academicYear` (from the request, the stream, or default 2025/2026) so the NOT NULL column is
  satisfied.
- Falls back schoolId to the stream's school if the user's schoolId is missing.
- Defaults gender to a valid value and fills first/last if only one name is present (the gender
  column has a male/female CHECK constraint; the parser already outputs those).
- Adds clear validation messages (no stream / no learners / school not found) and logs each failed
  row to the backend console, so any future issue is visible.

## After deploying
Restart the backend, retry the bulk upload (paste or PDF). The backend console shows
`📥 bulkCreate …` then `✅ bulkCreate done: N created`. If any row still fails, the console names the
exact reason per row.
