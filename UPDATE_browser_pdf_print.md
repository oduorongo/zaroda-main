# ZARODA SMS — Report cards & mark list now print via the browser (no Puppeteer needed)

Applied directly into the live codebase (cumulative with all prior updates).
Copy the whole `ZARODA/` folder over your working copy, restart the backend, and rebuild the frontend.

## Why
Server-side PDF generation needs Puppeteer + Chromium, which wouldn't install on this machine
(npm dependency conflict) and produced a `{"message":"… requires Puppeteer"}` file instead of a PDF.
The timetable print already works because it uses the browser's own print-to-PDF. This change makes
report cards and the mark list work the same proven way, so they work immediately with no install.

## What changed (browser-print path)
- **Backend** (`pdf.service.ts`) — new HTML endpoints that return the SAME styled document the PDF
  used, wrapped with an auto-print script:
  - `GET /api/v1/pdf/report-card/:learnerId/html`
  - `GET /api/v1/pdf/report-cards/bulk/html`  (one page per learner)
  - `GET /api/v1/pdf/mark-list/html`
  `generateMarkList` was split so its HTML is reusable (`buildMarkListHtml`); `buildReportCardHtml`
  already existed. The Puppeteer PDF routes are left untouched for later.
- **Frontend**
  - `components/pdf/pdf-buttons.tsx` — new `printHtml()` helper fetches the HTML (with the auth token)
    and writes it into a new window that opens the print dialog. The Report Card and All-Report-Cards
    buttons now use it (labelled "Print / Save …"). The `download()` (Puppeteer) helper is kept.
  - `app/teacher/mark-list/page.tsx` — the PDF button now opens the printable HTML the same way.

## How it works for the user
Click Print / Save → a new tab opens with the formatted document and the browser's Print dialog →
choose "Save as PDF" (or print). Identical flow to the working timetable print.

## "Puppeteer later"
The server-side PDF routes (`/pdf/report-card/:id`, `/pdf/mark-list`, `/pdf/report-cards/bulk`) still
exist and will work once Puppeteer is installed:
```
cd backend
npm install puppeteer --legacy-peer-deps
npx puppeteer browsers install chrome
```
When you want one-click server PDFs back, point the buttons at those routes again (or I can add a
toggle). For now the browser-print path needs nothing extra.

## After deploying
- Restart the backend, rebuild the frontend (`Remove-Item -Recurse -Force .next; npm run dev`).
- Open a report card → a print tab appears → Save as PDF. No "failed to load", no install needed.

## Note
Allow pop-ups for localhost (the print opens in a new tab). If a click is blocked, the page shows a
"Print / Save as PDF" button to trigger it manually.
