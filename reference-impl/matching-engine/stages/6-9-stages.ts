/**
 * Stage 6: Preference Alignment
 * See: specs/matching-engine-spec.md Stage 6 / specs/scoring-spec.md §6
 */

import type { PipelineContext }  from '../context.ts';
import type { TraceBuilder }     from '../../shared/logger/trace-builder.ts';
import type { CandidateProfile, JobBrief } from '../../shared/schemas/types.ts';

export function scorePreferences(
  candidate: CandidateProfile,
  job: JobBrief,
  ctx: PipelineContext,
  trace: TraceBuilder,
): number {
  const prefs = candidate.preferences;

  // ── Salary alignment ──────────────────────────────────────────────────────
  let aSalary: number;
  if (!prefs?.salary) {
    aSalary = 0.5; // neutral: missing data not penalised
  } else if (job.salary.maximum < prefs.salary.minimum) {
    aSalary = 0.0; // hard incompatibility
  } else {
    aSalary = 1.0;
  }

  // ── Work mode alignment ───────────────────────────────────────────────────
  let aMode: number;
  const modes = prefs?.work_modes ?? [];
  if (modes.length === 0) {
    aMode = 0.5;
  } else {
    aMode = modes.includes(job.work_mode as any) ? 1.0 : 0.0;
  }

  // ── Location alignment ────────────────────────────────────────────────────
  let aLocation: number;
  const locations = prefs?.locations ?? [];
  if (locations.length === 0 || job.work_mode === 'remote') {
    aLocation = 1.0; // remote roles or no location preference: compatible
  } else {
    // Simplified: check if job city/country appears in candidate location list
    const jobLocation = [job.location.country, job.location.region, job.location.city]
      .filter(Boolean).map(l => l!.toLowerCase());
    const match = locations.some(l =>
      jobLocation.some(jl => jl.includes(l.toLowerCase()) || l.toLowerCase().includes(jl))
    );
    aLocation = match ? 1.0 : 0.5; // partial credit for location: preference, not hard constraint
  }

  const sPref = (aSalary + aMode + aLocation) / 3;

  trace.recordStage('preference_alignment', 'completed', {
    output: { sPref, aSalary, aMode, aLocation },
  });

  return sPref;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stage 7: Bias Detection
 * See: specs/matching-engine-spec.md Stage 7 / specs/bias-correction-spec.md §4
 */

import type { CohortMembership, CorrectionCandidate } from '../../bias/cohort.ts';
import { computeCorrectionMagnitude, cohortIsUnderRepresented } from '../../bias/correction.ts';

export async function detectBias(
  candidateId: string,
  compositeScore: number,
  ctx: PipelineContext,
  trace: TraceBuilder,
): Promise<CorrectionCandidate[]> {

  const cohorts = await ctx.cohortService.getCohorts(candidateId);
  const triggered: CorrectionCandidate[] = [];
  const warnings: Array<{ code: string; message: string }> = [];

  for (const cohort of cohorts) {
    const metrics = ctx.fairnessMetrics.getForCohort(cohort.cohortId);

    if (!metrics) {
      warnings.push({ code: 'NO_METRICS', message: `No fairness metrics for cohort ${cohort.cohortId}` });
      continue;
    }
    if (metrics.sampleCount < ctx.governance.MIN_COHORT_SIZE) {
      warnings.push({ code: 'INSUFFICIENT_DATA', message: `Cohort ${cohort.cohortId} below minimum size (${metrics.sampleCount} < ${ctx.governance.MIN_COHORT_SIZE})` });
      continue;
    }

    for (const metricName of ['DIR', 'EOD', 'SDS'] as const) {
      const metric = metrics[metricName];
      if (!metric || metric.withinBounds) continue;

      const direction  = cohortIsUnderRepresented(metric, cohort.cohortId) ? 'upward' : 'downward';
      const magnitude  = computeCorrectionMagnitude(metric, ctx.governance.CORRECTION_SCALING_FACTOR);
      const capped     = Math.min(magnitude, ctx.governance.CORRECTION_CAP);

      triggered.push({ metric: metricName, direction, magnitude: capped, cohortId: cohort.cohortId });
    }
  }

  trace.recordStage('bias_detection', 'completed', {
    output: { triggered: triggered.length > 0, correctionCandidateCount: triggered.length },
    warnings,
  });

  return triggered;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stage 8: Bias Correction
 * See: specs/matching-engine-spec.md Stage 8 / specs/bias-correction-spec.md §5
 */

import { clamp }      from '../utils/proficiency.ts';
// BiasAssessment imported via shared types

export function applyBiasCorrection(
  compositeScore: number,
  triggered: CorrectionCandidate[],
  ctx: PipelineContext,
  trace: TraceBuilder,
): { scoreFinal: number; delta: number; biasAssessment: BiasAssessment } {

  let delta  = 0;
  let applied: CorrectionCandidate | null = null;

  if (triggered.length > 0) {
    // Take maximum correction — do not sum. See bias-correction-spec.md §5.2
    const best = triggered.reduce((a, b) => a.magnitude > b.magnitude ? a : b);
    const sign = best.direction === 'upward' ? 1 : -1;
    delta   = clamp(best.magnitude * sign, -ctx.governance.CORRECTION_CAP, ctx.governance.CORRECTION_CAP);
    applied = best;

    if (Math.abs(delta) > ctx.governance.GOVERNANCE_ALERT_THRESHOLD) {
      // In production: raise a governance alert event
      console.warn('[GOVERNANCE ALERT] High-magnitude bias correction', { delta, matchId: trace.matchId });
    }
  }

  const scoreFinal = clamp(compositeScore + delta, 0, 1);

  const biasAssessment: BiasAssessment = {
    triggered:        triggered.length > 0,
    metricsEvaluated: ['disparate_impact_ratio', 'equal_opportunity_difference', 'score_distribution_skew'],
    correctionApplied: applied ? {
      metric:        applied.metric.toLowerCase().replace('DIR', 'disparate_impact_ratio').replace('EOD', 'equal_opportunity_difference').replace('SDS', 'score_distribution_skew') as any,
      direction:     applied.direction,
      magnitude:     applied.magnitude,
      humanReadable: `Bias correction applied (${applied.metric}): score adjusted ${applied.direction} by ${(applied.magnitude * 100).toFixed(1)} percentage points.`,
    } : undefined,
  };

  trace.recordStage('bias_correction', 'completed', {
    output: { delta, scorePreCorrection: compositeScore, scorePostCorrection: scoreFinal, correctionApplied: applied !== null },
  });

  return { scoreFinal, delta, biasAssessment };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stage 9: Explanation Generation
 * See: specs/matching-engine-spec.md Stage 9
 */

import { v4 as uuidv4 }   from 'uuid';
import type { MatchExplanation, MatchDecision, BiasAssessment, SkillBreakdown } from '../../shared/schemas/types.ts';
import type { SkillBreakdownEntry } from './2-5-stages.ts';
import type { ConstraintFailure }   from './2-5-stages.ts';

interface OutcomeInput {
  decision:       MatchDecision;
  overallScore:   number;
  preCorrection:  number;
}
interface ScoresInput {
  skillScore:               number;
  transferableSkillScore:   number;
  preferenceAlignmentScore: number;
  biasCorrectionDelta:      number;
}

export function generateExplanations(
  candidate: CandidateProfile,
  job: JobBrief,
  matchId: string,
  traceId: string,
  outcome: OutcomeInput,
  scores: ScoresInput,
  breakdown: SkillBreakdownEntry[],
  biasAssessment: BiasAssessment,
  constraintFailures: ConstraintFailure[],
  ctx: PipelineContext,
  trace: TraceBuilder,
): [MatchExplanation, MatchExplanation, MatchExplanation] {

  const now = new Date().toISOString();
  const base = {
    fhp_version:      ctx.governance.FHP_VERSION,
    match_id:         matchId,
    candidate_id:     candidate.candidate_id,
    job_id:           job.job_id,
    generated_at:     now,
    pipeline_version: ctx.governance.PIPELINE_VERSION,
    outcome: {
      decision:             outcome.decision,
      overall_score:        outcome.overallScore,
      pre_correction_score: outcome.preCorrection,
      not_matched_reasons:  constraintFailures.map(f => ({
        reason_code:          f.reasonCode,
        human_readable:       f.humanReadable,
        ontology_id:          f.ontologyId,
        required_proficiency: f.requiredProficiency,
        candidate_proficiency: f.candidateProficiency ?? null,
      })),
    },
    scores: {
      skill_score:               scores.skillScore,
      transferable_skill_score:  scores.transferableSkillScore,
      preference_alignment_score: scores.preferenceAlignmentScore,
      bias_correction_delta:     scores.biasCorrectionDelta,
    },
    skill_breakdown: breakdown.map(e => ({
      ontology_id:          e.ontologyId,
      requirement_level:    e.requirementLevel,
      matched:              e.matched,
      match_type:           e.matchType,
      candidate_proficiency: e.candidateProficiency,
      required_proficiency: e.requiredProficiency,
      score_contribution:   e.scoreContribution,
      transferable_via:     e.transferableVia ?? null,
    })),
    bias_assessment:  biasAssessment,
    appeal_eligible:  true,
  };

  // Candidate explanation: skill breakdown + reasons, no bias detail
  const candidateExp: MatchExplanation = {
    ...base,
    explanation_id: uuidv4(),
    audience: 'candidate',
    plain_language_summary: buildCandidateSummary(outcome.decision, breakdown, constraintFailures, ctx),
    next_steps: outcome.decision === 'not_matched'
      ? buildNextSteps(constraintFailures, breakdown, ctx)
      : [],
  };

  // Employer explanation: skill breakdown only, no bias detail, no PII
  const employerExp: MatchExplanation = {
    ...base,
    explanation_id:   uuidv4(),
    audience:         'employer',
    plain_language_summary: buildEmployerSummary(outcome.decision, outcome.overallScore, breakdown, ctx),
    bias_assessment:  { triggered: false, metricsEvaluated: [] }, // bias detail withheld from employer
  };

  // Governance explanation: full record
  const governanceExp: MatchExplanation = {
    ...base,
    explanation_id: uuidv4(),
    audience: 'governance',
    plain_language_summary: `Match ${matchId}: ${outcome.decision} (score ${outcome.overallScore.toFixed(3)}, pre-correction ${outcome.preCorrection.toFixed(3)}, delta ${scores.biasCorrectionDelta.toFixed(3)})`,
  };

  trace.recordStage('explanation_generation', 'completed', {
    output: { explanationsGenerated: 3, decision: outcome.decision },
  });

  return [candidateExp, employerExp, governanceExp];
}

function buildCandidateSummary(
  decision: MatchDecision,
  breakdown: SkillBreakdownEntry[],
  failures: ConstraintFailure[],
  ctx: PipelineContext,
): string {
  if (decision === 'matched') {
    const strongSkills = breakdown.filter(e => e.matched && e.matchType === 'direct').length;
    return `Your profile is a strong match for this role. ${strongSkills} of your skills directly meet the requirements.`;
  }
  if (decision === 'borderline') {
    return `Your profile is close to meeting the requirements for this role but did not reach the match threshold. Review the skill breakdown below for specific gaps.`;
  }
  // not_matched
  if (failures.length > 0) {
    const first = failures[0]!;
    return `Your profile did not meet the requirements for this role. ${first.humanReadable}${failures.length > 1 ? ` (and ${failures.length - 1} other reason(s))` : ''}`;
  }
  return 'Your profile did not meet the requirements for this role. See the skill breakdown for details.';
}

function buildEmployerSummary(
  decision: MatchDecision,
  score: number,
  breakdown: SkillBreakdownEntry[],
  ctx: PipelineContext,
): string {
  const matched    = breakdown.filter(e => e.matched).length;
  const total      = breakdown.length;
  const scoreBand  = score >= 0.85 ? 'excellent' : score >= 0.70 ? 'good' : score >= 0.60 ? 'adequate' : 'below threshold';
  return `Candidate match: ${decision} (${scoreBand}). ${matched}/${total} skills satisfied.`;
}

function buildNextSteps(
  failures: ConstraintFailure[],
  breakdown: SkillBreakdownEntry[],
  ctx: PipelineContext,
): Array<{ suggestion: string; related_skill_ontology_id?: string }> {
  const steps: Array<{ suggestion: string; related_skill_ontology_id?: string }> = [];

  for (const failure of failures.slice(0, 3)) {
    if (failure.ontologyId && failure.requiredProficiency) {
      const skill = ctx.ontology.resolve(failure.ontologyId);
      steps.push({
        suggestion: `Build your '${skill.label}' skills to at least '${failure.requiredProficiency}' level to be competitive for roles like this.`,
        related_skill_ontology_id: failure.ontologyId,
      });
    }
  }

  if (steps.length === 0) {
    steps.push({ suggestion: 'Review your profile preferences (salary, location, work mode) to ensure they align with roles you are applying for.' });
  }

  return steps;
}
