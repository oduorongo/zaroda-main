# ZARODA SMS — Update: Learner Edit + Customizable Report Card

This update was applied directly into the live codebase (not as separate add-on files).
Copy the whole `ZARODA/` folder over your working copy, or apply the per-file changes below.

## What changed

### 1. Edit learner: guardian name + class/stream now editable
- **frontend/app/dashboard/academic/learners/page.tsx**
  - The Edit Learner modal now includes **Parent/Guardian Name** and a **Class/Stream**
    dropdown (previously only Full Name, Admission No., Guardian Phone).
  - Selecting a stream auto-fills the learner's grade level from that stream.
- **backend/src/modules/academic/academic-core.service.ts**
  - `UpdateLearnerDto` now accepts `fullName`, `admissionNumber`, `gradeLevel`
    (these were being silently dropped by validation before).
  - `LearnerService.update()` now:
    - splits `fullName` into first/last name,
    - re-syncs `grade_level` from the new stream when the class/stream changes
      (this keeps the report card's learning areas correct for the learner's grade).

### 2. Customizable report card with per-school brand colour
The branded report-card PDF already existed (`pdf.service.generateReportCard`), pulling
learning areas, levels and teacher comments from `assessment_results` (the class mark list)
and the class-teacher name from the stream. This update makes the **branding customizable
per school** instead of hardcoded navy/gold.

- **backend/src/modules/pdf/pdf.service.ts**
  - `generateReportCard()` accepts an optional `brand` ({ primary, primaryDeep, accent }).
    Inside the method, a local palette `B` overlays the school's colours on the defaults,
    so every report-card colour now follows the school's brand.
- **backend/src/modules/pdf/pdf-data.service.ts**
  - `buildReportCardData()` reads brand colours from `schools.settings` and passes them through.
- **backend/src/modules/auth/entities/school.entity.ts**
  - Added `settings` (jsonb), `email`, and `principalName` column mappings
    (the columns already exist in the DB — migration 001 — so **no new migration is needed**).
- **backend/src/modules/auth/school-settings.controller.ts** (new)
  - `GET  /api/v1/schools/settings` — returns school info + brand colours.
  - `PATCH /api/v1/schools/settings` — saves school info + brand colours (colours stored in
    `schools.settings` JSONB). Backs the previously dead settings page.
- **backend/src/modules/auth/auth.module.ts**
  - Registers `SchoolSettingsController` + `SchoolSettingsService`.
- **frontend/app/dashboard/settings/page.tsx**
  - Loads current settings on open, adds **Email / Head Teacher / Motto** fields, and a new
    **Report Card Branding** section with three colour pickers + a live header preview.

## No database migration required
Brand colours and motto live in the existing `schools.settings` JSONB column. The `email`
and `principal_name` columns already exist in the schools table (migration 001).

## How the report card works (unchanged, for reference)
- Learning areas + performance levels + teacher comments come from `assessment_results`
  (the class mark list), filtered by the learner's term, year and grade.
- Class teacher name is auto-pulled from the learner's stream.
- The teacher comment auto-generates from the overall level when none is stored.
- Output: branded PDF via `GET /api/v1/pdf/report-card/:learnerId?term=...&academicYear=...`.

## Note (pre-existing, not introduced here)
`@CurrentUser`, `@Roles`, and `RolesGuard` are referenced by several existing controllers but
are not defined/imported anywhere in the codebase. The new settings controller deliberately
uses the working `JwtAuthGuard` + `@Request()` pattern to avoid depending on them. Worth
resolving separately so the older controllers compile cleanly.
