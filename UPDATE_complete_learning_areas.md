# ZARODA SMS — Update: Complete learning areas per grade (from KICD books)

Applied directly into the live codebase (cumulative with all prior updates).
Copy the whole `ZARODA/` folder over your working copy, and run the new migration.

## What was wrong
Several grades were missing learning areas in the assessment rubric (`assessment_templates`),
most visibly **Grade 8 English**. The KICD grade assessment report books carry the full set of
learning areas in **Term 1**, but drop some (English in particular) in Terms 2–3; the original
seed had picked up the incomplete sets for some grades.

## What was done
I read the 12 uploaded KICD assessment report books (Playgroup → Grade 9) and extracted the
learning areas from the **section/table titles only** — the summative-assessment tables and
comment/signature sections were deliberately ignored, as requested.

The verified canonical set per grade is documented in **docs/LEARNING_AREAS_BY_GRADE.md**.

### New migration — `backend/database/migrations/021_missing_learning_areas.sql`
Idempotent. Adds the learning areas that were missing per grade, using each grade's existing
naming convention so mark-list / report-card matching still lines up:
- grade_2: English Language Activities, Creative Arts Activities
- grade_3: English Language Activities, Creative Arts Activities
- grade_4: English Language Activities
- grade_5: English Language Activities
- grade_6: English Language Activities, Creative Arts Activities, Science & Technology Activities,
  Indeginous Language Activities
- grade_7: English Language, Creative Arts, Pretechnical Studies
- grade_8: **English Language**  ← the originally reported gap

Each added area gets generic CBC strands/sub-strands so it renders in the assessment book.
Grade 9 already had the full set; Grade 1 was completed earlier by migration 020.

## How to apply
The backend auto-runs every `.sql` in `database/migrations` once (tracked in `_migrations`),
in filename order. `021_...` runs after all earlier migrations on the next backend boot. No
manual step beyond deploying and restarting the backend.

Because the mark list and report card both read learning areas strictly from the rubric
(`assessment_templates`), once 021 has run, the missing areas (e.g. Grade 8 English) appear in
both automatically.

## Note on spelling
The seed keeps the books' existing spellings (e.g. "Intergrated Science", "C.R.E",
"Pretechnical Studies", "Shughuli Za Kiswahili"). If you later standardise these, update the
templates and the mark-list display together so name-matching stays consistent.
