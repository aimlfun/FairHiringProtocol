/**
 * FHP TraceBuilder
 *
 * Accumulates stage records during a pipeline run and produces
 * the final immutable PipelineTrace on finalise().
 *
 * Traces are append-only. Once finalised, they cannot be modified.
 * See: specs/trace.schema.json
 */

import { createHash }          from 'node:crypto';
import { v4 as uuidv4 }        from 'uuid';
import { GOVERNANCE }          from '../config/governance.js';
import type { PipelineContext } from '../../matching-engine/context.js';

interface StageRecord {
  stage_name:    string;
  stage_order:   number;
  status:        'completed' | 'skipped' | 'failed';
  started_at:    string;
  completed_at?: string;
  duration_ms?:  number;
  input_snapshot:  Record<string, unknown> | undefined;
  output_snapshot: Record<string, unknown> | undefined;
  decisions:     Array<{ decision_type: string; value: unknown; rationale: string; confidence?: number }> | undefined;
  warnings:      Array<{ code: string; message: string }> | undefined;
}

const STAGE_ORDER: Record<string, number> = {
  normalisation:                    1,
  semantic_expansion:               2,
  constraint_satisfaction:          3,
  skill_scoring:                    4,
  transferable_skill_compensation:  5,
  preference_alignment:             6,
  bias_detection:                   7,
  bias_correction:                  8,
  explanation_generation:           9,
};

export class TraceBuilder {
  readonly traceId:    string;
  readonly matchId:    string;
  readonly candidateId: string;
  readonly jobId:      string;
  private readonly startedAt: string;
  private readonly stages:    StageRecord[] = [];
  private finalised = false;

  constructor(
    traceId: string,
    matchId: string,
    candidateId: string,
    jobId: string,
    _ctx: PipelineContext,
  ) {
    this.traceId     = traceId;
    this.matchId     = matchId;
    this.candidateId = candidateId;
    this.jobId       = jobId;
    this.startedAt   = new Date().toISOString();
  }

  recordStage(
    stageName: string,
    status: 'completed' | 'skipped' | 'failed',
    data?: {
      input?:     Record<string, unknown>;
      output?:    Record<string, unknown>;
      decisions?: Array<{ decision_type: string; value: unknown; rationale: string }>;
      warnings?:  Array<{ code: string; message: string }>;
    },
  ): void {
    if (this.finalised) {
      throw new Error(`Cannot record stage on finalised trace: ${this.traceId}`);
    }
    const now = new Date().toISOString();
    this.stages.push({
      stage_name:      stageName,
      stage_order:     STAGE_ORDER[stageName] ?? 0,
      status,
      started_at:      now,
      completed_at:    now,
      input_snapshot:  data?.input,
      output_snapshot: data?.output,
      decisions:       data?.decisions,
      warnings:        data?.warnings,
    });
  }

  finalise(
    status: 'completed' | 'failed' | 'aborted',
    failureReason?: string,
  ): Record<string, unknown> {
    if (this.finalised) {
      throw new Error(`Trace already finalised: ${this.traceId}`);
    }
    this.finalised = true;

    const completedAt = new Date().toISOString();
    const startMs     = new Date(this.startedAt).getTime();
    const endMs       = new Date(completedAt).getTime();

    const trace: Record<string, unknown> = {
      fhp_version:      GOVERNANCE.FHP_VERSION,
      trace_id:         this.traceId,
      match_id:         this.matchId,
      candidate_id:     this.candidateId,
      job_id:           this.jobId,
      pipeline_version: GOVERNANCE.PIPELINE_VERSION,
      started_at:       this.startedAt,
      completed_at:     completedAt,
      duration_ms:      endMs - startMs,
      status,
      failure_reason:   failureReason ?? null,
      stages:           this.stages,
    };

    // Compute tamper-detection checksum
    const canonical = JSON.stringify(trace, Object.keys(trace).sort());
    trace['checksum'] = createHash('sha256').update(canonical).digest('hex');

    return trace;
  }
}
