# FHP Overview — For Implementers

**Version:** 1.0.0-draft  
**Status:** Draft — awaiting TWG review  
**Spec file:** `specs/fhp-overview.md`

---

## What is FHP?

The Fair Hiring Protocol (FHP) is an open, community-governed standard for bias-aware, transparent, candidate-first hiring. It defines a complete, canonical matching protocol: schemas for all entities, a deterministic nine-stage matching pipeline, a mathematical scoring model, a bias detection and correction layer, a governance framework, candidate rights, and company compliance obligations.

FHP is not software. It is a specification. Anyone may implement it. Implementations that conform to this specification are FHP-compliant. Implementations that modify the fairness core are not.

This document is the entry point for implementers. It maps the full spec, explains how the pieces relate, and describes the compliance boundary.

---

## 1. The specification map

All normative documents live in `/specs`. This table shows every document, what it defines, and its dependencies.

| Document | What it defines | Depends on |
|----------|----------------|------------|
| `identity-model.schema.json` | All entity ID types and lifecycle rules | — |
| `candidate-profile.schema.json` | Candidate entity, skills, preferences, privacy | `identity-model`, ontology |
| `job-brief.schema.json` | Job opportunity entity, requirements, compliance attestations | `identity-model`, ontology |
| `match-explanation.schema.json` | The explanation produced for every match event | `identity-model`, `scoring-spec` |
| `trace.schema.json` | The immutable audit log of every pipeline run | `identity-model`, `matching-engine-spec` |
| `ghosting-event.schema.json` | SLA breach records | `identity-model`, `governance-escalation-spec` |
| `fairness-metrics.schema.json` | Nightly fairness computation output | `identity-model`, `bias-correction-spec` |
| `scoring-spec.md` | Mathematical scoring model | `candidate-profile`, `job-brief`, ontology |
| `bias-correction-spec.md` | DIR, EOD, SDS metrics; correction algorithm | `scoring-spec`, `fairness-metrics` |
| `matching-engine-spec.md` | Nine-stage pipeline pseudocode and contracts | All schemas, `scoring-spec`, `bias-correction-spec` |
| `governance-escalation-spec.md` | SLA rules, appeal process, escalation pipeline | All schemas, GOVERNANCE.md |
| `candidate-rights-charter.md` | Candidate rights (normative) | All of the above |
| `company-compliance.md` | Company obligations and enforcement | All of the above |
| `fhp-overview.md` | This document | All of the above |
| `legal-compliance.md` | Applicable law, GDPR/AI Act obligations, jurisdiction guide | All of the above |
| `database-architecture.md` | Database design decisions, schema strategy, rationale | `identity-model`, all schemas |
| `privacy-policy.md` | Candidate-facing privacy policy | `legal-compliance.md`, `candidate-rights-charter.md` |
| `data-processing-agreement.md` | Company DPA (GDPR Article 28) | `legal-compliance.md`, `company-compliance.md` |
| `dpia.md` | Data Protection Impact Assessment | `legal-compliance.md`, all schemas |
| `eu-ai-act-conformity.md` | EU AI Act high-risk AI conformity documentation | `legal-compliance.md`, all specs |

The ontology (`/ontology/skills.json` and `/ontology/mapping-rules.md`) is a dependency of the schemas and the matching engine, but is maintained separately by the TWG and versioned independently.

---

## 2. The compliance boundary

Not everything in FHP is equally binding. There are three tiers:

### Tier 1 — Normative core (cannot be modified)

These elements are the fairness core. An implementation that modifies them is not FHP-compliant, regardless of what it claims:

- The nine pipeline stages and their defined order
- The scoring formula weights (`w_m`, `w_n`, `w_p`) and match threshold
- The bias correction metrics (DIR, EOD, SDS), their bounds, and the correction algorithm
- The candidate rights defined in `candidate-rights-charter.md`
- The SLA windows and enforcement ladder
- The prohibited filters
- The identity model (UUID v4, PII separation from the matching engine)
- The explanation requirement (every match outcome must have an explanation)
- The trace requirement (every pipeline run must produce an immutable trace)

### Tier 2 — Normative with governance-controlled parameters

These elements are part of the spec, but their specific values may be updated through the FHP-P proposal process:

- Weight values (`w_m = 0.55`, `w_n = 0.25`, `w_p = 0.20`)
- Match and borderline thresholds (0.60, 0.50)
- Bias correction constants (scaling factor, caps, alert threshold)
- Metric bounds (DIR 0.8/1.25, EOD 0.05, SDS 0.03)
- Minimum cohort size for bias detection (20)
- SLA windows for each hiring stage

Implementations must use the current governance-published values. They may not set their own.

### Tier 3 — Permitted extensions

Implementations may add functionality that does not modify Tier 1 or Tier 2 elements:

- Additional candidate profile fields (beyond what the schema defines)
- Additional job brief fields
- Additional UI features
- Custom reporting and analytics beyond the FHP-defined dashboards
- Integration with third-party ATS, HRIS, or background check systems (provided that third-party data is not fed into the matching pipeline in any way that violates the fairness core)
- Custom notification systems, provided SLA obligations are met

Extensions that interact with the matching pipeline at any stage require a formal FHP-P extension proposal and TWG review before they may be advertised as FHP-compliant.

---

## 3. Data flow overview

This diagram shows the high-level data flow between entities and components:

```
Candidate                          Company
    │                                 │
    │ creates                         │ creates
    ▼                                 ▼
CandidateProfile              JobBrief
    │                                 │
    └──────────┬──────────────────────┘
               │ both consumed by
               ▼
        ┌─────────────────┐
        │  Matching Engine │◄── SkillOntology (versioned)
        │  (9-stage pipeline)◄── GovernanceConfig (weights, thresholds)
        │                 │◄── FairnessMetrics (nightly snapshot)
        │                 │◄── CohortService (anonymised)
        └────────┬────────┘
                 │ produces
        ┌────────┴────────────────┐
        │                         │
        ▼                         ▼
  MatchExplanation          PipelineTrace
  (3 audience views)        (immutable, checksummed)
        │                         │
        ├── to Candidate           └── to TraceStore
        ├── to Employer                    │
        └── to GovernanceLog               ├── Appeals
                                           ├── Audits
                                           └── FOB Review

                    ▼ (nightly)
              FairnessMetrics ──► GovernanceDashboard
                    │              CompanyDashboard
                    └──────────►  EscalationPipeline
```

---

## 4. What a minimal compliant implementation must include

A minimal FHP-compliant implementation must provide:

**Data layer:**
- Storage conforming to all seven FHP schemas (candidate profile, job brief, match explanation, trace, ghosting event, fairness metrics, identity model)
- An append-only trace store (traces must be immutable after creation)
- A checksum verification mechanism for trace integrity

**Matching engine:**
- All nine pipeline stages in the defined order
- The scoring formula as specified in `scoring-spec.md`
- Transferable skill compensation using the FHP ontology
- Bias detection and correction using the three defined metrics
- Explanation generation for all three audiences

**Fairness computation:**
- A nightly (or more frequent) fairness computation job
- Cohort-based metric computation with minimum cohort size suppression
- Metric breach detection and governance flag generation

**SLA monitoring:**
- Automatic SLA deadline computation per stage per active interaction
- Ghosting event creation on breach
- Candidate notification within 1 hour of breach detection
- Company notification and enforcement action per the escalation ladder

**Governance:**
- Appeal submission and tracking
- Escalation record creation and routing
- Public audit log (with PII redacted)

**Candidate-facing:**
- Profile creation, editing, and deletion
- Match history and explanation access
- Appeal submission
- Data export in FHP-standard JSON format
- Consent and privacy control management

**Legal compliance:**
- Pseudonymisation-on-deletion procedure (GDPR Article 17)
- Data export in FHP JSON format (GDPR Articles 15 and 20)
- Age verification at registration (minimum age 18)
- Candidate notification that automated decision-making is in use (EU AI Act Article 13 / GDPR Article 22)
- Data Protection Impact Assessment completed before going live
- Data Protection Officer designated (or equivalent for the jurisdiction)

A minimal implementation does not need to provide company dashboards, governance dashboards, or any UI beyond what is necessary for candidates and companies to interact with the protocol. These are Phase 3 features. The protocol itself is the Phase 1–2 requirement.

---

## 5. Versioning

FHP uses semantic versioning: `MAJOR.MINOR.PATCH`.

- **MAJOR** — breaking changes to the fairness core (Tier 1). Requires FHP-P proposal, 30-day review, FOB assessment, and 5/6 PC supermajority.
- **MINOR** — changes to governance-controlled parameters (Tier 2), new required fields in schemas, or new normative requirements. Requires FHP-P proposal, 30-day review, and standard 4/6 PC majority.
- **PATCH** — clarifications, non-normative documentation improvements, ontology updates. Requires TWG consensus and PC notification (no vote required).

Implementations must declare which FHP version they conform to. All FHP schemas include a `fhp_version` field. Mixed-version operation (e.g. running the 1.0 matching engine against 1.1 schemas) is not supported and must be rejected at validation.

---

## 6. Conformance testing

The `/reference-impl/tests` directory contains a conformance test suite. Any implementation claiming FHP compliance must pass all normative tests in this suite against the current protocol version.

Tests cover:
- Schema validation for all entity types
- Pipeline stage ordering and early-abort behaviour
- Scoring formula correctness (against reference inputs and expected outputs)
- Bias correction application (against synthetic cohort data)
- SLA deadline computation
- Trace checksumming and integrity verification
- Explanation audience filtering (verifying that employer explanations do not contain candidate PII or bias correction details)

The conformance test suite is maintained by the TWG and versioned alongside the protocol.

---

## 7. Reference implementation

The `/reference-impl` directory provides a minimal, clean implementation that passes all conformance tests. It is the canonical example of how the protocol should be built.

The reference implementation is not a production system. It is intentionally minimal — it demonstrates correct behaviour, not scalability or production-readiness. Implementers are expected to build production systems that conform to the protocol, using the reference implementation as a guide.

The reference implementation is licensed under Apache 2.0. All other spec documents are licensed under CC BY 4.0.

---

## 8. Getting help

- To propose a change to the protocol: submit an FHP-P document in `/proposals`
- To report a conformance issue with this spec: open a GitHub issue
- To contribute to the reference implementation: see `CONTRIBUTING.md`
- To join the Technical Working Group: open an issue expressing interest
- To raise a governance concern: see the escalation process in `governance-escalation-spec.md`
