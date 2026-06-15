# ZARODA SMS — Timetable refinements: JS PPI slot, breaks/lunch/games shown, master download, teacher structure

Applied directly into the live codebase (cumulative with all prior updates).
Copy the whole `ZARODA/` folder over your working copy and restart the backend.

## 1. JS PPI is now a dedicated Friday slot after 3:20 pm
- `backend/src/modules/academic/kicd-timetable.constants.ts` — the Grade 7–9 day now ends with:
  8 lessons (→ 15:20), **Games / Co-curricular 15:20–16:20**, then **PPI 16:20–16:45 (Friday only)**.
- `auto-timetabler.ts` — for any band with a dedicated `ppi` slot (JS), PPI is plotted in that
  after-3:20 Friday slot and **does not consume a learning-area lesson**. This also resolves the old
  41→40 issue: JS now places all 40 daily learning-area lessons **plus** the weekly PPI = 41, with
  nothing dropped. (ECDE & primary keep PPI in Friday's first slot as before; Lower Primary still
  yields one low-priority lesson, exactly as the KICD sample timetable does.)

## 2. Breaks, lunch and games are now shown on the timetable
- The per-stream grid (`frontend/app/dashboard/academic/timetable/page.tsx`) renders the **full day
  structure** — assembly, health breaks, lunch, games/co-curricular and PPI appear as labelled,
  colour-coded rows (with their times) between the lesson rows, instead of only lesson rows.

## 3. Master block timetable is downloadable (and printable)
- The Master grid modal now has **Download (CSV)** and **Print** buttons. CSV columns:
  Stream, Grade, Day, Period, Subject, Teacher. Print produces one clean table per stream.

## 4. Teacher's personal timetable picks from the block timetable + structure
- `backend` — `getTeacherTimetable` now also returns each lesson's grade level and period order.
- `frontend/app/teacher/timetable/page.tsx` — rewritten: it reads the teacher's lessons from the
  school **block timetable** (`/academic/my-timetable`) and renders them against the **official KICD
  day structure** for their predominant grade band — same period times, and the same breaks, lunch,
  games and PPI rows as the main timetable. Each lesson cell shows the subject and the stream it's for.

## Notes
- No new migration. All changes are code-level; restart the backend so the updated period
  structure and routes load, then re-run Auto-generate to pick up the new JS PPI/Games slots.
- A teacher who teaches across several grade bands sees the structure of their most common band; all
  their lessons still show regardless of band.
