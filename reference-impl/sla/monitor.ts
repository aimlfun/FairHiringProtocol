/**
 * FHP SLA Monitor
 *
 * Polls active candidate–company interactions, computes SLA deadlines,
 * detects breaches, creates GhostingEvents, notifies candidates,
 * and triggers the enforcement ladder.
 *
 * See: specs/governance-escalation-spec.md Part A
 *      specs/ghosting-event.schema.json
 *
 * Designed to run on a schedule (every 4 hours minimum per spec).
 */

import { v4 as uuidv4 }        from 'uuid';
import { GOVERNANCE }          from '../shared/config/governance.js';
import type { GhostingEvent, GhostingStage, GhostingSeverity, UUID } from '../shared/schemas/types.js';

// ── Store interfaces ──────────────────────────────────────────────────────────

export interface ActiveInteraction {
  match_id:       UUID;
  candidate_id:   UUID;
  company_id:     UUID;
  job_id:         UUID;
  current_stage:  GhostingStage;
  stage_entered_at: string;    // when the candidate entered the current stage
  last_contact_at?: string;    // last communication from company
  sla_override_days?: number;  // from job brief process.response_sla_days
}

export interface SLAStore {
  getActiveInteractions(): Promise<ActiveInteraction[]>;
  getExistingGhostingEvent(matchId: UUID, stage: GhostingStage): Promise<GhostingEvent | null>;
  saveGhostingEvent(event: GhostingEvent): Promise<void>;
  updateGhostingEvent(ghostingId: UUID, updates: Partial<GhostingEvent>): Promise<void>;
  getCompanyStrikeCount(companyId: UUID, windowDays: number): Promise<number>;
  recordStrike(companyId: UUID, ghostingId: UUID): Promise<void>;
  pauseJobBrief(jobId: UUID, reason: string): Promise<void>;
  suspendCompany(companyId: UUID, reason: string): Promise<void>;
  notifyCandidate(candidateId: UUID, notification: CandidateNotification): Promise<void>;
  notifyCompany(companyId: UUID, notification: CompanyNotification): Promise<void>;
}

export interface CandidateNotification {
  type:       'sla_breach' | 'stage_update' | 'appeal_update';
  match_id:   UUID;
  message:    string;
  sent_at:    string;
}

export interface CompanyNotification {
  type:         'sla_reminder' | 'sla_warning' | 'strike_recorded' | 'job_paused' | 'account_suspended';
  match_id?:    UUID;
  ghosting_id?: UUID;
  message:      string;
  sent_at:      string;
}

// ── SLA computation ───────────────────────────────────────────────────────────

export function computeSLADeadline(
  stageEnteredAt: string,
  stage:          GhostingStage,
  slaOverrideDays?: number,
): Date {
  const enteredAt   = new Date(stageEnteredAt);
  const defaultDays = GOVERNANCE.SLA_DAYS[stage];
  const slaDays     = (slaOverrideDays !== undefined && slaOverrideDays < defaultDays)
                    ? slaOverrideDays
                    : defaultDays;

  // Add slaDays of business days
  return addBusinessDays(enteredAt, slaDays);
}

function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++; // skip Saturday (6) and Sunday (0)
  }
  return result;
}

export function computeGhostingSeverity(
  overdueHours: number,
  stage:        GhostingStage,
): GhostingSeverity {
  // Offer stage and post-rejection feedback are always severe if ghosted
  if (stage === 'offer_stage' || stage === 'post_rejection_feedback') return 'severe';
  if (overdueHours >= GOVERNANCE.GHOSTING_SEVERITY.significant_max_hours) return 'severe';
  if (overdueHours >= GOVERNANCE.GHOSTING_SEVERITY.minor_max_hours)       return 'significant';
  return 'minor';
}

// ── Monitor run ───────────────────────────────────────────────────────────────

export async function runSLAMonitor(store: SLAStore): Promise<void> {
  const now         = new Date();
  const interactions = await store.getActiveInteractions();
  let   breachCount = 0;

  console.log(`[SLAMonitor] Checking ${interactions.length} active interactions`);

  for (const interaction of interactions) {
    const deadline = computeSLADeadline(
      interaction.stage_entered_at,
      interaction.current_stage,
      interaction.sla_override_days,
    );

    if (now <= deadline) continue; // Within SLA — no action needed

    // SLA breached — check if we already have a ghosting event for this stage
    const existing = await store.getExistingGhostingEvent(
      interaction.match_id, interaction.current_stage,
    );
    if (existing && existing.status !== 'open') continue; // Already handled

    const overdueMs    = now.getTime() - deadline.getTime();
    const overdueHours = overdueMs / (1000 * 60 * 60);
    const severity     = computeGhostingSeverity(overdueHours, interaction.current_stage);
    const strikeCount  = await store.getCompanyStrikeCount(
      interaction.company_id, GOVERNANCE.STRIKE_WINDOW_DAYS,
    );

    if (!existing) {
      // Create new ghosting event
      const ghostingEvent: GhostingEvent = {
        fhp_version:    GOVERNANCE.FHP_VERSION,
        ghosting_id:    uuidv4(),
        candidate_id:   interaction.candidate_id,
        company_id:     interaction.company_id,
        job_id:         interaction.job_id,
        match_id:       interaction.match_id,
        stage_name:     interaction.current_stage,
        last_contact_at: interaction.last_contact_at,
        sla_deadline:   deadline.toISOString(),
        detected_at:    now.toISOString(),
        overdue_hours:  Math.round(overdueHours * 10) / 10,
        severity,
        status:         'open',
        company_strike_count_at_detection: strikeCount,
        candidate_notified_at: now.toISOString(),
        platform_actions_taken: [],
      };

      await store.saveGhostingEvent(ghostingEvent);
      breachCount++;

      // Notify candidate immediately
      await store.notifyCandidate(interaction.candidate_id, {
        type:     'sla_breach',
        match_id: interaction.match_id,
        message:  `The company has not responded within their committed timeframe at the ${interaction.current_stage.replace(/_/g, ' ')} stage. You are entitled to escalate this.`,
        sent_at:  now.toISOString(),
      });

      // Apply enforcement based on severity and strike count
      await applyEnforcement(ghostingEvent, strikeCount, store, now);

    } else if (existing.status === 'open') {
      // Existing open event — check if severity has escalated
      const newSeverity = computeGhostingSeverity(overdueHours, interaction.current_stage);
      if (newSeverity !== existing.severity) {
        await store.updateGhostingEvent(existing.ghosting_id, {
          severity:      newSeverity,
          overdue_hours: Math.round(overdueHours * 10) / 10,
        });
        // Re-apply enforcement with upgraded severity
        await applyEnforcement({ ...existing, severity: newSeverity }, strikeCount, store, now);
      }
    }
  }

  console.log(`[SLAMonitor] Complete. ${breachCount} new breaches detected.`);
}

// ── Enforcement ladder ────────────────────────────────────────────────────────

async function applyEnforcement(
  event:       GhostingEvent,
  strikeCount: number,
  store:       SLAStore,
  now:         Date,
): Promise<void> {
  const actions: GhostingEvent['platform_actions_taken'] = [];
  const sent_at = now.toISOString();

  // See governance-escalation-spec.md Part A §A.4
  if (event.severity === 'minor' && strikeCount === 0) {
    // First minor: reminder only, no strike
    await store.notifyCompany(event.company_id, {
      type:       'sla_reminder',
      match_id:   event.match_id,
      ghosting_id: event.ghosting_id,
      message:    `Reminder: you have not responded to a candidate at the ${event.stage_name.replace(/_/g, ' ')} stage. Please respond within 24 hours to avoid a compliance strike.`,
      sent_at,
    });
    actions?.push({ action: 'company_reminder_sent', taken_at: sent_at });

  } else if (event.severity === 'minor' && strikeCount >= 1) {
    // Second+ minor for same job: warning + strike
    await recordStrikeAndWarn(event, store, now, actions!);

  } else if (event.severity === 'significant') {
    // First significant: warning + strike
    await recordStrikeAndWarn(event, store, now, actions!);

  } else if (event.severity === 'severe') {
    // Severe: strike + governance notification
    await recordStrikeAndWarn(event, store, now, actions!);
    console.warn(`[SLAMonitor] SEVERE GHOSTING: company=${event.company_id}, match=${event.match_id}, stage=${event.stage_name}`);
  }

  // Check strike thresholds
  const newStrikeCount = strikeCount + (actions?.some(a => a.action === 'compliance_score_updated') ? 1 : 0);

  if (newStrikeCount >= GOVERNANCE.STRIKES_TO_SUSPEND) {
    await store.suspendCompany(event.company_id,
      `${newStrikeCount} SLA strikes in ${GOVERNANCE.STRIKE_WINDOW_DAYS} days. Account suspended pending governance review.`);
    actions?.push({ action: 'governance_escalation_triggered', taken_at: sent_at });
    console.warn(`[SLAMonitor] COMPANY SUSPENDED: ${event.company_id}`);

  } else if (newStrikeCount >= GOVERNANCE.STRIKES_TO_PAUSE) {
    await store.pauseJobBrief(event.job_id,
      `${newStrikeCount} SLA strikes in ${GOVERNANCE.STRIKE_WINDOW_DAYS} days. Job brief paused pending PC review.`);
    actions?.push({ action: 'job_brief_sla_flag_set', taken_at: sent_at });
  }

  await store.updateGhostingEvent(event.ghosting_id, {
    platform_actions_taken: actions,
  });
}

async function recordStrikeAndWarn(
  event:   GhostingEvent,
  store:   SLAStore,
  now:     Date,
  actions: NonNullable<GhostingEvent['platform_actions_taken']>,
): Promise<void> {
  const sent_at = now.toISOString();
  await store.recordStrike(event.company_id, event.ghosting_id);
  await store.notifyCompany(event.company_id, {
    type:        'strike_recorded',
    match_id:    event.match_id,
    ghosting_id: event.ghosting_id,
    message:     `A compliance strike has been recorded against your account for failing to respond to a candidate at the ${event.stage_name.replace(/_/g, ' ')} stage. ${GOVERNANCE.STRIKES_TO_PAUSE} strikes within ${GOVERNANCE.STRIKE_WINDOW_DAYS} days will result in job brief pausing.`,
    sent_at,
  });
  actions.push(
    { action: 'company_warning_sent',     taken_at: sent_at },
    { action: 'compliance_score_updated', taken_at: sent_at },
  );
}
