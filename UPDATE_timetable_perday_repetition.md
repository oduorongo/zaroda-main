# ZARODA SMS — Auto-timetabler: no learning area twice a day (except earned double-ups)

Applied directly into the live codebase. Copy the whole folder over your working copy, restart the
backend, and re-run Auto-generate for the affected streams.

## Rules now enforced
- A learning area appears **at most once per day**, EXCEPT:
  - **JS practical double lesson** — the one allowed double (Integrated Science / Pre-technical /
    Agriculture / Creative Arts & Sports) occupies two adjacent periods; that's the only twice-in-a-day
    case in Junior School.
  - A subject whose **weekly allocation exceeds the 5 weekdays** gets exactly `(lessons − 5)` day(s)
    with a second lesson. In Upper Primary that means **only Creative Arts (6/week) may appear twice,
    on one day**; everything else is once per day. (Lower Primary's Creative Activities is 7/week, so
    it unavoidably doubles up on two days.)

## How
`backend/src/modules/academic/auto-timetabler.ts` now computes a per-subject "double-up day"
allowance from the KICD weekly allocation (`max(0, lessons − 5)`), tracks how many double-up days each
subject has used, and refuses to place a 2nd lesson of a subject on a day once that allowance is spent
— in the main placement pass AND both relaxed fallback passes, so the cap can't be bypassed when slots
are tight. The practical double lesson is exempt (it's a single placement filling two periods).

## After deploying
Restart the backend, then click **Auto-generate** again for each stream so the timetable is rebuilt
under the new rule. Existing (manually edited) timetables are only changed when you re-generate.
