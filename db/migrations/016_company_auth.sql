-- =============================================================================
-- FHP Migration 016: Company Authentication + Preference Schema Extensions
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Company authentication table
-- Mirrors identity.candidate_auth structure for companies.
-- Stored in identity schema — same PII separation principle.
-- ---------------------------------------------------------------------------

CREATE TABLE identity.company_auth (
  company_id          UUID          PRIMARY KEY
                                    REFERENCES matching.companies(company_id)
                                    ON DELETE CASCADE,
  password_hash       TEXT          NOT NULL,
  auth_token          TEXT          NULL,
  auth_token_expires_at TIMESTAMPTZ NULL,
  last_login_at       TIMESTAMPTZ   NULL,
  failed_login_count  SMALLINT      NOT NULL DEFAULT 0,
  locked_until        TIMESTAMPTZ   NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE identity.company_auth IS
  'Company login credentials. Separated from matching.companies '
  'on the same PII separation principle as candidate_auth. '
  'Only fhp_identity_service may read/write this table.';

ALTER TABLE identity.company_auth ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_auth_identity_only ON identity.company_auth
  USING (
    pg_has_role(current_user, 'fhp_identity_service', 'USAGE')
    OR pg_has_role(current_user, 'fhp_superuser', 'USAGE')
  );

-- updated_at trigger
CREATE TRIGGER set_updated_at BEFORE UPDATE ON identity.company_auth
  FOR EACH ROW EXECUTE FUNCTION fhp_set_updated_at();

-- ---------------------------------------------------------------------------
-- Notifications table — candidate-facing event notifications
-- Created by: SLA monitor, pipeline completion, governance decisions
-- ---------------------------------------------------------------------------

CREATE TABLE matching.candidate_notifications (
  notification_id   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id      UUID          NOT NULL,  -- no FK: pseudonymisation-safe
  notification_type TEXT          NOT NULL
                    CHECK (notification_type IN (
                      'match_result',         -- new match processed
                      'stage_progression',    -- company advanced your application
                      'stage_invitation',     -- company inviting to next stage
                      'rejection',            -- structured rejection received
                      'ghosting_detected',    -- company breached SLA
                      'appeal_update',        -- TWG/PC action on your appeal
                      'match_correction'      -- appeal resulted in correction
                    )),
  title             TEXT          NOT NULL,
  body              TEXT          NOT NULL,
  -- Related entities (nullable — not all notifications link to an entity)
  match_id          UUID          NULL,
  interaction_id    UUID          NULL,
  appeal_id         UUID          NULL,
  job_id            UUID          NULL,
  company_id        UUID          NULL,
  -- Action buttons (JSON: [{label, action, payload}])
  actions           JSONB         NULL,
  read_at           TIMESTAMPTZ   NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_candidate_unread ON matching.candidate_notifications
  (candidate_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX idx_notif_candidate_all ON matching.candidate_notifications
  (candidate_id, created_at DESC);

COMMENT ON TABLE matching.candidate_notifications IS
  'Candidate-facing event notifications. '
  'Written by the SLA monitor, pipeline runner, and governance processes. '
  'Read by the candidate portal notification bell.';

-- ---------------------------------------------------------------------------
-- Candidate consents table — explicit consent records (GDPR Art. 9)
-- ---------------------------------------------------------------------------

CREATE TABLE matching.candidate_consents (
  consent_id        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id      UUID          NOT NULL,  -- no FK: pseudonymisation-safe
  consent_type      TEXT          NOT NULL
                    CHECK (consent_type IN (
                      'matching_service',   -- contract basis
                      'age_confirmation',   -- legal obligation
                      'fairness_metrics',   -- explicit consent Art. 9(2)(a)
                      'platform_terms'      -- contract basis
                    )),
  legal_basis       TEXT          NOT NULL,
  given_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  withdrawn_at      TIMESTAMPTZ   NULL,
  ip_address_hash   TEXT          NULL,  -- SHA-256 of IP — for audit only
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_consents_unique UNIQUE (candidate_id, consent_type)
);

COMMENT ON TABLE matching.candidate_consents IS
  'GDPR consent records. Consent cannot be deleted — only withdrawn. '
  'A withdrawn consent is recorded with withdrawn_at timestamp.';

-- ---------------------------------------------------------------------------
-- Company remediations — fairness breach remediation plans
-- ---------------------------------------------------------------------------

CREATE TABLE matching.company_remediations (
  remediation_id    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID          NOT NULL
                                  REFERENCES matching.companies(company_id),
  escalation_id     UUID          NULL
                                  REFERENCES matching.escalations(escalation_id),
  metric_breached   TEXT          NOT NULL CHECK (metric_breached IN ('DIR','EOD','SDS')),
  breach_window_num SMALLINT      NOT NULL,
  plan_text         TEXT          NOT NULL,
  submitted_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  reviewed_at       TIMESTAMPTZ   NULL,
  review_outcome    TEXT          NULL CHECK (review_outcome IN ('accepted','rejected','pending')),
  reviewer_notes    TEXT          NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Governance proposals (FHP-P documents)
-- ---------------------------------------------------------------------------

CREATE TABLE matching.governance_proposals (
  proposal_id       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_ref      TEXT          NOT NULL UNIQUE,  -- e.g. FHP-P-2025-001
  title             TEXT          NOT NULL,
  summary           TEXT          NOT NULL,
  submitted_by      TEXT          NOT NULL,
  affiliation       TEXT          NULL,
  status            TEXT          NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','under_review','accepted','rejected','withdrawn')),
  review_deadline   TIMESTAMPTZ   NULL,
  fhp_version_target TEXT         NULL,
  -- Full document stored as JSONB (sections)
  document          JSONB         NOT NULL,
  fairness_impact   JSONB         NULL,
  submitted_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ   NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Governance votes (Protocol Council vote records)
-- ---------------------------------------------------------------------------

CREATE TABLE matching.governance_votes (
  vote_id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  resolution_ref    TEXT          NOT NULL,  -- e.g. PC-2025-031
  proposal_id       UUID          NULL REFERENCES matching.governance_proposals(proposal_id),
  question          TEXT          NOT NULL,
  votes_for         SMALLINT      NOT NULL DEFAULT 0,
  votes_against     SMALLINT      NOT NULL DEFAULT 0,
  votes_abstain     SMALLINT      NOT NULL DEFAULT 0,
  total_eligible    SMALLINT      NOT NULL DEFAULT 6,  -- PC has 6 members
  majority_required SMALLINT      NOT NULL DEFAULT 4,  -- 4/6 required
  result            TEXT          NOT NULL DEFAULT 'pending'
                    CHECK (result IN ('passed','failed','pending','tied')),
  fob_veto_exercised BOOLEAN      NOT NULL DEFAULT FALSE,
  voted_at          TIMESTAMPTZ   NULL,
  notes             TEXT          NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE matching.governance_votes IS
  'Protocol Council vote records. All votes are public. '
  'result is computed: votes_for >= majority_required AND NOT fob_veto_exercised.';

-- ---------------------------------------------------------------------------
-- Indexes for new tables
-- ---------------------------------------------------------------------------

CREATE INDEX idx_remediations_company    ON matching.company_remediations (company_id, submitted_at DESC);
CREATE INDEX idx_consents_candidate      ON matching.candidate_consents (candidate_id, consent_type);
CREATE INDEX idx_proposals_status        ON matching.governance_proposals (status, submitted_at DESC);
CREATE INDEX idx_votes_result            ON matching.governance_votes (result, voted_at DESC);
