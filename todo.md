# To Do

Phase 1, Phase 2, and Phase 3 UIs are complete.
Legal and compliance documents are complete (draft — require legal review).
Database architecture is documented.

---

## Phase 1 — Foundation ✓ COMPLETE
## Phase 2 — Core engine ✓ COMPLETE
## Phase 3 — Surface layer ✓ COMPLETE (UIs)

---

## Legal & Compliance ✓ COMPLETE (draft)

### New documents created
- [x] `specs/legal-compliance.md` — comprehensive applicable law reference (GDPR, EU AI Act, Equality law, US law, international transfers)
- [x] `specs/database-architecture.md` — database decisions, rationale, schema strategy, limitations
- [x] `legal/privacy-policy.md` — candidate-facing privacy policy
- [x] `legal/data-processing-agreement.md` — GDPR Article 28 DPA for companies
- [x] `legal/dpia.md` — Data Protection Impact Assessment
- [x] `legal/eu-ai-act-conformity.md` — EU AI Act high-risk AI conformity documentation
- [x] `legal/pseudonymisation-procedure.md` — technical deletion / right to erasure procedure
- [x] `legal/terms-of-service.md` — candidate Terms of Service

### Existing documents updated with legal grounding
- [x] `specs/candidate-rights-charter.md` — added Legal Foundations section, GDPR Article citations, Article 22 right to human review, pseudonymisation-on-deletion language
- [x] `specs/company-compliance.md` — added EU AI Act obligations section (§7), GDPR data processor obligations section (§8), legal basis for prohibited filters
- [x] `specs/fhp-overview.md` — added legal and database documents to spec map; added legal compliance to minimal implementation requirements

### Items requiring external action before go-live
- [ ] All legal documents reviewed by qualified legal counsel in deployment jurisdiction(s)
- [ ] DPO designated, named, and registered with supervisory authority (ICO or equivalent)
- [ ] DPIA signed off by DPO
- [ ] EU AI Act registration completed in EU AI database (before EU deployment)
- [ ] Standard Contractual Clauses executed with sub-processors outside UK/EU
- [ ] Company Compliance Agreement / DPA finalised with legal review
- [ ] Terms of Service finalised and published
- [ ] Privacy Policy finalised and published
- [ ] Age verification mechanism implemented in onboarding flow
- [ ] Pseudonymisation-on-deletion procedure implemented and tested

---

## Remaining technical work

### API layer
- [x] HTTP API server (`api/server.ts`)
- [x] Candidate routes (profile CRUD, match history, data export)
- [x] Job brief routes (create, update, activate, expire)
- [x] Match routes (trigger pipeline, retrieve explanation)
- [x] Appeal routes (submit, status, withdraw)
- [x] Admin/governance routes (escalation management, audit log)
- [ ] Authentication middleware (JWT or session-based)
- [ ] Rate limiting and abuse prevention

### Database layer
- [x] Full SQL migration files (`db/migrations/`)
- [x] Schema: transactional cluster tables (candidate_profiles, candidate_identity, job_briefs, match_events, active_interactions, appeals, ghosting_events, companies)
- [x] Schema: analytical cluster tables (pipeline_traces, fairness_metrics, audit_log, match_cohort_events materialised view)
- [x] Schema: legal/audit tables (deletion_records, data_subject_requests)
- [x] RLS policies for all tables
- [x] Immutability trigger on pipeline_traces
- [x] PII separation (schema-level and role-level)
- [x] Partitioning strategy on pipeline_traces and match_events
- [x] Seed data (governance constants, ontology bootstrap)

### MMIL (Multi-Model Inference Layer)
- [ ] Model registry implementation
- [ ] Semantic expansion caller (Stage 2)
- [ ] Transfer weight pre-computation job (Stage 5)
- [ ] Explanation generator with validator pool (Stage 9)
- [ ] Consensus protocol implementation
- [ ] Disagreement handling and fallback
- [ ] MMIL fairness monitoring (expansion disparity, transfer disparity, tone disparity)
- [ ] Caching layer (expansion results by ontology version, transfer weights by skill pair)

---

## Standing / strategic items

- [ ] **Funding model** — formal FHP-P proposal for community review
- [ ] Choose and publish canonical domain / home for the protocol
- [ ] FHP-P proposal template (`proposals/template.md`)
- [ ] Example FHP-P proposal (`proposals/FHP-P-2025-001-example.md`)
- [ ] LICENSE files — CC BY 4.0 for `/specs`, Apache 2.0 for `/reference-impl`
- [ ] Company Compliance Agreement (full legal contract — distinct from the compliance framework doc)
