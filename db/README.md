# FHP Database

This directory contains all PostgreSQL database definitions for the Fair Hiring Protocol.

## Structure

```
db/
├── README.md                      ← this file
├── roles/
│   └── 000_roles.sql              ← database roles and permissions
├── migrations/
│   ├── 001_extensions.sql         ← required PostgreSQL extensions
│   ├── 002_schemas.sql            ← schema creation and search paths
│   ├── 003_identity.sql           ← identity cluster (PII — restricted access)
│   ├── 004_companies.sql          ← company registry
│   ├── 005_candidates.sql         ← candidate profiles (no PII)
│   ├── 006_jobs.sql               ← job briefs
│   ├── 007_matching.sql           ← match events, explanations, interactions
│   ├── 008_appeals.sql            ← appeals and governance escalations
│   ├── 009_sla_ghosting.sql       ← SLA monitoring and ghosting events
│   ├── 010_analytical.sql         ← pipeline traces and fairness metrics
│   ├── 011_audit.sql              ← audit log and deletion records
│   ├── 012_rls.sql                ← all Row-Level Security policies
│   ├── 013_triggers.sql           ← immutability, timestamps, checksums
│   ├── 014_indexes.sql            ← all indexes (separate for clarity)
│   ├── 015_partitions.sql         ← initial partition setup
│   ├── 016_company_auth.sql       ← company authentication tables
│   ├── 017_candidate_demographics.sql ← demographics (GDPR Art. 9 write-only)
│   ├── 018_config_and_governance_log.sql ← config schema + governance log
│   ├── 019_governance_bodies.sql  ← governance bodies reference table
│   ├── 020_job_notice_period.sql  ← max_notice_period_days on job_briefs
│   ├── 021_relax_matching_eligibility_trigger.sql ← trigger adjustment
│   ├── 022_force_rls_on_sensitive_tables.sql ← RLS hardening
│   ├── 023_protocol_version_history.sql ← version history in config
│   ├── 024_governance_users.sql   ← governance user accounts (identity schema)
│   ├── 025_certifications.sql     ← governed cert/licence ontology + candidate/job columns
│   └── 026_fix_cert_label_encoding.sql ← encoding fix for Windows psql migration
├── partitions/
│   └── create_monthly_partitions.sql  ← script to create future partitions
└── seeds/
    ├── 001_governance_constants.sql   ← protocol constants (weights, thresholds)
    └── 002_ontology_domains.sql       ← skill domain reference data
```

## Conventions

- All IDs are `UUID` generated with `gen_random_uuid()` (requires pgcrypto)
- All timestamps are `TIMESTAMPTZ` (UTC enforced)
- All `created_at` columns are set by trigger — never by application code
- `updated_at` columns are maintained by trigger
- Soft deletes are not used — deletions follow the pseudonymisation procedure
- JSONB columns use `jsonb_path_ops` GIN indexes where queried with `@>` or `@@`
- Migration files are numbered and sequential — never edit a committed migration; add a new one

## Running migrations

```bash
# Create the database
createdb fhp

# Run all migrations in order
psql fhp -f db/roles/000_roles.sql
for f in db/migrations/*.sql; do
  echo "Running $f..."
  psql fhp -f "$f"
done

# Seed reference data
for f in db/seeds/*.sql; do
  echo "Seeding $f..."
  psql fhp -f "$f"
done

# Create initial partitions
psql fhp -f db/partitions/create_monthly_partitions.sql
```

## Schema overview

```
┌─────────────────────────────────────────────────────────┐
│  Schema: identity  (PII — matching_engine_role: NO ACCESS)│
│  ─────────────────────────────────────────────────────   │
│  candidate_identity   candidate_auth                     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Schema: matching  (transactional — hot path)            │
│  ─────────────────────────────────────────────────────   │
│  companies            candidate_profiles                 │
│  candidate_cohorts    job_briefs                         │
│  match_events         match_explanations                 │
│  active_interactions  appeals                            │
│  escalations          ghosting_events                    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Schema: analytical  (append-only — warm path)           │
│  ─────────────────────────────────────────────────────   │
│  pipeline_traces (partitioned by month)                  │
│  fairness_metrics (partitioned by month)                 │
│  match_cohort_events (materialised view)                 │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Schema: audit  (legal / compliance)                     │
│  ─────────────────────────────────────────────────────   │
│  audit_log            deletion_records                   │
│  data_subject_requests                                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Schema: config  (governance constants and ontology)     │
│  ─────────────────────────────────────────────────────   │
│  governance_constants  ontology_domains                  │
│  skills                skill_transfer_relationships      │
│  rejection_codes       certifications                    │
└─────────────────────────────────────────────────────────┘
```

## Role model

| Role | Access |
|------|--------|
| `fhp_superuser` | Full access — DBA only |
| `fhp_api` | matching.*, audit.* — the API server role |
| `fhp_matching_engine` | matching.* EXCEPT identity schema — the pipeline role |
| `fhp_identity_service` | identity.* only — the auth/identity service role |
| `fhp_analytics` | analytical.* READ ONLY — fairness job, dashboards |
| `fhp_governance` | All schemas READ — governance bodies, audit |
| `fhp_readonly` | All non-identity schemas READ — monitoring |
