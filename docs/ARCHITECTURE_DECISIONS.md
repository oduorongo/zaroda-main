# ZARODA SOLUTIONS — ARCHITECTURE DECISIONS
## Recorded corrections from founder review

---

## DECISION 1: ZARODA Sports Base is FREE

**Ruling:** The ZARODA Sports Management System (Base) — the cross-school championship 
platform — is a **completely free, separate system**. There is no per-event billing, 
no subscription charge, and no payment required for schools to register and push 
qualified teams/athletes.

**How it works:**
- ZARODA SMS (school subscription) handles school-level sports management
- When a school qualifies a team or athletes, they push them to ZARODA Sports Base via API
- ZARODA Sports Base manages the championship — draws, fixtures, results, bibs, standings
- Results from Base flow back to the school's SMS for display
- All of this is free on both sides

**What was removed:**
- `event_price_kes` column → never added to `base_championships`
- `is_paid` / `paid_at` columns → never added to `base_championships`
- "Priced per championship event" language → removed from all docs and UI
- The `BaseSportsTab` frontend no longer shows any pricing

**What remains (correctly):**
- ZARODA SMS subscription billing (KES 2,400–3,360/stream/year) stays — 
  this is for the school management features (academic, finance, attendance, etc.)
- The sports module inside SMS (school-level teams, inter-class, talent) is 
  included in the SMS subscription at no extra charge
- ZARODA Sports Base = free, separate, API-connected

---

## DECISION 2: Library Module is FREE (included in subscription)

**Ruling:** The Library module is **completely free of charge** — it is included 
in the ZARODA SMS school subscription at no extra cost. Schools pay their 
per-stream subscription (KES 2,400 Primary/Junior or KES 3,360 Senior) and 
get all modules including the library.

**What this means in practice:**
- Library is NOT a separate paid add-on
- Library is NOT billed per term or per book
- Library is NOT excluded from any subscription tier
- All schools on any subscription tier get full library access

**What was removed:**
- All fine calculation logic (`calculateFine`, `payFine`, `fineAmount`, `finePaid`)
- `fine_per_day_kes`, `max_fine_kes`, `grace_period_days` (fine-related) from settings
- `fine_amount`, `fine_paid`, `fine_paid_at`, `fine_paid_by` columns from `library_loans`
- `pay-fine` API endpoint — completely removed
- Overdue tab showing fine totals — replaced with "Late Returns" reminder list
- "Fines" from the page subtitle and all UI labels

**What stays:**
- `overdue` loan status — informational only, triggers a reminder notification, no charge
- Late returns list — shows which books are past due so librarian can send reminders
- Return condition recording (good/fair/poor/damaged/lost) — for inventory tracking only
- Loan period, max books, renewal settings — these are operational, not financial

---

## COMPLETE ZARODA SMS MODULE PRICING SUMMARY

| Module | Included in Subscription? | Extra Charge? |
|--------|--------------------------|---------------|
| Auth & Tenancy | ✅ Included | None |
| Academic Core | ✅ Included | None |
| Finance | ✅ Included | None |
| Communication | ✅ Included | None |
| Professional Records | ✅ Included | None |
| **Library** | ✅ **Included — FREE** | **None** |
| Sports (school-level) | ✅ Included | None |
| Discipline & Guidance | ✅ Included | None |
| User Guide | ✅ Included | None |

**ZARODA Sports Base** = separate free system, API-connected, no billing.

**ZARODA SMS Subscription Rates:**
- Primary / Junior School (Grade 1–9): KES 2,400/stream/year
- Senior School (Grade 10–12): KES 3,360/stream/year
- 3+ streams (full onboarding): 30% discount applied
- 2-week free trial on signup
- Pay monthly or annually

---

## API CONNECTION: ZARODA SMS ↔ ZARODA SPORTS BASE

The two systems communicate via REST API:

**SMS → Base (push):**
```
POST https://api.zarodasports.app/v1/championships/{id}/register
  Body: { schoolId, schoolName, qualificationId, athletes: [...] }
  Returns: { registrationId, bibNumbers: [...] }
```

**Base → SMS (results callback):**
```
POST https://{school}.zarodasms.app/api/v1/sports/base/callback
  Body: { type: 'result', fixtureId, winnerId, score, ... }
```

**SMS queries Base for live standings:**
```
GET https://api.zarodasports.app/v1/championships/{id}/standings
GET https://api.zarodasports.app/v1/championships/{id}/athletes
```

This architecture means ZARODA Sports Base can also be used by schools 
that are NOT on ZARODA SMS — it is a fully independent system that SMS 
integrates with.
