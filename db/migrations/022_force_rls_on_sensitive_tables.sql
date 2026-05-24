-- Migration 022: FORCE ROW LEVEL SECURITY on PII and special-category tables
--
-- PostgreSQL superusers bypass RLS by default. FORCE ROW LEVEL SECURITY
-- ensures that even a superuser connection is subject to the same RLS
-- policies as any other role, so a misconfigured DB pool (e.g. all three
-- pools pointing at the same postgres superuser in dev) cannot silently
-- read PII or demographic data it should not see.
--
-- Tables protected:
--   identity.candidate_identity   — contact email (PII)
--   identity.candidate_auth       — password hashes, login state (PII)
--   matching.candidate_demographics — sex/ethnicity/religion (GDPR Art. 9)

ALTER TABLE identity.candidate_identity     FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.candidate_auth         FORCE ROW LEVEL SECURITY;
ALTER TABLE matching.candidate_demographics FORCE ROW LEVEL SECURITY;
