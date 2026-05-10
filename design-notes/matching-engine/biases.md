# Bias Thresholds

Bias thresholds are one of the most important parts of the entire system. 
They’re the guardrails that prevent the matching engine from drifting into unfair territory, even unintentionally. 
If scoring is the “fit engine,” bias thresholds are the “fairness brakes.”

Let’s define them cleanly, rigorously, and in a way that is:
- statistically sound
- transparent
- auditable
- non gameable
- aligned with the Fair Hiring Protocol

We’ll break this into four parts:
- What bias we measure
- How we measure it
- Thresholds that trigger correction
- How the system responds when thresholds are crossed

This gives us a complete, fair, and enforceable bias monitoring framework.

# 1. What Bias We Measure

We monitor outcomes, not inputs.

Protected attributes (optional, candidate controlled):
- **age range**
- **gender**
- **ethnicity**
- **disability**
- **socioeconomic background**
- **education level**

*These are never used in scoring. They are used only to detect skew.*

We measure bias at three stages:

## A. Constraint Stage

Are certain groups disproportionately failing constraints?

## B. Must Have Stage

Are certain groups disproportionately failing must have skills?

## C. Scoring Stage

Are certain groups receiving lower raw scores?

## D. Recommendation Stage

Are certain groups being recommended less often?

*This multi stage approach prevents hidden bias from slipping through.*

# 2. How We Measure Bias

We use three fairness metrics, each catching a different kind of skew.

## 2.1. Disparate Impact Ratio (DIR)

This is the gold standard in employment law.

`DIR="selection rate of protected group" / "selection rate of reference group"`

If `DIR < 0.8`, bias is likely.

*This catches systemic under recommendation.*

## 2.2. Equal Opportunity Difference (EOD)

Measures whether qualified candidates are treated equally.
`EOD=P("recommended"∣"qualified","group A")-P("recommended"∣"qualified","group B")`

If `|EOD| > 0.10`, bias is likely.

*This catches unfair treatment of equally qualified candidates.*

## 2.3. Score Distribution Skew (SDS)

Checks whether raw scores differ significantly across groups.

We use Cohen’s `d`:

`d=(μ_A-μ_B)/σ_pooled `

If `|d| > 0.35`, bias is likely.

*This catches subtle scoring bias.*

# 3. Thresholds That Trigger Bias Correction

These thresholds are strict, simple, and enforceable.
| Metric	| Threshold | Meaning |
|-------|-----------|---------|
| Disparate Impact Ratio | 0.80	| Protected group is under recommended |
| Equal Opportunity Difference | > 0.10	| Qualified candidates treated unequally |
| Score Distribution Skew | d > 0.35 | Systemic scoring bias |

If any threshold is crossed, bias correction is triggered.

*This is a “fail fast” fairness model.*

# 4. How the System Responds When Bias Is Detected

This is where fairness becomes active, not passive.

## 4.1. Apply a Fairness Multiplier

A correction factor is applied to the raw score:

`corrected_score = raw_score × fairness_multiplier`

Where:
- `1.05` = mild correction
- `1.10` = moderate correction
- `1.20`–`1.25` = strong correction

The multiplier is proportional to the severity of the skew.

*This is not “reverse discrimination.” It is bias compensation — correcting systemic imbalance.*

## 4.2. Log the Correction Transparently

The Match Explanation includes:
- which metric triggered correction
- what the metric value was
- which group was affected
- what multiplier was applied
- why
- how it changed the score

*This is radical transparency.*

## 4.3. Trigger a Fairness Alert

If bias persists across multiple matches:
- the system flags the job brief
- the company is notified
- the governance board is notified
- the job may be temporarily paused

*This prevents companies from gaming the system.*

## 4.4. Update the Fairness Dashboard
The system maintains:
- real time fairness metrics
- historical trends
- group level parity charts
- drift detection

This is the “fairness cockpit.”

**Why This Works**

This framework:
- catches bias early
- corrects it proportionally
- logs everything
- protects candidates
- protects companies
- protects the protocol
- prevents drift
- prevents gaming
- is legally defensible
- is ethically sound

*It’s the opposite of a black box. It’s a fairness engine with headlights, mirrors, and brakes.*