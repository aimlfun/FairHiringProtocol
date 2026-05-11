/**
 * FHP Cohort Service — Production Implementation
 *
 * Translates raw demographic data into opaque cohort IDs.
 * This is the only component that reads matching.candidate_demographics.
 * It uses the fhp_fairness_service DB connection.
 *
 * Design principles:
 *   1. Raw values never leave this module.
 *   2. Cohort IDs are opaque — 'cohort:sex_group:A', not 'cohort:sex_group:female'.
 *      The mapping from raw value to label is defined here and nowhere else.
 *   3. Candidates with 'prefer_not_to_say' are assigned to a separate cohort,
 *      not excluded. This allows us to detect if "prefer not to say" candidates
 *      are systematically disadvantaged.
 *   4. Missing data (NULL field) means NO cohort assignment for that dimension.
 *      This is different from 'prefer_not_to_say'.
 *   5. Data Insufficient: if fewer than MIN_DISCLOSURE_RATE of candidates in a
 *      cohort window have provided demographic data, the fairness computation
 *      for that dimension is flagged DATA_INSUFFICIENT and not used for
 *      escalation purposes.
 */

export type FairnessCharacteristic =
  | 'sex_group'
  | 'age_group'
  | 'ethnicity_group'
  | 'religion_group'
  | 'education_group'
  | 'employment_gap_group';

export interface CohortMembership {
  characteristic: FairnessCharacteristic;
  cohortId:       string;  // opaque — e.g. 'cohort:sex_group:A'
  dimension:      string;  // human-readable dimension name — for governance reports
}

export interface CohortService {
  getCohortsForCandidate(candidateId: string): Promise<CohortMembership[]>;
  assignCohortsForCandidate(candidateId: string, consentId: string, consentedAt: Date): Promise<CohortMembership[]>;
  getDisclosureRate(candidateIds: string[], characteristic: FairnessCharacteristic): Promise<number>;
}

// ── Cohort label mappings ──────────────────────────────────────────────────────
// Raw demographic values → opaque cohort labels.
// These labels are stable — changing them would break historical comparisons.
// The letters (A, B, C…) are deliberately meaningless outside this file.

const SEX_COHORTS: Record<string, string> = {
  male:              'cohort:sex_group:A',
  female:            'cohort:sex_group:B',
  intersex:          'cohort:sex_group:C',
  prefer_not_to_say: 'cohort:sex_group:X',
};

// ONS 2021 top-level groupings — more granular analysis requires larger sample sizes
const ETHNICITY_COHORTS: Record<string, string> = {
  white_british:              'cohort:ethnicity_group:A',
  white_irish:                'cohort:ethnicity_group:A',
  white_gypsy_traveller:      'cohort:ethnicity_group:B',
  white_roma:                 'cohort:ethnicity_group:B',
  white_other:                'cohort:ethnicity_group:A',
  mixed_white_black_caribbean: 'cohort:ethnicity_group:C',
  mixed_white_black_african:  'cohort:ethnicity_group:C',
  mixed_white_asian:          'cohort:ethnicity_group:C',
  mixed_other:                'cohort:ethnicity_group:C',
  asian_indian:               'cohort:ethnicity_group:D',
  asian_pakistani:            'cohort:ethnicity_group:D',
  asian_bangladeshi:          'cohort:ethnicity_group:D',
  asian_chinese:              'cohort:ethnicity_group:D',
  asian_other:                'cohort:ethnicity_group:D',
  black_african:              'cohort:ethnicity_group:E',
  black_caribbean:            'cohort:ethnicity_group:E',
  black_other:                'cohort:ethnicity_group:E',
  other_arab:                 'cohort:ethnicity_group:F',
  other_ethnic_group:         'cohort:ethnicity_group:F',
  prefer_not_to_say:          'cohort:ethnicity_group:X',
};

const RELIGION_COHORTS: Record<string, string> = {
  no_religion:        'cohort:religion_group:A',
  christian:          'cohort:religion_group:B',
  buddhist:           'cohort:religion_group:C',
  hindu:              'cohort:religion_group:D',
  jewish:             'cohort:religion_group:E',
  muslim:             'cohort:religion_group:F',
  sikh:               'cohort:religion_group:G',
  other_religion:     'cohort:religion_group:H',
  prefer_not_to_say:  'cohort:religion_group:X',
};

// Age bands — 10-year brackets except 16-24 (smaller working-age cohort)
// and 65+ (retirement/near-retirement)
function ageGroupCohort(birthYear: number): string {
  const age = new Date().getFullYear() - birthYear;
  if (age < 25) return 'cohort:age_group:A';  // 16-24
  if (age < 35) return 'cohort:age_group:B';  // 25-34
  if (age < 45) return 'cohort:age_group:C';  // 35-44
  if (age < 55) return 'cohort:age_group:D';  // 45-54
  if (age < 65) return 'cohort:age_group:E';  // 55-64
  return         'cohort:age_group:F';          // 65+
}

const EDUCATION_COHORTS: Record<string, string> = {
  no_formal_qualifications:          'cohort:education_group:A',
  gcse_or_equivalent:                'cohort:education_group:B',
  a_level_or_equivalent:             'cohort:education_group:C',
  foundation_degree_hnc_hnd:         'cohort:education_group:D',
  bachelors_degree:                  'cohort:education_group:E',
  postgraduate_certificate_diploma:  'cohort:education_group:F',
  masters_degree:                    'cohort:education_group:F',
  doctorate_phd:                     'cohort:education_group:G',
  professional_qualification:        'cohort:education_group:F',
  apprenticeship_level_4_plus:       'cohort:education_group:D',
  self_taught_bootcamp:              'cohort:education_group:C',
  prefer_not_to_say:                 'cohort:education_group:X',
};

// Cohort dimension labels for governance reports
const DIMENSION_LABELS: Record<FairnessCharacteristic, string> = {
  sex_group:              'Sex',
  age_group:              'Age',
  ethnicity_group:        'Ethnicity',
  religion_group:         'Religion or belief',
  education_group:        'Education level',
  employment_gap_group:   'Employment gap',
};

// ── Database interface ─────────────────────────────────────────────────────────

export interface DemographicsStore {
  getDemographics(candidateId: string): Promise<{
    sex?:             string | null;
    ethnicity?:       string | null;
    religion?:        string | null;
    birth_year?:      number | null;
    education_level?: string | null;
  } | null>;

  saveCohortMemberships(
    candidateId: string,
    memberships: CohortMembership[],
    consentId: string,
    consentedAt: Date,
  ): Promise<void>;

  getCohortMemberships(candidateId: string): Promise<CohortMembership[]>;
}

// ── Production cohort service ─────────────────────────────────────────────────

export class FHPCohortService implements CohortService {
  constructor(private store: DemographicsStore) {}

  /**
   * Get current cohort memberships for a candidate.
   * Returns only the opaque IDs — never the raw demographic values.
   */
  async getCohortsForCandidate(candidateId: string): Promise<CohortMembership[]> {
    return this.store.getCohortMemberships(candidateId);
  }

  /**
   * Compute and save cohort assignments from raw demographic data.
   * Called by the nightly fairness job or when demographics are updated.
   * This is the ONLY place raw demographics are read and transformed.
   */
  async assignCohortsForCandidate(
    candidateId: string,
    consentId: string,
    consentedAt: Date,
  ): Promise<CohortMembership[]> {
    const demographics = await this.store.getDemographics(candidateId);

    if (!demographics) {
      return [];  // No demographics provided — no cohort assignments
    }

    const memberships: CohortMembership[] = [];

    // Sex
    if (demographics.sex && demographics.sex in SEX_COHORTS) {
      memberships.push({
        characteristic: 'sex_group',
        cohortId:       SEX_COHORTS[demographics.sex],
        dimension:      DIMENSION_LABELS.sex_group,
      });
    }

    // Ethnicity
    if (demographics.ethnicity && demographics.ethnicity in ETHNICITY_COHORTS) {
      memberships.push({
        characteristic: 'ethnicity_group',
        cohortId:       ETHNICITY_COHORTS[demographics.ethnicity],
        dimension:      DIMENSION_LABELS.ethnicity_group,
      });
    }

    // Religion
    if (demographics.religion && demographics.religion in RELIGION_COHORTS) {
      memberships.push({
        characteristic: 'religion_group',
        cohortId:       RELIGION_COHORTS[demographics.religion],
        dimension:      DIMENSION_LABELS.religion_group,
      });
    }

    // Age — computed from birth_year
    if (demographics.birth_year) {
      memberships.push({
        characteristic: 'age_group',
        cohortId:       ageGroupCohort(demographics.birth_year),
        dimension:      DIMENSION_LABELS.age_group,
      });
    }

    // Education
    if (demographics.education_level && demographics.education_level in EDUCATION_COHORTS) {
      memberships.push({
        characteristic: 'education_group',
        cohortId:       EDUCATION_COHORTS[demographics.education_level],
        dimension:      DIMENSION_LABELS.education_group,
      });
    }

    if (memberships.length > 0) {
      await this.store.saveCohortMemberships(candidateId, memberships, consentId, consentedAt);
    }

    return memberships;
  }

  /**
   * Computes the disclosure rate for a given dimension across a set of candidates.
   * Returns the fraction who provided data for that characteristic.
   *
   * If the rate is below DEMOGRAPHICS_MIN_DISCLOSURE_RATE, the fairness job
   * should flag the metric as DATA_INSUFFICIENT rather than escalating.
   */
  async getDisclosureRate(
    candidateIds: string[],
    characteristic: FairnessCharacteristic,
  ): Promise<number> {
    if (candidateIds.length === 0) return 0;
    const memberships = await Promise.all(
      candidateIds.map(id => this.store.getCohortMemberships(id))
    );
    const withData = memberships.filter(
      m => m.some(c => c.characteristic === characteristic)
    ).length;
    return withData / candidateIds.length;
  }
}

// ── Stub implementation (for reference impl testing) ─────────────────────────

export class StubCohortService implements CohortService {
  private cohorts: Map<string, CohortMembership[]> = new Map();

  /** Seed known demographics for testing */
  seed(candidateId: string, memberships: CohortMembership[]): void {
    this.cohorts.set(candidateId, memberships);
  }

  async getCohortsForCandidate(candidateId: string): Promise<CohortMembership[]> {
    return this.cohorts.get(candidateId) ?? [];
  }

  async assignCohortsForCandidate(
    candidateId: string,
    _consentId: string,
    _consentedAt: Date,
  ): Promise<CohortMembership[]> {
    return this.cohorts.get(candidateId) ?? [];
  }

  async getDisclosureRate(candidateIds: string[], characteristic: FairnessCharacteristic): Promise<number> {
    const withData = candidateIds.filter(id => {
      const m = this.cohorts.get(id) ?? [];
      return m.some(c => c.characteristic === characteristic);
    }).length;
    return candidateIds.length > 0 ? withData / candidateIds.length : 0;
  }
}

// ── Export cohort mapping details for tests ───────────────────────────────────
// Allows tests to verify that a given raw value maps to the expected cohort ID.
export const COHORT_MAPPINGS = {
  sex:       SEX_COHORTS,
  ethnicity: ETHNICITY_COHORTS,
  religion:  RELIGION_COHORTS,
  age:       ageGroupCohort,
  education: EDUCATION_COHORTS,
} as const;
