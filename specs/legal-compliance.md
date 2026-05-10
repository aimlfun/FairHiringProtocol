# FHP Legal and Regulatory Compliance Reference

**Version:** 1.0.0-draft  
**Status:** Draft — requires review by qualified legal counsel before adoption  
**Spec file:** `specs/legal-compliance.md`

> **Important disclaimer:** This document captures the legal framework relevant to FHP as understood at the time of writing. It is not legal advice. Before deploying FHP in any jurisdiction, qualified legal counsel admitted in that jurisdiction must review compliance obligations. Laws change; this document must be reviewed at each major protocol version and at least annually.

---

## Purpose

This document is the canonical reference for the legal and regulatory obligations that FHP, its operators, and companies using FHP must meet. It covers:

1. Data protection law (GDPR, UK GDPR, US state laws)
2. AI regulation (EU AI Act)
3. Employment equality law (UK, EU, US)
4. Financial sector considerations
5. Children and minors
6. International data transfers
7. The architecture decisions made in response to these obligations

It is intended to be read alongside `candidate-rights-charter.md`, `company-compliance.md`, `privacy-policy.md`, `dpia.md`, and `eu-ai-act-conformity.md`.

---

## 1. The Privacy-by-Design Architecture

Before listing specific obligations, it is important to understand the fundamental architectural decision that shapes FHP's legal position across almost every framework.

### 1.1 The no-PII matching engine

The FHP matching engine operates on:
- A UUID (randomly generated, not derived from any personal attribute)
- Skills and proficiency levels (from the FHP Skill Ontology)
- Preferences (salary range, location preference, work mode preference)

It does **not** receive, process, or store:
- Name
- Email address
- Phone number
- Date of birth
- Address
- National insurance / social security number
- Any government-issued identifier
- Employment history in any form that identifies employers
- Educational institution names

The candidate's email address is used exclusively for authentication and notification delivery. It is stored in a separate identity table, access-controlled at the database level, and never passed to the matching engine. The matching engine has no database permission to read it.

This architecture is a deliberate implementation of **GDPR Article 25 (Privacy by Design and by Default)** and means that the matching engine's processing falls outside the scope of most personal data regulation, because it does not process personal data.

### 1.2 What this means legally

The consequence is significant: most personal data law complexity applies only to the narrow identity layer (email + authentication), not to the matching layer. The matching layer is legally closer to a calculation service than a personal data processing operation.

This does not eliminate all legal obligations — the system as a whole processes personal data, and the EU AI Act applies regardless of whether PII is involved — but it substantially reduces the compliance burden and risk surface.

### 1.3 The optional name field

FHP does not store a candidate's name at all. Communication is handled via the platform's messaging system (candidates receive messages in their inbox without the company knowing who they are until consent is given). This is not a limitation — it is a feature. A candidate's legal name is irrelevant to whether they can do a job, and names are one of the primary vectors through which racial and gender bias enters hiring decisions.

---

## 2. GDPR and UK GDPR

### 2.1 Applicable framework

**EU GDPR (Regulation 2016/679)** applies to processing of personal data of individuals in the EU, regardless of where the processing organisation is located.

**UK GDPR** (the retained EU law version, as amended by the Data Protection Act 2018) applies to processing of personal data of individuals in the UK.

For practical purposes, UK GDPR and EU GDPR are substantively identical. FHP designs for the stricter of the two in all cases.

### 2.2 Lawful basis

FHP's lawful basis for processing candidate personal data is **Article 6(1)(b) — contract**: processing is necessary for the performance of a contract to which the data subject is party (i.e., the candidate has registered for a matching service and processing their profile is necessary to provide that service).

**Why not consent?** Consent (Article 6(1)(a)) is the weakest lawful basis. It can be withdrawn at any time, which would require FHP to cease all processing of that candidate's data including historical records — creating serious tension with the audit trail requirements. Contract is the appropriate basis for a service the candidate has actively enrolled in.

**For special category data:** FHP does not collect special category data (Article 9 data — health, race, religion, biometric data, etc.) and should not do so. If demographic data is collected voluntarily for fairness monitoring purposes, this requires explicit consent under Article 9(2)(a), with clear explanation that it is optional and used only for aggregate fairness computation.

### 2.3 Data subject rights — implementation requirements

| Right | GDPR Article | FHP Implementation |
|-------|-------------|-------------------|
| Right of access | Art. 15 | Data export UI — full JSON download of all held data |
| Right to rectification | Art. 16 | Profile edit UI — all fields updatable by candidate |
| Right to erasure | Art. 17 | Delete account UI → pseudonymisation procedure (see §2.4) |
| Right to restriction | Art. 18 | Account pause function — processing suspended, data retained |
| Right to portability | Art. 20 | JSON export in FHP standard schema |
| Right to object | Art. 21 | Opt-out of searchability; opt-out of fairness metric contribution |
| Right re: automated decisions | Art. 22 | Appeal process (see §2.5) |

All rights must be fulfillable within **one calendar month** of the request, extendable by two further months for complex requests with notification to the candidate.

### 2.4 Pseudonymisation-on-deletion procedure

The right to erasure (Article 17) cannot be absolute where retention serves a legitimate purpose (Article 17(3)(b) — compliance with a legal obligation; Article 17(3)(e) — establishment, exercise or defence of legal claims).

FHP's audit trail — pipeline traces, match records, fairness metrics — is necessary for:
- Defending against discrimination claims
- Regulatory compliance (EU AI Act record-keeping)
- Governance of the protocol itself

The procedure on account deletion is therefore **pseudonymisation**, not full deletion:

1. Generate a new random UUID — `replacement_id`
2. In all tables: `UPDATE ... SET candidate_id = replacement_id WHERE candidate_id = original_id`
3. `DELETE FROM candidate_identity WHERE candidate_id = original_id`
4. `DELETE FROM candidate_profiles WHERE candidate_id = original_id`
5. Delete the authentication credential
6. Record the deletion event (timestamp, original UUID hash for audit purposes — the hash cannot reverse to the original UUID)
7. Confirm deletion to the candidate within 30 days

After this procedure: no personal data relating to the candidate remains. The historical match and trace records are retained but are fully anonymous — they contain only a random UUID and skills data, which is not personal data.

### 2.5 Automated decision-making (Article 22)

Article 22 restricts decisions "based solely on automated processing, including profiling, which produces legal or similarly significant effects."

Hiring decisions are explicitly within scope. The FHP matching pipeline is automated decision-making under Article 22.

**Article 22 permits automated decision-making where:**
- It is necessary for entering into a contract (applicable here — the matching service is the contract), **and**
- Suitable measures are in place to safeguard the data subject's rights and freedoms.

**FHP's safeguards (Article 22(3)):**
- The right to obtain human intervention (the appeal process)
- The right to express a point of view (the candidate can add evidence and context to their profile)
- The right to contest the decision (the formal appeal mechanism)
- Plain-language explanation of every outcome (the explanation schema)

These safeguards must be clearly communicated to candidates. The candidate rights charter and the privacy policy together satisfy this requirement.

### 2.6 Data Protection Impact Assessment

A DPIA (Article 35) is mandatory before deploying FHP because:
- The processing involves systematic and extensive automated decision-making with significant effects (Article 35(3)(a))
- The processing involves large-scale processing of sensitive data at scale (Article 35(3)(b))

The DPIA is a separate document (`dpia.md`). It must be completed and reviewed by the DPO before go-live. It must be reviewed whenever there is a significant change to the processing (e.g., adding new pipeline stages, changing the bias correction model).

### 2.7 Data Protection Officer

Article 37 requires a DPO where core activities consist of large-scale systematic monitoring or large-scale processing of special categories of data.

FHP's large-scale systematic processing of employment-related personal data likely triggers this requirement, though the precise threshold is contested in legal commentary. FHP should designate a DPO. For a foundation/charity, this may be a part-time or externally contracted role but must be a named individual with genuine independence.

The DPO's contact details must be published in the privacy policy and registered with the relevant supervisory authority (ICO in the UK, relevant lead supervisory authority in the EU under one-stop-shop rules).

### 2.8 Data retention

FHP must define and publish data retention periods. Recommended periods:

| Data type | Retention period | Rationale |
|-----------|-----------------|-----------|
| Candidate profile (active) | Duration of account + 30 days after deletion request | Contract performance |
| Match records (anonymised) | 7 years | Defence of legal claims (limitation period) |
| Pipeline traces (anonymised) | 7 years | Regulatory record-keeping |
| Fairness metrics | Indefinite (aggregate, fully anonymised) | Protocol governance |
| Ghosting events | 7 years | Enforcement record |
| Appeal records | 7 years | Legal proceedings |
| Authentication credentials | Duration of account only — deleted on account closure | Minimum necessary |

### 2.9 Children and minors

FHP must not process data of persons under 18. Requirements:

- Age confirmation at registration (checkbox: "I confirm I am 18 or over")
- Terms of Service must state minimum age of 18
- If a minor is discovered to have registered: immediate account suspension, deletion of all data within 72 hours, no notification to third parties
- No age verification beyond self-declaration is required for standard registration, but this policy should be reviewed if FHP expands to jurisdictions with stricter requirements

---

## 3. EU AI Act (Regulation 2024/1689)

### 3.1 Classification

Automated hiring and recruitment systems are explicitly listed in **Annex III, §4** as high-risk AI systems: *"AI systems intended to be used for recruitment or selection of natural persons, notably for advertising vacancies, screening or filtering applications, evaluating candidates in the course of interviews or tests."*

FHP is a high-risk AI system under the EU AI Act. This classification is not discretionary.

### 3.2 Obligations for providers (FHP as platform)

As the provider of the AI system:

**Article 9 — Risk management system**
A continuous risk management process must be in place throughout the lifecycle. FHP's bias detection and correction framework, fairness monitoring, and governance escalation pipeline constitute this system. They must be documented as such.

**Article 10 — Data and data governance**
Training, validation, and testing data (for the MMIL models) must be subject to governance practices that address bias, gaps, and limitations. The multi-model inference spec's model registry, certification process, and fairness monitoring of MMIL outputs are FHP's implementation of Article 10.

**Article 11 — Technical documentation**
Comprehensive technical documentation must be prepared before the system is placed on the market. FHP's spec corpus is this documentation. A conformity mapping document (`eu-ai-act-conformity.md`) cross-references each Article 11 requirement to the relevant FHP spec.

**Article 12 — Record-keeping**
The system must automatically log events throughout operation. The trace schema and audit log are FHP's implementation of Article 12. Logs must be kept for the applicable period (at minimum the lifetime of the system, and at least 10 years for high-risk systems in some interpretations).

**Article 13 — Transparency and provision of information**
Candidates must be informed that they are subject to a high-risk AI system. The privacy policy, the candidate portal onboarding flow, and every match explanation satisfy Article 13.

**Article 14 — Human oversight**
The system must be designed to allow effective human oversight. The appeal process, the governance dashboard, and the ability of the Protocol Council and FOB to intervene in systemic issues are FHP's Article 14 implementation.

**Article 15 — Accuracy, robustness and cybersecurity**
The system must achieve appropriate levels of accuracy and be resilient against errors and adversarial inputs. The conformance test suite (90 tests), the multi-model inference layer's disagreement handling, and the trace checksum tamper detection are FHP's implementation.

**Article 43 — Conformity assessment**
Before market placement, a conformity assessment must be conducted. For AI systems in the employment category, this is typically a self-assessment (internal conformity check) unless the system is also biometric. The `eu-ai-act-conformity.md` document structures this assessment.

**Article 49 — Registration**
High-risk AI systems must be registered in the EU AI database before they are placed on the market. FHP must complete this registration before EU deployment.

### 3.3 Obligations for deployers (companies using FHP)

Companies using FHP are **deployers** under the AI Act. Their obligations are covered in `company-compliance.md §7`.

---

## 4. Employment Equality Law

### 4.1 UK — Equality Act 2010

The Equality Act 2010 prohibits discrimination in employment on the basis of nine protected characteristics:

| Characteristic | FHP protection mechanism |
|---------------|-------------------------|
| Age | Prohibited filters: graduation year, years since graduation |
| Disability | Bias correction monitoring; no cognitive test discrimination |
| Gender reassignment | Demographic data never processed in matching |
| Marriage and civil partnership | Not a relevant hiring criterion; no field for it |
| Pregnancy and maternity | Employment gap filter prohibited |
| Race | Bias detection (DIR, EOD, SDS); no institution prestige filter |
| Religion or belief | Demographic data never processed in matching |
| Sex | Bias detection (DIR, EOD, SDS) |
| Sexual orientation | Demographic data never processed in matching |

**Indirect discrimination** (where a neutral criterion disproportionately disadvantages a protected group) is particularly relevant to automated hiring. FHP's bias correction layer directly addresses this — it is designed to detect and correct for disparate impact and unequal opportunity, which are the quantitative expressions of indirect discrimination.

**Employment gaps as a proxy for disability or maternity:** The prohibition on employment gap filtering is a direct legal protection, not merely an FHP principle. Filtering on gaps is well-established as indirect discrimination against disabled people and women returning from maternity leave.

**Employer liability:** Companies using FHP remain legally responsible for hiring decisions. Using FHP does not transfer liability. However, FHP's audit trail and explanation schema provide companies with evidence of a systematic, non-discriminatory process — which is valuable in the event of an employment tribunal claim.

### 4.2 EU — Equal Treatment Directives

The EU framework is substantively equivalent:
- Directive 2006/54/EC — equal treatment between men and women in employment
- Directive 2000/43/EC — racial equality
- Directive 2000/78/EC — equal treatment in employment (religion, disability, age, sexual orientation)
- Directive 2019/1158 — work-life balance (maternity/parental leave protections)

### 4.3 US Federal law

| Law | Applicability |
|-----|--------------|
| Title VII of the Civil Rights Act 1964 | Prohibits discrimination by race, colour, religion, sex, national origin |
| Age Discrimination in Employment Act 1967 | Prohibits discrimination against persons 40+ |
| Americans with Disabilities Act 1990 | Prohibits discrimination on basis of disability |
| Pregnancy Discrimination Act 1978 | Protects against pregnancy-related discrimination |

**EEOC Guidance on AI (2023):** The Equal Employment Opportunity Commission has issued guidance that automated hiring tools must not have a disparate impact on protected classes, and employers cannot rely on a vendor's assurances — they must conduct their own bias audits. FHP's company-facing fairness dashboard and audit reports provide the evidence companies need for this independent verification requirement.

### 4.4 US State law — AI-specific hiring legislation

| Jurisdiction | Law | Key requirements |
|-------------|-----|-----------------|
| New York City | Local Law 144 (2023) | Annual independent bias audit; public publication of results; candidate notification |
| Illinois | AI Video Interview Act (2019) | Consent and disclosure for AI video analysis (not directly applicable to FHP) |
| Maryland | HB 1202 (2020) | Similar to Illinois for facial recognition |
| California | CPRA (2023) | Additional privacy rights for CA residents; opt-out of automated decision-making |

**NYC Local Law 144 compliance:** FHP's nightly fairness computation produces bias audit results that satisfy the substance of LL144's audit requirement. The company fairness dashboard provides the publication mechanism. Candidate notification is built into the onboarding flow.

---

## 5. Financial Sector Considerations

Where FHP is used by regulated financial firms (banks, insurers, investment managers, payment institutions), additional obligations arise:

**UK — FCA Senior Managers and Certification Regime (SMCR):**
Regulated firms must demonstrate robust hiring processes for persons subject to SMCR. FHP's audit trail and explanation schema provide documentary evidence of a systematic process, which is valuable for FCA supervision purposes.

**EU — EBA/ESMA guidelines on fitness and propriety assessments:**
Similar requirements for key function holders at EU regulated entities. FHP cannot replace the substance of a fitness and propriety assessment, but the matching layer can form part of a broader evidenced process.

**General principle:** FHP is a matching protocol, not a compliance tool for regulated roles. Companies in regulated sectors should take legal advice on how FHP integrates with their specific regulatory obligations.

---

## 6. International Data Transfers

### 6.1 EU to non-EU transfers (GDPR Chapter V)

Personal data cannot be transferred from the EU to a third country unless:
- The European Commission has issued an adequacy decision for that country, **or**
- Appropriate safeguards are in place (Standard Contractual Clauses — SCCs), **or**
- A derogation applies

**UK adequacy:** As of 2025, the EU has granted the UK adequacy status for GDPR purposes, meaning EU→UK transfers are permitted without SCCs.

**EU/UK to US transfers:** No general adequacy decision. SCCs (the 2021 EU SCCs) are required. The EU-US Data Privacy Framework (2023) provides an alternative for certified US organisations.

**Practical implication for FHP:** If the FHP platform is hosted in the EU/UK and has users or governance members in the US, SCCs must be in place. If hosted in the US, inbound transfers from EU candidates require SCCs. This is a legal document exercise but must be completed before cross-border operation.

### 6.2 UK to non-UK transfers (UK GDPR)

The UK has its own adequacy framework (IDTA — International Data Transfer Agreement — replaces EU SCCs for UK transfers). The UK has issued adequacy regulations for the EU, EEA, and several other countries.

### 6.3 Architectural implication

The cleanest solution for a foundation/charity model: host the platform in the EU (or UK), which has the most comprehensive adequacy network and means most candidate data never leaves a jurisdiction with strong protections. Use SCCs for any US-based service providers (cloud infrastructure, email services).

---

## 7. Cookie and Consent Management

FHP will use, at minimum:
- A session cookie (strictly necessary — no consent required)
- Potentially analytics cookies (requires consent under the UK PECR and EU ePrivacy Directive)

If FHP uses no third-party analytics or tracking, the cookie compliance requirement is minimal. The recommended position: no third-party analytics. Use privacy-respecting self-hosted analytics (e.g., Plausible, Umami) or no analytics beyond server logs.

A cookie notice is still required even for strictly necessary cookies, to inform users what is used.

---

## 8. Summary: Compliance Checklist Before Go-Live

| Item | Document | Status |
|------|----------|--------|
| DPIA completed and reviewed by DPO | `dpia.md` | Required |
| Privacy Policy published | `privacy-policy.md` | Required |
| Terms of Service published | (to be drafted) | Required |
| Company Data Processing Agreement | `data-processing-agreement.md` | Required |
| EU AI Act conformity assessment | `eu-ai-act-conformity.md` | Required for EU deployment |
| EU AI Act registration | EU AI database | Required before EU deployment |
| DPO designated and registered with supervisory authority | — | Required |
| Age verification at registration | Technical implementation | Required |
| Pseudonymisation-on-deletion procedure | Technical implementation | Required |
| International transfer mechanisms (SCCs if needed) | Legal documents | Required if cross-border |
| Cookie notice | Technical implementation | Required |
| Candidate notification of automated decision-making | Onboarding flow | Required |

---

## 9. Jurisdictions Not Yet Covered

The following jurisdictions have emerging AI/hiring regulation that should be monitored but is not yet finalised or fully in force at the time of writing:

- **Canada** — Artificial Intelligence and Data Act (AIDA) — draft, not yet in force
- **Brazil** — LGPD (Lei Geral de Proteção de Dados) — in force, GDPR-equivalent
- **Australia** — Privacy Act reforms — ongoing review
- **Singapore** — Model AI Governance Framework — voluntary, not legally binding
- **India** — Digital Personal Data Protection Act 2023 — in force, implementing rules pending

FHP should monitor these as it expands beyond UK/EU.
