/**
 * FHP Appeals State Machine
 *
 * Manages the full lifecycle of a candidate appeal:
 *   submitted → twg_review → pc_review → [fob_review →] resolved
 *
 * See: specs/governance-escalation-spec.md Part B §B.5
 *      specs/candidate-rights-charter.md §3
 */

import { v4 as uuidv4 }        from 'uuid';
import { GOVERNANCE }          from '../shared/config/governance.js';
import { AppealIneligibleError, NotFoundError } from '../shared/errors/index.js';
import type { Appeal, AppealGround, AppealStatus, AppealOutcome, UUID } from '../shared/schemas/types.js';

// ── Store interface ───────────────────────────────────────────────────────────

export interface AppealStore {
  getAppeal(appealId: UUID): Promise<Appeal | null>;
  getAppealByMatch(matchId: UUID): Promise<Appeal | null>;
  saveAppeal(appeal: Appeal): Promise<void>;
  updateAppeal(appealId: UUID, updates: Partial<Appeal>): Promise<void>;
  getMatchDecision(matchId: UUID): Promise<{ decision: string; created_at: string } | null>;
  notifyCandidate(candidateId: UUID, message: string): Promise<void>;
  notifyGovernanceBody(body: 'twg' | 'pc' | 'fob', appealId: UUID, message: string): Promise<void>;
  createEscalationRecord(appeal: Appeal, type: string): Promise<string>;
}

// ── Submission ────────────────────────────────────────────────────────────────

export async function submitAppeal(
  store:       AppealStore,
  candidateId: UUID,
  matchId:     UUID,
  jobId:       UUID,
  ground:      AppealGround,
  detail:      string,
): Promise<Appeal> {

  // Check eligibility: only not_matched decisions are appealable
  const matchRecord = await store.getMatchDecision(matchId);
  if (!matchRecord) throw new NotFoundError('Match', matchId);

  // Check 30-day submission window
  const matchDate    = new Date(matchRecord.created_at);
  const windowCutoff = new Date(matchDate.getTime() + GOVERNANCE.APPEAL_SUBMISSION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  if (new Date() > windowCutoff) {
    throw new AppealIneligibleError(
      `Appeal window has expired. Appeals must be submitted within ${GOVERNANCE.APPEAL_SUBMISSION_WINDOW_DAYS} days of the match outcome.`,
      { matchId, windowCutoff: windowCutoff.toISOString() },
    );
  }

  // Check for duplicate appeal
  const existing = await store.getAppealByMatch(matchId);
  if (existing && existing.status !== 'withdrawn') {
    throw new AppealIneligibleError(
      'An appeal already exists for this match and has not been withdrawn.',
      { matchId, existingAppealId: existing.appeal_id },
    );
  }

  if (detail.trim().length < 20) {
    throw new AppealIneligibleError('Appeal detail must be at least 20 characters.');
  }

  const appeal: Appeal = {
    appeal_id:    uuidv4(),
    match_id:     matchId,
    candidate_id: candidateId,
    job_id:       jobId,
    submitted_at: new Date().toISOString(),
    ground,
    detail:       detail.trim(),
    status:       'submitted',
    outcome:      'pending',
  };

  await store.saveAppeal(appeal);
  await store.createEscalationRecord(appeal, 'candidate_appeal');

  // Route to TWG immediately
  await transitionToTWGReview(store, appeal);

  return appeal;
}

// ── State transitions ─────────────────────────────────────────────────────────

async function transitionToTWGReview(store: AppealStore, appeal: Appeal): Promise<void> {
  const updates: Partial<Appeal> = { status: 'twg_review' };
  await store.updateAppeal(appeal.appeal_id, updates);

  const deadline = addBusinessDays(new Date(), GOVERNANCE.APPEAL_TWG_REVIEW_DAYS);
  await store.notifyGovernanceBody('twg', appeal.appeal_id,
    `New appeal submitted (ID: ${appeal.appeal_id}). Ground: ${appeal.ground}. ` +
    `Review deadline: ${deadline.toLocaleDateString()}. ` +
    `Review the pipeline trace for match ${appeal.match_id}.`
  );
}

export async function recordTWGFinding(
  store:       AppealStore,
  appealId:    UUID,
  finding:     string,
  errorFound:  boolean,
): Promise<Appeal> {
  const appeal = await store.getAppeal(appealId);
  if (!appeal) throw new NotFoundError('Appeal', appealId);
  if (appeal.status !== 'twg_review') {
    throw new Error(`Appeal ${appealId} is not in twg_review status (current: ${appeal.status})`);
  }

  const updates: Partial<Appeal> = {
    status:      'pc_review',
    twg_finding: finding,
  };
  await store.updateAppeal(appealId, updates);

  const deadline = addBusinessDays(new Date(), GOVERNANCE.APPEAL_PC_DECISION_DAYS);
  await store.notifyGovernanceBody('pc', appealId,
    `TWG technical review complete for appeal ${appealId}. ` +
    `${errorFound ? 'ERROR FOUND' : 'No error found'}. ` +
    `Finding: ${finding}. ` +
    `PC decision required by ${deadline.toLocaleDateString()}.`
  );

  return { ...appeal, ...updates };
}

export async function recordPCDecision(
  store:       AppealStore,
  appealId:    UUID,
  outcome:     AppealOutcome,
  decision:    string,
): Promise<Appeal> {
  const appeal = await store.getAppeal(appealId);
  if (!appeal) throw new NotFoundError('Appeal', appealId);
  if (appeal.status !== 'pc_review') {
    throw new Error(`Appeal ${appealId} is not in pc_review status (current: ${appeal.status})`);
  }

  if (outcome === 'referred_to_fob') {
    // Route to FOB for systemic review
    const updates: Partial<Appeal> = { status: 'fob_review', pc_decision: decision };
    await store.updateAppeal(appealId, updates);
    await store.notifyGovernanceBody('fob', appealId,
      `Appeal ${appealId} referred for systemic review. PC notes: ${decision}`
    );
    await store.notifyCandidate(appeal.candidate_id,
      `Your appeal (${appealId}) has been referred to the Fairness Oversight Board for a broader review. ` +
      `You will be notified of the outcome within 20 business days.`
    );
    return { ...appeal, ...updates };
  }

  // Resolved by PC
  const updates: Partial<Appeal> = {
    status:      'resolved',
    outcome,
    resolved_at: new Date().toISOString(),
    pc_decision: decision,
  };
  await store.updateAppeal(appealId, updates);

  const candidateMessage = buildCandidateResolutionMessage(outcome, decision);
  await store.notifyCandidate(appeal.candidate_id, candidateMessage);

  return { ...appeal, ...updates };
}

export async function recordFOBDecision(
  store:    AppealStore,
  appealId: UUID,
  outcome:  Exclude<AppealOutcome, 'referred_to_fob' | 'pending'>,
  notes:    string,
): Promise<Appeal> {
  const appeal = await store.getAppeal(appealId);
  if (!appeal) throw new NotFoundError('Appeal', appealId);
  if (appeal.status !== 'fob_review') {
    throw new Error(`Appeal ${appealId} is not in fob_review status`);
  }

  const updates: Partial<Appeal> = {
    status:      'resolved',
    outcome,
    resolved_at: new Date().toISOString(),
    pc_decision: notes, // reuse field for FOB notes in reference impl
  };
  await store.updateAppeal(appealId, updates);
  await store.notifyCandidate(appeal.candidate_id,
    buildCandidateResolutionMessage(outcome, notes)
  );

  return { ...appeal, ...updates };
}

export async function withdrawAppeal(
  store:       AppealStore,
  appealId:    UUID,
  candidateId: UUID,
): Promise<void> {
  const appeal = await store.getAppeal(appealId);
  if (!appeal) throw new NotFoundError('Appeal', appealId);
  if (appeal.candidate_id !== candidateId) {
    throw new Error('Only the submitting candidate may withdraw an appeal.');
  }
  if (appeal.status === 'resolved') {
    throw new AppealIneligibleError('Cannot withdraw a resolved appeal.');
  }
  await store.updateAppeal(appealId, { status: 'withdrawn' });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildCandidateResolutionMessage(
  outcome: AppealOutcome,
  detail:  string,
): string {
  switch (outcome) {
    case 'upheld':
      return `Your appeal has been reviewed. The original match outcome was correct. ${detail}`;
    case 'overturned':
      return `Your appeal has been upheld. An error was found in the match pipeline. Your outcome has been corrected. ${detail}`;
    case 'partially_upheld':
      return `Your appeal identified a minor error in the match process. However, the overall outcome remains unchanged. Your match explanation has been updated. ${detail}`;
    default:
      return `Your appeal has been resolved. ${detail}`;
  }
}

function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}
