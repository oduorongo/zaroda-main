# ZARODA SMS — Teachers now see ALL streams they're assigned to (not just one)

Copy the whole folder over your working copy, rebuild the frontend.

## The real cause
When a teacher is onboarded with learning areas in several streams, the backend correctly saves a
row per stream in `teacher_stream_subjects`, but it only writes ONE "primary" stream onto the user
record (`user.streamId`). Every teacher-facing view was deriving "my streams" from that single
`user.streamId` (or class-teacher ownership) — so a teacher assigned to 3 streams saw only 1.

## The fix
All teacher views now derive the teacher's streams from their actual assignments
(`/academic/teachers/:id/stream-subjects` → the distinct streamIds), plus any stream they're class
teacher of. Applied to:
- Teacher dashboard **My Classes** (and the full **Classes** page)
- **Enter Marks**, **Class Mark List**, **Assessment Rubric**, **Report Book**

Admins/HOI still see all streams. A subject teacher now sees every stream they teach in, and the
dropdown is selectable across all of them (defaulting to their primary stream).

## After deploying
Rebuild the frontend. Log in as the teacher → My Classes shows all 3 streams, and the Stream
dropdown in each module lists all 3 and lets you switch.

## Note
This reads the assignments saved at onboarding. If a stream is still missing, it means that
stream's learning-area assignment didn't save for the teacher — re-open the teacher in admin,
confirm the areas are ticked under each of the 3 streams, and save.
