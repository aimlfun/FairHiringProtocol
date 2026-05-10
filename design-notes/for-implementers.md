# Fair Hiring Protocol — Guide for Implementers

This guide explains how to build systems that comply with the Fair Hiring Protocol (FHP).

---

# 1. What You Must Implement

### 1.1 Canonical Schemas
- Candidate Profile  
- Job Brief  
- Match Explanation  

### 1.2 Matching Pipeline
- normalization  
- semantic expansion  
- constraint evaluation  
- scoring  
- bias correction  
- explanation generation  

### 1.3 Fairness Monitoring
- disparate impact  
- equal opportunity  
- score skew  
- drift detection  

---

# 2. What You Must Not Change

- fairness logic  
- bias thresholds  
- scoring structure  
- candidate rights  
- governance rules  

These are canonical.

---

# 3. Reference Implementation

A minimal implementation is provided in `/reference-impl`:
- schema validation  
- scoring engine  
- explanation generator  
- fairness metrics  

You may optimize or extend, but not alter fairness logic.

---

# 4. Multi Model Validation

Implementations must:
- validate matches using ≥2 independent models  
- ensure cross model consistency  
- log discrepancies  

This prevents model specific bias.

---

# 5. Logging Requirements

You must log:
- inputs  
- outputs  
- scores  
- corrections  
- explanations  
- protocol version  

Logs must be exportable for audits.

---

# 6. Security & Privacy

Implementations must:
- minimize data retention  
- avoid surveillance  
- avoid behavioral profiling  
- encrypt sensitive data  

---

FHP is a protocol, not a product.  
Your implementation must uphold its fairness guarantees.
