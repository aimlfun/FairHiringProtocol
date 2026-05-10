# Multi Model Validation

## What “Multi Model Validation Layer” Means

In simple terms:

No single AI model is trusted to make a hiring relevant decision on its own. Every inference must be validated by at least one independent model.

This is the same principle used in:
- aviation (redundant flight computers)
- medicine (double reading scans)
- finance (risk model ensembles)

It’s a safety mechanism.

## Why it matters in hiring:

Different models have different:
- biases
- blind spots
- failure modes
- semantic interpretations
- hallucination tendencies

If we rely on one model, we inherit its flaws.

If we rely on two or more models, we can:
- detect disagreement
- detect drift
- detect bias
- detect hallucination
- enforce consistency

This is algorithmic checks and balances.

## What the Multi Model Layer Actually Does

It performs three key functions:

### 1. Cross Model Agreement Checking

When the system infers:
- skills
- semantic equivalents
- transferable skill mappings
- responsibility → skill mappings
- preference interpretations

…it asks two or more models to perform the same inference.

If they agree → inference accepted. If they disagree → inference flagged for review or discarded.

This prevents:
- hallucinated skills
- over confident inferences
- model specific bias

### 2. Cross Model Scoring Validation

The scoring engine itself is deterministic, but the inputs (semantic expansions, equivalence mappings) come from models.

So we do:
- Model A expands skills
- Model B expands skills
- Compare expansions
- Only accept intersections or high confidence overlaps

This stabilises the semantic layer.

### 3. Bias Divergence Detection

Models have different demographic biases.

If:
- Model A consistently scores older candidates lower
- Model B does not

…that’s a red flag.

The multi model layer can detect:
- model specific demographic skew
- model drift over time
- inconsistent treatment of groups

This is essential for fairness.

## How It Works in Practice

Here’s the workflow:

### Step 1 — Candidate profile comes in

Two models independently:
- parse CV
- infer skills
- map responsibilities
- identify transferable skills

### Step 2 — Compare outputs

If both models infer “system design” → accept. If only one does → flag as “low confidence” or discard.

### Step 3 — Semantic expansion

Two models expand:
- “PostgreSQL” → “Relational DB”
- “React” → “Frontend Frameworks”

Only accept expansions both models agree on.

### Step 4 — Scoring

Scoring is deterministic, but uses the validated expansions.

### Step 5 — Bias monitoring

If Model A and Model B disagree systematically for a demographic group → bias detected.

### Step 6 — Explanation

The explanation generator logs:
- which model outputs were used
- where disagreement occurred
- how disagreements were resolved

This is transparency at a level no hiring system has ever offered.

**Why This Is So Important**

It prevents:
- model hallucination
- model drift
- model bias
- over reliance on a single vendor
- silent regressions
- fairness regressions

It also makes the protocol:
- future proof
- model agnostic
- vendor neutral
- auditable

*This is how we build a standard, not a product.*