# ZARODA SMS — Senior School (Grades 10–12): 4 core areas + per-learner electives

Copy the whole folder over your working copy, restart the backend (migration runs), rebuild frontend.

## What it implements
At Senior School every learner takes **4 core learning areas** — English, Kiswahili,
**Core Mathematics**, Community Service Learning — and then **chooses 3–4 elective** learning areas.
Electives are **per learner** (each learner picks their own), and this now flows through the
Grade 10–12 documents.

## Changes
- **Learner record** — new `electives` field (JSON array) on the learner.
  Migration `028_learner_electives.sql` adds the column.
- **Learner forms** (Add + Edit, dashboard) — when the grade is 10/11/12, a **Senior School
  Learning Areas** picker appears: the 4 core areas are automatic, and you tick 3–4 electives
  (capped at 4) from the KICD pathway list (`SENIOR_ELECTIVES`).
- **Report card** (`pdf-data.service.ts`) — for a Grade 10–12 learner, Section C now lists the
  4 core areas + that learner's own electives (instead of a fixed class rubric).
- **Class mark list** (`pdf-data.service.ts`) — for a Grade 10–12 class, the columns are the
  4 core areas + every elective taken by any learner in the class; each learner's row fills only
  the areas they take.
- **Constants** — `SENIOR_CORE_AREAS`, `SENIOR_ELECTIVES`, and `seniorAreasFor(electives)`.
  Senior core maths is named **"Core Mathematics"** (distinct from the elective "Mathematics").

## How to use
1. Run a learner's Add/Edit at Grade 10–12 → tick their 3–4 electives → Save.
2. Subject teachers enter marks for their area as usual; only learners taking that area get a mark.
3. Open the learner's report card → core + their electives; open the class mark list → core + the
   union of the class's electives.

## After deploying
Restart backend (watch for `✅ migration applied: 028_learner_electives.sql`), rebuild frontend.
Set electives on your Grade 10–12 learners, then check a report card and the class mark list.
