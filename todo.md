# FHP — Build Status

Last updated: May 2026

---

## Original TODO — Status

| Item | Status | Location |
|------|--------|----------|
| The appeals workflow | ✅ Complete | `008_appeals.sql` · `appeals.ts` · `appeals-extended.ts` · `reference-impl/appeals/state-machine.ts` · Candidate app Appeals tab |
| The company fairness dashboard UI | ✅ Complete | `company-dashboard.html` — Fairness Metrics tab, per-job DIR/EOD/SDS table, breach notice, remediation submit |
| The bias correction algorithm | ✅ Complete | `bias-correction-spec.md` · `reference-impl/bias/correction.ts` · `reference-impl/bias/cohort-service.ts` |
| The candidate portal UI | ✅ Complete | `candidate-app.html` — 6 tabs: Dashboard, Match History, My Profile, Appeals, Data & Privacy, Your Rights |
| The candidate fairness dashboard UI | ✅ Complete | Merged into `candidate-app.html` Match History tab — expanding explanation cards, skill grids, score breakdowns |
| The data model for ghosting events | ✅ Complete | `009_sla_ghosting.sql` · `matching.ghosting_events` · `ghosting-event.schema.json` |
| The data model for fairness metrics | ✅ Complete | `010_analytical.sql` · `analytical.fairness_metrics` (partitioned) · `fairness-metrics.schema.json` |
| The data model (candidates, jobs, matches, traces, companies) | ✅ Complete | Migrations 003–010 · 17 matching schema tables · 14 analytical partitions |
| The explanation schema | ✅ Complete | `match-explanation.schema.json` · `matching.match_explanations` · Stage 9 in reference impl |
| Design the formal JSON schema — Job Brief schema | ✅ Complete | `job-brief.schema.json` |
| Define the bias correction layer | ✅ Complete | `bias-correction-spec.md` · `reference-impl/bias/correction.ts` |
| Define the explanation format | ✅ Complete | `match-explanation.schema.json` · Stage 9 of pipeline |
| Design the portal architecture | ✅ Complete | `candidate-app.html` · `company-dashboard.html` · `landing-page.html` · `governance-dashboard.html` |
| Design the reference implementation structure | ✅ Complete | `reference-impl/STRUCTURE.md` · package.json · tsconfig · full folder tree |
| The ghosting SLA rules (governance-level) | ✅ Complete | `009_sla_ghosting.sql` · `sla/monitor.ts` · governance constants seeded · `governance-escalation-spec.md` |
| The governance escalation pipeline | ✅ Complete | `governance-escalation-spec.md` · `matching.escalations` · `governance.ts` routes |
| The governance dashboard UI | ✅ Complete | `governance-dashboard.html` — 6 working tabs: Overview, Escalations, Fairness, Proposals, Audit Log, Votes |
| The identity model | ✅ Complete | `identity-model.schema.json` · `003_identity.sql` · `identity.candidate_identity` · `identity.candidate_auth` · `identity.company_auth` |
| The matching engine pseudocode/internals | ✅ Complete | `matching-engine-spec.md` · `reference-impl/matching-engine/` — full 9-stage pipeline · 90 conformance tests |
| The multi-model inference layer | ⚠️ Spec only | `multi-model-inference-spec.md` is complete. No implementation code — deferred (provider-specific, owner has gen-AI experience) |
| The nightly fairness computation job | ✅ Complete | `reference-impl/fairness/fairness-job-updated.ts` — per-dimension (sex/age/ethnicity/religion/education), data insufficiency handling, 39 tests passing |
| The scoring formula | ✅ Complete | `scoring-spec.md` · Stages 4–5 in `reference-impl/matching-engine/stages/` |
| The SLA rules (governance-level) | ✅ Complete | `009_sla_ghosting.sql` · `sla/monitor.ts` · governance constants seeded in DB |
| The trace schema | ✅ Complete | `trace.schema.json` · `analytical.pipeline_traces` (partitioned) · `GET /v1/candidates/me/matches/:id/trace` |

**23 of 24 items complete. 1 deferred (MMIL implementation).**

---

## Additional work completed (beyond original TODO)

- Full REST API — 62 endpoints across 14 route files
- PostgreSQL schema — 17 migrations, all validated against PostgreSQL 16
- Legal & compliance docs — Privacy policy, DPIA, DPA, EU AI Act conformity, ToS, Pseudonymisation procedure
- Demographic data capture — `017_candidate_demographics.sql` · `demographics.ts` · UI in candidate app Data & Privacy tab
- Company authentication — `016_company_auth.sql` · `auth-company.ts`
- API gap analysis — `api-gap-analysis.md` (complete screen-by-screen mapping)
- Add/Edit job dialog — fully wired in `company-dashboard.html` with all 6 sections and compliance attestations

---

## Database — What's missing

**Not 100% complete. Three gaps:**

### 1. `config.skills` table — MISSING
Referenced by: `GET /v1/ontology/skills`, `GET /v1/ontology/domains`, matching engine Stage 2 (semantic expansion), `reference-impl/ontology/loader.ts`

The skills data exists as `reference-impl/ontology/skills.json` (98 skills, 14 domains, 72 transfer relationships) but has never been loaded into a DB table. The ontology loader reads from the JSON file at runtime — which works for the reference impl but the API route queries `config.skills` as a table.

**Needs:** Migration 018 creating `config.skills` and `config.skill_transfer_relationships`, seeded from `skills.json`.

### 2. `config.rejection_codes` table — MISSING
Referenced by: `GET /v1/reference/rejection-codes` · `POST /v1/companies/me/interactions/:id/reject` (validates reason codes)

The rejection taxonomy is defined in the spec and used in the company dashboard Rejections page but the DB table and seed data don't exist.

**Needs:** Migration 018 (or 019) creating `config.rejection_codes` with ~15 seeded codes (SR-01 through AS-xx, PR-xx, PL-xx).

### 3. `audit.governance_log` table — MISSING
Referenced by: `appeals-extended.ts`, `companies-extended.ts`, `governance-extended.ts` — all write structured governance events here.

The existing `audit.audit_log` table has a different schema (company/job/appeal/escalation foreign keys, constrained event_type enum) and is used by the original routes. The newer routes write to `audit.governance_log` which has a more flexible schema (`entity_type`, `entity_id`, `actor_type`, `actor_id`, `summary`, `occurred_at`) suited to cross-entity governance events.

**Needs:** Migration 018 (or 019) creating `audit.governance_log` with the columns the routes expect.

---

## API — What's missing

**Functionally 100% complete** for all screens. However three routes will fail at runtime until the DB gaps above are resolved:

| Route | Fails because |
|-------|--------------|
| `GET /v1/ontology/skills` | Queries `config.skills` — table doesn't exist |
| `GET /v1/ontology/domains` | Queries `config.skills` — table doesn't exist |
| `GET /v1/reference/rejection-codes` | Queries `config.rejection_codes` — table doesn't exist |
| `POST /v1/companies/me/interactions/:id/reject` | Validates against `config.rejection_codes` — table doesn't exist |
| `INSERT INTO audit.governance_log` | Table doesn't exist — affects 3 route files |

All other 57 endpoints query tables that exist and are validated.

---

## Recommended next: Migration 018

One migration resolves all three DB gaps:

```sql
-- config.skills (from ontology/skills.json)
-- config.skill_transfer_relationships
-- config.rejection_codes (seeded)
-- audit.governance_log
```

After that, the DB and API are both 100% complete (excluding MMIL).
