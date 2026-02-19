# Fair Hiring Protocol — Bias Correction Specification

This document defines how FHP detects and corrects bias.

Bias correction ensures **equal treatment**, not equal outcomes.

---

# 1. Protected Attributes

Used only for bias monitoring:

- age range  
- gender  
- ethnicity  
- disability  
- socioeconomic background  
- education level  

Never used in scoring.

---

# 2. Bias Metrics

Bias is evaluated using:

## 2.1 Disparate Impact Ratio (DIR)

`DIR = selection_rate(group) / selection_rate(reference_group)`

Threshold: DIR < 0.80 triggers review.

## 2.2 Equal Opportunity Difference (EOD)

`EOD = P(recommended | qualified, group A) - P(recommended | qualified, group B)`
Threshold: |EOD| > 0.10 triggers review.

## 2.3 Score Distribution Skew (SDS)

Cohen’s d:

`d = (μA - μB) / σpooled`

Threshold: |d| > 0.35 triggers review.

---

# 3. Conditional Parity (Intra Group Fairness)

Groups are evaluated **against themselves**, not each other.

This avoids unrealistic expectations based on population size.

---

# 4. Correction Factors

If bias is detected:

`corrected_score = raw_score × fairness_multiplier`

Typical multiplier: 1.05–1.25.

Proportional to severity.

---

# 5. Transparency Requirements

Match explanations must include:

- whether correction was applied  
- which metric triggered it  
- metric values  
- affected group  
- multiplier applied  

---

# 6. Drift Detection

If bias persists:

- job is flagged  
- company notified  
- governance alerted  
- job may be paused  

---

This specification is binding for all FHP compliant systems.
