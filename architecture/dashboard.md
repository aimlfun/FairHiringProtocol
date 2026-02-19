# Onboarding + Dashboard Architecture 

How candidates and companies interact with the system in a way that supports fairness, transparency, and accountability

## A. Candidate Onboarding Flow

### Step 1 — Upload CV / Import Profile
- 	via `/interpret/candidate`
- 	LLMs extract skills, experience, responsibilities

### Step 2 — Candidate Review

Candidate can:
- 	approve inferred skills
- 	reject incorrect ones
- 	add missing ones
- 	set preferences
- 	set constraints
- 	optionally provide demographics (for fairness only)

### Step 3 — Profile Stored

Stored in:
- 	`candidate_profile_store`
- 	versioned
- 	traceable

### Step 4 — Matching

Candidate triggers:
- 	`/batch/match`
- 	receives match IDs

### Step 5 — Explanations

Candidate views:
- 	`/explain/{match_id}`
- 	strengths
- 	gaps
- 	bias correction (if any)

### Step 6 — Appeals

Candidate can request:
- 	`/audit/match/{match_id}`
- 	correction
- 	fairness review

## B. Company Onboarding Flow

### Step 1 — Company Registration

Company provides:
- 	legal identity
- 	compliance agreement
- 	contact details

### Step 2 — Company ID Issued

Stored in:
- 	`company_registry`

### Step 3 — Job Brief Creation

Company submits:
- 	raw JD → `/interpret/job`
- 	reviews structured brief
- 	submits via `/match` or `/batch/match`

### Step 4 — Fairness Dashboard

Company sees:
- 	match quality
- 	fairness metrics
- 	bias alerts
- 	job brief quality score
- 	ghosting metrics
- 	compliance status

### Step 5 — Enforcement

If violations occur:
- 	warnings appear in dashboard
- 	jobs may be paused
- 	company may be suspended

## C. Governance Dashboard

For the Protocol Council and Fairness Oversight Board.

Shows:
- 	system wide fairness metrics
- 	company level fairness profiles
- 	drift detection
- 	ontology change proposals
- 	scoring change proposals
- 	violation escalations
- 	audit logs
- 	protocol version history

Allows:
- 	approving/rejecting proposals
- 	issuing suspensions
- 	publishing fairness reports
- 	triggering investigations

## D. Why this architecture works

It gives provides:
- 	full accountability
- 	full transparency
- 	full auditability
- 	minimal data storage
- 	ethical boundaries
- 	candidate empowerment
- 	company accountability
- 	governance oversight
- 	explainability at every step

*And it aligns perfectly with the API surface.*