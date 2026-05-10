-- =============================================================================
-- FHP Company Registry
-- Migration: 004_companies.sql
-- =============================================================================

CREATE TABLE matching.companies (
  company_id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  fhp_version             TEXT          NOT NULL,

  -- Legal identity
  legal_name              TEXT          NOT NULL,
  jurisdiction            TEXT          NOT NULL,  -- ISO 3166-1 alpha-2 country code
  registration_number     TEXT          NULL,

  -- Compliance contact (not publicly visible)
  compliance_contact_name TEXT          NOT NULL,
  compliance_contact_email TEXT         NOT NULL,

  -- Account status
  status                  TEXT          NOT NULL DEFAULT 'pending_verification'
                          CHECK (status IN (
                            'pending_verification',
                            'active',
                            'paused',       -- automatic: strike threshold reached
                            'suspended',    -- governance: formal suspension
                            'banned'        -- permanent: governance decision
                          )),
  status_changed_at       TIMESTAMPTZ   NULL,
  status_reason           TEXT          NULL,

  -- Compliance agreement
  compliance_agreement_accepted     BOOLEAN       NOT NULL DEFAULT FALSE,
  compliance_agreement_accepted_at  TIMESTAMPTZ   NULL,
  compliance_agreement_version      TEXT          NULL,

  -- Compliance score (0.0–1.0, computed nightly)
  -- See specs/company-compliance.md §7
  compliance_score        NUMERIC(4,3)  NULL
                          CHECK (compliance_score BETWEEN 0 AND 1),
  compliance_score_computed_at TIMESTAMPTZ NULL,

  -- Strike record
  strike_count_90d        SMALLINT      NOT NULL DEFAULT 0,
  strike_last_recorded_at TIMESTAMPTZ   NULL,

  -- Hiring volume declaration (determines audit cadence)
  declared_monthly_roles  SMALLINT      NOT NULL DEFAULT 1
                          CHECK (declared_monthly_roles > 0),

  -- Ban registry — stores beneficial owner identifiers for permanent bans
  ban_registry_entries    JSONB         NULL,

  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT companies_legal_name_jurisdiction_unique
    UNIQUE (legal_name, jurisdiction),
  CONSTRAINT companies_jurisdiction_format CHECK (
    jurisdiction ~ '^[A-Z]{2}$'
  )
);

COMMENT ON TABLE matching.companies IS
  'Registered companies using FHP. '
  'Companies must accept the Compliance Agreement before posting job briefs. '
  'Strike count and compliance score are computed automatically.';

COMMENT ON COLUMN matching.companies.compliance_score IS
  'Weighted composite: SLA compliance (35%) + ghosting (25%) + '
  'fairness metrics (25%) + structured rejections (15%). '
  'Below 0.70 triggers governance review. Below 0.50 triggers automatic pause. '
  'See specs/company-compliance.md §7.';

COMMENT ON COLUMN matching.companies.status IS
  'paused: automatic on 3 strikes in 90 days — job briefs paused. '
  'suspended: governance action — all operations suspended. '
  'banned: permanent — legal entity and beneficial owners barred.';
