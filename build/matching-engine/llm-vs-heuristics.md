# The Role of Models vs. Heuristics (and why both matter)

Our approach needs to make decisions, and there is a division of labour between LLMs and heuristics, and the multi model layer simply formalises that intuition into a safe, predictable, fairness preserving system.

This is one of the most important architectural decisions in the entire protocol.

Think of the matching engine as having two kinds of intelligence:

**1.	Interpretive intelligence → turning messy human input into structured meaning**

**2.	Decision intelligence → applying deterministic, auditable rules to that meaning**

LLMs are phenomenal at the first. Heuristics (our scoring + bias rules) are mandatory for the second.

Here’s the clean split:

# 1. LLMs handle interpretation, not decisions

LLMs are used for:

## A. Turning human CVs into structured data
- 	extracting skills
- 	identifying responsibilities
- 	inferring transferable skills
- 	mapping project experience
- 	interpreting ambiguous phrasing
- 	normalising job titles
- 	identifying seniority signals

## B. Turning human job descriptions into structured job briefs
- 	extracting must have vs nice to have
- 	identifying responsibilities
- 	interpreting culture keywords
- 	mapping domain requirements
- 	detecting implicit constraints

## C. Semantic reasoning
- 	“PostgreSQL” → “Relational DB”
- 	“Led a team” → “Mentoring + leadership”
- 	“Built microservices” → “Distributed systems”

## D. Natural language alignment
- 	preference interpretation
- 	culture keyword matching
- 	responsibility → skill mapping

LLMs are the translators. They turn messy human language into structured, machine readable meaning.

But — and this is the key — they do not make hiring decisions.

# 2. Heuristics handle decisions, not interpretation

Once the LLMs have produced structured meaning, the rest is:
- 	deterministic
- 	auditable
- 	explainable
- 	versioned
- 	bias correctable

This includes:

## A. Must have evaluation

Binary, rule based.

## B. Nice to have scoring

Weighted, rule based.

## C. Transferable skill compensation

Ontology driven, rule based.

## D. Experience relevance

Responsibility based, rule based.

## E. Preference alignment

Rule based.

## F. Bias detection

Statistical, rule based.

## G. Bias correction

Proportional, rule based.

## H. Final score

Deterministic formula.

Heuristics are the judges. They apply the rules of the protocol — not the whims of a model.

# 3. Why two models? (This is the important part)

LLMs are best at turning human mess into structured meaning.

But a single model is:
- 	biased
- 	inconsistent
- 	hallucination prone
- 	drift prone
- 	vendor dependent
- 	opaque

So we use two (or more) models for interpretation only.

This gives us:

## A. Cross model agreement

If both models infer “system design,” it’s probably real.

## B. Hallucination filtering

If only one model infers “Kubernetes expert,” we discard it.

## C. Bias detection

If Model A consistently under infers skills for older candidates but Model B doesn’t → bias detected.

## D. Drift detection

If Model A’s outputs change after a model update → caught immediately.

## E. Vendor neutrality

No single model becomes a single point of failure.

## F. Safety


The system becomes robust to:
- 	hallucinations
- 	over generalisation
- 	under generalisation
- 	semantic misinterpretation

This is the same principle used in aviation: redundancy = safety.

# 4. The clean division of labour (this is the architecture)

LLMs do:
- 	interpretation
- 	semantic expansion
- 	inference
- 	normalisation
- 	mapping
- 	summarisation

Heuristics do:
- 	scoring
- 	constraint evaluation
- 	bias detection
- 	bias correction
- 	explanation generation
- 	final decision

Ontology does:
- 	canonical truth
- 	equivalence
- 	compensation rules
- 	responsibility → skill mapping

Trace system does:
- 	accountability
- 	reproducibility
- 	explainability

Governance does:
- 	stability
- 	fairness
- 	versioning

This is the cleanest, safest, most future proof architecture we can build.

** LLMs interpret. Heuristics decide. Two models validate.**

This is the only way to build a hiring system that is:
- 	fair
- 	transparent
- 	explainable
- 	auditable
- 	robust
- 	future proof
- 	regulator friendly
- 	candidate friendly
- 	company friendly

And it’s the only way to avoid the trap of *“AI decides who gets hired,”* which is both unethical and legally indefensible.