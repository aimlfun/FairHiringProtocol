# Scoring

This is the part that determines whether the whole system actually works in the real world, or whether it becomes another biased, opaque black box. 
This must be auditable, deterministic, transparent, and fair.

Let’s break this into two major components:

1. Scoring (the “fit” engine)
2. Bias Correction (the “fairness” engine)

These two work together. Scoring determines fit, and bias correction ensures that fit isn’t distorted by structural inequality.

---

# 1. SCORING — The Fair, Deterministic Fit Engine

The scoring pipeline has five components:
- Must Have Skills Score
- Nice to Have Skills Score
- Transferable Skill Compensation
- Experience Relevance Score
- Preference Alignment Score

Each is computed separately, logged separately, and included in the Match Explanation.

Let’s break them down.

## 1.1 Must Have Skills Score (binary, fairness critical)

Rule: If any must have skill is not satisfied, the candidate is rejected with a clear explanation.

Why: This prevents companies from rejecting candidates for vague reasons. It also prevents the system from recommending candidates who cannot do the job.

How to evaluate a must have skill:

A must have skill is satisfied if:
- the candidate has the skill **OR**
- the candidate has a **semantic equivalent** skill OR
- the candidate has a **transferable skill** that the ontology marks as a valid substitute **AND**
- the candidate’s proficiency meets or exceeds the required level

This is where fairness enters: semantic equivalence and transferable skills prevent exclusion of:
- older workers with legacy titles
- career changers
- self taught candidates
- people who don’t know the “right” buzzwords

Score:
- If all must haves satisfied → `must_have_score = 1`
- If any must have fails → match_status = `rejected_must_have`

## 1.2 Nice to Have Skills Score (weighted, flexible)

Each nice to have skill has a weight (`0.0`–`1.0`).

Score formula: `"nice_to_have_score"=∑("weight"×"match")`

Where match is:
- `1.0` if skill is present
- `0.5` if a semantic equivalent is present
- `0.25` if a transferable skill partially covers it
- `0.0` if not present

This is where the system rewards breadth without punishing people who didn’t follow a traditional path.

## 1.3 Transferable Skill Compensation (the fairness multiplier)

This is the part that makes the system *radically fairer* than anything that exists today.

**Why:** Transferable skills are the great equalizer. They allow:
- older workers
- career changers
- self taught candidates
- people from non traditional backgrounds

…to compete on capability, not pedigree.

**How it works:**

For each missing nice to have skill, the system checks:
- does the candidate have a transferable skill that the ontology marks as compensatory?

If yes, add a compensation factor: `"transferable_compensation"=∑("compensation_weight")`

Where compensation_weight is typically `0.1`–`0.3` per skill.

This is logged transparently.

## 1.4 Experience Relevance Score (responsibility based, not title based)

Traditional systems use job titles. We use responsibilities.

How it works:

For each job responsibility:
- check if the candidate has performed a similar responsibility
- check if they’ve demonstrated the underlying skills
- check if they’ve done it in projects, not just jobs

Score: `"experience_relevance"="responsibilities_matched" /"total_responsibilities"`

This is fair because:
- it doesn’t penalize people with non linear careers
- it doesn’t reward inflated job titles
- it recognizes project based experience

## 1.5 Preference Alignment Score (mutual fit)

Matching is not one sided.

Factors:
- work mode alignment
- salary alignment
- industry alignment
- company size alignment
- career goals alignment

Score: `"preference_score"="aligned_preferences" /"total_preferences" `

This prevents mismatches and respects candidate agency.

## 1.6 Final Raw Score (before fairness correction)

`raw_score=0.40×"nice_to_have_score"+0.25×"experience_relevance"+0.20×"transferable_compensation"+0.15×"preference_score"`

Weights are adjustable by governance, but the structure is fixed.

---

# 2. BIAS CORRECTION — The Fairness Immune System

This is where the system actively prevents discrimination.

Bias correction has four components:
- **Skew Detection**
- **Protected Attribute Monitoring
- **Skew Detection**
- **Correction Factors**
- **Transparency Logging**

Let’s break them down.

# 2.1 Protected Attribute Monitoring (never used in scoring)

The system tracks (optionally provided):
- age range
- gender
- ethnicity
- disability
- socioeconomic background
- education level

These attributes are never used to compute fit. They are used only to detect bias.

# 2.2 Skew Detection (statistical fairness checks)

For each protected attribute, the system checks:
- Are candidates from group X being recommended less often than expected?
- Are they being rejected at must have stage disproportionately?
- Are they receiving lower raw scores?

We use:
- demographic parity
- equal opportunity
- disparate impact ratio

If any metric falls below threshold (e.g., `0.8`), bias is detected.

# 2.3 Correction Factors (fairness adjustments)

If bias is detected, the system applies a correction factor: `"corrected_score"="raw_score"×"fairness_multiplier" `

Where `fairness_multiplier` is typically between `1.05` and `1.25`.

This is not “reverse discrimination.” It is **bias compensation** — correcting for systemic skew in the data.

Every correction is logged.

# 2.4 Transparency Logging (the accountability layer)

The **Match Explanation** includes:
- whether bias was detected
- which group was affected
- what correction was applied
- why
- how much
- which fairness metric triggered it

This is the opposite of a black box.

Putting it all together

The final score is: `"final_score"="corrected_score" `

And the **Match Explanation** shows:
- raw score
- correction factor
- final score
- full reasoning

This is how we build a system that is:
- fair
- transparent
- auditable
- explainable
- trustworthy

*And it’s how we upend the recruitment industry without replicating its biases.*