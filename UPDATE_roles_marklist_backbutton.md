# ZARODA SMS — Update: Teacher Roles · Report Card Mark List · Back Buttons · Class Mark List

Applied directly into the live codebase. Copy the whole `ZARODA/` folder over your working copy.

## 1. Teacher edit form now edits Role (and Class)
- **frontend/app/dashboard/academic/teachers/page.tsx**
  - The Edit Teacher modal now has a **Role** dropdown (Subject Teacher, Class Teacher,
    Overall Class Teacher, Deputy HOI, Games Dept, Bursar) and a **Class** selector.
    The current role/class are pre-loaded when you open the modal.
- **backend/src/modules/academic/academic.module.ts**
  - `updateTeacher()` now also accepts `streamId` (maps to `stream_id`); an empty selection
    is stored as `NULL` so the FK doesn't error. `role` was already accepted.

## 2. HOI Report Card now reads the class mark list
Root cause: the report-cards page started with an empty grid, used a hardcoded subject list,
and never loaded marks already entered — so report cards came out blank and a careless Save
could overwrite the class teacher's marks with blanks.
- **frontend/app/dashboard/academic/report-cards/page.tsx** (rewritten)
  - Loads `GET /academic/mark-list?streamId=&term=` and pre-fills each learner × subject with
    the existing CBC level, and shows the % underneath.
  - Uses the subjects actually present in the mark list (not a fixed list).
  - Save now skips blanks, so it never wipes existing marks.
  - Shows a banner when no marks exist yet for the selected stream/term.
  - Term/year values match what the PDF queries, so the generated PDF picks up the marks.

## 3. Back button on every page
- **frontend/app/dashboard/layout.tsx** and **frontend/app/teacher/layout.tsx**
  - A **Back** control was added to the top bar of both shared layouts, so it appears on
    every page automatically. It is hidden only on the section root (`/dashboard`, `/teacher`).
  - The two rewritten report/mark-list pages also have an inline Back button in their header.

## 4. Class teacher can manage the full class mark list
- **frontend/app/teacher/mark-list/page.tsx** (new) — "Class Mark List"
  - One consolidated grid: every learner × every learning area for the teacher's own class.
  - Loads existing marks, auto-computes %, CBC level and class rank, and saves all subjects.
  - Added to the teacher sidebar (`frontend/app/teacher/layout.tsx`) as **Class Mark List**.
- **backend/src/modules/academic/academic.module.ts**
  - `bulkSaveResults()` now lets a **class teacher / overall class teacher** save marks for
    **any** subject of a stream they are assigned to (looked up via `streams.class_teacher_id`).
    Subject teachers remain restricted to the learning areas they teach. To enable this, the
    mark-list save payloads now include `streamId` per record.

## No database migration required
All changes use existing columns (`users.stream_id`, `users.role`, `streams.class_teacher_id`,
`assessment_results.*`).

## Note (pre-existing, unchanged)
`@CurrentUser` / `@Roles` / `RolesGuard` are referenced by some controllers but not defined in
the repo. New code uses the working `@Request()` + `JwtAuthGuard` pattern. Worth resolving
separately so the older controllers compile cleanly.
