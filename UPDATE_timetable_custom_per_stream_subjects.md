# ZARODA SMS — Timetable customization, printable teacher timetable, per-stream teacher subjects

Applied directly into the live codebase (cumulative with all prior updates).
Copy the whole `ZARODA/` folder over your working copy and restart the backend.

## 1. Timetables customised with school & teacher name
- The class timetable page header now shows the **school name** (from `/schools/settings`).
- **Printing** a class timetable produces a sheet headed with the **school name**, the **class/stream
  name**, KNEC code and date — followed by the full structured grid (periods + breaks/lunch/games/PPI).
- The teacher's personal timetable is headed with the **school name** and the **teacher's name**.
- The master grid print already carries the school context per stream.

## 2. Teacher timetables are printable
- `frontend/app/teacher/timetable/page.tsx` — a **Print** button renders the teacher's own weekly
  timetable (school + teacher name, all periods with the breaks/lunch/games/PPI structure, each
  lesson showing the class it's for).
- The class timetable page also gained a per-class **Print** button.

## 3. Learning areas assigned PER STREAM (onboarding & editing)
Previously a teacher had one flat subject list and a single class. Now you assign **which learning
areas a teacher teaches in which stream** — e.g. Mathematics in 7A and 8B, English only in 7A.

- **Migration `024_teacher_stream_subjects.sql`** (new) — table `teacher_stream_subjects`
  (teacher × stream × subject as text). Auto-runs on boot.
- **Backend**
  - `createTeacher` / `updateTeacher` accept `streamSubjects: [{ streamId, subjects[] }]`, store the
    per-stream rows, and resync the flat `users.subjects` (union) + a primary `stream_id` so all
    existing code keeps working.
  - `GET /api/v1/academic/teachers/:id/stream-subjects` returns a teacher's assignments for the edit form.
- **Frontend (`teachers` page)** — onboarding and edit forms now have a repeatable
  **"Learning Areas per Class/Stream"** block: pick a class → tick the learning areas for that class
  (the area list is the KICD set for that class's grade) → "Add another class" for more. Editing
  pre-loads the existing per-stream assignments.

### Auto-timetabler uses the precise assignments
- The block-timetable generator now reads `teacher_stream_subjects`: when a subject is plotted in a
  stream, it attaches the teacher **specifically assigned to that subject in that stream** (if free).
  This makes cross-stream clash avoidance accurate. Streams/subjects without a specific assignment
  still fall back to any teacher who lists that subject; unfilled ones are left blank to assign later.

## Notes
- Backward compatible: teachers onboarded the old way still work (their flat subjects remain). When
  you next edit them, assign per-stream to get the precise behaviour.
- A teacher who teaches across grade bands sees, on their personal timetable, the period times of
  their most common band (one grid can't show two bell schedules); all their lessons still appear.
- No data is lost on edit — saving the per-stream block replaces only that teacher's assignments.
