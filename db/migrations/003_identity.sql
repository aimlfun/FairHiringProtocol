-- =============================================================================
-- FHP Identity Schema
-- Migration: 003_identity.sql
--
-- PRIVACY BOUNDARY: These tables contain the ONLY personal data in FHP.
-- The matching engine role has zero access to this schema.
-- See specs/database-architecture.md §4.2
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Candidate identity — name, email, contact details
-- Never queried by the matching engine. Never joined to match results.
-- ---------------------------------------------------------------------------

CREATE TABLE identity.candidate_identity (
  candidate_id        UUID          PRIMARY KEY,
  -- No name field — FHP does not store candidate names (by design)
  -- See specs/legal-compliance.md §1.3
  contact_email       TEXT          NOT NULL,
  contact_phone       TEXT          NULL,
  preferred_language  TEXT          NOT NULL DEFAULT 'en',
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT candidate_identity_email_unique UNIQUE (contact_email),
  CONSTRAINT candidate_identity_email_format CHECK (
    contact_email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
  ),
  CONSTRAINT candidate_identity_language_format CHECK (
    preferred_language ~ '^[a-z]{2}(-[A-Z]{2})?$'
  )
);

COMMENT ON TABLE identity.candidate_identity IS
  'Candidate PII — email and optional phone. '
  'Separated from candidate_profiles by architectural boundary. '
  'fhp_matching_engine has NO access to this table. '
  'GDPR Art. 25 (Privacy by Design) implementation.';

COMMENT ON COLUMN identity.candidate_identity.candidate_id IS
  'Foreign key to matching.candidate_profiles. '
  'The matching engine never queries this table — it operates on candidate_id only.';

COMMENT ON COLUMN identity.candidate_identity.contact_email IS
  'Used for authentication and notifications only. '
  'Never shared with employers. Never passed to the matching engine.';

-- ---------------------------------------------------------------------------
-- Candidate authentication
-- ---------------------------------------------------------------------------

CREATE TABLE identity.candidate_auth (
  candidate_id          UUID          PRIMARY KEY
                                      REFERENCES identity.candidate_identity(candidate_id)
                                      ON DELETE CASCADE,
  -- Hashed password (bcrypt) or null if using OAuth/magic link only
  password_hash         TEXT          NULL,
  -- For magic link / passwordless auth
  auth_token            TEXT          NULL,
  auth_token_expires_at TIMESTAMPTZ   NULL,
  -- For OAuth providers
  oauth_provider        TEXT          NULL,
  oauth_provider_id     TEXT          NULL,
  -- Session management
  last_login_at         TIMESTAMPTZ   NULL,
  failed_login_count    SMALLINT      NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ   NULL,
  -- Age verification
  age_confirmed         BOOLEAN       NOT NULL DEFAULT FALSE,
  age_confirmed_at      TIMESTAMPTZ   NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT candidate_auth_oauth_unique UNIQUE (oauth_provider, oauth_provider_id),
  CONSTRAINT candidate_auth_age_check CHECK (
    age_confirmed = FALSE OR age_confirmed_at IS NOT NULL
  )
);

COMMENT ON TABLE identity.candidate_auth IS
  'Authentication credentials. Deleted on account deletion. '
  'Separated from identity to allow credential rotation without touching PII.';

COMMENT ON COLUMN identity.candidate_auth.age_confirmed IS
  'Candidate has confirmed they are 18+. Required before first match run. '
  'See specs/legal-compliance.md §2.9 (Children and minors).';

-- ---------------------------------------------------------------------------
-- RLS on identity schema — additional defence in depth
-- (schema-level grants already prevent engine access; RLS adds belt-and-braces)
-- ---------------------------------------------------------------------------

ALTER TABLE identity.candidate_identity  ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.candidate_auth      ENABLE ROW LEVEL SECURITY;

-- Only the identity service role may access these tables
CREATE POLICY identity_service_only ON identity.candidate_identity
  USING (pg_has_role(current_user, 'fhp_identity_service', 'USAGE')
      OR pg_has_role(current_user, 'fhp_superuser', 'USAGE'));

CREATE POLICY identity_service_only ON identity.candidate_auth
  USING (pg_has_role(current_user, 'fhp_identity_service', 'USAGE')
      OR pg_has_role(current_user, 'fhp_superuser', 'USAGE'));
