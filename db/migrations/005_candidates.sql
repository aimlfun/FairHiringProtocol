-- =============================================================================
-- FHP Candidate Profiles
-- Migration: 005_candidates.sql
--
-- No PII in this schema. The matching engine reads from these tables.
-- candidate_id is the only link to identity — which the engine cannot access.
-- See specs/candidate-profile.schema.json
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Candidate profile — the matching surface
-- ---------------------------------------------------------------------------

CREATE TABLE matching.candidate_profiles (
  candidate_id        UUID          PRIMARY KEY,
  fhp_version         TEXT          NOT NULL,

  -- Skills — array of {ontology_id, proficiency, years_of_experience, evidence}
  -- Stored as JSONB; ontology_id values are validated against config.ontology_domains
  skills              JSONB         NOT NULL DEFAULT '[]'::jsonb,

  -- Work history — role descriptions only, no employer names
  work_history        JSONB         NULL,

  -- Preferences — salary, locations, work modes, employment types
  preferences         JSONB         NULL,

  -- Privacy settings
  privacy             JSONB         NOT NULL DEFAULT '{
    "searchable": true,
    "anonymised_matching": true,
    "data_retention_days": 365
  }'::jsonb,

  -- Profile state
  status              TEXT          NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'paused', 'deleted')),

  -- Matching eligibility — must have confirmed age and accepted terms
  matching_eligible   BOOLEAN       NOT NULL DEFAULT FALSE,

  -- Profile strength score (0–100, computed on profile update)
  profile_strength    SMALLINT      NULL
                      CHECK (profile_strength BETWEEN 0 AND 100),

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT candidate_profiles_skills_is_array CHECK (
    jsonb_typeof(skills) = 'array'
  ),
  CONSTRAINT candidate_profiles_min_skills CHECK (
    status != 'active' OR jsonb_array_length(skills) >= 1
  )
);

COMMENT ON TABLE matching.candidate_profiles IS
  'Candidate matching data — no PII. '
  'The matching engine reads this table. It has no access to identity.candidate_identity. '
  'candidate_id is a UUID with no relationship to any personal identifier.';

COMMENT ON COLUMN matching.candidate_profiles.skills IS
  'Array of skill objects: [{ontology_id, proficiency, years_of_experience?, evidence?}]. '
  'ontology_id must match a skill in config.ontology_skills. '
  'Validated at application layer; stored as JSONB for schema evolution flexibility.';

COMMENT ON COLUMN matching.candidate_profiles.matching_eligible IS
  'True only when: age_confirmed=true in identity.candidate_auth AND '
  'compliance_agreement_accepted=true. '
  'Set by the identity service after onboarding completion.';

-- ---------------------------------------------------------------------------
-- Candidate cohort memberships — anonymised demographic groups for fairness
-- The matching engine receives cohort_id only, never the characteristic value
-- See specs/bias-correction-spec.md §2
-- ---------------------------------------------------------------------------

CREATE TABLE matching.candidate_cohorts (
  candidate_id        UUID          NOT NULL,
  cohort_id           TEXT          NOT NULL,  -- opaque label, e.g. 'cohort:gender:A'
  characteristic      TEXT          NOT NULL
                      CHECK (characteristic IN (
                        'gender_group',
                        'age_group',
                        'ethnicity_group',
                        'disability_group',
                        'location_group',
                        'employment_gap_group'
                      )),
  -- Consent for demographic data use — required under GDPR Art. 9(2)(a)
  consented_at        TIMESTAMPTZ   NOT NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  PRIMARY KEY (candidate_id, characteristic),

  CONSTRAINT candidate_cohorts_cohort_id_format CHECK (
    cohort_id ~ '^cohort:[a-z_]+:[A-Za-z0-9]+$'
  )
);

COMMENT ON TABLE matching.candidate_cohorts IS
  'Anonymised cohort memberships for fairness monitoring. '
  'Entirely optional — candidates choose whether to provide demographic data. '
  'GDPR Art. 9(2)(a) explicit consent required (consented_at must be set). '
  'cohort_id is opaque — the matching engine never sees the raw characteristic value. '
  'Minimum cohort size of 20 enforced at query time before any output is produced.';

COMMENT ON COLUMN matching.candidate_cohorts.cohort_id IS
  'Opaque group label. E.g. ''cohort:gender:A'' not ''cohort:gender:female''. '
  'Labels are assigned by the cohort service to prevent re-identification.';
