/**
 * Stage 1: Normalisation
 * See: specs/matching-engine-spec.md Stage 1
 */

import type { PipelineContext }  from '../context.ts';
import type { TraceBuilder }     from '../../shared/logger/trace-builder.ts';
import { UnknownSkillError }     from '../../shared/errors/index.ts';
import type { CandidateProfile, JobBrief } from '../../shared/schemas/types.ts';

export function normalise(
  candidate: CandidateProfile,
  job: JobBrief,
  ctx: PipelineContext,
  trace: TraceBuilder,
): { candidate: CandidateProfile; job: JobBrief } {

  // Validate all skill IDs exist in the ontology
  for (const skill of candidate.skills) {
    if (!ctx.ontology.exists(skill.ontology_id)) {
      throw new UnknownSkillError(skill.ontology_id);
    }
  }
  for (const skill of job.skills_required) {
    if (!ctx.ontology.exists(skill.ontology_id)) {
      throw new UnknownSkillError(skill.ontology_id);
    }
  }

  // Normalise salary to annual GBP (stub: real impl uses governance-approved FX rates)
  // For now: pass through, mark as normalised
  const normCandidate = { ...candidate };
  const normJob       = { ...job };

  trace.recordStage('normalisation', 'completed', {
    input:  { candidateSkillCount: candidate.skills.length, jobSkillCount: job.skills_required.length },
    output: { normalised: true },
  });

  return { candidate: normCandidate, job: normJob };
}
