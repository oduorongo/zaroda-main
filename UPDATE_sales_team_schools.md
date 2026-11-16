# ZARODA sales teams earn on schools they bring in

- Sign-up remembers the ZARODA team member who brought the school in: from their link (`/auth/signup?agent=<member id>`, shown in the ZARODA Team app > Schools) or an optional "ZARODA marketer's phone or email" box. Also on "Set up a school account" (upgrade). Stored once in `tenants.sales_agent_ref` (migration `081_sales_agent_ref.sql`, runs on boot).
- Every 30 minutes `SalesSyncModule` sends those schools (suspended or not) and their successful, non-test subscription payments to the POS API `POST /sales-sync/school`. Repeat-safe on the POS side.
- Settings on the School backend (Render): `SALES_SYNC_KEY` = the same value as `SCHOOL_SALES_SYNC_KEY` on the POS API. Optional `POS_API_URL` (default https://api.zarodashop.com). Unset key = nothing is sent.
- Deploy the POS side (branch feat/school-sales-teams in zaroda-POS) first.
