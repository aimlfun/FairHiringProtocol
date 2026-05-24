-- ---------------------------------------------------------------------------
-- 024: Governance users
-- ---------------------------------------------------------------------------
-- Credentials for governance officers and admins who can respond to
-- escalations, submit proposals, and record votes via the dashboard.
-- Stored in the identity schema (alongside candidate_auth) so the same
-- fhp_identity_user DB role can access it.
-- ---------------------------------------------------------------------------

CREATE TABLE identity.governance_users (
  user_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  username       TEXT         NOT NULL UNIQUE,
  password_hash  TEXT         NOT NULL,
  role           TEXT         NOT NULL DEFAULT 'governance'
                 CHECK (role IN ('governance', 'admin')),
  display_name   TEXT         NULL,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_login_at  TIMESTAMPTZ  NULL
);

-- The identity user already has USAGE on the identity schema from 000_roles.sql.
-- Grant row-level access for the tables we need.
GRANT SELECT, INSERT, UPDATE ON identity.governance_users TO fhp_identity_user;
