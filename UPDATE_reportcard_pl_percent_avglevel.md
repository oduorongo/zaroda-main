# ZARODA SMS — Report cards: % score + performance level per area; average level for PP–G6

Copy the whole folder over your working copy, restart the backend, rebuild the frontend.

## 1. Every report card shows % Score AND Performance Level per learning area
Section C now has columns: # · Learning Area · Score · **% Score** · **Perf. Level** · Rating ·
Comments. Each area shows the raw score, the percentage, and the performance level (grade) side by
side. The totals row shows AVG % too.

## 2. Playgroup–Grade 6: average performance level
For Playgroup, PP1/PP2 and Grades 1–6:
- **Report card** — the totals row shows **Average Performance Level** (EE/ME/AE/BE), computed as
  the mean of the area levels, alongside AVG %.
- **Class mark list** — a new **Avg Level** column appears next to Avg %, showing each learner's
  average performance level (from their average %: 76+ EE, 51–75 ME, 26–50 AE, below AE BE).

Junior/Senior (Grades 7–12) keep their points-based mark list (Score + PL per area, total points).

## How it works
- `pdf-data.service.ts` — report `areaRows` now carry both `percent` and `level`; totals include
  `avgPercent` and (for lower band) `avgLevel`. Mark list learners get `avgLevel` for lower band.
- `pdf.service.ts` — report-card Section C renders the % and level columns; the lower-grade mark
  list renders the Avg Level column.

## After deploying
Restart backend, rebuild frontend. Open any report card → % and Performance Level per area. Open a
Playgroup–Grade 6 mark list and report card → average performance level shown.
