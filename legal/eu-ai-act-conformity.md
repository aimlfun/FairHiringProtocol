# FHP — EU AI Act Conformity Documentation

**Version:** 1.0.0-draft  
**Status:** Draft — requires legal review before market placement in EU  
**Regulation:** EU AI Act (Regulation 2024/1689)  
**Risk classification:** High-risk AI system (Annex III, §4 — employment, workers management, and access to self-employment)  
**Document:** `legal/eu-ai-act-conformity.md`

> This document constitutes FHP's internal conformity assessment for the purposes of Article 43 of the EU AI Act. It must be reviewed by qualified legal counsel and updated whenever there is a material change to the system.

---

## 1. System Identification

| Field | Value |
|-------|-------|
| System name | Fair Hiring Protocol (FHP) |
| Version | 1.0.0 |
| Provider | [FHP Foundation — TBD] |
| Contact | [compliance@fair-hiring-protocol.org — TBD] |
| Intended purpose | Automated matching of candidate skills profiles to job opportunities; bias detection and correction in recruitment |
| Annex III category | §4 — "AI systems intended to be used for recruitment or selection of natural persons, notably for advertising vacancies, screening or filtering applications, evaluating candidates" |
| High-risk classification | Yes |

---

## 2. Conformity Assessment Procedure

Under Article 43(2), AI systems listed in Annex III (other than those in §1 — biometric systems) shall undergo the conformity assessment procedure referred to in Annex VI: **internal control** (provider self-assessment with technical documentation).

This document, together with the FHP specification corpus, constitutes that technical documentation and internal control assessment.

---

## 3. Article-by-Article Conformity Assessment

### Article 9 — Risk Management System

**Requirement:** A risk management system shall be established, implemented, documented, and maintained throughout the AI system's lifecycle. It shall identify, analyse, and estimate the risks; evaluate risks that cannot be eliminated; and adopt risk management measures.

**FHP implementation:**

| Requirement | Implementation | Document reference |
|-------------|---------------|-------------------|
| Risk identification and analysis | DPIA §5 — Risk register | `legal/dpia.md` |
| Ongoing risk evaluation | Nightly fairness computation; governance escalation pipeline | `specs/fairness-metrics.schema.json`, `specs/governance-escalation-spec.md` |
| Bias and discrimination testing | Bias correction spec (DIR, EOD, SDS metrics); Fairness Oversight Board quarterly audits | `specs/bias-correction-spec.md` |
| Mitigation measures for known risks | Bias correction layer; appeal process; prohibited filter enforcement | `specs/matching-engine-spec.md`, `specs/company-compliance.md` |
| Residual risk documentation | DPIA §8 | `legal/dpia.md` |

**Conformity assessment:** ✓ Requirements met. Risk management is systemic, documented, and continuous rather than point-in-time.

---

### Article 10 — Data and Data Governance

**Requirement:** Training, validation, and testing datasets shall be subject to data governance practices. Datasets shall be relevant, representative, free of errors, and complete. Biases shall be identified and addressed.

**FHP implementation:**

The FHP matching pipeline is **deterministic, not trained on data**. The scoring formula (scoring-spec.md) is a mathematical function with no learned parameters. There are no training datasets for the core pipeline.

The multi-model inference layer (MMIL) uses pre-existing foundation models for semantic expansion, transfer scoring, and explanation generation. For these models:

| Requirement | Implementation | Document reference |
|-------------|---------------|-------------------|
| Model selection governance | TWG model registry; independence requirements; certification process | `specs/multi-model-inference-spec.md §3` |
| Bias assessment of models | FHP benchmark suite; MMIL fairness monitoring (expansion disparity, transfer disparity, explanation tone disparity) | `specs/multi-model-inference-spec.md §6` |
| Model version control | Pinned versions; staging period; shadow mode before deployment | `specs/multi-model-inference-spec.md §3.3` |
| Data used in fairness computation | Real match event data; minimum cohort size 20; suppression below threshold | `specs/fairness-metrics.schema.json` |

**Conformity assessment:** ✓ Requirements met for the deterministic pipeline. MMIL model governance provides appropriate oversight of the learned components.

---

### Article 11 — Technical Documentation

**Requirement:** Before market placement, comprehensive technical documentation shall be drawn up and kept up-to-date. Documentation shall enable assessment of compliance and shall include the information set out in Annex IV.

**Annex IV mapping:**

| Annex IV requirement | FHP document |
|--------------------|-------------|
| General description, intended purpose and intended users | `README.md`, `specs/fhp-overview.md` |
| System's components, interrelationships and functioning | `specs/matching-engine-spec.md`, `specs/fhp-overview.md §1` |
| Technical specifications, including version | `specs/` corpus — all version-stamped |
| Description of changes to the system across its lifetime | `/proposals/` FHP-P proposal archive |
| Description of the relevant elements of the deployment infrastructure | `specs/database-architecture.md` |
| Description of the risk management system | `legal/dpia.md` |
| Description of relevant changes made through the lifecycle | FHP-P proposal changelog |
| Validation and testing procedures | `reference-impl/tests/conformance/` — 90 conformance tests |
| Description of monitoring, functioning and control of AI system | `specs/governance-escalation-spec.md`, governance dashboard |
| Description of human oversight measures | Appeal process: `specs/governance-escalation-spec.md §B.5` |
| Description of logging capabilities | `specs/trace.schema.json` |
| Description of measures taken to eliminate/reduce risks | `specs/bias-correction-spec.md`, `specs/company-compliance.md` |

**Conformity assessment:** ✓ Technical documentation requirements met. The FHP spec corpus is maintained as living documentation, version-controlled alongside the code.

---

### Article 12 — Record-Keeping

**Requirement:** High-risk AI systems shall be designed to automatically record events (logging) throughout their operation, to the extent technically feasible, for a period appropriate to the purpose.

**FHP implementation:**

| Logging requirement | FHP implementation | Retention |
|--------------------|-------------------|-----------|
| Each period of use | Every pipeline run generates a trace | 7 years |
| Reference database or training data | Model registry (MMIL); ontology versioning | Indefinite |
| Input data for which results caused or contributed to significant risk | Full input snapshot in trace `input_snapshot` fields | 7 years |
| Identity of natural persons involved in verification (appeals) | Governance role identifiers in trace `appeal_flags` | 7 years |
| Automatic logging of events | Pipeline trace generated atomically with match outcome — cannot be dissociated | — |

The trace schema (`trace.schema.json`) implements:
- SHA-256 checksum for tamper detection
- Database trigger preventing modification after creation
- Append-only storage with immutability enforced at the infrastructure level

**Conformity assessment:** ✓ Requirements met. Logging is automatic, comprehensive, tamper-evident, and retained for an appropriate period.

---

### Article 13 — Transparency and Provision of Information to Deployers

**Requirement:** High-risk AI systems shall be designed and developed with sufficient transparency that deployers (companies) can understand the system's operation and use it as intended.

**FHP implementation for deployers (companies):**

| Requirement | Implementation |
|-------------|---------------|
| Intended purpose | `company-compliance.md §1`, FHP overview |
| Level of accuracy, robustness and cybersecurity | Conformance test suite; bias correction spec with metric bounds |
| Expected lifetime and maintenance measures | Protocol versioning; FHP-P proposal process |
| Human oversight measures | Appeal process; governance escalation |
| Characteristics, capabilities and limitations | `specs/fhp-overview.md §2 (compliance boundary)` |
| Data used to train and test (where relevant) | Model registry; MMIL spec |
| Performance metrics | Fairness metrics; conformance test suite |

**Transparency to candidates (Article 13 in context of Article 22 GDPR):**

| Requirement | Implementation |
|-------------|---------------|
| That an AI system is being used | Privacy policy; onboarding disclosure; every match outcome |
| The system's logic (in simplified form) | Explanation schema: plain-language summaries per outcome |
| The envisaged consequences | Match decision explained in every outcome |

**Conformity assessment:** ✓ Requirements met. The explanation schema provides per-outcome transparency to candidates. The spec corpus provides full technical transparency to deployers.

---

### Article 14 — Human Oversight

**Requirement:** High-risk AI systems shall be designed and developed with appropriate human-machine interface tools that allow effective human oversight during the period the AI system is in use.

**FHP implementation:**

| Oversight mechanism | Implementation | Who exercises it |
|--------------------|---------------|-----------------|
| Ability to understand capabilities and limitations | Company fairness dashboard; governance dashboard | Companies, governance |
| Ability to detect anomalies, dysfunctions, and unexpected performance | Fairness metrics breach detection; governance alerts | FOB, Protocol Council |
| Ability to disregard, override or reverse outputs | Appeal process — any outcome can be overturned by human review | Candidates (via appeal) / PC |
| Ability to intervene on system operations | Protocol Council can pause companies; FOB can veto protocol changes | Governance bodies |
| Ability to decide not to use the AI system in specific situations | Companies may withdraw job briefs; candidates may withdraw profiles | Companies, candidates |

**Conformity assessment:** ✓ Requirements met. Human oversight is structural, not theoretical: the appeal process has defined SLAs and formal outcomes; governance bodies have defined powers to intervene.

---

### Article 15 — Accuracy, Robustness and Cybersecurity

**Requirement:** High-risk AI systems shall be designed and developed to achieve an appropriate level of accuracy, robustness, and cybersecurity throughout their lifecycle. They shall be resilient to errors, faults, and inconsistencies.

**FHP implementation:**

| Requirement | Implementation |
|-------------|---------------|
| Accuracy metrics | 90-test conformance suite verifying exact numeric outputs against spec |
| Consistency under inputs from different groups | Bias correction layer; MMIL fairness monitoring |
| Resilience to errors | Pipeline early-abort with full trace; graceful degradation in MMIL disagreement handling |
| Resilience to adversarial inputs | Validation at normalisation stage; job brief automated validation |
| Cybersecurity | Encryption at rest and in transit; RLS; immutable traces with checksum |
| Error correction | Appeal process as human correction mechanism; patch process (FHP-P) for systemic errors |

**Conformity assessment:** ✓ Requirements met. The deterministic pipeline with full conformance testing, combined with the MMIL's multi-model consensus approach, addresses robustness. Security is addressed at the infrastructure layer.

---

### Article 43 — Conformity Assessment Procedure

FHP has undergone the **internal control** procedure (Annex VI) as applicable to high-risk AI systems listed in Annex III (other than those requiring notified body involvement under Article 43(1)).

This internal control consists of:
1. Verification that this technical documentation is complete and addresses all Annex IV requirements ✓
2. Verification that the design and development process ensures compliance with Articles 9–15 ✓
3. Verification that the quality management system (governance model) ensures ongoing compliance ✓

**Outcome of conformity assessment:** FHP is assessed as conforming with the requirements of the EU AI Act applicable to high-risk AI systems.

---

### Article 49 — Registration

Before placing FHP on the EU market, the following registration must be completed in the EU AI database maintained by the European Commission:

- Provider information
- System description and intended purpose
- High-risk category (Annex III §4)
- Reference to this conformity documentation
- Certificate reference (if applicable)

Registration must be completed before go-live in any EU member state. [Status: Pending — action required pre-launch]

---

## 4. Post-Market Monitoring Commitments

Article 72 requires providers to have a post-market monitoring system. FHP's monitoring commitments:

| Monitoring activity | Frequency | Responsible body |
|--------------------|-----------|-----------------|
| Bias metric review (DIR/EOD/SDS) | Nightly (automated) | Platform |
| Fairness report publication | Quarterly | Fairness Oversight Board |
| Conformity documentation review | On material change; annually | TWG + DPO |
| Serious incident reporting to market surveillance authority | As required (without undue delay) | DPO |
| User feedback review | Continuous | TWG |

**Serious incident definition (Article 3(49)):** An incident that results in or could result in death, serious damage to health, serious disruption to critical infrastructure, or infringement of fundamental rights — or that constitutes a serious breach of fundamental rights (which, in FHP's context, would include systematic discrimination in hiring outcomes).

---

## 5. Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0-draft | [TBD] | [TBD] | Initial draft |

**Next review:** On any material change to FHP, or within 12 months of this version date.

**Legal review:** [Pending — qualified EU law counsel must review before market placement]
