# README.md (Draft v1.0)

## Fair Hiring Protocol (FHP)

*“The Fair Hiring Protocol defines a single canonical matching logic. Implementations must conform exactly to this logic to 
be considered compliant. Extensions are permitted, but modifications to the fairness core are not.”*

## A public, open, transparent standard for fair, bias aware hiring.

### What is the Fair Hiring Protocol?

The **Fair Hiring Protocol (FHP)** is an open, community governed standard designed to fix what’s broken in hiring.

Today’s recruitment systems are:
-	opaque
-	biased
-	inconsistent
-	exclusionary
-	built around company convenience, not candidate fairness

FHP is a **public good**, not a product. It defines a **transparent, auditable, bias aware matching protocol** that anyone can implement.

This project is:
-	**open-source**
-	**model agnostic**
-	**non commercial**
-	**community driven**
-	**designed for fairness from first principles**

If hiring were invented today, this is how it would work.

## Mission

To create a **single, canonical, open standard** for fair hiring — one that:
-	treats candidates with dignity
-	gives companies clarity
-	eliminates arbitrary filtering
-	detects and corrects bias
-	explains every decision
-	is governed by the community, not corporations

This is not a job board. This is not an ATS. This is the **protocol layer** that hiring has always needed.

## What the Protocol Defines

FHP defines:

#### 1. Canonical Schemas
-	Candidate Profile
-	Job Brief
-	Match Explanation
-	Skill Ontology

#### 2. Matching Pipeline, a deterministic, auditable process:
-	Normalization
-   Semantic Expansion
- 	Constraint Satisfaction
- 	Skill Scoring
-	Transferable Skill Compensation
-	Preference Alignment
-	Bias Detection & Correction
-	Explanation Generation

#### 3. Fairness Rules
-	no arbitrary filters
-	no demographic filtering
-	no “years since graduation”
-	no prestige bias
-	no black box decisions

#### 4. Governance
-	Protocol Council
-	Technical Working Group
-	Fairness Oversight Board
-	Public proposals (FHP P)
-	Transparent voting
-	Anti capture safeguards

#### 5. Candidate Rights
-	transparency
-	control
-	privacy
-	appeal
-	no ghosting

#### 6. Company Compliance
-	real responsibilities
-	salary ranges required
-	structured rejections
-	fairness audits

## Why This Matters

Hiring today is broken because:
-	recruiters are overloaded
-	companies use arbitrary filters
-	candidates are judged on job titles, not skills
-	bias creeps in at every stage
-	decisions are opaque and unaccountable

FHP flips the system:
-	**Skills, not pedigree**
-	**Evidence, not keywords**
-	**Transparency, not guesswork**
-	**Bias aware, not bias blind**
-	**Candidate first, not company first**

This is how we upend the recruitment industry — fairly.

## Repository Structure *(target — partially exists today)*
```
fair-hiring-protocol/
├─ README.md
├─ CONTRIBUTING.md
├─ GOVERNANCE.md
├─ CODE_OF_CONDUCT.md
│
├─ api/ is the FHP REST APIs 
│  ├─ config/
│  ├─ db/          Postgres helper
│  ├─ errors/      Standard error helpers
│  ├─ middleware/
│  └─ routes/      REST APIs
│
├─ architecture/
│  ├─ api.md
│  ├─ dashboard.md
│  ├─ mcp.md
│  └─ README.md
|
├─ audits/
│  └─ sample-reports/  placeholder
│
├─ db/  database scripts (Postgres)
│  ├─ migrations/
│  ├─ partitions/
│  ├─ roles/
│  ├─ seeds/
│  └─ README.md
│
├─ diagrams/  
│  └─ stop-ghosting-candidates.png
│
├─ design-notes/
│  ├─ explanation-engine/
│  ├─ ghosting/
│  ├─ matching-engine/
│  ├─ multi-modal-match/
│  ├─ altruism.md
│  ├─ candidate-experience.md
│  ├─ candidate-vs-company.md
│  ├─ company-experience.md
│  ├─ data.md
│  ├─ disagreement-rules.md
│  ├─ example-rules.md
│  ├─ fairness.md
│  ├─ for-candidates.md
│  ├─ for-companies.md
│  ├─ for-implementers.md
│  ├─ governance-enforcement-pipeline.md
│  ├─ no-forking.md
│  ├─ trace-rules.md
│  └─ what-recruiters-do.md
│
├─ draw.io/ source of diagrams (created in draw.io)
│
├─ legal/ covers the legal obligations (**must be reviewed by legal**)
│  ├─ data-processing-agreement.md
│  ├─ dpia.md
│  ├─ eu-ai-act-conformity.md
│  ├─ privacy-policy.md
│  ├─ pseudonymisation-procedure.md
│  └─ terms-of-service.md
│
├─ ontology/ is versioned and governed like a standard.
│  ├─ skills.json
│  └─ mapping-rules.md
│
├─ proposals/ is where FHP P documents live (PRs against this folder)
│  ├─ FHP-P-2025-001-funding-model.md
│  └─ template.md
│
├─ protocols/ one of **the** most important folders: this defines FHP policy
│  ├─ FHP-A-2025-001.md - API surface
│  ├─ FHP-C-2025-001.md - Canonical Specification
│  ├─ FHP-FS-2025-001.md - The Fairness Score
│  ├─ FHP-G-2025-001.md - Governance Model
│  ├─ FHP-MFS-2025-001.md - Standards
│  ├─ FHP-SRR-2025-001.md - Structure Rejection Reasons & Appeals
│  └─ README.md
│
├─ reference-impl/ is optional but powerful: a minimal, clean implementation others can follow
│  ├─ appeals/
│  ├─ bias/
│  ├─ fairness/
│  ├─ matching-engine/
│  ├─ ontology/
│  ├─ shared/
│  ├─ sla/
│  └─ tests/
│
├─ specs/ is the canonical source of truth
│  ├─ bias-correction-spec.md
│  ├─ candidate-profile.schema.json
│  ├─ candidate-rights-charter.md
│  ├─ company-compliance.md
│  ├─ database-architecture.md
│  ├─ fairness-metrics.schema.json
│  ├─ fhp-overview.md
│  ├─ ghosting-event.schema.json
│  ├─ governance-charter.md
│  ├─ governance-escalation-spec.md
│  ├─ identity-model.schema.json
│  ├─ job-brief.schema.json
│  ├─ legal-compliance.md
│  ├─ match-explanation.schema.json
│  ├─ matching-engine-spec.md
│  ├─ multi-model-inference-spec.md
│  ├─ scoring-spec.md
│  └─ trace.schema.json
│
├─ api-gap-analysis.md -  WIP gaps in the API prior to build.
├─ candidate-app.html - **mockup** candidate experience
├─ company-dashboard.html - **mockup** company experience
├─ CONTRIBUTING.md
├─ governance-dashboard.html - **mockup** governance dashboard
├─ landing-page.html - **mockup** entry point for candidates and companies
├─ LICENSE-reference-impl.txt
├─ LICENSE-specs.txt
├─ README.md (**this**)
└─ todo.md
```

## How Matching Works (High Level)

FHP uses a transparent, deterministic pipeline:
1.	**Normalize** candidate + job data
2.	**Expand** skills semantically
3.	**Check constraints** (location, salary, work mode)
4.	**Score** must have + nice to have skills
5.	**Compensate** with transferable skills
6.	**Align** preferences
7.	**Detect bias** using statistical fairness metrics
8.	**Correct bias** proportionally
9.	**Generate explanation** for both sides

Every match is explainable. Every rejection is explainable. Every decision is logged.

## Bias Handling

FHP does not enforce equal outcomes. It enforces **equal treatment**.

We use:

-	Disparate Impact Ratio
-	Equal Opportunity Difference
-	Score Distribution Skew

Bias correction only triggers when:
-	a group is treated inconsistently internally
-	or equally qualified candidates are treated differently
-	or a group is massively under represented relative to its own share

This avoids quotas and reverse discrimination.

## Governance

FHP is governed by three bodies:

### 1. Protocol Council (PC)

Stewards the protocol.

### 2. Technical Working Group (TWG)

Maintains schemas, ontology, reference implementation.

### 3. Fairness Oversight Board (FOB)

Independent watchdog with veto power.

All decisions are:
-	public
-	logged
-	versioned
-	auditable

**No single company or individual can control the protocol.**

### Contributing

We welcome contributions from:
-	engineers
-	fairness researchers
-	employment law experts
-	candidates
-	employers
-	open source contributors

To propose a change, submit an **FHP-P** document in `/proposals`.

See `CONTRIBUTING.md` for details.

### License

FHP uses a **dual licence model**:

- **Specification and schemas** are licensed under **CC BY 4.0** — free to implement, attribution required.
- **Reference implementation** is licensed under **Apache 2.0** — free to use commercially, with attribution and patent protection.

No party may create a proprietary fork of the fairness core.


### Vision

A world where:
-	candidates are treated with dignity
-	companies hire based on capability
-	bias is detected and corrected
-	hiring is transparent, fair, and humane

A world where hiring finally **works**.

### Funding

FHP is a public good. The aspiration is that it should be free for candidates and free for companies to participate in.

Sustaining the infrastructure - compute, storage, the matching pipeline - requires a funding model that does not compromise the protocol's independence. The right model is an open question that the community needs to resolve together.

Approaches under consideration include: foundation or charitable trust models, grant funding from public boides, voluntary contributions from compliant employers, and infrastructure sponsorship with strict governance firewalls. Corporate capture safeguards in the governance model apply equally to any funding arrangement.

**This is a tracked item.** See the to-do list for the formal investigation task.

### Join Us

If you believe hiring can be fair — not just better, but *fair* — you’re in the right place.

Open an issue. 
Submit a proposal. 
Join the discussion. 

*Help build the standard that hiring has always needed.*