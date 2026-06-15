# ZARODA SMS — Bulk learner upload from the KNEC/CBA class list

Copy the whole folder over your working copy, restart the backend, rebuild the frontend.

## What it does
Every Kenyan school has the KNEC/CBA class list (Assessment No · Full Name · Gender · Disability ·
KSL/KIS · Religious Subject). You can now bulk-register a whole stream from it, using only the
first three columns:
- Column 1 → **admission number** (the KNEC assessment number is kept as the admission no.)
- Column 2 → **full name** (split into first/last on save)
- Column 3 → **gender** (M/F → male/female)
All other columns are ignored.

## How to use
1. Learners page → **Bulk Upload (CBA List)**.
2. Choose the stream to upload into.
3. Paste the rows from the list (copy the text straight out of the KNEC PDF).
4. Click **Preview rows** — it parses each line, skipping headers/footers, and shows Adm No / Full
   Name / Gender for you to check.
5. Click **Upload** — learners are created in that stream; duplicates (same admission no. already in
   the school) are skipped and reported.

## How it works
- `academic-core.service.ts` `bulkCreate` now keeps the provided admission number (instead of always
  auto-generating) and skips existing admission numbers.
- New route `POST /academic/learners/bulk`.
- Learners page has a Bulk Upload modal with a tolerant parser: first token = admission no, the
  standalone M/F token = gender, the words between = full name. Works for multi-word names.

## Note
Paste the **text** of the list (select-all in the PDF and copy). Designed for Grade 3 upward (where
learners have KNEC assessment numbers), but works for any stream. Grade level comes from the chosen
stream. Academic year defaults to 2025/2026.
