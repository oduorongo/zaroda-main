# ZARODA SMS — Sidebar shows the school name (not the stream name)

Copy the whole folder over your working copy, rebuild the frontend.

## Change
The dashboard sidebar's "School" section was showing the stream name. It now shows the actual
**school name**, loaded from school settings (`/schools/settings`). Set/confirm the school name in
Settings and it appears in the sidebar.

## After deploying
Rebuild the frontend (Remove-Item -Recurse -Force .next; npm run dev). The sidebar shows your school
name. If it shows "Your School", set the name under Settings → School Name and save.
