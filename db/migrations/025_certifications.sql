-- =============================================================================
-- FHP Certifications
-- Migration: 025_certifications.sql
--
-- Adds a governed certification ontology table to config schema.
-- Adds first-class certifications column to candidate_profiles (separate from
-- preferences - certs are matching data, not preferences).
-- Adds required_certifications column to job_briefs (for Stage 3 constraint
-- satisfaction on licences and as advisory signals for certifications).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Governed certification/licence ontology
-- ---------------------------------------------------------------------------

CREATE TABLE config.certifications (
  cert_id         TEXT          PRIMARY KEY
                  CHECK (cert_id ~ '^fhp:cert:[a-z0-9][a-z0-9\-]*$'),
  label           TEXT          NOT NULL,
  issuing_body    TEXT          NOT NULL,
  cert_type       TEXT          NOT NULL
                  CHECK (cert_type IN ('licence', 'certification', 'membership')),
  has_expiry      BOOLEAN       NOT NULL DEFAULT FALSE,
  validity_years  SMALLINT      NULL,
  -- Array of {skill_id, min_proficiency} - what this cert evidences
  evidences       JSONB         NOT NULL DEFAULT '[]'::jsonb,
  active          BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE config.certifications IS
  'Governed list of licences and professional certifications. '
  'cert_type=licence: hard constraint checked in Stage 3 constraint satisfaction. '
  'cert_type=certification: evidence signal used in Stage 4 skill scoring. '
  'evidences: array of {skill_id, min_proficiency} that this cert corroborates.';

-- Seed the initial governed set
INSERT INTO config.certifications (cert_id, label, issuing_body, cert_type, has_expiry, validity_years, evidences) VALUES
-- Licences (hard constraints)
('fhp:cert:driving-licence-b',          'Driving Licence (Category B)',                        'DVLA',                                  'licence',       TRUE,  10,   '[]'),
('fhp:cert:hgv-licence-c',              'HGV / LGV Licence (Category C)',                      'DVLA',                                  'licence',       TRUE,  5,    '[]'),
('fhp:cert:cpc-driver',                 'Driver CPC (Certificate of Professional Competence)',  'DVLA / JAUPT',                          'licence',       TRUE,  5,    '[]'),
('fhp:cert:sia-badge',                  'SIA Door Supervisor Licence',                         'Security Industry Authority',           'licence',       TRUE,  3,    '[]'),
('fhp:cert:fca-approved-person',        'FCA Approved Person Authorisation',                   'Financial Conduct Authority',           'licence',       FALSE, NULL, '[]'),
('fhp:cert:solicitor-england-wales',    'Solicitor (England & Wales)',                         'Solicitors Regulation Authority',       'licence',       FALSE, NULL, '[]'),
('fhp:cert:gmc-registration',           'GMC Full Registration',                               'General Medical Council',               'licence',       FALSE, NULL, '[]'),
('fhp:cert:nmc-registration',           'NMC Registration (Nurse / Midwife)',                  'Nursing and Midwifery Council',         'licence',       TRUE,  3,    '[]'),
('fhp:cert:dbs-enhanced',               'Enhanced DBS Check',                                  'Disclosure and Barring Service',        'licence',       TRUE,  3,    '[]'),
('fhp:cert:atpl',  'ATPL ' || chr(8212) || ' Airline Transport Pilot Licence',  'Civil Aviation Authority',  'licence',  FALSE, NULL, '[]'),
-- Cloud certifications (chr(8211) = en-dash U+2013)
('fhp:cert:aws-solutions-architect-associate',      'AWS Certified Solutions Architect ' || chr(8211) || ' Associate',       'Amazon Web Services',   'certification', TRUE,  3,    '[{"skill_id":"fhp:skill:aws","min_proficiency":"practitioner"}]'),
('fhp:cert:aws-solutions-architect-professional',   'AWS Certified Solutions Architect ' || chr(8211) || ' Professional',    'Amazon Web Services',   'certification', TRUE,  3,    '[{"skill_id":"fhp:skill:aws","min_proficiency":"proficient"},{"skill_id":"fhp:skill:system-design","min_proficiency":"proficient"}]'),
('fhp:cert:aws-developer-associate',                'AWS Certified Developer ' || chr(8211) || ' Associate',                 'Amazon Web Services',   'certification', TRUE,  3,    '[{"skill_id":"fhp:skill:aws","min_proficiency":"practitioner"}]'),
('fhp:cert:aws-devops-professional',                'AWS Certified DevOps Engineer ' || chr(8211) || ' Professional',        'Amazon Web Services',   'certification', TRUE,  3,    '[{"skill_id":"fhp:skill:aws","min_proficiency":"proficient"},{"skill_id":"fhp:skill:ci-cd","min_proficiency":"proficient"}]'),
('fhp:cert:aws-ml-specialty',                       'AWS Certified Machine Learning ' || chr(8211) || ' Specialty',          'Amazon Web Services',   'certification', TRUE,  3,    '[{"skill_id":"fhp:skill:machine-learning","min_proficiency":"proficient"},{"skill_id":"fhp:skill:aws","min_proficiency":"practitioner"}]'),
('fhp:cert:gcp-associate-cloud-engineer',           'Google Associate Cloud Engineer',                      'Google Cloud',          'certification', TRUE,  2,    '[{"skill_id":"fhp:skill:gcp","min_proficiency":"practitioner"}]'),
('fhp:cert:gcp-professional-cloud-architect',       'Google Professional Cloud Architect',                  'Google Cloud',          'certification', TRUE,  2,    '[{"skill_id":"fhp:skill:gcp","min_proficiency":"proficient"},{"skill_id":"fhp:skill:system-design","min_proficiency":"proficient"}]'),
('fhp:cert:gcp-professional-data-engineer',         'Google Professional Data Engineer',                    'Google Cloud',          'certification', TRUE,  2,    '[{"skill_id":"fhp:skill:data-engineering","min_proficiency":"proficient"},{"skill_id":"fhp:skill:gcp","min_proficiency":"practitioner"}]'),
('fhp:cert:azure-developer-associate',              'Microsoft Azure Developer Associate',                  'Microsoft',             'certification', TRUE,  2,    '[{"skill_id":"fhp:skill:azure","min_proficiency":"practitioner"}]'),
('fhp:cert:azure-solutions-architect-expert',       'Microsoft Azure Solutions Architect Expert',           'Microsoft',             'certification', TRUE,  2,    '[{"skill_id":"fhp:skill:azure","min_proficiency":"proficient"},{"skill_id":"fhp:skill:system-design","min_proficiency":"proficient"}]'),
-- Kubernetes
('fhp:cert:cka',    'Certified Kubernetes Administrator (CKA)',            'Cloud Native Computing Foundation', 'certification', TRUE,  3, '[{"skill_id":"fhp:skill:kubernetes","min_proficiency":"proficient"}]'),
('fhp:cert:ckad',   'Certified Kubernetes Application Developer (CKAD)',   'Cloud Native Computing Foundation', 'certification', TRUE,  3, '[{"skill_id":"fhp:skill:kubernetes","min_proficiency":"practitioner"},{"skill_id":"fhp:skill:docker","min_proficiency":"practitioner"}]'),
('fhp:cert:cks',    'Certified Kubernetes Security Specialist (CKS)',      'Cloud Native Computing Foundation', 'certification', TRUE,  2, '[{"skill_id":"fhp:skill:kubernetes","min_proficiency":"expert"},{"skill_id":"fhp:skill:application-security","min_proficiency":"proficient"}]'),
-- Security
('fhp:cert:cissp',                  'CISSP',                                              '(ISC)' || chr(178),    'certification', TRUE,  3,    '[{"skill_id":"fhp:skill:application-security","min_proficiency":"expert"}]'),
('fhp:cert:comptia-security-plus',  'CompTIA Security+',                                  'CompTIA',              'certification', TRUE,  3,    '[{"skill_id":"fhp:skill:application-security","min_proficiency":"practitioner"}]'),
('fhp:cert:comptia-network-plus',   'CompTIA Network+',                                   'CompTIA',              'certification', TRUE,  3,    '[{"skill_id":"fhp:skill:networking","min_proficiency":"practitioner"}]'),
('fhp:cert:oscp',                   'OSCP (Offensive Security Certified Professional)',    'Offensive Security',   'certification', FALSE, NULL, '[{"skill_id":"fhp:skill:application-security","min_proficiency":"expert"}]'),
-- Project management & agile
('fhp:cert:pmp',                    'PMP (Project Management Professional)',        'Project Management Institute', 'certification', TRUE,  3, '[{"skill_id":"fhp:skill:project-management","min_proficiency":"proficient"}]'),
('fhp:cert:prince2-practitioner',   'PRINCE2 Practitioner',                        'PeopleCert / Axelos',          'certification', TRUE,  5, '[{"skill_id":"fhp:skill:project-management","min_proficiency":"proficient"}]'),
('fhp:cert:psm-i',                  'Professional Scrum Master I (PSM I)',         'Scrum.org',                    'certification', FALSE, NULL,'[{"skill_id":"fhp:skill:agile","min_proficiency":"practitioner"}]'),
('fhp:cert:csm',                    'Certified Scrum Master (CSM)',                'Scrum Alliance',               'certification', TRUE,  2, '[{"skill_id":"fhp:skill:agile","min_proficiency":"practitioner"}]'),
-- Data
('fhp:cert:databricks-associate-developer', 'Databricks Certified Associate Developer for Apache Spark', 'Databricks', 'certification', TRUE, 2, '[{"skill_id":"fhp:skill:data-engineering","min_proficiency":"practitioner"}]')
;

-- ---------------------------------------------------------------------------
-- Add certifications column to candidate_profiles
-- ---------------------------------------------------------------------------

ALTER TABLE matching.candidate_profiles
  ADD COLUMN certifications JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE matching.candidate_profiles
  ADD CONSTRAINT candidate_profiles_certifications_is_array
  CHECK (jsonb_typeof(certifications) = 'array');

COMMENT ON COLUMN matching.candidate_profiles.certifications IS
  'Array of held certifications/licences: [{cert_id, label, issuing_body, cert_type, issued?, expiry?, credential_url?}]. '
  'cert_id must match config.certifications. Validated at application layer. '
  'Stored separately from preferences because certs are matching data, not preferences.';

-- ---------------------------------------------------------------------------
-- Add required_certifications column to job_briefs
-- ---------------------------------------------------------------------------

ALTER TABLE matching.job_briefs
  ADD COLUMN required_certifications JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE matching.job_briefs
  ADD CONSTRAINT job_briefs_required_certifications_is_array
  CHECK (jsonb_typeof(required_certifications) = 'array');

COMMENT ON COLUMN matching.job_briefs.required_certifications IS
  'Array of required certs/licences: [{cert_id, label, requirement}] where requirement is must_have or preferred. '
  'Licences (cert_type=licence) checked as hard constraint in Stage 3. '
  'Certifications (cert_type=certification) used as evidence signal in Stage 4.';
