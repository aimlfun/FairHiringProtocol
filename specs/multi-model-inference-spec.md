# FHP Multi-Model Inference Layer

**Version:** 1.0.0-draft  
**Status:** Draft — awaiting TWG review  
**Spec file:** `specs/multi-model-inference-spec.md`

---

## 1. Purpose and motivation

Several stages of the FHP matching pipeline require AI/ML inference: semantic skill expansion (Stage 2), transferable skill identification (Stage 5), and explanation generation (Stage 9). These are the points where the pipeline moves beyond deterministic computation into model-assisted reasoning.

Relying on a single model for these decisions creates risk:
- A single model can have systematic blind spots that correlate with protected characteristics
- A single model's failures are silent — there is no independent check
- A single model's provider can change their model without notice, changing pipeline behaviour mid-flight

The multi-model inference layer (MMIL) addresses these risks by requiring that inference tasks are run across multiple independent models, with a defined consensus and disagreement-handling protocol. No single model's output determines a pipeline decision unilaterally.

This is one of the anti-capture safeguards referenced in `GOVERNANCE.md §4`. It applies equally to proprietary and open-source models.

---

## 2. Scope

The MMIL applies to three pipeline stages:

| Stage | Task | Why multi-model |
|-------|------|-----------------|
| Stage 2: Semantic Expansion | Identifying synonyms and related skills for job brief requirements | A single model may systematically expand some skill clusters more richly than others, advantaging candidates with those skills |
| Stage 5: Transferable Skill Compensation | Identifying valid transfer relationships between candidate skills and job requirements | Transfer judgements are the most subjective part of scoring; single-model bias here directly affects match outcomes |
| Stage 9: Explanation Generation | Producing plain-language explanations for candidates and employers | Explanation quality and tone must be consistent across demographic groups; a model with biased language patterns would create an unequal experience |

The scoring formula (Stages 4, 6), bias correction (Stages 7–8), and constraint satisfaction (Stage 3) are entirely deterministic — they do not use model inference and are not subject to MMIL.

---

## 3. Model pool requirements

### 3.1 Minimum pool size

Each inference task must be run across a minimum of **three independent models**. "Independent" means:

- Trained by different organisations, OR
- Trained on substantially different corpora, OR
- Using materially different architectures

Two models from the same provider, even with different version numbers, do not count as independent for MMIL purposes unless the TWG has certified them as sufficiently divergent.

### 3.2 Model registration

All models used in MMIL must be registered in the FHP model registry (a governance-controlled configuration). Registration requires:

- Model identifier and version (must be pinned — floating versions like "latest" are not permitted)
- Provider name
- Architecture description
- Known limitations or bias disclosures from the provider
- TWG certification of independence from other registered models
- Benchmark scores on the FHP inference quality test suite (maintained by TWG)

Unregistered models may not be used. A model may be deregistered by the TWG if it is found to produce systematically biased outputs on the FHP benchmark suite.

### 3.3 Model version pinning

The models used for any given pipeline run are recorded in the trace (`models_used` field). Models must be version-pinned: a pipeline run uses exactly the models registered at the time of the run. Model updates do not apply retroactively.

When a model version is updated, the new version must pass the FHP benchmark suite and receive TWG certification before deployment. There is a mandatory 7-day staging period during which the new version runs in shadow mode (outputs logged but not used) before it becomes active.

---

## 4. Consensus protocol

### 4.1 General principle

For each inference task, all models in the pool are invoked in parallel. Their outputs are collected and a consensus is computed. The consensus output — not any individual model's output — is what the pipeline uses.

### 4.2 Output types by task

**Stage 2 — Semantic expansion:**  
Each model returns a set of skill ontology IDs it considers synonymous or closely related to the input skill ID. The consensus is the **intersection** of outputs appearing in at least ⌈N/2⌉ + 1 of N models (strict majority). Skills identified by only one model are excluded — they are too uncertain to rely on.

```
consensus_synonyms = {skill_id for skill_id in all_outputs
                      if count(skill_id in model_outputs) > N/2}
```

**Stage 5 — Transferable skill identification:**  
Each model returns a transfer weight (0.0–1.0) for each candidate-skill → job-skill pair it considers transferable. The consensus weight is the **trimmed mean**: drop the highest and lowest values, average the rest.

```
for each (candidate_skill, job_skill) pair:
    weights = [model.transfer_weight(candidate_skill, job_skill)
               for model in model_pool]
    weights.sort()
    trimmed = weights[1:-1]            // drop min and max
    consensus_weight = mean(trimmed)
```

If any model returns 0.0 (no transfer relationship), that model is treated as a dissent vote. If more than ⌈N/2⌉ models dissent, the transfer relationship is rejected regardless of the trimmed mean.

**Stage 9 — Explanation generation:**  
Explanation generation cannot be simply averaged. Instead, one model is designated the **primary generator** per run (rotated across the pool using a deterministic round-robin schedule to prevent any single model dominating the candidate experience). The other models act as **validators**.

The primary generator produces the full explanation text. Each validator checks the explanation against the FHP explanation quality criteria (see §5). If a validator flags the explanation, it is regenerated by the next model in the rotation.

---

### 4.3 Disagreement handling

Disagreement is defined as a situation where the consensus protocol does not produce a clear output — either because the models are too divergent, or because the strict majority threshold is not met.

**Levels of disagreement:**

| Level | Condition | Action |
|-------|-----------|--------|
| **Low** | Consensus reached but with one outlier model | Log the outlier. Proceed with consensus output. Record in trace. |
| **Medium** | Consensus threshold not met (e.g. 2 of 3 models agree, but third diverges significantly) | Fall back to the ontology's static definition. Log disagreement. Alert TWG. |
| **High** | No two models agree | Pipeline stage fails gracefully. For Stage 2: use only static ontology synonyms (no expansion). For Stage 5: apply zero transfer credit. For Stage 9: use a template-based explanation. Log high disagreement. Governance alert raised. |

High disagreement is logged as a governance event. If high disagreement occurs for the same inference task more than 5 times in a rolling 7-day window, the model pool for that task is suspended and the TWG is required to review the registered models.

---

## 5. Explanation quality validation criteria

The validator models in Stage 9 check explanations against the following criteria. Each criterion is a binary pass/fail check:

| Criterion | Description |
|-----------|-------------|
| **Specificity** | Does the explanation reference the specific skills and requirements from this match? (No generic phrases like "not enough experience") |
| **Accuracy** | Are all factual claims in the explanation consistent with the scoring data? |
| **Tone neutrality** | Does the explanation avoid language that could be perceived as dismissive, condescending, or demotivating? |
| **Demographic neutrality** | Does the explanation use language that does not vary systematically by cohort? (Checked against a classifier trained on the FHP tone evaluation dataset) |
| **Actionability** | For not_matched explanations: does it include at least one specific, actionable next step? |
| **Completeness** | Does it address all not_matched_reasons? |

An explanation must pass all six criteria to be accepted. If a regenerated explanation fails twice, the pipeline falls back to a template-based explanation and logs a model quality alert.

---

## 6. Fairness monitoring of MMIL outputs

The MMIL is itself subject to fairness monitoring. The nightly fairness computation job includes a check for model-level disparities:

- **Expansion disparity:** Does semantic expansion produce consistently richer or poorer results for skills more commonly associated with particular demographic groups? (e.g. does the model expand technical skills more richly than skills associated with caregiving or social work roles?)

- **Transfer disparity:** Are transfer weights systematically higher or lower for certain skill clusters that correlate with demographic groups?

- **Explanation tone disparity:** Does explanation language differ in tone or length across demographic cohorts?

If any of these checks breaches its threshold, a FOB review is triggered. Model-level fairness is reported separately from pipeline-level fairness to enable the TWG to identify which component is the source of any observed disparity.

---

## 7. Trace recording

Every MMIL invocation is recorded in the pipeline trace under the relevant stage. The trace records:

```
models_used: [
  {
    model_id:   "fhp-skill-expander-v2.1.0",
    provider:   "provider-name",
    stage:      "semantic_expansion",
    version:    "2.1.0",
    invoked_at: "2025-11-01T14:32:11Z",
    latency_ms: 87
  },
  ...
]
```

And within each stage's `decisions` array, disagreement events are recorded with their level, the diverging model, and the fallback action taken.

---

## 8. Governance controls

The following are governance-controlled and may not be changed by operators or the TWG alone:

| Item | Who controls it | Change process |
|------|----------------|---------------|
| Minimum model pool size (3) | Protocol Council | FHP-P + 4/6 majority |
| Consensus threshold formula | Protocol Council | FHP-P + 4/6 majority |
| Explanation quality criteria | TWG with FOB sign-off | TWG proposal + FOB review |
| Model registry | TWG | Certification process (no vote needed for additions; removal requires PC notification) |
| Staging period for new models (7 days) | Protocol Council | FHP-P + 4/6 majority |
| Fairness monitoring thresholds for MMIL | Fairness Oversight Board | FOB resolution |

---

## 9. Performance considerations

Running three or more models in parallel has latency and cost implications. The MMIL is designed to mitigate this:

- Model invocations within a pool are **always parallel**, never sequential
- Models are hosted in geographically co-located infrastructure to minimise network latency
- Results are cached at the ontology level where deterministic: if the expansion of `fhp:skill:python` has been computed today, it is served from cache rather than re-invoking the model pool
- Transfer weight computation is pre-computed nightly for all active skill pairs in the ontology and cached

**Performance targets for MMIL stages:**

| Stage | Target p50 | Target p99 |
|-------|-----------|-----------|
| Stage 2 (semantic expansion, cached) | < 5ms | < 20ms |
| Stage 2 (semantic expansion, uncached) | < 300ms | < 800ms |
| Stage 5 (transfer, cached) | < 5ms | < 20ms |
| Stage 5 (transfer, uncached) | < 400ms | < 1000ms |
| Stage 9 (explanation generation) | < 800ms | < 2500ms |

Cache invalidation occurs when the ontology version changes or when a model in the pool is updated.
