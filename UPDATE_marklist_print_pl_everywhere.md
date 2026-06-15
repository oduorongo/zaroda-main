# ZARODA SMS — Print buttons everywhere · mark list raw + PL · school name · JS/Senior points

Copy the whole folder over your working copy, rebuild backend (build + start) and frontend.

## 1. Print on every mark list and report card
- Dashboard mark list now has a **Print / Save PDF** button (the teacher one already had it).
- Teacher report card now has an **individual** Print/Save button for the selected learner, in
  addition to the bulk button. The dashboard report-cards page already had both.
All use the same browser-print → Save as PDF flow that works for the timetable.

## 2. Mark list shows BOTH raw marks and PL (all grades)
- Lower grades (Playgroup–Grade 6): each learning area now shows **Score + PL** (PL = EE/ME/AE/BE),
  plus Avg % and Avg Level. (Previously only the raw score showed.)
- Grades 7–12: already show **Score + PL points (1–8)** per area, total **Points** (out of subjects×8),
  Mean % and Overall PL — the format from your KNEC sample.
The PL shown per learner is the same level that appears on that learner's report card.

## 3. School name + KNEC code on the mark list header
Already present and confirmed — the mark list header shows the school name (and KNEC code), with the
school badge if uploaded.

## How it works
- `pdf-data.service.ts` now stores a per-area 4-level PL (`levels`) for lower grades.
- `pdf.service.ts` lower-grade mark list renders Score+PL per area (two sub-columns), matching the
  JS/Senior layout style.

## After deploying
Rebuild backend + frontend. Open a mark list (any grade) → raw marks and PL per area, school name in
the header, Print works. Open a report card → individual + bulk Print.
