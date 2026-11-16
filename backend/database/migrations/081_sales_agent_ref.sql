-- ============================================================
-- ZARODA SMS — the ZARODA sales team member who brought a school in
-- Set once at signup from the member's link (?agent=<id>) or the marketer phone/email the
-- school typed. The school, and its subscription payments, are reported to the ZARODA POS
-- API (/sales-sync/school) so the member is paid commission there. Idempotent.
-- ============================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS sales_agent_ref TEXT;
CREATE INDEX IF NOT EXISTS tenants_sales_agent_ref_idx ON tenants (sales_agent_ref) WHERE sales_agent_ref IS NOT NULL;
