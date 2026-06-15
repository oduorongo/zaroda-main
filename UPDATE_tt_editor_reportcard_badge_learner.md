# ZARODA SMS — TT editor areas · report-card Print/Save · TT badge+footnote · single learner name

Copy the whole folder over your working copy, restart backend, rebuild frontend.

## 1. Timetable editor dropdown — only this class's learning areas
The assign-period dropdown previously listed every teacher × every subject they teach (across all
classes). It now lists strictly the learning areas of the selected class's grade (from the assessment
rubric, falling back to the KICD band list), each paired with a teacher who teaches it. Subjects not
offered in that class no longer appear.

## 2. Report card — separate Print and Save buttons (like the timetable)
`ReportCardButton` and `BulkReportCardsButton` now render TWO buttons:
- **Print** — opens the browser print view (works now, no Puppeteer).
- **Save PDF** — downloads a PDF via the server route (works once Puppeteer is installed;
  `npm install puppeteer --legacy-peer-deps` then `npx puppeteer browsers install chrome`).
This matches the timetable's print/download split.

## 3. Timetable print — school badge + ZARODA footnote
Class, master and teacher timetable prints now show the school **badge** (from Settings) in the
header next to the school name, and the footnote **"Powered by ZARODA Solutions · Reliable.
Innovative. Forward."** at the bottom.

## 4. Add Learner — single Full Name box
The Register Learner form now has one **Full Name** field (like the edit/admit form) instead of
separate First/Last name boxes. It's split into first/last on save, so the backend is unchanged.

## After deploying
Restart backend, rebuild frontend. Upload a badge in Settings to see it on timetable prints.
