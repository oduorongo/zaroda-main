# ZARODA SMS — Fix: signup not picking up KNEC codes

Applied directly into the live codebase (cumulative with all prior updates).

## Why it wasn't working
The signup page (`frontend/app/auth/signup/page.tsx`) was calling the backend with **relative
URLs** — `fetch('/api/v1/location/schools/...')`, `fetch('/api/v1/location/counties')`,
`fetch('/api/v1/auth/signup')`, etc. A relative URL hits the **frontend's own origin**, not the
backend. So:
- On split hosting (Vercel frontend + Render backend), those requests went to the Vercel domain,
  which has no `/api/v1` routes → the KNEC lookup returned nothing and never matched a code.
- The file even had an `API` constant (pointing at `NEXT_PUBLIC_API_URL`) defined for exactly
  this purpose, but the fetch calls weren't using it.

The backend itself was fine: `lookupSchool` queries `knec_school_registry` and already normalises
the code (exact, punctuation-stripped, digits-only, and case-insensitive matches), the entity is
registered, and `LocationModule` is wired into `AppModule`.

## What changed
- **frontend/app/auth/signup/page.tsx** — all four calls now use the `${API}` base
  (`NEXT_PUBLIC_API_URL` + `/api/v1`) so they reach the backend origin:
  - counties, sub-counties, KNEC school lookup, and the signup POST.
- **frontend/.env.example** (new) — documents the required `NEXT_PUBLIC_API_URL`.

## ACTION REQUIRED — set the backend URL in production
The frontend falls back to `http://localhost:3000` when `NEXT_PUBLIC_API_URL` is unset. For the
deployed site you MUST set it:
- **Vercel** → Project → Settings → Environment Variables →
  `NEXT_PUBLIC_API_URL = https://<your-render-backend>.onrender.com`
  (no trailing slash, do NOT append `/api/v1` — the app adds it).
- Redeploy the frontend after setting it.

Without this, the lookup still points at localhost in production and will appear to "not pick up
codes" even with the code fix.

## Also confirm the data is loaded
The codes live in `knec_school_registry`, populated by migration
`022_knec_registry_bulk_load.sql`. Make sure that migration has actually run on the deployed
database (the backend auto-runs migrations on boot and records them in `_migrations`). Quick check:
```sql
SELECT COUNT(*) FROM knec_school_registry;          -- expect ~2407
SELECT * FROM knec_school_registry WHERE knec_code = '44736226';  -- Manyonge sample
```
If the count is 0, the backend hasn't applied 022 yet — restart it and watch the logs for
`✅ migration applied: 022_knec_registry_bulk_load.sql`.

## How to test end-to-end
1. Backend running with migrations applied (count above is non-zero).
2. Frontend built with `NEXT_PUBLIC_API_URL` pointing at the backend.
3. On signup, type a known code (e.g. `44736226`) and click **Look up** → the school name should
   auto-fill. Codes stored without a name still resolve (status "found", name blank).
