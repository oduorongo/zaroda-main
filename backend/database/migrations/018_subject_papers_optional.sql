-- ============================================================
-- ZARODA SMS — Make Paper 1 / Paper 2 fully opt-in
-- 017 seeded a global default (English & Kiswahili, Junior + Senior School)
-- so every school started with those already split into two papers. Papers
-- should be a per-school/per-class choice, not forced on anyone and not
-- limited to any particular subject — remove the global defaults so a
-- school only gets Paper 1 & 2 for a learning area when it explicitly turns
-- it on (Academic → Paper 1 & 2 Setup).
-- ============================================================

DELETE FROM subject_paper_config WHERE tenant_id IS NULL;
