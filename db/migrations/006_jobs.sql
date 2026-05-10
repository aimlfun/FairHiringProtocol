-- =============================================================================
-- FHP Job Briefs
-- Migration: 006_jobs.sql
-- See specs/job-brief.schema.json
-- =============================================================================

CREATE TABLE matching.job_briefs (
  job_id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID          NOT NULL
                                      REFERENCES matching.companies(company_id)
                                      ON DELETE RESTRICT,
  fhp_version           TEXT          NOT NULL,

  -- Core fields
  title                 TEXT          NOT NULL,
  role_summary          TEXT          NOT NULL,
  status                TEXT          NOT NULL DEFAULT 'draft'
                        CHECK (status IN (
                          'draft',
                          'active',
                          'paused',       -- compliance action or company request
                          'filled',
                          'cancelled',
                          'expired'
                        )),

  -- Skills required — array of {ontology_id, requirement_level, minimum_proficiency, context?}
  skills_required       JSONB         NOT NULL,

  -- Salary — both min and max required
  salary_currency       CHAR(3)       NOT NULL,
  salary_minimum        NUMERIC(12,2) NOT NULL CHECK (salary_minimum > 0),
  salary_maximum        NUMERIC(12,2) NOT NULL CHECK (salary_maximum > 0),
  salary_period         TEXT          NOT NULL DEFAULT 'annual'
                        CHECK (salary_period IN ('annual', 'daily', 'hourly')),
  salary_includes_bonus BOOLEAN       NOT NULL DEFAULT FALSE,
  salary_notes          TEXT          NULL,

  CONSTRAINT job_salary_range_valid CHECK (salary_maximum >= salary_minimum),
  -- Flag suspiciously wide ranges (>2x minimum) for manual review
  -- Not a hard constraint — wider ranges are allowed but trigger review
  salary_range_wide     BOOLEAN       GENERATED ALWAYS AS
                        (salary_maximum > salary_minimum * 2) STORED,

  -- Work arrangement
  work_mode             TEXT          NOT NULL
                        CHECK (work_mode IN ('remote', 'hybrid', 'on_site')),
  hybrid_days_on_site   SMALLINT      NULL
                        CHECK (hybrid_days_on_site BETWEEN 1 AND 4),
  hybrid_flexible_days  BOOLEAN       NULL,

  -- Location
  location_country      CHAR(2)       NOT NULL,  -- ISO 3166-1 alpha-2
  location_region       TEXT          NULL,
  location_city         TEXT          NULL,
  remote_regions_permitted JSONB      NULL,       -- array of country/region codes

  -- Employment type
  employment_type       TEXT          NOT NULL
                        CHECK (employment_type IN (
                          'permanent', 'contract', 'part_time',
                          'internship', 'apprenticeship'
                        )),
  contract_duration_months  NUMERIC(5,1)  NULL,
  contract_inside_ir35      BOOLEAN       NULL,
  contract_renewal_possible BOOLEAN       NULL,

  -- Team context (optional but encouraged)
  team_size             SMALLINT      NULL CHECK (team_size >= 1),
  reports_to_role       TEXT          NULL,
  direct_reports        SMALLINT      NULL CHECK (direct_reports >= 0),
  tech_stack_summary    TEXT          NULL,

  -- Hiring process
  process_stages        JSONB         NULL,   -- array of {name, description, duration_estimate_minutes, is_async}
  target_start_date     DATE          NULL,
  response_sla_days     SMALLINT      NOT NULL DEFAULT 10
                        CHECK (response_sla_days BETWEEN 1 AND 10),

  -- Compliance attestations (all must be true to post)
  -- See specs/company-compliance.md §3.3
  attest_no_degree_requirement    BOOLEAN NOT NULL DEFAULT FALSE,
  attest_no_institution_preference BOOLEAN NOT NULL DEFAULT FALSE,
  attest_no_graduation_year_filter BOOLEAN NOT NULL DEFAULT FALSE,
  attest_no_unpaid_work           BOOLEAN NOT NULL DEFAULT FALSE,

  CONSTRAINT job_attestations_required CHECK (
    status = 'draft'
    OR (
      attest_no_degree_requirement     = TRUE AND
      attest_no_institution_preference = TRUE AND
      attest_no_graduation_year_filter = TRUE AND
      attest_no_unpaid_work            = TRUE
    )
  ),

  -- Expiry (mandatory — prevents zombie listings)
  expires_at            TIMESTAMPTZ   NOT NULL,

  -- Validation flags
  validated_at          TIMESTAMPTZ   NULL,
  validation_warnings   JSONB         NULL,  -- array of warning codes from automated validation

  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  activated_at          TIMESTAMPTZ   NULL,
  filled_at             TIMESTAMPTZ   NULL,

  CONSTRAINT job_expires_after_creation CHECK (expires_at > created_at),
  CONSTRAINT job_hybrid_details CHECK (
    work_mode != 'hybrid' OR hybrid_days_on_site IS NOT NULL
  ),
  CONSTRAINT job_contract_details CHECK (
    employment_type != 'contract' OR contract_duration_months IS NOT NULL
  ),
  CONSTRAINT job_location_country_format CHECK (
    location_country ~ '^[A-Z]{2}$'
  ),
  CONSTRAINT job_salary_currency_format CHECK (
    salary_currency ~ '^[A-Z]{3}$'
  )
);

COMMENT ON TABLE matching.job_briefs IS
  'Job opportunities posted by companies. '
  'Salary ranges and compliance attestations are required before activation. '
  'All active briefs have an expiry date — no zombie listings.';

COMMENT ON COLUMN matching.job_briefs.response_sla_days IS
  'Company-committed response SLA. '
  'May be shorter than protocol default but never longer. '
  'Default is 10 business days (protocol maximum for most stages). '
  'Governs ghosting event creation by the SLA monitor.';

COMMENT ON COLUMN matching.job_briefs.salary_range_wide IS
  'Auto-computed flag. True when max > 2x min. '
  'Triggers manual review before activation — wide ranges may be deceptive. '
  'See specs/company-compliance.md §3.2';
