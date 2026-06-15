# ZARODA SMS — Update: Rubric-strict learning areas · Mark-list & report-card PDF

Applied directly into the live codebase (cumulative with all prior updates).
Copy the whole `ZARODA/` folder over your working copy.

## 1. Class mark list columns come STRICTLY from the class assessment rubric
Previously the mark list took a UNION of a generic per-band list and whatever subjects had
saved marks — which produced extra and sometimes duplicate columns.
- **frontend/app/teacher/mark-list/page.tsx** — learning-area columns now load only from
  `/assessment/learning-areas?gradeLevel=` (the class's assessment rubric), de-duplicated with a
  `Set`. No extras, no repeats. Falls back to the band list only if the rubric isn't set up yet.

## 2. Report card shows ONLY learning areas offered in that class
- **frontend/app/dashboard/academic/report-cards/page.tsx** — the grid columns now come strictly
  from the class rubric (de-duplicated), not from whatever marks happen to exist.
- **backend/src/modules/pdf/pdf-data.service.ts** — `buildReportCardData` now fetches the rubric
  for the learner's grade and **filters results to those areas only**, and de-duplicates by
  subject. A stray result from a subject not offered in the class can no longer appear on the card.
  (If a school hasn't configured a rubric for the grade, it falls back to showing existing results.)

## 3. Class mark list downloadable as PDF
- **backend** — new `GET /pdf/mark-list?streamId=&term=&examType=&academicYear=` →
  `buildMarkListData` + `generateMarkList` produce a branded, landscape PDF (learners × rubric
  areas, raw scores, average %, rank). Columns are strictly the rubric areas, de-duplicated.
- **frontend/app/teacher/mark-list/page.tsx** — a **PDF** button (alongside the existing CSV and
  Print). Opens in a new tab and downloads.

## 4. Report card downloadable as PDF
Already available via the report-card PDF button (single and bulk). Unchanged here beyond the
rubric filtering in item 2.

## Migrations to run
- None new. (Migration `020_grade1_learning_areas_fix.sql` from an earlier batch is still required
  if not yet applied — it seeds correct Grade 1 rubric areas.)

## Important operational note
Because both the mark list and the report card now derive their learning areas from the
**assessment rubric** (`assessment_templates`), each grade must have its rubric learning areas
configured/seeded. Grades with seeded templates (per migration 014 + 020) work out of the box;
for any grade where the rubric is empty, the mark list falls back to the generic band list and the
report card shows existing results. Seed the rubric for every grade you operate to get the strict
behaviour everywhere.

## Pre-existing note (unchanged)
`@CurrentUser` / `@Roles` / `RolesGuard` are referenced but not defined in the repo; new code uses
the existing patterns already present in each controller.
