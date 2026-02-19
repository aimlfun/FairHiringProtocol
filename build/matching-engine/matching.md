# Matching

If the schemas are the vocabulary, the matching pipeline is the grammar that makes the whole thing fair, explainable, and trustworthy.

Let’s walk through the matching pipeline step by step, but with a fairness lens baked into every stage. This is not “AI magic.” It’s a deterministic, auditable process that uses AI only where it improves clarity and reduces bias.

We’ll break it into the eight stages we outlined, but now with depth, mechanics, and fairness guarantees.

---

## 1. Normalization (Make everything structured and comparable)

This is the “cleaning” phase.

**What happens**
- 	Candidate skills → normalized to canonical skill ontology
- 	Job skills → normalized to same ontology
- 	Experience → broken into structured units
- 	Responsibilities → mapped to skills
- 	Preferences → standardized
- 	Constraints → validated

Why it matters for fairness
- 	Removes linguistic bias (“rockstar”, “guru”, “junior ninja”)
- 	Removes prestige bias (job titles don’t matter; skills do)
- 	Removes verbosity bias (long CV ≠ better candidate)

**Output**

Two clean, structured objects:
- 	`normalized_candidate`
- 	`normalized_job`

---

## 2. Semantic Expansion (Understand what skills mean)

This is where the system becomes smarter than keyword matching.

**What happens**

Using the shared skill ontology:
- 	“React” expands to “frontend frameworks”
- 	“AWS Lambda” expands to “serverless”
- 	“Team leadership” expands to “people management”
- 	“Teaching” expands to “mentoring”

Why it matters for fairness
- 	Helps career changers
- 	Helps older workers with legacy titles
- 	Helps people with non traditional backgrounds
- 	Helps candidates who don’t know the “right” buzzwords

**Output**

Two enriched objects:
- 	`expanded_candidate`
- 	`expanded_job`

---

## 3. Constraint Satisfaction (Hard filters — but only fair ones)

This is the only place where candidates can be excluded.

**Allowed constraints**
- 	`location`
- 	`work mode`
- 	`employment type`
- 	`salary`
- 	`availability`
- 	`visa requirements`

**Forbidden constraints**
- 	`age`
- 	`gender`
- 	`ethnicity`
- 	`university`
- 	`years since graduation`
- 	`employment gaps`
- 	`“culture fit”`

**What happens**

If a candidate fails a hard constraint:
- 	they are excluded
- 	but the system logs why
- 	and the candidate sees the explanation

Why it matters for fairness
- 	Prevents silent discrimination
- 	Prevents arbitrary filtering
- 	Ensures companies can’t cheat the protocol

**Output**

*A filtered candidate list with full transparency.*

---

## 4. Skill Matching & Scoring (The core of the match)

This is where the system evaluates fit, not worth.

Scoring components

### 1.	Must have skills
-	binary: satisfied or not
-	if not satisfied → candidate excluded with explanation

### 2.	Nice to have skills
-	weighted contributions
-	semantic equivalents count

### 3.	Transferable skills
-	compensate for missing domain skills
-	especially important for career changers

### 4.	Experience relevance
-	based on responsibilities, not job titles

Why it matters for fairness
- 	Removes prestige bias
- 	Removes title bias
- 	Rewards real capability
- 	Recognizes non traditional experience

**Output**

*A raw score for each candidate.*

---

## 5. Transferable Skill Compensation (The fairness multiplier)

This is where the system corrects for structural inequality.

**What happens**

If a candidate lacks a domain skill but has:
- 	problem solving
- 	leadership
- 	mentoring
- 	communication
- 	adaptability
- 	cross functional collaboration

…they receive a compensation boost.

**Why it matters**

This is the key to:
- 	helping older workers
- 	helping career changers
- 	helping self taught candidates
- 	helping people from underrepresented backgrounds

**Output**

*A fairness adjusted score.*

---

## 6. Preference Alignment (Mutual matching)

Matching is not one sided.

**What happens**

The system checks:
- 	candidate’s preferred work mode
- 	candidate’s preferred industries
- 	candidate’s salary expectations
- 	candidate’s career goals
- 	company’s culture keywords

Why it matters
- 	Prevents mismatches
- 	Respects candidate agency
- 	Reduces wasted interviews

**Output**

*A mutual fit score.*

---

## 7. Bias Detection & Correction (The fairness immune system)

This is where the system actively prevents discrimination.

**What happens**

The system monitors:
- 	recommendation parity
- 	seniority skew
- 	gender skew
- 	age skew
- 	ethnicity skew
- 	disability skew

If the system detects:
- 	“older candidates are being ranked lower”
- 	“women are under recommended for senior roles”
- 	“certain universities dominate the top 10%”

…it automatically:
- 	adjusts scoring
- 	flags the issue
- 	logs the correction
- 	includes the correction in the explanation

Why it matters

This is the difference between:
- 	“bias blind” (which reinforces bias)
- 	bias aware (which corrects bias)

**Output**

*A bias corrected score.*

---

## 8. Explanation Generation (The transparency engine)

Every match and rejection must be explainable.

What the explanation includes
- 	which skills matched
- 	which skills didn’t
- 	which inferred skills helped
- 	which transferable skills compensated
- 	which constraints mattered
- 	how preferences aligned
- 	whether bias correction was applied
- 	which version of the protocol was used

**Why it matters**

This is the foundation of trust.

Candidates see:
- 	why they were matched
- 	why they were rejected
- 	what they can improve

Companies see:
- 	why a candidate is recommended
- 	what strengths they bring
- 	what gaps exist

**Output**

*A structured explanation object.*

---

# Putting it all together

The matching pipeline is:
1.	Normalize
2.	Expand
3.	Constrain
4.	Score
5.	Compensate
6.	Align
7.	Correct
8.	Explain

*This is not “AI magic.” It’s a fair, deterministic, auditable process that uses AI only where it improves clarity and reduces bias.*
