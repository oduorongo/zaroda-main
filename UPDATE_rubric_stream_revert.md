# ZARODA SMS — Assessment rubric: revert "Class" to "Stream"; restrict see-all to owner + admins

Copy the whole folder over your working copy, rebuild the frontend.

## Changes (app/teacher/assessment/page.tsx)
- The picker label is back to **"Stream"** (was briefly "Class").
- Only the **owner and admins** (tenant_owner, school_admin, super_admin) see **every stream**.
  All other roles (HOI, DHOI, class/subject teachers) see only their own stream(s) as before.
- Each option still shows the grade for clarity (e.g. "Grade 8 — Blue").

## After deploying
Rebuild the frontend. Owners/admins see all streams in the Assessment Book; everyone else sees
their own.
