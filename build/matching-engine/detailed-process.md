# Design the Matching Engine Architecture (modules + data flow + internal APIs)

Provides:
- 	a blueprint for implementation
- 	a blueprint for contributors
- 	a blueprint for audits
- 	a blueprint for regulators
- 	a blueprint for companies
- 	a blueprint for candidates


# 1. High-level data flow

End to end, a single match looks like this:

1.	Input ingestion
	-	Candidate Profile (canonical `JSON`)
	-	Job Brief (canonical `JSON`)

2.	Normalization

3.	Multi Model Inference

4.	Semantic Expansion

5.	Constraint Evaluation

6.	Scoring

7.	Bias Engine

8.	Explanation Generation

9.	Persist + Expose
	-	Match result
	-	Explanation
	-	Audit trace

Everything emits traces; the explanation generator is just a structured reducer over those traces.

# 2. Core modules and responsibilities

## 2.1 Normalizer

Responsibility: Take arbitrary input → produce valid FHP schemas.

Input:
- 	Raw candidate data (CV, profile, form)
- 	Raw job data (JD, ATS export, form)

Output:
- 	`candidate_profile` (canonical `JSON`)
- 	`job_brief` (canonical `JSON`)
- 	`trace_normalization[]`

Key rules:
- 	No inference here, only cleaning + mapping.
- 	All lossy transformations are logged.

## 2.2 Multi-model inference layer

Responsibility: Run multiple models on the same input and produce validated inferences.

Input:
- 	`candidate_profile`
- 	`job_brief`

Output:
- 	`inferred_skills`
- 	`inferred_transferable_skills`
- 	`responsibility_skill_mappings`
- 	`model_raw_outputs`
- 	`trace_inference[]`

Internal:
- 	Applies disagreement rules:
	-	intersection
	-	ontology anchored override
	-	weighted consensus
	-	bias sensitive escalation
	-	human review flagging

## 2.3 Semantic expander

Responsibility: Turn concrete skills/experience into semantic equivalents using ontology + validated inferences.

Input:
- 	`candidate_profile`
- 	`job_brief`
- 	`inferred_*`
- 	`ontology`

Output:
- 	`expanded_candidate_skills`
- 	`expanded_job_requirements`
- 	`expanded_responsibilities`
- 	`trace_semantic_expansion[]`

Key rule: No expansion without either:
- 	ontology support, or
- 	multi model agreement.

## 2.4 Constraint evaluator

Responsibility: Hard filters with full explanation.

Input:
- 	`candidate_profile`
- 	`job_brief`
- 	`expanded_*`

Output:
- 	`constraints_passed`: `boolean`
- 	`constraint_details[]`
- 	`trace_constraints[]`

Examples:
- 	location
- 	work mode
- 	salary band
- 	legal/work authorization

If `constraints_passed` = `false`, the pipeline can short circuit—but still must produce a full explanation.

## 2.5 Scoring engine

Responsibility: Deterministic fit scoring.

Input:
- 	`candidate_profile`
- 	`job_brief`
- 	`expanded_*`
- 	`responsibility_skill_mappings`

Output:
- 	`must_have_score`
- 	`nice_to_have_score`
- 	`transferable_compensation`
- 	`experience_relevance`
- 	`preference_score`
- 	`raw_score`
- 	`trace_scoring[]`

Key rule: No model calls here. Pure logic, fully spec’d in `scoring-spec.md`.

## 2.6 Bias engine

Responsibility: Detect and correct bias; log everything.

Input:
- 	`raw_score`
- 	protected attributes (if provided)
- 	historical metrics / aggregates

Output:
- 	`fairness_multiplier`
- 	`final_score`
- 	`bias_correction_applied`: `boolean`
- 	`bias_metrics_snapshot`
- 	`trace_bias[]`

**Key rule: Protected attributes are *only used here*, *never upstream*.**

## 2.7 Explanation generator

Responsibility: Reduce all traces into a structured explanation + human summary.

Input:
- 	`all trace_*[]`
- 	`raw_score`
- 	`final_score`
- 	`match_status`

Output:
- 	`match_explanation` (`JSON`, matches schema)
- 	`candidate_view_summary`
- 	`company_view_summary`

Key rule: If something can’t be explained, it must not influence the outcome.

## 2.8 Audit logger

Responsibility: Persist everything needed for audits and reproducibility.

Input:
- 	inputs
- 	traces
- 	explanation
- 	scores
- 	protocol versions

Output:
- 	append only audit record

# 3. Internal contracts (what each module gets/returns)

Keep it boring and explicit—this is what makes it implementable.

Normalizer

- 	Input: raw candidate/job payloads

- 	Output:
	-	`candidate_profile`: CandidateProfile
	-	`job_brief`: JobBrief
	-	`trace_normalization[]`

Multi-model inference

- 	Input: `candidate_profile`, `job_brief`

- 	Output:
	-	`inferred_skills[]`
	-	`inferred_transferable_skills[]`
	-	`responsibility_skill_mappings[]`
	-	`trace_inference[]`

Semantic expander

- 	Input: above + ontology

- 	Output:
	-	`expanded_candidate_skills[]`
	-	`expanded_job_requirements[]`
	-	`expanded_responsibilities[]`
	-	`trace_semantic_expansion[]`

Constraint evaluator

- 	Input: candidate, job, expanded data

- 	Output:
	-	`constraints_passed`: `boolean`
	-	`constraint_details[]`
	-	`trace_constraints[]`

Scoring engine

- 	Input: candidate, job, expanded data, mappings

- 	Output:
	-	component scores
	-	`raw_score`
	-	`trace_scoring[]`

Bias engine
- 	Input: `raw_score`, protected attributes, historical stats

- 	Output:
	-	`final_score`
	-	`fairness_multiplier`
	-	`bias_correction_applied`
	-	`trace_bias[]`

Explanation generator
- 	Input: all traces + scores + status

- 	Output:
	-	 `match_explanation`
	-	`candidate_summary`
	-	`company_summary`

# 4. Execution model: explainability-first

Two hard rules:
1.	Every module must emit a trace for every decision.
2.	No module may influence the outcome without a corresponding trace entry.

That gives it:
- 	deterministic behaviour
- 	full replayability
- 	trivial audits
- 	easy debugging
- 	rock solid explanations

# 5. Versioning

Every match record stores:
- 	protocol_version
- 	scoring_version
- 	bias_version
- 	ontology_version
-	models_used (ids/versions)
