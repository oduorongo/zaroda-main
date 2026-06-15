# ZARODA SMS — Fix: scores missing on report cards after saving in the mark list

Applied directly into the live codebase (cumulative with all prior updates).
Copy the whole `ZARODA/` folder over your working copy and restart the backend + rebuild the frontend.

## The problem
Marks saved fine and showed on the class mark list, but were missing on report cards. Cause: the
report-card builder filtered each learner's results against the grade's assessment rubric using an
**exact** name match (`rubricSet.has(subject)`). When a saved subject name differed even slightly
from the rubric area name — e.g. "Mathematics" vs "Mathematical Activities", or "Science" vs
"Integrated Science" — the result was dropped, so the score never appeared on the card. (The mark
list had already been made tolerant of this; the report card had not.)

## The fix
Applied the same tolerant, normalised matching (case- and punctuation-insensitive) on the report
card, in both the PDF builder and the on-screen preview:

- **`backend/src/modules/pdf/pdf-data.service.ts`** (`buildReportCardData`, used by single AND bulk
  report cards):
  - Saved subjects are now matched to rubric areas with normalised comparison, so variant spellings
    still land — no saved mark is dropped.
  - When both a CAT and an End-Term mark exist for a subject, the report card now prefers the
    **End-Term** mark (it's the end-term report) instead of keeping an arbitrary one.
- **`frontend/app/dashboard/academic/report-cards/page.tsx`** (preview): saved subjects are
  normalised-matched onto rubric columns, and any saved subject not in the rubric is shown as an
  extra column, so the preview never hides a score either.

## Net effect
Marks entered and saved (via Enter Marks or the class mark list) now appear on report cards for every
class, matching what the mark list shows.

## Notes
- No database/migration change. Restart the backend (for the PDF builder) and rebuild the frontend
  (for the preview).
- This completes the chain started in the previous fix: Enter Marks → class mark list → report card
  now all use the same tolerant subject matching against the assessment rubric.
- Long-term, keeping each grade's rubric learning-area names aligned with what teachers enter avoids
  needing the tolerance at all, but the tolerant matching means mismatches no longer lose data.
