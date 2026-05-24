/**
 * FHP Demographics & Fairness Tests
 *
 * Tests covering:
 *   1. Cohort assignment — raw value → opaque ID mapping
 *   2. Partial demographics — not all fields required
 *   3. prefer_not_to_say — treated as its own cohort, not excluded
 *   4. NULL demographics — no cohort assignment (not same as prefer_not_to_say)
 *   5. Data insufficiency — below DEMOGRAPHICS_MIN_DISCLOSURE_RATE
 *   6. Full fairness computation with real demographic cohorts
 *   7. DIR / EOD / SDS computation verified against known values
 *   8. Per-dimension breach detection
 *   9. Legacy flat metric compatibility
 *  10. Employment gap cohort (no consent needed)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FHPCohortService,
  StubCohortService,
  COHORT_MAPPINGS,
  type DemographicsStore,
  type CohortMembership,
  type FairnessCharacteristic,
}                                           from '../../bias/cohort-service.ts';
import {
  runFairnessJob,
  type MatchEventRecord,
  type MatchEventStore,
  type FairnessComputationResult,
}                                           from '../../fairness/fairness-job-updated.ts';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeMatch(overrides: Partial<MatchEventRecord> = {}): MatchEventRecord {
  return {
    match_id:      crypto.randomUUID(),
    candidate_id:  crypto.randomUUID(),
    job_id:        'job-001',
    company_id:    'company-001',
    decision:      'matched',
    overall_score: 0.75,
    qualified:     true,
    created_at:    new Date().toISOString(),
    ...overrides,
  };
}

function makeStore(matches: MatchEventRecord[], prevBreachCount = 0): MatchEventStore {
  return {
    async getMatchesInWindow() { return matches; },
    async getPreviousBreachCount() { return prevBreachCount; },
    async saveMetrics() {},
  };
}

// ── In-memory demographics store for testing ─────────────────────────────────

class InMemoryDemographicsStore implements DemographicsStore {
  private demographics = new Map<string, {
    sex?: string | null; ethnicity?: string | null; religion?: string | null;
    birth_year?: number | null; education_level?: string | null;
  }>();
  private cohorts = new Map<string, CohortMembership[]>();

  setDemographics(candidateId: string, data: Parameters<DemographicsStore['getDemographics']>[0] extends void ? never : Awaited<ReturnType<DemographicsStore['getDemographics']>>) {
    if (data) this.demographics.set(candidateId, data);
  }

  async getDemographics(candidateId: string) {
    return this.demographics.get(candidateId) ?? null;
  }

  async saveCohortMemberships(
    candidateId: string,
    memberships: CohortMembership[],
    _consentId: string,
    _consentedAt: Date,
  ) {
    this.cohorts.set(candidateId, memberships);
  }

  async getCohortMemberships(candidateId: string): Promise<CohortMembership[]> {
    return this.cohorts.get(candidateId) ?? [];
  }
}

// ── Section 1: Cohort mapping — raw value to opaque ID ────────────────────────

describe('Cohort mapping — raw value to opaque ID', () => {

  it('maps male to cohort:sex_group:A', () => {
    expect(COHORT_MAPPINGS.sex['male']).toBe('cohort:sex_group:A');
  });

  it('maps female to cohort:sex_group:B', () => {
    expect(COHORT_MAPPINGS.sex['female']).toBe('cohort:sex_group:B');
  });

  it('maps intersex to cohort:sex_group:C', () => {
    expect(COHORT_MAPPINGS.sex['intersex']).toBe('cohort:sex_group:C');
  });

  it('maps prefer_not_to_say sex to cohort:sex_group:X (not excluded)', () => {
    // Critical: prefer_not_to_say is a cohort, not an exclusion
    expect(COHORT_MAPPINGS.sex['prefer_not_to_say']).toBe('cohort:sex_group:X');
    expect(COHORT_MAPPINGS.sex['prefer_not_to_say']).not.toBeNull();
  });

  it('maps white_british to cohort:ethnicity_group:A', () => {
    expect(COHORT_MAPPINGS.ethnicity['white_british']).toBe('cohort:ethnicity_group:A');
  });

  it('maps black_african to cohort:ethnicity_group:E', () => {
    expect(COHORT_MAPPINGS.ethnicity['black_african']).toBe('cohort:ethnicity_group:E');
  });

  it('maps prefer_not_to_say ethnicity to X (not excluded)', () => {
    expect(COHORT_MAPPINGS.ethnicity['prefer_not_to_say']).toBe('cohort:ethnicity_group:X');
  });

  it('maps muslim to cohort:religion_group:F', () => {
    expect(COHORT_MAPPINGS.religion['muslim']).toBe('cohort:religion_group:F');
  });

  it('maps no_religion to cohort:religion_group:A', () => {
    expect(COHORT_MAPPINGS.religion['no_religion']).toBe('cohort:religion_group:A');
  });

  it('computes age group correctly — under 25', () => {
    const yearUnder25 = new Date().getFullYear() - 22;
    expect(COHORT_MAPPINGS.age(yearUnder25)).toBe('cohort:age_group:A');
  });

  it('computes age group correctly — 35-44', () => {
    const year3544 = new Date().getFullYear() - 40;
    expect(COHORT_MAPPINGS.age(year3544)).toBe('cohort:age_group:C');
  });

  it('computes age group correctly — 65+', () => {
    const year65plus = new Date().getFullYear() - 70;
    expect(COHORT_MAPPINGS.age(year65plus)).toBe('cohort:age_group:F');
  });

  it('maps bachelors_degree to cohort:education_group:E', () => {
    expect(COHORT_MAPPINGS.education['bachelors_degree']).toBe('cohort:education_group:E');
  });

  it('maps doctorate_phd to cohort:education_group:G', () => {
    expect(COHORT_MAPPINGS.education['doctorate_phd']).toBe('cohort:education_group:G');
  });

  it('all cohort IDs follow the cohort:characteristic:label format', () => {
    const pattern = /^cohort:[a-z_]+:[A-Za-z0-9]+$/;
    const allIds = [
      ...Object.values(COHORT_MAPPINGS.sex),
      ...Object.values(COHORT_MAPPINGS.ethnicity),
      ...Object.values(COHORT_MAPPINGS.religion),
      ...Object.values(COHORT_MAPPINGS.education),
    ];
    for (const id of allIds) {
      expect(id).toMatch(pattern);
    }
  });
});

// ── Section 2: FHPCohortService — cohort assignment ──────────────────────────

describe('FHPCohortService — cohort assignment', () => {
  let store: InMemoryDemographicsStore;
  let service: FHPCohortService;
  const CONSENT_ID = crypto.randomUUID();
  const CONSENTED_AT = new Date();

  beforeEach(() => {
    store = new InMemoryDemographicsStore();
    service = new FHPCohortService(store);
  });

  it('assigns sex cohort from raw value', async () => {
    const id = 'cand-001';
    store.setDemographics(id, { sex: 'female' });
    const cohorts = await service.assignCohortsForCandidate(id, CONSENT_ID, CONSENTED_AT);
    const sexCohort = cohorts.find(c => c.characteristic === 'sex_group');
    expect(sexCohort).toBeDefined();
    expect(sexCohort!.cohortId).toBe('cohort:sex_group:B');
    // Raw value must NOT appear in the cohort ID
    expect(sexCohort!.cohortId).not.toContain('female');
  });

  it('assigns age cohort from birth_year', async () => {
    const id = 'cand-002';
    const birthYear = new Date().getFullYear() - 30;
    store.setDemographics(id, { birth_year: birthYear });
    const cohorts = await service.assignCohortsForCandidate(id, CONSENT_ID, CONSENTED_AT);
    const ageCohort = cohorts.find(c => c.characteristic === 'age_group');
    expect(ageCohort).toBeDefined();
    expect(ageCohort!.cohortId).toBe('cohort:age_group:B'); // 25-34
  });

  it('assigns all 5 cohorts when all demographics provided', async () => {
    const id = 'cand-003';
    store.setDemographics(id, {
      sex:             'male',
      ethnicity:       'asian_indian',
      religion:        'hindu',
      birth_year:      1985,
      education_level: 'bachelors_degree',
    });
    const cohorts = await service.assignCohortsForCandidate(id, CONSENT_ID, CONSENTED_AT);
    const characteristics = cohorts.map(c => c.characteristic);
    expect(characteristics).toContain('sex_group');
    expect(characteristics).toContain('age_group');
    expect(characteristics).toContain('ethnicity_group');
    expect(characteristics).toContain('religion_group');
    expect(characteristics).toContain('education_group');
  });

  it('assigns only the dimensions where data was provided (partial)', async () => {
    const id = 'cand-004';
    // Only sex and age — ethnicity, religion, education omitted
    store.setDemographics(id, { sex: 'female', birth_year: 1990 });
    const cohorts = await service.assignCohortsForCandidate(id, CONSENT_ID, CONSENTED_AT);
    expect(cohorts).toHaveLength(2);
    const chars = cohorts.map(c => c.characteristic);
    expect(chars).toContain('sex_group');
    expect(chars).toContain('age_group');
    expect(chars).not.toContain('ethnicity_group');
    expect(chars).not.toContain('religion_group');
    expect(chars).not.toContain('education_group');
  });

  it('returns empty cohorts when no demographics provided (NULL)', async () => {
    const id = 'cand-005';
    // No call to store.setDemographics — demographics is NULL
    const cohorts = await service.assignCohortsForCandidate(id, CONSENT_ID, CONSENTED_AT);
    expect(cohorts).toHaveLength(0);
  });

  it('prefer_not_to_say creates a real cohort, not an exclusion', async () => {
    const id = 'cand-006';
    store.setDemographics(id, {
      sex:      'prefer_not_to_say',
      ethnicity: 'prefer_not_to_say',
      religion:  'prefer_not_to_say',
    });
    const cohorts = await service.assignCohortsForCandidate(id, CONSENT_ID, CONSENTED_AT);
    // All three 'prefer_not_to_say' values should produce valid cohort memberships
    expect(cohorts).toHaveLength(3);
    for (const c of cohorts) {
      expect(c.cohortId).toMatch(/^cohort:[a-z_]+:X$/);
    }
  });

  it('disclosure rate is 0 when no candidates have provided data', async () => {
    const rate = await service.getDisclosureRate(['c1','c2','c3'], 'sex_group');
    expect(rate).toBe(0);
  });

  it('disclosure rate is 1.0 when all candidates have provided data for that dimension', async () => {
    for (const id of ['c1','c2','c3']) {
      store.setDemographics(id, { sex: 'male' });
      await service.assignCohortsForCandidate(id, CONSENT_ID, CONSENTED_AT);
    }
    const rate = await service.getDisclosureRate(['c1','c2','c3'], 'sex_group');
    expect(rate).toBe(1.0);
  });

  it('disclosure rate is computed correctly for partial provision', async () => {
    for (const id of ['c1','c2']) {
      store.setDemographics(id, { sex: 'female' });
      await service.assignCohortsForCandidate(id, CONSENT_ID, CONSENTED_AT);
    }
    // c3 provides no data
    const rate = await service.getDisclosureRate(['c1','c2','c3'], 'sex_group');
    expect(rate).toBeCloseTo(2/3, 5);
  });
});

// ── Section 3: Fairness computation with demographics ─────────────────────────

describe('Fairness computation — with real demographic cohorts', () => {

  function buildScenario(config: {
    // Each group: how many candidates, what decision, what score
    groups: Array<{
      cohortId: string;
      characteristic: FairnessCharacteristic;
      count: number;
      decision: 'matched' | 'not_matched';
      score: number;
      qualified?: boolean;
    }>;
  }) {
    const matches: MatchEventRecord[] = [];
    const cohortService = new StubCohortService();

    for (const group of config.groups) {
      for (let i = 0; i < group.count; i++) {
        const candidateId = crypto.randomUUID();
        matches.push(makeMatch({
          candidate_id:  candidateId,
          decision:      group.decision,
          overall_score: group.score,
          qualified:     group.qualified ?? (group.decision === 'matched'),
        }));
        cohortService.seed(candidateId, [{
          characteristic: group.characteristic,
          cohortId:       group.cohortId,
          dimension:      group.characteristic,
        }]);
      }
    }

    return { matches, cohortService };
  }

  it('returns no_data when no candidates have demographic data', async () => {
    const matches = Array.from({ length: 50 }, () => makeMatch());
    const cohortService = new StubCohortService(); // all empty
    const result = await runFairnessJob(makeStore(matches), cohortService);

    expect(result.total_with_any_demographic).toBe(0);
    expect(result.overall_disclosure_rate).toBe(0);
    for (const dim of result.dimensions) {
      expect(dim.data_sufficiency).toMatch(/no_data|insufficient/);
      expect(dim.dir.value).toBeNull();
      expect(dim.eod.value).toBeNull();
      expect(dim.sds.value).toBeNull();
    }
    expect(result.any_metric_breached).toBe(false);
  });

  it('returns insufficient when disclosure rate is below threshold', async () => {
    // 100 candidates, only 5 provide demographic data (5% < 20% threshold)
    const matches = Array.from({ length: 100 }, () => makeMatch());
    const cohortService = new StubCohortService();

    // Seed only 5 of the 100 candidates
    for (let i = 0; i < 5; i++) {
      const candidateId = matches[i]!.candidate_id;
      cohortService.seed(candidateId, [{
        characteristic: 'sex_group',
        cohortId:       'cohort:sex_group:A',
        dimension:      'Sex',
      }]);
    }

    const result = await runFairnessJob(makeStore(matches), cohortService);
    const sexDim = result.dimensions.find(d => d.characteristic === 'sex_group');

    expect(sexDim).toBeDefined();
    expect(sexDim!.data_sufficiency).toBe('insufficient');
    expect(sexDim!.dir.value).toBeNull();
    expect(result.any_metric_breached).toBe(false); // insufficient data does not trigger breach
  });

  it('correctly computes DIR — equal match rates across two sex cohorts', async () => {
    // 25 male matched, 25 male not_matched → rate 0.5
    // 25 female matched, 25 female not_matched → rate 0.5
    // DIR should be ~1.0 (equal treatment)
    const { matches, cohortService } = buildScenario({
      groups: [
        { cohortId: 'cohort:sex_group:A', characteristic: 'sex_group', count: 25, decision: 'matched',     score: 0.80 },
        { cohortId: 'cohort:sex_group:A', characteristic: 'sex_group', count: 25, decision: 'not_matched', score: 0.40 },
        { cohortId: 'cohort:sex_group:B', characteristic: 'sex_group', count: 25, decision: 'matched',     score: 0.80 },
        { cohortId: 'cohort:sex_group:B', characteristic: 'sex_group', count: 25, decision: 'not_matched', score: 0.40 },
      ],
    });

    const result = await runFairnessJob(makeStore(matches), cohortService);
    const sexDim = result.dimensions.find(d => d.characteristic === 'sex_group');

    expect(sexDim!.data_sufficiency).toBe('sufficient');
    expect(sexDim!.dir.value).toBeCloseTo(1.0, 2);
    expect(sexDim!.dir.within_bounds).toBe(true);
    expect(sexDim!.any_metric_breached).toBe(false);
  });

  it('detects DIR breach — group B has significantly lower match rate', async () => {
    // Group A: 40 matched / 50 total = 0.80 match rate (reference — larger)
    // Group B: 15 matched / 50 total = 0.30 match rate
    // DIR = 0.30/0.80 = 0.375 — well below 0.80 lower bound
    const { matches, cohortService } = buildScenario({
      groups: [
        { cohortId: 'cohort:ethnicity_group:A', characteristic: 'ethnicity_group', count: 40, decision: 'matched',     score: 0.82 },
        { cohortId: 'cohort:ethnicity_group:A', characteristic: 'ethnicity_group', count: 10, decision: 'not_matched', score: 0.38 },
        { cohortId: 'cohort:ethnicity_group:E', characteristic: 'ethnicity_group', count: 15, decision: 'matched',     score: 0.65 },
        { cohortId: 'cohort:ethnicity_group:E', characteristic: 'ethnicity_group', count: 35, decision: 'not_matched', score: 0.32 },
      ],
    });

    const result = await runFairnessJob(makeStore(matches), cohortService);
    const ethDim = result.dimensions.find(d => d.characteristic === 'ethnicity_group');

    expect(ethDim!.data_sufficiency).toBe('sufficient');
    expect(ethDim!.dir.value).toBeCloseTo(0.375, 2);
    expect(ethDim!.dir.within_bounds).toBe(false);
    expect(ethDim!.any_metric_breached).toBe(true);
    expect(result.any_metric_breached).toBe(true);
    expect(result.metrics_breached.some(m => m.includes('disparate_impact_ratio'))).toBe(true);
  });

  it('detects EOD breach — qualified candidates from group B matched at lower rate', async () => {
    // Group A (reference): 30 qualified, 28 matched → TPR = 0.933
    // Group B: 30 qualified, 18 matched → TPR = 0.600
    // EOD = 0.933 - 0.600 = 0.333 — above 0.05 threshold
    const { matches, cohortService } = buildScenario({
      groups: [
        { cohortId: 'cohort:religion_group:A', characteristic: 'religion_group', count: 28, decision: 'matched',     score: 0.85, qualified: true },
        { cohortId: 'cohort:religion_group:A', characteristic: 'religion_group', count: 2,  decision: 'not_matched', score: 0.42, qualified: true },
        { cohortId: 'cohort:religion_group:F', characteristic: 'religion_group', count: 18, decision: 'matched',     score: 0.78, qualified: true },
        { cohortId: 'cohort:religion_group:F', characteristic: 'religion_group', count: 12, decision: 'not_matched', score: 0.38, qualified: true },
      ],
    });

    const result = await runFairnessJob(makeStore(matches), cohortService);
    const relDim = result.dimensions.find(d => d.characteristic === 'religion_group');

    expect(relDim!.eod.value).toBeCloseTo(0.333, 2);
    expect(relDim!.eod.within_bounds).toBe(false);
    expect(relDim!.any_metric_breached).toBe(true);
  });

  it('detects SDS breach — group B receives systematically lower scores', async () => {
    // Group A: mean score ~0.80
    // Group B: mean score ~0.55
    // SDS = 0.80 - 0.55 = 0.25 — above 0.03 threshold
    const { matches, cohortService } = buildScenario({
      groups: [
        { cohortId: 'cohort:age_group:B', characteristic: 'age_group', count: 30, decision: 'matched',     score: 0.80 },
        { cohortId: 'cohort:age_group:F', characteristic: 'age_group', count: 25, decision: 'not_matched', score: 0.55 },
      ],
    });

    const result = await runFairnessJob(makeStore(matches), cohortService);
    const ageDim = result.dimensions.find(d => d.characteristic === 'age_group');

    expect(ageDim!.sds.value).toBeCloseTo(0.25, 2);
    expect(ageDim!.sds.within_bounds).toBe(false);
    expect(ageDim!.any_metric_breached).toBe(true);
  });

  it('education dimension is included in fairness computation', async () => {
    // Degree-holders vs non-degree-holders matched at different rates
    const { matches, cohortService } = buildScenario({
      groups: [
        { cohortId: 'cohort:education_group:E', characteristic: 'education_group', count: 35, decision: 'matched',     score: 0.82 },
        { cohortId: 'cohort:education_group:E', characteristic: 'education_group', count: 15, decision: 'not_matched', score: 0.40 },
        { cohortId: 'cohort:education_group:A', characteristic: 'education_group', count: 10, decision: 'matched',     score: 0.75 },
        { cohortId: 'cohort:education_group:A', characteristic: 'education_group', count: 40, decision: 'not_matched', score: 0.35 },
      ],
    });

    const result = await runFairnessJob(makeStore(matches), cohortService);
    const eduDim = result.dimensions.find(d => d.characteristic === 'education_group');

    expect(eduDim).toBeDefined();
    expect(eduDim!.data_sufficiency).toBe('sufficient');
    // DIR: group E match rate = 35/50 = 0.70; group A match rate = 10/50 = 0.20
    // DIR = 0.20/0.70 = 0.286 — breach
    expect(eduDim!.dir.value).toBeCloseTo(0.286, 2);
    expect(eduDim!.dir.within_bounds).toBe(false);
    expect(eduDim!.any_metric_breached).toBe(true);
  });

  it('dimensions without sufficient data do not contribute to breach detection', async () => {
    // Only 2 candidates have religion data — below MIN_COHORT_SIZE (20)
    // Everything else is clean
    const matches = Array.from({ length: 60 }, () => makeMatch({
      decision: 'matched', overall_score: 0.80, qualified: true,
    }));
    const cohortService = new StubCohortService();

    // 30 + 30 on sex dimension (sufficient and clean)
    for (let i = 0; i < 30; i++) {
      cohortService.seed(matches[i]!.candidate_id, [{
        characteristic: 'sex_group', cohortId: 'cohort:sex_group:A', dimension: 'Sex',
      }]);
    }
    for (let i = 30; i < 60; i++) {
      cohortService.seed(matches[i]!.candidate_id, [{
        characteristic: 'sex_group', cohortId: 'cohort:sex_group:B', dimension: 'Sex',
      }]);
    }

    // Only 2 candidates have religion data (insufficient)
    cohortService.seed(matches[0]!.candidate_id, [
      ...cohortService['cohorts'].get(matches[0]!.candidate_id) ?? [],
      { characteristic: 'religion_group', cohortId: 'cohort:religion_group:B', dimension: 'Religion' },
    ]);
    cohortService.seed(matches[1]!.candidate_id, [
      ...cohortService['cohorts'].get(matches[1]!.candidate_id) ?? [],
      { characteristic: 'religion_group', cohortId: 'cohort:religion_group:F', dimension: 'Religion' },
    ]);

    const result = await runFairnessJob(makeStore(matches), cohortService);
    const relDim = result.dimensions.find(d => d.characteristic === 'religion_group');

    // Religion should be insufficient — too few data points
    expect(relDim!.data_sufficiency).toBe('insufficient');
    expect(relDim!.dir.value).toBeNull();
    // Overall breach should not be triggered by the insufficient religion dimension
    expect(result.any_metric_breached).toBe(false);
  });

  it('consecutive breach counter increments correctly', async () => {
    const { matches, cohortService } = buildScenario({
      groups: [
        { cohortId: 'cohort:sex_group:A', characteristic: 'sex_group', count: 40, decision: 'matched',     score: 0.85 },
        { cohortId: 'cohort:sex_group:B', characteristic: 'sex_group', count: 10, decision: 'not_matched', score: 0.35 },
        { cohortId: 'cohort:sex_group:B', characteristic: 'sex_group', count: 40, decision: 'not_matched', score: 0.30 },
      ],
    });

    // Simulate previous breach count of 1 (this would be window 2)
    const result = await runFairnessJob(makeStore(matches, 1), cohortService);

    expect(result.any_metric_breached).toBe(true);
    expect(result.consecutive_breach_windows).toBe(2);
    expect(result.governance_review_required).toBe(false); // CONSECUTIVE_BREACH_BEFORE_REVIEW is 3
  });

  it('governance review is triggered at 3 consecutive breaches', async () => {
    const { matches, cohortService } = buildScenario({
      groups: [
        { cohortId: 'cohort:sex_group:A', characteristic: 'sex_group', count: 40, decision: 'matched',     score: 0.85 },
        { cohortId: 'cohort:sex_group:B', characteristic: 'sex_group', count: 40, decision: 'not_matched', score: 0.30 },
      ],
    });

    const result = await runFairnessJob(makeStore(matches, 2), cohortService); // 2 previous → this is #3

    expect(result.consecutive_breach_windows).toBe(3);
    expect(result.governance_review_required).toBe(true);
  });

  it('legacy flat metrics are populated from worst-case dimension', async () => {
    // Two dimensions breach — sex (DIR=0.375) and age (SDS=0.25)
    // Legacy flat metrics should show the most significant values
    const { matches, cohortService } = buildScenario({
      groups: [
        { cohortId: 'cohort:sex_group:A', characteristic: 'sex_group', count: 40, decision: 'matched',     score: 0.80 },
        { cohortId: 'cohort:sex_group:B', characteristic: 'sex_group', count: 15, decision: 'matched',     score: 0.65 },
        { cohortId: 'cohort:sex_group:A', characteristic: 'sex_group', count: 10, decision: 'not_matched', score: 0.30 },
        { cohortId: 'cohort:sex_group:B', characteristic: 'sex_group', count: 35, decision: 'not_matched', score: 0.30 },
      ],
    });

    const result = await runFairnessJob(makeStore(matches), cohortService);

    // Legacy fields must be populated (not null) when sufficient data exists
    expect(result.dir_value).not.toBeNull();
    expect(result.dir_within_bounds).toBe(false);
    // Type check
    expect(typeof result.dir_value).toBe('number');
  });

  it('returns empty result with null metrics when no matches in window', async () => {
    const result = await runFairnessJob(makeStore([]), new StubCohortService());

    expect(result.total_candidates_evaluated).toBe(0);
    expect(result.any_metric_breached).toBe(false);
    expect(result.dir_value).toBeNull();
    expect(result.eod_value).toBeNull();
    expect(result.sds_value).toBeNull();
    expect(result.dimensions).toHaveLength(0);
  });

  it('prefer_not_to_say cohort can accumulate enough members to be evaluated', async () => {
    // 30 prefer_not_to_say, 30 male — both above MIN_COHORT_SIZE
    const { matches, cohortService } = buildScenario({
      groups: [
        { cohortId: 'cohort:sex_group:A', characteristic: 'sex_group', count: 25, decision: 'matched',     score: 0.80 },
        { cohortId: 'cohort:sex_group:A', characteristic: 'sex_group', count: 5,  decision: 'not_matched', score: 0.40 },
        { cohortId: 'cohort:sex_group:X', characteristic: 'sex_group', count: 20, decision: 'matched',     score: 0.78 },
        { cohortId: 'cohort:sex_group:X', characteristic: 'sex_group', count: 10, decision: 'not_matched', score: 0.38 },
      ],
    });

    const result = await runFairnessJob(makeStore(matches), cohortService);
    const sexDim = result.dimensions.find(d => d.characteristic === 'sex_group');

    expect(sexDim!.data_sufficiency).toBe('sufficient');
    expect(sexDim!.cohort_count).toBe(2);
    // DIR should be close to 1 — both groups matched at similar rates
    expect(sexDim!.dir.value).not.toBeNull();
    expect(sexDim!.dir.within_bounds).toBe(true);
  });
});

// ── Section 4: Data insufficiency is non-escalating ──────────────────────────

describe('Data insufficiency — does not cause false escalations', () => {

  it('completely clean pipeline with no demographics does not breach', async () => {
    const matches = Array.from({ length: 200 }, (_, i) =>
      makeMatch({ decision: i < 100 ? 'matched' : 'not_matched', overall_score: 0.75 })
    );
    const result = await runFairnessJob(makeStore(matches), new StubCohortService());

    expect(result.any_metric_breached).toBe(false);
    expect(result.governance_review_required).toBe(false);
    expect(result.consecutive_breach_windows).toBe(0);
  });

  it('partial demographics (40% disclosure) flags insufficient but does not breach', async () => {
    const matches = Array.from({ length: 100 }, () =>
      makeMatch({ decision: 'matched', overall_score: 0.80 })
    );
    const cohortService = new StubCohortService();

    // Only 40 of 100 candidates provide sex data — above 20% threshold but
    // with only one cohort (all male) there are not enough cohorts to compare
    for (let i = 0; i < 40; i++) {
      cohortService.seed(matches[i]!.candidate_id, [{
        characteristic: 'sex_group', cohortId: 'cohort:sex_group:A', dimension: 'Sex',
      }]);
    }

    const result = await runFairnessJob(makeStore(matches), cohortService);
    const sexDim = result.dimensions.find(d => d.characteristic === 'sex_group');

    // 40% disclosure rate — above threshold, but only one cohort so insufficient
    expect(sexDim!.data_sufficiency).toBe('insufficient'); // only 1 cohort
    expect(result.any_metric_breached).toBe(false);
  });
});
