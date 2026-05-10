# Skill Ontology — Mapping Rules

This document defines how skills, responsibilities, and transferable capabilities are mapped within the Fair Hiring Protocol (FHP).

The ontology ensures consistent, semantic matching across roles, industries, and experience types.

---

# 1. Purpose

- Normalize skill names  
- Define semantic equivalence  
- Define hierarchical relationships  
- Define transferable skill compensation rules  
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
- **aliases** (e.g., “JS” → “JavaScript”)  
- **equivalents** (e.g., “PostgreSQL” ↔ “Relational Databases”)  
- **related skills** (e.g., “React” → “Frontend Frameworks”)  

Equivalence is used for:
- must have evaluation  
- nice to have scoring  
- explanation generation  

---

# 4. Transferable Skill Compensation Rules

Transferable skills may compensate for missing domain skills.

Examples:
- “mentoring” compensates for “team leadership”  
- “system design” compensates for “architecture experience”  
- “communication” compensates for “stakeholder management”  

Compensation weights are defined in the ontology.

---

# 5. Responsibility → Skill Mapping

Responsibilities in job briefs map to underlying skills.

Example:
- “own production reliability” → on call, monitoring, incident response  
- “design backend services” → API design, system design, Java/Spring  

This mapping supports experience relevance scoring.

---

# 6. Versioning

The ontology is versioned independently:
- MINOR updates for new skills  
- PATCH updates for corrections  
- MAJOR updates require governance approval  

---

# 7. Contribution Rules

All ontology changes must:
- be evidence based
- include examples
- include equivalence justification
- undergo TWG review

---

# The ontology is a shared language for fair hiring. It must evolve carefully and transparently.
