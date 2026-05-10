/**
 * FHP Canonical Error Types
 *
 * All errors thrown within the pipeline inherit from FHPError.
 * This enables callers to distinguish protocol errors from system errors.
 */

export class FHPError extends Error {
  readonly code: string;
  readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name  = 'FHPError';
    this.code  = code;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

/** Schema validation failed for an input entity */
export class ValidationError extends FHPError {
  readonly errors: unknown[];
  constructor(message: string, errors: unknown[]) {
    super(message, 'VALIDATION_ERROR', { errors });
    this.name   = 'ValidationError';
    this.errors = errors;
  }
}

/** A skill ID referenced in a profile or job brief does not exist in the ontology */
export class UnknownSkillError extends FHPError {
  readonly skillId: string;
  constructor(skillId: string) {
    super(`Unknown skill ontology ID: ${skillId}`, 'UNKNOWN_SKILL', { skillId });
    this.name    = 'UnknownSkillError';
    this.skillId = skillId;
  }
}

/** Pipeline stage failed unrecoverably */
export class PipelineStageError extends FHPError {
  readonly stage: string;
  constructor(stage: string, message: string, context?: Record<string, unknown>) {
    super(`Pipeline stage '${stage}' failed: ${message}`, 'PIPELINE_STAGE_ERROR', { stage, ...context });
    this.name  = 'PipelineStageError';
    this.stage = stage;
  }
}

/** Attempted to write a completed trace (immutability violation) */
export class TraceImmutabilityError extends FHPError {
  constructor(traceId: string) {
    super(`Cannot modify completed trace: ${traceId}`, 'TRACE_IMMUTABILITY_ERROR', { traceId });
    this.name = 'TraceImmutabilityError';
  }
}

/** Trace checksum verification failed */
export class TraceIntegrityError extends FHPError {
  constructor(traceId: string, expected: string, actual: string) {
    super(`Trace integrity check failed for ${traceId}`, 'TRACE_INTEGRITY_ERROR', { traceId, expected, actual });
    this.name = 'TraceIntegrityError';
  }
}

/** Multi-model inference produced a high-disagreement result */
export class MMILHighDisagreementError extends FHPError {
  readonly task: string;
  constructor(task: string, context?: Record<string, unknown>) {
    super(`MMIL high disagreement for task: ${task}`, 'MMIL_HIGH_DISAGREEMENT', { task, ...context });
    this.name = 'MMILHighDisagreementError';
    this.task = task;
  }
}

/** Appeal not eligible (outside time window, already resolved, etc.) */
export class AppealIneligibleError extends FHPError {
  constructor(reason: string, context?: Record<string, unknown>) {
    super(`Appeal ineligible: ${reason}`, 'APPEAL_INELIGIBLE', context);
    this.name = 'AppealIneligibleError';
  }
}

/** Entity not found */
export class NotFoundError extends FHPError {
  constructor(entityType: string, id: string) {
    super(`${entityType} not found: ${id}`, 'NOT_FOUND', { entityType, id });
    this.name = 'NotFoundError';
  }
}
