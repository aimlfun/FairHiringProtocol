-- =============================================================================
-- FHP Performance Indexes
-- Migration: 014_indexes.sql
-- Kept in a separate file so index strategy is visible and auditable
-- =============================================================================

-- ---------------------------------------------------------------------------
-- matching.candidate_profiles
-- ---------------------------------------------------------------------------

-- Skills search by ontology_id (e.g. "find all candidates with Python")
-- jsonb_path_ops is efficient for @> containment queries
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_skills
  ON matching.candidate_profiles USING GIN (skills jsonb_path_ops);

-- Active searchable candidates only (partial index — much smaller)
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_searchable
  ON matching.candidate_profiles (created_at)
  WHERE status = 'active'
    AND matching_eligible = TRUE
    AND (privacy->>'searchable')::boolean = TRUE;

-- ---------------------------------------------------------------------------
-- matching.job_briefs
-- ---------------------------------------------------------------------------

-- Hot path: active jobs (the matching engine scans these)
CREATE INDEX IF NOT EXISTS idx_job_briefs_active
  ON matching.job_briefs (company_id, created_at)
  WHERE status = 'active';

-- SLA expiry monitoring (find briefs expiring soon)
CREATE INDEX IF NOT EXISTS idx_job_briefs_expires
  ON matching.job_briefs (expires_at)
  WHERE status = 'active';

-- Skills required — find jobs needing a specific skill
CREATE INDEX IF NOT EXISTS idx_job_briefs_skills
  ON matching.job_briefs USING GIN (skills_required jsonb_path_ops);

-- Text search on job title (trigram)
CREATE INDEX IF NOT EXISTS idx_job_briefs_title_trgm
  ON matching.job_briefs USING GIN (title gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- matching.match_events
-- ---------------------------------------------------------------------------

-- Candidate's match history (candidate portal — most common query)
CREATE INDEX IF NOT EXISTS idx_match_events_candidate
  ON matching.match_events (candidate_id, created_at DESC);

-- Company's match history per job
CREATE INDEX IF NOT EXISTS idx_match_events_company_job
  ON matching.match_events (company_id, job_id, created_at DESC);

-- Fairness computation window scan (the most critical analytical query)
CREATE INDEX IF NOT EXISTS idx_match_events_fairness_window
  ON matching.match_events (created_at, company_id, job_id)
  ; -- Full index: partial index with NOW() not supported in Postgres

-- Decision-based queries (governance: how many matched vs not_matched)
CREATE INDEX IF NOT EXISTS idx_match_events_decision
  ON matching.match_events (decision, created_at);

-- ---------------------------------------------------------------------------
-- matching.match_explanations
-- ---------------------------------------------------------------------------

-- Fetch explanation for a match (candidate portal — very hot path)
CREATE INDEX IF NOT EXISTS idx_match_explanations_match_audience
  ON matching.match_explanations (match_id, audience);

-- Candidate's full explanation history
CREATE INDEX IF NOT EXISTS idx_match_explanations_candidate
  ON matching.match_explanations (candidate_id, audience)
  WHERE audience = 'candidate';

-- ---------------------------------------------------------------------------
-- matching.active_interactions
-- ---------------------------------------------------------------------------

-- SLA monitor critical path: all active interactions with their deadlines
-- Polled every 4 hours — must be extremely fast
CREATE INDEX IF NOT EXISTS idx_active_interactions_sla_monitor
  ON matching.active_interactions (sla_deadline, status)
  WHERE status = 'active';

-- Candidate's active interactions
CREATE INDEX IF NOT EXISTS idx_active_interactions_candidate
  ON matching.active_interactions (candidate_id, status);

-- Company's active interactions
CREATE INDEX IF NOT EXISTS idx_active_interactions_company
  ON matching.active_interactions (company_id, status, current_stage);

-- ---------------------------------------------------------------------------
-- matching.appeals
-- ---------------------------------------------------------------------------

-- Appeal lookup by match (used on every appeal submission)
CREATE INDEX IF NOT EXISTS idx_appeals_match
  ON matching.appeals (match_id, status);

-- Candidate's appeals
CREATE INDEX IF NOT EXISTS idx_appeals_candidate
  ON matching.appeals (candidate_id, status, submitted_at DESC);

-- Governance: pending appeals by assignee deadline
CREATE INDEX IF NOT EXISTS idx_appeals_twg_pending
  ON matching.appeals (twg_deadline)
  WHERE status = 'twg_review';

CREATE INDEX IF NOT EXISTS idx_appeals_pc_pending
  ON matching.appeals (pc_assigned_at)
  WHERE status = 'pc_review';

-- ---------------------------------------------------------------------------
-- matching.ghosting_events
-- ---------------------------------------------------------------------------

-- Company's ghosting history (compliance dashboard + enforcement)
CREATE INDEX IF NOT EXISTS idx_ghosting_company
  ON matching.ghosting_events (company_id, detected_at DESC);

-- Open events (SLA monitor update path)
CREATE INDEX IF NOT EXISTS idx_ghosting_open
  ON matching.ghosting_events (company_id, severity, detected_at)
  WHERE status = 'open';

-- Candidate's ghosting history (candidate portal)
CREATE INDEX IF NOT EXISTS idx_ghosting_candidate
  ON matching.ghosting_events (candidate_id, detected_at DESC);

-- ---------------------------------------------------------------------------
-- matching.company_strikes
-- ---------------------------------------------------------------------------

-- Active strikes in the rolling window (enforcement check)
CREATE INDEX IF NOT EXISTS idx_company_strikes_active
  ON matching.company_strikes (company_id, recorded_at)
  ; -- Full index: partial index with NOW() not supported in Postgres

-- ---------------------------------------------------------------------------
-- matching.companies
-- ---------------------------------------------------------------------------

-- Companies requiring compliance review (compliance score below threshold)
CREATE INDEX IF NOT EXISTS idx_companies_compliance
  ON matching.companies (compliance_score, status)
  WHERE status = 'active';

-- Strike count monitoring
CREATE INDEX IF NOT EXISTS idx_companies_strikes
  ON matching.companies (strike_count_90d, status)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- matching.candidate_cohorts
-- ---------------------------------------------------------------------------

-- Cohort membership lookup (bias detection hot path — Stage 7)
CREATE INDEX IF NOT EXISTS idx_candidate_cohorts_candidate
  ON matching.candidate_cohorts (candidate_id);

-- Fairness: find all candidates in a given cohort
CREATE INDEX IF NOT EXISTS idx_candidate_cohorts_cohort
  ON matching.candidate_cohorts (cohort_id, characteristic);

-- ---------------------------------------------------------------------------
-- analytical.pipeline_traces (on the partition parent)
-- ---------------------------------------------------------------------------

-- Trace lookup by match_id (appeals — governance investigation)
CREATE INDEX IF NOT EXISTS idx_pipeline_traces_match
  ON analytical.pipeline_traces (match_id, created_at DESC);

-- Trace lookup by candidate (candidate portal — appeal support)
CREATE INDEX IF NOT EXISTS idx_pipeline_traces_candidate
  ON analytical.pipeline_traces (candidate_id, created_at DESC);

-- Status-based queries (governance: failed pipeline runs)
CREATE INDEX IF NOT EXISTS idx_pipeline_traces_status
  ON analytical.pipeline_traces (status, created_at DESC)
  WHERE status IN ('failed', 'aborted');

-- ---------------------------------------------------------------------------
-- analytical.fairness_metrics
-- ---------------------------------------------------------------------------

-- Company fairness dashboard (most common query)
CREATE INDEX IF NOT EXISTS idx_fairness_metrics_company
  ON analytical.fairness_metrics (scope_company_id, computed_at DESC)
  WHERE scope_level = 'company';

-- Job-level fairness
CREATE INDEX IF NOT EXISTS idx_fairness_metrics_job
  ON analytical.fairness_metrics (scope_job_id, computed_at DESC)
  WHERE scope_level = 'job';

-- Governance: breached metrics
CREATE INDEX IF NOT EXISTS idx_fairness_metrics_breached
  ON analytical.fairness_metrics (computed_at DESC)
  WHERE any_metric_breached = TRUE;

-- Governance review queue
CREATE INDEX IF NOT EXISTS idx_fairness_metrics_review_required
  ON analytical.fairness_metrics (computed_at DESC)
  WHERE governance_review_required = TRUE;

-- ---------------------------------------------------------------------------
-- analytical.match_cohort_events (materialised view)
-- ---------------------------------------------------------------------------

-- The fairness job's primary access pattern
CREATE INDEX IF NOT EXISTS idx_match_cohort_events_window
  ON analytical.match_cohort_events (created_at, company_id, cohort_id);

CREATE INDEX IF NOT EXISTS idx_match_cohort_events_job_cohort
  ON analytical.match_cohort_events (job_id, cohort_id);

-- ---------------------------------------------------------------------------
-- audit.audit_log
-- ---------------------------------------------------------------------------

-- Public audit feed (governance dashboard)
CREATE INDEX IF NOT EXISTS idx_audit_log_public
  ON audit.audit_log (occurred_at DESC)
  WHERE is_public = TRUE;

-- Company-specific audit trail
CREATE INDEX IF NOT EXISTS idx_audit_log_company
  ON audit.audit_log (company_id, occurred_at DESC)
  WHERE company_id IS NOT NULL;

-- Event type queries (system monitoring)
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type
  ON audit.audit_log (event_type, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- audit.deletion_records
-- ---------------------------------------------------------------------------

-- Lookup by deletion_hash (confirmation queries from supervisory authority)
CREATE UNIQUE INDEX IF NOT EXISTS idx_deletion_records_hash
  ON audit.deletion_records (deletion_hash);

-- ---------------------------------------------------------------------------
-- audit.data_subject_requests
-- ---------------------------------------------------------------------------

-- Pending requests approaching deadline (DPO monitoring)
CREATE INDEX IF NOT EXISTS idx_dsr_pending
  ON audit.data_subject_requests (response_deadline, status)
  WHERE status NOT IN ('completed', 'refused');
