-- =============================================================================
-- FHP Initial Partition Setup
-- Migration: 015_partitions.sql
-- Creates partitions for the launch window.
-- Additional partitions created monthly by create_monthly_partitions.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- pipeline_traces partitions
-- ---------------------------------------------------------------------------

CREATE TABLE analytical.pipeline_traces_2025_11
  PARTITION OF analytical.pipeline_traces
  FOR VALUES FROM ('2025-11-01 00:00:00+00') TO ('2025-12-01 00:00:00+00');

CREATE TABLE analytical.pipeline_traces_2025_12
  PARTITION OF analytical.pipeline_traces
  FOR VALUES FROM ('2025-12-01 00:00:00+00') TO ('2026-01-01 00:00:00+00');

CREATE TABLE analytical.pipeline_traces_2026_01
  PARTITION OF analytical.pipeline_traces
  FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');

CREATE TABLE analytical.pipeline_traces_2026_02
  PARTITION OF analytical.pipeline_traces
  FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00');

CREATE TABLE analytical.pipeline_traces_2026_03
  PARTITION OF analytical.pipeline_traces
  FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');

-- Default partition catches anything that falls outside defined ranges
-- (should never happen in production — alerts if it does)
CREATE TABLE analytical.pipeline_traces_default
  PARTITION OF analytical.pipeline_traces DEFAULT;

COMMENT ON TABLE analytical.pipeline_traces_default IS
  'Should always be empty. If rows appear here, the partition maintenance '
  'job has failed to create the next month''s partition in time.';

-- ---------------------------------------------------------------------------
-- fairness_metrics partitions
-- ---------------------------------------------------------------------------

CREATE TABLE analytical.fairness_metrics_2025_11
  PARTITION OF analytical.fairness_metrics
  FOR VALUES FROM ('2025-11-01 00:00:00+00') TO ('2025-12-01 00:00:00+00');

CREATE TABLE analytical.fairness_metrics_2025_12
  PARTITION OF analytical.fairness_metrics
  FOR VALUES FROM ('2025-12-01 00:00:00+00') TO ('2026-01-01 00:00:00+00');

CREATE TABLE analytical.fairness_metrics_2026_01
  PARTITION OF analytical.fairness_metrics
  FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');

CREATE TABLE analytical.fairness_metrics_2026_02
  PARTITION OF analytical.fairness_metrics
  FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00');

CREATE TABLE analytical.fairness_metrics_2026_03
  PARTITION OF analytical.fairness_metrics
  FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');

CREATE TABLE analytical.fairness_metrics_default
  PARTITION OF analytical.fairness_metrics DEFAULT;
