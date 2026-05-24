/**
 * FHP Nightly Fairness Computation Job
 *
 * Reads all match events within the rolling window, computes DIR, EOD,
 * and SDS per cohort, writes FairnessMetrics records, and raises governance
 * flags when thresholds are breached.
 *
 * See: specs/fairness-metrics.schema.json
 *      specs/bias-correction-spec.md §3
 *
 * Designed to run as a scheduled job (e.g. cron, cloud scheduler).
 * Entry point: runFairnessJob()
 */

import { v4 as uuidv4 }   from 'uuid';
import { GOVERNANCE }     from '../shared/config/governance.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MatchEventRecord {
  match_id:         string;
  candidate_id:     string;
  job_id:           string;
  company_id:       string;
  decision:         'matched' | 'not_matched' | 'borderline';
  overall_score:    number;
  cohort_ids:       string[];  // anonymised cohort memberships at time of match
  qualified:        boolean;   // passed constraint satisfaction (used for EOD)
  created_at:       string;
}

interface CohortStats {
  cohortId:      string;
  total:         number;
  matched:       number;
  qualifiedTotal: number;
  qualifiedMatched: number;
  scores:        number[];
}

interface MetricResult {
  value:        number | null;
  withinBounds: boolean | null;
  sampleCount:  number;
}

interface ComputedFairnessRecord {
  audit_id:           string;
  computed_at:        string;
  pipeline_version:   string;
  scope_level:        'job' | 'company' | 'platform';
  scope_job_id:       string | undefined;
  scope_company_id:   string | undefined;
  window_from:        string;
  window_to:          string;
  cohort_stats:       CohortStats[];
  dir:                MetricResult & { reference_cohort_id?: string; comparison_cohort_id?: string };
  eod:                MetricResult & { group_a_cohort_id?: string; group_b_cohort_id?: string };
  sds:                MetricResult & { reference_cohort_id?: string; comparison_cohort_id?: string };
  any_metric_breached:          boolean;
  governance_review_required:   boolean;
  metrics_breached:             string[];
  consecutive_breach_windows:   number;
  ghosting_summary?:            Record<string, unknown>;
}

// ── Match Event Store (stub interface) ────────────────────────────────────────

export interface MatchEventStore {
  getMatchesInWindow(from: Date, to: Date, companyId?: string, jobId?: string): Promise<MatchEventRecord[]>;
  getPreviousBreachCount(scopeKey: string): Promise<number>;
  saveMetrics(record: ComputedFairnessRecord): Promise<void>;
}

// ── Main job entry point ──────────────────────────────────────────────────────

export async function runFairnessJob(store: MatchEventStore): Promise<void> {
  const now  = new Date();
  const from = new Date(now.getTime() - GOVERNANCE.FAIRNESS_ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  console.log(`[FairnessJob] Starting computation for window ${from.toISOString()} → ${now.toISOString()}`);

  // ── Platform-level computation ─────────────────────────────────────────────
  const allMatches = await store.getMatchesInWindow(from, now);
  if (allMatches.length > 0) {
    const platformRecord = computeMetrics(allMatches, 'platform', from, now, store, undefined, undefined);
    await store.saveMetrics(await platformRecord);
    console.log(`[FairnessJob] Platform metrics saved (${allMatches.length} matches)`);
  }

  // ── Per-company computation ────────────────────────────────────────────────
  const companiesInWindow = [...new Set(allMatches.map(m => m.company_id))];
  for (const companyId of companiesInWindow) {
    const companyMatches = allMatches.filter(m => m.company_id === companyId);
    if (companyMatches.length < GOVERNANCE.MIN_COHORT_SIZE) {
      console.log(`[FairnessJob] Skipping company ${companyId}: insufficient matches (${companyMatches.length})`);
      continue;
    }
    const record = await computeMetrics(companyMatches, 'company', from, now, store, undefined, companyId);
    await store.saveMetrics(record);
  }

  // ── Per-job computation ────────────────────────────────────────────────────
  const jobsInWindow = [...new Set(allMatches.map(m => m.job_id))];
  for (const jobId of jobsInWindow) {
    const jobMatches = allMatches.filter(m => m.job_id === jobId);
    if (jobMatches.length < GOVERNANCE.MIN_COHORT_SIZE) continue;
    const record = await computeMetrics(jobMatches, 'job', from, now, store, jobId, undefined);
    await store.saveMetrics(record);
  }

  console.log(`[FairnessJob] Complete. Processed ${allMatches.length} matches across ${companiesInWindow.length} companies, ${jobsInWindow.length} jobs.`);
}

// ── Core metric computation ───────────────────────────────────────────────────

async function computeMetrics(
  matches:   MatchEventRecord[],
  level:     'platform' | 'company' | 'job',
  from:      Date,
  to:        Date,
  store:     MatchEventStore,
  jobId?:    string,
  companyId?: string,
): Promise<ComputedFairnessRecord> {

  // Build cohort stats
  const cohortMap = new Map<string, CohortStats>();

  for (const match of matches) {
    for (const cohortId of match.cohort_ids) {
      if (!cohortMap.has(cohortId)) {
        cohortMap.set(cohortId, {
          cohortId,
          total: 0, matched: 0,
          qualifiedTotal: 0, qualifiedMatched: 0,
          scores: [],
        });
      }
      const stats = cohortMap.get(cohortId)!;
      stats.total++;
      if (match.decision === 'matched') stats.matched++;
      if (match.qualified) {
        stats.qualifiedTotal++;
        if (match.decision === 'matched') stats.qualifiedMatched++;
      }
      stats.scores.push(match.overall_score);
    }
  }

  // Filter cohorts below minimum size
  const validCohorts = [...cohortMap.values()].filter(
    c => c.total >= GOVERNANCE.MIN_COHORT_SIZE,
  );

  // Pick reference cohort (largest by match volume)
  const sortedCohorts = [...validCohorts].sort((a, b) => b.total - a.total);
  const refCohort     = sortedCohorts[0];
  const compCohort    = sortedCohorts[1]; // next largest for pairwise comparison

  // ── DIR ────────────────────────────────────────────────────────────────────
  let dir: ComputedFairnessRecord['dir'] = {
    value: null, withinBounds: null, sampleCount: validCohorts.length,
  };

  if (refCohort && compCohort) {
    const refRate  = refCohort.matched  / refCohort.total;
    const compRate = compCohort.matched / compCohort.total;
    const dirValue = refRate > 0 ? compRate / refRate : null;

    dir = {
      value:                dirValue,
      withinBounds:         dirValue !== null
                            ? (dirValue >= GOVERNANCE.DIR_LOWER_BOUND && dirValue <= GOVERNANCE.DIR_UPPER_BOUND)
                            : null,
      sampleCount:          validCohorts.length,
      reference_cohort_id:  refCohort.cohortId,
      comparison_cohort_id: compCohort.cohortId,
    };
  }

  // ── EOD ────────────────────────────────────────────────────────────────────
  let eod: ComputedFairnessRecord['eod'] = {
    value: null, withinBounds: null, sampleCount: validCohorts.length,
  };

  if (refCohort && compCohort && refCohort.qualifiedTotal > 0 && compCohort.qualifiedTotal > 0) {
    const tprRef  = refCohort.qualifiedMatched  / refCohort.qualifiedTotal;
    const tprComp = compCohort.qualifiedMatched / compCohort.qualifiedTotal;
    const eodValue = tprRef - tprComp;

    eod = {
      value:              eodValue,
      withinBounds:       Math.abs(eodValue) < GOVERNANCE.EOD_THRESHOLD,
      sampleCount:        validCohorts.length,
      group_a_cohort_id:  refCohort.cohortId,
      group_b_cohort_id:  compCohort.cohortId,
    };
  }

  // ── SDS ────────────────────────────────────────────────────────────────────
  let sds: ComputedFairnessRecord['sds'] = {
    value: null, withinBounds: null, sampleCount: validCohorts.length,
  };

  if (refCohort && compCohort && refCohort.scores.length > 0 && compCohort.scores.length > 0) {
    const meanRef  = mean(refCohort.scores);
    const meanComp = mean(compCohort.scores);
    const sdsValue = meanRef - meanComp;

    sds = {
      value:                sdsValue,
      withinBounds:         Math.abs(sdsValue) < GOVERNANCE.SDS_THRESHOLD,
      sampleCount:          validCohorts.length,
      reference_cohort_id:  refCohort.cohortId,
      comparison_cohort_id: compCohort.cohortId,
    };
  }

  // ── Breach detection ───────────────────────────────────────────────────────
  const metricsBreach: string[] = [];
  if (dir.withinBounds === false) metricsBreach.push('disparate_impact_ratio');
  if (eod.withinBounds === false) metricsBreach.push('equal_opportunity_difference');
  if (sds.withinBounds === false) metricsBreach.push('score_distribution_skew');

  const anyBreached = metricsBreach.length > 0;
  const scopeKey    = `${level}:${jobId ?? companyId ?? 'platform'}`;
  const prevBreachCount = anyBreached ? await store.getPreviousBreachCount(scopeKey) : 0;
  const consecutiveBreaches = anyBreached ? prevBreachCount + 1 : 0;
  const govReviewRequired   = consecutiveBreaches >= GOVERNANCE.CONSECUTIVE_BREACH_BEFORE_REVIEW
                           || consecutiveBreaches >= GOVERNANCE.CONSECUTIVE_NO_IMPROVE_BEFORE_FOB;

  if (govReviewRequired) {
    console.warn(`[FairnessJob] GOVERNANCE REVIEW REQUIRED: ${scopeKey} has breached for ${consecutiveBreaches} consecutive windows`);
  }

  return {
    audit_id:           uuidv4(),
    computed_at:        new Date().toISOString(),
    pipeline_version:   GOVERNANCE.PIPELINE_VERSION,
    scope_level:        level,
    scope_job_id:       jobId,
    scope_company_id:   companyId,
    window_from:        from.toISOString(),
    window_to:          to.toISOString(),
    cohort_stats:       [...cohortMap.values()].map(c => ({
      ...c,
      // Suppress counts below minimum size for privacy
      total:           c.total >= GOVERNANCE.MIN_COHORT_SIZE ? c.total : -1,
      matched:         c.total >= GOVERNANCE.MIN_COHORT_SIZE ? c.matched : -1,
      scores:          c.total >= GOVERNANCE.MIN_COHORT_SIZE ? c.scores : [],
    })),
    dir,
    eod,
    sds,
    any_metric_breached:        anyBreached,
    governance_review_required: govReviewRequired,
    metrics_breached:           metricsBreach,
    consecutive_breach_windows: consecutiveBreaches,
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
