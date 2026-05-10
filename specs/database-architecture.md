# FHP Database Architecture

**Version:** 1.0.0-draft  
**Status:** Draft — awaiting TWG ratification  
**Spec file:** `specs/database-architecture.md`

---

## 1. Decision Summary

**Primary database: PostgreSQL**  
**Deployment model: Centralised canonical platform (single instance, managed service)**  
**Schema model: Two logical clusters (transactional and analytical) on the same technology**  
**PII strategy: Architectural separation — identity data never co-mingled with matching data**

---

## 2. Technology Decision: Why PostgreSQL

### 2.1 The case for a relational database

FHP's data model is fundamentally relational. Candidates have skills. Jobs require skills. Matches join candidates to jobs. Traces link to matches. Appeals reference traces. Ghosting events reference matches. Every entity references other entities through defined, typed relationships.

This is not a flexible-schema problem. FHP has a very precise, stable schema by design — the protocol's correctness depends on it. A document store (MongoDB, DynamoDB) offers flexibility that FHP explicitly does not want: bending the schema would silently corrupt the governance audit trail.

The analogy: using a document store for FHP because it is "more flexible" is like using a document store for double-entry accounting. The rigidity is the point.

### 2.2 Why PostgreSQL specifically

**Open source, no vendor lock-in.** Critical for a protocol that explicitly prohibits corporate capture (GOVERNANCE.md §4). FHP cannot be architecturally dependent on Oracle, SQL Server, or any proprietary database.

**JSONB support.** The trace schema and explanation schema are semi-structured (stage-level data varies by pipeline version, explanation content varies by audience). Postgres JSONB stores these natively with full indexing, without requiring a separate document store. Relational fields (IDs, timestamps, status) stay typed and indexed; variable content goes into JSONB columns.

**Row-Level Security (RLS).** The FHP privacy model — candidates see only their own data, employers see only consented matches, governance sees everything, the matching engine sees no PII — is expressible as Postgres RLS policies enforced at the database layer. This means privacy is not dependent on application code behaving correctly; the database rejects unauthorised queries outright.

**Native partitioning.** Match events and traces are the largest tables and are append-only. Postgres range partitioning by `created_at` month handles growth naturally, keeps query performance predictable, and allows old partitions to be archived or moved to cheaper storage without schema changes.

**Extensions in active use:**
- `pgcrypto` — trace SHA-256 checksums
- `uuid-ossp` — UUID v4 generation at the database layer
- `pg_trgm` — trigram text search on skill labels and role descriptions
- Potentially `timescaledb` — if the fairness metrics time-series workload justifies a dedicated extension rather than vanilla Postgres partitioning

**Ecosystem maturity.** Postgres has the best ecosystem of managed services (Supabase for open-source alignment, RDS, Cloud SQL, Neon, etc.), ORMs, migration tools, and operational tooling of any open-source database. For a foundation/charity minimising operational overhead, this matters.

### 2.3 MongoDB — considered and rejected

MongoDB was considered, given the team's existing experience. Reasons for rejection:

- FHP's schema is not flexible — it is precisely defined by the JSON schemas in `/specs`. Mongo's flexibility is a liability here, not an asset.
- Referential integrity is not optional in a system where the audit trail must be legally defensible. Mongo does not enforce foreign keys.
- JSONB in Postgres provides document-store capability for the genuinely semi-structured parts (trace stages, explanation content) without sacrificing relational integrity for the structured parts.
- Mongo's operational complexity (replica sets, oplog management) adds cost and risk for a foundation/charity model without commensurate benefit.

### 2.4 Oracle — not considered

Oracle's licensing model is incompatible with an open-source protocol governed to prevent corporate capture. Noted for completeness.

---

## 3. Deployment Model Decision: Centralised Canonical Platform

### 3.1 The governance argument for centralisation

The single most important reason to centralise is governance. FHP's governance model (Protocol Council, Fairness Oversight Board, Technical Working Group) can only function if there is one authoritative dataset:

- Fairness metrics require a population-level view. Computing DIR/EOD/SDS across a single company's 200 matches produces statistically unreliable results. Computing them across 200,000 matches across the platform produces reliable signals.
- Ghosting enforcement requires cross-platform visibility. A company that ghosts candidates on one federated instance can simply spin up another instance and start fresh. Central tracking prevents this.
- The candidate experience requires a single profile. A candidate should register once and be matched to jobs from any participating company. Federated instances break this: a candidate would need to register separately with each instance, recreating the exact problem FHP is solving.
- Appeal records and trace auditability require a single source of truth that cannot be tampered with by the company whose actions are being reviewed.

### 3.2 The "phone home" federated model — considered and rejected for v1

A federated model where certified instances "phone home" aggregate metrics was considered. It was rejected for v1 for the following reasons:

- Aggregate metrics alone are insufficient for governance. The FOB needs access to individual match traces to investigate specific escalations. Aggregate-only reporting would blind governance to individual-level problems.
- Certification of federated instances creates a new attack surface. A company could run a certified instance that phones home compliant-looking data while operating differently locally. Detecting this requires deep access to the instance, which undermines the federated model.
- The candidate single-profile benefit is lost in a federated model without a central identity layer — which, if added, effectively recreates centralisation anyway.
- Operational complexity of federating is high for v1. The protocol itself is complex enough without adding federation protocol complexity.

**The federated model is not permanently ruled out.** If FHP reaches a scale where centralisation creates monopoly risk or regulatory problems, a federated architecture with strong cryptographic attestation (similar to how ActivityPub federates social media, or how Certificate Transparency logs work) could be explored. This is a v2+ consideration.

### 3.3 Centralisation risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Single point of failure | Managed Postgres with automatic failover; multi-AZ deployment |
| Single point of capture | Governance model (GOVERNANCE.md) with anti-capture safeguards; infrastructure controlled by foundation, not sponsor |
| Regulatory target (subpoena, data request) | No-PII architecture means the matching data has minimal legal exposure; identity data is minimal; GDPR and strong encryption in transit and at rest |
| Scale bottleneck | Partitioning, read replicas, and the analytical cluster design handles projected scale without architectural change |

---

## 4. Schema Architecture

### 4.1 Two logical clusters

**Cluster A: Transactional (hot)**

Handles the live matching pipeline, candidate and job management, SLA monitoring, and appeals. OLTP profile: fast single-row lookups, low-latency writes, high concurrency.

Tables: `candidate_profiles`, `candidate_identity`, `job_briefs`, `match_events`, `match_explanations`, `active_interactions`, `ghosting_events`, `appeals`, `companies`

**Cluster B: Analytical (warm)**

Handles audit trail and fairness computation. Append-only. Read-heavy. Can tolerate slightly higher latency. Queried by the nightly fairness job and governance investigations.

Tables: `pipeline_traces`, `fairness_metrics`, `audit_log`, `match_cohort_events` (materialised)

At small/medium scale: both clusters run on a single Postgres instance with separate schemas, read replicas serving analytical queries. At scale: separate instances, or the analytical cluster moves to TimescaleDB (Postgres-compatible) or a data warehouse for the fairness computation job.

### 4.2 PII separation — the critical design

The privacy architecture requires that the matching engine database role cannot read the identity table. This is enforced at two levels:

**Level 1: Schema separation**
```sql
-- Schema accessed by matching engine
CREATE SCHEMA matching;
-- Schema accessed by identity service only
CREATE SCHEMA identity;

GRANT USAGE ON SCHEMA matching TO matching_engine_role;
GRANT USAGE ON SCHEMA identity TO identity_service_role;
-- matching_engine_role has NO grant on identity schema
```

**Level 2: Row-Level Security**
```sql
-- Matching engine can only read its own schema
ALTER TABLE identity.candidate_identity ENABLE ROW LEVEL SECURITY;
CREATE POLICY identity_service_only ON identity.candidate_identity
  USING (current_user = 'identity_service_role');
```

This means even if the matching engine code has a bug that attempts to join to the identity table, the database rejects the query. Privacy is enforced at the infrastructure layer.

### 4.3 Immutability enforcement

Pipeline traces must be immutable after creation. Enforced by database trigger:

```sql
CREATE OR REPLACE FUNCTION prevent_trace_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'Traces are immutable. Modification of trace % is a protocol violation.',
    OLD.trace_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_trace_immutability
  BEFORE UPDATE OR DELETE ON analytical.pipeline_traces
  FOR EACH ROW EXECUTE FUNCTION prevent_trace_modification();
```

The trigger fires at the database level, not the application level. No application code can override it.

### 4.4 Partitioning strategy

Tables partitioned by `created_at` from day one:

```sql
CREATE TABLE analytical.pipeline_traces (
  trace_id     UUID        NOT NULL,
  match_id     UUID        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL,
  status       TEXT        NOT NULL,
  trace_data   JSONB       NOT NULL,
  checksum     CHAR(64)    NOT NULL
) PARTITION BY RANGE (created_at);

-- Monthly partitions — created by a scheduled job
CREATE TABLE analytical.pipeline_traces_2025_11
  PARTITION OF analytical.pipeline_traces
  FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
```

Partitions older than 90 days (outside the appeal window) can be moved to cheaper storage (e.g., S3 via `pg_partman` + `pg_cron` for automation) without touching the main table structure. This keeps the hot partition small and query-fast.

### 4.5 Critical indexes

```sql
-- Hot path: pipeline looks up candidate and job at run start
-- (PK indexes on candidate_id and job_id are automatic)

-- SLA monitor: active interactions without full scan
CREATE INDEX ON matching.active_interactions (sla_deadline, status)
  WHERE status = 'active';

-- Fairness job: rolling window scan
CREATE INDEX ON analytical.match_cohort_events (created_at, company_id, job_id);

-- Appeal lookup
CREATE INDEX ON matching.appeals (match_id, candidate_id, status);

-- Active job briefs
CREATE INDEX ON matching.job_briefs (status, expires_at)
  WHERE status = 'active';

-- Ghosting by company (enforcement ladder)
CREATE INDEX ON matching.ghosting_events (company_id, detected_at, status);
```

### 4.6 The fairness computation materialised view

Rather than joining raw match events, cohort memberships, and job data at 3am in the nightly job, a materialised view pre-joins the data during the day:

```sql
CREATE MATERIALIZED VIEW analytical.match_cohort_events AS
  SELECT
    me.match_id,
    me.candidate_id,
    me.job_id,
    me.company_id,
    me.decision,
    me.overall_score,
    me.qualified,
    me.created_at,
    cc.cohort_id,
    cc.characteristic
  FROM matching.match_events me
  JOIN matching.candidate_cohorts cc
    ON me.candidate_id = cc.candidate_id
  WHERE me.created_at > NOW() - INTERVAL '35 days';

CREATE INDEX ON analytical.match_cohort_events (created_at, company_id, cohort_id);

-- Refreshed nightly before the fairness job runs
```

The fairness job reads from this materialised view — a single, indexed, pre-joined dataset — rather than doing expensive joins across large tables at compute time.

---

## 5. Managed Service Recommendation

For a foundation/charity model minimising hosting cost while remaining scalable:

**Primary recommendation: Supabase**
- Open source (PostgreSQL under the hood)
- Foundation-friendly pricing
- Built-in RLS support and management UI
- Auth service (handles candidate authentication without bespoke implementation)
- Storage service (for trace archives)
- Aligned with open-source values

**Alternative: AWS RDS PostgreSQL (or Aurora PostgreSQL)**
- More expensive but more mature operationally
- Aurora Serverless v2 has cost advantages at variable load
- Appropriate if FHP has enterprise relationships that include AWS credits

**What to avoid:**
- Any proprietary managed database that is not Postgres-compatible
- Any managed service whose terms allow the provider to use FHP data for their own purposes (check DPA terms carefully)

---

## 6. Performance Targets and Scale Planning

### 6.1 Projected data volumes (planning horizon: 3 years post-launch)

| Table | Est. rows (year 3) | Size estimate |
|-------|-------------------|--------------|
| candidate_profiles | 500k | ~2GB |
| job_briefs | 100k | ~500MB |
| match_events | 50M | ~20GB |
| pipeline_traces | 50M | ~500GB (JSONB-heavy) |
| fairness_metrics | 500k | ~2GB |
| ghosting_events | 100k | ~200MB |

Pipeline traces are the dominant storage cost. JSONB compression in Postgres typically achieves 3–5× reduction for structured JSON. Archiving partitions older than 90 days to object storage (keeping only the checksum and metadata in Postgres) reduces live storage to a manageable ~50GB.

### 6.2 The MMIL cost wildcard

The most significant hosting cost is not the database — it is the multi-model inference layer's API calls to LLM providers for semantic expansion, transfer compensation, and explanation generation. Aggressive caching (as defined in `multi-model-inference-spec.md`) is essential:

- Semantic expansion results are cached per ontology version (invalidated only on ontology update)
- Transfer weight results are pre-computed nightly across all active skill pairs
- Only explanation generation requires a live model call per match

With this caching strategy, LLM API costs are bounded to one explanation generation call per match, rather than three calls per match.

### 6.3 Read replica strategy

| Workload | Where to run |
|---------|-------------|
| Live pipeline matching | Primary instance |
| SLA monitor | Primary instance |
| Company dashboard reads | Read replica |
| Candidate portal reads | Read replica |
| Nightly fairness job | Read replica (from materialised view) |
| Governance dashboard | Read replica |

This keeps the primary instance focused on writes and the hot path.

---

## 7. Limitations and Known Constraints

These are honest limitations of the chosen architecture, documented so future decisions can be made with full information.

**1. Postgres does not scale writes horizontally (without Citus or similar).** At very high concurrent match volume (>500 matches/second), the single primary becomes a bottleneck. This is not a concern at v1 scale, but would require either Citus (Postgres sharding extension) or a queue-based pipeline (matches processed asynchronously) if FHP reaches that scale.

**2. JSONB queries are slower than structured column queries.** The trace_data JSONB column supports governance queries, but complex JSONPath queries on large JSONB blobs are expensive. Frequently-queried trace fields (e.g., pipeline stage status) should be promoted to structured columns as query patterns become clear.

**3. The centralised model creates a GDPR data controller responsibility.** FHP (as the central platform) is the data controller for all candidate personal data. This means FHP bears the legal and financial liability for data breaches, subject access requests, and supervisory authority investigations. This is appropriate for a foundation/charity model but must be fully understood before launch.

**4. The no-PII architecture prevents personalised communication.** Because FHP does not store names, communications must use generic salutations ("Hello" rather than "Dear Jordan"). This is a minor UX limitation and the right trade-off, but it should be designed for deliberately.

**5. Fairness metrics require minimum cohort sizes.** The 20-candidate minimum cohort threshold means that new companies and niche roles will not have bias correction active until sufficient data accumulates. This is documented in the bias correction spec as a known limitation and is unavoidable given the statistical requirements of the fairness metrics.
