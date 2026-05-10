# FHP SLA Rules and Governance Escalation Pipeline

**Version:** 1.0.0-draft  
**Status:** Draft — awaiting Protocol Council ratification  
**Spec file:** `specs/governance-escalation-spec.md`

---

## Part A: SLA Rules

### A.1 Purpose

The FHP SLA framework ensures that candidates are never left in silence. Every interaction between a candidate and a company has a defined maximum response window. Breaching these windows is a compliance violation — not a recommendation.

"Ghosting" — failing to communicate with candidates — is one of the most damaging practices in hiring. FHP treats it as a first-class governance problem, not a minor discourtesy.

---

### A.2 Response SLA by stage

The following SLA windows apply from the moment a candidate's status changes at each stage. The clock starts at the stage entry event — i.e., when the candidate is notified they have progressed (or when the match is surfaced for an initial acknowledgement).

| Stage | SLA window | Notes |
|-------|-----------|-------|
| Initial match acknowledgement | **5 business days** | Company must acknowledge the match was reviewed, even if not proceeding. |
| Application review | **10 business days** | Decision to proceed or reject. |
| Screening call | **5 business days** after call | Written outcome required. |
| Technical assessment | **7 business days** after submission | Outcome + at minimum a score summary. |
| Interview stage | **5 business days** after final interview | Decision to proceed, offer, or reject. |
| Offer stage | **10 business days** | Offer letter or clear rejection with reason. |
| Post-rejection feedback | **10 business days** | Required when the candidate requests feedback. Feedback must be specific to the candidate's performance — generic responses are a violation. |

**"Business days"** means Monday–Friday, excluding public holidays in the job's primary location.

A company may set a *shorter* SLA in their job brief (`process.response_sla_days`). They may not set a longer one than the above. If a company sets no SLA, the table above applies.

---

### A.3 SLA monitoring

SLA monitoring is automated. The platform's SLA monitor:

1. Timestamps every stage entry event
2. Computes the SLA deadline = entry_timestamp + SLA_window_for_stage
3. Polls active interactions at least every 4 hours
4. At deadline breach: creates a `GhostingEvent` (see `ghosting-event.schema.json`) and triggers the notification and enforcement sequence

The candidate is notified within 1 hour of a breach being detected.

---

### A.4 Severity and enforcement

Ghosting events are classified by severity (see ghosting-event schema). Enforcement escalates with severity and frequency:

| Condition | Automated action |
|-----------|-----------------|
| First minor breach | Reminder sent to company. No strike recorded. |
| Second minor breach (same job) | Warning sent to company. Strike recorded. |
| First significant breach | Warning sent. Strike recorded. Compliance score updated. |
| First severe breach | Strike recorded. Compliance score updated. Governance team notified. |
| 3 strikes in 90 days | Job brief paused. Protocol Council review triggered. |
| 5 strikes in 90 days | Company account suspended pending governance review. |
| Any ghosting at offer stage | Automatic severe classification. Governance notified immediately. |

A "strike" persists in the company's compliance record for 12 months from the date of the breach.

---

### A.5 Dispute process

A company may dispute a ghosting event within 5 business days of being notified. To dispute, they must provide evidence of communication (e.g. email timestamps, system logs). Disputes are reviewed by the TWG within 10 business days. If a dispute is upheld, the strike is removed. If overturned, the severity may be upgraded.

False dispute submissions (where a company claims communication that cannot be evidenced) are treated as a separate compliance violation.

---

## Part B: Governance Escalation Pipeline

### B.1 Purpose

The governance escalation pipeline is the formal path by which compliance issues, fairness concerns, candidate appeals, and suspected violations travel from detection to resolution. Every escalation is logged, timestamped, assigned to a governance body, and given a resolution deadline.

---

### B.2 Escalation types

| Type | Trigger | Initial assignee |
|------|---------|-----------------|
| `ghosting_escalation` | 3+ strikes in 90 days, or severe ghosting event | Protocol Council |
| `fairness_breach_escalation` | Any fairness metric outside bounds for 3+ consecutive windows | Fairness Oversight Board |
| `candidate_appeal` | Candidate submits appeal against a match outcome | TWG (technical review) then PC (final decision) |
| `bias_correction_alert` | Bias correction delta > governance alert threshold | Fairness Oversight Board |
| `company_compliance_violation` | Prohibited filter detected, false dispute, or policy breach | Protocol Council |
| `governance_challenge` | Any party challenges a governance decision | Full joint session (PC + FOB) |

---

### B.3 Escalation record structure

Every escalation creates a record with the following fields:

```
escalation_id:        UUID
type:                 enum (see B.2)
raised_at:            datetime
raised_by:            enum [candidate, company, platform_monitor, governance_member, fob_member]
status:               enum [open, in_review, pending_response, resolved, appealed]
assignee_body:        enum [twg, protocol_council, fairness_oversight_board, joint_session]
subject_entity_type:  enum [candidate, company, match, job_brief, governance_decision]
subject_entity_id:    UUID
priority:             enum [standard, urgent, critical]
resolution_deadline:  datetime
resolved_at:          datetime (nullable)
outcome:              enum [upheld, not_upheld, partially_upheld, referred, pending]
outcome_notes:        string (max 4096 chars)
public_summary:       string (max 1024 chars) — published in the public audit log
linked_trace_ids:     array[UUID]
linked_appeal_ids:    array[UUID]
```

---

### B.4 Resolution SLAs for escalations

All governance bodies are bound by resolution SLAs:

| Escalation type | Priority | Resolution SLA |
|----------------|----------|---------------|
| `candidate_appeal` | Standard | 20 business days |
| `candidate_appeal` | Urgent | 10 business days |
| `ghosting_escalation` | Standard | 15 business days |
| `fairness_breach_escalation` | Standard | 20 business days |
| `fairness_breach_escalation` | Urgent | 10 business days |
| `bias_correction_alert` | Standard | 10 business days |
| `company_compliance_violation` | Standard | 20 business days |
| `company_compliance_violation` | Critical | 5 business days |
| `governance_challenge` | Any | 30 business days |

**Urgent** priority is automatically assigned when:
- A candidate appeal involves a job that is still active (the role may still be filled while the appeal is pending)
- A fairness metric has been in breach for 7+ consecutive windows
- A company has been flagged for a compliance violation affecting multiple candidates simultaneously

**Critical** priority is manually assigned by any Protocol Council or FOB member and cannot be downgraded by the assignee body.

---

### B.5 Candidate appeal process

A candidate may appeal any `not_matched` decision within **30 days** of receiving the explanation.

**Step 1 — Submission (candidate)**  
The candidate submits their appeal via the candidate portal. They must specify which aspect of the decision they are appealing:
- A specific skill assessment they believe is incorrect
- A preference misalignment they believe was wrongly computed
- A suspected bias in the match

**Step 2 — Technical review (TWG, 10 business days)**  
The TWG reviews the pipeline trace for the match. They verify:
- All stage inputs and outputs are correct per the spec
- The ontology version used was current
- The scoring formula was applied correctly
- The bias correction layer operated as specified

The TWG produces a technical finding: `no_error_found` or `error_found` (with description).

**Step 3 — Decision (Protocol Council, 10 business days from TWG finding)**  
The PC reviews the TWG finding and the candidate's submission. Possible outcomes:

| Outcome | Meaning | Action |
|---------|---------|--------|
| `upheld` | The original decision was correct | Candidate is informed. No change to match. |
| `overturned` | A pipeline error was found | Match outcome is corrected. Explanation updated. Candidate re-notified. |
| `partially_upheld` | A minor error was found, but it does not change the outcome | Match outcome unchanged. Explanation amended. |
| `referred_to_fob` | The appeal raises a systemic fairness question | Referred to the Fairness Oversight Board for broader review |

**Step 4 — FOB review (if referred, 20 business days)**  
If referred, the FOB reviews whether the appeal represents a systemic pattern. If so, they may:
- Mandate a review of all matches from the same pipeline version
- Require changes to the ontology or the bias correction thresholds
- Publish a public audit report

---

### B.6 Transparency requirements

All escalation outcomes are published in the public audit log (with PII redacted). The log includes:

- The escalation type
- The assigned body
- The outcome
- The `public_summary` field
- The resolution date

Governance bodies must publish a quarterly summary of all escalations, outcomes, and any protocol changes that resulted.

---

### B.7 Governance body decision-making

**Protocol Council decisions:**  
Require 4/6 majority (as defined in GOVERNANCE.md). Votes are recorded and published.

**Fairness Oversight Board decisions:**  
Require simple majority of active FOB members. FOB may issue a binding veto on any Protocol Council decision that the FOB determines creates an unfair outcome. A veto may be overridden only by a 5/6 PC supermajority.

**TWG decisions:**  
Technical findings are made by consensus. Where consensus is not reached, the matter is referred to the Protocol Council.

**Joint sessions:**  
Require 4/6 PC majority AND FOB majority to pass a binding resolution.

---

### B.8 Escalation pipeline diagram (text representation)

```
Detection event (platform monitor / candidate / governance member)
    │
    ▼
Escalation record created → assigned to governance body
    │
    ├── TWG (technical review)
    │       │
    │       ▼
    │   Technical finding → referred to PC
    │
    ├── Protocol Council
    │       │
    │       ├── Resolved
    │       └── Referred to FOB
    │
    ├── Fairness Oversight Board
    │       │
    │       ├── Resolved
    │       ├── Veto issued → back to PC for supermajority override
    │       └── Systemic review triggered
    │
    └── Joint session (PC + FOB)
            │
            └── Binding resolution
                    │
                    ▼
            Public audit log entry
            Outcome notification to all affected parties
```
