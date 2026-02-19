# Ghosting

Ghosting detection is one of those things that sounds soft and fuzzy, but once we formalise it inside the protocol, it becomes a hard, measurable, enforceable signal of whether a company is behaving ethically.
And the beauty is: because the protocol already stores match records, timestamps, and company IDs, ghosting detection becomes almost trivial — but powerful.

## What “ghosting” means in the protocol
Ghosting = a company fails to respond to a matched candidate within the required timeframe, or fails to provide a structured rejection.

In FHP terms:

A company is ghosting when it does not complete its obligations after receiving a match.

Those obligations are defined in company-compliance.md:
- 	respond to matched candidates
- 	provide structured rejection reasons
- 	do so within a defined SLA (e.g., 7 days)

So ghosting is not subjective — it’s measurable.

## How the system detects ghosting (step-by-step)

Ghosting detection is built on three simple data points:
1.	match_id
2.	company_id
3.	timestamps (match created, company response)

Everything else is derived.

Let’s break it down.
### 1. A match is created

When /match or /batch/match runs, the system stores:
```
{
  "match_id": "uuid",
  "candidate_id": "cand_123",
  "job_id": "job_456",
  "company_id": "acme_corp",
  "match_timestamp": "2025-02-17T12:34:56Z",
  "status": "awaiting_company_response"
}
```

This is the starting point.

### 2. The company is notified

The company dashboard (or MCP integration) receives:
- 	match_id
- 	candidate summary
- 	explanation
- 	required actions
- 	SLA deadline

The SLA is defined by governance (e.g., 7 days).

### 3. The company must respond
They respond via:

#### A. /company/respond/{match_id}
With:
```
{
  "status": "interested" | "rejected",
  "reason": "structured_reason_code"
}
```

Or:

#### B. ATS integration callback

Same payload.

### 4. The system checks the SLA
If the company responds:
- 	within SLA → compliant
- 	after SLA → late
- 	never responds → ghosted

This is computed automatically:
`response_time = response_timestamp - match_timestamp`

ghosted = response_time > SLA AND no response

=> **Until major adoption, the system will support self-reporting by candidates, and companies will end up on the scoreboard. This encourages behaviour change.**

### 5. Ghosting is logged
A ghosting event is stored as:

```
{
  "company_id": "acme_corp",
  "match_id": "uuid",
  "ghosted": true,
  "days_overdue": 14,
  "timestamp": "2025-02-31T12:34:56Z"
}
```

This feeds into:
- 	fairness metrics
- 	company compliance score
- 	governance dashboards

### 6. Ghosting affects the company’s fairness profile

Ghosting is not just rude — it’s discriminatory in effect.

Why?

Because ghosting disproportionately harms:
- 	older candidates
- 	career switchers
- 	disabled candidates
- 	candidates from underrepresented backgrounds

So ghosting becomes a fairness signal.

The system tracks:
- 	ghosting rate
- 	ghosting rate by demographic group
- 	ghosting rate by job family
- 	ghosting rate by seniority
- 	ghosting rate over time

If ghosting correlates with protected attributes → bias alert.

### 7. Enforcement kicks in

Governance enforcement uses ghosting as a trigger.

**Soft violations (warning):**
- 	ghosting rate > 10%
- 	repeated late responses
**Medium violations (job suspension):**
- 	ghosting rate > 20%
- 	ghosting correlated with protected attributes
- 	repeated warnings ignored
**Hard violations (company suspension):**
- 	ghosting rate > 30%
- 	ghosting disproportionately affects a protected group
- 	company ignores governance requests
**Public fairness report:**
- 	for repeat offenders
- 	for systemic discrimination patterns

*Ghosting becomes a quantifiable compliance failure.*

### 8. Candidate experience

Candidates see:
- 	“Company has not responded within the expected timeframe.”
- 	“This company has a low fairness score.”
- 	“This company has been suspended for repeated violations.”

*This is radical transparency.*

### 9. Company dashboard

Companies see:
- 	ghosting rate
- 	SLA compliance
- 	fairness impact of ghosting
- 	comparison to industry benchmarks
- 	warnings or violations

*This nudges behaviour.*

### 10. Governance dashboard

Governance sees:
- 	ghosting patterns across the ecosystem
- 	ghosting correlated with demographics
- 	repeat offenders
- 	systemic issues
- 	companies requiring intervention

*This is how we enforce fairness at scale.*

# Why this works

Ghosting detection is:
- 	automatic
- 	data-driven
- 	fairness-relevant
- 	company-specific
- 	transparent
- 	enforceable

And it requires no subjective judgement.

It’s just:
- 	timestamps
- 	company IDs
- 	SLA rules
- 	fairness metrics

*But the impact is huge.*