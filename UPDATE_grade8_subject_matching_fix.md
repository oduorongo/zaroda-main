# ZARODA SMS — Fix: Creative Arts & Integrated Science not reaching Grade 8 mark list / report cards

Applied directly into the live codebase (cumulative with all prior updates).
Copy the whole `ZARODA/` folder over your working copy, restart the backend (a new migration runs),
and rebuild the frontend.

## Root cause
Two separate name issues that the earlier "tolerant matching" didn't fully cover:

1. **The rubric itself was misspelled** — the Grade 7/8/9 assessment rubric seed had
   **"Intergrated Science"** (transposed letters) instead of **"Integrated Science"**. Teachers
   enter marks under the correct spelling, so the strict/normalised match still missed it (neither
   string contains the other), and the score was dropped.
2. **Creative Arts naming variant** — the rubric area is "Creative Arts" while some saved marks /
   the frontend list used "Creative Arts & Sports". The previous simple substring match handled some
   variants but not robustly across word changes.

## The fix — two layers

### a) Correct the rubric typo at the source
- **Migration `025_fix_integrated_science_spelling.sql`** (new) renames the rubric area
  "Intergrated Science" → "Integrated Science" for Grade 7, 8 and 9. The rename keeps all the
  strands/sub-strands (they link by template id, not name), and it's idempotent. Auto-runs on boot.

### b) A much stronger learning-area matcher, shared everywhere
- New helpers in `frontend/lib/cbc/constants.ts`: `learningAreaMatches(a,b)` and
  `matchLearningArea(saved, columns)`. They match on: normalised equality/substring, shared
  significant word, shared 6-letter word stem ("Mathematic-s" ≈ "Mathematic-al"), and a small
  edit-distance (handles typos/transpositions like "Intergrated" ≈ "Integrated") — while still NOT
  matching unrelated subjects (English ≠ Kiswahili, Social Studies ≠ Integrated Science).
- All assessment screens now use it: Enter Marks (`teacher/marks`), the rubric editor
  (`teacher/assessment`), the class mark list (`teacher/mark-list`), the report-card preview
  (`dashboard/academic/report-cards`), and the backend report-card PDF builder
  (`backend/.../pdf/pdf-data.service.ts`) which carries its own copy of the same logic.

## Net effect
Creative Arts and Integrated Science (and any similar spelling/word variants) now flow from Enter
Marks → class mark list → report cards in Grade 8 — and in every other grade.

## After deploying
- Restart the backend so migration 025 runs (watch for `✅ migration applied: 025_…`).
  Quick check: `SELECT learning_area FROM assessment_templates WHERE grade_level='grade_8' AND learning_area ILIKE '%science%';`
  should now read **Integrated Science**.
- Rebuild the frontend.
- Open a Grade 8 learner's report card — Integrated Science and Creative Arts scores should appear.

## Note
The tolerant matcher is a safety net; keeping rubric area names spelled the way teachers enter them
remains best. If any other subject in any grade still doesn't show, tell me the grade + the exact
rubric name vs the entered name and I'll correct that rubric row too.
