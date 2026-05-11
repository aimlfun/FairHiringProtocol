-- =============================================================================
-- FHP Migration 009b: config.governance_constants
--
-- This table was referenced in 009_sla_ghosting.sql and later migrations
-- but never explicitly created. It must run after 002_schemas.sql (which
-- creates the config schema) and before any migration that INSERTs into it.
--
-- Seeded with all protocol-level constants from governance.ts.
-- Changes to these values require a formal FHP-P proposal and PC vote.
-- =============================================================================

CREATE TABLE IF NOT EXISTS config.governance_constants (
  key              TEXT          PRIMARY KEY,
  value            TEXT          NOT NULL,
  value_type       TEXT          NOT NULL
                   CHECK (value_type IN ('numeric','integer','boolean','text')),
  description      TEXT          NOT NULL,
  protocol_version TEXT          NOT NULL DEFAULT '1.0.0',
  requires_pc_vote BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE config.governance_constants IS
  'Protocol-level governance constants. '
  'Values may not be changed by operators or implementations. '
  'All changes require a formal FHP-P proposal and 4/6 Protocol Council vote.';

-- Seed all constants from governance.ts
INSERT INTO config.governance_constants (key, value, value_type, protocol_version, description) VALUES

-- Protocol version
('FHP_VERSION',                    '1.0.0', 'text',    '1.0.0', 'Current FHP protocol version'),
('PIPELINE_VERSION',               '1.0.0', 'text',    '1.0.0', 'Current matching pipeline version'),

-- Scoring weights (must sum to 1.0)
('WEIGHT_MUST_HAVE',               '0.55',  'numeric', '1.0.0', 'Weight of must-have skills in composite score'),
('WEIGHT_NICE_TO_HAVE',            '0.25',  'numeric', '1.0.0', 'Weight of nice-to-have skills in composite score'),
('WEIGHT_PREFERENCE',              '0.20',  'numeric', '1.0.0', 'Weight of preference alignment in composite score'),

-- Match thresholds
('MATCH_THRESHOLD',                '0.60',  'numeric', '1.0.0', 'Minimum composite score for a matched decision'),
('BORDERLINE_THRESHOLD',           '0.50',  'numeric', '1.0.0', 'Minimum composite score for a borderline decision'),

-- Transfer scoring
('TRANSFER_SCORE_CAP',             '0.60',  'numeric', '1.0.0', 'Maximum credit a transfer skill can contribute'),

-- Salary tolerance
('SALARY_HARD_FAIL_TOLERANCE',     '0.85',  'numeric', '1.0.0', 'Fraction of salary minimum below which constraint fails hard'),

-- Bias correction
('CORRECTION_SCALING_FACTOR',      '0.50',  'numeric', '1.0.0', 'Scales bias correction delta before application'),
('CORRECTION_CAP',                 '0.15',  'numeric', '1.0.0', 'Maximum bias correction adjustment to any score'),
('GOVERNANCE_ALERT_THRESHOLD',     '0.10',  'numeric', '1.0.0', 'Correction delta above which a governance alert fires'),

-- Fairness metric bounds
('DIR_LOWER_BOUND',                '0.80',  'numeric', '1.0.0', 'Lower bound for Disparate Impact Ratio'),
('DIR_UPPER_BOUND',                '1.25',  'numeric', '1.0.0', 'Upper bound for Disparate Impact Ratio'),
('EOD_THRESHOLD',                  '0.05',  'numeric', '1.0.0', 'Maximum Equal Opportunity Difference before breach'),
('SDS_THRESHOLD',                  '0.03',  'numeric', '1.0.0', 'Maximum Score Distribution Skew before breach'),
('MIN_COHORT_SIZE',                '20',    'integer', '1.0.0', 'Minimum cohort size for bias detection to activate'),

-- Demographics
('DEMOGRAPHICS_MIN_DISCLOSURE_RATE','0.20', 'numeric', '1.0.0', 'Minimum fraction of candidates who must have provided demographic data for metrics to be reliable'),
('DEMOGRAPHICS_COMPLIANCE_WEIGHT', '0.05',  'numeric', '1.0.0', 'Weight of demographic disclosure rate in compliance score'),

-- SLA windows (business days)
('SLA_INITIAL_MATCH_ACK',          '5',     'integer', '1.0.0', 'Business days to acknowledge a new match'),
('SLA_APPLICATION_REVIEW',         '10',    'integer', '1.0.0', 'Business days to complete application review'),
('SLA_SCREENING_CALL',             '5',     'integer', '1.0.0', 'Business days to schedule/complete screening call'),
('SLA_TECHNICAL_ASSESSMENT',       '7',     'integer', '1.0.0', 'Business days to return technical assessment result'),
('SLA_INTERVIEW_STAGE',            '5',     'integer', '1.0.0', 'Business days to respond after interview'),
('SLA_OFFER_STAGE',                '10',    'integer', '1.0.0', 'Business days to confirm or withdraw offer'),
('SLA_POST_REJECTION_FEEDBACK',    '10',    'integer', '1.0.0', 'Business days to provide structured rejection feedback'),

-- Ghosting enforcement
('STRIKES_TO_PAUSE',               '3',     'integer', '1.0.0', 'Ghosting strikes in 90 days before job brief is paused'),
('STRIKES_TO_SUSPEND',             '5',     'integer', '1.0.0', 'Ghosting strikes in 90 days before account is suspended'),
('STRIKE_WINDOW_DAYS',             '90',    'integer', '1.0.0', 'Rolling window in days for strike counting'),
('STRIKE_EXPIRY_DAYS',             '365',   'integer', '1.0.0', 'Days after which a strike expires'),

-- Fairness computation
('FAIRNESS_ROLLING_WINDOW_DAYS',         '30', 'integer', '1.0.0', 'Rolling window in days for fairness metric computation'),
('CONSECUTIVE_BREACH_BEFORE_REVIEW',      '3', 'integer', '1.0.0', 'Consecutive breach windows before governance review is triggered'),
('CONSECUTIVE_NO_IMPROVE_BEFORE_FOB',     '7', 'integer', '1.0.0', 'Consecutive breach windows before FOB escalation'),

-- Compliance scoring
('COMPLIANCE_WEIGHT_SLA',                '0.35', 'numeric', '1.0.0', 'SLA compliance weight in company compliance score'),
('COMPLIANCE_WEIGHT_GHOSTING',           '0.25', 'numeric', '1.0.0', 'Ghosting events weight in company compliance score'),
('COMPLIANCE_WEIGHT_FAIRNESS',           '0.25', 'numeric', '1.0.0', 'Fairness metrics weight in company compliance score'),
('COMPLIANCE_WEIGHT_REJECTIONS',         '0.15', 'numeric', '1.0.0', 'Structured rejections weight in company compliance score'),
('COMPLIANCE_REVIEW_THRESHOLD',          '0.70', 'numeric', '1.0.0', 'Score below which a compliance review is triggered'),
('COMPLIANCE_PAUSE_THRESHOLD',           '0.50', 'numeric', '1.0.0', 'Score below which job briefs are paused'),

-- Appeal windows
('APPEAL_SUBMISSION_WINDOW_DAYS',  '30',    'integer', '1.0.0', 'Days from match outcome within which an appeal may be submitted'),
('APPEAL_TWG_REVIEW_DAYS',         '10',    'integer', '1.0.0', 'Business days for TWG to complete technical review'),
('APPEAL_PC_DECISION_DAYS',        '10',    'integer', '1.0.0', 'Business days for Protocol Council to issue decision')

ON CONFLICT (key) DO NOTHING;
