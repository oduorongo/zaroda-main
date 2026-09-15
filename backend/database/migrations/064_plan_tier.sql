-- ============================================================
-- MODULE 64: Essential vs Pro subscription plan
-- Essential = fee recording only. Pro unlocks detailed reports/analytics,
-- payroll, HR (staff records/appraisals/discipline records), and student
-- transport, for a flat KES 4,500/tenant/year on top of the per-stream base rate.
-- ============================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'essential';

-- Every school already onboarded before this plan split keeps full (Pro) access —
-- they built up usage of payroll/HR/transport under no such restriction, so
-- introducing the gate must not silently take features away from them.
UPDATE tenants SET plan_tier = 'pro' WHERE plan_tier = 'essential';
