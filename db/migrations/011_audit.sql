-- =============================================================================
-- FHP Audit and Legal Records
-- Migration: 011_audit.sql
-- audit_log, deletion_records, data_subject_requests
-- These tables are immutable — INSERT only, no UPDATE or DELETE
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Public audit log — governance decisions, public record
-- ---------------------------------------------------------------------------

CREATE TABLE audit.audit_log (
  log_id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  event_type          TEXT          NOT NULL
                      CHECK (event_type IN (
                        -- Governance events
                        'escalation_opened',
                        'escalation_resolved',
                        'appeal_submitted',
                        'appeal_resolved',
                        'pc_vote_recorded',
                        'fob_report_published',
                        'twg_finding_recorded',
                        -- Compliance events
                        'company_strike_recorded',
                        'company_paused',
                        'company_suspended',
                        'company_banned',
                        'ghosting_event_created',
                        'ghosting_event_resolved',
                        -- Fairness events
                        'fairness_breach_detected',
                        'fairness_breach_resolved',
                        'bias_correction_alert',
                        -- Protocol events
                        'protocol_version_published',
                        'governance_constant_updated',
                        'ontology_version_published',
                        -- System events
                        'nightly_job_completed',
                        'sla_monitor_run'
                      )),

  -- Entity references (nullable — not all events relate to a specific entity)
  company_id          UUID          NULL,
  job_id              UUID          NULL,
  escalation_id       UUID          NULL,
  appeal_id           UUID          NULL,

  -- Event detail
  summary             TEXT          NOT NULL,     -- internal full detail
  public_summary      TEXT          NULL,         -- published version (PII redacted)
  is_public           BOOLEAN       NOT NULL DEFAULT FALSE,

  -- Actor
  actor_role          TEXT          NULL,         -- governance role, not a personal name
  actor_body          TEXT          NULL
                      CHECK (actor_body IN (
                        'protocol_council', 'fairness_oversight_board',
                        'twg', 'platform', 'system'
                      )),

  -- Metadata
  metadata            JSONB         NULL,

  occurred_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()

  -- No updated_at, no delete — append-only
);

COMMENT ON TABLE audit.audit_log IS
  'Immutable event log. Append-only — no UPDATE or DELETE. '
  'is_public=true rows are visible on the public governance dashboard. '
  'PII is never included — public_summary uses role identifiers, not names.';

-- ---------------------------------------------------------------------------
-- Deletion records — GDPR right to erasure compliance
-- Permanent record that a deletion occurred, without retaining personal data
-- See legal/pseudonymisation-procedure.md
-- ---------------------------------------------------------------------------

CREATE TABLE audit.deletion_records (
  deletion_id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One-way hash of the original candidate_id (SHA-256)
  -- Cannot be reversed to the original UUID
  -- Allows confirmation of deletion without retaining personal data
  deletion_hash       CHAR(64)      NOT NULL CHECK (deletion_hash ~ '^[a-f0-9]{64}$'),

  -- The replacement UUID now used in historical records
  replacement_id      UUID          NOT NULL,

  -- Why the deletion occurred
  trigger_type        TEXT          NOT NULL
                      CHECK (trigger_type IN (
                        'candidate_request',    -- GDPR Art. 17 erasure request
                        'minor_discovered',     -- user found to be under 18
                        'inactivity',           -- retention period expired
                        'enforcement',          -- account closed for policy violation
                        'test_data'             -- test/staging environment cleanup
                      )),

  -- Timing
  requested_at        TIMESTAMPTZ   NOT NULL,
  completed_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Confirmation that all tables were processed
  tables_pseudonymised TEXT[]       NOT NULL DEFAULT '{}',
  identity_deleted     BOOLEAN      NOT NULL DEFAULT FALSE,
  auth_deleted         BOOLEAN      NOT NULL DEFAULT FALSE,
  profile_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
  sub_processors_notified BOOLEAN   NOT NULL DEFAULT FALSE,
  sub_processors_notified_at TIMESTAMPTZ NULL,

  -- Who performed the deletion
  deleted_by          TEXT          NOT NULL,  -- role name, not a personal name

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()

  -- No updated_at, no delete — this record must be permanent
);

COMMENT ON TABLE audit.deletion_records IS
  'Permanent record of every account deletion. '
  'deletion_hash is a one-way SHA-256 hash of the original candidate_id. '
  'It enables FHP to confirm to a supervisory authority that a specific '
  'account was deleted and when, without retaining personal data. '
  'Cannot be reversed to identify the individual. '
  'See legal/pseudonymisation-procedure.md';

-- ---------------------------------------------------------------------------
-- Data subject requests — GDPR rights requests log
-- ---------------------------------------------------------------------------

CREATE TABLE audit.data_subject_requests (
  request_id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Anonymised reference — the candidate_id at time of request
  -- May be pseudonymised if the candidate later deletes their account
  candidate_ref       UUID          NOT NULL,

  request_type        TEXT          NOT NULL
                      CHECK (request_type IN (
                        'access',        -- Art. 15
                        'rectification', -- Art. 16
                        'erasure',       -- Art. 17
                        'restriction',   -- Art. 18
                        'portability',   -- Art. 20
                        'objection',     -- Art. 21
                        'automated_review' -- Art. 22 — this is the appeal process
                      )),

  -- Submission
  received_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  channel             TEXT          NOT NULL
                      CHECK (channel IN ('in_app', 'email', 'post')),

  -- Response deadline — 1 calendar month from receipt
  response_deadline   TIMESTAMPTZ   NULL, -- Set by application: received_at + 1 month

  -- Status
  status              TEXT          NOT NULL DEFAULT 'received'
                      CHECK (status IN (
                        'received',
                        'identity_verified',
                        'in_progress',
                        'completed',
                        'extended',       -- 2-month extension (complex requests)
                        'refused'         -- with documented legal basis
                      )),

  -- Resolution
  completed_at        TIMESTAMPTZ   NULL,
  extension_reason    TEXT          NULL,
  refusal_basis       TEXT          NULL,

  -- Notes (no PII in this table)
  notes               TEXT          NULL,

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit.data_subject_requests IS
  'Log of all GDPR data subject rights requests. '
  'response_deadline is auto-computed as 1 month from receipt. '
  'Extended requests (2 months) must document the reason. '
  'Refused requests must document the legal basis for refusal. '
  'No personal data is stored in this table — candidate_ref is the UUID only.';
