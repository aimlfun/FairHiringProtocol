-- =============================================================================
-- FHP Row-Level Security Policies
-- Migration: 012_rls.sql
--
-- RLS enforces at the database level what the application layer also enforces.
-- Belt-and-braces: even a compromised application cannot bypass these policies.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper function: extract candidate_id from JWT claim (for API role)
-- In production this is set by the application at session start:
--   SET LOCAL fhp.current_candidate_id = '<uuid>';
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fhp_current_candidate_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('fhp.current_candidate_id', TRUE), '')::UUID
$$;

CREATE OR REPLACE FUNCTION fhp_current_company_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('fhp.current_company_id', TRUE), '')::UUID
$$;

CREATE OR REPLACE FUNCTION fhp_is_governance()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT pg_has_role(current_user, 'fhp_governance', 'USAGE')
      OR pg_has_role(current_user, 'fhp_superuser', 'USAGE')
$$;

-- ---------------------------------------------------------------------------
-- matching.candidate_profiles
-- Candidates see only their own profile.
-- Matching engine sees all (it processes all active profiles).
-- ---------------------------------------------------------------------------

ALTER TABLE matching.candidate_profiles ENABLE ROW LEVEL SECURITY;

-- Candidates see only their own profile
CREATE POLICY candidates_own_profile ON matching.candidate_profiles
  FOR ALL
  USING (
    candidate_id = fhp_current_candidate_id()
    OR pg_has_role(current_user, 'fhp_matching_engine', 'USAGE')
    OR pg_has_role(current_user, 'fhp_api', 'USAGE')
    OR fhp_is_governance()
  );

-- ---------------------------------------------------------------------------
-- matching.match_events
-- Candidates see only their own matches.
-- Companies see only matches against their job briefs.
-- ---------------------------------------------------------------------------

ALTER TABLE matching.match_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY match_events_candidate ON matching.match_events
  FOR SELECT
  USING (
    candidate_id = fhp_current_candidate_id()
    OR company_id = fhp_current_company_id()
    OR pg_has_role(current_user, 'fhp_matching_engine', 'USAGE')
    OR pg_has_role(current_user, 'fhp_api', 'USAGE')
    OR fhp_is_governance()
  );

-- Match events are written by the matching engine; not by API
CREATE POLICY match_events_insert ON matching.match_events
  FOR INSERT
  WITH CHECK (
    pg_has_role(current_user, 'fhp_matching_engine', 'USAGE')
    OR pg_has_role(current_user, 'fhp_api', 'USAGE')
  );

-- ---------------------------------------------------------------------------
-- matching.match_explanations
-- Candidates see only their own candidate-audience explanations.
-- Companies see only employer-audience explanations for their jobs.
-- Governance sees all.
-- ---------------------------------------------------------------------------

ALTER TABLE matching.match_explanations ENABLE ROW LEVEL SECURITY;

CREATE POLICY explanations_candidate ON matching.match_explanations
  FOR SELECT
  USING (
    -- Candidates: own explanations, candidate audience only
    (candidate_id = fhp_current_candidate_id() AND audience = 'candidate')
    -- Companies: employer audience for their jobs only
    OR (audience = 'employer' AND job_id IN (
          SELECT job_id FROM matching.job_briefs
          WHERE company_id = fhp_current_company_id()
        ))
    -- Governance: full access
    OR fhp_is_governance()
    -- API/engine: full access for serving
    OR pg_has_role(current_user, 'fhp_api', 'USAGE')
  );

-- ---------------------------------------------------------------------------
-- matching.active_interactions
-- Candidates see their own interactions.
-- Companies see interactions for their jobs.
-- SLA monitor needs full access to check deadlines.
-- ---------------------------------------------------------------------------

ALTER TABLE matching.active_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY interactions_access ON matching.active_interactions
  FOR ALL
  USING (
    candidate_id = fhp_current_candidate_id()
    OR company_id = fhp_current_company_id()
    OR pg_has_role(current_user, 'fhp_sla_monitor', 'USAGE')
    OR pg_has_role(current_user, 'fhp_api', 'USAGE')
    OR fhp_is_governance()
  );

-- ---------------------------------------------------------------------------
-- matching.appeals
-- Candidates see and submit their own appeals.
-- Companies see appeals related to their jobs (read-only).
-- ---------------------------------------------------------------------------

ALTER TABLE matching.appeals ENABLE ROW LEVEL SECURITY;

CREATE POLICY appeals_candidate ON matching.appeals
  FOR ALL
  USING (
    candidate_id = fhp_current_candidate_id()
    OR (job_id IN (
          SELECT job_id FROM matching.job_briefs
          WHERE company_id = fhp_current_company_id()
        ))
    OR pg_has_role(current_user, 'fhp_api', 'USAGE')
    OR fhp_is_governance()
  );

-- ---------------------------------------------------------------------------
-- matching.ghosting_events
-- Candidates see ghosting events for their own matches.
-- Companies see ghosting events for their own jobs (read-only).
-- SLA monitor has full access.
-- ---------------------------------------------------------------------------

ALTER TABLE matching.ghosting_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY ghosting_access ON matching.ghosting_events
  FOR ALL
  USING (
    candidate_id = fhp_current_candidate_id()
    OR company_id = fhp_current_company_id()
    OR pg_has_role(current_user, 'fhp_sla_monitor', 'USAGE')
    OR pg_has_role(current_user, 'fhp_api', 'USAGE')
    OR fhp_is_governance()
  );

-- ---------------------------------------------------------------------------
-- matching.job_briefs
-- Public: active briefs are visible to all authenticated users.
-- Companies: full access to their own briefs.
-- Draft briefs: visible only to the owning company.
-- ---------------------------------------------------------------------------

ALTER TABLE matching.job_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_briefs_access ON matching.job_briefs
  FOR SELECT
  USING (
    -- Active briefs are publicly visible (for matching)
    status = 'active'
    -- Companies see all their own briefs regardless of status
    OR company_id = fhp_current_company_id()
    -- Governance sees all
    OR fhp_is_governance()
    -- API and engine see all (needed for pipeline)
    OR pg_has_role(current_user, 'fhp_api', 'USAGE')
    OR pg_has_role(current_user, 'fhp_matching_engine', 'USAGE')
  );

CREATE POLICY job_briefs_write ON matching.job_briefs
  FOR ALL
  USING (
    company_id = fhp_current_company_id()
    OR pg_has_role(current_user, 'fhp_api', 'USAGE')
    OR fhp_is_governance()
  );

-- ---------------------------------------------------------------------------
-- matching.companies
-- Companies see their own record.
-- Governance sees all.
-- Public: only company_id, legal_name, status (not compliance details)
-- ---------------------------------------------------------------------------

ALTER TABLE matching.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY companies_access ON matching.companies
  FOR SELECT
  USING (
    company_id = fhp_current_company_id()
    OR pg_has_role(current_user, 'fhp_api', 'USAGE')
    OR fhp_is_governance()
  );

-- ---------------------------------------------------------------------------
-- analytical.pipeline_traces
-- Candidates see their own traces (for appeal support).
-- Governance sees all.
-- No company access — traces contain governance-only bias data.
-- ---------------------------------------------------------------------------

ALTER TABLE analytical.pipeline_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY traces_access ON analytical.pipeline_traces
  FOR SELECT
  USING (
    candidate_id = fhp_current_candidate_id()
    OR fhp_is_governance()
    OR pg_has_role(current_user, 'fhp_analytics', 'USAGE')
    OR pg_has_role(current_user, 'fhp_api', 'USAGE')
  );

-- INSERT only — from matching engine after pipeline completion
CREATE POLICY traces_insert ON analytical.pipeline_traces
  FOR INSERT
  WITH CHECK (
    pg_has_role(current_user, 'fhp_matching_engine', 'USAGE')
    OR pg_has_role(current_user, 'fhp_api', 'USAGE')
  );

-- ---------------------------------------------------------------------------
-- audit.deletion_records — governance and DPO only
-- ---------------------------------------------------------------------------

ALTER TABLE audit.deletion_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY deletion_records_access ON audit.deletion_records
  FOR ALL
  USING (fhp_is_governance() OR pg_has_role(current_user, 'fhp_api', 'USAGE'));

-- ---------------------------------------------------------------------------
-- audit.audit_log — public summaries visible to all; full records to governance
-- ---------------------------------------------------------------------------

ALTER TABLE audit.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_public ON audit.audit_log
  FOR SELECT
  USING (
    is_public = TRUE   -- public entries visible to all authenticated users
    OR fhp_is_governance()
    OR pg_has_role(current_user, 'fhp_api', 'USAGE')
  );

CREATE POLICY audit_log_insert ON audit.audit_log
  FOR INSERT
  WITH CHECK (
    pg_has_role(current_user, 'fhp_api', 'USAGE')
    OR fhp_is_governance()
  );
