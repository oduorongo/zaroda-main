# ZARODA SMS — Consistent "Stream" terminology across the 4 modules + academic core

Copy the whole folder over your working copy, rebuild the frontend.

## What changed
The stream selector now uses the SAME label ("Stream") and the SAME option text (the stream's name)
in all four modules, so a stream looks identical everywhere and selections line up:

- **Enter Marks** (`teacher/marks`) — label "Class" → "Stream".
- **Class Mark List** (`teacher/mark-list`) — label "Class" → "Stream".
- **Report Book** (`teacher/report-card`) — label "Class" → "Stream".
- **Assessment Rubric** (`teacher/assessment`, also used by the dashboard Assessment Book) — the
  dropdown was showing "Grade 8 — Blue"; now shows just the stream name "Blue" like the others.
  (Label was already "Stream".)
- Dashboard Mark List & Report Cards already used "Stream" — unchanged.

## Academic core (admin)
- Academic landing: the Streams card subtitle "Classes & teachers" → "Streams & teachers".

## Result
Every stream dropdown across Enter Marks, Mark List, Assessment Rubric and Report Book reads
"Stream" and lists the same stream names, so the earlier name mismatch is gone.

## After deploying
Rebuild the frontend (Remove-Item -Recurse -Force .next; npm run dev). Open each module — the stream
selector is consistent.
