# API Surface
This is at the protocol level, not the “API as a thin wrapper” level, this is how it supports the real world:
- 	storing candidate records
- 	storing job briefs
- 	storing match logs
- 	identifying companies
- 	tracking fairness metrics
- 	detecting discriminatory behaviour
- 	supporting audits
- 	enabling MCP style integrations
- 	powering a portal for candidates



*The API surface isn’t just “nice” — it’s necessary for the system to function ethically and at scale.*

---

# 1. The API surface supports storage — without becoming a surveillance system

Where storage happens in the API:
## A. `/match`
- 	Every call produces a `match_id`
- 	That `match_id` becomes the anchor for:
	- 	the explanation
	-	the trace
	-	the audit log
	-	the fairness metrics

*This implicitly requires persistent storage.*

## B. `/explain/{match_id}`
- 	This endpoint only works if the system stores:
	-	candidate profile snapshot
	-	job brief snapshot
	-	all traces
	-	scoring
	-	bias correction
	-	protocol version

*This is our audit trail.*

## C. `/audit/match/{match_id}`
- 	This endpoint exposes the full trace log.
- 	That means the system must store:
	-	every decision
	-	every model output
	-	every disagreement
	-	every resolution
	-	every bias metric

*This is how we enforce fairness.*

## D. /audit/fairness
- 	This endpoint aggregates fairness metrics across:
	-	companies
	-	roles
	-	demographics
	-	time windows

This requires persistent storage of:
- 	match outcomes
- 	protected attributes (optional, candidate controlled)
- 	company IDs
- 	job IDs

*The API surface assumes a backend that stores the minimum viable data needed for fairness.*

# 2. The API surface supports company IDs and accountability

## A. Job briefs include company_id

Every job brief passed to /match or /batch/match includes:
```
{
  "company_id": "acme_corp_123",
  ...
}
```

This means:
- 	every match is tied to a company
- 	every trace is tied to a company
- 	every fairness metric is tied to a company
- 	every violation is tied to a company

## B. /audit/fairness exposes company level metrics

This endpoint can return:
```
{
  "company_id": "acme_corp_123",
  "bias_metrics": {
    "disparate_impact": ...,
    "equal_opportunity": ...,
    "score_skew": ...
  },
  "violations": [...],
  "trend": {...}
}
```

*This is how we detect discriminatory behaviour.*

# 3. The API surface supports MCP-style integrations

The API surface is designed to be MCP friendly:

## A. `/interpret/candidate`
- 	Companies can send raw CV text → get structured profile
- 	Perfect for MCP “tools” that interpret documents

## B. `/interpret/job`
- 	Companies can send raw job descriptions → get structured job briefs
- 	Again, perfect for MCP

## C. `/match and /batch/match`
- 	MCP clients can call these directly
- 	They get match results + match IDs
- 	They can fetch explanations later

## D. `/explain/{match_id}`
- 	MCP clients can retrieve explanations on demand
- 	This is ideal for interactive workflows

## E. `/ontology/resolve`
- 	MCP clients can resolve skills in real time
- 	Useful for autocomplete, validation, etc.

*The API surface is fully compatible with MCP.*

# 4. The API surface supports a candidate portal

Candidate portal flow:
1.	Candidate uploads CV → `/interpret/candidate`
2.	Candidate edits/approves profile → stored in backend
3.	Candidate sets preferences → stored in backend
4.	Candidate requests matches → `/batch/match`
5.	Candidate views explanations → `/explain/{match_id}`
6.	Candidate appeals → `/audit/match/{match_id}`

*Everything needed for a portal is already in the API.*

# 5. The API surface supports fairness enforcement

This is the big one.

## A. `/audit/fairness`
- 	System wide fairness metrics
- 	Company level fairness metrics
- 	Drift detection
- 	Bias detection
## B. `/audit/match/{match_id}`
- 	Full trace
- 	Full model outputs
- 	Full disagreement logs
- 	Full bias correction logs

## C. `/governance/version`
- 	Ensures reproducibility
- 	Ensures audits can be replayed
- 	Ensures companies can’t claim “the model changed”

## D. Company IDs in job briefs
- 	Enables per company fairness tracking
- 	Enables repeat offender detection
- 	Enables governance enforcement

*This is how the protocol enforces fairness in the real world.*

# 6. The API surface supports minimal, ethical storage

The API surface forces the system to store only what is needed:
- 	candidate profiles
- 	job briefs
- 	match logs
- 	traces
- 	explanations
- 	company IDs
- 	fairness metrics

It does not require storing:
- 	behavioural data
- 	browsing history
- 	psychometrics
- 	social graphs
- 	personality inference
- 	passive signals

*This keeps the system ethical.*

# 7. So how does the API surface meet our requirements?

| Requirement | API Feature That Solves It |
|--------------|----------------------------|
| Need to store candidate records | `/interpret/candidate`, `/match`, `/explain` |
| Need to store job briefs | `/interpret/job`, `/match` |
| Need to store match logs | `/match`, `/audit/match/{id}` |
| Need company IDs | `job_brief.company_id` |
| Need to track discriminatory companies | `/audit/fairness` |
| Need to support MCP | `/interpret/*`, `/match`, `/explain` |
| Need a candidate portal | `/interpret/candidate`, `/batch/match`, `/explain` |
| Need fairness enforcement	| `/audit/*`, `/governance/version` |


*Everything aligns.*