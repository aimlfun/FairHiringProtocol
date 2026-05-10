-- =============================================================================
-- FHP Triggers
-- Migration: 013_triggers.sql
-- Immutability enforcement, auto-timestamps, business logic guards
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Generic updated_at trigger function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fhp_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply to all tables with updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON matching.companies
  FOR EACH ROW EXECUTE FUNCTION fhp_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON matching.candidate_profiles
  FOR EACH ROW EXECUTE FUNCTION fhp_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON matching.job_briefs
  FOR EACH ROW EXECUTE FUNCTION fhp_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON matching.active_interactions
  FOR EACH ROW EXECUTE FUNCTION fhp_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON matching.appeals
  FOR EACH ROW EXECUTE FUNCTION fhp_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON matching.escalations
  FOR EACH ROW EXECUTE FUNCTION fhp_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON matching.ghosting_events
  FOR EACH ROW EXECUTE FUNCTION fhp_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON identity.candidate_identity
  FOR EACH ROW EXECUTE FUNCTION fhp_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON identity.candidate_auth
  FOR EACH ROW EXECUTE FUNCTION fhp_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON audit.data_subject_requests
  FOR EACH ROW EXECUTE FUNCTION fhp_set_updated_at();

-- ---------------------------------------------------------------------------
-- Immutability: pipeline_traces — NEVER updated or deleted
-- This is a protocol guarantee, not just a convention
-- See specs/trace.schema.json, specs/database-architecture.md §4.3
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fhp_prevent_trace_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- runs as owner, cannot be bypassed by role tricks
AS $$
BEGIN
  RAISE EXCEPTION
    'Protocol violation: pipeline traces are immutable. '
    'Attempted % on trace_id=%. '
    'Traces may only be pseudonymised via the authorised deletion procedure.',
    TG_OP,
    OLD.trace_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER enforce_trace_immutability
  BEFORE UPDATE OR DELETE ON analytical.pipeline_traces
  FOR EACH ROW EXECUTE FUNCTION fhp_prevent_trace_modification();

-- ---------------------------------------------------------------------------
-- Immutability: match_events — never updated (outcomes are permanent)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fhp_prevent_match_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Allow pseudonymisation updates (candidate_id field only, by superuser)
  IF TG_OP = 'UPDATE'
     AND OLD.candidate_id != NEW.candidate_id
     AND NEW.job_id = OLD.job_id
     AND NEW.decision = OLD.decision
     AND NEW.overall_score = OLD.overall_score
     AND pg_has_role(current_user, 'fhp_superuser', 'USAGE')
  THEN
    RETURN NEW;  -- Pseudonymisation update — permitted
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'Protocol violation: match events may not be deleted. '
      'Use the pseudonymisation procedure to anonymise candidate data.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION
      'Protocol violation: match event outcomes are immutable. '
      'match_id=%. Outcomes can only be corrected via the appeal process.',
      OLD.match_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER enforce_match_immutability
  BEFORE UPDATE OR DELETE ON matching.match_events
  FOR EACH ROW EXECUTE FUNCTION fhp_prevent_match_modification();

-- ---------------------------------------------------------------------------
-- Immutability: match_explanations — never updated after generation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fhp_prevent_explanation_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Allow pseudonymisation of candidate_id by superuser
  IF TG_OP = 'UPDATE'
     AND OLD.candidate_id != NEW.candidate_id
     AND pg_has_role(current_user, 'fhp_superuser', 'USAGE')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Protocol violation: match explanations are immutable. '
    'explanation_id=%. '
    'Corrections are made via the appeal process (new explanation generated).',
    OLD.explanation_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER enforce_explanation_immutability
  BEFORE UPDATE OR DELETE ON matching.match_explanations
  FOR EACH ROW EXECUTE FUNCTION fhp_prevent_explanation_modification();

-- ---------------------------------------------------------------------------
-- Immutability: audit tables — append-only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fhp_prevent_audit_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RAISE EXCEPTION
    'Protocol violation: audit table % is append-only. '
    'Attempted % on id=%. '
    'Audit records are permanent.',
    TG_TABLE_NAME, TG_OP, OLD;
  RETURN NULL;
END;
$$;

CREATE TRIGGER enforce_audit_log_immutability
  BEFORE UPDATE OR DELETE ON audit.audit_log
  FOR EACH ROW EXECUTE FUNCTION fhp_prevent_audit_modification();

CREATE TRIGGER enforce_deletion_records_immutability
  BEFORE UPDATE OR DELETE ON audit.deletion_records
  FOR EACH ROW EXECUTE FUNCTION fhp_prevent_audit_modification();

-- ---------------------------------------------------------------------------
-- Business logic: job brief attestations must be complete before activation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fhp_validate_job_activation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status != 'active' THEN
    -- All attestations must be true
    IF NOT (
      NEW.attest_no_degree_requirement     = TRUE AND
      NEW.attest_no_institution_preference = TRUE AND
      NEW.attest_no_graduation_year_filter = TRUE AND
      NEW.attest_no_unpaid_work            = TRUE
    ) THEN
      RAISE EXCEPTION
        'Job brief % cannot be activated: compliance attestations are incomplete. '
        'All four attestations must be confirmed before a brief can go active.',
        NEW.job_id;
    END IF;

    -- Company must be active
    IF NOT EXISTS (
      SELECT 1 FROM matching.companies
      WHERE company_id = NEW.company_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION
        'Job brief % cannot be activated: company % is not in active status.',
        NEW.job_id, NEW.company_id;
    END IF;

    -- Expiry must be in the future
    IF NEW.expires_at <= NOW() THEN
      RAISE EXCEPTION
        'Job brief % cannot be activated: expires_at is in the past.',
        NEW.job_id;
    END IF;

    NEW.activated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_job_activation
  BEFORE UPDATE ON matching.job_briefs
  FOR EACH ROW EXECUTE FUNCTION fhp_validate_job_activation();

-- ---------------------------------------------------------------------------
-- Business logic: company status changes must update related job briefs
-- When a company is paused or suspended, active briefs are also paused
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fhp_cascade_company_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('paused', 'suspended', 'banned')
     AND OLD.status NOT IN ('paused', 'suspended', 'banned')
  THEN
    -- Pause all active job briefs
    UPDATE matching.job_briefs
    SET
      status        = 'paused',
      status_reason = 'Company account ' || NEW.status || ': ' || COALESCE(NEW.status_reason, 'governance action'),
      updated_at    = NOW()
    WHERE
      company_id = NEW.company_id
      AND status = 'active';

    -- Log to audit
    INSERT INTO audit.audit_log (
      event_type, company_id, summary, is_public,
      actor_body, occurred_at
    ) VALUES (
      'company_' || NEW.status,
      NEW.company_id,
      'Company status changed to ' || NEW.status || '. Active job briefs paused automatically.',
      TRUE,
      'platform',
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cascade_company_status_to_jobs
  AFTER UPDATE ON matching.companies
  FOR EACH ROW EXECUTE FUNCTION fhp_cascade_company_status();

-- ---------------------------------------------------------------------------
-- Business logic: matching eligibility — candidate must have confirmed age
-- Prevents matching runs on ineligible profiles
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fhp_check_matching_eligibility()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- matching_eligible can only be set to true by the identity service
  IF NEW.matching_eligible = TRUE
     AND OLD.matching_eligible = FALSE
     AND NOT pg_has_role(current_user, 'fhp_identity_service', 'USAGE')
     AND NOT pg_has_role(current_user, 'fhp_superuser', 'USAGE')
  THEN
    RAISE EXCEPTION
      'matching_eligible may only be set to true by the identity service, '
      'after age confirmation and terms acceptance.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_matching_eligibility
  BEFORE UPDATE ON matching.candidate_profiles
  FOR EACH ROW EXECUTE FUNCTION fhp_check_matching_eligibility();

-- ---------------------------------------------------------------------------
-- Business logic: ghosting severity auto-classification
-- Offer stage and post-rejection feedback are always severe
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fhp_enforce_ghosting_severity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Force severe for protected stages regardless of overdue hours
  IF NEW.stage_name IN ('offer_stage', 'post_rejection_feedback') THEN
    NEW.severity = 'severe';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_ghosting_severity
  BEFORE INSERT ON matching.ghosting_events
  FOR EACH ROW EXECUTE FUNCTION fhp_enforce_ghosting_severity();

-- ---------------------------------------------------------------------------
-- Refresh materialised view trigger — called by nightly job
-- (Not an automatic trigger — called explicitly by the fairness job)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fhp_refresh_match_cohort_events()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY analytical.match_cohort_events;
  INSERT INTO audit.audit_log (event_type, summary, actor_body, is_public)
  VALUES ('nightly_job_completed', 'match_cohort_events materialised view refreshed.', 'system', FALSE);
END;
$$;

COMMENT ON FUNCTION fhp_refresh_match_cohort_events IS
  'Called by the nightly fairness computation job before metrics are computed. '
  'Refreshes the pre-joined match/cohort materialised view. '
  'CONCURRENTLY means no lock on the view during refresh.';
