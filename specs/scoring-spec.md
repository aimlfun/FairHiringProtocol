# Fair Hiring Protocol — Scoring Specification

This document defines the canonical scoring algorithm used by all FHP compliant systems.

---

# 1. Overview

Scoring evaluates **fit**, not **worth**.  

It is deterministic, auditable, and transparent.

The scoring pipeline consists of:

1. Must Have Skills  
2. Nice to Have Skills  
3. Transferable Skill Compensation  
4. Experience Relevance  
5. Preference Alignment  
6. Raw Score Calculation  

Bias correction is defined separately.

---

# 2. Must Have Skills

- All must have skills must be satisfied.  
- Satisfaction may come from:  
  - direct skill match  
  - semantic equivalent  
  - transferable skill marked as compensatory  
- Failure of any must have skill results in rejection.

`must_have_score = 1` if all satisfied, else rejection.

---

# 3. Nice to Have Skills

Each nice to have skill has a weight (0.0–1.0).

Match values:
- 1.0 = direct match  
- 0.5 = semantic equivalent  
- 0.25 = transferable compensation  
- 0.0 = no match  

`nice_to_have_score = Σ(weight × match)`

---

# 4. Transferable Skill Compensation

Transferable skills compensate for missing domain skills.

`transferable_compensation = Σ(compensation_weight)`

Typical compensation weight: 0.1–0.3 per skill.

---

# 5. Experience Relevance

Based on responsibilities, not job titles.

`experience_relevance = responsibilities_matched / total_responsibilities`

---

# 6. Preference Alignment

`preference_score = aligned_preferences / total_preferences`

---

# 7. Raw Score

`raw_score = 0.40 × nice_to_have_score + 0.25 × experience_relevance + 0.20 × transferable_compensation + 0.15 × preference_score`

Weights may be updated via governance.

---

This scoring algorithm must be implemented exactly as specified.
