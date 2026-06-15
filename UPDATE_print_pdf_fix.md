# ZARODA SMS — Report card & mark list Print now produces a PDF (like the timetable)

Copy the whole folder over your working copy, restart the backend, rebuild the frontend.

## The cause
The report card and mark list HTML routes returned a COMPLETE html document, and the wrapper then
nested it inside ANOTHER full <html> document (and bulk nested many full documents inside divs).
Browsers don't render/print nested documents reliably, so the print dialog/PDF didn't work — unlike
the timetable, which writes a single clean document and prints.

## The fix
- `sendPrintableHtml` now injects the auto-print script + button into the EXISTING document (before
  </body>) instead of wrapping a second <html> around it.
- Bulk report cards: each card's <body> contents are extracted and combined into ONE valid document
  with page breaks (instead of nested documents).
- The frontend `printHtml` now writes the HTML and lets the document's own onload print script fire —
  exactly the approach the working timetable print uses.

## Result
Report card (single + bulk) and mark list **Print** now open a clean page and the browser print
dialog, where you choose Save as PDF — the same flow that already works for the timetable.

## After deploying
Restart backend (build + start), rebuild frontend, allow pop-ups for localhost. Click Print on a
report card → the print/PDF dialog appears.
