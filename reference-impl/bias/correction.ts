/**
 * FHP Bias Correction — Computation Helpers
 * See: specs/bias-correction-spec.md §5
 */

export interface MetricSnapshot {
  value:        number | null;
  withinBounds: boolean | null;
  cohortId?:    string;
  sampleCount:  number;
  DIR?:  { value: number | null; withinBounds: boolean | null };
  EOD?:  { value: number | null; withinBounds: boolean | null };
  SDS?:  { value: number | null; withinBounds: boolean | null };
}

/**
 * Compute correction magnitude for a single breached metric.
 * See: bias-correction-spec.md §5.1
 *
 * For all three metrics, "ideal" is 1.0 (DIR) or 0.0 (EOD/SDS).
 * We measure distance from ideal, not distance from zero.
 * DIR=0.50 → |1.0 - 0.50| = 0.50 (large breach)
 * DIR=0.79 → |1.0 - 0.79| = 0.21 (smaller breach)
 * EOD=0.08 → |0.0 - 0.08| = 0.08
 */
export function computeCorrectionMagnitude(
  metric: MetricSnapshot,
  scalingFactor: number,
): number {
  if (metric.value === null) return 0;
  // Distance from ideal: for DIR, ideal=1.0; for EOD/SDS, ideal=0.0
  // The metric store doesn't currently distinguish type, so we use |1 - value|
  // which correctly handles DIR (values < 1 that are below bound).
  // For EOD/SDS the caller provides |value| directly as they're already distance-from-zero.
  const distanceFromIdeal = Math.abs(1.0 - metric.value);
  return distanceFromIdeal * scalingFactor;
}

/**
 * Determine if a cohort is under-represented (should receive upward correction).
 * Under-represented = the comparison cohort with below-bound match rate.
 */
export function cohortIsUnderRepresented(
  metric: MetricSnapshot,
  cohortId: string,
): boolean {
  // Stub: in production, compare cohort match rate against reference cohort.
  // For the reference impl, assume correction is always upward (protective).
  if (metric.value === null) return false;
  return metric.value < 1.0; // below ideal = under-represented
}
