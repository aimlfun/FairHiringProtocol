# FHP Matching Engine — Pipeline Internals

**Version:** 1.0.0-draft  
**Status:** Draft — awaiting TWG review  
**Spec file:** `specs/matching-engine-spec.md`

---

## 1. Overview

The FHP matching engine is a deterministic, nine-stage pipeline. It consumes a candidate profile and a job brief, and produces three outputs: a match outcome, a match explanation, and a pipeline trace.

The pipeline is **stateless per invocation**. It holds no memory between runs. All shared state (fairness metrics, ontology, governance constants) is read from external stores at the start of each run and treated as immutable for the duration of that run.

---

## 2. Pipeline contract

**Inputs:**
```
candidate: CandidateProfile           (validated against candidate-profile.schema.json)
job:       JobBrief                   (validated against job-brief.schema.json)
context:   PipelineContext {
    ontology:         SkillOntology   (pinned version)
    fairness_metrics: FairnessMetrics (most recent nightly snapshot for this job/company)
    governance:       GovernanceConfig (weights, thresholds, constants)
    cohort_service:   CohortService   (resolves candidate_id → cohort memberships, anonymised)
}
```

**Outputs:**
```
match:       MatchExplanation          (see match-explanation.schema.json)
trace:       PipelineTrace             (see trace.schema.json)
```

All three outputs are written atomically. A partial pipeline run with no committed output is treated as a failure.

---

## 3. Stage-by-stage specification

### Stage 1: Normalisation

**Purpose:** Ensure all inputs are in canonical form before any comparison is made. Prevents matching errors caused by inconsistent representations.

```
function normalise(candidate, job, ontology):

    // Normalise skill IDs — reject unknown ontology references
    for skill in candidate.skills:
        assert ontology.exists(skill.ontology_id),
            raise ValidationError(f"Unknown skill: {skill.ontology_id}")

    for skill in job.skills_required:
        assert ontology.exists(skill.ontology_id),
            raise ValidationError(f"Unknown skill: {skill.ontology_id}")

    // Normalise salary to a common currency and period
    // Uses daily exchange rates from the governance-approved rate source
    candidate.preferences.salary.normalised_annual_gbp =
        to_annual_gbp(candidate.preferences.salary)

    job.salary.normalised_min_annual_gbp = to_annual_gbp(job.salary.minimum, job.salary.currency, job.salary.period)
    job.salary.normalised_max_annual_gbp = to_annual_gbp(job.salary.maximum, job.salary.currency, job.salary.period)

    // Normalise location: resolve city names to ISO 3166-2 region codes
    job.location.normalised_region = resolve_location(job.location)
    for loc in candidate.preferences.locations:
        loc.normalised_region = resolve_location(loc)

    return normalised_candidate, normalised_job

    trace.record_stage("normalisation", input={skill_count: len(candidate.skills)},
                       output={normalised: true})
```

Normalisation failures are hard errors — a pipeline run with an invalid input does not proceed.

---

### Stage 2: Semantic Expansion

**Purpose:** Expand each skill in the job brief with its ontology synonyms and related terms. This ensures that a candidate who describes Python experience as `fhp:skill:python` is not penalised because the job brief uses `fhp:skill:python3`.

```
function expand_semantically(job, ontology):

    expanded_requirements = {}

    for skill in job.skills_required:
        synonyms = ontology.get_synonyms(skill.ontology_id)
        related  = ontology.get_related(skill.ontology_id, max_distance=1)

        expanded_requirements[skill.ontology_id] = {
            canonical:    skill.ontology_id,
            synonyms:     synonyms,          // exact equivalents
            related:      related,           // close relatives, lower match weight
            requirement_level:   skill.requirement_level,
            minimum_proficiency: skill.minimum_proficiency
        }

    trace.record_stage("semantic_expansion",
        input={skill_count: len(job.skills_required)},
        output={expansion_count: sum(len(v.synonyms)+len(v.related)
                                     for v in expanded_requirements.values())})

    return expanded_requirements
```

---

### Stage 3: Constraint Satisfaction

**Purpose:** Enforce hard constraints. Any candidate who fails a constraint is eliminated here. No score is computed for eliminated candidates. An elimination decision is always accompanied by a specific reason code.

```
function check_constraints(candidate, job, expanded_requirements):

    failures = []

    // --- Must-have skill constraints ---
    for skill_id, req in expanded_requirements.items():
        if req.requirement_level != "must_have":
            continue

        candidate_skill = find_best_match(candidate.skills, skill_id, req.synonyms)

        if candidate_skill is None:
            failures.append(ConstraintFailure(
                reason_code="missing_must_have_skill",
                ontology_id=skill_id,
                required_proficiency=req.minimum_proficiency,
                candidate_proficiency=None
            ))
            continue

        if proficiency_numeric(candidate_skill.proficiency) < proficiency_numeric(req.minimum_proficiency) - ONE_STEP:
            // More than one level below — no partial credit, hard fail
            failures.append(ConstraintFailure(
                reason_code="below_minimum_proficiency",
                ontology_id=skill_id,
                required_proficiency=req.minimum_proficiency,
                candidate_proficiency=candidate_skill.proficiency
            ))

    // --- Location constraint ---
    if not location_compatible(candidate, job):
        failures.append(ConstraintFailure(reason_code="constraint_location_mismatch"))

    // --- Salary constraint (hard floor only) ---
    // Only fail if job maximum is below candidate minimum — not if ranges merely differ
    if job.salary.normalised_max_annual_gbp < candidate.preferences.salary.normalised_annual_gbp * 0.85:
        // 0.85 tolerance: don't hard-fail a 15% gap — it may be negotiable
        failures.append(ConstraintFailure(reason_code="constraint_salary_mismatch"))

    // --- Work mode constraint ---
    if job.work_mode not in candidate.preferences.work_modes:
        failures.append(ConstraintFailure(reason_code="constraint_work_mode_mismatch"))

    // --- Employment type constraint ---
    if job.employment_type not in candidate.preferences.employment_types:
        failures.append(ConstraintFailure(reason_code="constraint_employment_type_mismatch"))

    if failures:
        trace.record_stage("constraint_satisfaction", status="aborted",
                           output={failure_count: len(failures), failures: failures})
        return ConstraintResult(passed=False, failures=failures)

    trace.record_stage("constraint_satisfaction", output={passed: true})
    return ConstraintResult(passed=True, failures=[])
```

If `passed=False`, the pipeline aborts here. The trace is written, the explanation is generated with decision=`not_matched` and the failure list, and the match outcome is committed.

---

### Stage 4: Skill Scoring

**Purpose:** Compute `S_must` and `S_nice` as defined in `scoring-spec.md`.

```
function score_skills(candidate, job, expanded_requirements):

    must_scores  = []
    nice_scores  = []
    breakdown    = []

    for skill_id, req in expanded_requirements.items():
        candidate_skill = find_best_match(candidate.skills, skill_id, req.synonyms)

        if candidate_skill is None:
            q = 0.0
            match_type = "none"
        else:
            p = proficiency_numeric(candidate_skill.proficiency)
            r = proficiency_numeric(req.minimum_proficiency)

            if p >= r:
                q = 1.0
                match_type = "direct"
            elif p >= r - ONE_STEP_NUMERIC:
                q = p / r          // partial credit: one level below
                match_type = "direct"
            else:
                q = 0.0
                match_type = "none"

        breakdown.append(SkillBreakdownEntry(
            ontology_id=skill_id,
            requirement_level=req.requirement_level,
            matched=(q > 0),
            match_type=match_type,
            candidate_proficiency=candidate_skill.proficiency if candidate_skill else None,
            required_proficiency=req.minimum_proficiency,
            score_contribution=None  // set after weighting
        ))

        if req.requirement_level == "must_have":
            must_scores.append(q)
        else:
            nice_scores.append(q)

    S_must = mean(must_scores) if must_scores else 1.0
    S_nice = mean(nice_scores) if nice_scores else None  // None = no nice-to-haves

    trace.record_stage("skill_scoring",
        output={S_must: S_must, S_nice: S_nice, breakdown: breakdown})

    return S_must, S_nice, breakdown
```

---

### Stage 5: Transferable Skill Compensation

**Purpose:** Improve scores for candidates whose skills transfer to unmatched requirements. See `scoring-spec.md §5`.

```
function apply_transferable_compensation(candidate, breakdown, ontology):

    for entry in breakdown:
        if entry.matched:
            continue  // only consider unmatched skills

        transfer_candidates = ontology.get_transfer_sources(entry.ontology_id)

        best_transfer_score = 0.0
        best_transfer_via   = None

        for transfer in transfer_candidates:
            candidate_skill = find_skill(candidate.skills, transfer.source_id)
            if candidate_skill is None:
                continue

            transfer_score = transfer.weight * proficiency_numeric(candidate_skill.proficiency)
            transfer_score = min(transfer_score, 0.6)  // transfer cap

            if transfer_score > best_transfer_score:
                best_transfer_score = transfer_score
                best_transfer_via   = transfer.source_id

        if best_transfer_score > 0:
            entry.score_contribution = best_transfer_score
            entry.match_type         = "transferable"
            entry.matched            = True
            entry.transferable_via   = best_transfer_via

    // Recompute S_must and S_nice with updated scores
    must_scores = [e.score_contribution for e in breakdown if e.requirement_level == "must_have"]
    nice_scores = [e.score_contribution for e in breakdown if e.requirement_level == "nice_to_have"]

    S_must = mean(must_scores)
    S_nice = mean(nice_scores) if nice_scores else None

    trace.record_stage("transferable_skill_compensation",
        output={S_must: S_must, S_nice: S_nice,
                transfers_applied: sum(1 for e in breakdown if e.match_type == "transferable")})

    return S_must, S_nice, breakdown
```

---

### Stage 6: Preference Alignment

**Purpose:** Compute `S_pref`. See `scoring-spec.md §6`.

```
function score_preferences(candidate, job):

    // Salary alignment
    if candidate.preferences.salary is None:
        A_salary = 0.5  // neutral default for missing data
    elif job.salary.normalised_max_annual_gbp < candidate.preferences.salary.normalised_annual_gbp:
        A_salary = 0.0
    else:
        A_salary = 1.0

    // Work mode alignment
    A_mode = 1.0 if job.work_mode in (candidate.preferences.work_modes or []) else 0.0
    if not candidate.preferences.work_modes:
        A_mode = 0.5  // neutral default

    // Location alignment
    A_location = 1.0 if location_preference_match(candidate, job) else 0.0
    if not candidate.preferences.locations:
        A_location = 0.5  // neutral default

    S_pref = (A_salary + A_mode + A_location) / 3.0

    trace.record_stage("preference_alignment",
        output={S_pref: S_pref, A_salary: A_salary, A_mode: A_mode, A_location: A_location})

    return S_pref
```

---

### Stage 7: Bias Detection

**Purpose:** Determine whether the candidate's cohort(s) are subject to active bias corrections. See `bias-correction-spec.md §4`.

```
function detect_bias(candidate_id, C, fairness_metrics, cohort_service, governance):

    cohort_memberships = cohort_service.get_cohorts(candidate_id)
    // cohort_memberships = list of (characteristic, cohort_id) pairs
    // The pipeline never sees raw demographic attributes

    triggered_corrections = []

    for (characteristic, cohort_id) in cohort_memberships:
        metrics = fairness_metrics.get_for_cohort(cohort_id)
        if metrics is None or metrics.cohort_count < governance.MIN_COHORT_SIZE:
            trace.record_warning("bias_detection",
                f"Insufficient data for cohort {cohort_id}, skipping")
            continue

        for metric_name in ["DIR", "EOD", "SDS"]:
            metric = metrics.get(metric_name)
            if metric is None or metric.within_bounds:
                continue

            // Metric is in breach for this cohort
            direction  = "upward" if cohort_is_under_represented(metric, cohort_id) else "downward"
            magnitude  = compute_correction_magnitude(metric, governance.CORRECTION_SCALING_FACTOR)
            magnitude  = min(magnitude, governance.CORRECTION_CAP)

            triggered_corrections.append(CorrectionCandidate(
                metric=metric_name,
                direction=direction,
                magnitude=magnitude,
                cohort_id=cohort_id
            ))

    trace.record_stage("bias_detection",
        output={triggered: len(triggered_corrections) > 0,
                corrections_candidate_count: len(triggered_corrections)})

    return triggered_corrections
```

---

### Stage 8: Bias Correction

**Purpose:** Apply the correction delta. See `bias-correction-spec.md §5`.

```
function apply_bias_correction(C, triggered_corrections, governance):

    if not triggered_corrections:
        δ = 0.0
        applied = None
    else:
        // Take the maximum correction (do not sum — see spec §5.2)
        best = max(triggered_corrections, key=lambda x: x.magnitude)
        direction_sign = 1 if best.direction == "upward" else -1
        δ = best.magnitude * direction_sign
        δ = clamp(δ, -governance.CORRECTION_CAP, governance.CORRECTION_CAP)
        applied = best

        if abs(δ) > governance.GOVERNANCE_ALERT_THRESHOLD:
            raise_governance_alert(
                type="high_magnitude_correction",
                match_id=current_match_id,
                delta=δ
            )

    C_prime = clamp(C + δ, 0.0, 1.0)

    trace.record_stage("bias_correction",
        output={delta: δ, C_pre: C, C_post: C_prime,
                correction_applied: applied is not None})

    return C_prime, δ
```

---

### Stage 9: Explanation Generation

**Purpose:** Produce the three audience-appropriate explanation objects (candidate, employer, governance).

```
function generate_explanations(candidate, job, outcome, scores, breakdown,
                                bias_assessment, trace_id, match_id):

    base = {
        fhp_version:      FHP_VERSION,
        match_id:         match_id,
        candidate_id:     candidate.candidate_id,
        job_id:           job.job_id,
        generated_at:     now(),
        pipeline_version: PIPELINE_VERSION,
        outcome:          outcome,
        scores:           scores,
        skill_breakdown:  breakdown,
        bias_assessment:  bias_assessment
    }

    candidate_explanation = render_for_audience(base, "candidate")
    employer_explanation  = render_for_audience(base, "employer")
    governance_explanation = render_for_audience(base, "governance")

    // Audience-aware field filtering:
    // candidate:   sees skill_breakdown, not_matched_reasons, plain_language_summary,
    //              next_steps. Does NOT see bias_assessment detail or employer data.
    // employer:    sees skill_breakdown and overall score band (not exact score).
    //              Does NOT see candidate PII (until consent), bias_assessment, or δ.
    // governance:  full record including bias_assessment, δ, pre/post scores.

    trace.record_stage("explanation_generation",
        output={explanations_generated: 3})

    return candidate_explanation, employer_explanation, governance_explanation
```

---

## 4. Pipeline orchestration

```
function run_pipeline(candidate_id, job_id, context):

    trace = new_trace(candidate_id, job_id, context.pipeline_version)
    match_id = new_uuid()

    try:
        candidate = load_and_validate(candidate_id)
        job       = load_and_validate(job_id)

        // Stage 1
        candidate, job = normalise(candidate, job, context.ontology)

        // Stage 2
        expanded = expand_semantically(job, context.ontology)

        // Stage 3
        constraint_result = check_constraints(candidate, job, expanded)
        if not constraint_result.passed:
            outcome = build_not_matched_outcome(constraint_result.failures)
            explanations = generate_explanations(..., outcome=outcome)
            commit(match_id, outcome, explanations, trace.finalise(status="aborted"))
            return

        // Stages 4–5
        S_must, S_nice, breakdown = score_skills(candidate, job, expanded)
        S_must, S_nice, breakdown = apply_transferable_compensation(candidate, breakdown, context.ontology)

        // Stage 6
        S_pref = score_preferences(candidate, job)

        // Composite score
        weights = context.governance.weights
        S_nice_effective = S_nice if S_nice is not None else 1.0
        if S_nice is None:
            weights = redistribute_weights(weights)

        C = (weights.w_m * S_must) + (weights.w_n * S_nice_effective) + (weights.w_p * S_pref)

        // Stages 7–8
        triggered = detect_bias(candidate.candidate_id, C, context.fairness_metrics,
                                 context.cohort_service, context.governance)
        C_prime, δ = apply_bias_correction(C, triggered, context.governance)

        // Determine outcome
        if C_prime >= context.governance.MATCH_THRESHOLD:
            decision = "matched"
        elif C_prime >= context.governance.BORDERLINE_THRESHOLD:
            decision = "borderline"
        else:
            decision = "not_matched"

        outcome = build_outcome(decision, C_prime, C, δ, breakdown)
        scores  = build_scores(S_must, S_nice, S_pref, δ)

        // Stage 9
        explanations = generate_explanations(candidate, job, outcome, scores,
                                              breakdown, triggered, trace.trace_id, match_id)

        commit(match_id, outcome, explanations, trace.finalise(status="completed"))

    except Exception as e:
        trace.finalise(status="failed", failure_reason=str(e))
        commit_failed_trace(match_id, trace)
        raise
```

---

## 5. Idempotency and replay

Every pipeline run is identified by `match_id` (generated at the start of the run). If a run is retried (e.g. after a transient failure), the same `match_id` must be used, and the trace must record the retry count. A completed run for a given `match_id` cannot be re-run — it can only be appealed.

For audit replay, the trace's `pipeline_version` and `input_snapshot` fields in each stage provide everything needed to reproduce the run deterministically.

---

## 6. Performance targets

| Metric | Target |
|--------|--------|
| p50 end-to-end latency | < 800ms |
| p99 end-to-end latency | < 3000ms |
| Stage 7 (bias detection) latency | < 50ms (read from cache) |
| Throughput | > 100 concurrent pipeline runs |

Bias detection is on the hot path. The nightly fairness computation job pre-computes all metric snapshots into a read-optimised cache. Stage 7 reads from this cache; it never performs real-time metric computation.
