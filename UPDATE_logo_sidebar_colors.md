# ZARODA SMS — New logo + sidebar brand colours

Copy the whole folder over your working copy, rebuild the frontend.

## Changes
- **Logo** — replaced `frontend/public/zaroda-logo.png` with your new blue Z-with-upward-arrow image.
  It updates everywhere the logo is shown (dashboard + teacher sidebars, login, signup).
- **Sidebar brand text** (both dashboard and teacher sidebars):
  - "ZARODA SCHOOL" → **white**
  - "MANAGEMENT SYSTEM" → **light orange** (#fdba74)

## After deploying
Rebuild the frontend (Remove-Item -Recurse -Force .next; npm run dev) and hard-refresh the browser
(Ctrl+Shift+R) so the new logo image loads instead of the cached one.
