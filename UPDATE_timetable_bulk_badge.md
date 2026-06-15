# ZARODA SMS — Maths/English first 3 periods · class-teacher bulk report cards · school badge upload

Copy the whole folder over your working copy, restart the backend, rebuild the frontend.
Re-run Auto-generate for the timetable change to take effect.

## 1. Mathematics & English in the first 3 periods (auto-timetabler)
`auto-timetabler.ts` now restricts Mathematics and English to the first three lesson periods of each
day in the main placement pass, with an extra pull toward the very front. (Both are ≤5 lessons/week,
and the first 3 periods across 5 days give 15 slots, so they fit comfortably.) If the first three are
ever full on every day, the relaxed fallback still places them rather than dropping a lesson.

## 2. Class teachers can download AND print report cards in bulk
The backend bulk routes already allowed `class_teacher`; the teacher-side page just had no button.
`app/teacher/report-card/page.tsx` now shows the bulk Report Cards button (browser print → Save as
PDF, one page per learner) once a class is selected. The dashboard report-cards page already had it.

## 3. School badge upload (Settings → appears on report cards)
- Settings (`app/dashboard/settings/page.tsx`) has a **School Badge / Logo** uploader: pick a PNG/JPG,
  it's downscaled to ≤256px and stored as a data URL; preview + remove provided. Click Save to apply.
- Backend (`school-settings.controller.ts`) stores it as `badgeBase64` in the school `settings` JSONB
  (no schema change, works on any host).
- The report-card / mark-list builders (`pdf-data.service.ts`) now use the uploaded badge as the
  document logo (falling back to a logo file if none uploaded). It shows on the customised report card.

## 4. Report card design vs the official KICD sample — NOT yet done
The uploaded Grade 7/8/9 Assessment Report Books use a **strand → sub-strand** layout: each learning
area lists its strands, every sub-strand gets a performance level (E.E/M.E/A.E/B.E), with a teacher
comment per area and a total performance level per area. The current report card is a **per-subject
summary** (one level per learning area), not that granular breakdown. Matching the official book is a
focused rebuild of the report-card data builder (fetch every saved sub-strand level) + HTML (nested
strand/sub-strand tables). Flagged for the next pass so it's done properly.

## After deploying
- Restart backend, rebuild frontend.
- Settings → upload a badge → Save → open a report card to see it.
- Re-run Auto-generate to see Maths/English move to the first 3 periods.
