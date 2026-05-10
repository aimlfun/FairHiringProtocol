-- =============================================================================
-- FHP SLA Monitoring and Ghosting Events
-- Migration: 009_sla_ghosting.sql
-- See specs/ghosting-event.schema.json
--     specs/governance-escalation-spec.md Part A
-- =============================================================================

CREATE TABLE matching.ghosting_events (
  ghosting_id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  fhp_version         TEXT          NOT NULL,

  -- Entity references
  candidate_id        UUID          NOT NULL,  -- no FK: pseudonymisation-safe
  company_id          UUID          NOT NULL
                                    REFERENCES matching.companies(company_id)
                                    ON DELETE RESTRICT,
  job_id              UUID          NOT NULL
                                    REFERENCES matching.job_briefs(job_id)
                                    ON DELETE RESTRICT,
  match_id            UUID          NOT NULL
                                    REFERENCES matching.match_events(match_id)
                                    ON DELETE RESTRICT,
  interaction_id      UUID          NULL
                                    REFERENCES matching.active_interactions(interaction_id)
                                    ON DELETE SET NULL,

  -- Stage at which the ghosting occurred
  stage_name          TEXT          NOT NULL
                      CHECK (stage_name IN (
                        'initial_match_acknowledgement',
                        'application_review',
                        'screening_call',
                        'technical_assessment',
                        'interview_stage',
                        'offer_stage',
                        'post_rejection_feedback'
                      )),

  -- SLA details
  last_contact_at     TIMESTAMPTZ   NULL,
  sla_deadline        TIMESTAMPTZ   NOT NULL,
  detected_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  overdue_hours       NUMERIC(8,2)  NULL, -- Computed and stored by SLA monitor on insert

  -- Severity
  -- minor: 0-24h overdue on normal stage
  -- significant: 24-72h overdue
  -- severe: 72+h overdue, OR any ghosting at offer_stage / post_rejection_feedback
  severity            TEXT          NOT NULL
                      CHECK (severity IN ('minor', 'significant', 'severe')),

  -- Status lifecycle
  status              TEXT          NOT NULL DEFAULT 'open'
                      CHECK (status IN (
                        'open',
                        'resolved',
                        'escalated',
                        'disputed'
                      )),

  -- Resolution
  resolved_at         TIMESTAMPTZ   NULL,
  resolution_type     TEXT          NULL
                      CHECK (resolution_type IN (
                        'late_response',
                        'rejection_sent',
                        'offer_sent',
                        'candidate_withdrew',
                        'company_disputed_and_upheld',
                        'company_disputed_and_overturned'
                      )),

  -- Notifications sent
  candidate_notified_at TIMESTAMPTZ NULL,
  company_notified_at   TIMESTAMPTZ NULL,

  -- Escalation link
  escalation_id       UUID          NULL
                                    REFERENCES matching.escalations(escalation_id)
                                    ON DELETE SET NULL,

  -- Platform actions taken (array of {action, taken_at})
  platform_actions_taken JSONB      NOT NULL DEFAULT '[]'::jsonb,

  -- Company's strike count at the time this event was detected
  company_strike_count_at_detection SMALLINT NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- One ghosting event per match per stage
  CONSTRAINT ghosting_events_unique_per_stage UNIQUE (match_id, stage_name),

  CONSTRAINT ghosting_events_sla_breach CHECK (
    detected_at >= sla_deadline
  ),
  CONSTRAINT ghosting_events_severity_offer_stage CHECK (
    stage_name NOT IN ('offer_stage', 'post_rejection_feedback')
    OR severity = 'severe'
  )
);

COMMENT ON TABLE matching.ghosting_events IS
  'Created automatically by the SLA monitor when a company breaches their '
  'response commitment. One event per match per stage. '
  'severity = severe is forced for offer_stage and post_rejection_feedback '
  'regardless of overdue hours. '
  'Feeds into company compliance score and strike counter.';

COMMENT ON COLUMN matching.ghosting_events.overdue_hours IS
  'Computed column: hours between sla_deadline and detected_at. '
  'Positive value = breach magnitude. Used for severity classification and audit.';

-- ---------------------------------------------------------------------------
-- Company strike ledger — rolling window enforcement
-- ---------------------------------------------------------------------------

CREATE TABLE matching.company_strikes (
  strike_id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID          NOT NULL
                                    REFERENCES matching.companies(company_id)
                                    ON DELETE RESTRICT,
  ghosting_id         UUID          NOT NULL
                                    REFERENCES matching.ghosting_events(ghosting_id)
                                    ON DELETE RESTRICT,
  recorded_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  -- Strikes expire after 365 days
  expires_at          TIMESTAMPTZ   NOT NULL, -- Set by application: recorded_at + 365 days

  CONSTRAINT company_strikes_unique_per_ghosting UNIQUE (ghosting_id)
);

COMMENT ON TABLE matching.company_strikes IS
  'Individual strike records for ghosting violations. '
  'Strikes expire after 365 days. '
  'The SLA monitor counts active strikes (expires_at > NOW()) '
  'to determine enforcement action (pause at 3, suspend at 5 within 90 days).';
