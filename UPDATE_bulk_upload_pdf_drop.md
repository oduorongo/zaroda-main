# ZARODA SMS — Bulk learner upload: drop the KNEC PDF directly

Copy the whole folder over your working copy, rebuild the frontend.

## What's added
The Bulk Upload (CBA List) modal now has a **drag-and-drop PDF** option on top of the paste box:
- Drop the KNEC/CBA class-list PDF (or click to choose it).
- The text is extracted in the browser (via pdf.js, loaded on demand), grouped back into rows by
  line position, and run through the same parser — admission no. / full name / gender.
- The preview table fills automatically; pick the stream and Upload.
- The paste box is still there as a fallback.

## How it works
`app/dashboard/academic/learners/page.tsx` — `handlePdfFile` loads pdf.js from CDN, reads each page's
text content, reconstructs lines from item positions, then calls the existing `parseBulk`. No backend
change; it posts to the same `POST /academic/learners/bulk`.

## After deploying
Rebuild the frontend. Learners → Bulk Upload (CBA List) → drop the PDF → review → Upload.

## Note
Needs internet the first time (to fetch the PDF reader from the CDN). If the school is offline, the
paste-text method still works fully offline. Multi-page lists are handled (all pages are read).
