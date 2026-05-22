/**
 * FHP Matching Engine — Pipeline Orchestrator
 *
 * Runs all nine stages in defined order.
 * Manages early abort on constraint failure.
 * Writes the trace and explanation atomically on completion.
 *
 * See: specs/matching-engine-spec.md §4
 */

import { v4 as uuidv4 }         from 'uuid';
import type { PipelineContext }  from './context.ts';
import { normalise }             from './stages/1-normalise.ts';
import { expandSemantics, checkConstraints, scoreSkills, applyTransfer } from './stages/2-5-stages.ts';
import { scorePreferences, detectBias, applyBiasCorrection, generateExplanations } from './stages/6-9-stages.ts';
import { TraceBuilder }          from '../shared/logger/trace-builder.ts';
import { redistributeWeights }   from './utils/proficiency.ts';
import { PipelineStageError }    from '../shared/errors/index.ts';
import type {
  CandidateProfile,
  JobBrief,
  MatchExplanation,
  PipelineTrace,
  MatchDecision,
} from '../shared/schemas/types.ts';

export interface PipelineResult {
  matchId:                 string;
  candidateExplanation:    MatchExplanation;
  employerExplanation:     MatchExplanation;
  governanceExplanation:   MatchExplanation;
  trace:                   PipelineTrace;
}

export async function runPipeline(
  candidate: CandidateProfile,
  job: JobBrief,
  ctx: PipelineContext,
): Promise<PipelineResult> {

  const matchId  = uuidv4();
  const traceId  = uuidv4();
  const trace    = new TraceBuilder(traceId, matchId, candidate.candidate_id, job.job_id, ctx);

  try {

    // ── Stage 1: Normalisation ────────────────────────────────────────────────
    const { candidate: normCandidate, job: normJob } = normalise(candidate, job, ctx, trace);

    // ── Stage 2: Semantic Expansion ───────────────────────────────────────────
    const expanded = expandSemantics(normJob, ctx, trace);

    // ── Stage 3: Constraint Satisfaction ─────────────────────────────────────
    const constraintResult = checkConstraints(normCandidate, normJob, expanded, ctx, trace);

    if (!constraintResult.passed) {
      // Early abort: generate not_matched explanations and return
      const [cExp, eExp, gExp] = generateExplanations(
        normCandidate, normJob, matchId, traceId,
        { decision: 'not_matched', overallScore: 0, preCorrection: 0 },
        { skillScore: 0, transferableSkillScore: 0, preferenceAlignmentScore: 0, biasCorrectionDelta: 0 },
        [],
        { triggered: false, metricsEvaluated: [] },
        constraintResult.failures,
        ctx, trace,
      );
      const finalTrace = trace.finalise('aborted') as any;
      return { matchId, candidateExplanation: cExp, employerExplanation: eExp, governanceExplanation: gExp, trace: finalTrace };
    }

    // ── Stage 4: Skill Scoring ────────────────────────────────────────────────
    const { sMust, sNice, breakdown } = scoreSkills(normCandidate, expanded, ctx, trace);

    // ── Stage 5: Transferable Skill Compensation ──────────────────────────────
    const { sMust: sMustFinal, sNice: sNiceFinal, breakdown: breakdownFinal } =
      applyTransfer(normCandidate, breakdown, sMust, sNice, ctx, trace);

    // ── Stage 6: Preference Alignment ────────────────────────────────────────
    const sPref = scorePreferences(normCandidate, normJob, ctx, trace);

    // ── Composite score ───────────────────────────────────────────────────────
    const g = ctx.governance;
    let wm: number = g.WEIGHT_MUST_HAVE;
  let wn: number = g.WEIGHT_NICE_TO_HAVE;
  let wp: number = g.WEIGHT_PREFERENCE;

    const hasNiceToHave = sNiceFinal !== null;
    if (!hasNiceToHave) {
      ({ wm, wn, wp } = redistributeWeights(wm, wn, wp));
    }

    const sNiceEffective = sNiceFinal ?? 1.0;
    const compositeRaw = (wm * sMustFinal) + (wn * sNiceEffective) + (wp * sPref);

    // ── Stage 7: Bias Detection ───────────────────────────────────────────────
    const triggeredCorrections = await detectBias(
      normCandidate.candidate_id, compositeRaw, ctx, trace,
    );

    // ── Stage 8: Bias Correction ──────────────────────────────────────────────
    const { scoreFinal, delta, biasAssessment } =
      applyBiasCorrection(compositeRaw, triggeredCorrections, ctx, trace);

    // ── Determine decision ────────────────────────────────────────────────────
    let decision: MatchDecision;
    if (scoreFinal >= g.MATCH_THRESHOLD)      decision = 'matched';
    else if (scoreFinal >= g.BORDERLINE_THRESHOLD) decision = 'borderline';
    else                                      decision = 'not_matched';

    const scores = {
      skillScore:               (wm * sMustFinal + wn * sNiceEffective) / (wm + wn),
      transferableSkillScore:   breakdownFinal.filter(b => b.matchType === 'transferable')
                                  .reduce((s, b) => s + (b.scoreContribution ?? 0), 0)
                                  / Math.max(breakdownFinal.length, 1),
      preferenceAlignmentScore: sPref,
      biasCorrectionDelta:      delta,
    };

    // ── Stage 9: Explanation Generation ──────────────────────────────────────
    const [cExp, eExp, gExp] = generateExplanations(
      normCandidate, normJob, matchId, traceId,
      { decision, overallScore: scoreFinal, preCorrection: compositeRaw },
      scores,
      breakdownFinal,
      biasAssessment,
      [],
      ctx, trace,
    );

    const finalTrace = trace.finalise('completed') as any;
    return { matchId, candidateExplanation: cExp, employerExplanation: eExp, governanceExplanation: gExp, trace: finalTrace };

  } catch (err) {
    const finalTrace = trace.finalise('failed', err instanceof Error ? err.message : String(err));
    throw new PipelineStageError('orchestrator', `Pipeline failed: ${err}`, { traceId });
  }
}
