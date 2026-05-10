-- =============================================================================
-- FHP Config Schema and Governance Constants
-- Seeds: 001_governance_constants.sql
-- These values mirror shared/config/governance.ts exactly.
-- Changes require a governance decision (FHP-P proposal + PC vote).
-- =============================================================================

CREATE TABLE IF NOT EXISTS config.governance_constants (
  key               TEXT          PRIMARY KEY,
  value             TEXT          NOT NULL,
  value_type        TEXT          NOT NULL CHECK (value_type IN ('numeric', 'integer', 'boolean', 'text')),
  description       TEXT          NOT NULL,
  protocol_version  TEXT          NOT NULL,
  requires_pc_vote  BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE config.governance_constants IS
  'Protocol-controlled constants. Cannot be changed by operators or companies. '
  'Changes require FHP-P proposal and Protocol Council vote (4/6 majority). '
  'Values here must stay in sync with reference-impl/shared/config/governance.ts.';

-- Truncate and re-seed on migration (constants are authoritative from code)
TRUNCATE config.governance_constants;

INSERT INTO config.governance_constants
  (key, value, value_type, description, protocol_version, requires_pc_vote)
VALUES

  -- Protocol versioning
  ('FHP_VERSION',          '1.0.0',  'text',    'Current FHP specification version', '1.0.0', FALSE),
  ('PIPELINE_VERSION',     '1.0.0',  'text',    'Current matching pipeline version', '1.0.0', FALSE),

  -- Scoring weights (must sum to 1.0)
  ('WEIGHT_MUST_HAVE',     '0.55',   'numeric', 'Weight for must-have skill component', '1.0.0', TRUE),
  ('WEIGHT_NICE_TO_HAVE',  '0.25',   'numeric', 'Weight for nice-to-have skill component', '1.0.0', TRUE),
  ('WEIGHT_PREFERENCE',    '0.20',   'numeric', 'Weight for preference alignment component', '1.0.0', TRUE),

  -- Match thresholds
  ('MATCH_THRESHOLD',      '0.60',   'numeric', 'Minimum score for matched decision', '1.0.0', TRUE),
  ('BORDERLINE_THRESHOLD', '0.50',   'numeric', 'Minimum score for borderline decision', '1.0.0', TRUE),

  -- Transfer scoring
  ('TRANSFER_SCORE_CAP',   '0.60',   'numeric', 'Maximum transferable skill score contribution', '1.0.0', TRUE),

  -- Salary compatibility
  ('SALARY_HARD_FAIL_TOLERANCE', '0.85', 'numeric', 'Job max must be >= this fraction of candidate min', '1.0.0', TRUE),

  -- Bias correction
  ('CORRECTION_SCALING_FACTOR',  '0.50',  'numeric', 'Controls correction convergence rate', '1.0.0', TRUE),
  ('CORRECTION_CAP',             '0.15',  'numeric', 'Maximum absolute correction per match', '1.0.0', TRUE),
  ('GOVERNANCE_ALERT_THRESHOLD', '0.10',  'numeric', 'Correction magnitude that triggers governance alert', '1.0.0', TRUE),
  ('DIR_LOWER_BOUND',            '0.80',  'numeric', 'Minimum acceptable Disparate Impact Ratio', '1.0.0', TRUE),
  ('DIR_UPPER_BOUND',            '1.25',  'numeric', 'Maximum acceptable Disparate Impact Ratio', '1.0.0', TRUE),
  ('EOD_THRESHOLD',              '0.05',  'numeric', 'Maximum absolute Equal Opportunity Difference', '1.0.0', TRUE),
  ('SDS_THRESHOLD',              '0.03',  'numeric', 'Maximum absolute Score Distribution Skew', '1.0.0', TRUE),
  ('MIN_COHORT_SIZE',            '20',    'integer', 'Minimum cohort size for bias detection to activate', '1.0.0', TRUE),

  -- SLA windows (business days)
  ('SLA_INITIAL_MATCH_ACK',      '5',     'integer', 'SLA: initial match acknowledgement (business days)', '1.0.0', TRUE),
  ('SLA_APPLICATION_REVIEW',     '10',    'integer', 'SLA: application review (business days)', '1.0.0', TRUE),
  ('SLA_SCREENING_CALL',         '5',     'integer', 'SLA: screening call outcome (business days)', '1.0.0', TRUE),
  ('SLA_TECHNICAL_ASSESSMENT',   '7',     'integer', 'SLA: technical assessment outcome (business days)', '1.0.0', TRUE),
  ('SLA_INTERVIEW_STAGE',        '5',     'integer', 'SLA: interview stage outcome (business days)', '1.0.0', TRUE),
  ('SLA_OFFER_STAGE',            '10',    'integer', 'SLA: offer stage (business days)', '1.0.0', TRUE),
  ('SLA_POST_REJECTION_FEEDBACK','10',    'integer', 'SLA: post-rejection feedback (business days)', '1.0.0', TRUE),

  -- Ghosting enforcement
  ('GHOSTING_MINOR_MAX_HOURS',      '24',  'integer', 'Hours overdue threshold: minor severity', '1.0.0', TRUE),
  ('GHOSTING_SIGNIFICANT_MAX_HOURS','72',  'integer', 'Hours overdue threshold: significant severity', '1.0.0', TRUE),
  ('STRIKES_TO_PAUSE',              '3',   'integer', 'Strikes in window before job brief pause', '1.0.0', TRUE),
  ('STRIKES_TO_SUSPEND',            '5',   'integer', 'Strikes in window before account suspension', '1.0.0', TRUE),
  ('STRIKE_WINDOW_DAYS',            '90',  'integer', 'Rolling window for strike counting (days)', '1.0.0', TRUE),
  ('STRIKE_EXPIRY_DAYS',            '365', 'integer', 'Days until a strike expires', '1.0.0', TRUE),

  -- Fairness computation
  ('FAIRNESS_ROLLING_WINDOW_DAYS',         '30', 'integer', 'Rolling window for fairness metric computation', '1.0.0', TRUE),
  ('CONSECUTIVE_BREACH_BEFORE_REVIEW',     '3',  'integer', 'Consecutive breach windows before governance review', '1.0.0', TRUE),
  ('CONSECUTIVE_NO_IMPROVE_BEFORE_FOB',    '7',  'integer', 'Consecutive breach windows before FOB mandatory review', '1.0.0', TRUE),

  -- Appeals
  ('APPEAL_SUBMISSION_WINDOW_DAYS', '30', 'integer', 'Days after match outcome to submit appeal', '1.0.0', TRUE),
  ('APPEAL_TWG_REVIEW_DAYS',        '10', 'integer', 'Business days for TWG technical review', '1.0.0', TRUE),
  ('APPEAL_PC_DECISION_DAYS',       '10', 'integer', 'Business days for PC decision after TWG finding', '1.0.0', TRUE),

  -- Compliance scoring weights
  ('COMPLIANCE_WEIGHT_SLA',                '0.35', 'numeric', 'Compliance score: SLA compliance weight', '1.0.0', TRUE),
  ('COMPLIANCE_WEIGHT_GHOSTING',           '0.25', 'numeric', 'Compliance score: ghosting events weight', '1.0.0', TRUE),
  ('COMPLIANCE_WEIGHT_FAIRNESS',           '0.25', 'numeric', 'Compliance score: fairness metrics weight', '1.0.0', TRUE),
  ('COMPLIANCE_WEIGHT_REJECTIONS',         '0.15', 'numeric', 'Compliance score: structured rejections weight', '1.0.0', TRUE),
  ('COMPLIANCE_REVIEW_THRESHOLD',          '0.70', 'numeric', 'Compliance score: triggers governance review', '1.0.0', TRUE),
  ('COMPLIANCE_PAUSE_THRESHOLD',           '0.50', 'numeric', 'Compliance score: triggers automatic pause', '1.0.0', TRUE),

  -- MMIL
  ('MMIL_MIN_MODEL_POOL_SIZE',             '3',   'integer', 'Minimum models in inference pool', '1.0.0', TRUE),
  ('MMIL_STAGING_PERIOD_DAYS',             '7',   'integer', 'Shadow mode days before new model goes live', '1.0.0', TRUE),
  ('MMIL_HIGH_DISAGREEMENT_ALERT_COUNT',   '5',   'integer', 'High disagreement events before TWG alert', '1.0.0', TRUE),
  ('MMIL_HIGH_DISAGREEMENT_ALERT_WINDOW',  '7',   'integer', 'Rolling window days for disagreement count', '1.0.0', TRUE);

-- ---------------------------------------------------------------------------
-- Ontology domains reference table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS config.ontology_domains (
  domain_id     TEXT    PRIMARY KEY,
  label         TEXT    NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

TRUNCATE config.ontology_domains;

INSERT INTO config.ontology_domains (domain_id, label) VALUES
  ('fhp:domain:software-engineering', 'Software Engineering'),
  ('fhp:domain:data',                 'Data & Analytics'),
  ('fhp:domain:infrastructure',       'Infrastructure & Platform'),
  ('fhp:domain:security',             'Security'),
  ('fhp:domain:product',              'Product & Design'),
  ('fhp:domain:leadership',           'Leadership & Management'),
  ('fhp:domain:communication',        'Communication & Collaboration'),
  ('fhp:domain:finance',              'Finance & Accounting'),
  ('fhp:domain:legal',                'Legal & Compliance'),
  ('fhp:domain:operations',           'Operations & Project Management'),
  ('fhp:domain:people',               'People & HR'),
  ('fhp:domain:sales',                'Sales & Commercial'),
  ('fhp:domain:marketing',            'Marketing & Growth'),
  ('fhp:domain:research',             'Research & Analysis');
