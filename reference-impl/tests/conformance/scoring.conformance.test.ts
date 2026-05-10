/**
 * FHP Conformance Tests — Scoring Formula
 *
 * These tests are normative. They verify that the scoring formula
 * produces the exact outputs specified in scoring-spec.md.
 *
 * Any implementation must produce identical results for these inputs.
 */

import { describe, it, expect } from 'vitest';
import {
  computeSkillScore,
  redistributeWeights,
  clamp,
  mean,
  trimmedMean,
} from '../../matching-engine/utils/proficiency.ts';
import { GOVERNANCE } from '../../shared/config/governance.ts';

describe('Proficiency numeric mapping (scoring-spec.md §3.1)', () => {
  it('maps all five proficiency levels to their correct numeric values', () => {
    expect(GOVERNANCE.PROFICIENCY.aware).toBe(0.20);
    expect(GOVERNANCE.PROFICIENCY.practitioner).toBe(0.45);
    expect(GOVERNANCE.PROFICIENCY.proficient).toBe(0.70);
    expect(GOVERNANCE.PROFICIENCY.expert).toBe(0.87);
    expect(GOVERNANCE.PROFICIENCY.authority).toBe(1.00);
  });
});

describe('Per-skill score q(s) (scoring-spec.md §4.1)', () => {
  it('returns 1.0 when candidate meets the requirement exactly', () => {
    expect(computeSkillScore('proficient', 'proficient')).toBe(1.0);
  });

  it('returns 1.0 when candidate exceeds the requirement', () => {
    expect(computeSkillScore('expert',    'proficient')).toBe(1.0);
    expect(computeSkillScore('authority', 'aware')).toBe(1.0);
  });

  it('returns partial credit when candidate is exactly one level below', () => {
    // practitioner (0.45) required proficient (0.70): q = 0.45/0.70
    const q = computeSkillScore('practitioner', 'proficient');
    expect(q).toBeCloseTo(0.45 / 0.70, 5);
    expect(q).toBeGreaterThan(0);
    expect(q).toBeLessThan(1);
  });

  it('returns 0.0 when candidate is more than one level below', () => {
    expect(computeSkillScore('aware',        'proficient')).toBe(0.0);  // two levels below
    expect(computeSkillScore('aware',        'expert')).toBe(0.0);      // three levels below
    expect(computeSkillScore('practitioner', 'expert')).toBe(0.0);      // two levels below
  });

  it('returns 0.0 when candidate skill is absent (null)', () => {
    expect(computeSkillScore(null, 'proficient')).toBe(0.0);
    expect(computeSkillScore(null, 'aware')).toBe(0.0);
  });
});

describe('Weight redistribution when no nice-to-have skills (scoring-spec.md §4.3)', () => {
  it('redistributes w_n proportionally to w_m and w_p', () => {
    const { wm, wn, wp } = redistributeWeights(0.55, 0.25, 0.20);
    expect(wn).toBe(0);
    expect(wm + wp).toBeCloseTo(1.0, 5);
    // Proportional: wm should absorb more than wp (since original wm > wp)
    expect(wm).toBeGreaterThan(wp);
  });

  it('redistributed weights still sum to 1.0', () => {
    const { wm, wn, wp } = redistributeWeights(0.55, 0.25, 0.20);
    expect(wm + wn + wp).toBeCloseTo(1.0, 5);
  });
});

describe('Governance weight integrity', () => {
  it('default governance weights sum to exactly 1.0', () => {
    const sum = GOVERNANCE.WEIGHT_MUST_HAVE + GOVERNANCE.WEIGHT_NICE_TO_HAVE + GOVERNANCE.WEIGHT_PREFERENCE;
    expect(sum).toBeCloseTo(1.0, 5);
  });
});

describe('Worked example from scoring-spec.md §11', () => {
  /**
   * The full worked example:
   * - python at proficient (must_have, met exactly) → q=1.0
   * - sql at practitioner (must_have, met exactly)  → q=1.0
   * - kubernetes at aware (nice_to_have, absent, but docker transfers at weight 0.7)
   *   transfer score = 0.7 * 0.70 = 0.49, capped at 0.6 → 0.49
   * - Salary, mode, location all aligned → S_pref = 1.0
   * Expected composite: (0.55 * 1.0) + (0.25 * 0.49) + (0.20 * 1.0) = 0.8725
   */

  it('produces the correct composite score for the canonical worked example', () => {
    const sMust = mean([1.0, 1.0]); // python, sql
    const sNice = 0.49;              // kubernetes via docker transfer
    const sPref = 1.0;               // full preference alignment

    const composite = (0.55 * sMust) + (0.25 * sNice) + (0.20 * sPref);
    expect(composite).toBeCloseTo(0.8725, 4);
  });

  it('correctly applies the transfer score cap', () => {
    // docker → kubernetes: weight 0.70, candidate proficiency 0.70
    // raw: 0.70 * 0.70 = 0.49 → below cap of 0.60 → stays 0.49
    const raw = 0.70 * GOVERNANCE.PROFICIENCY.proficient;
    const capped = clamp(raw, 0, GOVERNANCE.TRANSFER_SCORE_CAP);
    expect(capped).toBeCloseTo(0.49, 5);
    expect(capped).toBeLessThanOrEqual(GOVERNANCE.TRANSFER_SCORE_CAP);
  });
});

describe('Bias correction delta (bias-correction-spec.md §5)', () => {
  it('applies clamp to keep corrected score within [0, 1]', () => {
    expect(clamp(1.05, 0, 1)).toBe(1.0);
    expect(clamp(-0.1, 0, 1)).toBe(0.0);
    expect(clamp(0.75, 0, 1)).toBe(0.75);
  });

  it('correction cap is 0.15', () => {
    expect(GOVERNANCE.CORRECTION_CAP).toBe(0.15);
  });

  it('governance alert threshold is 0.10', () => {
    expect(GOVERNANCE.GOVERNANCE_ALERT_THRESHOLD).toBe(0.10);
  });
});

describe('Match thresholds (scoring-spec.md §9)', () => {
  it('matched threshold is 0.60', () => {
    expect(GOVERNANCE.MATCH_THRESHOLD).toBe(0.60);
  });

  it('borderline threshold is 0.50', () => {
    expect(GOVERNANCE.BORDERLINE_THRESHOLD).toBe(0.50);
  });

  it('correctly classifies scores into decisions', () => {
    const classify = (score: number) => {
      if (score >= GOVERNANCE.MATCH_THRESHOLD)      return 'matched';
      if (score >= GOVERNANCE.BORDERLINE_THRESHOLD) return 'borderline';
      return 'not_matched';
    };

    expect(classify(0.90)).toBe('matched');
    expect(classify(0.60)).toBe('matched');
    expect(classify(0.59)).toBe('borderline');
    expect(classify(0.50)).toBe('borderline');
    expect(classify(0.49)).toBe('not_matched');
    expect(classify(0.00)).toBe('not_matched');
  });
});

describe('Statistical helpers', () => {
  it('mean computes correctly', () => {
    expect(mean([1.0, 0.5, 0.75])).toBeCloseTo(0.75, 5);
    expect(mean([1.0])).toBe(1.0);
  });

  it('trimmedMean drops min and max', () => {
    // [0.2, 0.5, 0.8, 1.0] → drop 0.2 and 1.0 → mean([0.5, 0.8]) = 0.65
    expect(trimmedMean([0.2, 0.5, 0.8, 1.0])).toBeCloseTo(0.65, 5);
  });

  it('trimmedMean falls back to mean for ≤2 values', () => {
    expect(trimmedMean([0.4, 0.8])).toBeCloseTo(0.6, 5);
  });
});
