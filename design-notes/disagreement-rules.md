# Disagreement Rules

Trace design and disagreement resolution rules are the two places where fairness becomes enforceable, not just aspirational. 

The obvious rules (“if both models agree, accept it”) are only the beginning. 

The real power comes from the non obvious rules — the ones that catch subtle bias, hallucination, drift, and semantic inconsistency.

Let’s break this into two parts:

**1.	Trace format — what we log, how we log it, and why**

**2.	Disagreement resolution rules — the deep logic that makes multi model validation meaningful**

This is where the system becomes bulletproof.

### 1. Trace Format — The Backbone of Explainability

A trace is a structured, append only record of every decision the matching engine makes. Think of it like a flight recorder for fairness.

Each module emits a trace object with:

### 1.1 Required fields
- stage — which module produced this trace
- input — what the module received
- output — what the module produced
- model_outputs — per model raw outputs (if applicable)
- confidence — aggregated confidence
- disagreements — any divergence between models
- resolution — how disagreement was resolved
- explanation_snippet — a human readable line for the final explanation
- timestamp
- protocol_version

### 1.2 Example trace (semantic expansion)
```
{
  "stage": "semantic_expansion",
  "input": "PostgreSQL",
  "model_outputs": {
    "model_A": ["Relational Database", "SQL"],
    "model_B": ["Relational Database"]
  },
  "disagreements": ["SQL"],
  "resolution": "intersection_only",
  "output": ["Relational Database"],
  "confidence": 0.92,
  "explanation_snippet": "PostgreSQL was interpreted as a relational database skill."
}
```

This is gold for audits, debugging, and trust.

### 2. Disagreement Resolution Rules — The Real Magic

This is where our system becomes robust and fair. Let’s go beyond the obvious “take the intersection” rule.

There are six resolution strategies, each used in different contexts.

### Rule 1 — Intersection Only (Default for Safety)

Use when:
- inferring skills
- expanding skills
- mapping responsibilities

Logic: Only accept items that all models agree on.

Why: This eliminates hallucinations and model specific quirks.

Example: 
- Model A: “React”, “Frontend Frameworks” 
- Model B: “Frontend Frameworks”

→ Accept only “Frontend Frameworks”.

### Rule 2 — Weighted Consensus (When Models Differ in Strength)

Use when:
- one model is better at structured extraction
- another is better at semantic reasoning

Logic: Each model has a domain specific weight. If a skill is inferred by multiple models, weights are summed.

Example: 
- Model A weight: 0.6 
- Model B weight: 0.4 
- Skill inferred by both → 1.0 
- Skill inferred by A only → 0.6 (below threshold → discard)

Why: Some models are better at certain tasks — but no model is trusted alone.

### Rule 3 — Ontology Anchored Override

Use when:
- models disagree
- but the ontology has a canonical mapping

Logic: Ontology > models.

Example:
- Model A: “PostgreSQL → SQL”
- Model B: “PostgreSQL → Relational DB” 
- Ontology: “PostgreSQL → Relational DB”

→ Accept ontology mapping.

Why: The ontology is the stable, governed source of truth.

### Rule 4 — Disagreement Escalation (Bias Sensitive)

Use when:
- disagreement correlates with a protected attribute
- e.g., older candidates get fewer inferred skills from Model A

Logic: If disagreement is demographically patterned, the system:
- flags the inference
- discards the disputed output
- logs a fairness warning
- may trigger bias correction later

Why: This catches subtle model bias.

### Rule 5 — Confidence Weighted Merge (For Non Critical Fields)

Use when:
- merging soft signals
- e.g., culture keyword alignment
- preference interpretation

Logic: If models disagree but both outputs are low risk, merge with confidence weighting.

Example: 
- Model A: “collaboration” (0.7 confidence) 
- Model B: “mentoring” (0.6 confidence)

→ Accept both with weighted scores.

Why: Soft signals don’t affect must have logic.

### Rule 6 — Human Review Required (Rare but Important)

Use when:
- models disagree wildly
- ontology has no guidance
- inference affects must have skills

Logic: The system:
- marks the inference as “requires review”
- excludes it from scoring
- logs it for audit
- continues matching without it

Why: Better to be conservative than unfair.

# Putting It All Together — The Resolution Pipeline

When models disagree, the system applies rules in this order:
1.	Ontology Anchored Override
2.	Intersection Only
3.	Weighted Consensus
4.	Confidence Weighted Merge
5.	Bias Sensitive Escalation
6.	Human Review Required

This ensures:
- safety
- fairness
- stability
- transparency

And every resolution is logged in the trace.

**Why This Matters So Much**

This is the difference between:

| Bad | Good |
|------------|-------------|
| ❌ A system that hopes it’s fair | ✔ A system that proves it’s fair |
| ❌ A system that trusts one model | ✔ A system that distrusts all models equally |
| ❌ A system that hides its reasoning | ✔ A system that logs every decision |

*This is how we build a hiring protocol that regulators, companies, and candidates can trust.*