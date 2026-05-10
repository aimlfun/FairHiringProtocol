/**
 * Stage 2: Semantic Expansion
 * See: specs/matching-engine-spec.md Stage 2
 */

import type { PipelineContext }  from '../context.ts';
import type { TraceBuilder }     from '../../shared/logger/trace-builder.ts';
import type { JobBrief }         from '../../shared/schemas/types.ts';
import type { ProficiencyLevel } from '../../shared/config/governance.ts';

export interface ExpandedRequirement {
  canonicalId:        string;
  synonyms:           string[];
  requirementLevel:   'must_have' | 'nice_to_have';
  minimumProficiency: ProficiencyLevel;
  context?:           string;
}

export function expandSemantics(
  job: JobBrief,
  ctx: PipelineContext,
  trace: TraceBuilder,
): Map<string, ExpandedRequirement> {
  const expanded = new Map<string, ExpandedRequirement>();
  let totalExpansions = 0;

  for (const req of job.skills_required) {
    const synonyms = ctx.ontology.getSynonyms(req.ontology_id);
    totalExpansions += synonyms.length - 1;

    expanded.set(req.ontology_id, {
      canonicalId:        req.ontology_id,
      synonyms,
      requirementLevel:   req.requirement_level,
      minimumProficiency: req.minimum_proficiency as ProficiencyLevel,
      context:            req.context,
    });
  }

  trace.recordStage('semantic_expansion', 'completed', {
    input:  { skillCount: job.skills_required.length },
    output: { expansionCount: totalExpansions },
  });

  return expanded;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stage 3: Constraint Satisfaction
 * See: specs/matching-engine-spec.md Stage 3
 */

import { computeSkillScore } from '../utils/proficiency.ts';
import type { CandidateProfile } from '../../shared/schemas/types.ts';

export type ConstraintFailureCode =
  | 'missing_must_have_skill'
  | 'below_minimum_proficiency'
  | 'constraint_location_mismatch'
  | 'constraint_salary_mismatch'
  | 'constraint_work_mode_mismatch'
  | 'constraint_employment_type_mismatch';

export interface ConstraintFailure {
  reasonCode:           ConstraintFailureCode;
  humanReadable:        string;
  ontologyId?:          string;
  requiredProficiency?: ProficiencyLevel;
  candidateProficiency?: ProficiencyLevel | null;
}

export interface ConstraintResult {
  passed:   boolean;
  failures: ConstraintFailure[];
}

export function checkConstraints(
  candidate: CandidateProfile,
  job: JobBrief,
  expanded: Map<string, ExpandedRequirement>,
  ctx: PipelineContext,
  trace: TraceBuilder,
): ConstraintResult {
  const failures: ConstraintFailure[] = [];

  // ── Must-have skill constraints ───────────────────────────────────────────
  for (const [skillId, req] of expanded.entries()) {
    if (req.requirementLevel !== 'must_have') continue;

    const match = ctx.ontology.findBestCandidateMatch(
      candidate.skills, skillId, req.synonyms,
    );

    if (!match) {
      failures.push({
        reasonCode:           'missing_must_have_skill',
        humanReadable:        `Required skill '${ctx.ontology.resolve(skillId).label}' was not found in your profile.`,
        ontologyId:           skillId,
        requiredProficiency:  req.minimumProficiency,
        candidateProficiency: null,
      });
      continue;
    }

    const q = computeSkillScore(
      match.proficiency as ProficiencyLevel,
      req.minimumProficiency,
    );

    if (q === 0) {
      failures.push({
        reasonCode:           'below_minimum_proficiency',
        humanReadable:        `'${ctx.ontology.resolve(skillId).label}' requires '${req.minimumProficiency}' proficiency. Your profile shows '${match.proficiency}', which is more than one level below the requirement.`,
        ontologyId:           skillId,
        requiredProficiency:  req.minimumProficiency,
        candidateProficiency: match.proficiency as ProficiencyLevel,
      });
    }
  }

  // ── Work mode constraint ──────────────────────────────────────────────────
  const candidateModes = candidate.preferences?.work_modes ?? [];
  if (candidateModes.length > 0 && !candidateModes.includes(job.work_mode as any)) {
    failures.push({
      reasonCode:    'constraint_work_mode_mismatch',
      humanReadable: `This role requires '${job.work_mode}' working. Your preferences do not include this mode.`,
    });
  }

  // ── Salary constraint (hard floor only) ───────────────────────────────────
  const salaryPref = candidate.preferences?.salary;
  if (salaryPref && job.salary) {
    // Simplified: assume same currency and period for reference impl
    const jobMax   = job.salary.maximum;
    const candMin  = salaryPref.minimum;
    const tolerance = ctx.governance.SALARY_HARD_FAIL_TOLERANCE;
    if (jobMax < candMin * tolerance) {
      failures.push({
        reasonCode:    'constraint_salary_mismatch',
        humanReadable: `The role's maximum salary (${job.salary.currency} ${jobMax}) is significantly below your minimum expectation.`,
      });
    }
  }

  // ── Employment type constraint ────────────────────────────────────────────
  const candidateTypes = candidate.preferences?.employment_types ?? [];
  if (candidateTypes.length > 0 && !candidateTypes.includes(job.employment_type as any)) {
    failures.push({
      reasonCode:    'constraint_employment_type_mismatch',
      humanReadable: `This role is '${job.employment_type}'. Your preferences do not include this employment type.`,
    });
  }

  const passed = failures.length === 0;

  trace.recordStage('constraint_satisfaction', passed ? 'completed' : 'skipped', {
    input:  { mustHaveCount: [...expanded.values()].filter(r => r.requirementLevel === 'must_have').length },
    output: { passed, failureCount: failures.length },
    decisions: failures.map(f => ({
      decision_type: f.reasonCode,
      value: false,
      rationale: f.humanReadable,
    })),
  });

  return { passed, failures };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stage 4: Skill Scoring
 * See: specs/matching-engine-spec.md Stage 4 / specs/scoring-spec.md §4
 */

import { mean } from '../utils/proficiency.ts';

export interface SkillBreakdownEntry {
  ontologyId:          string;
  requirementLevel:    'must_have' | 'nice_to_have';
  matched:             boolean;
  matchType:           'direct' | 'transferable' | 'semantic_expansion' | 'none';
  candidateProficiency: ProficiencyLevel | null;
  requiredProficiency:  ProficiencyLevel;
  scoreContribution:    number;
  transferableVia?:     string;
}

export function scoreSkills(
  candidate: CandidateProfile,
  expanded: Map<string, ExpandedRequirement>,
  ctx: PipelineContext,
  trace: TraceBuilder,
): { sMust: number; sNice: number | null; breakdown: SkillBreakdownEntry[] } {

  const mustScores:  number[] = [];
  const niceScores:  number[] = [];
  const breakdown:   SkillBreakdownEntry[] = [];

  for (const [skillId, req] of expanded.entries()) {
    const match = ctx.ontology.findBestCandidateMatch(
      candidate.skills, skillId, req.synonyms,
    );

    let q: number;
    let matchType: SkillBreakdownEntry['matchType'];
    const candidateProficiency = match ? (match.proficiency as ProficiencyLevel) : null;

    if (!match) {
      q = 0.0;
      matchType = 'none';
    } else {
      q = computeSkillScore(candidateProficiency, req.minimumProficiency);
      matchType = q > 0 ? 'direct' : 'none';
    }

    const entry: SkillBreakdownEntry = {
      ontologyId:           skillId,
      requirementLevel:     req.requirementLevel,
      matched:              q > 0,
      matchType,
      candidateProficiency,
      requiredProficiency:  req.minimumProficiency,
      scoreContribution:    q,
    };
    breakdown.push(entry);

    if (req.requirementLevel === 'must_have') mustScores.push(q);
    else                                      niceScores.push(q);
  }

  const sMust = mustScores.length > 0 ? mean(mustScores) : 1.0;
  const sNice = niceScores.length > 0 ? mean(niceScores) : null;

  trace.recordStage('skill_scoring', 'completed', {
    output: { sMust, sNice, breakdownCount: breakdown.length },
  });

  return { sMust, sNice, breakdown };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stage 5: Transferable Skill Compensation
 * See: specs/matching-engine-spec.md Stage 5 / specs/scoring-spec.md §5
 */

import { clamp } from '../utils/proficiency.ts';
import { toNumeric } from '../utils/proficiency.ts';

export function applyTransfer(
  candidate: CandidateProfile,
  breakdown: SkillBreakdownEntry[],
  sMust: number,
  sNice: number | null,
  ctx: PipelineContext,
  trace: TraceBuilder,
): { sMust: number; sNice: number | null; breakdown: SkillBreakdownEntry[] } {

  let transfersApplied = 0;
  const updatedBreakdown = [...breakdown];

  for (const entry of updatedBreakdown) {
    if (entry.matched) continue; // Only consider unmatched skills

    const transferSources = ctx.ontology.getTransferSources(entry.ontologyId);
    let bestScore = 0.0;
    let bestVia:   string | undefined;

    for (const rel of transferSources) {
      const candidateSkill = ctx.ontology.findBestCandidateMatch(
        candidate.skills, rel.source,
      );
      if (!candidateSkill) continue;

      const p = toNumeric(candidateSkill.proficiency as ProficiencyLevel);
      const transferScore = clamp(rel.weight * p, 0, ctx.governance.TRANSFER_SCORE_CAP);

      if (transferScore > bestScore) {
        bestScore = transferScore;
        bestVia   = rel.source;
      }
    }

    if (bestScore > 0 && bestVia) {
      entry.scoreContribution = bestScore;
      entry.matchType         = 'transferable';
      entry.matched           = true;
      entry.transferableVia   = bestVia;
      transfersApplied++;
    }
  }

  // Recompute sMust and sNice with updated scores
  const mustScores = updatedBreakdown
    .filter(e => e.requirementLevel === 'must_have')
    .map(e => e.scoreContribution);
  const niceScores = updatedBreakdown
    .filter(e => e.requirementLevel === 'nice_to_have')
    .map(e => e.scoreContribution);

  const sMustFinal = mustScores.length > 0 ? mean(mustScores) : 1.0;
  const sNiceFinal = niceScores.length > 0 ? mean(niceScores) : null;

  trace.recordStage('transferable_skill_compensation', 'completed', {
    output: { sMust: sMustFinal, sNice: sNiceFinal, transfersApplied },
  });

  return { sMust: sMustFinal, sNice: sNiceFinal, breakdown: updatedBreakdown };
}
