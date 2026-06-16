# ZARODA SMS — Stream selector no longer stuck (can change selection in all 4 modules)

Copy the whole folder over your working copy, rebuild the frontend.

## The cause
Enter Marks, Class Mark List, Assessment Rubric and Report Book filtered the stream list to only
the teacher's OWN stream (and Assessment limited "see all" to a couple of admin roles). With one
stream in the list, the dropdown had nothing else to pick — so it appeared stuck on one stream
(e.g. "South"). The dashboard mark list, which loads ALL streams, was never stuck — that confirmed
the difference.

## The fix
All four modules now load the FULL list of the school's streams (same as the dashboard mark list)
and simply default the selection to the user's own stream when they have one. The dropdown stays
fully selectable, so admins and teachers can switch to any stream.

- `teacher/marks`, `teacher/mark-list`, `teacher/report-card`, `teacher/assessment` — removed the
  "own stream only" filter; show all, default to own.
- Backend already scopes /academic/streams to the school (tenant), so this only shows the school's
  own streams — no cross-school leakage.

## After deploying
Rebuild the frontend (Remove-Item -Recurse -Force .next; npm run dev). In each module the Stream
dropdown now lists every stream and changing it works.
