-- =============================================================================
-- FHP Matching Tables
-- Migration: 007_matching.sql
-- match_events, match_explanations, active_interactions
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Match events — one row per pipeline run outcome
-- ---------------------------------------------------------------------------

CREATE TABLE matching.match_events (
  match_id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id        UUID          NOT NULL,  -- no FK to candidate_profiles: pseudonymisation-safe
  job_id              UUID          NOT NULL
                                    REFERENCES matching.job_briefs(job_id)
                                    ON DELETE RESTRICT,
  company_id          UUID          NOT NULL
                                    REFERENCES matching.companies(company_id)
                                    ON DELETE RESTRICT,
  fhp_version         TEXT          NOT NULL,
  pipeline_version    TEXT          NOT NULL,

  -- Outcome
  decision            TEXT          NOT NULL
                      CHECK (decision IN ('matched', 'not_matched', 'borderline')),

  -- Scores — pre and post bias correction
  overall_score       NUMERIC(6,4)  NOT NULL CHECK (overall_score BETWEEN 0 AND 1),
  pre_correction_score NUMERIC(6,4) NOT NULL CHECK (pre_correction_score BETWEEN 0 AND 1),
  skill_score         NUMERIC(6,4)  NOT NULL CHECK (skill_score BETWEEN 0 AND 1),
  transferable_skill_score NUMERIC(6,4) NOT NULL DEFAULT 0
                      CHECK (transferable_skill_score BETWEEN 0 AND 1),
  preference_alignment_score NUMERIC(6,4) NOT NULL
                      CHECK (preference_alignment_score BETWEEN 0 AND 1),
  bias_correction_delta NUMERIC(6,4) NOT NULL DEFAULT 0
                      CHECK (bias_correction_delta BETWEEN -1 AND 1),

  -- Bias correction applied?
  bias_correction_triggered BOOLEAN NOT NULL DEFAULT FALSE,

  -- For fairness computation — was this candidate skill-qualified?
  -- True if passed constraint satisfaction (Stage 3) — used for EOD metric
  qualified           BOOLEAN       NOT NULL DEFAULT FALSE,

  -- Appeal eligibility — always true per candidate rights charter
  appeal_eligible     BOOLEAN       NOT NULL DEFAULT TRUE,
  -- appeal_deadline is computed as created_at + 30 days
  -- Set by insert trigger (NOW() is not immutable in generated columns)

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()

  -- No updated_at — match events are immutable after creation
  -- No DELETE trigger needed — referential integrity prevents casual deletion
);

COMMENT ON TABLE matching.match_events IS
  'One row per pipeline execution. Immutable after creation. '
  'candidate_id has no FK constraint to support pseudonymisation: '
  'when a candidate is deleted, their candidate_id is replaced with a new UUID '
  'and the history is retained anonymously. '
  'See legal/pseudonymisation-procedure.md';

COMMENT ON COLUMN matching.match_events.qualified IS
  'True if the candidate passed Stage 3 constraint satisfaction. '
  'Used as the denominator for EOD (Equal Opportunity Difference) computation. '
  'See specs/bias-correction-spec.md §3.2';

-- ---------------------------------------------------------------------------
-- Match explanations — three per match (candidate, employer, governance)
-- Immutable after creation
-- ---------------------------------------------------------------------------

CREATE TABLE matching.match_explanations (
  explanation_id      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            UUID          NOT NULL
                                    REFERENCES matching.match_events(match_id)
                                    ON DELETE RESTRICT,
  candidate_id        UUID          NOT NULL,  -- no FK: pseudonymisation-safe
  job_id              UUID          NOT NULL
                                    REFERENCES matching.job_briefs(job_id)
                                    ON DELETE RESTRICT,

  audience            TEXT          NOT NULL
                      CHECK (audience IN ('candidate', 'employer', 'governance')),

  -- Core explanation content
  plain_language_summary  TEXT      NOT NULL,
  not_matched_reasons     JSONB     NULL,   -- array of {reason_code, human_readable, ...}
  skill_breakdown         JSONB     NOT NULL, -- array of skill assessment entries
  scores_snapshot         JSONB     NOT NULL, -- snapshot of scores at time of generation
  bias_assessment         JSONB     NOT NULL, -- audience-filtered bias record
  next_steps              JSONB     NULL,   -- candidate audience only

  -- Appeal
  appeal_eligible     BOOLEAN       NOT NULL DEFAULT TRUE,

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT match_explanations_unique_per_audience
    UNIQUE (match_id, audience)
);

COMMENT ON TABLE matching.match_explanations IS
  'Three explanation records per match — one per audience. '
  'Employer audience: no bias_assessment detail, no candidate PII. '
  'Governance audience: full record including bias correction details. '
  'Candidate audience: skill breakdown, reasons, next steps. '
  'All three are immutable after creation.';

-- ---------------------------------------------------------------------------
-- Active interactions — open candidate-company hiring processes
-- Drives SLA monitoring. One row per candidate-job pairing in progress.
-- ---------------------------------------------------------------------------

CREATE TABLE matching.active_interactions (
  interaction_id      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            UUID          NOT NULL
                                    REFERENCES matching.match_events(match_id)
                                    ON DELETE RESTRICT,
  candidate_id        UUID          NOT NULL,
  company_id          UUID          NOT NULL
                                    REFERENCES matching.companies(company_id)
                                    ON DELETE RESTRICT,
  job_id              UUID          NOT NULL
                                    REFERENCES matching.job_briefs(job_id)
                                    ON DELETE RESTRICT,

  -- Current stage in the hiring process
  current_stage       TEXT          NOT NULL
                      CHECK (current_stage IN (
                        'initial_match_acknowledgement',
                        'application_review',
                        'screening_call',
                        'technical_assessment',
                        'interview_stage',
                        'offer_stage',
                        'post_rejection_feedback',
                        'completed',
                        'withdrawn'
                      )),

  stage_entered_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  last_contact_at     TIMESTAMPTZ   NULL,

  -- SLA — computed from stage + job brief response_sla_days
  sla_deadline        TIMESTAMPTZ   NOT NULL,

  -- Override: company committed to shorter SLA than default
  sla_override_days   SMALLINT      NULL
                      CHECK (sla_override_days BETWEEN 1 AND 10),

  -- Interaction outcome
  outcome             TEXT          NULL
                      CHECK (outcome IN (
                        'hired',
                        'rejected',
                        'candidate_withdrew',
                        'role_cancelled',
                        'role_filled_by_other'
                      )),

  -- Rejection details (required on rejection per company-compliance.md §4.2)
  rejection_reason_code TEXT        NULL,
  rejection_notes       TEXT        NULL,
  rejection_sent_at     TIMESTAMPTZ NULL,

  status              TEXT          NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'completed', 'escalated')),

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT active_interactions_match_unique UNIQUE (match_id),
  CONSTRAINT active_interactions_sla_after_stage CHECK (
    sla_deadline > stage_entered_at
  )
);

COMMENT ON TABLE matching.active_interactions IS
  'Open hiring processes between a candidate and a company. '
  'The SLA monitor polls this table every 4 hours. '
  'One row per match — updated as the candidate moves through stages. '
  'sla_deadline is recomputed each time current_stage changes.';

COMMENT ON COLUMN matching.active_interactions.sla_deadline IS
  'Computed as: stage_entered_at + SLA_DAYS[current_stage] business days. '
  'The SLA monitor creates a GhostingEvent when NOW() > sla_deadline and status = active. '
  'See specs/governance-escalation-spec.md Part A §A.2';
