/**
 * FHP Fairness Metrics Store
 *
 * Read interface used by the matching pipeline (Stage 7).
 * The nightly computation job writes to this store.
 * The pipeline only reads — never writes during a match run.
 */

import type { MetricSnapshot } from '../bias/correction.ts';

export interface CohortMetrics {
  cohortId:    string;
  sampleCount: number;
  DIR:         MetricSnapshot;
  EOD:         MetricSnapshot;
  SDS:         MetricSnapshot;
}

export interface FairnessMetricsStore {
  /**
   * Get the most recent fairness metrics for a specific cohort.
   * Returns null if no data is available.
   */
  getForCohort(cohortId: string): CohortMetrics | null;

  /**
   * Get all active metrics for a given job.
   */
  getForJob(jobId: string): CohortMetrics[];

  /**
   * Get all active metrics for a given company.
   */
  getForCompany(companyId: string): CohortMetrics[];
}

/**
 * In-memory stub — returns empty metrics.
 * Production implementation reads from the fairness metrics database.
 */
export class StubFairnessMetricsStore implements FairnessMetricsStore {
  getForCohort(_cohortId: string): CohortMetrics | null {
    return null; // No data in reference stub
  }
  getForJob(_jobId: string): CohortMetrics[] {
    return [];
  }
  getForCompany(_companyId: string): CohortMetrics[] {
    return [];
  }
}
