# ZARODA SMS — Realign timetable & CBE strictly to the KICD guidelines

Applied directly into the live codebase (cumulative with all prior updates).
Copy the whole `ZARODA/` folder over your working copy and restart the backend.

## Background
The codebase already contained a strictly-compliant KICD reference module
(`kicd-timetable.constants.ts` + `kicd-timetable.service.ts`) — period structures, lesson
allocations, and the CBE calculator — but it was **orphaned**: not exposed by any route and not
used by the timetable UI, which instead rendered a single hardcoded 9-period grid for every grade.
This change wires the official reference data into the app so what's displayed/used matches the
document.

I verified the existing reference data against the PDF before wiring it:
- All 7 lesson-distribution tables sum correctly (Pre-Primary 25, Grade 1–3 31, Grade 4–6 35,
  Grade 7–9 41, Foundation 20, Intermediate 30, Pre-Vocational 40).
- Junior CBE matches Appendix 8 for all 12 stream counts (1→6, 2→11 … 12→58) and the worked
  example (1 stream → 6 teachers).
- Primary CBE matches Table 1 for all 10 rows (CBE, deputies, senior teachers).

## Backend (`backend/src/modules/academic/academic.module.ts`)
New read-only routes (pure functions from the KICD constants — no DB/entity risk):
- `GET /api/v1/academic/timetable/structure?gradeLevel=` → official period structure (times,
  breaks, assembly, lunch, non-formal), lessons/week, lesson duration, whether a double lesson is
  allowed, and the per-learning-area allocation for that grade band.
- `GET /api/v1/academic/cbe?schoolType=junior|primary&streams=N` → full CBE result (teachers from
  lessons, admin shortfall, total CBE, principal/deputies/senior masters, per-subject breakdown).
- `GET /api/v1/academic/timetable/committee` → the timetabling committee roles (governance ref).

## Frontend (`frontend/app/dashboard/academic/timetable/page.tsx`)
- The grid now loads the **official period structure for the selected stream's grade band** instead
  of a fixed array. Period rows, their count, and their exact times come from the document
  (e.g. pre-primary 5 lessons of 30 min from 9:00; Grade 4–6 7 lessons of 35 min; Grade 7–9 8
  lessons of 40 min ending 15:20).
- A **KICD structure banner** shows lessons/week, minutes/lesson, lessons/day, the double-lesson
  rule, and per-learning-area targets (plotted vs required, turning green when met; ⏱ marks
  areas that must be plotted before a break).
- A **CBE calculator** panel (HOI only): pick Junior/Primary and number of streams → shows total
  CBE, principal/head, deputies, senior masters, and (for junior) the per-subject teacher
  breakdown and shortfall figures.

## Notes / scope
- The timetable's auto-generate AI service (`KicdTimetableService.generate`) was deliberately **not**
  wired up in this pass: it depends on entities (`TimetableSlot`, `TeacherAllocation`,
  `StreamSubject`) that don't match the live `timetable_periods` table and on `ANTHROPIC_API_KEY`.
  Wiring it would risk the working manual timetable. The compliant reference data (structures,
  allocations, validation rules, CBE) is what's now exposed and used. If you want full
  one-click auto-generation, that's a follow-up that needs the slot entities/table reconciled.
- Plotting rules from the document (no similar areas consecutive; creative/sports/PE before a
  break; one double only for Grade 7–9 practicals; PPI once per week) are encoded in the constants
  and surfaced as targets/flags in the banner for the person plotting manually.
