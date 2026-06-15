# ZARODA SMS — Canonical learning-area names (single source of truth)

Applied directly into the live codebase (cumulative with all prior updates).
Copy the whole `ZARODA/` folder over your working copy, restart the backend (a migration runs),
and rebuild the frontend.

## Why
Learning areas were named inconsistently across the rubric, saved marks, and the frontend
(e.g. "Mathematics Activities" vs "Mathematical Activities", "Indeginous" vs "Indigenous",
"C.R.E" vs "Religious Education", "Intergrated Science" vs "Integrated Science",
"Pretechnical Studies" vs "Pre-technical Studies", "Creative Arts" vs "Creative Arts and Sports").
That mismatch is what caused marks to "not push" between Enter Marks, the class mark list and report
cards. This change renames everything to ONE canonical set taken from the official KICD
LEARNING_AREAS document, so the names match exactly with no fuzzy matching required.

## Canonical names (from the document)
- **Pre-Primary:** Language Activities · Mathematical Activities · Creative Activities ·
  Environmental Activities · Religious Activities
- **Grades 1–3:** Indigenous Language Activities · Kiswahili Language Activities / Kenya Sign
  Language Activities · English Language Activities · Mathematical Activities · Religious Education
  Activities · Environmental Activities · Creative Activities
- **Grades 4–6:** English · Kiswahili/Kenya Sign Language · Mathematics · Religious Education ·
  Science & Technology · Agriculture · Social Studies · Creative Arts
- **Grades 7–9:** English · Kiswahili/Kenya Sign Language (KSL) · Mathematics · Religious Education ·
  Social Studies · Integrated Science · Pre-technical Studies · Agriculture · Creative Arts and Sports

## What changed
- **Migration `026_canonical_learning_area_names.sql`** (new) renames every known variant to the
  canonical name in BOTH:
  - the rubric (`assessment_templates`) — merging a variant onto the canonical row if one already
    exists, moving its strands across so nothing is lost; and
  - saved marks (`assessment_results`) — so existing marks keep matching after the rename.
  Idempotent and auto-runs on boot.
- **`frontend/lib/cbc/constants.ts`** — `LEARNING_AREAS` updated to the exact canonical names for
  every band, so the Enter Marks fallback list, rubric editor and report-card columns all agree.

## Net effect
Rubric, Enter Marks, class mark list and report cards now use identical names, so marks flow through
for every learning area in every grade — including the previously problematic Creative Arts and
Integrated Science in Grade 8.

## After deploying
- Restart the backend; watch for `✅ migration applied: 026_canonical_learning_area_names.sql`.
- Rebuild the frontend.
- Spot-check: `SELECT DISTINCT grade_level, learning_area FROM assessment_templates ORDER BY 1,2;`
  should show the canonical names above.
- Existing marks are preserved and renamed in place — no re-entry needed.

## Note
The earlier tolerant matcher remains in place as a harmless safety net, but with canonical names it
is no longer needed for normal operation. If you later add a new learning area, name it exactly as in
the list above (or in the rubric) and it will line up automatically.
