/**
 * FHP Cohort Service
 *
 * Resolves a candidate_id to their anonymous cohort memberships.
 * The matching engine never sees raw demographic data — only opaque cohort IDs.
 *
 * In production, this is a separate, privacy-preserving service.
 * This reference implementation provides a stub.
 */

export type FairnessCharacteristic =
  | 'gender_group'
  | 'age_group'
  | 'ethnicity_group'
  | 'disability_group'
  | 'location_group'
  | 'employment_gap_group';

export interface CohortMembership {
  characteristic: FairnessCharacteristic;
  cohortId:       string; // opaque label, never a raw demographic value
}

export interface CorrectionCandidate {
  metric:    'DIR' | 'EOD' | 'SDS';
  direction: 'upward' | 'downward';
  magnitude: number;
  cohortId:  string;
}

export interface CohortService {
  getCohorts(candidateId: string): Promise<CohortMembership[]>;
}

/**
 * Stub implementation — returns empty cohorts.
 * Production implementation connects to the privacy-preserving cohort store.
 */
export class StubCohortService implements CohortService {
  async getCohorts(_candidateId: string): Promise<CohortMembership[]> {
    // Stub: no cohort data available in reference impl
    // In production: query the anonymised cohort store by candidate_id
    return [];
  }
}
