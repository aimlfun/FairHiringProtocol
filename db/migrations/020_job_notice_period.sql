-- Migration 020: Add max_notice_period_days to job_briefs
-- Stores notice period as days (0 = immediately, 21 = 3 weeks, 60 = 2 months, etc.)

ALTER TABLE matching.job_briefs
  ADD COLUMN max_notice_period_days INTEGER NULL
    CONSTRAINT max_notice_period_days_non_negative CHECK (max_notice_period_days >= 0);

COMMENT ON COLUMN matching.job_briefs.max_notice_period_days IS
  'Maximum acceptable candidate notice period in days. 0 = immediate start required. NULL = not specified.';
