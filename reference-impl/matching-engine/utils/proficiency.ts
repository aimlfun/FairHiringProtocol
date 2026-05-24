import { GOVERNANCE, type ProficiencyLevel } from '../../shared/config/governance.js';

const ORDERED_LEVELS: ProficiencyLevel[] = [
  'aware', 'practitioner', 'proficient', 'expert', 'authority',
];

/** Convert a proficiency level to its numeric value */
export function toNumeric(level: ProficiencyLevel): number {
  return GOVERNANCE.PROFICIENCY[level];
}

/** Return the proficiency level one step below the given level, or null if already at minimum */
export function oneStepBelow(level: ProficiencyLevel): ProficiencyLevel | null {
  const idx = ORDERED_LEVELS.indexOf(level);
  return idx > 0 ? (ORDERED_LEVELS[idx - 1] ?? null) : null;
}

/** Return the proficiency level one step above the given level, or null if already at maximum */
export function oneStepAbove(level: ProficiencyLevel): ProficiencyLevel | null {
  const idx = ORDERED_LEVELS.indexOf(level);
  return idx < ORDERED_LEVELS.length - 1 ? (ORDERED_LEVELS[idx + 1] ?? null) : null;
}

/**
 * Compute the per-skill score q(s) per scoring-spec.md §4.1
 *
 * Rules:
 *   - candidateLevel >= requiredLevel → 1.0
 *   - candidateLevel is exactly one step below → partial credit (p/r)
 *   - candidateLevel is more than one step below → 0.0
 *   - candidateLevel is null (skill absent) → 0.0
 */
export function computeSkillScore(
  candidateLevel: ProficiencyLevel | null,
  requiredLevel: ProficiencyLevel,
): number {
  if (candidateLevel === null) return 0.0;

  const p = toNumeric(candidateLevel);
  const r = toNumeric(requiredLevel);

  if (p >= r) return 1.0;

  const oneBelow = oneStepBelow(requiredLevel);
  if (oneBelow !== null && candidateLevel === oneBelow) {
    return p / r; // partial credit: exactly one level below
  }

  return 0.0; // more than one level below: no credit
}

/** Clamp a number to [min, max] */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Compute the mean of a non-empty array. Throws if empty. */
export function mean(values: number[]): number {
  if (values.length === 0) throw new Error('Cannot compute mean of empty array');
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Compute the trimmed mean: drop min and max, average the rest */
export function trimmedMean(values: number[]): number {
  if (values.length <= 2) return mean(values);
  const sorted = [...values].sort((a, b) => a - b);
  return mean(sorted.slice(1, -1));
}

/**
 * Redistribute weights when nice-to-have skills are absent.
 * See scoring-spec.md §4.3
 */
export function redistributeWeights(
  wm: number, wn: number, wp: number
): { wm: number; wn: number; wp: number } {
  const total = wm + wp;
  return {
    wm: wm + (wn * wm / total),
    wn: 0,
    wp: wp + (wn * wp / total),
  };
}
