# ZARODA SMS — Senior report-card areas from mark list · CSL abbreviation · rubric grade picker

Copy the whole folder over your working copy, restart the backend, rebuild the frontend.

## 1. Senior report card mirrors the class mark list
For Grades 10–12 the report card now shows the 4 core areas plus the electives the learner
**actually has marks in** (the same areas that appear for them on the class mark list), so the
report card and mark list always agree — even if electives weren't pre-set on the learner record.
(`pdf-data.service.ts` builds the senior area list from core + chosen electives + marked areas.)

## 2. Community Service Learning shown as "CSL"
Both the report card and the class mark list now display **CSL** instead of the full
"Community Service Learning". The underlying canonical name is unchanged, so mark matching still
works. (`abbrevArea()` in `pdf.service.ts`, applied to area cells/headers.)

## 3. Assessment rubric grade/learning-area picker fixed
The rubric was listing only the teacher's own class, so it appeared "stuck" and didn't offer other
grades. Now:
- Office roles (HOI/DHOI/admins/owner) see **all classes across every grade**; subject/class
  teachers see their own classes.
- Each option shows its **grade** (e.g. "Grade 8 — Blue") so the grade is clear, and selecting it
  loads that grade's learning areas.
(`app/teacher/assessment/page.tsx`, also used by the dashboard Assessment Book.)

## After deploying
Restart backend, rebuild frontend. Open the Assessment Book — the class picker now lists every
grade's classes. Check a senior report card and class mark list — areas match and CSL is abbreviated.
