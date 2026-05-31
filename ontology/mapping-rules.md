# Skill Ontology — Mapping Rules

This document defines how skills, responsibilities, and transferable capabilities are mapped within the Fair Hiring Protocol (FHP).

The ontology ensures consistent, semantic matching across roles, industries, and experience types.

---

# 1. Purpose

- Normalize skill names  
- Define semantic equivalence  
- Define hierarchical relationships  
- Define transferable skill compensation rules  
- Define objective proficiency criteria to reduce self-assessment bias  
- Support explainable matching  

---

# 2. Skill Categories

Skills are grouped into categories such as:

- Programming languages  
- Frameworks  
- Tools  
- Cloud platforms  
- Databases  
- Soft skills  
- Transferable skills  
- Domain specific skills  

Each category may contain:
- canonical names  
- aliases  
- equivalents  
- parent/child relationships  

---

# 3. Semantic Equivalence Rules

A skill may have:
- **aliases** (e.g., "JS" → "JavaScript")  
- **equivalents** (e.g., "PostgreSQL" ↔ "Relational Databases")  
- **related skills** (e.g., "React" → "Frontend Frameworks")  

Equivalence is used for:
- must have evaluation  
- nice to have scoring  
- explanation generation  

---

# 4. Transferable Skill Compensation Rules

Transferable skills may compensate for missing domain skills.

Examples:
- "mentoring" compensates for "team leadership"  
- "system design" compensates for "architecture experience"  
- "communication" compensates for "stakeholder management"  

Compensation weights are defined in the ontology.

---

# 5. Responsibility → Skill Mapping

Responsibilities in job briefs map to underlying skills.

Example:
- "own production reliability" → on call, monitoring, incident response  
- "design backend services" → API design, system design, Java/Spring  

This mapping supports experience relevance scoring.

---

# 6. Proficiency Level Assessment

## 6.1 The problem with subjective self-assessment

Self-reported proficiency levels are systematically biased. Research documents:

- **Overconfidence bias (Dunning-Kruger)**: lower-skilled individuals consistently overestimate their ability.
- **Imposter syndrome**: high-skilled individuals — disproportionately neurodivergent candidates, women, and members of underrepresented groups — underestimate their ability.
- **Proxy bias**: candidates interpret "experience" through socially coded proxies (confidence, credential-holding, prior opportunity to perform) rather than actual capability.

If left uncorrected, these biases produce unfair match scores that disadvantage the very populations FHP is designed to protect.

## 6.2 The solution: observable, outcome-based criteria

The ontology defines two tiers of proficiency criteria:

**Tier 1 — Global behavioural anchors** (`proficiency_level_definitions` in `skills.json`)  
Domain-agnostic definitions that apply to every skill. Each level specifies:
- A plain-language `definition`
- A `ui_prompt` — the first-person statement shown to the candidate
- `criteria` — an array of observable, outcome-based statements
- `llm_classification_hint` — a rubric for CV parsing and multi-model inference
- `job_brief_guidance` — shown to hiring managers when selecting a required level

**Tier 2 — Skill-specific `level_criteria`** (per skill in `skills.json`)  
Added to the ~30 most common skills where the global anchors are insufficient. Rendered as a checklist in the candidate UI and as a classification rubric for the LLM pipeline. Skills without `level_criteria` inherit the global anchors.

## 6.3 Criteria design rules

All criteria, whether global or skill-specific, must:

1. **Describe outcomes or behaviours**, not inputs. "Has shipped a Python library used by others" is valid. "Has 3 years of Python experience" is not — years are a proxy, not an outcome.
2. **Reference observable evidence** — something that can appear in a CV, portfolio, or interview. "Understands closures" is unobservable; "Debugs race conditions caused by closure behaviour in production code" is observable.
3. **Avoid gatekeeping proxies**: no degree requirements, certification requirements, or employer prestige signals.
4. **Use plain language** without jargon that penalises candidates who learned the skill outside formal employment.
5. **Not be exhaustive**: a candidate meeting any 2–3 criteria at a level is a reasonable signal for that level. Criteria are not a checklist that must be fully satisfied.

## 6.4 Candidate UI behaviour

When a candidate selects a skill and sets a proficiency level:

1. The UI displays the `ui_prompt` for the selected level as a first-person statement the candidate is implicitly endorsing.
2. Below it, the `level_criteria` array (or global `criteria` if no skill-specific override exists) is rendered as a read-only checklist — "Here is what this level typically looks like."
3. The candidate does **not** need to check boxes; the list is informational, not a form. Its purpose is to anchor their self-assessment to concrete reality rather than feeling.
4. Hovering or tapping an adjacent level shows that level's criteria, allowing comparison.

## 6.5 Company job brief UI behaviour

When a hiring manager sets a required proficiency level for a skill:

1. The UI displays `job_brief_guidance` for the selected level.
2. The same `level_criteria` checklist is shown to help the manager understand what they are actually asking for.
3. This prevents employers from defaulting to "Expert" for roles that genuinely require "Proficient", which is a common source of artificial scarcity.

## 6.6 LLM pipeline usage (CV parsing and job spec normalisation)

When the multi-model inference layer (MMIL) parses a CV or job spec:

1. For each skill mentioned, the model is provided the `llm_classification_hint` for each level and the `level_criteria` array.
2. The model assigns a level based on evidence in the document — language like "led", "owned", "designed for" signals Proficient/Expert; "familiar with", "learning", "studied" signals Aware.
3. For disputed classifications (model confidence below threshold), a second model is queried independently. The lower classification is used as the conservative estimate to avoid inflating candidate scores.
4. The assigned level, the evidence excerpt, and the criteria matched are recorded in the pipeline trace for explainability.

## 6.7 Governance of criteria

Criteria changes follow the same governance process as skill additions (see Section 7). Evidence-based justification is required for any change to a criterion that would move a candidate between levels. The TWG must review and approve changes to `proficiency_level_definitions` as a MINOR version bump; changes to individual skill `level_criteria` may be reviewed as PATCH updates.

---

# 7. Versioning

The ontology is versioned independently:
- MINOR updates for new skills or changes to `proficiency_level_definitions`  
- PATCH updates for corrections or additions to individual skill `level_criteria`  
- MAJOR updates require governance approval  

---

# 8. Contribution Rules

All ontology changes must:
- be evidence based
- include examples
- include equivalence justification
- undergo TWG review
- for criteria: include a bias impact assessment (does the proposed criterion disadvantage any protected group?)

---

# The ontology is a shared language for fair hiring. It must evolve carefully and transparently.
