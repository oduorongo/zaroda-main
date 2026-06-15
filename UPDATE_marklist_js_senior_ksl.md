# ZARODA SMS — Grade 7–12 class mark list redesign · drop "Kenya Sign Language"

Copy the whole folder over your working copy, restart the backend (migration runs), rebuild frontend.

## 1. "Kenya Sign Language" removed from learning-area names
The combined Kiswahili/KSL names are now just **"Kiswahili"** (and "Kiswahili Language Activities"
for Lower Primary).
- `frontend/lib/cbc/constants.ts` updated.
- Migration `027_drop_kenya_sign_language.sql` renames existing names in the rubric
  (`assessment_templates`) and saved marks (`assessment_results`) — Grades 1–9. Idempotent.

## 2. Grade 7–12 class mark list redesigned to the official format
Based on your uploaded MARKLISTS.xlsx (Grade 7–9 sheets). For Junior School / Senior School the
class mark list now shows, per learner:
- each learning area as a **Score + PL** pair (PL = performance level points 1–8, from the %),
  with the official KNEC area codes in the header (English-901, Kiswahili-902, Mathematics-903,
  Integrated Science-905, Agriculture-906, Social Studies-907, CRE-908, Creative Arts & Sports-911,
  Pre-Technical-912);
- **Points** = sum of the PLs, out of `subjects × 8` (e.g. 72 for 9 areas);
- **Mean %** and **Overall PL** (rounded mean points);
- ranked by total points (Grades 7–12) instead of raw average.

Lower grades (PP–Grade 6) keep the existing simple score-per-area + average % layout.

## How it works
- `pdf-data.service.ts` (`buildMarkListData`) now computes per-subject points, total points, mean
  points and overall PL, and flags `isJsSenior` for grades 7–12.
- `pdf.service.ts` (`buildMarkListHtml`) branches: JS/Senior gets the new Score+PL table with KNEC
  codes and points totals; lower grades unchanged. Footer now reads
  "Powered by ZARODA Solutions · Reliable. Innovative. Forward."

## After deploying
Restart backend (watch for `✅ migration applied: 027_drop_kenya_sign_language.sql`), rebuild
frontend, open a Grade 7/8/9 class mark list (Print) to see the new format.
