-- =============================================================================
-- FHP Schema Definitions and Role Grants
-- Migration: 002_schemas.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Create schemas
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS identity;
COMMENT ON SCHEMA identity IS
  'PII store — candidate identity and authentication credentials. '
  'fhp_matching_engine has ZERO access to this schema. '
  'Only fhp_identity_service may read or write here.';

CREATE SCHEMA IF NOT EXISTS matching;
COMMENT ON SCHEMA matching IS
  'Transactional cluster — hot path. Companies, candidates (no PII), '
  'jobs, matches, appeals, interactions, ghosting. '
  'The matching engine operates entirely within this schema.';

CREATE SCHEMA IF NOT EXISTS analytical;
COMMENT ON SCHEMA analytical IS
  'Analytical cluster — warm path. Append-only audit trail. '
  'Pipeline traces, fairness metrics, materialised views. '
  'Never written by the live pipeline — only by the pipeline commit step.';

CREATE SCHEMA IF NOT EXISTS audit;
COMMENT ON SCHEMA audit IS
  'Legal and compliance records. Deletion audit trail, data subject requests, '
  'GDPR records. Immutable by design.';

CREATE SCHEMA IF NOT EXISTS config;
COMMENT ON SCHEMA config IS
  'Governance constants and reference data. '
  'Read-only at runtime — written only by migrations and governance decisions.';

-- ---------------------------------------------------------------------------
-- Schema grants — the privacy boundary is enforced here
-- ---------------------------------------------------------------------------

-- identity schema: ONLY the identity service role
GRANT USAGE ON SCHEMA identity TO fhp_identity_service;
GRANT USAGE ON SCHEMA identity TO fhp_superuser;
-- fhp_api gets NO direct schema access — must go through identity service
-- fhp_matching_engine gets NO access — enforced at schema level

-- matching schema
GRANT USAGE ON SCHEMA matching TO fhp_api;
GRANT USAGE ON SCHEMA matching TO fhp_matching_engine;
GRANT USAGE ON SCHEMA matching TO fhp_sla_monitor;
GRANT USAGE ON SCHEMA matching TO fhp_governance;
GRANT USAGE ON SCHEMA matching TO fhp_readonly;
GRANT USAGE ON SCHEMA matching TO fhp_superuser;

-- analytical schema
GRANT USAGE ON SCHEMA analytical TO fhp_analytics;
GRANT USAGE ON SCHEMA analytical TO fhp_matching_engine;  -- write traces after pipeline run
GRANT USAGE ON SCHEMA analytical TO fhp_api;              -- read explanations
GRANT USAGE ON SCHEMA analytical TO fhp_governance;
GRANT USAGE ON SCHEMA analytical TO fhp_readonly;
GRANT USAGE ON SCHEMA analytical TO fhp_superuser;

-- audit schema
GRANT USAGE ON SCHEMA audit TO fhp_api;                   -- write deletion records
GRANT USAGE ON SCHEMA audit TO fhp_governance;
GRANT USAGE ON SCHEMA audit TO fhp_superuser;

-- config schema — read-only for all application roles
GRANT USAGE ON SCHEMA config TO fhp_api;
GRANT USAGE ON SCHEMA config TO fhp_matching_engine;
GRANT USAGE ON SCHEMA config TO fhp_analytics;
GRANT USAGE ON SCHEMA config TO fhp_governance;
GRANT USAGE ON SCHEMA config TO fhp_readonly;
GRANT USAGE ON SCHEMA config TO fhp_sla_monitor;
GRANT USAGE ON SCHEMA config TO fhp_superuser;

-- ---------------------------------------------------------------------------
-- Default privileges — future tables inherit the right grants
-- ---------------------------------------------------------------------------

-- matching schema defaults
ALTER DEFAULT PRIVILEGES IN SCHEMA matching
  GRANT SELECT, INSERT, UPDATE ON TABLES TO fhp_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA matching
  GRANT SELECT, INSERT ON TABLES TO fhp_matching_engine;
ALTER DEFAULT PRIVILEGES IN SCHEMA matching
  GRANT SELECT ON TABLES TO fhp_governance, fhp_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA matching
  GRANT SELECT, INSERT, UPDATE ON TABLES TO fhp_sla_monitor;

-- analytical schema defaults — no UPDATE or DELETE (append-only)
ALTER DEFAULT PRIVILEGES IN SCHEMA analytical
  GRANT SELECT, INSERT ON TABLES TO fhp_matching_engine;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytical
  GRANT SELECT ON TABLES TO fhp_analytics, fhp_governance, fhp_readonly, fhp_api;

-- identity schema defaults
ALTER DEFAULT PRIVILEGES IN SCHEMA identity
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fhp_identity_service;

-- audit schema defaults — insert only for application, read for governance
ALTER DEFAULT PRIVILEGES IN SCHEMA audit
  GRANT SELECT, INSERT ON TABLES TO fhp_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit
  GRANT SELECT ON TABLES TO fhp_governance;

-- config schema defaults — read only
ALTER DEFAULT PRIVILEGES IN SCHEMA config
  GRANT SELECT ON TABLES TO fhp_api, fhp_matching_engine, fhp_analytics,
                             fhp_governance, fhp_readonly, fhp_sla_monitor;

-- Sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA matching
  GRANT USAGE ON SEQUENCES TO fhp_api, fhp_matching_engine, fhp_sla_monitor;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytical
  GRANT USAGE ON SEQUENCES TO fhp_matching_engine;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit
  GRANT USAGE ON SEQUENCES TO fhp_api;
