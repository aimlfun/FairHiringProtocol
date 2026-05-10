# Fair Hiring Protocol — Data Protection Impact Assessment (DPIA)

**Version:** 1.0.0-draft  
**Status:** Draft — must be reviewed and signed off by DPO before go-live  
**Prepared by:** [TBD]  
**DPO review:** [Pending]  
**Date:** [TBD]  
**Document:** `legal/dpia.md`

> A DPIA is required under GDPR Article 35 before deploying any system that involves systematic automated decision-making with significant effects on individuals. This document must be completed, reviewed by the DPO, and updated whenever there is a material change to FHP's processing.

---

## 1. Overview of the Processing

### 1.1 Name and description

**System:** Fair Hiring Protocol (FHP) — automated candidate-job matching platform

**Description:** FHP is an open-source, community-governed platform that automatically matches candidate skills profiles to job briefs using a deterministic nine-stage pipeline. It produces match decisions (matched, borderline, not matched) with plain-language explanations for every outcome. It monitors for bias and applies corrections. All decisions are logged in an immutable audit trail.

### 1.2 Data controller and processor

**Data Controller:** [FHP Foundation — TBD]  
**Data Processor:** FHP (self — the foundation operates the platform)  
**DPO:** [TBD]

### 1.3 Purposes of processing

1. **Job matching:** Computing a compatibility score between a candidate's declared skills and a job brief's requirements
2. **Explanation generation:** Producing plain-language explanations of each match outcome
3. **Bias detection and correction:** Monitoring for disparate outcomes across demographic cohorts and applying corrections
4. **Audit trail:** Maintaining immutable records of all pipeline decisions for governance, appeals, and regulatory purposes
5. **SLA enforcement:** Monitoring company response timelines and enforcing ghosting protections
6. **Governance:** Enabling the Protocol Council, FOB, and TWG to investigate escalations and conduct fairness audits

### 1.4 Legal basis

**Primary basis:** Article 6(1)(b) — contract. Processing is necessary to provide the matching service the candidate has enrolled in.

**Secondary basis (audit trail / fairness metrics):** Article 6(1)(f) — legitimate interests. Retention of anonymised audit records for governance and legal defence purposes.

**Demographic data (if voluntarily provided):** Article 9(2)(a) — explicit consent.

---

## 2. Why a DPIA is Required

A DPIA is mandatory under Article 35(3) when processing involves:

| Trigger | Applicable? | Reason |
|---------|-------------|--------|
| Systematic and extensive automated decision-making with significant effects (Art. 35(3)(a)) | **Yes** | The matching pipeline makes automated decisions about whether a candidate is offered a job opportunity — this has significant effects on their employment prospects |
| Large-scale processing of special category data (Art. 35(3)(b)) | Potentially | FHP does not intentionally collect special category data, but demographic data for fairness monitoring may include categories protected under Art. 9 if provided voluntarily |
| Systematic monitoring of a publicly accessible area (Art. 35(3)(c)) | No | Not applicable |

Additionally, the ICO's list of processing likely to result in high risk includes "profiling and automated decision-making that has a significant impact on individuals" and "use of new technological or organisational solutions" — both clearly applicable.

---

## 3. Description of the Processing

### 3.1 Data flows

```
Candidate registers → provides email + skills profile
         ↓
Skills profile stored in candidate_profiles table (no PII)
Email stored in candidate_identity table (separate schema, no matching engine access)
         ↓
Company posts job brief → stored in job_briefs table
         ↓
Matching engine runs (no PII access):
  candidate_id + skills ←→ job_id + requirements
  → match_score, decision, breakdown
         ↓
Explanation generated → stored in match_explanations (three audience versions)
Pipeline trace generated → stored in pipeline_traces (immutable)
         ↓
Candidate notified of outcome via email (identity service — separate from matching)
         ↓
Nightly: fairness job computes DIR/EOD/SDS per cohort
         ↓
Continuous: SLA monitor checks active interactions
         ↓
On request: candidate can appeal → TWG/PC human review
```

### 3.2 Data retention

See `legal/privacy-policy.md §How long we keep your data` for full retention schedule.

### 3.3 Data sharing

See `legal/privacy-policy.md §Who we share your data with` and `legal/data-processing-agreement.md`.

---

## 4. Necessity and Proportionality Assessment

### 4.1 Is the processing necessary for the purpose?

Yes. The purpose is automated job matching. Automated processing is inherent to the service — it is what candidates have signed up for.

The alternative (manual matching) is not viable at scale and is not what the service offers. The processing is necessary.

### 4.2 Is the processing proportionate?

The privacy-by-design architecture is specifically designed to minimise data processing to what is necessary:

- No name, phone, age, address, or any identifying attribute is collected
- The matching engine operates on a UUID and skills data — not personal data in any conventional sense
- Email is collected only for authentication and notification — one field, one purpose
- Demographic data is optional and separately consented

The processing is proportionate. The data collected is the minimum necessary for the service.

### 4.3 Are there less privacy-invasive means?

No equivalent alternative exists. The matching function requires comparing candidate skills against job requirements. The minimum data to do this is the skills profile. FHP already uses the minimum.

---

## 5. Risk Identification and Assessment

### 5.1 Risk register

| Risk | Likelihood | Severity | Inherent Risk | Mitigations | Residual Risk |
|------|-----------|---------|--------------|-------------|--------------|
| Automated matching produces discriminatory outcomes for protected groups | Medium | High | **High** | Bias detection (DIR/EOD/SDS), bias correction layer, FOB oversight, appeal process | Low–Medium |
| Data breach exposing candidate personal data | Low | High | **Medium** | PII separation, encryption at rest and in transit, RLS, audit logging | Low |
| Matching engine receiving PII (architectural breach) | Very Low | High | **Medium** | Schema separation, database RLS, code-level enforcement | Very Low |
| Candidates unable to exercise rights (access, erasure, portability) | Very Low | Medium | **Low** | Self-service tools in candidate portal | Very Low |
| Immutable traces modified (tampering with audit trail) | Very Low | High | **Medium** | Database trigger enforcing immutability, SHA-256 checksums, RLS | Very Low |
| Demographic data used in matching (re-identification risk) | Very Low | High | **Medium** | Cohort service architectural separation, minimum cohort size (n≥20) for any output | Very Low |
| Company misusing candidate data received through FHP | Low | High | **Medium** | DPA restricting use, compliance monitoring, enforcement ladder | Low |
| Minor registering without detection | Low | Medium | **Low** | Age confirmation at registration, deletion procedure if discovered | Very Low |
| International transfer without appropriate safeguards | Low | High | **Medium** | SCCs in place with all non-adequate-jurisdiction processors | Very Low |
| Automated decision without human review available | Very Low | High | **Medium** | Appeal process mandated, 30-day window, TWG/PC formal review | Very Low |

### 5.2 Highest-residual-risk item: discriminatory outcomes

This is the most significant ongoing risk and the reason FHP has an entire bias detection and correction layer. Even with mitigations:

- Bias correction requires minimum cohort sizes — new companies and niche roles will have no correction active initially
- The models used in the MMIL may have their own biases that are not detected until sufficient data accumulates
- The fairness metrics (DIR, EOD, SDS) are imperfect proxies for the full range of discrimination types

**Ongoing mitigations beyond the technical:**
- Fairness Oversight Board quarterly audit reports (public)
- Governance escalation when metrics breach for 3+ consecutive windows
- Company compliance obligations and audit rights
- Candidate appeal process with human review
- External fairness audit (NYC Local Law 144-style) annually

This risk is not eliminated — it is managed, monitored, and governed.

---

## 6. Measures to Address Risk

### 6.1 Technical measures

| Measure | Implementation |
|---------|--------------|
| Privacy by design | No-PII matching engine; schema separation; RLS |
| Data minimisation | No name, phone, DOB, address collected |
| Pseudonymisation | UUIDs throughout; identity separated from matching data |
| Encryption | TLS 1.3 in transit; AES-256 at rest |
| Immutability | DB trigger on pipeline_traces; SHA-256 checksums |
| Access controls | Database roles; RLS policies; principle of least privilege |
| Audit logging | All data access logged; all matching decisions traced |
| Automated decision transparency | Explanation generated for every outcome; scoring formula public |

### 6.2 Organisational measures

| Measure | Implementation |
|---------|--------------|
| Governance | Protocol Council, FOB, TWG with defined powers and accountability |
| DPO | Designated, independent, registered with supervisory authority |
| Staff training | All staff with data access trained on GDPR obligations |
| Incident response plan | Documented procedure; 48h notification to Company, 72h to supervisory authority |
| Vendor DPAs | Article 28 DPAs with all sub-processors |
| Regular review | DPIA reviewed annually and on material change |

### 6.3 Individual measures

| Measure | Implementation |
|---------|--------------|
| Transparency | Privacy policy; onboarding disclosure of automated processing |
| Rights | Self-service access, rectification, erasure, portability, objection |
| Human review | Appeal process with defined SLAs and formal outcomes |
| Article 22 compliance | Right to human intervention clearly communicated |

---

## 7. Consultation

### 7.1 DPO consultation

This DPIA has been prepared for DPO review. DPO sign-off is required before go-live.

DPO comments: [To be completed]  
DPO sign-off: [Pending — signature and date required]

### 7.2 Supervisory authority consultation

Prior consultation with the supervisory authority (ICO / relevant lead authority) is required under Article 36 where residual risk remains high after mitigation. Based on this assessment, the residual risk after mitigation does not meet the threshold for mandatory prior consultation. However, FHP should notify the supervisory authority of the processing as part of DPO registration.

### 7.3 Candidate consultation

Candidates have been consulted through the open governance process. The candidate rights charter is a public document and the community has had opportunity to review it.

---

## 8. Conclusion and Sign-Off

Based on this assessment:

- The processing is **necessary and proportionate** to the purpose
- The risks have been **identified and assessed**
- **Appropriate technical and organisational measures** are in place
- The **residual risk** is at an acceptable level, with the most significant risk (discriminatory outcomes) managed through ongoing monitoring and governance
- A **prior consultation with the supervisory authority is not required** at this stage

**This DPIA must be reviewed:**
- Before any material change to the processing (new pipeline stages, new data fields, new processing purposes)
- Annually, even without material change
- If a significant incident occurs that reveals a risk not captured in this assessment

---

**Prepared by:** [Name, Role, Date]  
**DPO review:** [Name, Date, Outcome]  
**Management approval:** [Name, Role, Date]  
**Next review due:** [Date — one year from approval]
