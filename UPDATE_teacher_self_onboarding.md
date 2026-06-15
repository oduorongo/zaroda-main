# ZARODA SMS — Feature: Teacher self-onboarding link (share via WhatsApp)

Applied directly into the live codebase (cumulative with all prior updates).
Copy the whole `ZARODA/` folder over your working copy and restart the backend.

## What this adds
An admin (HOI/school admin) generates a single onboarding link for their school and shares it —
e.g. on the staff WhatsApp group. Each teacher opens the link, fills a short form, and is created
as a teacher **in that school/tenant** with their own login — no manual add per teacher.

## Flow
1. **Admin**: Teachers page → "Share Onboarding Link" → a modal shows the link with
   **Share via WhatsApp** (opens WhatsApp with a ready message), **Copy Link**, onboarding count,
   expiry, and a "New link" option (disables the old one).
2. **Teacher**: opens `/onboard/<token>` → enters name, email, phone, role, and the learning areas
   they teach → gets one-time login credentials on screen → logs in (prompted to set a password).

## Backend (`backend/src/modules/onboarding/teacher-onboard.module.ts`, new)
Routes (under the global `/api/v1` prefix):
- `POST /api/v1/teacher-onboard/generate` (auth) — create/reuse the school's active link; returns
  the URL + a prebuilt WhatsApp share message and `wa.me` URL.
- `GET  /api/v1/teacher-onboard/mine` (auth) — current link + who has onboarded.
- `GET  /api/v1/teacher-onboard/validate/:token` (public) — checks the link, returns the school name.
- `POST /api/v1/teacher-onboard/accept` (public) — creates the teacher in the link's tenant and
  returns one-time credentials.

Security:
- Raw token is never stored — only its SHA-256 hash. The link carries the raw token.
- Links expire (30 days) and have a max-uses cap (200). Email must be unique. Self-selected role is
  restricted to teacher roles only (subject/class/overall class teacher) — a link can never create
  an admin/HOI.
- Tenant is bound to the link, so a teacher can only join the school that generated it.

Registered in `app.module.ts` as `TeacherOnboardModule`.

### Migration — `backend/database/migrations/023_teacher_onboard_links.sql` (new)
Creates `teacher_onboard_links` and `teacher_onboard_signups`. Auto-runs on boot.

## Frontend
- `app/dashboard/academic/teachers/page.tsx` — "Share Onboarding Link" button + modal (WhatsApp,
  copy, count, expiry, regenerate).
- `app/onboard/[token]/page.tsx` (new) — public self-onboarding page.

## Config note
The link base uses the backend's `FRONTEND_URL` env var (already in `backend/.env.example`). Set it
to your deployed frontend URL on Render so the generated links point at the right place, e.g.
`FRONTEND_URL=https://<your-frontend>.vercel.app`. The frontend page uses `apiClient`
(`NEXT_PUBLIC_API_URL`), so make sure that's set too (same as the signup fix).

## Note
Credentials are shown on screen for the teacher to save. Auto-emailing them would need an email
sender wired up (not included here).
