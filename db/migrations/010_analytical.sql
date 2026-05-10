-- =============================================================================
-- FHP Analytical Cluster
-- Migration: 010_analytical.sql
-- pipeline_traces (partitioned), fairness_metrics (partitioned)
-- See specs/trace.schema.json
--     specs/fairness-metrics.schema.json
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Pipeline traces — immutable, partitioned by month
-- One row per pipeline execution
-- ---------------------------------------------------------------------------

CREATE TABLE analytical.pipeline_traces (
  trace_id            UUID          NOT NULL,
  match_id            UUID          NOT NULL,
  candidate_id        UUID          NOT NULL,  -- no FK: pseudonymisation-safe
  job_id              UUID          NOT NULL,
  fhp_version         TEXT          NOT NULL,
  pipeline_version    TEXT          NOT NULL,

  -- Timing
  started_at          TIMESTAMPTZ   NOT NULL,
  completed_at        TIMESTAMPTZ   NOT NULL,
  duration_ms         INTEGER       NOT NULL CHECK (duration_ms >= 0),

  -- Outcome
  status              TEXT          NOT NULL
                      CHECK (status IN ('completed', 'failed', 'aborted')),
  failure_reason      TEXT          NULL,

  -- Full stage-by-stage trace data
  -- Stored as JSONB — structured enough for most governance queries,
  -- flexible enough to evolve with pipeline versions
  trace_data          JSONB         NOT NULL,

  -- Models invoked during this run (MMIL)
  models_used         JSONB         NULL,

  -- Tamper detection
  -- SHA-256 hash of canonical JSON of the trace (excluding this field)
  checksum            CHAR(64)      NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),

  -- Appeal linkage
  under_appeal        BOOLEAN       NOT NULL DEFAULT FALSE,
  appeal_id           UUID          NULL,

  -- Partition key — must be included in primary key for partitioned tables
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  PRIMARY KEY (trace_id, created_at)

) PARTITION BY RANGE (created_at);

COMMENT ON TABLE analytical.pipeline_traces IS
  'Immutable audit record of every pipeline execution. '
  'Partitioned by created_at month. '
  'UPDATE and DELETE are blocked by trigger (013_triggers.sql). '
  'checksum enables tamper detection on read. '
  'Partitions older than 90 days can be archived to object storage. '
  'See specs/trace.schema.json';

COMMENT ON COLUMN analytical.pipeline_traces.trace_data IS
  'Full stage-by-stage execution record. '
  'Schema: {stages: [{stage_name, stage_order, status, started_at, '
  'completed_at, input_snapshot, output_snapshot, decisions, warnings}]}. '
  'See specs/trace.schema.json for full structure.';

COMMENT ON COLUMN analytical.pipeline_traces.checksum IS
  'SHA-256 hex digest of the canonical JSON serialisation of this trace '
  '(excluding the checksum field itself). Verified on every governance read.';

-- ---------------------------------------------------------------------------
-- Fairness metrics — nightly computation output
-- Partitioned by month (one record per company/job/platform per run)
-- See specs/fairness-metrics.schema.json
-- ---------------------------------------------------------------------------

CREATE TABLE analytical.fairness_metrics (
  audit_id            UUID          NOT NULL,
  computed_at         TIMESTAMPTZ   NOT NULL,
  pipeline_version    TEXT          NOT NULL,

  -- Computation window
  window_from         TIMESTAMPTZ   NOT NULL,
  window_to           TIMESTAMPTZ   NOT NULL,
  window_type         TEXT          NOT NULL DEFAULT 'rolling_30d'
                      CHECK (window_type IN ('daily', 'rolling_7d', 'rolling_30d', 'rolling_90d')),

  -- Scope
  scope_level         TEXT          NOT NULL
                      CHECK (scope_level IN ('job', 'company', 'platform')),
  scope_job_id        UUID          NULL,
  scope_company_id    UUID          NULL,

  -- Cohort data (suppressed where count < MIN_COHORT_SIZE)
  cohort_stats        JSONB         NULL,
  total_matches_evaluated INTEGER   NOT NULL DEFAULT 0,
  suppressed_cohorts  SMALLINT      NOT NULL DEFAULT 0,

  -- The three canonical metrics
  -- NULL when insufficient data for reliable computation
  dir_value           NUMERIC(8,5)  NULL,
  dir_reference_cohort_id TEXT      NULL,
  dir_comparison_cohort_id TEXT     NULL,
  dir_within_bounds   BOOLEAN       NULL,

  eod_value           NUMERIC(8,5)  NULL,
  eod_group_a_cohort_id TEXT        NULL,
  eod_group_b_cohort_id TEXT        NULL,
  eod_within_bounds   BOOLEAN       NULL,

  sds_value           NUMERIC(8,5)  NULL,
  sds_reference_cohort_id TEXT      NULL,
  sds_comparison_cohort_id TEXT     NULL,
  sds_skill_parity_controlled BOOLEAN NULL,
  sds_within_bounds   BOOLEAN       NULL,

  -- Threshold values at computation time
  -- (stored because thresholds may change across protocol versions)
  threshold_dir_lower NUMERIC(5,4)  NOT NULL,
  threshold_dir_upper NUMERIC(5,4)  NOT NULL,
  threshold_eod_abs   NUMERIC(5,4)  NOT NULL,
  threshold_sds_abs   NUMERIC(5,4)  NOT NULL,

  -- Flags
  any_metric_breached          BOOLEAN NOT NULL DEFAULT FALSE,
  governance_review_required   BOOLEAN NOT NULL DEFAULT FALSE,
  metrics_breached             TEXT[]  NOT NULL DEFAULT '{}',
  consecutive_breach_windows   SMALLINT NOT NULL DEFAULT 0,

  -- Ghosting summary (denormalised for dashboard convenience)
  ghosting_total_events        INTEGER NOT NULL DEFAULT 0,
  ghosting_open_events         INTEGER NOT NULL DEFAULT 0,
  ghosting_severe_events       INTEGER NOT NULL DEFAULT 0,
  ghosting_sla_compliance_rate NUMERIC(5,4) NULL,

  -- Partition key
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  PRIMARY KEY (audit_id, created_at)

) PARTITION BY RANGE (created_at);

COMMENT ON TABLE analytical.fairness_metrics IS
  'Output of the nightly fairness computation job. '
  'One record per scope (platform / company / job) per run. '
  'Partitioned by month. Append-only. '
  'Thresholds stored at computation time to enable historical comparison '
  'across protocol versions. '
  'See specs/fairness-metrics.schema.json';

-- ---------------------------------------------------------------------------
-- Materialised view — pre-joined for nightly fairness job
-- Refreshed nightly before the job runs
-- ---------------------------------------------------------------------------

CREATE MATERIALIZED VIEW analytical.match_cohort_events AS
  SELECT
    me.match_id,
    me.candidate_id,
    me.job_id,
    me.company_id,
    me.decision,
    me.overall_score,
    me.pre_correction_score,
    me.qualified,
    me.bias_correction_triggered,
    me.created_at,
    cc.cohort_id,
    cc.characteristic
  FROM matching.match_events me
  LEFT JOIN matching.candidate_cohorts cc
    ON me.candidate_id = cc.candidate_id
  WHERE me.created_at > NOW() - INTERVAL '35 days'
WITH DATA;

COMMENT ON MATERIALIZED VIEW analytical.match_cohort_events IS
  'Pre-joined match events with cohort memberships. '
  'Rolling 35-day window (30-day metric window + 5-day buffer). '
  'Refreshed nightly before the fairness computation job runs. '
  'The fairness job reads from this view — avoids expensive joins at 03:00.';
