# ZARODA SMS — Report card rebuilt to match the official CBC Academic Report Form

Copy the whole folder over your working copy, restart the backend, rebuild the frontend.

## What changed
The report card (single + bulk, Print + Save) now renders the official **CBC Learner Academic
Progress Report** layout from your sample PDF, with all seven sections:

- **A. School Information** — School Name, KNEC Code, Sub-County, County, Class Teacher
- **B. Learner Information** — Learner Name, Adm No., Grade/Class, Date of Birth, Gender,
  Parent/Guardian, Contact
- **C. Learning Areas Performance** — one row per learning area **for that learner's grade**
  (#, Learning Area, Score, Grade, Rating EE/ME/AE/BE, Comments), then TOTAL / AVG /
  Overall Grade / Overall Rating
- **D. Holistic Development** — 6 areas rated 1–4 (Social Skills & Teamwork, Communication &
  Expression, Creativity & Innovation, Digital Literacy, Sports & Physical Activities,
  Leadership & Responsibility)
- **E. Attendance** — Total Days, Present, Absent, Punctuality
- **F. Co-curricular Activities** — Activity/Club, Achievement
- **G. Remarks & Signatures** — Class Teacher, Head Teacher, Parent/Guardian (name/sign/date)
- Footer: confidential note + **Powered by ZARODA Solutions · Reliable. Innovative. Forward.**

## Per-grade, per-learner
Section C is built from the **assessment rubric for the learner's own grade**, so each grade shows
its correct learning areas (PP1 shows PP1 areas, Grade 4 shows Grade 4 areas, etc.). Every area
appears even if not yet scored. Score, grade and rating come from the learner's saved marks; the
school badge (Settings), county/sub-county, class teacher, guardian and contact all populate from
existing data.

## How it works
- `pdf-data.service.ts` (`buildReportCardData`) now also returns `areaRows` (every grade area with
  index/score/grade/rating/comment), `totals` (total, average, overall rating), school county/
  sub-county, and learner guardian/contact. Bulk reuses the same builder, so bulk cards are identical.
- `pdf.service.ts` (`buildReportCardHtml`) was rebuilt to render sections A–G as above. The school
  badge appears in the header.

## Printing
Works through the browser **Print** button now (no Puppeteer). **Save PDF** works once Puppeteer is
installed. Holistic ratings map from the behaviour record where available; Digital Literacy, Sports,
Punctuality and Co-curricular are left blank for manual entry since they aren't tracked yet.

## After deploying
Restart backend, rebuild frontend, open a report card → it now matches the CBC form. Upload a school
badge in Settings to brand the header.
