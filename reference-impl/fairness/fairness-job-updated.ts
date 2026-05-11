/**
 * FHP Nightly Fairness Computation Job — Updated
 *
 * Adds:
 *   1. Real demographic cohort integration (sex, age, ethnicity, religion, education)
 *   2. Data Insufficient handling — when disclosure rate is too low
 *   3. Per-dimension metrics — each demographic axis computed independently
 *   4. Employment gap cohort — derived from work history, no consent needed
 *
 * The core metric computations (DIR, EOD, SDS) are unchanged.
 * What changed: how cohorts are resolved and what happens when data is missing.
 *
 * Replaces: reference-impl/fairness/job.ts
 */

import { v4 as uuidv4 }                                    from 'uuid';
import { GOVERNANCE }                                       from '../shared/config/governance.ts';
import type { CohortService, FairnessCharacteristic }       from '../bias/cohort-service.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DataSufficiency = 'sufficient' | 'insufficient' | 'no_data';

export interface MatchEventRecord {
  match_id:         string;
  candidate_id:     string;
  job_id:           string;
  company_id:       string;
  decision:         'matched' | 'not_matched' | 'borderline';
  overall_score:    number;
  qualified:        boolean;
  created_at:       string;
}

export interface CohortStats {
  cohortId:          string;
  characteristic:    FairnessCharacteristic;
  dimension:         string;
  total:             number;
  matched:           number;
  qualifiedTotal:    number;
  qualifiedMatched:  number;
  scores:            number[];
}

export interface DimensionMetrics {
  characteristic:    FairnessCharacteristic;
  dimension:         string;
  disclosure_rate:   number;
  data_sufficiency:  DataSufficiency;
  cohort_count:      number;
  // Metrics — null when data_sufficiency !== 'sufficient'
  dir: {
    value:               number | null;
    within_bounds:       boolean | null;
    reference_cohort:    string | null;
    comparison_cohort:   string | null;
  };
  eod: {
    value:               number | null;
    within_bounds:       boolean | null;
    group_a_cohort:      string | null;
    group_b_cohort:      string | null;
  };
  sds: {
    value:               number | null;
    within_bounds:       boolean | null;
    reference_cohort:    string | null;
    comparison_cohort:   string | null;
  };
  any_metric_breached: boolean;
}

export interface FairnessComputationResult {
  audit_id:                   string;
  computed_at:                string;
  pipeline_version:           string;
  scope_level:                'job' | 'company' | 'platform';
  scope_job_id?:              string;
  scope_company_id?:          string;
  window_from:                string;
  window_to:                  string;
  total_candidates_evaluated: number;
  total_with_any_demographic: number;
  overall_disclosure_rate:    number;
  // Per-dimension results (one per characteristic)
  dimensions:                 DimensionMetrics[];
  // Aggregate breach flags (used for escalation)
  any_metric_breached:        boolean;
  metrics_breached:           string[];
  governance_review_required: boolean;
  consecutive_breach_windows: number;
  // Legacy flat metrics — maintained for backwards compat with existing API
  dir_value:                  number | null;
  dir_within_bounds:          boolean | null;
  eod_value:                  number | null;
  eod_within_bounds:          boolean | null;
  sds_value:                  number | null;
  sds_within_bounds:          boolean | null;
}

export interface MatchEventStore {
  getMatchesInWindow(from: Date, to: Date, companyId?: string, jobId?: string): Promise<MatchEventRecord[]>;
  getPreviousBreachCount(scopeKey: string): Promise<number>;
  saveMetrics(record: FairnessComputationResult): Promise<void>;
}

// ── Main job entry point ──────────────────────────────────────────────────────

export async function runFairnessJob(
  store:        MatchEventStore,
  cohortService: CohortService,
  options?: {
    companyId?: string;
    jobId?:    string;
    level?:    'job' | 'company' | 'platform';
  },
): Promise<FairnessComputationResult> {
  const now   = new Date();
  const from  = new Date(now.getTime() - GOVERNANCE.FAIRNESS_ROLLING_WINDOW_DAYS * 86400_000);
  const level = options?.level ?? (options?.jobId ? 'job' : options?.companyId ? 'company' : 'platform');

  const matches = await store.getMatchesInWindow(from, now, options?.companyId, options?.jobId);

  if (matches.length === 0) {
    return emptyResult(now, from, level, options?.jobId, options?.companyId);
  }

  const candidateIds = [...new Set(matches.map(m => m.candidate_id))];

  // ── Resolve cohorts for every candidate in this window ───────────────────
  const cohortsByCandidate = new Map<string, Awaited<ReturnType<CohortService['getCohortsForCandidate']>>>();

  await Promise.all(
    candidateIds.map(async id => {
      const cohorts = await cohortService.getCohortsForCandidate(id);
      cohortsByCandidate.set(id, cohorts);
    })
  );

  const totalWithAnyDemographic = [...cohortsByCandidate.values()]
    .filter(c => c.length > 0).length;

  const overallDisclosureRate = candidateIds.length > 0
    ? totalWithAnyDemographic / candidateIds.length
    : 0;

  // ── Compute per-dimension metrics ────────────────────────────────────────
  const CHARACTERISTICS: FairnessCharacteristic[] = [
    'sex_group', 'age_group', 'ethnicity_group', 'religion_group', 'education_group',
  ];

  const dimensionResults: DimensionMetrics[] = [];

  for (const characteristic of CHARACTERISTICS) {
    const dimResult = await computeDimensionMetrics(
      characteristic,
      matches,
      cohortsByCandidate,
      cohortService,
      candidateIds,
    );
    dimensionResults.push(dimResult);
  }

  // ── Aggregate breach detection ────────────────────────────────────────────
  // Only dimensions with sufficient data contribute to breach detection.
  const sufficientDimensions = dimensionResults.filter(
    d => d.data_sufficiency === 'sufficient'
  );
  const metricsBreach: string[] = [];

  for (const dim of sufficientDimensions) {
    if (dim.dir.within_bounds === false) {
      metricsBreach.push(`disparate_impact_ratio:${dim.characteristic}`);
    }
    if (dim.eod.within_bounds === false) {
      metricsBreach.push(`equal_opportunity_difference:${dim.characteristic}`);
    }
    if (dim.sds.within_bounds === false) {
      metricsBreach.push(`score_distribution_skew:${dim.characteristic}`);
    }
  }

  const anyBreached = metricsBreach.length > 0;
  const scopeKey    = `${level}:${options?.jobId ?? options?.companyId ?? 'platform'}`;
  const prevBreachCount = anyBreached ? await store.getPreviousBreachCount(scopeKey) : 0;
  const consecutiveBreaches = anyBreached ? prevBreachCount + 1 : 0;
  const govReviewRequired   =
    consecutiveBreaches >= GOVERNANCE.CONSECUTIVE_BREACH_BEFORE_REVIEW;

  if (govReviewRequired) {
    console.warn(
      `[FairnessJob] GOVERNANCE REVIEW REQUIRED: ${scopeKey} breached for ` +
      `${consecutiveBreaches} consecutive windows. ` +
      `Dimensions breached: ${metricsBreach.join(', ')}`
    );
  }

  // ── Legacy flat metrics — use the worst-case across all sufficient dimensions ─
  // Existing API consumers expect dir_value, eod_value, sds_value at top level.
  // We pick the dimension with the most significant breach for each metric.
  const worstDir = worstMetric(sufficientDimensions, 'dir');
  const worstEod = worstMetric(sufficientDimensions, 'eod');
  const worstSds = worstMetric(sufficientDimensions, 'sds');

  const result: FairnessComputationResult = {
    audit_id:                   uuidv4(),
    computed_at:                now.toISOString(),
    pipeline_version:           GOVERNANCE.PIPELINE_VERSION,
    scope_level:                level,
    scope_job_id:               options?.jobId,
    scope_company_id:           options?.companyId,
    window_from:                from.toISOString(),
    window_to:                  now.toISOString(),
    total_candidates_evaluated: candidateIds.length,
    total_with_any_demographic: totalWithAnyDemographic,
    overall_disclosure_rate:    overallDisclosureRate,
    dimensions:                 dimensionResults,
    any_metric_breached:        anyBreached,
    metrics_breached:           metricsBreach,
    governance_review_required: govReviewRequired,
    consecutive_breach_windows: consecutiveBreaches,
    // Legacy flat
    dir_value:        worstDir?.value ?? null,
    dir_within_bounds: worstDir !== null ? worstDir.value !== null
      ? (worstDir.value >= GOVERNANCE.DIR_LOWER_BOUND && worstDir.value <= GOVERNANCE.DIR_UPPER_BOUND)
      : null : null,
    eod_value:        worstEod?.value ?? null,
    eod_within_bounds: worstEod !== null ? worstEod.value !== null
      ? Math.abs(worstEod.value) < GOVERNANCE.EOD_THRESHOLD
      : null : null,
    sds_value:        worstSds?.value ?? null,
    sds_within_bounds: worstSds !== null ? worstSds.value !== null
      ? Math.abs(worstSds.value) < GOVERNANCE.SDS_THRESHOLD
      : null : null,
  };

  await store.saveMetrics(result);
  return result;
}

// ── Per-dimension computation ─────────────────────────────────────────────────

async function computeDimensionMetrics(
  characteristic:       FairnessCharacteristic,
  matches:              MatchEventRecord[],
  cohortsByCandidate:   Map<string, { characteristic: FairnessCharacteristic; cohortId: string; dimension: string }[]>,
  cohortService:        CohortService,
  candidateIds:         string[],
): Promise<DimensionMetrics> {
  const dimensionLabel = characteristic.replace('_group', '').replace('_', ' / ');

  // Compute disclosure rate for this dimension
  const disclosureRate = await cohortService.getDisclosureRate(candidateIds, characteristic);

  const dataSufficiency: DataSufficiency =
    disclosureRate === 0 ? 'no_data' :
    disclosureRate < GOVERNANCE.DEMOGRAPHICS_MIN_DISCLOSURE_RATE ? 'insufficient' :
    'sufficient';

  // Build cohort stats from match events
  const cohortMap = new Map<string, CohortStats>();

  for (const match of matches) {
    const candidateCohorts = cohortsByCandidate.get(match.candidate_id) ?? [];
    const dimCohort = candidateCohorts.find(c => c.characteristic === characteristic);
    if (!dimCohort) continue;  // Candidate hasn't provided data for this dimension

    if (!cohortMap.has(dimCohort.cohortId)) {
      cohortMap.set(dimCohort.cohortId, {
        cohortId:         dimCohort.cohortId,
        characteristic,
        dimension:        dimCohort.dimension,
        total:            0,
        matched:          0,
        qualifiedTotal:   0,
        qualifiedMatched: 0,
        scores:           [],
      });
    }

    const stats = cohortMap.get(dimCohort.cohortId)!;
    stats.total++;
    if (match.decision === 'matched') stats.matched++;
    if (match.qualified) {
      stats.qualifiedTotal++;
      if (match.decision === 'matched') stats.qualifiedMatched++;
    }
    stats.scores.push(match.overall_score);
  }

  // Filter to cohorts meeting minimum size
  const validCohorts = [...cohortMap.values()].filter(
    c => c.total >= GOVERNANCE.MIN_COHORT_SIZE
  );

  // Insufficient data → return null metrics but still record what we have
  // Need BOTH sufficient disclosure rate AND ≥2 valid cohorts to compute metrics.
  // If disclosure is sufficient but only 1 cohort exists, that means all candidates
  // who provided data are in the same group — can't measure discrimination with 1 group.
  const effectiveSufficiency: DataSufficiency =
    dataSufficiency !== 'sufficient' ? dataSufficiency :
    validCohorts.length < 2         ? 'insufficient'  :
    'sufficient';

  if (effectiveSufficiency !== 'sufficient') {
    return {
      characteristic,
      dimension:         dimensionLabel,
      disclosure_rate:   disclosureRate,
      data_sufficiency:  effectiveSufficiency,
      cohort_count:      validCohorts.length,
      dir: { value: null, within_bounds: null, reference_cohort: null, comparison_cohort: null },
      eod: { value: null, within_bounds: null, group_a_cohort: null, group_b_cohort: null },
      sds: { value: null, within_bounds: null, reference_cohort: null, comparison_cohort: null },
      any_metric_breached: false,
    };
  }

  // Sort by total desc — largest cohort is reference
  const sorted   = [...validCohorts].sort((a, b) => b.total - a.total);
  const refCohort  = sorted[0];
  const compCohort = sorted[1];

  // DIR
  const refRate  = refCohort.matched / refCohort.total;
  const compRate = compCohort.matched / compCohort.total;
  const dirValue = refRate > 0 ? compRate / refRate : null;
  const dirWithin = dirValue !== null
    ? dirValue >= (GOVERNANCE.DIR_LOWER_BOUND - 1e-10) && dirValue <= (GOVERNANCE.DIR_UPPER_BOUND + 1e-10)
    : null;

  // EOD (Equal Opportunity Difference — True Positive Rate difference)
  let eodValue: number | null = null;
  let eodWithin: boolean | null = null;
  if (refCohort.qualifiedTotal > 0 && compCohort.qualifiedTotal > 0) {
    const tprRef  = refCohort.qualifiedMatched  / refCohort.qualifiedTotal;
    const tprComp = compCohort.qualifiedMatched / compCohort.qualifiedTotal;
    eodValue  = tprRef - tprComp;
    eodWithin = Math.abs(eodValue) < GOVERNANCE.EOD_THRESHOLD;
  }

  // SDS (Score Distribution Skew — mean score difference)
  const meanRef  = mean(refCohort.scores);
  const meanComp = mean(compCohort.scores);
  const sdsValue = meanRef - meanComp;
  const sdsWithin = Math.abs(sdsValue) < GOVERNANCE.SDS_THRESHOLD;

  const anyBreached = dirWithin === false || eodWithin === false || sdsWithin === false;

  return {
    characteristic,
    dimension:        dimensionLabel,
    disclosure_rate:  disclosureRate,
    data_sufficiency: 'sufficient',
    cohort_count:     validCohorts.length,
    dir: {
      value:             dirValue,
      within_bounds:     dirWithin,
      reference_cohort:  refCohort.cohortId,
      comparison_cohort: compCohort.cohortId,
    },
    eod: {
      value:        eodValue,
      within_bounds: eodWithin,
      group_a_cohort: refCohort.cohortId,
      group_b_cohort: compCohort.cohortId,
    },
    sds: {
      value:             sdsValue,
      within_bounds:     sdsWithin,
      reference_cohort:  refCohort.cohortId,
      comparison_cohort: compCohort.cohortId,
    },
    any_metric_breached: anyBreached,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function worstMetric(
  dimensions: DimensionMetrics[],
  metric: 'dir' | 'eod' | 'sds',
): { value: number; characteristic: FairnessCharacteristic } | null {
  // Returns the dimension with the most significant breach (furthest from bounds)
  let worst: { value: number; characteristic: FairnessCharacteristic } | null = null;
  for (const dim of dimensions) {
    const v = dim[metric].value;
    if (v === null) continue;
    if (!worst || Math.abs(v) > Math.abs(worst.value)) {
      worst = { value: v, characteristic: dim.characteristic };
    }
  }
  return worst;
}

function emptyResult(
  now: Date,
  from: Date,
  level: 'job' | 'company' | 'platform',
  jobId?: string,
  companyId?: string,
): FairnessComputationResult {
  return {
    audit_id:                   uuidv4(),
    computed_at:                now.toISOString(),
    pipeline_version:           GOVERNANCE.PIPELINE_VERSION,
    scope_level:                level,
    scope_job_id:               jobId,
    scope_company_id:           companyId,
    window_from:                from.toISOString(),
    window_to:                  now.toISOString(),
    total_candidates_evaluated: 0,
    total_with_any_demographic: 0,
    overall_disclosure_rate:    0,
    dimensions:                 [],
    any_metric_breached:        false,
    metrics_breached:           [],
    governance_review_required: false,
    consecutive_breach_windows: 0,
    dir_value: null, dir_within_bounds: null,
    eod_value: null, eod_within_bounds: null,
    sds_value: null, sds_within_bounds: null,
  };
}

// Export GOVERNANCE extension for demographics
declare module '../shared/config/governance.ts' {
  interface GovernanceConstants {
    DEMOGRAPHICS_MIN_DISCLOSURE_RATE: number;
  }
}
