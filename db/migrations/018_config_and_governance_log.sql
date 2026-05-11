-- =============================================================================
-- FHP Migration 018: Config Tables + Governance Log
--
-- Resolves three outstanding DB gaps:
--   1. config.skills                       — FHP skill ontology (98 skills)
--   2. config.skill_transfer_relationships — 72 transfer relationships
--   3. config.rejection_codes              — structured rejection taxonomy
--   4. audit.governance_log               — flexible cross-entity governance events
--
-- After this migration, all 62 API endpoints have their backing tables.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. config.skills
--    The canonical FHP skill ontology. Referenced by:
--      - GET /v1/ontology/skills (search)
--      - GET /v1/ontology/domains
--      - Stage 2 semantic expansion in the matching engine
--      - Stage 3 constraint validation (ontology_id must resolve)
--      - cohort-service.ts (transfer weight lookups)
-- ---------------------------------------------------------------------------

CREATE TABLE config.skills (
  skill_id      TEXT          PRIMARY KEY,   -- e.g. fhp:skill:python
  label         TEXT          NOT NULL,
  domain        TEXT          NOT NULL,      -- e.g. fhp:domain:software-engineering
  domain_label  TEXT          NOT NULL,      -- e.g. Software Engineering
  synonyms      TEXT[]        NOT NULL DEFAULT '{}',
  tags          TEXT[]        NOT NULL DEFAULT '{}',
  active        BOOLEAN       NOT NULL DEFAULT TRUE,
  added_version TEXT          NOT NULL DEFAULT '1.0.0',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE config.skills IS
  'FHP Skill Ontology v1.0 — 98 skills across 14 domains. '
  'Seeded from reference-impl/ontology/skills.json. '
  'Changes require a TWG proposal (FHP-P) and PC vote.';

CREATE INDEX idx_skills_domain  ON config.skills (domain);
CREATE INDEX idx_skills_label   ON config.skills USING gin(to_tsvector('english', label));
CREATE INDEX idx_skills_active  ON config.skills (active) WHERE active = TRUE;

-- Seed: 98 skills from ontology/skills.json
-- Grouped by domain for readability

INSERT INTO config.skills (skill_id, label, domain, domain_label, synonyms, tags) VALUES

-- ── Software Engineering ────────────────────────────────────────────────────
('fhp:skill:python',           'Python',                'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:python3','fhp:skill:python2'],              ARRAY['programming-language','scripting','backend','data']),
('fhp:skill:javascript',       'JavaScript',            'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:js','fhp:skill:ecmascript'],               ARRAY['programming-language','frontend','backend','scripting']),
('fhp:skill:typescript',       'TypeScript',            'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:ts'],                                      ARRAY['programming-language','frontend','backend','typed']),
('fhp:skill:java',             'Java',                  'fhp:domain:software-engineering', 'Software Engineering', ARRAY[]::TEXT[],                                                    ARRAY['programming-language','backend','enterprise','jvm']),
('fhp:skill:kotlin',           'Kotlin',                'fhp:domain:software-engineering', 'Software Engineering', ARRAY[]::TEXT[],                                                    ARRAY['programming-language','backend','android','jvm']),
('fhp:skill:go',               'Go',                    'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:golang'],                                  ARRAY['programming-language','backend','systems']),
('fhp:skill:rust',             'Rust',                  'fhp:domain:software-engineering', 'Software Engineering', ARRAY[]::TEXT[],                                                    ARRAY['programming-language','systems','performance']),
('fhp:skill:csharp',           'C#',                    'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:dotnet'],                                  ARRAY['programming-language','backend','enterprise','microsoft']),
('fhp:skill:cpp',              'C++',                   'fhp:domain:software-engineering', 'Software Engineering', ARRAY[]::TEXT[],                                                    ARRAY['programming-language','systems','performance']),
('fhp:skill:react',            'React',                 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:reactjs'],                                 ARRAY['frontend','framework','ui','spa']),
('fhp:skill:vue',              'Vue.js',                'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:vuejs'],                                   ARRAY['frontend','framework','ui','spa']),
('fhp:skill:angular',          'Angular',               'fhp:domain:software-engineering', 'Software Engineering', ARRAY[]::TEXT[],                                                    ARRAY['frontend','framework','ui','spa','typescript']),
('fhp:skill:node',             'Node.js',               'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:nodejs'],                                  ARRAY['backend','runtime','javascript','api']),
('fhp:skill:graphql',          'GraphQL',               'fhp:domain:software-engineering', 'Software Engineering', ARRAY[]::TEXT[],                                                    ARRAY['api','query-language','backend']),
('fhp:skill:rest-api',         'REST API Design',       'fhp:domain:software-engineering', 'Software Engineering', ARRAY[]::TEXT[],                                                    ARRAY['api','backend','http','design']),
('fhp:skill:microservices',    'Microservices',         'fhp:domain:software-engineering', 'Software Engineering', ARRAY[]::TEXT[],                                                    ARRAY['architecture','backend','distributed']),
('fhp:skill:tdd',              'Test-Driven Development','fhp:domain:software-engineering','Software Engineering', ARRAY['fhp:skill:tdd-bdd'],                                 ARRAY['testing','methodology','quality']),
('fhp:skill:git',              'Git',                   'fhp:domain:software-engineering', 'Software Engineering', ARRAY[]::TEXT[],                                                    ARRAY['version-control','collaboration','tooling']),
('fhp:skill:sql',              'SQL',                   'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:relational-sql'],                          ARRAY['database','query','backend']),
('fhp:skill:system-design',    'System Design',         'fhp:domain:software-engineering', 'Software Engineering', ARRAY[]::TEXT[],                                                    ARRAY['architecture','senior','backend','distributed']),

-- ── Data & Analytics ───────────────────────────────────────────────────────
('fhp:skill:sql-analytics',    'Analytical SQL',        'fhp:domain:data',                 'Data & Analytics',     ARRAY['fhp:skill:sql-analysis'],                            ARRAY['analytics','data','querying','dw']),
('fhp:skill:python-data',      'Python for Data',       'fhp:domain:data',                 'Data & Analytics',     ARRAY[]::TEXT[],                                                    ARRAY['data','pandas','numpy','analysis']),
('fhp:skill:spark',            'Apache Spark',          'fhp:domain:data',                 'Data & Analytics',     ARRAY['fhp:skill:pyspark'],                                 ARRAY['big-data','distributed','batch','streaming']),
('fhp:skill:dbt',              'dbt',                   'fhp:domain:data',                 'Data & Analytics',     ARRAY['fhp:skill:data-build-tool'],                         ARRAY['transformation','analytics-engineering','sql']),
('fhp:skill:data-modelling',   'Data Modelling',        'fhp:domain:data',                 'Data & Analytics',     ARRAY['fhp:skill:data-modeling'],                           ARRAY['warehouse','schema','design','analytics']),
('fhp:skill:data-engineering', 'Data Engineering',      'fhp:domain:data',                 'Data & Analytics',     ARRAY[]::TEXT[],                                                    ARRAY['pipelines','etl','elt','infrastructure','data']),
('fhp:skill:ml',               'Machine Learning',      'fhp:domain:data',                 'Data & Analytics',     ARRAY['fhp:skill:machine-learning'],                        ARRAY['ai','model','prediction','statistics']),
('fhp:skill:deep-learning',    'Deep Learning',         'fhp:domain:data',                 'Data & Analytics',     ARRAY['fhp:skill:neural-networks'],                         ARRAY['ai','neural-network','gpu','model']),
('fhp:skill:llm-engineering',  'LLM Engineering',       'fhp:domain:data',                 'Data & Analytics',     ARRAY['fhp:skill:llm'],                                     ARRAY['ai','language-models','prompting','rag']),
('fhp:skill:statistics',       'Statistics',            'fhp:domain:data',                 'Data & Analytics',     ARRAY[]::TEXT[],                                                    ARRAY['analysis','data','probability','inference']),
('fhp:skill:tableau',          'Tableau',               'fhp:domain:data',                 'Data & Analytics',     ARRAY[]::TEXT[],                                                    ARRAY['visualisation','bi','dashboards']),
('fhp:skill:looker',           'Looker',                'fhp:domain:data',                 'Data & Analytics',     ARRAY[]::TEXT[],                                                    ARRAY['bi','dashboards','analytics']),
('fhp:skill:airflow',          'Apache Airflow',        'fhp:domain:data',                 'Data & Analytics',     ARRAY[]::TEXT[],                                                    ARRAY['orchestration','pipelines','scheduling','data']),
('fhp:skill:kafka',            'Apache Kafka',          'fhp:domain:data',                 'Data & Analytics',     ARRAY[]::TEXT[],                                                    ARRAY['streaming','messaging','event-driven','distributed']),
('fhp:skill:data-warehouse',   'Data Warehouse Design', 'fhp:domain:data',                 'Data & Analytics',     ARRAY[]::TEXT[],                                                    ARRAY['warehouse','architecture','analytics','dw']),

-- ── Infrastructure & Platform ──────────────────────────────────────────────
('fhp:skill:aws',              'AWS',                   'fhp:domain:infrastructure',       'Infrastructure',       ARRAY['fhp:skill:amazon-web-services'],                     ARRAY['cloud','platform','devops']),
('fhp:skill:gcp',              'Google Cloud',          'fhp:domain:infrastructure',       'Infrastructure',       ARRAY['fhp:skill:gcp-platform'],                            ARRAY['cloud','platform','devops']),
('fhp:skill:azure',            'Microsoft Azure',       'fhp:domain:infrastructure',       'Infrastructure',       ARRAY[]::TEXT[],                                                    ARRAY['cloud','platform','devops','microsoft']),
('fhp:skill:kubernetes',       'Kubernetes',            'fhp:domain:infrastructure',       'Infrastructure',       ARRAY['fhp:skill:k8s'],                                     ARRAY['orchestration','containers','devops','platform']),
('fhp:skill:docker',           'Docker',                'fhp:domain:infrastructure',       'Infrastructure',       ARRAY[]::TEXT[],                                                    ARRAY['containers','devops','packaging']),
('fhp:skill:terraform',        'Terraform',             'fhp:domain:infrastructure',       'Infrastructure',       ARRAY[]::TEXT[],                                                    ARRAY['iac','devops','provisioning','cloud']),
('fhp:skill:ci-cd',            'CI/CD',                 'fhp:domain:infrastructure',       'Infrastructure',       ARRAY['fhp:skill:continuous-integration'],                  ARRAY['devops','automation','pipelines','deployment']),
('fhp:skill:linux',            'Linux',                 'fhp:domain:infrastructure',       'Infrastructure',       ARRAY['fhp:skill:unix'],                                    ARRAY['operating-system','systems','devops']),
('fhp:skill:networking',       'Networking',            'fhp:domain:infrastructure',       'Infrastructure',       ARRAY[]::TEXT[],                                                    ARRAY['tcp-ip','dns','vpn','infrastructure']),
('fhp:skill:observability',    'Observability',         'fhp:domain:infrastructure',       'Infrastructure',       ARRAY['fhp:skill:monitoring'],                              ARRAY['logging','metrics','tracing','ops']),
('fhp:skill:sre',              'Site Reliability Engineering', 'fhp:domain:infrastructure','Infrastructure',       ARRAY['fhp:skill:sre-practices'],                           ARRAY['reliability','devops','ops','sla']),

-- ── Security ───────────────────────────────────────────────────────────────
('fhp:skill:appsec',           'Application Security',  'fhp:domain:security',             'Security',             ARRAY['fhp:skill:application-security'],                    ARRAY['security','devsecops','owasp']),
('fhp:skill:cloud-security',   'Cloud Security',        'fhp:domain:security',             'Security',             ARRAY[]::TEXT[],                                                    ARRAY['security','cloud','iam','compliance']),
('fhp:skill:pen-testing',      'Penetration Testing',   'fhp:domain:security',             'Security',             ARRAY['fhp:skill:pentesting'],                              ARRAY['security','offensive','vulnerability']),
('fhp:skill:soc',              'Security Operations',   'fhp:domain:security',             'Security',             ARRAY['fhp:skill:soc-analyst'],                             ARRAY['security','monitoring','incident-response']),

-- ── Product & Design ───────────────────────────────────────────────────────
('fhp:skill:product-management','Product Management',   'fhp:domain:product',              'Product & Design',     ARRAY['fhp:skill:product-mgmt'],                            ARRAY['product','strategy','roadmap','stakeholders']),
('fhp:skill:ux-design',        'UX Design',             'fhp:domain:product',              'Product & Design',     ARRAY['fhp:skill:user-experience'],                         ARRAY['design','user-research','usability','product']),
('fhp:skill:ui-design',        'UI Design',             'fhp:domain:product',              'Product & Design',     ARRAY['fhp:skill:user-interface'],                          ARRAY['design','visual','product']),
('fhp:skill:figma',            'Figma',                 'fhp:domain:product',              'Product & Design',     ARRAY[]::TEXT[],                                                    ARRAY['design','prototyping','ui','collaboration']),
('fhp:skill:product-analytics','Product Analytics',     'fhp:domain:product',              'Product & Design',     ARRAY[]::TEXT[],                                                    ARRAY['data','metrics','product','experimentation']),
('fhp:skill:user-research',    'User Research',         'fhp:domain:product',              'Product & Design',     ARRAY[]::TEXT[],                                                    ARRAY['ux','qualitative','interviews','usability']),
('fhp:skill:a-b-testing',      'A/B Testing',           'fhp:domain:product',              'Product & Design',     ARRAY['fhp:skill:experimentation'],                         ARRAY['experimentation','data','product','statistics']),

-- ── Leadership & Management ────────────────────────────────────────────────
('fhp:skill:engineering-leadership','Engineering Leadership','fhp:domain:leadership',       'Leadership & Management',ARRAY[]::TEXT[],                                                  ARRAY['management','technical','teams','senior']),
('fhp:skill:people-management','People Management',     'fhp:domain:leadership',           'Leadership & Management',ARRAY[]::TEXT[],                                                  ARRAY['management','teams','performance','hr']),
('fhp:skill:strategic-planning','Strategic Planning',   'fhp:domain:leadership',           'Leadership & Management',ARRAY[]::TEXT[],                                                  ARRAY['strategy','planning','leadership','senior']),
('fhp:skill:change-management','Change Management',     'fhp:domain:leadership',           'Leadership & Management',ARRAY[]::TEXT[],                                                  ARRAY['transformation','leadership','organisational']),
('fhp:skill:budget-management','Budget Management',     'fhp:domain:leadership',           'Leadership & Management',ARRAY[]::TEXT[],                                                  ARRAY['finance','planning','leadership']),

-- ── Communication & Collaboration ─────────────────────────────────────────
('fhp:skill:technical-writing','Technical Writing',     'fhp:domain:communication',        'Communication',        ARRAY[]::TEXT[],                                                    ARRAY['documentation','writing','communication']),
('fhp:skill:stakeholder-mgmt', 'Stakeholder Management','fhp:domain:communication',        'Communication',        ARRAY[]::TEXT[],                                                    ARRAY['communication','leadership','product','project']),
('fhp:skill:public-speaking',  'Public Speaking',       'fhp:domain:communication',        'Communication',        ARRAY[]::TEXT[],                                                    ARRAY['presentation','communication','leadership']),
('fhp:skill:mentoring',        'Mentoring & Coaching',  'fhp:domain:communication',        'Communication',        ARRAY[]::TEXT[],                                                    ARRAY['people','leadership','development','senior']),

-- ── Operations & Project Management ───────────────────────────────────────
('fhp:skill:agile',            'Agile / Scrum',         'fhp:domain:operations',           'Operations',           ARRAY['fhp:skill:scrum'],                                   ARRAY['methodology','project','delivery','team']),
('fhp:skill:project-management','Project Management',   'fhp:domain:operations',           'Operations',           ARRAY[]::TEXT[],                                                    ARRAY['delivery','planning','pm','waterfall','agile']),
('fhp:skill:programme-management','Programme Management','fhp:domain:operations',          'Operations',           ARRAY[]::TEXT[],                                                    ARRAY['delivery','senior','portfolio','planning']),
('fhp:skill:risk-management',  'Risk Management',       'fhp:domain:operations',           'Operations',           ARRAY[]::TEXT[],                                                    ARRAY['risk','governance','compliance','analysis']),
('fhp:skill:process-improvement','Process Improvement', 'fhp:domain:operations',           'Operations',           ARRAY['fhp:skill:lean','fhp:skill:six-sigma'],               ARRAY['operations','lean','efficiency','analysis']),

-- ── Finance & Accounting ───────────────────────────────────────────────────
('fhp:skill:financial-analysis','Financial Analysis',   'fhp:domain:finance',              'Finance & Accounting',  ARRAY[]::TEXT[],                                                   ARRAY['finance','modelling','accounting','analysis']),
('fhp:skill:financial-modelling','Financial Modelling', 'fhp:domain:finance',              'Finance & Accounting',  ARRAY[]::TEXT[],                                                   ARRAY['finance','excel','valuation','forecasting']),
('fhp:skill:accounting',       'Accounting',            'fhp:domain:finance',              'Finance & Accounting',  ARRAY[]::TEXT[],                                                   ARRAY['finance','bookkeeping','tax','reporting']),
('fhp:skill:audit',            'Audit',                 'fhp:domain:finance',              'Finance & Accounting',  ARRAY[]::TEXT[],                                                   ARRAY['finance','compliance','assurance','risk']),
('fhp:skill:tax',              'Tax',                   'fhp:domain:finance',              'Finance & Accounting',  ARRAY[]::TEXT[],                                                   ARRAY['finance','compliance','reporting']),

-- ── People & HR ───────────────────────────────────────────────────────────
('fhp:skill:talent-acquisition','Talent Acquisition',   'fhp:domain:people',               'People & HR',           ARRAY['fhp:skill:recruitment'],                            ARRAY['hr','hiring','sourcing','people']),
('fhp:skill:hr-generalist',    'HR Generalist',         'fhp:domain:people',               'People & HR',           ARRAY[]::TEXT[],                                                   ARRAY['hr','employment-law','people','operations']),
('fhp:skill:employment-law',   'Employment Law',        'fhp:domain:people',               'People & HR',           ARRAY[]::TEXT[],                                                   ARRAY['legal','hr','compliance','contracts']),
('fhp:skill:learning-development','Learning & Development','fhp:domain:people',            'People & HR',           ARRAY['fhp:skill:l-and-d'],                                ARRAY['hr','training','people','development']),

-- ── Sales & Commercial ─────────────────────────────────────────────────────
('fhp:skill:b2b-sales',        'B2B Sales',             'fhp:domain:sales',                'Sales & Commercial',    ARRAY[]::TEXT[],                                                   ARRAY['sales','commercial','revenue','enterprise']),
('fhp:skill:account-management','Account Management',   'fhp:domain:sales',                'Sales & Commercial',    ARRAY[]::TEXT[],                                                   ARRAY['sales','customer','retention','commercial']),
('fhp:skill:sales-strategy',   'Sales Strategy',        'fhp:domain:sales',                'Sales & Commercial',    ARRAY[]::TEXT[],                                                   ARRAY['sales','leadership','commercial','planning']),

-- ── Marketing & Growth ─────────────────────────────────────────────────────
('fhp:skill:growth-marketing', 'Growth Marketing',      'fhp:domain:marketing',            'Marketing & Growth',    ARRAY[]::TEXT[],                                                   ARRAY['marketing','growth','acquisition','funnel']),
('fhp:skill:content-marketing','Content Marketing',     'fhp:domain:marketing',            'Marketing & Growth',    ARRAY[]::TEXT[],                                                   ARRAY['marketing','content','seo','writing']),
('fhp:skill:seo',              'SEO',                   'fhp:domain:marketing',            'Marketing & Growth',    ARRAY['fhp:skill:search-engine-optimisation'],             ARRAY['marketing','search','organic','growth']),
('fhp:skill:paid-media',       'Paid Media',            'fhp:domain:marketing',            'Marketing & Growth',    ARRAY['fhp:skill:ppc'],                                    ARRAY['marketing','advertising','paid','acquisition']),
('fhp:skill:brand-marketing',  'Brand Marketing',       'fhp:domain:marketing',            'Marketing & Growth',    ARRAY[]::TEXT[],                                                   ARRAY['marketing','brand','communications','strategy']),

-- ── Research & Analysis ───────────────────────────────────────────────────
('fhp:skill:qualitative-research','Qualitative Research','fhp:domain:research',            'Research & Analysis',   ARRAY[]::TEXT[],                                                   ARRAY['research','interviews','analysis','ux']),
('fhp:skill:quantitative-research','Quantitative Research','fhp:domain:research',          'Research & Analysis',   ARRAY[]::TEXT[],                                                   ARRAY['research','statistics','surveys','analysis']),
('fhp:skill:data-analysis',    'Data Analysis',         'fhp:domain:research',             'Research & Analysis',   ARRAY[]::TEXT[],                                                   ARRAY['analysis','data','excel','insights']),
('fhp:skill:competitive-analysis','Competitive Analysis','fhp:domain:research',            'Research & Analysis',   ARRAY[]::TEXT[],                                                   ARRAY['strategy','research','market','product']),
('fhp:skill:market-research',  'Market Research',       'fhp:domain:research',             'Research & Analysis',   ARRAY[]::TEXT[],                                                   ARRAY['research','marketing','analysis','insights']);

-- ---------------------------------------------------------------------------
-- 2. config.skill_transfer_relationships
--    Directional weighted relationships between skills.
--    Used by: Stage 5 (transfer compensation), cohort-service.ts, /v1/ontology/skills
--    Cap applied in pipeline: weight * score <= 0.60 (TRANSFER_SCORE_CAP)
-- ---------------------------------------------------------------------------

CREATE TABLE config.skill_transfer_relationships (
  relationship_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_skill_id  TEXT        NOT NULL REFERENCES config.skills(skill_id),
  target_skill_id  TEXT        NOT NULL REFERENCES config.skills(skill_id),
  weight           NUMERIC(3,2) NOT NULL CHECK (weight > 0 AND weight <= 1.0),
  rationale        TEXT        NOT NULL,
  active           BOOLEAN     NOT NULL DEFAULT TRUE,
  added_version    TEXT        NOT NULL DEFAULT '1.0.0',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT skill_transfer_unique UNIQUE (source_skill_id, target_skill_id),
  CONSTRAINT no_self_transfer CHECK (source_skill_id != target_skill_id)
);

COMMENT ON TABLE config.skill_transfer_relationships IS
  'Directional weighted transfer relationships between FHP skills. '
  'A → B with weight W means: a candidate with skill A at proficiency P '
  'receives credit toward B of P * W, capped at TRANSFER_SCORE_CAP (0.60). '
  'Relationships are directional — A→B does not imply B→A. '
  'Changes require a TWG review.';

CREATE INDEX idx_transfer_source ON config.skill_transfer_relationships (source_skill_id) WHERE active = TRUE;
CREATE INDEX idx_transfer_target ON config.skill_transfer_relationships (target_skill_id) WHERE active = TRUE;

-- Seed: 72 transfer relationships from ontology/skills.json
INSERT INTO config.skill_transfer_relationships (source_skill_id, target_skill_id, weight, rationale) VALUES

-- Language transfers
('fhp:skill:typescript',      'fhp:skill:javascript',       0.90, 'TypeScript is a strict superset of JavaScript. TS proficiency implies strong JS knowledge.'),
('fhp:skill:javascript',      'fhp:skill:typescript',       0.60, 'JS knowledge transfers to TS but without type system experience the transfer is partial.'),
('fhp:skill:kotlin',          'fhp:skill:java',             0.85, 'Kotlin is fully interoperable with Java. Strong Kotlin implies solid Java foundations.'),
('fhp:skill:java',            'fhp:skill:kotlin',           0.70, 'Java experience transfers well to Kotlin; syntax differs but JVM model is shared.'),
('fhp:skill:python',          'fhp:skill:python-data',      0.80, 'General Python proficiency transfers strongly to data-focused Python work.'),
('fhp:skill:csharp',          'fhp:skill:java',             0.65, 'C# and Java share OOP paradigms, type systems, and enterprise patterns.'),
('fhp:skill:java',            'fhp:skill:csharp',           0.65, 'Symmetric: shared enterprise OOP patterns transfer bidirectionally.'),

-- Framework transfers
('fhp:skill:react',           'fhp:skill:vue',              0.65, 'React and Vue share component-based architecture; React experience eases Vue adoption.'),
('fhp:skill:vue',             'fhp:skill:react',            0.65, 'Symmetric: component model transfers bidirectionally between React and Vue.'),
('fhp:skill:react',           'fhp:skill:angular',          0.50, 'React SPA concepts transfer to Angular but TypeScript-first and DI model differ significantly.'),
('fhp:skill:node',            'fhp:skill:javascript',       0.80, 'Node.js runtime requires strong JavaScript; proficiency implies it.'),
('fhp:skill:javascript',      'fhp:skill:node',             0.75, 'JS proficiency transfers strongly to Node.js server-side work.'),

-- Infrastructure transfers
('fhp:skill:docker',          'fhp:skill:kubernetes',       0.70, 'Docker expertise is foundational for Kubernetes. Container concepts transfer directly.'),
('fhp:skill:kubernetes',      'fhp:skill:docker',           0.60, 'K8s practitioners understand containers deeply; Docker specifics fill in quickly.'),
('fhp:skill:aws',             'fhp:skill:gcp',              0.60, 'Cloud provider concepts transfer across AWS and GCP; service names differ.'),
('fhp:skill:aws',             'fhp:skill:azure',            0.60, 'Cloud concepts transfer; IAM, compute, storage patterns are comparable.'),
('fhp:skill:gcp',             'fhp:skill:aws',              0.60, 'Symmetric cloud provider transfer.'),
('fhp:skill:azure',           'fhp:skill:aws',              0.60, 'Symmetric cloud provider transfer.'),
('fhp:skill:terraform',       'fhp:skill:ci-cd',            0.50, 'IaC practitioners understand automation pipelines; CI/CD specifics transfer partially.'),
('fhp:skill:kubernetes',      'fhp:skill:sre',              0.65, 'K8s operations strongly overlaps SRE practices — reliability, scaling, incident response.'),
('fhp:skill:linux',           'fhp:skill:networking',       0.55, 'Linux administration involves substantial networking work; concepts transfer.'),
('fhp:skill:observability',   'fhp:skill:sre',              0.70, 'Observability is a core SRE discipline; strong transfer.'),

-- Data transfers
('fhp:skill:spark',           'fhp:skill:data-engineering', 0.80, 'Spark expertise implies broad data engineering capability.'),
('fhp:skill:sql-analytics',   'fhp:skill:data-modelling',   0.70, 'Advanced analytical SQL implies understanding of data models.'),
('fhp:skill:dbt',             'fhp:skill:sql-analytics',    0.85, 'dbt is SQL-first; dbt proficiency implies strong analytical SQL.'),
('fhp:skill:dbt',             'fhp:skill:data-modelling',   0.75, 'dbt practitioners design and maintain data models as core work.'),
('fhp:skill:airflow',         'fhp:skill:data-engineering', 0.70, 'Airflow orchestration is a core data engineering skill.'),
('fhp:skill:kafka',           'fhp:skill:data-engineering', 0.65, 'Streaming data pipeline experience transfers to data engineering broadly.'),
('fhp:skill:python-data',     'fhp:skill:ml',               0.55, 'Python data work provides a foundation for ML; framework knowledge still needed.'),
('fhp:skill:statistics',      'fhp:skill:ml',               0.60, 'Strong statistics background transfers to ML theory and practice.'),
('fhp:skill:ml',              'fhp:skill:deep-learning',    0.55, 'Broad ML experience provides foundations for deep learning specialisation.'),
('fhp:skill:data-warehouse',  'fhp:skill:data-modelling',   0.80, 'Data warehouse design is a superset of data modelling skills.'),
('fhp:skill:tableau',         'fhp:skill:looker',           0.65, 'BI tool skills transfer across Tableau and Looker; data concepts are shared.'),
('fhp:skill:looker',          'fhp:skill:tableau',          0.65, 'Symmetric BI tool transfer.'),
('fhp:skill:sql',             'fhp:skill:sql-analytics',    0.75, 'General SQL proficiency transfers to analytical SQL; window functions are additive.'),
('fhp:skill:sql-analytics',   'fhp:skill:sql',              0.90, 'Analytical SQL is a superset; practitioners know general SQL well.'),

-- Security transfers
('fhp:skill:appsec',          'fhp:skill:cloud-security',   0.55, 'Application security concepts partially transfer to cloud security posture.'),
('fhp:skill:cloud-security',  'fhp:skill:appsec',           0.50, 'Cloud security awareness transfers to application security thinking.'),
('fhp:skill:pen-testing',     'fhp:skill:appsec',           0.70, 'Penetration testing is an application security specialism; core concepts transfer.'),

-- Product & Design
('fhp:skill:ux-design',       'fhp:skill:ui-design',        0.60, 'UX design includes UI considerations; visual design skills are adjacent.'),
('fhp:skill:ui-design',       'fhp:skill:ux-design',        0.55, 'UI design involves user experience thinking, but UX research is additive.'),
('fhp:skill:figma',           'fhp:skill:ui-design',        0.70, 'Figma proficiency implies UI design capability.'),
('fhp:skill:figma',           'fhp:skill:ux-design',        0.50, 'Figma is a UX tool; proficiency implies some UX awareness.'),
('fhp:skill:user-research',   'fhp:skill:ux-design',        0.65, 'User research is foundational to UX design practice.'),
('fhp:skill:product-analytics','fhp:skill:a-b-testing',     0.70, 'Product analytics practitioners run and interpret experiments.'),
('fhp:skill:a-b-testing',     'fhp:skill:statistics',       0.60, 'Experimentation requires applied statistics; transfer is strong.'),
('fhp:skill:product-management','fhp:skill:stakeholder-mgmt',0.75,'Product management is fundamentally about stakeholder alignment.'),
('fhp:skill:product-management','fhp:skill:strategic-planning',0.60,'Senior PM work involves strategic planning and roadmap ownership.'),

-- Leadership transfers
('fhp:skill:engineering-leadership','fhp:skill:people-management',0.75,'Engineering leadership inherently includes people management.'),
('fhp:skill:engineering-leadership','fhp:skill:system-design',0.65,'Senior engineering leaders maintain deep system design capability.'),
('fhp:skill:people-management','fhp:skill:mentoring',        0.80, 'People management involves regular coaching and mentoring.'),
('fhp:skill:strategic-planning','fhp:skill:change-management',0.55,'Strategic planning involves managing the change that follows strategy.'),
('fhp:skill:programme-management','fhp:skill:project-management',0.85,'Programme management is built on project management foundations.'),
('fhp:skill:project-management','fhp:skill:agile',           0.65, 'Project managers frequently operate in agile contexts; concepts transfer.'),
('fhp:skill:agile',            'fhp:skill:project-management',0.55,'Agile practitioners understand project delivery concepts broadly.'),
('fhp:skill:risk-management',  'fhp:skill:change-management',0.55,'Risk management and change management share governance and planning patterns.'),

-- Communication transfers
('fhp:skill:technical-writing','fhp:skill:stakeholder-mgmt', 0.50,'Technical writing involves communicating to diverse audiences.'),
('fhp:skill:public-speaking',  'fhp:skill:stakeholder-mgmt', 0.60,'Public speaking proficiency transfers to stakeholder presentation skills.'),
('fhp:skill:mentoring',        'fhp:skill:people-management',0.65,'Experienced mentors develop people management instincts.'),

-- Finance transfers
('fhp:skill:financial-modelling','fhp:skill:financial-analysis',0.85,'Financial modelling requires and develops analytical capability.'),
('fhp:skill:audit',            'fhp:skill:risk-management',   0.65,'Audit work develops strong risk identification and management skills.'),
('fhp:skill:accounting',       'fhp:skill:financial-analysis',0.60,'Accounting foundations support financial analysis work.'),

-- Marketing & Research transfers
('fhp:skill:growth-marketing', 'fhp:skill:a-b-testing',      0.70,'Growth marketing is experiment-driven; A/B testing is core.'),
('fhp:skill:seo',              'fhp:skill:content-marketing', 0.60,'SEO and content marketing are deeply intertwined.'),
('fhp:skill:content-marketing','fhp:skill:seo',               0.55,'Content marketing practitioners understand SEO fundamentals.'),
('fhp:skill:qualitative-research','fhp:skill:user-research',  0.80,'Qualitative research methods directly apply to user research.'),
('fhp:skill:quantitative-research','fhp:skill:statistics',    0.75,'Quantitative research requires and develops statistical competence.'),
('fhp:skill:market-research',  'fhp:skill:competitive-analysis',0.65,'Market research includes competitive landscape analysis.'),
('fhp:skill:data-analysis',    'fhp:skill:sql-analytics',     0.60,'Data analysis often requires SQL; analytical SQL transfers back.');

-- ---------------------------------------------------------------------------
-- 3. config.rejection_codes
--    Structured rejection taxonomy. Referenced by:
--      - GET /v1/reference/rejection-codes
--      - POST /v1/companies/me/interactions/:id/reject (validates code)
--      - Company dashboard Rejections tab composer
-- ---------------------------------------------------------------------------

CREATE TABLE config.rejection_codes (
  code                  TEXT        PRIMARY KEY,  -- e.g. SR-01
  category              TEXT        NOT NULL
                        CHECK (category IN ('skill','assessment','process','logistics')),
  label                 TEXT        NOT NULL,
  description           TEXT        NOT NULL,
  requires_stage_notes  BOOLEAN     NOT NULL DEFAULT TRUE,
  active                BOOLEAN     NOT NULL DEFAULT TRUE,
  added_version         TEXT        NOT NULL DEFAULT '1.0.0'
);

COMMENT ON TABLE config.rejection_codes IS
  'FHP structured rejection code taxonomy. '
  'Every rejection sent to a candidate must use one of these codes. '
  'Codes are designed to be specific enough to be useful without '
  'being so specific that they enable discrimination claims. '
  'Stage notes are required for most codes.';

INSERT INTO config.rejection_codes (code, category, label, description, requires_stage_notes) VALUES
-- Skill-based rejections
('SR-01', 'skill',       'Required skill below proficiency',          'A required skill was assessed at a lower proficiency level than the job brief specifies. Specific skill and gap must be noted.',              TRUE),
('SR-02', 'skill',       'Required skill absent',                     'A must-have skill from the job brief was absent from the candidate profile entirely. The specific skill must be noted.',                    TRUE),
('SR-03', 'skill',       'Technical assessment below standard',       'A technical assessment did not meet the required standard. Assessment-specific feedback is required — "did not pass" is insufficient.',    TRUE),
('SR-04', 'skill',       'Portfolio or work sample below standard',   'A portfolio or work sample submission did not demonstrate the required capability. Specific feedback on what was lacking is required.',     TRUE),
-- Assessment-based rejections
('AS-01', 'assessment',  'Interview performance below standard',      'Interview responses did not meet the required standard for this role. Stage-specific notes on the dimension(s) that fell short are required.',TRUE),
('AS-02', 'assessment',  'Reference check — material disclosure',     'A reference check disclosed information material to the hiring decision. The candidate must be told the nature of what was disclosed.',    TRUE),
('AS-03', 'assessment',  'Culture and values misalignment',           'The candidate''s demonstrated values or working style is not compatible with the team. Specific observable evidence is required — not opinion.',TRUE),
-- Process rejections
('PR-01', 'process',     'Candidate withdrew',                        'The candidate withdrew from the process. No stage notes required.',                                                                         FALSE),
('PR-02', 'process',     'Role filled',                               'The role was filled by another candidate before this stage completed. No further feedback is required but the candidate must be notified.',  FALSE),
('PR-03', 'process',     'Role cancelled',                            'The role has been cancelled. No stage notes required.',                                                                                      FALSE),
('PR-04', 'process',     'Duplicate application',                     'The candidate applied to this role via multiple channels. This is a deduplication — the other application remains active.',                 FALSE),
-- Logistics rejections
('PL-01', 'logistics',   'Salary expectation misalignment',           'The candidate''s salary expectation cannot be met within the posted range. The direction of misalignment must be disclosed.',               TRUE),
('PL-02', 'logistics',   'Work mode not compatible',                  'The candidate''s work mode preference is not compatible with the role requirements. Specific incompatibility must be noted.',               TRUE),
('PL-03', 'logistics',   'Location or right to work not compatible',  'The candidate does not have the right to work in the required location or cannot meet location requirements.',                              TRUE),
('PL-04', 'logistics',   'Notice period not compatible',              'The candidate''s notice period cannot be accommodated given the role start date. The required start date must be disclosed.',               TRUE);

-- ---------------------------------------------------------------------------
-- 4. audit.governance_log
--    Flexible cross-entity governance event log. Referenced by:
--      - appeals-extended.ts  (appeal_withdrawn)
--      - companies-extended.ts (structured_rejection_sent, ghosting events)
--      - governance-extended.ts (pc_vote_recorded, proposal records)
--
--    Distinct from audit.audit_log which has a constrained event_type enum
--    and company/job/appeal FK columns. governance_log is entity-agnostic
--    and uses entity_type + entity_id (text) for flexible cross-entity events.
-- ---------------------------------------------------------------------------

CREATE TABLE audit.governance_log (
  log_id        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    TEXT          NOT NULL,
  entity_type   TEXT          NOT NULL,   -- 'appeal','interaction','vote','proposal','ghosting' etc.
  entity_id     TEXT          NOT NULL,   -- UUID as text — entity_type defines what it refers to
  actor_type    TEXT          NOT NULL,   -- 'candidate','company','governance','system'
  actor_id      TEXT          NOT NULL,   -- UUID or name of acting entity
  summary       TEXT          NOT NULL,   -- human-readable description
  metadata      JSONB         NULL,       -- optional structured context
  occurred_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit.governance_log IS
  'Flexible cross-entity governance event log. '
  'All entries are immutable — no UPDATE or DELETE permitted. '
  'Distinct from audit.audit_log (which uses constrained enums and FK columns). '
  'This table stores governance actions that span entity types: '
  'appeals, rejections, votes, proposals, ghosting resolutions.';

CREATE INDEX idx_govlog_entity     ON audit.governance_log (entity_type, entity_id);
CREATE INDEX idx_govlog_actor      ON audit.governance_log (actor_type, actor_id);
CREATE INDEX idx_govlog_event_type ON audit.governance_log (event_type);
CREATE INDEX idx_govlog_occurred   ON audit.governance_log (occurred_at DESC);

-- Immutability trigger
CREATE OR REPLACE FUNCTION prevent_govlog_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Protocol violation: governance_log entries are immutable. '
    'log_id=% may not be modified or deleted.', OLD.log_id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_govlog_immutability
  BEFORE UPDATE OR DELETE ON audit.governance_log
  FOR EACH ROW EXECUTE FUNCTION prevent_govlog_modification();

-- ---------------------------------------------------------------------------
-- Governance constants for demographic data sufficiency
-- (Moved here from 017 — config.governance_constants is defined in this file)
-- ---------------------------------------------------------------------------

INSERT INTO config.governance_constants (key, value, value_type, protocol_version, description)
VALUES
  ('DEMOGRAPHICS_MIN_DISCLOSURE_RATE', '0.20', 'numeric', '1.0.0',
   'Minimum fraction of candidates who must have provided demographic data for '
   'fairness metrics to be computed for that dimension. Below this threshold the '
   'dimension is flagged DATA_INSUFFICIENT and excluded from breach detection.'),
  ('DEMOGRAPHICS_COMPLIANCE_WEIGHT', '0.05', 'numeric', '1.0.0',
   'Weight given to demographic disclosure rate in compliance score computation. '
   'Low disclosure makes fairness metrics unreliable for that company.')
ON CONFLICT (key) DO NOTHING;

-- Clear and reload from canonical skills.json
DELETE FROM config.skill_transfer_relationships;
DELETE FROM config.skills;

INSERT INTO config.skills (skill_id, label, domain, domain_label, synonyms, tags) VALUES
('fhp:skill:python', 'Python', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:python3', 'fhp:skill:python2']::TEXT[], ARRAY['programming-language', 'scripting', 'backend', 'data']::TEXT[]),
('fhp:skill:python3', 'Python 3', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:python']::TEXT[], ARRAY['programming-language']::TEXT[]),
('fhp:skill:javascript', 'JavaScript', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:js', 'fhp:skill:es6', 'fhp:skill:esnext']::TEXT[], ARRAY['programming-language', 'frontend', 'backend', 'scripting']::TEXT[]),
('fhp:skill:typescript', 'TypeScript', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:ts']::TEXT[], ARRAY['programming-language', 'frontend', 'backend']::TEXT[]),
('fhp:skill:java', 'Java', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY[]::TEXT[], ARRAY['programming-language', 'backend', 'enterprise']::TEXT[]),
('fhp:skill:kotlin', 'Kotlin', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY[]::TEXT[], ARRAY['programming-language', 'backend', 'android']::TEXT[]),
('fhp:skill:go', 'Go', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:golang']::TEXT[], ARRAY['programming-language', 'backend', 'systems']::TEXT[]),
('fhp:skill:rust', 'Rust', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY[]::TEXT[], ARRAY['programming-language', 'systems', 'performance']::TEXT[]),
('fhp:skill:csharp', 'C#', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:dotnet-csharp']::TEXT[], ARRAY['programming-language', 'backend', 'enterprise']::TEXT[]),
('fhp:skill:cpp', 'C++', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:cplusplus']::TEXT[], ARRAY['programming-language', 'systems', 'performance']::TEXT[]),
('fhp:skill:ruby', 'Ruby', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY[]::TEXT[], ARRAY['programming-language', 'backend', 'scripting']::TEXT[]),
('fhp:skill:php', 'PHP', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY[]::TEXT[], ARRAY['programming-language', 'backend', 'web']::TEXT[]),
('fhp:skill:swift', 'Swift', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY[]::TEXT[], ARRAY['programming-language', 'ios', 'macos']::TEXT[]),
('fhp:skill:react', 'React', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:reactjs', 'fhp:skill:react-js']::TEXT[], ARRAY['framework', 'frontend', 'ui']::TEXT[]),
('fhp:skill:vue', 'Vue.js', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:vuejs']::TEXT[], ARRAY['framework', 'frontend', 'ui']::TEXT[]),
('fhp:skill:angular', 'Angular', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:angularjs']::TEXT[], ARRAY['framework', 'frontend', 'ui']::TEXT[]),
('fhp:skill:nodejs', 'Node.js', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:node']::TEXT[], ARRAY['runtime', 'backend', 'javascript']::TEXT[]),
('fhp:skill:django', 'Django', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY[]::TEXT[], ARRAY['framework', 'backend', 'python', 'web']::TEXT[]),
('fhp:skill:fastapi', 'FastAPI', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY[]::TEXT[], ARRAY['framework', 'backend', 'python', 'api']::TEXT[]),
('fhp:skill:rails', 'Ruby on Rails', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:ruby-on-rails']::TEXT[], ARRAY['framework', 'backend', 'ruby', 'web']::TEXT[]),
('fhp:skill:spring', 'Spring / Spring Boot', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:spring-boot']::TEXT[], ARRAY['framework', 'backend', 'java']::TEXT[]),
('fhp:skill:rest-api-design', 'REST API Design', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:restful-api', 'fhp:skill:rest']::TEXT[], ARRAY['api', 'backend', 'architecture']::TEXT[]),
('fhp:skill:graphql', 'GraphQL', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY[]::TEXT[], ARRAY['api', 'backend', 'query-language']::TEXT[]),
('fhp:skill:sql', 'SQL', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:structured-query-language']::TEXT[], ARRAY['database', 'querying', 'data']::TEXT[]),
('fhp:skill:git', 'Git', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:version-control-git']::TEXT[], ARRAY['version-control', 'tooling', 'collaboration']::TEXT[]),
('fhp:skill:tdd', 'Test-Driven Development', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:test-driven-development']::TEXT[], ARRAY['testing', 'methodology', 'quality']::TEXT[]),
('fhp:skill:software-testing', 'Software Testing', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:qa', 'fhp:skill:quality-assurance']::TEXT[], ARRAY['testing', 'quality']::TEXT[]),
('fhp:skill:system-design', 'System Design', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:distributed-systems-design']::TEXT[], ARRAY['architecture', 'backend', 'senior']::TEXT[]),
('fhp:skill:microservices', 'Microservices Architecture', 'fhp:domain:software-engineering', 'Software Engineering', ARRAY['fhp:skill:microservice-architecture']::TEXT[], ARRAY['architecture', 'backend', 'distributed']::TEXT[]),
('fhp:skill:data-analysis', 'Data Analysis', 'fhp:domain:data', 'Data & Analytics', ARRAY['fhp:skill:data-analytics']::TEXT[], ARRAY['data', 'analysis', 'insight']::TEXT[]),
('fhp:skill:data-engineering', 'Data Engineering', 'fhp:domain:data', 'Data & Analytics', ARRAY[]::TEXT[], ARRAY['data', 'pipelines', 'etl', 'backend']::TEXT[]),
('fhp:skill:machine-learning', 'Machine Learning', 'fhp:domain:data', 'Data & Analytics', ARRAY['fhp:skill:ml']::TEXT[], ARRAY['data', 'ai', 'modelling']::TEXT[]),
('fhp:skill:deep-learning', 'Deep Learning', 'fhp:domain:data', 'Data & Analytics', ARRAY[]::TEXT[], ARRAY['data', 'ai', 'neural-networks']::TEXT[]),
('fhp:skill:llm-engineering', 'LLM Engineering', 'fhp:domain:data', 'Data & Analytics', ARRAY['fhp:skill:large-language-models', 'fhp:skill:generative-ai-engineering']::TEXT[], ARRAY['data', 'ai', 'llm', 'prompt-engineering']::TEXT[]),
('fhp:skill:statistics', 'Statistics', 'fhp:domain:data', 'Data & Analytics', ARRAY['fhp:skill:statistical-analysis']::TEXT[], ARRAY['data', 'mathematics', 'research']::TEXT[]),
('fhp:skill:data-visualisation', 'Data Visualisation', 'fhp:domain:data', 'Data & Analytics', ARRAY['fhp:skill:data-visualization', 'fhp:skill:dataviz']::TEXT[], ARRAY['data', 'presentation', 'insight']::TEXT[]),
('fhp:skill:etl', 'ETL / ELT Pipeline Design', 'fhp:domain:data', 'Data & Analytics', ARRAY['fhp:skill:elt', 'fhp:skill:data-pipelines']::TEXT[], ARRAY['data', 'engineering', 'pipelines']::TEXT[]),
('fhp:skill:spark', 'Apache Spark', 'fhp:domain:data', 'Data & Analytics', ARRAY['fhp:skill:apache-spark', 'fhp:skill:pyspark']::TEXT[], ARRAY['data', 'big-data', 'distributed']::TEXT[]),
('fhp:skill:dbt', 'dbt', 'fhp:domain:data', 'Data & Analytics', ARRAY['fhp:skill:data-build-tool']::TEXT[], ARRAY['data', 'transformation', 'sql']::TEXT[]),
('fhp:skill:pandas', 'pandas', 'fhp:domain:data', 'Data & Analytics', ARRAY[]::TEXT[], ARRAY['data', 'python', 'analysis']::TEXT[]),
('fhp:skill:sql-analytics', 'Analytical SQL', 'fhp:domain:data', 'Data & Analytics', ARRAY['fhp:skill:advanced-sql', 'fhp:skill:window-functions']::TEXT[], ARRAY['data', 'sql', 'querying', 'analysis']::TEXT[]),
('fhp:skill:bi-tools', 'Business Intelligence Tools', 'fhp:domain:data', 'Data & Analytics', ARRAY['fhp:skill:tableau', 'fhp:skill:looker', 'fhp:skill:power-bi']::TEXT[], ARRAY['data', 'visualisation', 'reporting']::TEXT[]),
('fhp:skill:docker', 'Docker', 'fhp:domain:infrastructure', 'Infrastructure & Platform', ARRAY['fhp:skill:containerisation-docker']::TEXT[], ARRAY['containers', 'devops', 'tooling']::TEXT[]),
('fhp:skill:kubernetes', 'Kubernetes', 'fhp:domain:infrastructure', 'Infrastructure & Platform', ARRAY['fhp:skill:k8s']::TEXT[], ARRAY['containers', 'orchestration', 'devops', 'platform']::TEXT[]),
('fhp:skill:terraform', 'Terraform', 'fhp:domain:infrastructure', 'Infrastructure & Platform', ARRAY['fhp:skill:terraform-iac']::TEXT[], ARRAY['iac', 'infrastructure', 'devops']::TEXT[]),
('fhp:skill:aws', 'Amazon Web Services', 'fhp:domain:infrastructure', 'Infrastructure & Platform', ARRAY['fhp:skill:amazon-web-services']::TEXT[], ARRAY['cloud', 'platform']::TEXT[]),
('fhp:skill:gcp', 'Google Cloud Platform', 'fhp:domain:infrastructure', 'Infrastructure & Platform', ARRAY['fhp:skill:google-cloud']::TEXT[], ARRAY['cloud', 'platform']::TEXT[]),
('fhp:skill:azure', 'Microsoft Azure', 'fhp:domain:infrastructure', 'Infrastructure & Platform', ARRAY[]::TEXT[], ARRAY['cloud', 'platform']::TEXT[]),
('fhp:skill:ci-cd', 'CI/CD', 'fhp:domain:infrastructure', 'Infrastructure & Platform', ARRAY['fhp:skill:continuous-integration', 'fhp:skill:continuous-delivery', 'fhp:skill:continuous-deployment']::TEXT[], ARRAY['devops', 'automation', 'pipeline']::TEXT[]),
('fhp:skill:linux-administration', 'Linux Administration', 'fhp:domain:infrastructure', 'Infrastructure & Platform', ARRAY['fhp:skill:linux', 'fhp:skill:unix-administration']::TEXT[], ARRAY['systems', 'operations', 'platform']::TEXT[]),
('fhp:skill:observability', 'Observability & Monitoring', 'fhp:domain:infrastructure', 'Infrastructure & Platform', ARRAY['fhp:skill:monitoring', 'fhp:skill:logging-tracing']::TEXT[], ARRAY['devops', 'reliability', 'platform']::TEXT[]),
('fhp:skill:site-reliability', 'Site Reliability Engineering', 'fhp:domain:infrastructure', 'Infrastructure & Platform', ARRAY['fhp:skill:sre']::TEXT[], ARRAY['reliability', 'devops', 'operations']::TEXT[]),
('fhp:skill:networking', 'Computer Networking', 'fhp:domain:infrastructure', 'Infrastructure & Platform', ARRAY['fhp:skill:network-engineering']::TEXT[], ARRAY['infrastructure', 'networking', 'systems']::TEXT[]),
('fhp:skill:application-security', 'Application Security', 'fhp:domain:security', 'Security', ARRAY['fhp:skill:appsec', 'fhp:skill:secure-coding']::TEXT[], ARRAY['security', 'software-engineering']::TEXT[]),
('fhp:skill:penetration-testing', 'Penetration Testing', 'fhp:domain:security', 'Security', ARRAY['fhp:skill:pen-testing', 'fhp:skill:ethical-hacking']::TEXT[], ARRAY['security', 'offensive']::TEXT[]),
('fhp:skill:cloud-security', 'Cloud Security', 'fhp:domain:security', 'Security', ARRAY[]::TEXT[], ARRAY['security', 'cloud']::TEXT[]),
('fhp:skill:cryptography', 'Cryptography', 'fhp:domain:security', 'Security', ARRAY[]::TEXT[], ARRAY['security', 'mathematics']::TEXT[]),
('fhp:skill:security-operations', 'Security Operations', 'fhp:domain:security', 'Security', ARRAY['fhp:skill:secops', 'fhp:skill:soc']::TEXT[], ARRAY['security', 'operations', 'incident-response']::TEXT[]),
('fhp:skill:product-management', 'Product Management', 'fhp:domain:product', 'Product & Design', ARRAY[]::TEXT[], ARRAY['product', 'leadership', 'strategy']::TEXT[]),
('fhp:skill:ux-design', 'UX Design', 'fhp:domain:product', 'Product & Design', ARRAY['fhp:skill:user-experience-design', 'fhp:skill:ux']::TEXT[], ARRAY['design', 'product', 'research']::TEXT[]),
('fhp:skill:ui-design', 'UI Design', 'fhp:domain:product', 'Product & Design', ARRAY['fhp:skill:user-interface-design', 'fhp:skill:visual-design']::TEXT[], ARRAY['design', 'product', 'frontend']::TEXT[]),
('fhp:skill:user-research', 'User Research', 'fhp:domain:product', 'Product & Design', ARRAY['fhp:skill:ux-research']::TEXT[], ARRAY['research', 'product', 'design']::TEXT[]),
('fhp:skill:product-strategy', 'Product Strategy', 'fhp:domain:product', 'Product & Design', ARRAY[]::TEXT[], ARRAY['product', 'strategy', 'leadership']::TEXT[]),
('fhp:skill:product-discovery', 'Product Discovery', 'fhp:domain:product', 'Product & Design', ARRAY[]::TEXT[], ARRAY['product', 'research', 'validation']::TEXT[]),
('fhp:skill:a-b-testing', 'A/B Testing & Experimentation', 'fhp:domain:product', 'Product & Design', ARRAY['fhp:skill:experimentation', 'fhp:skill:split-testing']::TEXT[], ARRAY['product', 'data', 'growth']::TEXT[]),
('fhp:skill:engineering-management', 'Engineering Management', 'fhp:domain:leadership', 'Leadership & Management', ARRAY['fhp:skill:technical-leadership']::TEXT[], ARRAY['leadership', 'management', 'engineering']::TEXT[]),
('fhp:skill:people-management', 'People Management', 'fhp:domain:leadership', 'Leadership & Management', ARRAY['fhp:skill:line-management', 'fhp:skill:team-management']::TEXT[], ARRAY['leadership', 'management', 'hr']::TEXT[]),
('fhp:skill:strategic-planning', 'Strategic Planning', 'fhp:domain:leadership', 'Leadership & Management', ARRAY['fhp:skill:business-strategy']::TEXT[], ARRAY['leadership', 'strategy', 'senior']::TEXT[]),
('fhp:skill:stakeholder-management', 'Stakeholder Management', 'fhp:domain:leadership', 'Leadership & Management', ARRAY[]::TEXT[], ARRAY['leadership', 'communication', 'management']::TEXT[]),
('fhp:skill:mentoring', 'Mentoring & Coaching', 'fhp:domain:leadership', 'Leadership & Management', ARRAY['fhp:skill:coaching']::TEXT[], ARRAY['leadership', 'people', 'development']::TEXT[]),
('fhp:skill:hiring-and-interviewing', 'Hiring & Interviewing', 'fhp:domain:leadership', 'Leadership & Management', ARRAY['fhp:skill:recruiting']::TEXT[], ARRAY['leadership', 'hr', 'management']::TEXT[]),
('fhp:skill:technical-writing', 'Technical Writing', 'fhp:domain:communication', 'Communication & Collaboration', ARRAY['fhp:skill:documentation']::TEXT[], ARRAY['communication', 'writing', 'documentation']::TEXT[]),
('fhp:skill:public-speaking', 'Public Speaking & Presentation', 'fhp:domain:communication', 'Communication & Collaboration', ARRAY['fhp:skill:presentation-skills']::TEXT[], ARRAY['communication', 'leadership']::TEXT[]),
('fhp:skill:cross-functional-collaboration', 'Cross-functional Collaboration', 'fhp:domain:communication', 'Communication & Collaboration', ARRAY[]::TEXT[], ARRAY['communication', 'collaboration', 'teamwork']::TEXT[]),
('fhp:skill:remote-collaboration', 'Remote & Async Collaboration', 'fhp:domain:communication', 'Communication & Collaboration', ARRAY[]::TEXT[], ARRAY['communication', 'remote', 'async']::TEXT[]),
('fhp:skill:project-management', 'Project Management', 'fhp:domain:operations', 'Operations & Project Management', ARRAY[]::TEXT[], ARRAY['operations', 'delivery', 'planning']::TEXT[]),
('fhp:skill:agile', 'Agile Methodologies', 'fhp:domain:operations', 'Operations & Project Management', ARRAY['fhp:skill:scrum', 'fhp:skill:kanban']::TEXT[], ARRAY['operations', 'methodology', 'delivery']::TEXT[]),
('fhp:skill:programme-management', 'Programme Management', 'fhp:domain:operations', 'Operations & Project Management', ARRAY['fhp:skill:program-management']::TEXT[], ARRAY['operations', 'leadership', 'delivery']::TEXT[]),
('fhp:skill:risk-management', 'Risk Management', 'fhp:domain:operations', 'Operations & Project Management', ARRAY[]::TEXT[], ARRAY['operations', 'governance', 'analysis']::TEXT[]),
('fhp:skill:process-improvement', 'Process Improvement', 'fhp:domain:operations', 'Operations & Project Management', ARRAY['fhp:skill:operational-excellence', 'fhp:skill:lean']::TEXT[], ARRAY['operations', 'efficiency', 'analysis']::TEXT[]),
('fhp:skill:financial-analysis', 'Financial Analysis', 'fhp:domain:finance', 'Finance & Accounting', ARRAY[]::TEXT[], ARRAY['finance', 'analysis', 'reporting']::TEXT[]),
('fhp:skill:financial-modelling', 'Financial Modelling', 'fhp:domain:finance', 'Finance & Accounting', ARRAY[]::TEXT[], ARRAY['finance', 'modelling', 'excel']::TEXT[]),
('fhp:skill:accounting', 'Accounting', 'fhp:domain:finance', 'Finance & Accounting', ARRAY['fhp:skill:bookkeeping']::TEXT[], ARRAY['finance', 'compliance', 'reporting']::TEXT[]),
('fhp:skill:fp-and-a', 'FP&A', 'fhp:domain:finance', 'Finance & Accounting', ARRAY['fhp:skill:financial-planning-and-analysis']::TEXT[], ARRAY['finance', 'planning', 'strategy']::TEXT[]),
('fhp:skill:talent-acquisition', 'Talent Acquisition', 'fhp:domain:people', 'People & HR', ARRAY['fhp:skill:recruitment', 'fhp:skill:sourcing']::TEXT[], ARRAY['hr', 'recruiting', 'people']::TEXT[]),
('fhp:skill:employment-law', 'Employment Law', 'fhp:domain:people', 'People & HR', ARRAY['fhp:skill:labour-law']::TEXT[], ARRAY['legal', 'hr', 'compliance']::TEXT[]),
('fhp:skill:compensation-and-benefits', 'Compensation & Benefits', 'fhp:domain:people', 'People & HR', ARRAY['fhp:skill:total-rewards']::TEXT[], ARRAY['hr', 'finance', 'people']::TEXT[]),
('fhp:skill:organisational-development', 'Organisational Development', 'fhp:domain:people', 'People & HR', ARRAY['fhp:skill:od', 'fhp:skill:org-design']::TEXT[], ARRAY['hr', 'leadership', 'strategy']::TEXT[]),
('fhp:skill:b2b-sales', 'B2B Sales', 'fhp:domain:sales', 'Sales & Commercial', ARRAY['fhp:skill:enterprise-sales', 'fhp:skill:account-executive']::TEXT[], ARRAY['sales', 'commercial', 'relationship']::TEXT[]),
('fhp:skill:account-management', 'Account Management', 'fhp:domain:sales', 'Sales & Commercial', ARRAY['fhp:skill:customer-success']::TEXT[], ARRAY['sales', 'relationship', 'retention']::TEXT[]),
('fhp:skill:business-development', 'Business Development', 'fhp:domain:sales', 'Sales & Commercial', ARRAY['fhp:skill:biz-dev']::TEXT[], ARRAY['sales', 'strategy', 'commercial']::TEXT[]),
('fhp:skill:content-marketing', 'Content Marketing', 'fhp:domain:marketing', 'Marketing & Growth', ARRAY[]::TEXT[], ARRAY['marketing', 'content', 'seo']::TEXT[]),
('fhp:skill:growth-marketing', 'Growth Marketing', 'fhp:domain:marketing', 'Marketing & Growth', ARRAY['fhp:skill:growth-hacking']::TEXT[], ARRAY['marketing', 'growth', 'data']::TEXT[]),
('fhp:skill:seo', 'SEO', 'fhp:domain:marketing', 'Marketing & Growth', ARRAY['fhp:skill:search-engine-optimisation']::TEXT[], ARRAY['marketing', 'content', 'technical']::TEXT[]),
('fhp:skill:paid-acquisition', 'Paid Acquisition', 'fhp:domain:marketing', 'Marketing & Growth', ARRAY['fhp:skill:ppc', 'fhp:skill:paid-media', 'fhp:skill:sem']::TEXT[], ARRAY['marketing', 'advertising', 'growth']::TEXT[]),
('fhp:skill:qualitative-research', 'Qualitative Research', 'fhp:domain:research', 'Research & Analysis', ARRAY[]::TEXT[], ARRAY['research', 'analysis', 'insight']::TEXT[]),
('fhp:skill:quantitative-research', 'Quantitative Research', 'fhp:domain:research', 'Research & Analysis', ARRAY[]::TEXT[], ARRAY['research', 'statistics', 'data']::TEXT[]),
('fhp:skill:competitive-analysis', 'Competitive Analysis', 'fhp:domain:research', 'Research & Analysis', ARRAY['fhp:skill:market-research']::TEXT[], ARRAY['research', 'strategy', 'commercial']::TEXT[]);

INSERT INTO config.skill_transfer_relationships (source_skill_id, target_skill_id, weight, rationale) VALUES
('fhp:skill:typescript', 'fhp:skill:javascript', 0.9, 'TypeScript is a strict superset of JavaScript. TS proficiency implies strong JS knowledge.'),
('fhp:skill:javascript', 'fhp:skill:typescript', 0.65, 'JS experience transfers well to TS; type system is an additive layer.'),
('fhp:skill:kotlin', 'fhp:skill:java', 0.8, 'Kotlin runs on the JVM and shares the Java ecosystem deeply.'),
('fhp:skill:java', 'fhp:skill:kotlin', 0.7, 'Java developers can adopt Kotlin with moderate effort.'),
('fhp:skill:csharp', 'fhp:skill:java', 0.6, 'C# and Java share OOP paradigm, similar type systems, and ecosystem patterns.'),
('fhp:skill:java', 'fhp:skill:csharp', 0.6, 'Symmetric: similar rationale applies in reverse.'),
('fhp:skill:cpp', 'fhp:skill:rust', 0.55, 'C++ engineers understand systems-level concerns relevant to Rust.'),
('fhp:skill:rust', 'fhp:skill:cpp', 0.5, 'Rust experience transfers to C++ systems reasoning, though paradigm differs.'),
('fhp:skill:ruby', 'fhp:skill:python', 0.55, 'Both are dynamic, expressive scripting languages with similar paradigms.'),
('fhp:skill:python', 'fhp:skill:ruby', 0.5, 'Symmetric, slightly lower weight — Ruby idioms are more distinct.'),
('fhp:skill:react', 'fhp:skill:vue', 0.6, 'Both are component-based reactive frameworks. Concepts transfer strongly.'),
('fhp:skill:react', 'fhp:skill:angular', 0.5, 'Core component and state management concepts transfer; Angular is more opinionated.'),
('fhp:skill:vue', 'fhp:skill:react', 0.6, 'Component model and reactivity concepts are highly transferable.'),
('fhp:skill:django', 'fhp:skill:fastapi', 0.65, 'Both are Python web frameworks. Django experience provides strong foundations.'),
('fhp:skill:fastapi', 'fhp:skill:django', 0.55, 'FastAPI experience transfers to Django, though Django has more conventions to learn.'),
('fhp:skill:spring', 'fhp:skill:django', 0.45, 'Both are MVC-style frameworks; architectural patterns transfer despite language difference.'),
('fhp:skill:rails', 'fhp:skill:django', 0.55, 'Rails and Django are closely analogous full-stack web frameworks.'),
('fhp:skill:docker', 'fhp:skill:kubernetes', 0.7, 'Docker is the foundation of Kubernetes. Container expertise is directly applicable.'),
('fhp:skill:kubernetes', 'fhp:skill:docker', 0.85, 'Kubernetes expertise implies deep Docker knowledge.'),
('fhp:skill:aws', 'fhp:skill:gcp', 0.6, 'Cloud platforms share architectural patterns; service-to-service mapping is learnable.'),
('fhp:skill:aws', 'fhp:skill:azure', 0.6, 'Same rationale as AWS→GCP.'),
('fhp:skill:gcp', 'fhp:skill:aws', 0.6, 'Symmetric cloud platform transfer.'),
('fhp:skill:azure', 'fhp:skill:aws', 0.6, 'Symmetric cloud platform transfer.'),
('fhp:skill:terraform', 'fhp:skill:ci-cd', 0.45, 'IaC experience overlaps with CI/CD pipeline design in platform engineering roles.'),
('fhp:skill:site-reliability', 'fhp:skill:observability', 0.8, 'SRE practice is built on observability fundamentals.'),
('fhp:skill:site-reliability', 'fhp:skill:linux-administration', 0.7, 'SRE roles require strong Linux systems knowledge.'),
('fhp:skill:sql', 'fhp:skill:sql-analytics', 0.75, 'SQL proficiency is the foundation of analytical SQL; window functions are an extension.'),
('fhp:skill:sql-analytics', 'fhp:skill:sql', 0.95, 'Analytical SQL implies strong foundational SQL.'),
('fhp:skill:data-engineering', 'fhp:skill:etl', 0.85, 'ETL/ELT is a core component of data engineering.'),
('fhp:skill:machine-learning', 'fhp:skill:statistics', 0.7, 'ML practice requires and develops strong statistical reasoning.'),
('fhp:skill:statistics', 'fhp:skill:machine-learning', 0.55, 'Statistical knowledge is a strong foundation for ML, though practical ML has additional components.'),
('fhp:skill:deep-learning', 'fhp:skill:machine-learning', 0.9, 'Deep learning is a specialisation of ML; expertise implies broader ML knowledge.'),
('fhp:skill:data-analysis', 'fhp:skill:data-visualisation', 0.65, 'Data analysts routinely develop visualisation skills as part of their practice.'),
('fhp:skill:pandas', 'fhp:skill:data-analysis', 0.7, 'Pandas proficiency is closely correlated with practical data analysis skill.'),
('fhp:skill:spark', 'fhp:skill:data-engineering', 0.75, 'Spark is a major data engineering tool; experience implies broader pipeline knowledge.'),
('fhp:skill:dbt', 'fhp:skill:sql-analytics', 0.75, 'dbt is built on analytical SQL; proficiency implies strong SQL.'),
('fhp:skill:bi-tools', 'fhp:skill:data-visualisation', 0.7, 'BI tool experience overlaps strongly with data visualisation practice.'),
('fhp:skill:system-design', 'fhp:skill:microservices', 0.7, 'System design encompasses microservices architecture as a major pattern.'),
('fhp:skill:microservices', 'fhp:skill:system-design', 0.65, 'Microservices expertise develops broader system design thinking.'),
('fhp:skill:tdd', 'fhp:skill:software-testing', 0.8, 'TDD practitioners have strong testing skills by definition.'),
('fhp:skill:software-testing', 'fhp:skill:tdd', 0.55, 'Testing experience is a foundation for TDD, though TDD is a specific discipline.'),
('fhp:skill:rest-api-design', 'fhp:skill:graphql', 0.5, 'API design experience transfers to GraphQL; paradigm shift requires learning.'),
('fhp:skill:nodejs', 'fhp:skill:javascript', 0.85, 'Node.js is JavaScript; strong Node expertise implies strong JS.'),
('fhp:skill:javascript', 'fhp:skill:nodejs', 0.65, 'JS developers can adopt Node reasonably quickly.'),
('fhp:skill:ux-design', 'fhp:skill:user-research', 0.7, 'UX design practice requires and develops user research skills.'),
('fhp:skill:user-research', 'fhp:skill:ux-design', 0.55, 'User researchers develop UX sensibility; design execution is a separate skill.'),
('fhp:skill:product-management', 'fhp:skill:product-strategy', 0.75, 'Product management develops strategic thinking as a core competency.'),
('fhp:skill:product-management', 'fhp:skill:stakeholder-management', 0.7, 'PM roles require continuous stakeholder management.'),
('fhp:skill:product-strategy', 'fhp:skill:strategic-planning', 0.65, 'Product strategy experience transfers to broader strategic planning skills.'),
('fhp:skill:engineering-management', 'fhp:skill:people-management', 0.8, 'Engineering management is a specialisation of people management.'),
('fhp:skill:people-management', 'fhp:skill:mentoring', 0.75, 'People managers develop coaching and mentoring as core skills.'),
('fhp:skill:programme-management', 'fhp:skill:project-management', 0.85, 'Programme management encompasses project management as a component.'),
('fhp:skill:project-management', 'fhp:skill:risk-management', 0.65, 'Project management requires ongoing risk identification and management.'),
('fhp:skill:strategic-planning', 'fhp:skill:risk-management', 0.55, 'Strategic planning involves risk assessment as a component.'),
('fhp:skill:quantitative-research', 'fhp:skill:statistics', 0.7, 'Quantitative research requires and builds statistical analysis skills.'),
('fhp:skill:statistics', 'fhp:skill:quantitative-research', 0.65, 'Statistical skills are the core of quantitative research methods.'),
('fhp:skill:qualitative-research', 'fhp:skill:user-research', 0.7, 'Qualitative research methods map directly to user research practice.'),
('fhp:skill:user-research', 'fhp:skill:qualitative-research', 0.65, 'User research is a domain application of qualitative research methods.'),
('fhp:skill:application-security', 'fhp:skill:penetration-testing', 0.55, 'AppSec engineers develop offensive security understanding as part of their practice.'),
('fhp:skill:penetration-testing', 'fhp:skill:application-security', 0.65, 'Pen testers develop strong understanding of application-level vulnerabilities.'),
('fhp:skill:cloud-security', 'fhp:skill:application-security', 0.55, 'Cloud security overlaps with application security in cloud-native contexts.'),
('fhp:skill:financial-modelling', 'fhp:skill:financial-analysis', 0.8, 'Financial modelling requires and demonstrates strong analytical skills.'),
('fhp:skill:fp-and-a', 'fhp:skill:financial-modelling', 0.75, 'FP&A roles are built around financial modelling as a core skill.'),
('fhp:skill:fp-and-a', 'fhp:skill:financial-analysis', 0.8, 'FP&A is a specialisation of financial analysis.'),
('fhp:skill:data-analysis', 'fhp:skill:competitive-analysis', 0.55, 'Analytical skills and tooling transfer across domain boundaries.'),
('fhp:skill:technical-writing', 'fhp:skill:content-marketing', 0.5, 'Technical writers develop writing skills transferable to content marketing.'),
('fhp:skill:public-speaking', 'fhp:skill:stakeholder-management', 0.55, 'Strong communication skills are foundational to stakeholder management.'),
('fhp:skill:agile', 'fhp:skill:project-management', 0.65, 'Agile methodology experience is a strong foundation for project management.'),
('fhp:skill:process-improvement', 'fhp:skill:risk-management', 0.5, 'Process improvement work routinely involves risk identification and mitigation.'),
('fhp:skill:employment-law', 'fhp:skill:risk-management', 0.5, 'Employment law knowledge supports HR risk management.'),
('fhp:skill:a-b-testing', 'fhp:skill:statistics', 0.6, 'A/B testing requires statistical reasoning; proficiency implies it.'),
('fhp:skill:growth-marketing', 'fhp:skill:a-b-testing', 0.65, 'Growth marketing practice is built on experimentation and A/B testing.');
