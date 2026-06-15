# ZARODA SMS — Logo + brand on the public web pages

Copy the whole folder over your working copy, rebuild the frontend.

## Changes
- **Logo** refreshed (`frontend/public/zaroda-logo.png`) with the blue Z-arrow image.
- **Landing page header** — gold "Z" box replaced with the logo image; text now "ZARODA SCHOOL"
  (navy) over "MANAGEMENT SYSTEM" (orange).
- **Login & Signup** — logo image kept; brand text now "ZARODA SCHOOL" in **white** and
  "MANAGEMENT SYSTEM" in **light orange** (#fdba74), matching the sidebar.

## After deploying
Rebuild the frontend (Remove-Item -Recurse -Force .next; npm run dev) and hard-refresh (Ctrl+Shift+R)
so the new logo image loads.
