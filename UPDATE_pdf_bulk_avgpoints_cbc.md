# ZARODA SMS — Update: PDF fix · Bulk cards · Avg points · CBC comments · UX fixes

Applied directly into the live codebase. Copy the whole `ZARODA/` folder over your working copy.
One new migration must be run (see item 9).

## 1. Admin PDF report card now opens  (root-cause fix)
The PDF endpoints were prefixed three times: the global prefix `api/v1`, the controller
`@Controller('api/v1/pdf')`, AND the frontend buttons adding `/api/v1` on top of a baseURL
that already ends in `/api/v1`. Result: `/api/v1/api/v1/pdf/...` → 404.
- **backend/src/modules/pdf/pdf.service.ts** — controller is now `@Controller('pdf')`.
- **frontend/components/pdf/pdf-buttons.tsx** — stripped the redundant `/api/v1` from all 9
  PDF endpoints. (Other modules — finance, library, etc. — still have the same latent
  double-prefix; out of scope here but worth fixing the same way.)

## 2. Class teacher can generate the report card PDF
The single report-card route already permitted `class_teacher`. Verified.

## 3. Bulk, printable report cards
- **backend** — new `GET /pdf/report-cards/bulk?streamId=&term=&academicYear=` returns ONE
  PDF with every learner's card on its own page (`generateBulkReportCards` +
  `buildBulkReportCardData`). Allowed for HOI/DHOI/admin and class/overall class teacher.
- The report-card HTML was refactored into `buildReportCardHtml()` so single and bulk render identically.

## 4. Average points (Grades 7–12)
- **backend/src/modules/pdf/cbc-report.helper.ts** (new) — KNEC 8-point scale, average points,
  and mean-grade band.
- The report card now shows **Avg Points** and **Mean Grade** in the Overall Performance box,
  but ONLY for senior grades (7–12); primary/junior cards are unchanged.

## 5. CBC-compliant auto comments + core competencies
- **cbc-report.helper.ts** generates competency-based class-teacher and HOI comments (no
  ranking/percentage language; keyed to overall level + strongest/weakest areas + a next step)
  and derives which of the 7 KICD **core competencies** the learner has achieved from their
  per-area performance.
- The card renders a **Core Competencies Achieved** strip. A stored teacher comment, if present,
  still takes precedence over the auto one.

## 6. Onboarding teacher name → single box
- **frontend/app/dashboard/academic/teachers/page.tsx** — the Add-teacher form now has one
  **Full Name** field (matching the edit form); it is split into first/last on submit.

## 7. Teacher edits the assessment rubric only for assigned learning areas
- **frontend/app/teacher/assessment/page.tsx** — learning areas are filtered to the teacher's
  `subjects`. Class teachers / overall class teachers / HOI still see all areas. Falls back to
  all areas only if nothing matches (so a mis-tagged teacher is never locked out).
- To support this, `subjects` is now included in the auth login + `/auth/me` payloads
  (**backend/src/modules/auth/auth.service.ts**) and in the frontend `User` type.

## 8. Sequential mark entry (next learning area opens after save)
- **frontend/app/teacher/marks/page.tsx** — after a successful save, the page marks the current
  learning area done, clears the grid, and auto-advances to the next learning area. A progress
  strip shows X/N saved and lets the teacher jump between areas. Resets per class/term/assessment.

## 9. Grade 1 learning areas now pick correctly
Cause: the seeded `assessment_templates` for `grade_1` had a typo
(`Indeginous`) and were missing **English Language Activities**, so the rubric and report card
disagreed with the frontend list.
- **backend/database/migrations/020_grade1_learning_areas_fix.sql** (new, idempotent) — fixes the
  typo and adds the English Language Activities template (with strands/sub-strands). **Run this migration.**
- **frontend/lib/cbc/constants.ts** — the Lower Primary list now matches the rubric template names
  exactly, so mark list ↔ rubric ↔ report card all agree. All levels strictly read learning areas
  from the rubric/mark list.

## 10. Search bars on management pages
Most already had search. Added one to **frontend/app/teacher/classes/page.tsx**.

## Migrations to run
- `020_grade1_learning_areas_fix.sql` (item 9). No other schema changes.

## Pre-existing note (unchanged)
`@CurrentUser` / `@Roles` / `RolesGuard` are referenced but not defined in the repo. New code
uses the working `@Request()` + `JwtAuthGuard` pattern. The PDF controller relies on the existing
`@Roles`/`RolesGuard` usage in that file (unchanged from how it already shipped).
