-- ============================================================
-- MODULE 71: Server-side session revocation
--
-- Access and refresh tokens are stateless JWTs, so until now nothing could end a
-- session early: a reset password, a deactivated teacher or a demoted HOI kept
-- working until their tokens expired on their own (up to 7 days for a refresh
-- token). Every token now carries the user's token_version as `tv`; bumping the
-- column invalidates every token issued before the bump.
--
-- Additive only. Existing rows start at 0, which is also what tokens issued before
-- this migration are treated as carrying, so nobody is logged out by deploying it.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
