# FHP Scoring Formula Specification

**Version:** 1.0.0-draft  
**Status:** Draft — awaiting TWG review  
**Spec file:** `specs/scoring-spec.md`

---

## 1. Purpose

This document defines the mathematical scoring model used by the FHP matching pipeline. The scoring model produces a single normalised composite score (0.0–1.0) for every candidate–job pair that clears the constraint satisfaction stage.

The scoring model must be:
- **Deterministic** — the same inputs always produce the same output
- **Explainable** — every term in the formula maps to a human-readable explanation
- **Auditable** — all intermediate values are recorded in the trace schema
- **Bias-aware** — scores are computed before and after bias correction, and both values are stored

---

## 2. Pipeline position

Scoring occurs across four pipeline stages. Each stage produces intermediate values that feed the next:

```
Stage 3: Constraint Satisfaction  →  pass/fail gate (no score produced)
Stage 4: Skill Scoring            →  S_skill
Stage 5: Transferable Skill Comp  →  S_transfer (adjusts S_skill)
Stage 6: Preference Alignment     →  S_pref
                                  →  composite pre-correction score C
Stage 7: Bias Detection           →  bias flags
Stage 8: Bias Correction          →  composite post-correction score C'
```

---

## 3. Definitions

| Symbol | Meaning |
|--------|---------|
| `M` | Set of `must_have` skills in the job brief |
| `N` | Set of `nice_to_have` skills in the job brief |
| `m` | Number of must_have skills: `|M|` |
| `n` | Number of nice_to_have skills: `|N|` |
| `P(s)` | Candidate's proficiency level for skill `s` (numeric, see §3.1) |
| `R(s)` | Required minimum proficiency for skill `s` (numeric) |
| `w_m` | Weight assigned to the must_have skill component (default: 0.55) |
| `w_n` | Weight assigned to the nice_to_have skill component (default: 0.25) |
| `w_p` | Weight assigned to the preference alignment component (default: 0.20) |
| `δ` | Bias correction delta (signed, from Stage 8) |

Weights must satisfy: `w_m + w_n + w_p = 1.0`

### 3.1 Proficiency numeric mapping

The FHP proficiency scale maps to numeric values as follows. The spacing is intentionally non-linear: the gap between `practitioner` and `proficient` is wider than adjacent gaps, reflecting that this transition — from knowing a skill to being reliably productive — is the most significant in practice.

| Level | Numeric value |
|-------|--------------|
| `aware` | 0.20 |
| `practitioner` | 0.45 |
| `proficient` | 0.70 |
| `expert` | 0.87 |
| `authority` | 1.00 |

---

## 4. Stage 4: Skill Scoring

### 4.1 Per-skill score

For each skill `s`, compute a per-skill match score `q(s)`:

```
If the candidate does not hold skill s at all:
    q(s) = 0.0

If the candidate holds skill s:
    If P(s) >= R(s):
        q(s) = 1.0                          ← requirement fully met
    Else:
        q(s) = P(s) / R(s)                  ← partial credit for adjacent proficiency
```

Partial credit is intentional and important. A candidate who is `practitioner` in a skill required at `proficient` is not equivalent to one who has no knowledge of the skill at all. Partial credit is bounded at a maximum of `R(s) - 1 step`, meaning a candidate more than one proficiency level below the requirement receives 0.0 (not partial credit). This prevents severely under-qualified candidates from accumulating false partial credit across many skills.

Formally, partial credit only applies when `P(s) = R(s) - 1 step`. Otherwise:

```
If P(s) < R(s) - 1 step:
    q(s) = 0.0
```

### 4.2 Must-have skill score

```
S_must = (1/m) * Σ q(s)  for all s in M
```

A must_have skill with `q(s) = 0.0` contributes 0 to `S_must`. Note: a candidate who has zero score on any single `must_have` skill is eliminated at Stage 3 (constraint satisfaction) before scoring is reached. By Stage 4, all must_have skills have `q(s) > 0`.

### 4.3 Nice-to-have skill score

```
S_nice = (1/n) * Σ q(s)  for all s in N
```

If the job brief has no nice_to_have skills (`n = 0`), then `S_nice = 1.0` and `w_n` is redistributed proportionally to `w_m` and `w_p`. Specifically:

```
w_m' = w_m + (w_n * w_m / (w_m + w_p))
w_p' = w_p + (w_n * w_p / (w_m + w_p))
w_n' = 0
```

---

## 5. Stage 5: Transferable Skill Compensation

The FHP Skill Ontology defines transferable skill relationships. Where a candidate lacks a required skill but holds a skill the ontology identifies as transferable, a compensation score is computed.

### 5.1 Transfer score

For each unmatched skill `s` (where `q(s) = 0` after Stage 4), check the ontology for transfer relationships. If a transferable skill `t` is found:

```
q_transfer(s) = ontology_transfer_weight(t → s) * P(t)
```

`ontology_transfer_weight` is defined in the ontology for each transfer relationship (range 0.0–1.0). Transfer never yields a higher score than direct proficiency would.

Transfer scores cap at 0.6 regardless of the computed value. Transferred skills can make a candidate competitive but cannot make them fully equivalent to a direct match — the cap encodes this.

### 5.2 Applying compensation

```
q_final(s) = max(q(s), q_transfer(s))
```

Recompute `S_must` and `S_nice` using `q_final` values.

---

## 6. Stage 6: Preference Alignment

The preference alignment score measures how well the job's concrete attributes match the candidate's stated preferences. It is not a measure of enthusiasm — it is a compatibility measure on verifiable attributes.

### 6.1 Preference components

Three sub-components are evaluated:

**a) Salary alignment — `A_salary`**

```
If job salary range overlaps with candidate salary minimum:
    A_salary = 1.0
If job maximum < candidate minimum:
    A_salary = 0.0   (hard incompatibility — candidate would need to take a pay cut)
If job minimum > candidate preferred:
    A_salary = 1.0   (above expectations — full score)
```

**b) Work mode alignment — `A_mode`**

```
If job work_mode is in candidate's preferred work_modes:
    A_mode = 1.0
Else:
    A_mode = 0.0
```

Work mode is a hard preference in FHP. A remote-only candidate matched to an on-site role creates a bad outcome for both parties. Unlike skills, there is no partial credit.

**c) Location alignment — `A_location`**

```
If job location is compatible with candidate's location preferences (accounting for remote permissions):
    A_location = 1.0
Else:
    A_location = 0.0
```

Note: location incompatibility that is hard (e.g. visa/right to work) should be caught at Stage 3 constraint satisfaction. `A_location` at this stage covers preference, not legal eligibility.

### 6.2 Preference score

```
S_pref = (A_salary + A_mode + A_location) / 3
```

### 6.3 Missing preference data

If a candidate has not supplied preference data (e.g. did not specify salary), the corresponding sub-component defaults to `0.5` (neutral), not `0.0`. Missing preferences are not penalised.

---

## 7. Composite score (pre-correction)

```
C = (w_m * S_must) + (w_n * S_nice) + (w_p * S_pref)
```

With default weights:

```
C = (0.55 * S_must) + (0.25 * S_nice) + (0.20 * S_pref)
```

`C` is in the range [0.0, 1.0].

---

## 8. Stage 8: Bias correction

The bias correction delta `δ` is computed by the bias correction layer (see `bias-correction-spec.md`) and applied as:

```
C' = clamp(C + δ, 0.0, 1.0)
```

Where `clamp(x, min, max)` ensures the corrected score stays within [0.0, 1.0].

`δ` may be positive (upward correction) or negative (downward correction). Both `C` and `C'` are stored in the match explanation and the trace. `δ = 0` when no correction is applied.

---

## 9. Match threshold

A candidate is surfaced to the employer (decision = `matched`) when:

```
C' >= MATCH_THRESHOLD
```

`MATCH_THRESHOLD` is a governance-controlled constant, currently `0.60`.

Candidates with `0.50 <= C' < 0.60` receive decision = `borderline` and are flagged for human review if the employer opts into borderline review mode.

Candidates with `C' < 0.50` receive decision = `not_matched`.

---

## 10. Weight governance

The default weights (`w_m = 0.55`, `w_n = 0.25`, `w_p = 0.20`) and the `MATCH_THRESHOLD` (`0.60`) are **governance-controlled constants**. They may not be changed by the Technical Working Group alone. Any change requires a full FHP-P proposal, fairness impact assessment, and Protocol Council vote.

Implementations must not expose these values as configuration to companies or operators. Allowing companies to adjust weights would allow them to silently discriminate by re-weighting attributes that correlate with protected characteristics.

---

## 11. Worked example

**Job requires:**
- `fhp:skill:python` at `proficient` (must_have) → R = 0.70
- `fhp:skill:sql` at `practitioner` (must_have) → R = 0.45
- `fhp:skill:kubernetes` at `aware` (nice_to_have) → R = 0.20
- Salary: £60k–£80k annual, hybrid, London

**Candidate declares:**
- `fhp:skill:python` at `proficient` → P = 0.70
- `fhp:skill:sql` at `practitioner` → P = 0.45
- `fhp:skill:docker` at `proficient` → P = 0.70 (ontology: docker → kubernetes, weight 0.7)
- Salary minimum: £55k, preferred: £70k; hybrid preferred; London

**Stage 4:**
```
q(python) = 1.0   (0.70 >= 0.70)
q(sql)    = 1.0   (0.45 >= 0.45)
q(kubernetes) = 0.0  (skill absent)

S_must = (1.0 + 1.0) / 2 = 1.0
S_nice = 0.0 / 1 = 0.0
```

**Stage 5:**
```
q_transfer(kubernetes) = 0.7 * 0.70 = 0.49, capped at min(0.49, 0.6) = 0.49
q_final(kubernetes) = max(0.0, 0.49) = 0.49

S_nice = 0.49 / 1 = 0.49
```

**Stage 6:**
```
A_salary   = 1.0  (£60k–£80k overlaps £55k minimum; £70k is within range)
A_mode     = 1.0  (hybrid matches hybrid preference)
A_location = 1.0  (London matches London)

S_pref = 3.0 / 3 = 1.0
```

**Composite:**
```
C = (0.55 * 1.0) + (0.25 * 0.49) + (0.20 * 1.0)
C = 0.55 + 0.1225 + 0.20
C = 0.8725
```

No bias correction triggered. `C' = 0.8725`. Decision: `matched`.
