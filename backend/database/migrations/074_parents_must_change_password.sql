-- ============================================================
-- MODULE 74: Parents choose their own password at next login
--
-- Parent logins were issued with a password derived from the parent's email or
-- phone plus the year (e.g. "johndoe2026") — guessable by anyone who knows the
-- address. New temporary passwords are now random, and must_change_password is
-- enforced by the API. This flags every existing parent account so they pick a
-- new password the next time they sign in. No password is changed or reset here.
--
-- Accounts whose password was set by an admin (teacher onboarding, an HOI or
-- owner reset) were already written with must_change_password = true, and nothing
-- cleared it except the emailed reset link, so they need no change here.
-- ============================================================

UPDATE users SET must_change_password = true
 WHERE role = 'parent' AND must_change_password IS DISTINCT FROM true;
