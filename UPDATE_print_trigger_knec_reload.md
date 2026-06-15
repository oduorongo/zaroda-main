# ZARODA SMS — Print dialog now fires reliably · KNEC registry reloads for signup

Copy the whole folder over your working copy, restart the backend (migration runs), rebuild frontend.

## 1. Report card / mark list Print
Scripts written into a popup via document.write don't always execute, so the auto-print sometimes
never fired. The Print buttons now trigger the browser print dialog from the parent window once the
new tab has rendered (`win.focus(); win.print()` after load), with a manual "Print / Save as PDF"
button still in the page as a fallback. Applies to report card (single + bulk) and the mark list.
Allow pop-ups for localhost so the print tab can open.

## 2. KNEC code for registration ("0 codes available")
The signup KNEC-code lookup was empty because migration 022 had been recorded as applied on the
local database without its 2,407 codes actually loading. New migration
`029_knec_registry_reload.sql` re-creates the registry table if needed and re-inserts all codes
idempotently (ON CONFLICT DO NOTHING) under a new filename, so it runs once on the next boot and
fills the registry.

## After deploying
- Restart the backend. Watch for `✅ migration applied: 029_knec_registry_reload.sql` and then
  `ℹ️  KNEC registry: 2407 codes available for signup lookup` (instead of 0).
- Rebuild the frontend. Open a report card → Print → the print dialog now appears; choose Save as PDF.
- On signup, the KNEC code lookup now finds schools.

## Note
If the log still shows 0 codes, the registry table may have a stale half-applied state — tell me and
I'll add a forced refresh. The Save PDF (server) button still needs Puppeteer; Print needs nothing.
