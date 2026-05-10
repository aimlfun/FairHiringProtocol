/**
 * FHP Governance Constants
 *
 * These values are protocol-controlled. They may not be modified by operators
 * or implementations. Changes require a formal FHP-P proposal and PC vote.
 * See specs/fhp-overview.md §2 (Tier 2).
 */

export const GOVERNANCE = {

  // ── Protocol version ────────────────────────────────────────────────────────
  FHP_VERSION:       '1.0.0',
  PIPELINE_VERSION:  '1.0.0',

  // ── Scoring weights ─────────────────────────────────────────────────────────
  // Must sum to 1.0. See specs/scoring-spec.md §3
  WEIGHT_MUST_HAVE:  0.55,
  WEIGHT_NICE_TO_HAVE: 0.25,
  WEIGHT_PREFERENCE: 0.20,

  // ── Match thresholds ────────────────────────────────────────────────────────
  // See specs/scoring-spec.md §9
  MATCH_THRESHOLD:      0.60,
  BORDERLINE_THRESHOLD: 0.50,

  // ── Proficiency scale ───────────────────────────────────────────────────────
  // See specs/scoring-spec.md §3.1
  PROFICIENCY: {
    aware:        0.20,
    practitioner: 0.45,
    proficient:   0.70,
    expert:       0.87,
    authority:    1.00,
  } as const,

  // One proficiency step in numeric terms (smallest gap in the scale)
  // Used in constraint satisfaction and partial credit logic
  ONE_STEP_NUMERIC: 0.20, // aware → practitioner gap (conservative minimum)

  // ── Transfer scoring ────────────────────────────────────────────────────────
  // See specs/scoring-spec.md §5.1
  TRANSFER_SCORE_CAP: 0.60,

  // ── Salary compatibility tolerance ──────────────────────────────────────────
  // See specs/matching-engine-spec.md Stage 3
  SALARY_HARD_FAIL_TOLERANCE: 0.85,

  // ── Bias correction ─────────────────────────────────────────────────────────
  // See specs/bias-correction-spec.md §7
  CORRECTION_SCALING_FACTOR:    0.50,
  CORRECTION_CAP:               0.15,
  GOVERNANCE_ALERT_THRESHOLD:   0.10,

  // Metric bounds
  DIR_LOWER_BOUND:  0.80,
  DIR_UPPER_BOUND:  1.25,
  EOD_THRESHOLD:    0.05,
  SDS_THRESHOLD:    0.03,

  // Minimum cohort size for bias detection to activate
  MIN_COHORT_SIZE: 20,

  // ── SLA windows (business days) ─────────────────────────────────────────────
  // See specs/governance-escalation-spec.md Part A
  SLA_DAYS: {
    initial_match_acknowledgement: 5,
    application_review:            10,
    screening_call:                5,
    technical_assessment:          7,
    interview_stage:               5,
    offer_stage:                   10,
    post_rejection_feedback:       10,
  } as const,

  // ── Ghosting severity thresholds (hours overdue) ─────────────────────────────
  GHOSTING_SEVERITY: {
    minor_max_hours:       24,
    significant_max_hours: 72,
    // severe = 72+ hours, or any ghosting at offer_stage/post_rejection_feedback
  },

  // ── Ghosting strike enforcement ──────────────────────────────────────────────
  STRIKES_TO_PAUSE:    3,  // strikes in 90 days → job brief paused
  STRIKES_TO_SUSPEND:  5,  // strikes in 90 days → account suspended
  STRIKE_WINDOW_DAYS:  90,
  STRIKE_EXPIRY_DAYS:  365,

  // ── Fairness computation ─────────────────────────────────────────────────────
  FAIRNESS_ROLLING_WINDOW_DAYS:      30,
  CONSECUTIVE_BREACH_BEFORE_REVIEW:  3,
  CONSECUTIVE_NO_IMPROVE_BEFORE_FOB: 7,

  // ── Compliance scoring weights ───────────────────────────────────────────────
  COMPLIANCE_SCORE_WEIGHTS: {
    sla_compliance:          0.35,
    ghosting_events:         0.25,
    fairness_metrics:        0.25,
    structured_rejections:   0.15,
  },
  COMPLIANCE_REVIEW_THRESHOLD: 0.70,
  COMPLIANCE_PAUSE_THRESHOLD:  0.50,

  // ── Appeal windows ───────────────────────────────────────────────────────────
  APPEAL_SUBMISSION_WINDOW_DAYS: 30,
  APPEAL_TWG_REVIEW_DAYS:        10,
  APPEAL_PC_DECISION_DAYS:       10,

  // ── Multi-model inference ────────────────────────────────────────────────────
  MMIL_MIN_MODEL_POOL_SIZE:  3,
  MMIL_STAGING_PERIOD_DAYS:  7,
  MMIL_HIGH_DISAGREEMENT_ALERT_WINDOW_DAYS: 7,
  MMIL_HIGH_DISAGREEMENT_ALERT_COUNT:       5,

} as const;

export type ProficiencyLevel = keyof typeof GOVERNANCE.PROFICIENCY;
export type SlaStage = keyof typeof GOVERNANCE.SLA_DAYS;

/** Validate that weights sum to 1.0 at startup */
const weightSum = GOVERNANCE.WEIGHT_MUST_HAVE
                + GOVERNANCE.WEIGHT_NICE_TO_HAVE
                + GOVERNANCE.WEIGHT_PREFERENCE;

if (Math.abs(weightSum - 1.0) > 0.0001) {
  throw new Error(`FATAL: Governance scoring weights do not sum to 1.0 (got ${weightSum}). This is a protocol violation.`);
}
