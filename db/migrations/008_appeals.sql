-- =============================================================================
-- FHP Appeals and Governance Escalations
-- Migration: 008_appeals.sql
-- See specs/governance-escalation-spec.md Part B
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Appeals
-- ---------------------------------------------------------------------------

CREATE TABLE matching.appeals (
  appeal_id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            UUID          NOT NULL
                                    REFERENCES matching.match_events(match_id)
                                    ON DELETE RESTRICT,
  candidate_id        UUID          NOT NULL,  -- no FK: pseudonymisation-safe
  job_id              UUID          NOT NULL
                                    REFERENCES matching.job_briefs(job_id)
                                    ON DELETE RESTRICT,

  -- Submission
  submitted_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  ground              TEXT          NOT NULL
                      CHECK (ground IN (
                        'incorrect_skill_assessment',
                        'preference_mismatch',
                        'suspected_bias'
                      )),
  detail              TEXT          NOT NULL,
  CONSTRAINT appeals_detail_min_length CHECK (char_length(detail) >= 20),

  -- State machine: submitted → twg_review → pc_review → [fob_review →] resolved
  status              TEXT          NOT NULL DEFAULT 'submitted'
                      CHECK (status IN (
                        'submitted',
                        'twg_review',
                        'pc_review',
                        'fob_review',
                        'resolved',
                        'withdrawn'
                      )),

  -- TWG finding
  twg_assigned_at     TIMESTAMPTZ   NULL,
  twg_finding         TEXT          NULL,
  twg_error_found     BOOLEAN       NULL,
  twg_completed_at    TIMESTAMPTZ   NULL,
  twg_deadline        TIMESTAMPTZ   NULL, -- Set by application (submitted_at + 10 business days)

  -- PC decision
  pc_assigned_at      TIMESTAMPTZ   NULL,
  pc_decision         TEXT          NULL,
  pc_completed_at     TIMESTAMPTZ   NULL,

  -- FOB review (if referred)
  fob_assigned_at     TIMESTAMPTZ   NULL,
  fob_notes           TEXT          NULL,
  fob_completed_at    TIMESTAMPTZ   NULL,

  -- Resolution
  outcome             TEXT          NULL
                      CHECK (outcome IN (
                        'upheld',
                        'overturned',
                        'partially_upheld',
                        'referred_to_fob',
                        'pending'
                      )),
  resolved_at         TIMESTAMPTZ   NULL,

  -- Eligibility window — 30 days from match created_at
  submission_deadline TIMESTAMPTZ   NOT NULL,  -- set at insert time: match created_at + 30 days

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- One active appeal per match
  CONSTRAINT appeals_one_active_per_match UNIQUE (match_id)
    DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON TABLE matching.appeals IS
  'Candidate appeals against automated match outcomes. '
  'State machine enforced at application layer (appeals/state-machine.ts). '
  'TWG reviews trace; PC makes final decision; FOB if systemic. '
  'Submission window: 30 days from match outcome. '
  'See specs/governance-escalation-spec.md §B.5';

-- ---------------------------------------------------------------------------
-- Governance escalations
-- Covers all escalation types — ghosting, fairness, appeals, compliance
-- ---------------------------------------------------------------------------

CREATE TABLE matching.escalations (
  escalation_id       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  escalation_type     TEXT          NOT NULL
                      CHECK (escalation_type IN (
                        'ghosting_escalation',
                        'fairness_breach_escalation',
                        'candidate_appeal',
                        'bias_correction_alert',
                        'company_compliance_violation',
                        'governance_challenge'
                      )),

  -- Subject entity
  subject_entity_type TEXT          NOT NULL
                      CHECK (subject_entity_type IN (
                        'candidate', 'company', 'match', 'job_brief', 'governance_decision'
                      )),
  subject_entity_id   UUID          NOT NULL,

  -- Linked records
  linked_appeal_id    UUID          NULL REFERENCES matching.appeals(appeal_id),
  linked_company_id   UUID          NULL REFERENCES matching.companies(company_id),

  -- Priority and assignment
  priority            TEXT          NOT NULL DEFAULT 'standard'
                      CHECK (priority IN ('standard', 'urgent', 'critical')),
  assignee_body       TEXT          NOT NULL
                      CHECK (assignee_body IN (
                        'twg', 'protocol_council', 'fairness_oversight_board', 'joint_session'
                      )),

  -- Status
  status              TEXT          NOT NULL DEFAULT 'open'
                      CHECK (status IN (
                        'open', 'in_review', 'pending_response', 'resolved', 'appealed'
                      )),

  -- Resolution SLA — computed from type + priority at creation
  resolution_deadline TIMESTAMPTZ   NOT NULL,

  -- Outcome
  outcome             TEXT          NULL
                      CHECK (outcome IN (
                        'upheld', 'not_upheld', 'partially_upheld', 'referred', 'pending'
                      )),
  outcome_notes       TEXT          NULL,
  public_summary      TEXT          NULL,  -- published in public audit log (PII redacted)

  raised_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  raised_by           TEXT          NOT NULL
                      CHECK (raised_by IN (
                        'candidate', 'company', 'platform_monitor',
                        'governance_member', 'fob_member'
                      )),
  resolved_at         TIMESTAMPTZ   NULL,

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE matching.escalations IS
  'All governance escalation types. '
  'resolution_deadline computed from type + priority per governance-escalation-spec.md §B.4. '
  'public_summary published in audit.audit_log on resolution.';
