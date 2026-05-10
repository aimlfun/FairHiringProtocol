# Governance Enforcement Pipeline

(How the system detects, escalates, and acts on fairness violations.)

**This turns FHP into something regulators, companies, and candidates can trust.**

This is the machinery that ensures companies behave fairly, the protocol stays fair, and violations are caught early.

Think of it like a layered defence system — each layer catches a different class of failure.

## Layer 1 — Real Time Enforcement (During Matching)

This is the first line of defence.

**What it catches:**
- 	invalid job briefs
- 	missing salary ranges
- 	illegal filters (e.g., “recent graduate”)
- 	contradictory constraints
- 	impossible requirements
- 	must have violations
- 	constraint violations

**How it works:**

When `/match` or `/batch/match` is called:
- 	the constraint evaluator logs violations
- 	the explanation generator records them
- 	the audit logger stores them
- 	the system can auto reject the job brief if it violates protocol rules

**Outcome:**

*Companies cannot sneak unfair job briefs into the system.*

## Layer 2 — Continuous Fairness Monitoring (Statistical)

This is the “always on” fairness engine.

**What it monitors:**
- 	disparate impact
- 	equal opportunity difference
- 	score distribution skew
- 	model disagreement patterns
- 	drift over time
- 	demographic consistency

**How it works:**

Every match record feeds into the fairness engine.

If metrics cross thresholds:
- 	the job is flagged
- 	the company is notified
- 	the governance layer is alerted
- 	bias correction is applied automatically
- 	the explanation reflects this

**Outcome:**

*Bias is detected early and corrected automatically.*

## Layer 3 — Company Level Fairness Profiles

This is where company IDs matter.

**What’s tracked per company:**
- 	fairness metrics
- 	violation history
- 	audit results
- 	ghosting rates
- 	response times
- 	job brief quality
- 	repeat offences

**How it works:**

Every job brief includes:
```
"company_id": "acme_corp_123"
```

The system aggregates:
- 	match outcomes
- 	fairness metrics
- 	violations
- 	audit logs

Outcome:

*We can identify discriminatory companies with statistical confidence.*

## Layer 4 — Automated Enforcement Actions

When violations accumulate, the system escalates.

**Actions include:**
- 	Warning (soft)
- 	Job suspension (medium)
- 	Company suspension (hard)
- 	Public fairness violation report (very hard)

**Triggers:**
- 	repeated constraint violations
- 	repeated bias violations
- 	ignoring audit requests
- 	ghosting candidates
- 	manipulating job briefs
- 	using forbidden filters

**Outcome:**

*Companies have real incentives to behave fairly.*

## Layer 5 — Human Oversight (Governance Bodies)

This is where the Protocol Council and Fairness Oversight Board step in.

**They handle:**
- 	appeals
- 	escalated violations
- 	systemic bias patterns
- 	ontology disputes
- 	scoring changes
- 	governance changes

**They can:**
- 	veto unfair changes
- 	mandate corrective action
- 	suspend companies
- 	publish fairness reports

**Outcome:**

*The system is not just automated — it’s accountable.*

## Layer 6 — Public Transparency

This is the ultimate enforcement mechanism.

**Publicly available:**
- 	fairness dashboards
- 	company fairness profiles
- 	protocol version history
- 	governance decisions
- 	rejected proposals
- 	audit summaries

**Outcome:**

*Companies behave better when they know the world is watching.*