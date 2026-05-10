# FHP Company Compliance Framework

**Version:** 1.0.0-draft  
**Status:** Draft — awaiting Protocol Council ratification  
**Spec file:** `specs/company-compliance.md`

---

## 1. Purpose

This document defines the obligations, responsibilities, and compliance requirements for any company using the Fair Hiring Protocol. FHP is not a passive tool. By posting a job brief under FHP, a company makes binding commitments to candidates and to the protocol's governance framework.

Compliance is not optional. It is the price of participation.

---

## 2. Onboarding requirements

Before posting a job brief, a company must:

> **Legal note:** By registering and using FHP, a company accepts binding legal obligations under applicable employment equality law, GDPR/UK GDPR (as a data processor acting on behalf of FHP), and where applicable the EU AI Act. The FHP Company Compliance Agreement constitutes a Data Processing Agreement under GDPR Article 28.



1. **Register with a verified company identity** — legal entity name, jurisdiction, and a designated compliance contact. Anonymous or pseudonymous company accounts are not permitted.

2. **Accept the FHP Company Compliance Agreement** — a binding agreement that incorporates this document by reference. The agreement must be re-accepted on each major protocol version update.

3. **Designate a Compliance Contact** — a named individual within the company who is responsible for FHP compliance. This person receives governance notifications, SLA warnings, and escalation communications.

4. **Declare hiring volume** — an estimate of the number of roles expected to be posted per quarter. This determines the fairness audit cadence the company is subject to.

---

## 3. Job brief obligations

Every job brief posted under FHP must:

### 3.1 Accurately describe the role

- The `title` must describe the actual work, not a marketing label
- The `role_summary` must describe responsibilities — not candidate personality traits, cultural fit preferences, or vague aspirations
- Requirements listed as `must_have` must be genuinely necessary for the role. Inflated requirements ("5 years experience in a 3-year-old technology") are a compliance violation

The platform runs automated validation against a set of known inflated-requirement patterns. Flagged briefs are returned to the company for correction before activation.

### 3.2 Publish a genuine salary range

- Both `salary.minimum` and `salary.maximum` are required
- The range must be honest. A range that spans more than 2× the minimum (e.g. £40k–£120k) is automatically flagged as potentially deceptive and requires manual review before activation
- The range must reflect what the company is actually willing to pay. Posting a range purely to satisfy the field and then making an offer outside it is a compliance violation
- If the role's salary changes after posting (e.g. budget revision), the brief must be updated within 2 business days

### 3.3 Make compliance attestations honestly

The `prohibited_filters` section of the job brief requires the company to attest that it will not apply:
- Degree requirements (unless legally mandated by the role)
- Institutional preferences
- Graduation year filters
- Unpaid work requirements exceeding 2 hours

These attestations are legally and contractually binding. A company found to be applying a filter it attested it would not apply faces immediate account suspension pending governance review.

### 3.4 Define the hiring process

- The `process.stages` array must describe the actual hiring process the candidate will experience
- `process.response_sla_days` must be set. Companies may commit to a shorter SLA than the protocol default but not a longer one
- If the process changes after posting (e.g. an interview stage is added), the brief must be updated and active candidates notified within 1 business day

### 3.5 Set an expiry date

All job briefs must have an `expires_at` date. Expired briefs are automatically deactivated. A company may renew a brief, but must confirm that the brief is still accurate and the role is still open at renewal. Zombie listings — roles that are no longer being actively hired for but remain active — are a compliance violation.

---

## 4. Candidate interaction obligations

### 4.1 SLA compliance

Companies must respond to candidates within the SLA windows defined in `governance-escalation-spec.md` Part A. This is not guidance — it is a binding obligation monitored and enforced automatically by the platform.

### 4.2 Structured rejections

At every stage beyond initial match, companies must provide a structured rejection when not proceeding. A structured rejection must:

- Use a defined reason code from the FHP rejection taxonomy (see Appendix A)
- Include a brief, specific note for candidates who have progressed beyond screening
- Be delivered within the SLA window for that stage

Generic rejections ("we've decided to proceed with other candidates") are automatically flagged as non-compliant if they accompany a stage beyond screening.

### 4.3 Feedback on request

If a candidate requests feedback after any stage, the company must respond within 10 business days with feedback that is:
- Specific to the candidate's performance at that stage
- Constructive and actionable
- Honest — not a sanitised version designed to avoid legal risk

Feedback may not be withheld on the grounds of legal risk. The FHP governance framework provides a defined, fair appeals process precisely so that companies can give honest feedback without fear of weaponised complaints.

### 4.4 No contact without consent

A company may not contact a candidate outside the FHP platform without the candidate's explicit consent. Until a candidate consents to contact, all communication must occur through platform-mediated channels.

A company that receives a candidate's contact details through the platform may only use those details in connection with the specific role for which the candidate applied. Contact details may not be retained after the hiring process concludes, shared with third parties, or used for any other purpose.

---

## 5. Prohibited practices

The following practices are explicitly prohibited under FHP. Any instance of a prohibited practice is treated as a critical compliance violation:

| Practice | Why prohibited |
|----------|---------------|
| Applying undisclosed filters | Circumvents the matching protocol and deceives candidates |
| Using demographic data in selection | Direct discrimination under UK Equality Act 2010 / EU Equal Treatment Directives, regardless of intent |
| Sharing candidate data with third parties without consent | Privacy violation |
| Retaliating against a candidate for filing an appeal | Undermines governance |
| Posting a role with no genuine intent to hire | Wastes candidates' time; distorts fairness metrics |
| Requiring unpaid work > 2 hours | Exploitative; discriminates against candidates who cannot afford to work for free |
| Misrepresenting the role, salary, or process in the brief | Deceptive |
| Applying "culture fit" as a filter without a defined, objective basis | Proxies for bias |
| Using AI tools outside of FHP to pre-filter candidates before they reach the FHP pipeline | Circumvents the protocol |

---

## 6. Fairness audit obligations

### 6.1 Audit cadence

Companies are subject to automated fairness audits based on hiring volume:

| Monthly posting volume | Audit cadence |
|----------------------|---------------|
| 1–5 roles | Quarterly rolling audit |
| 6–20 roles | Monthly rolling audit |
| 21+ roles | Continuous (nightly) rolling audit |

### 6.2 Audit access

Companies may access their own fairness metrics through the company fairness dashboard. This dashboard shows:
- DIR, EOD, and SDS trends for each active and recent job brief
- SLA compliance rates
- Ghosting event history
- Any active flags or governance notifications

### 6.3 Responding to adverse audit findings

If a company's fairness metrics breach protocol thresholds and remain in breach for 3 consecutive computation windows, the company will receive a formal notice from the governance team. The company must:

1. Acknowledge the notice within 5 business days
2. Submit a remediation plan within 20 business days
3. Implement the remediation plan and report back within 60 business days

Failure to engage with adverse audit findings is itself a compliance violation.

### 6.4 Third-party audit rights

The Fairness Oversight Board has the right to conduct an independent audit of any company's hiring outcomes at any time. Companies must cooperate fully with FOB audits and provide access to relevant records within 10 business days of a formal audit request.

---


---

## 7. EU AI Act Obligations (High-Risk AI)

Automated hiring and recruitment systems are classified as **high-risk AI** under Annex III of the EU AI Act (Regulation 2024/1689). Companies using FHP in EU jurisdictions are subject to the following obligations as **deployers** of a high-risk AI system:

### 7.1 Transparency to candidates

Companies must inform candidates that automated matching is used in their hiring process, before or at the point of first contact. FHP's standard candidate-facing explanation satisfies this obligation, but companies must not obscure or contradict this disclosure in their own communications.

### 7.2 Human oversight

Companies must ensure that human review is genuinely available for automated decisions. Enrolling in FHP's borderline review mode for all borderline decisions is strongly recommended. Companies that disable or discourage use of the appeal process are in breach of both FHP compliance requirements and EU AI Act Article 14.

### 7.3 Record-keeping

Companies must maintain logs of significant decisions made using the AI system. FHP's audit log and trace records satisfy this requirement for the matching pipeline. Companies are responsible for maintaining records of any additional screening steps applied outside the FHP pipeline.

### 7.4 Non-discrimination monitoring

Companies must monitor for discriminatory outputs (Article 9). FHP's nightly fairness computation and company fairness dashboard provide the monitoring infrastructure. Companies are required to review their dashboard at least monthly and respond to adverse findings within the timelines defined in §6 of this document.

### 7.5 Registration

Companies deploying high-risk AI systems in the EU are required to register in the EU AI Act database. FHP maintains a central registration for the platform. Companies must notify FHP when registering independently to ensure records are consistent.

---

## 8. Data Protection Obligations (GDPR / UK GDPR)

Companies using FHP process candidate data as **data processors** on behalf of FHP (the data controller). This creates specific obligations:

### 8.1 Data Processing Agreement

The FHP Company Compliance Agreement includes a Data Processing Agreement (DPA) as required by GDPR Article 28. Companies must not process candidate data outside the scope of this DPA.

### 8.2 No secondary use

Candidate data accessed through FHP (skills profiles, match results, explanations) may only be used for the specific hiring process for which it was provided. It may not be used for: training internal AI models, profiling candidates for other purposes, sharing with third parties, or retaining beyond the conclusion of the hiring process.

### 8.3 Breach notification

If a company becomes aware of a personal data breach involving FHP candidate data, they must notify FHP within 24 hours. FHP will manage the GDPR 72-hour notification obligation to the relevant supervisory authority.

### 8.4 Right to erasure

If a candidate submits a deletion request, companies must delete any locally retained copies of that candidate's data (emails, notes, assessments) within 30 days. FHP handles deletion within the platform; companies are responsible for data held outside the platform.

---

## 9. Compliance scoring

Every company has a continuously updated compliance score, visible on their dashboard and to the governance team. The score is computed from:

| Component | Weight |
|-----------|--------|
| SLA compliance rate (last 90 days) | 35% |
| Ghosting events (severity-weighted, last 90 days) | 25% |
| Fairness metric adherence (last 30 days rolling) | 25% |
| Structured rejection compliance rate | 15% |

A compliance score below 0.70 triggers a formal governance review. A compliance score below 0.50 triggers automatic job brief pausing pending review.

Compliance scores are not public — they are visible to the company and to governance bodies only. However, the outcome of any governance action taken as a result of a compliance score is part of the public audit log.

---

## 10. Enforcement ladder

| Violation | First instance | Repeat instance |
|-----------|---------------|-----------------|
| Minor SLA breach | Automated reminder | Strike recorded |
| Significant SLA breach | Warning + strike | Escalated to governance |
| Severe ghosting | Strike + governance notification | Job paused |
| Prohibited filter applied | Account paused + governance review | Account suspended |
| Falsified attestation | Account suspended + public audit record | Permanent ban |
| Candidate data misuse | Account suspended + regulatory referral | Permanent ban |
| Retaliation against appeal | Account suspended + public audit record | Permanent ban |

"Permanent ban" means the legal entity and its beneficial owners are barred from registering new accounts. The governance framework maintains a ban registry.

---

## 11. Right of appeal for companies

Companies may appeal governance decisions through the standard escalation process. A company submitting an appeal must:

- Specify the decision being appealed
- Provide evidence supporting their position
- Accept that the appeal outcome is final (there is no further internal appeal — only legal recourse in the relevant jurisdiction)

Appeals do not stay enforcement actions. A paused account remains paused during the appeal process unless the Protocol Council specifically orders otherwise.

---

## Appendix A: Rejection reason taxonomy

The following reason codes must be used in structured rejections. The company must select the most specific applicable code:

**Skill-related:**
- `SR-01` — Required skill not demonstrated at required proficiency
- `SR-02` — Required skill absent from profile
- `SR-03` — Technical assessment did not meet required standard (assessment-specific feedback required)

**Process-related:**
- `PR-01` — Candidate withdrew
- `PR-02` — Role filled before this stage completed
- `PR-03` — Role cancelled

**Preference/logistics:**
- `PL-01` — Salary expectations not aligned (requires honest disclosure of the mismatch direction)
- `PL-02` — Work mode not compatible
- `PL-03` — Location/right to work not compatible
- `PL-04` — Notice period not compatible with role start date

**Assessment-related (post-screening only):**
- `AS-01` — Interview performance did not meet required standard (specific feedback required)
- `AS-02` — Portfolio/work sample did not meet required standard (specific feedback required)
- `AS-03` — Reference check disclosed information material to the decision (candidate must be told what was disclosed)

**Prohibited reason codes** — the following may never be used, as they are either meaningless or proxies for discrimination:
- "Not a cultural fit" (without an objective, documented basis)
- "Overqualified"
- "Not the right time"
- Any reason that references the candidate's personal characteristics rather than their capability or the role's requirements
