-- =============================================================================
-- FHP Partition Maintenance Script
-- partitions/create_monthly_partitions.sql
--
-- Creates partitions for the NEXT calendar month.
-- Run monthly, at least 7 days before month end.
-- Schedule example (pg_cron): '0 0 20 * *' (20th of each month at midnight)
--
-- Usage: psql fhp -f db/partitions/create_monthly_partitions.sql
-- =============================================================================

DO $$
DECLARE
  next_month_start  TIMESTAMPTZ;
  next_month_end    TIMESTAMPTZ;
  partition_suffix  TEXT;
  trace_partition   TEXT;
  metrics_partition TEXT;
BEGIN
  -- Compute next month's date range
  next_month_start := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
  next_month_end   := next_month_start + INTERVAL '1 month';
  partition_suffix := TO_CHAR(next_month_start, 'YYYY_MM');

  trace_partition   := 'analytical.pipeline_traces_'   || partition_suffix;
  metrics_partition := 'analytical.fairness_metrics_'  || partition_suffix;

  -- Create pipeline_traces partition if it doesn't exist
  IF NOT EXISTS (
    SELECT FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'analytical'
      AND c.relname = 'pipeline_traces_' || partition_suffix
  ) THEN
    EXECUTE format(
      'CREATE TABLE %s PARTITION OF analytical.pipeline_traces '
      'FOR VALUES FROM (%L) TO (%L)',
      trace_partition,
      next_month_start,
      next_month_end
    );
    RAISE NOTICE 'Created partition: %', trace_partition;
  ELSE
    RAISE NOTICE 'Partition already exists: %', trace_partition;
  END IF;

  -- Create fairness_metrics partition if it doesn't exist
  IF NOT EXISTS (
    SELECT FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'analytical'
      AND c.relname = 'fairness_metrics_' || partition_suffix
  ) THEN
    EXECUTE format(
      'CREATE TABLE %s PARTITION OF analytical.fairness_metrics '
      'FOR VALUES FROM (%L) TO (%L)',
      metrics_partition,
      next_month_start,
      next_month_end
    );
    RAISE NOTICE 'Created partition: %', metrics_partition;
  ELSE
    RAISE NOTICE 'Partition already exists: %', metrics_partition;
  END IF;

  -- Log the maintenance run
  INSERT INTO audit.audit_log (
    event_type, summary, actor_body, is_public
  ) VALUES (
    'nightly_job_completed',
    'Partition maintenance: created partitions for ' || partition_suffix,
    'system',
    FALSE
  );

  -- Alert if the default partition has any rows (indicates missed maintenance)
  PERFORM 1 FROM analytical.pipeline_traces_default LIMIT 1;
  IF FOUND THEN
    RAISE WARNING
      'ALERT: analytical.pipeline_traces_default contains rows. '
      'Partition maintenance has been missed. Investigate immediately.';
  END IF;

  PERFORM 1 FROM analytical.fairness_metrics_default LIMIT 1;
  IF FOUND THEN
    RAISE WARNING
      'ALERT: analytical.fairness_metrics_default contains rows. '
      'Partition maintenance has been missed. Investigate immediately.';
  END IF;

END $$;
