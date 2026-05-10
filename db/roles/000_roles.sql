-- =============================================================================
-- FHP Database Roles
-- Migration: 000_roles.sql
-- Run ONCE as superuser before all other migrations.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Create roles
-- ---------------------------------------------------------------------------

-- DBA / superuser equivalent (not a Postgres superuser, but full FHP access)
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_superuser') THEN
    CREATE ROLE fhp_superuser NOLOGIN;
  END IF;
END $$;

-- API server — the application role for all user-facing requests
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_api') THEN
    CREATE ROLE fhp_api NOLOGIN;
  END IF;
END $$;

-- Matching engine — runs the nine-stage pipeline. NO access to identity schema.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_matching_engine') THEN
    CREATE ROLE fhp_matching_engine NOLOGIN;
  END IF;
END $$;

-- Identity service — the ONLY role that may read/write candidate identity + auth
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_identity_service') THEN
    CREATE ROLE fhp_identity_service NOLOGIN;
  END IF;
END $$;

-- Analytics — fairness computation job, dashboards. READ ONLY on analytical schema.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_analytics') THEN
    CREATE ROLE fhp_analytics NOLOGIN;
  END IF;
END $$;

-- Governance — Protocol Council, FOB, TWG. READ on all non-identity schemas.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_governance') THEN
    CREATE ROLE fhp_governance NOLOGIN;
  END IF;
END $$;

-- Read-only — monitoring, reporting tools. No identity access.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_readonly') THEN
    CREATE ROLE fhp_readonly NOLOGIN;
  END IF;
END $$;

-- SLA monitor — the scheduled SLA check job
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_sla_monitor') THEN
    CREATE ROLE fhp_sla_monitor NOLOGIN;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Login users (application accounts — passwords set externally via env vars)
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_api_user') THEN
    CREATE ROLE fhp_api_user LOGIN PASSWORD 'CHANGE_ME';
    GRANT fhp_api TO fhp_api_user;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_engine_user') THEN
    CREATE ROLE fhp_engine_user LOGIN PASSWORD 'CHANGE_ME';
    GRANT fhp_matching_engine TO fhp_engine_user;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_identity_user') THEN
    CREATE ROLE fhp_identity_user LOGIN PASSWORD 'CHANGE_ME';
    GRANT fhp_identity_service TO fhp_identity_user;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_analytics_user') THEN
    CREATE ROLE fhp_analytics_user LOGIN PASSWORD 'CHANGE_ME';
    GRANT fhp_analytics TO fhp_analytics_user;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_governance_user') THEN
    CREATE ROLE fhp_governance_user LOGIN PASSWORD 'CHANGE_ME';
    GRANT fhp_governance TO fhp_governance_user;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_sla_user') THEN
    CREATE ROLE fhp_sla_user LOGIN PASSWORD 'CHANGE_ME';
    GRANT fhp_sla_monitor TO fhp_sla_user;
  END IF;
END $$;

COMMENT ON ROLE fhp_superuser         IS 'Full FHP database access — DBA only';
COMMENT ON ROLE fhp_api               IS 'API server — all user-facing operations';
COMMENT ON ROLE fhp_matching_engine   IS 'Pipeline — NO identity schema access (privacy boundary)';
COMMENT ON ROLE fhp_identity_service  IS 'Auth service — identity schema ONLY';
COMMENT ON ROLE fhp_analytics         IS 'Fairness computation and dashboards — read-only analytical';
COMMENT ON ROLE fhp_governance        IS 'Governance bodies — read all non-identity schemas';
COMMENT ON ROLE fhp_sla_monitor       IS 'SLA monitor scheduled job';
COMMENT ON ROLE fhp_readonly          IS 'Monitoring and reporting — no identity access';
