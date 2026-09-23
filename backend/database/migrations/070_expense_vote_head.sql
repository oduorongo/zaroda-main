-- ============================================================
-- MODULE 70: Charge an expense to the vote head it is spent from
--
-- Expenses carried only a `category` from a fixed list (Salaries, Utilities,
-- Supplies …) with no relationship to the vote heads parents are billed
-- against. The vote head ledger therefore never netted off: Tuition sat at a
-- permanent credit because money was received into it, and "Teaching Materials"
-- at a permanent debit because money was spent under a name no receipt ever
-- used. A head can only show what is left of it once both sides agree.
--
-- The two are kept as separate columns rather than one replacing the other:
-- `vote_head` is which fund the money came OUT of, `category` is what kind of
-- thing was bought. A school wants both — "KES 40,000 from Boarding, on Food"
-- answers a different question from either half alone.
-- ============================================================

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vote_head TEXT;

-- The books read COALESCE(vote_head, category), so expenses recorded before
-- this migration keep analysing exactly as they did — no history is rewritten
-- and no figure in a past report changes.
CREATE INDEX IF NOT EXISTS idx_expenses_vote_head
  ON expenses(tenant_id, vote_head)
  WHERE vote_head IS NOT NULL;
