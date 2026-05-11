-- =============================================================================
-- FHP Migration 000: Database Roles (local dev)
--
-- Creates the Postgres roles that migrations 002+ reference in GRANT statements.
-- In production these would be created by your DBA with proper passwords.
-- For local dev we create them as simple roles without login — the postgres
-- superuser already has full access so these just silence the GRANT errors.
-- =============================================================================

DO $$
BEGIN
  -- Create each role only if it doesn't already exist
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_superuser') THEN
    CREATE ROLE fhp_superuser;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_api') THEN
    CREATE ROLE fhp_api;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_identity_service') THEN
    CREATE ROLE fhp_identity_service;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_matching_engine') THEN
    CREATE ROLE fhp_matching_engine;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_sla_monitor') THEN
    CREATE ROLE fhp_sla_monitor;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_governance') THEN
    CREATE ROLE fhp_governance;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_analytics') THEN
    CREATE ROLE fhp_analytics;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_readonly') THEN
    CREATE ROLE fhp_readonly;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fhp_fairness_service') THEN
    CREATE ROLE fhp_fairness_service;
  END IF;
END
$$;
