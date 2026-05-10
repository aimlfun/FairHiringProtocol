/**
 * FHP Shared Types
 *
 * Core TypeScript types derived from the FHP JSON schemas.
 * These are the runtime type contracts used throughout the reference implementation.
 */

// ── Identity ──────────────────────────────────────────────────────────────────

export type UUID = string;

// ── Proficiency ───────────────────────────────────────────────────────────────

export type ProficiencyLevel = 'aware' | 'practitioner' | 'proficient' | 'expert' | 'authority';

// ── Candidate Profile ─────────────────────────────────────────────────────────

export interface CandidateSkill {
  ontology_id:        string;
  proficiency:        ProficiencyLevel;
  years_of_experience?: number;
  evidence?:          Array<{ type: string; value?: string }>;
}

export interface SalaryPreference {
  currency:  string;
  minimum:   number;
  preferred?: number;
  period:    'annual' | 'daily' | 'hourly';
}

export interface CandidatePreferences {
  work_modes?:       Array<'remote' | 'hybrid' | 'on_site'>;
  locations?:        string[];
  salary?:           SalaryPreference;
  employment_types?: Array<'permanent' | 'contract' | 'part_time' | 'internship' | 'apprenticeship'>;
  notice_period_days?: number;
  open_to_relocation?: boolean;
}

export interface CandidateProfile {
  fhp_version:    string;
  candidate_id:   UUID;
  created_at:     string;
  updated_at?:    string;
  skills:         CandidateSkill[];
  work_history?:  Array<{
    role_description: string;
    employer_type?:   string;
    start_date:       string;
    end_date?:        string;
    is_current?:      boolean;
    skills_used?:     string[];
  }>;
  preferences?:   CandidatePreferences;
  privacy?:       {
    searchable?:            boolean;
    anonymised_matching?:   boolean;
    data_retention_days?:   number;
    consented_at?:          string;
  };
}

// ── Job Brief ─────────────────────────────────────────────────────────────────

export interface JobSkillRequirement {
  ontology_id:         string;
  requirement_level:   'must_have' | 'nice_to_have';
  minimum_proficiency: ProficiencyLevel;
  context?:            string;
}

export interface SalaryRange {
  currency:       string;
  minimum:        number;
  maximum:        number;
  period:         'annual' | 'daily' | 'hourly';
  includes_bonus?: boolean;
  notes?:         string;
}

export interface JobLocation {
  country:                  string;
  region?:                  string;
  city?:                    string;
  remote_regions_permitted?: string[];
}

export interface JobBrief {
  fhp_version:      string;
  job_id:           UUID;
  company_id:       UUID;
  created_at:       string;
  updated_at?:      string;
  expires_at?:      string;
  status:           'draft' | 'active' | 'paused' | 'filled' | 'cancelled';
  title:            string;
  role_summary:     string;
  skills_required:  JobSkillRequirement[];
  salary:           SalaryRange;
  work_mode:        'remote' | 'hybrid' | 'on_site';
  location:         JobLocation;
  employment_type:  'permanent' | 'contract' | 'part_time' | 'internship' | 'apprenticeship';
  process?: {
    stages?:              Array<{ name: string; description?: string; duration_estimate_minutes?: number; is_async?: boolean }>;
    target_start_date?:   string;
    response_sla_days?:   number;
  };
}

// ── Match Explanation ─────────────────────────────────────────────────────────

export type MatchDecision = 'matched' | 'not_matched' | 'borderline';

export interface SkillBreakdown {
  ontology_id:           string;
  requirement_level:     'must_have' | 'nice_to_have';
  matched:               boolean;
  match_type:            'direct' | 'transferable' | 'semantic_expansion' | 'none';
  candidate_proficiency: ProficiencyLevel | null;
  required_proficiency:  ProficiencyLevel;
  score_contribution:    number;
  transferable_via?:     string | null;
}

export interface BiasAssessment {
  triggered:          boolean;
  metricsEvaluated:   string[];
  correctionApplied?: {
    metric:        string;
    direction:     'upward' | 'downward';
    magnitude:     number;
    humanReadable: string;
  };
}

export interface MatchExplanation {
  fhp_version:       string;
  explanation_id:    UUID;
  match_id:          UUID;
  candidate_id:      UUID;
  job_id:            UUID;
  generated_at:      string;
  pipeline_version?: string;
  outcome: {
    decision:              MatchDecision;
    overall_score:         number;
    pre_correction_score?: number;
    not_matched_reasons?:  Array<{
      reason_code:           string;
      human_readable:        string;
      ontology_id?:          string;
      required_proficiency?: ProficiencyLevel;
      candidate_proficiency?: ProficiencyLevel | null;
    }>;
  };
  scores: {
    skill_score:               number;
    transferable_skill_score:  number;
    preference_alignment_score: number;
    bias_correction_delta:     number;
  };
  skill_breakdown:    SkillBreakdown[];
  bias_assessment:    BiasAssessment;
  audience:           'candidate' | 'employer' | 'governance';
  plain_language_summary?: string;
  next_steps?:        Array<{ suggestion: string; related_skill_ontology_id?: string }>;
  appeal_eligible?:   boolean;
}

// ── Pipeline Trace ────────────────────────────────────────────────────────────

export interface PipelineTrace {
  fhp_version:      string;
  trace_id:         UUID;
  match_id:         UUID;
  candidate_id:     UUID;
  job_id:           UUID;
  pipeline_version: string;
  started_at:       string;
  completed_at:     string;
  duration_ms?:     number;
  status:           'completed' | 'failed' | 'aborted';
  failure_reason?:  string | null;
  stages:           unknown[];
  checksum?:        string;
}

// ── Ghosting Event ────────────────────────────────────────────────────────────

export type GhostingStage =
  | 'initial_match_acknowledgement'
  | 'application_review'
  | 'screening_call'
  | 'technical_assessment'
  | 'interview_stage'
  | 'offer_stage'
  | 'post_rejection_feedback';

export type GhostingSeverity = 'minor' | 'significant' | 'severe';
export type GhostingStatus   = 'open' | 'resolved' | 'escalated' | 'disputed';

export interface GhostingEvent {
  fhp_version:    string;
  ghosting_id:    UUID;
  candidate_id:   UUID;
  company_id:     UUID;
  job_id:         UUID;
  match_id:       UUID;
  stage_name:     GhostingStage;
  last_contact_at?: string;
  sla_deadline:   string;
  detected_at:    string;
  overdue_hours?: number;
  severity:       GhostingSeverity;
  status:         GhostingStatus;
  resolved_at?:   string;
  resolution_type?: string;
  candidate_notified_at?: string;
  company_strike_count_at_detection?: number;
  platform_actions_taken?: Array<{ action: string; taken_at: string }>;
}

// ── Appeal ────────────────────────────────────────────────────────────────────

export type AppealStatus   = 'submitted' | 'twg_review' | 'pc_review' | 'fob_review' | 'resolved' | 'withdrawn';
export type AppealOutcome  = 'upheld' | 'overturned' | 'partially_upheld' | 'referred_to_fob' | 'pending';
export type AppealGround   = 'incorrect_skill_assessment' | 'preference_mismatch' | 'suspected_bias';

export interface Appeal {
  appeal_id:    UUID;
  match_id:     UUID;
  candidate_id: UUID;
  job_id:       UUID;
  submitted_at: string;
  ground:       AppealGround;
  detail:       string;
  status:       AppealStatus;
  outcome?:     AppealOutcome;
  resolved_at?: string;
  twg_finding?: string;
  pc_decision?: string;
}
