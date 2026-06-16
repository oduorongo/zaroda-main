# ZARODA SMS — Stream selector: role-based visibility (admins/HOI see all, teachers see own)

Copy the whole folder over your working copy, rebuild the frontend.

## Behaviour
Across Enter Marks, Class Mark List, Assessment Rubric and Report Book:
- **Admins / HOI** (hoi, dhois, school_admin, tenant_owner, super_admin) — see ALL streams and can
  switch freely.
- **Teachers** (subject/class/overall class teacher) — see only the stream(s) they own/teach.
- Either way the dropdown **defaults to the user's own stream** when they have one, so it is never
  stuck on the wrong stream, and a teacher with one stream simply sees that one.
- Safe fallback: if a teacher has no stream match, the full list is shown rather than an empty box.

## After deploying
Rebuild the frontend (Remove-Item -Recurse -Force .next; npm run dev). Log in as an admin/HOI →
every stream is selectable. Log in as a subject teacher → their own stream, defaulting correctly.
