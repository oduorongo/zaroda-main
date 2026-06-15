# ZARODA SMS — Fix: bulkCreate compile error (TS2339)

Copy the whole folder over your working copy, restart the backend.

## The error
`Property 'bulkCreate' does not exist on type 'AcademicService'` — the controller injects
`AcademicService`, but the bulk method lived on a different service class (`LearnerService`).

## The fix
Added `bulkCreate` directly to `AcademicService` (academic.module.ts), mirroring its single
`createLearner`: it keeps a provided admission number (the KNEC assessment number) or auto-generates
one, skips learners whose admission number already exists in the school, and saves each into the
chosen stream with the stream's grade level. Only the real Learner columns are written.

## After deploying
Restart the backend — it now compiles cleanly. Bulk upload (paste or PDF drop) works end to end.
