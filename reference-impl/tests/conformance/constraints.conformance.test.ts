/**
 * FHP Conformance Tests — Constraint Satisfaction
 * See: specs/matching-engine-spec.md Stage 3
 */

import { describe, it, expect } from 'vitest';
import { GOVERNANCE } from '../../shared/config/governance.ts';
import { computeSkillScore } from '../../matching-engine/utils/proficiency.ts';

describe('Constraint satisfaction — skill rules (matching-engine-spec.md Stage 3)', () => {

  it('a skill exactly one level below passes with partial credit', () => {
    // practitioner vs required proficient: should NOT be a hard fail (only one step below)
    const q = computeSkillScore('practitioner', 'proficient');
    expect(q).toBeGreaterThan(0);
    // This is partial credit, so constraint is NOT failed
  });

  it('a skill two levels below is a hard constraint failure', () => {
    // aware vs required proficient: two levels below → q=0 → hard fail
    const q = computeSkillScore('aware', 'proficient');
    expect(q).toBe(0.0);
  });

  it('a skill three levels below is a hard constraint failure', () => {
    const q = computeSkillScore('aware', 'expert');
    expect(q).toBe(0.0);
  });

  it('an absent skill (null) is always a constraint failure', () => {
    const q = computeSkillScore(null, 'aware'); // even the lowest requirement
    expect(q).toBe(0.0);
  });

  it('a skill at authority satisfies any requirement level', () => {
    const levels: Array<[any, any]> = [
      ['authority', 'aware'],
      ['authority', 'practitioner'],
      ['authority', 'proficient'],
      ['authority', 'expert'],
      ['authority', 'authority'],
    ];
    for (const [candidate, required] of levels) {
      expect(computeSkillScore(candidate, required)).toBe(1.0);
    }
  });
});

describe('Salary constraint tolerance (matching-engine-spec.md Stage 3)', () => {
  it('salary tolerance constant is 0.85', () => {
    expect(GOVERNANCE.SALARY_HARD_FAIL_TOLERANCE).toBe(0.85);
  });

  it('job max >= 85% of candidate minimum: no hard fail', () => {
    const jobMax   = 50_000;
    const candMin  = 55_000;
    const passes   = jobMax >= candMin * GOVERNANCE.SALARY_HARD_FAIL_TOLERANCE;
    // 50000 >= 55000 * 0.85 = 46750 → passes
    expect(passes).toBe(true);
  });

  it('job max < 85% of candidate minimum: hard fail', () => {
    const jobMax   = 40_000;
    const candMin  = 55_000;
    const passes   = jobMax >= candMin * GOVERNANCE.SALARY_HARD_FAIL_TOLERANCE;
    // 40000 < 46750 → hard fail
    expect(passes).toBe(false);
  });
});
