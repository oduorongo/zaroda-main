# ZARODA SMS — Fix: per-grade learning areas in rubric & Enter Marks, and marks reaching the class mark list

Applied directly into the live codebase (cumulative with all prior updates).
Copy the whole `ZARODA/` folder over your working copy and rebuild/restart the frontend.

## The problems (all one root cause)
Three symptoms, one cause — the three assessment screens were each deriving the learning-area
list from a DIFFERENT source, and filtering by the teacher's flat (all-streams) subject list:

- **Rubric grade dropdown showed wrong/empty areas in some grades** — it filtered the rubric areas
  against the teacher's flat `subjects` using a loose text match. When a rubric area name didn't
  text-match the assigned subject (e.g. "Integrated Science" vs "Science"), the filter returned
  nothing and fell back to showing ALL areas; in other grades the names happened to match, so it
  "worked in some grades."
- **Enter Marks had the same issue** — it built its subject list from a frontend constant
  (`learningAreasFor`) intersected with the flat subjects, not the class's actual rubric.
- **Marks not appearing on the class mark list in some classes** — Enter Marks SAVED each mark under
  the subject name from the frontend constant, but the mark list built its COLUMNS from the database
  rubric endpoint. When those two names differed, the mark was saved correctly in the database (and
  returned by the API) but had no matching column, so it looked like it "wasn't pushed."

## The fix — one source of truth + per-stream assignment
All three screens now use the **database assessment rubric** (`/assessment/learning-areas`) as the
authoritative area list, and filter by the teacher's **per-stream** assignment
(`teacher_stream_subjects`, the per-class learning areas you set when onboarding/editing a teacher),
with robust normalised name matching (case- and punctuation-insensitive).

- `frontend/app/teacher/assessment/page.tsx` (rubric) — grade dropdown now lists the areas assigned
  to the teacher **in the selected stream**, from the rubric; falls back to the flat list only for
  teachers without per-stream assignments yet.
- `frontend/app/teacher/marks/page.tsx` (Enter Marks) — subject options now come from the class's
  database rubric ∩ the teacher's per-stream assignment. Because the source is the SAME rubric the
  mark list uses, every mark is now saved under a name the mark list recognises.
- `frontend/app/teacher/mark-list/page.tsx` — columns still come from the rubric, but saved marks are
  now **normalised-matched onto the right column**, and any saved subject that isn't in the rubric is
  shown as an extra column. Result: no saved mark is ever hidden — existing marks (saved under older
  names) now appear too.

## Net effect
Marks entered in **Enter Marks** push to the **class mark list** in **every class**, and both the
rubric and Enter Marks grade dropdowns show exactly the learning areas assigned to the teacher for
that grade/stream.

## Notes
- For the cleanest behaviour, assign teachers' learning areas **per stream** (Teachers → onboard/edit).
  Teachers without per-stream assignments still work via the flat-subject fallback.
- No backend or database change; this is a frontend data-sourcing fix. Rebuild the frontend.
