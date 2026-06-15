# ZARODA SMS — Update: Report-card fix · Mark-list edit/print · Parent login

Applied directly into the live codebase (cumulative with all prior updates).
Copy the whole `ZARODA/` folder over your working copy.

## 1. Report card "not opening" — real root cause fixed
`buildReportCardData` queried assessment results with `relations: ['subject']` and
`order: { subject: { name: 'ASC' } }`, but on the `AssessmentResult` entity **`subject` is a
plain string column, not a relation** — so TypeORM threw and the PDF never generated.
- **backend/src/modules/pdf/pdf-data.service.ts** — query now orders by the `subject` string and
  reads `r.subject` directly (no `.name`).
- **frontend/components/pdf/pdf-buttons.tsx** — the PDF now also opens in a new tab (not only
  downloads), and any server error is decoded from the blob and shown, so failures are no longer silent.

## 2. Class teacher: add/edit marks for ALL learning areas; saved marks are edit-only
- **frontend/app/teacher/mark-list/page.tsx**
  - Loads every learning area for the class and pre-fills existing marks.
  - Cells already saved in the database are highlighted (green) and titled "editing updates it";
    blank cells are fresh entries. Saving promotes new cells to saved/edit-only state.
  - Clearing a cell removes the value (so an accidental 0 isn't forced).

## 3. Class mark list is downloadable and printable
- Same page — added **Download** (CSV) and **Print** (opens a clean, print-ready table in a new
  window and triggers the browser print dialog).

## 4. Parent email on the admission form → parent login credentials (optional)
- **frontend/app/dashboard/academic/admissions/page.tsx** — the Guardian Email field is clearly
  labelled optional and noted as the address that receives parent login credentials.
- **backend/src/modules/academic/academic.module.ts** — `createLearner` now, when a guardian email
  is supplied and no user with that email exists, creates a **parent** account and returns one-time
  credentials. The admission UI shows a modal with the username/password to copy and share. Parent
  account creation never blocks the admission (failures are swallowed).

## 5. Report card learning areas are class-specific, from the class mark list
The report card already reads each learner's results from `assessment_results` (the class mark
list), so the learning areas shown are exactly those entered for that class. Combined with the
earlier Grade-1 rubric/name alignment (migration 020), all levels now show the correct,
class-specific learning areas.

## Migrations to run
- None new in this batch. (Migration `020_grade1_learning_areas_fix.sql` from the previous batch
  is still required if not yet applied.)

## Pre-existing note (unchanged)
`@CurrentUser` / `@Roles` / `RolesGuard` are referenced but not defined in the repo; new code uses
the working `@Request()` + `JwtAuthGuard` pattern.
