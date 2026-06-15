# ZARODA SMS — Fix: Grade 10–12 electives now markable → flow to mark list & report card

Copy the whole folder over your working copy, rebuild the frontend (restart backend too).

## The cause
Senior report cards weren't picking up elective learning areas because **electives were never
markable**. The Enter-Marks screen built its area list from the assessment rubric
(`assessment_templates`), which has no Grade 10–12 rows, so it fell back to just the 4 core areas.
Electives therefore got no marks — and an area with no marks can't appear on the mark list or the
report card.

## The fix
`app/teacher/marks/page.tsx` — for Grades 10–12 the markable area list is now the **4 core areas +
every elective taken by any learner in the stream** (read from the learners' `electives`, the same
union the mark list and report card use). So:

1. Set each senior learner's 3–4 electives (Add/Edit learner).
2. Enter Marks now offers core + those electives → teachers can score electives.
3. The class mark list shows core + the class's electives; each report card shows core + the
   electives that learner has marks in. All three now agree.

## After deploying
Rebuild frontend, restart backend. Make sure your Grade 10–12 learners have electives set, enter a
few elective marks, then open the class mark list and a report card — the electives now appear.

## Note
If a senior learner still shows only core areas, it means no elective marks have been entered for
them yet (or their electives aren't set). Set electives on the learner, then enter the marks.
