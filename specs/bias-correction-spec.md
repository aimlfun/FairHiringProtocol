# FHP Bias Correction Specification

**Version:** 1.0.0-draft  
**Status:** Draft — awaiting Fairness Oversight Board review  
**Spec file:** `specs/bias-correction-spec.md`

---

## 1. Purpose and philosophy

The FHP bias correction layer detects and corrects for systematic scoring disparities across demographic cohorts. It operates within the matching pipeline (Stages 7–8) and its output — the bias correction delta `δ` — is applied to individual match scores.

**What this layer does:**  
Detects when equally qualified candidates from different cohorts are receiving systematically different scores, and corrects for it.

**What this layer does not do:**  
Enforce quotas. Guarantee equal outcomes. Override the fundamental skill matching logic. A candidate who genuinely does not meet the role's requirements is not matched, regardless of cohort membership.

The principle is **equal treatment, not equal outcomes**. If two candidates have identical skills and identical preferences, they must receive the same score. The bias correction layer exists to enforce that principle at scale, where individual decisions aggregate into systemic patterns.

---

## 2. Definitions

| Term | Definition |
|------|-----------|
| **Cohort** | A group of candidates sharing a protected characteristic value (e.g. all candidates in the `gender_group:A` cohort). Cohort labels are opaque — the matching engine never processes raw demographic attributes. |
| **Reference cohort** | The cohort used as the baseline for comparison. Selected as the largest cohort by match volume within the current computation window. |
| **Skill parity** | Two candidates or cohorts are considered skill-equivalent when they have the same distribution of skills at equivalent proficiency levels. |
| **Computation window** | The rolling 30-day window of match events used to compute fairness metrics. The 30-day default balances statistical power against recency. |

---

## 3. The three metrics

### 3.1 Disparate Impact Ratio (DIR)

**What it measures:** Whether candidates from one cohort are being selected (matched) at a substantially different rate than another.

```
DIR = match_rate(comparison_cohort) / match_rate(reference_cohort)

match_rate(cohort) = matched_count(cohort) / total_evaluated(cohort)
```

**Bounds:** `0.8 <= DIR <= 1.25`

The lower bound of 0.8 is the "80% rule" from US employment law and is widely accepted in fairness literature. The upper bound of 1.25 is the reciprocal of 0.8, ensuring the metric is symmetric — over-correction is as problematic as under-correction.

**When it triggers bias correction:**  
`DIR < 0.8` (comparison cohort is being under-selected relative to the reference cohort)

DIR above 1.25 is also flagged for review but does not trigger automatic correction — it is more likely to indicate data anomalies or voluntary over-representation than systematic bias.

---

### 3.2 Equal Opportunity Difference (EOD)

**What it measures:** Whether skill-qualified candidates from different cohorts are being matched at equal rates. This metric controls for underlying skill differences — it only compares candidates who meet the job's must_have requirements.

```
TPR(cohort) = matched_count(cohort ∩ qualified) / total_qualified(cohort)

EOD = TPR(group_A) - TPR(group_B)
```

A "qualified" candidate is one who passed Stage 3 constraint satisfaction (all must_have skills met at minimum proficiency).

**Bounds:** `|EOD| < 0.05`

**When it triggers bias correction:**  
`|EOD| >= 0.05`

The direction of correction is towards the group with the lower TPR (their scores are adjusted upward by the correction magnitude).

---

### 3.3 Score Distribution Skew (SDS)

**What it measures:** Whether the full score distribution — not just match/no-match — is systematically shifted for one cohort relative to another, after controlling for skill parity. This is the most sensitive of the three metrics and can detect subtle bias before it becomes visible in match rates.

```
SDS = mean_score(comparison_cohort | skill_parity_controlled)
    - mean_score(reference_cohort  | skill_parity_controlled)
```

Skill parity control: candidates are grouped into skill-equivalent buckets. SDS is computed as the weighted mean of within-bucket score differences. This ensures SDS measures score disparity, not skill disparity.

**Bounds:** `|SDS| < 0.03`

**When it triggers bias correction:**  
`|SDS| >= 0.03`

---

## 4. Bias detection (Stage 7)

Stage 7 runs after the composite score `C` is computed but before any correction is applied.

### 4.1 Inputs

- The candidate's cohort memberships (provided by the platform's anonymised cohort service — never raw demographics)
- The pre-correction composite score `C`
- The current fairness metrics for the relevant job and company (from the most recent nightly computation)

### 4.2 Detection logic

```
for each metric in [DIR, EOD, SDS]:
    if metric is in_breach for the candidate's cohort:
        flag metric as triggered
        compute correction_magnitude for this metric (see §5)
```

If no metrics are triggered: `bias_triggered = false`, proceed to Stage 8 with `δ = 0`.

If one or more metrics are triggered: `bias_triggered = true`, proceed to Stage 8.

### 4.3 Data sufficiency check

Bias detection requires sufficient data. If the candidate's cohort has fewer than `minimum_cohort_size` (default: 20) match events in the current computation window, bias detection is skipped for that cohort and this is logged in the trace as a warning. This prevents correction based on statistically unreliable signals.

---

## 5. Bias correction (Stage 8)

### 5.1 Correction magnitude

For each triggered metric, a correction magnitude `μ` is computed:

**DIR correction:**
```
μ_DIR = (1.0 - DIR) * CORRECTION_SCALING_FACTOR
```
where `CORRECTION_SCALING_FACTOR = 0.5` (governance-controlled).

The scaling factor ensures correction is proportional — a DIR of 0.75 (25% shortfall below the 0.8 bound) produces a smaller correction than a DIR of 0.50 (a 37.5% shortfall). Full correction is never applied in a single run; the system converges gradually across computation windows.

**EOD correction:**
```
μ_EOD = |EOD| * CORRECTION_SCALING_FACTOR
```

**SDS correction:**
```
μ_SDS = |SDS| * CORRECTION_SCALING_FACTOR
```

### 5.2 Combining multiple triggered metrics

If more than one metric triggers, the delta is the maximum of the individual corrections — not the sum. Summing corrections would risk over-correction when metrics are correlated.

```
δ = max(μ_DIR, μ_EOD, μ_SDS) * correction_direction
```

`correction_direction` is +1 (upward) if the candidate's cohort is the under-represented group, -1 (downward) if over-represented relative to bounds.

### 5.3 Correction cap

`δ` is capped at `±0.15`. No single match event can receive a bias correction larger than 15 percentage points. Corrections larger than this would undermine the integrity of the scoring model — they indicate that the underlying matching logic or job brief requires review rather than individual score correction.

When `|δ| > 0.10`, a governance alert is raised regardless of whether the correction brings the score above or below the match threshold.

### 5.4 Applying the correction

```
C' = clamp(C + δ, 0.0, 1.0)
```

Both `C` and `δ` and `C'` are written to the trace and the match explanation. The correction is never hidden.

---

## 6. Feedback loop to nightly computation

Individual corrections do not immediately update the fairness metrics. The nightly fairness computation job re-reads all match events from the rolling window and recomputes DIR, EOD, and SDS from scratch. This prevents the correction layer from chasing its own tail (self-reinforcing corrections).

If the correction layer has been working correctly, metrics should trend towards their bounds over successive computation windows. If metrics are not improving over 7+ consecutive windows, this triggers a Fairness Oversight Board review.

---

## 7. Governance controls

The following values are governance-controlled constants. They may not be modified by the TWG or by operators. Changes require a full FHP-P proposal:

| Constant | Default | Description |
|----------|---------|-------------|
| `CORRECTION_SCALING_FACTOR` | 0.5 | Controls how aggressively corrections converge |
| `DIR_LOWER_BOUND` | 0.8 | Minimum acceptable DIR |
| `DIR_UPPER_BOUND` | 1.25 | Maximum acceptable DIR |
| `EOD_THRESHOLD` | 0.05 | Maximum acceptable absolute EOD |
| `SDS_THRESHOLD` | 0.03 | Maximum acceptable absolute SDS |
| `CORRECTION_CAP` | 0.15 | Maximum absolute correction per match |
| `MIN_COHORT_SIZE` | 20 | Minimum events for bias detection to activate |
| `GOVERNANCE_ALERT_THRESHOLD` | 0.10 | Correction magnitude that triggers governance alert |

---

## 8. What bias correction cannot fix

The bias correction layer is a downstream safeguard. It cannot fully compensate for:

- **Biased job briefs** — if a job brief lists requirements that correlate with protected characteristics but are not actually necessary for the role, correction treats the symptom, not the cause. The company compliance framework (see `company-compliance.md`) is the primary defence.
- **Ontology gaps** — if the skill ontology does not recognise skills more commonly held by underrepresented groups, transferable skill compensation will fail before bias correction gets a chance to act.
- **Small dataset effects** — with fewer than 20 candidates per cohort, correction cannot reliably activate. New job briefs at new companies are the hardest case.

These limitations are documented here so governance bodies understand what the correction layer reports vs what it silently misses.
