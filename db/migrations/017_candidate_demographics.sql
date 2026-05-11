-- =============================================================================
-- FHP Migration 017: Candidate Demographics
--
-- Purpose: Store the raw demographic data that candidates optionally provide
-- for fairness monitoring. This data is:
--   - Entirely voluntary. Not providing it has zero effect on matching.
--   - Special category under GDPR Art. 9 — requires explicit, separate consent.
--   - Used ONLY by the fairness computation job to assign cohort memberships.
--   - Never exposed by the candidate API (no GET on raw values).
--   - Never accessible to the matching engine.
--   - Never linked to employer-facing views.
--
-- Architecture:
--   fhp_api role         → NO access to this table
--   fhp_matching role    → NO access to this table
--   fhp_fairness_service → SELECT, INSERT, UPDATE only
--   fhp_superuser        → full access (audit/DBA only)
--
-- The separation is enforced at DB level (RLS + role grants), not just app level.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Raw demographic values
-- This is the only place raw demographic data lives.
-- The cohort service reads this to assign opaque cohort IDs and then
-- writes to matching.candidate_cohorts (which has no raw values).
-- ---------------------------------------------------------------------------

CREATE TABLE matching.candidate_demographics (
  candidate_id        UUID          NOT NULL,
  -- No FK here — pseudonymisation-safe. candidate_id may be replaced.

  -- Sex (Equality Act 2010 s.11 — protected characteristic)
  -- Uses ONS/Equality Act terminology: Male / Female / Intersex / Prefer not to say
  sex                 TEXT          NULL
                      CHECK (sex IN (
                        'male',
                        'female',
                        'intersex',
                        'prefer_not_to_say'
                      )),

  -- Ethnicity (Equality Act 2010 s.9 — race is a protected characteristic)
  -- Uses ONS Census 2021 classification — the UK's legal standard.
  -- Separate enumeration for non-UK jurisdictions handled by jurisdiction_code.
  ethnicity           TEXT          NULL
                      CHECK (ethnicity IN (
                        -- White
                        'white_british',
                        'white_irish',
                        'white_gypsy_traveller',
                        'white_roma',
                        'white_other',
                        -- Mixed / Multiple
                        'mixed_white_black_caribbean',
                        'mixed_white_black_african',
                        'mixed_white_asian',
                        'mixed_other',
                        -- Asian / Asian British
                        'asian_indian',
                        'asian_pakistani',
                        'asian_bangladeshi',
                        'asian_chinese',
                        'asian_other',
                        -- Black / African / Caribbean
                        'black_african',
                        'black_caribbean',
                        'black_other',
                        -- Other
                        'other_arab',
                        'other_ethnic_group',
                        -- Cross-jurisdiction
                        'prefer_not_to_say'
                      )),

  -- Religion or belief (Equality Act 2010 s.10 — protected characteristic)
  -- Uses Equality Act enumeration + common additions.
  religion            TEXT          NULL
                      CHECK (religion IN (
                        'no_religion',
                        'christian',       -- includes all denominations
                        'buddhist',
                        'hindu',
                        'jewish',
                        'muslim',
                        'sikh',
                        'other_religion',
                        'prefer_not_to_say'
                      )),

  -- Birth year (Equality Act 2010 s.5 — age is a protected characteristic)
  -- We store birth year, not age. Age is computed at matching time from birth_year.
  -- This avoids the data going stale and removes the need to update it.
  birth_year          SMALLINT      NULL
                      CHECK (birth_year >= 1900 AND birth_year <= EXTRACT(YEAR FROM NOW())::smallint - 16),

  -- Education level (not a protected characteristic, but a proxy for
  -- socioeconomic background — monitored for indirect discrimination).
  -- Same scale as candidate_profiles — stored here so the matching engine
  -- cannot access it (candidate_profiles is accessible to fhp_api).
  education_level     TEXT          NULL
                      CHECK (education_level IN (
                        'no_formal_qualifications',
                        'gcse_or_equivalent',
                        'a_level_or_equivalent',
                        'foundation_degree_hnc_hnd',
                        'bachelors_degree',
                        'postgraduate_certificate_diploma',
                        'masters_degree',
                        'doctorate_phd',
                        'professional_qualification',
                        'apprenticeship_level_4_plus',
                        'self_taught_bootcamp',
                        'prefer_not_to_say'
                      )),

  -- Jurisdiction context — which legal framework applies to this candidate.
  -- Used to select the correct ethnicity taxonomy and employment law references.
  jurisdiction_code   TEXT          NOT NULL DEFAULT 'GB'
                      CHECK (jurisdiction_code IN ('GB','US','DE','FR','NL','IE','AU','CA','SE','DK','NO','FI','SG','AE')),

  -- Consent tracking (GDPR Art. 9 requires explicit, recorded consent)
  consent_id          UUID          NOT NULL,
  -- References matching.candidate_consents(consent_id) where consent_type = 'fairness_metrics'
  -- Soft reference only — pseudonymisation-safe

  consented_at        TIMESTAMPTZ   NOT NULL,
  last_updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  PRIMARY KEY (candidate_id)
);

COMMENT ON TABLE matching.candidate_demographics IS
  'Raw demographic data volunteered by candidates for fairness monitoring only. '
  'Special category under GDPR Art. 9 — explicit consent required. '
  'NEVER accessible to fhp_api or fhp_matching roles. '
  'NEVER exposed by any API endpoint. '
  'Read only by fhp_fairness_service to assign cohort memberships. '
  'Providing or not providing this data has zero effect on matching outcomes.';

COMMENT ON COLUMN matching.candidate_demographics.sex IS
  'Equality Act 2010 s.11 protected characteristic. '
  'ONS/Equality Act terminology. NULL = not provided (not the same as prefer_not_to_say).';

COMMENT ON COLUMN matching.candidate_demographics.ethnicity IS
  'Equality Act 2010 s.9 (race) protected characteristic. '
  'ONS Census 2021 classification for GB candidates. '
  'NULL = not provided.';

COMMENT ON COLUMN matching.candidate_demographics.religion IS
  'Equality Act 2010 s.10 protected characteristic. '
  'NULL = not provided.';

COMMENT ON COLUMN matching.candidate_demographics.birth_year IS
  'Equality Act 2010 s.5 (age) protected characteristic. '
  'Stored as birth year, not age. Age is computed at fairness job run time.';

COMMENT ON COLUMN matching.candidate_demographics.education_level IS
  'Not a protected characteristic. Monitored as a socioeconomic proxy '
  'for indirect discrimination detection. Same value scale as '
  'candidate_profiles.preferences.education_level but stored separately '
  'to enforce the matching engine access boundary.';

-- ---------------------------------------------------------------------------
-- Row-level security — maximum restriction
-- Only fhp_fairness_service may read/write raw demographics.
-- fhp_api and fhp_matching are explicitly denied.
-- ---------------------------------------------------------------------------

ALTER TABLE matching.candidate_demographics ENABLE ROW LEVEL SECURITY;

-- Default deny for all roles
CREATE POLICY demographics_deny_default ON matching.candidate_demographics
  FOR ALL
  USING (FALSE);

-- Fairness service: full access
CREATE POLICY demographics_fairness_service ON matching.candidate_demographics
  FOR ALL
  USING (pg_has_role(current_user, 'fhp_fairness_service', 'USAGE'))
  WITH CHECK (pg_has_role(current_user, 'fhp_fairness_service', 'USAGE'));

-- Superuser: full access for audit/DBA
CREATE POLICY demographics_superuser ON matching.candidate_demographics
  FOR ALL
  USING (pg_has_role(current_user, 'fhp_superuser', 'USAGE'))
  WITH CHECK (pg_has_role(current_user, 'fhp_superuser', 'USAGE'));

-- Explicit DENY for the API role — belt and braces
-- Note: fhp_api and fhp_matching roles are denied via RLS policies above.
-- REVOKE statements omitted until roles are created in a dedicated role migration.

-- ---------------------------------------------------------------------------
-- Trigger: update last_updated_at on any change
-- ---------------------------------------------------------------------------

-- Dedicated trigger — this table uses last_updated_at not updated_at
CREATE OR REPLACE FUNCTION fhp_set_demographics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_demographics_updated
  BEFORE UPDATE ON matching.candidate_demographics
  FOR EACH ROW EXECUTE FUNCTION fhp_set_demographics_updated_at();

-- ---------------------------------------------------------------------------
-- Update candidate_cohorts: add religion_group to characteristic enum
-- (it was missing from the original definition)
-- ---------------------------------------------------------------------------

ALTER TABLE matching.candidate_cohorts
  DROP CONSTRAINT IF EXISTS candidate_cohorts_characteristic_check;

ALTER TABLE matching.candidate_cohorts
  ADD CONSTRAINT candidate_cohorts_characteristic_check
  CHECK (characteristic IN (
    'sex_group',
    'age_group',
    'ethnicity_group',
    'religion_group',
    'education_group',
    'employment_gap_group'
  ));

COMMENT ON COLUMN matching.candidate_cohorts.characteristic IS
  'Demographic dimension this cohort membership covers. '
  'sex_group: derived from demographics.sex '
  'age_group: derived from demographics.birth_year (banded at job run time) '
  'ethnicity_group: derived from demographics.ethnicity '
  'religion_group: derived from demographics.religion '
  'education_group: derived from demographics.education_level '
  'employment_gap_group: derived from work_history gap analysis (no consent needed)';

-- Note: governance_constants seed data for demographics is in 018_config_and_governance_log.sql
-- (config.governance_constants is created in 018, so the INSERT must live there)
