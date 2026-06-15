# ZARODA SMS — Feature: Automatic block timetable generator (ECDE → JS)

Applied directly into the live codebase (cumulative with all prior updates).
Copy the whole `ZARODA/` folder over your working copy and restart the backend.

## What this does
One-click generation of a KICD-compliant weekly timetable for ECDE (pre-primary),
Lower Primary (Grade 1–3), Upper Primary (Grade 4–6) and Junior School (Grade 7–9) —
for a single class or the whole school — plus a whole-school **master/block grid** view.

The engine is a **deterministic constraint solver** (no AI, no API key, no external calls), so it
runs reliably on any school's server. It writes into the existing `timetable_periods` table, so the
current per-stream grid and any PDF reads it unchanged.

## Behaviour (as requested: fill subjects always, use teachers where assigned)
- Every period is filled with the correct learning area.
- A teacher is attached when one is onboarded for that subject AND is free that day/period;
  otherwise the lesson is still plotted (teacher left blank to assign later).
- A teacher is never double-booked in the same day+period across streams (junior streams are
  scheduled first so their teacher demand is reserved).

## KICD rules enforced
- Exact lessons per learning area per band (Tables 1–4).
- Correct number of lesson periods/day with official times per band.
- Similar areas (language group; maths/science group) never sit back-to-back.
- Creative / Creative Arts & Sports / PE plotted in the slot before a break.
- PPI plotted once per week (Friday, first slot).
- Grade 7–9: at most ONE double lesson, only for a practical (Integrated Science,
  Pre-Technical, Agriculture, Creative Arts & Sports).
- Even spread of each area across the week.

### Note on the 31st / 41st lesson
The guidelines define Lower Primary as "6 lessons/day **and one PPI/week** = 31" and JS as
"8/day **and one PPI** = 41". The weekly grid has 30 (Lower) / 40 (JS) slots, so when PPI takes a
slot, one lower-priority lesson yields — exactly what the document's own sample timetable
(Appendix 2) does, where Religious Education shows 2 lessons that week instead of 3. The solver
reproduces this and notes it ("… has one fewer lesson this week (PPI occupies a slot)") rather than
flagging an error.

## Backend
- `backend/src/modules/academic/auto-timetabler.ts` — the solver (`generate`, `masterGrid`).
- `backend/src/modules/academic/academic.module.ts` — two service methods +
  - `POST /api/v1/academic/timetable/auto-generate`  body `{ streamIds?: string[] }` (omit for all)
  - `GET  /api/v1/academic/timetable/master`          whole-school block grid

## Frontend (`frontend/app/dashboard/academic/timetable/page.tsx`)
- **Auto-generate** button (HOI) → choose "All streams" or "Just this class", run, see a per-stream
  placed/expected summary; the grid refreshes.
- **Master grid** button → a whole-school block view: every stream's week in one scrollable modal,
  showing subject + teacher per period.

## Re-running
Generating replaces the timetable for the chosen scope (all streams, or the selected class). You can
still hand-edit any period afterwards with the existing Edit mode.
