# ZARODA SMS — Branding: use the ZARODA logo with "ZARODA SCHOOL" / "school management"

Applied directly into the live codebase (cumulative with all prior updates).
Copy the whole `ZARODA/` folder over your working copy and rebuild/restart the frontend.

## What changed
The placeholder gold "Z" tile is replaced with the actual ZARODA logo image, paired with
**ZARODA SCHOOL** (bold) and **school management** beneath it.

- **New asset:** `frontend/public/zaroda-logo.png` (your uploaded BLUE_ZARODA_LOGO2.png).
  In Next.js, files in `public/` are served from the site root, so it's referenced as
  `/zaroda-logo.png`.

- **Updated brand lockups:**
  - `frontend/app/dashboard/layout.tsx` — sidebar (admin).
  - `frontend/app/teacher/layout.tsx` — sidebar (teacher portal).
  - `frontend/app/auth/login/page.tsx` — login screen.
  - `frontend/app/auth/signup/page.tsx` — signup screen (kept consistent).

Each now shows the logo image next to/above "ZARODA SCHOOL" in bold with "school management" below.

## Note
If the logo doesn't appear after deploying, confirm `public/zaroda-logo.png` was included in the
copy and that the frontend was rebuilt (Next.js serves `public/` at the root path `/`).
