# Once a company runs a match, they incur obligations

The moment a company triggers:
```
POST /match
```
or
```
POST /batch/match
```

*…and the system returns a matched candidate, the company has entered into a protocol defined obligation.*

This is **not optional**. This is not “nice to have.” **This is compliance.**

Here’s the contract:

## 1. The system notifies the candidate

When a match is created:
- 	the system stores the match record
- 	the system generates the explanation
- 	the system notifies the candidate (portal, email, app, etc.)

The notification includes:
- 	job summary
- 	company name
- 	match score
- 	explanation
- 	next steps
- 	SLA for company response

This is crucial: the **candidate is not left in the dark**.

## 2. The company is obligated to respond

Once the company receives the match, they must respond via:

```
POST /company/respond/{match_id}
```

with:
```
{
  "status": "interested" | "rejected",
  "reason": "structured_reason_code"
}
```

This is the heart of the anti ghosting mechanism.

**If they are interested:**
- 	candidate is notified
- 	company gets candidate contact details
- 	process continues offline

**If they reject:**
- 	candidate receives a structured, respectful explanation
- 	the system logs the rejection reason
- 	fairness metrics update

**If they do nothing:**
- 	the system marks it as ghosting
- 	the company’s fairness score drops
- 	governance enforcement may trigger

## 3. Why this obligation exists

Because without it:
- 	companies could match candidates and never respond
- 	candidates would be left hanging
- 	bias could hide in silence
- 	companies could “shop around” without accountability
- 	the system would replicate the worst parts of hiring today

**The protocol flips the power dynamic:**  If a company uses the protocol, they must treat candidates with dignity.

## 4. What happens if the company ignores the obligation

This is where governance enforcement kicks in.

### A. First violation → Warning
- 	dashboard alert
- 	email notification
- 	fairness score impact
### B. Repeated violations → Job suspension
- 	the job is paused
- 	company must acknowledge and correct behaviour
### C. Systemic violations → Company suspension
- 	all job briefs paused
- 	governance review required
### D. Severe or discriminatory ghosting → Public fairness report
- 	transparency as enforcement
- 	reputational consequences


***Ghosting is not a “soft” violation — it’s a fairness issue.***

### 5. Why the system notifies the candidate first

This is intentional and powerful.

It prevents:
- 	companies quietly ignoring matches
- 	companies cherry picking candidates
- 	companies using the system as a sourcing tool without accountability

It ensures:
- 	candidates know they were matched
- 	candidates know the company must respond
- 	candidates know when the company fails to respond
- 	candidates can appeal or flag unfair behaviour

This is radical transparency.

### 6. Why this is aligned with everything we’re building

This behaviour fits perfectly with:
- 	the API surface
- 	the governance model
- 	the company compliance rules
- 	the candidate rights charter
- 	the audit system
- 	the fairness engine

It’s not an add on — it’s the natural consequence of a fair hiring protocol.

### 7. The deeper philosophical point

We’ve essentially created a world where:
- 	companies cannot silently discard people
- 	candidates are treated as stakeholders
- 	fairness is enforced by design
- 	transparency is the default
- 	accountability is built into the protocol

This is the opposite of how hiring works today.

*And that’s exactly why this protocol matters.*