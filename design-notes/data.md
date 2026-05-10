# Managing Data

Every **fair hiring system** has to confront:
- 	We want decentralisation (LLMs interpret, heuristics decide, open protocol, no central authority).
- 	But we also need centralisation (auditability, company level metrics, bias detection, preventing repeat offenders).
- 	And we need data (candidate profiles, job briefs, match logs).
- 	But we must avoid becoming a surveillance system or a data hoarding ATS.


# 1. The unavoidable truth:

We **must store some data.**

We cannot:
- 	detect bias
- 	track discriminatory companies
- 	generate fairness metrics
- 	support appeals
- 	provide explanations
- 	enforce governance
- 	prevent repeat violations

…without storing:
- 	candidate profiles
- 	job briefs
- 	match logs
- 	company identifiers
- 	audit traces

This is not optional. It’s foundational.

But — and this is the key — we store only what is necessary, and we store it ethically.

# 2. What data must be stored (minimum viable storage)

## A. Candidate Profiles

- 	canonical structured profile
- 	inferred skills (with trace)
- 	preferences
- 	constraints
- 	optional demographics (for fairness only)


## B. Job Briefs

- 	canonical structured brief
- 	must have / nice to have
- 	responsibilities
- 	constraints
- 	company ID

## C. Match Records

- 	candidate ID
- 	job ID
- 	raw score
- 	final score
- 	bias correction applied
- 	explanation
- 	full trace
- 	protocol version
- 	timestamp

## D. Company Registry
- 	company ID
- 	compliance status
- 	audit history
- 	fairness metrics
- 	violations

This is the absolute minimum needed to enforce fairness.

# 3. Why company IDs are essential

We cannot enforce fairness without knowing:
- 	which companies repeatedly violate constraints
- 	which companies ghost candidates
- 	which companies manipulate job briefs
- 	which companies produce biased outcomes
- 	which companies ignore audits

Company IDs allow:
- 	fairness dashboards
- 	bias trend detection
- 	repeat offender tracking
- 	governance enforcement
- 	public accountability

This is not optional — it’s the backbone of the governance model.

# 4. Where the MCP (Model Context Protocol) fits in

MCP is perfect for:
- 	companies querying candidates
- 	candidates querying jobs
- 	real time matching
- 	structured data exchange
- 	interoperability

But MCP does not solve:
- 	storage
- 	identity
- 	auditability
- 	fairness monitoring
- 	governance
- 	bias detection

So MCP is a transport layer, not a data layer.

We still need a backend that:
- 	stores profiles
- 	stores matches
- 	stores traces
- 	stores company IDs
- 	stores audit logs

Think of MCP as the “API handshake,” not the “database.”

# 5. What about scraping LinkedIn?

Short answer: We can’t rely on scraping LinkedIn — legally or practically.

LinkedIn’s ToS explicitly forbids:
- 	scraping
- 	automated extraction
- 	data harvesting
- 	profile replication

And they enforce it aggressively.

So the realistic options are:

## Option A — Candidate self onboarding (portal)

Candidates upload:
- 	CV
- 	LinkedIn PDF export
- 	GitHub
- 	portfolio
- 	preferences

The system interprets it.

## Option B — Integrations
- 	ATS integrations
- 	HRIS integrations
- 	job board integrations
- 	OAuth based profile import (if allowed)

## Option C — Public profiles (opt in)

Candidates choose to make their profile discoverable.

## Option D — Enterprise deployments

Companies run FHP internally and share anonymised data.

*Scraping is not viable.*

# 6. So what’s the architecture that satisfies everything?
Here’s the clean, aligned model:
```
Portal / Integrations
        ↓
Candidate Profile Store
Job Brief Store
Company Registry
Match Log Store
        ↓
Matching Engine (LLM + heuristics)
        ↓
Trace Store
Explanation Store
Audit Store
        ↓
Governance Layer
```

This gives us:
- 	storage (minimal but essential)
- 	auditability
- 	fairness enforcement
- 	company accountability
- 	candidate rights
- 	explainability
- 	multi model validation
- 	MCP interoperability

Everything fits.

# 7. The key principle:

**Store only what is needed for fairness, nothing more.**

This is the ethical line:
- 	Store:
	-	structured profiles
	-	job briefs
	-	match logs
	-	traces
	-	company IDs
	-	fairness metrics
- 	Do NOT store:
	-	behavioural data
	-	browsing history
	-	passive signals
	-	social graph
	-	psychometrics
	-	personality inference
	-	private messages

*This keeps the system fair, not creepy.*