# Concrete Example: end to end example (candidate + job → scoring → bias check → explanation).

# 1. Worked example: from candidate + job to transparent match

## 1.1 The candidate (simplified)

**Profile (key bits):**

- Skills.self_declared: `["Java", "Spring Boot", "PostgreSQL", "Docker", "Kubernetes"]`
- Transferable skills: `["mentoring", "stakeholder communication", "system design"]`
- Experience.roles: `"Senior Backend Engineer, 6 years, built APIs, led small team, did on call."`
- Preferences:
	- work_mode: `["remote", "hybrid"]`
	- employment_type: `["full_time"]`
	- salary: `min 70k, preferred 80k (GBP)`
- Constraints:
	- availability: `notice period 4 weeks`
	- location: `["UK"]`
	- willing_to_relocate: `false`
	- age_range: `45_54`
	- gender: `male`

## 1.2 The job brief (key bits)

- core.title: `Senior Backend Engineer`
- requirements.skills.must_have: `[ {"name": "Java", "proficiency_required": "confident"}`, `{"name": "Spring Boot"}`,  `{"name": "Relational databases"}` ]`
- requirements.skills.nice_to_have: `[ {"name": "Kubernetes", "weight": 0.6}, - {"name": "AWS", "weight": 0.4}]`
- responsibilities: `[ "design and build backend services" -" own production reliability", "mentor junior engineers"]`
- constraints:
	- work_mode: [`hybrid`]
	- employment_type: [`full_time`]
	- salary: `70k–80k GBP`
	- location: [`London, UK`]
- preferences:
	- culture_keywords: `["ownership", "mentoring", "collaboration"]`

## 1.3 Matching pipeline

### Step 1 – Normalization & semantic expansion

- “`Relational databases`” ↔ candidate’s “`PostgreSQL`” → match.
- “`Mentor junior engineers`” ↔ candidate’s “`mentoring`” + prior leadership.
- “`Backend services`” ↔ `Java` + `Spring Boot` + `APIs` in experience.

### Step 2 – Constraint satisfaction
- Work mode: job = `hybrid`, candidate = `remote/hybrid` → passes.
- Location: job = `London`, candidate = `UK`, no relocation → passes (commutable or remote hybrid).
- Salary: `75–85k`, candidate `min 70k`, `preferred 80k` → passes.
- Availability: `4 weeks notice`, no hard constraint → passes.

No constraint failure → candidate stays in.

### Step 3 – Must have skills
- `Java` → present, proficiency “confident” → satisfies.
- `Spring Boot` → present.
- `Relational DB` → `PostgreSQL` → semantic match.
→ All must haves satisfied → must_have_score = `1`.

### Step 4 – Nice to have skills
- `Kubernetes` (`0.6` weight) → present → full match.
- `AWS` (`0.4` weight) → not present, but candidate has `Docker`/`Kubernetes`; ontology may treat this as partial infra familiarity.

Let’s say:
- `Kubernetes`: match = `1.0` → contributes `0.6`
- `AWS`: partial match via cloud native experience → `0.5` → contributes `0.2`
→ nice_to_have_score = `0.6` + `0.2` = `0.8`.

### Step 5 – Transferable skill compensation

Job wants `mentoring`, `ownership`, `collaboration`.

Candidate has:
- `mentoring`
- `stakeholder communication`
- `system design`
- `led a small team`

Ontology marks these as compensating for “`team leadership`”, “`mentoring`”, “`cross functional collaboration`”.

Say we add `0.2` total as compensation:

→ transferable_compensation = `0.2`.

### Step 6 – Experience relevance

Responsibilities vs experience:
- `design` and `build backend services` → yes
- `own production reliability` → yes (on call, incident response)
- `mentor junior engineers` → yes

3/3 responsibilities matched → experience_relevance = `1.0`.

### Step 7 – Preference alignment
- work_mode: `hybrid` ∈ candidate’s [`remote`, `hybrid`] → aligned
- salary: `within preferred range` → aligned
- culture: `mentoring` + `collaboration` → aligned with candidate’s narrative/skills

Let’s say 4/4 aligned → `preference_score` = `1.0`.

### Step 8 – Raw score
Using the earlier weighting:
- nice_to_have_score: `0.8`
- experience_relevance: `1.0`
- transferable_compensation: `0.2`
- preference_score: `1.0`

`raw_score=0.40×0.8+0.25×1.0+0.20×0.2+0.15×1.0`
`=0.32+0.25+0.04+0.15=0.76`

→ raw_score = `0.76`.

## 1.4 Bias check & correction

Now we look at fairness metrics.

Suppose across many matches, we see:
- age 25–34: average raw score `0.74`
- age 35–44: average raw score `0.75`
- age 45–54: average raw score `0.73`

Differences are tiny; no skew beyond threshold. No disparate impact, no equal opportunity gap, no score skew.

→ No correction needed. → `fairness_multiplier` = `1.0` → `final_score` = `0.76`.

If we had seen older candidates systematically scoring lower for equivalent profiles, we might apply e.g. `1.05`–`1.10` multiplier and log it.

## 1.5 Match explanation (what the candidate and company see)

```
Match status: matched Final score: 0.76

Key explanation points (candidate view):

Must have skills: all satisfied
- Java: satisfied (self declared, 6 years)
- Spring Boot: satisfied (self declared, used in current role)
- Relational DB: satisfied via PostgreSQL

Nice to have skills:
- Kubernetes: matched (self declared)
- AWS: partially matched via cloud native experience (Docker/Kubernetes)

Experience relevance:
- You’ve already done: backend services, production ownership, mentoring.

Preferences:
- Work mode, salary, and culture all aligned.

Bias correction:
- No bias correction applied; your group is being treated consistently.
```

Company view adds:

`This candidate has directly relevant experience and strong alignment with your mentoring and reliability needs. Gaps: no direct AWS, but strong Kubernetes/cloud native background.`

*That’s the kind of explanation that convinces both humans and regulators.*