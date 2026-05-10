/**
 * FHP Pipeline Context
 *
 * The complete, immutable bundle of external state consumed by the pipeline.
 * Built once per run and passed to every stage. Stages must not modify it.
 */

import type { ResolvedOntology }     from '../ontology/loader.ts';
import type { FairnessMetricsStore } from '../fairness/store.ts';
import type { CohortService }        from '../bias/cohort.ts';
import { GOVERNANCE }                from '../shared/config/governance.ts';

export interface PipelineContext {
  /** Pinned ontology version for this run */
  readonly ontology: ResolvedOntology;

  /** Most recent nightly fairness snapshot for the job/company in scope */
  readonly fairnessMetrics: FairnessMetricsStore;

  /** Anonymised cohort resolution service */
  readonly cohortService: CohortService;

  /** Governance constants — never mutated mid-run */
  readonly governance: typeof GOVERNANCE;

  /** UTC timestamp this run was initiated */
  readonly runAt: Date;
}

export function buildContext(
  ontology: ResolvedOntology,
  fairnessMetrics: FairnessMetricsStore,
  cohortService: CohortService,
): PipelineContext {
  return {
    ontology,
    fairnessMetrics,
    cohortService,
    governance: GOVERNANCE,
    runAt: new Date(),
  };
}
