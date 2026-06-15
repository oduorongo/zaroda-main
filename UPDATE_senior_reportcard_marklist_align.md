# ZARODA SMS — Senior report card now truly mirrors the class mark list

Copy the whole folder over your working copy, restart the backend, rebuild the frontend.

## Two fixes (pdf-data.service.ts)
1. **Areas now come from the same source as the mark list.** For Grades 10–12 the report card's
   learning areas are the 4 core areas + every elective offered in the learner's **stream** (the
   exact union the mark list builds its columns from), plus the learner's own electives and any
   area they already have a mark in. Previously it relied only on the learner's entered marks, so
   areas were missed if marks weren't in yet.
2. **Mark query no longer over-filters by academic year.** The report card filtered marks by term
   AND academic year, while the mark list filters by term only. A year-string mismatch
   ("2026" vs "2025/2026" or null) silently dropped every mark, leaving the card blank. It now
   falls back to a term-only match when the year-filtered query returns nothing, so scores show.

## Result
Open a Grade 10–12 report card: it lists the same learning areas as the class mark list, with the
learner's scores filled in. Core Mathematics + Community Service Learning (shown as CSL) + the
stream's electives all appear.

## After deploying
Restart backend, rebuild frontend, open a senior report card and compare to the class mark list —
the areas now match.
