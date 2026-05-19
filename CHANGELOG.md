# Changelog

All notable changes to the Fair Hiring Protocol will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Known gaps / next work
- Company dashboard: Pipeline tab (wiring deferred — needs separate discussion)
- Governance dashboard: vote submission (read-only for now — mechanism TBD)
- Integration tests hitting real API + DB
- MMIL implementation (spec complete at `specs/multi-model-inference-spec.md`; deferred pending API keys)
- Email verification on sign-up (will use smtp4dev)
- SSL on API endpoints
- Candidate profile: profile strength is static (no API)
- Candidate profile: data download not implemented
- Candidate profile: save profile bug
- Candidate profile: "no matches" state shows blank — needs empty-state message
- Candidate profile: Fairness Monitoring fields show blank after save (by design — GDPR write-only); UI needs to replace fields with a "data provided — click to re-enter" state
- Candidate profile: skill entry must be constrained to ontology IDs (free-text skills break job matching)

---

## [0.4.0] — 2026-05-19

### Added
- Governance Bodies table: migration `019_governance_bodies.sql`, `GET /v1/governance/bodies` endpoint (public), dynamic render in governance dashboard Overview tab
- Mock data seed script: `api/scripts/seed-mock.ts` — idempotent re-runs, `--clean` flag, auto-detects first company; added `npm run seed:mock`
- Email format validation on all four auth forms in `landing-page.html` (candidate login/register, company login/register) — rejects malformed addresses before any API call
- `max_notice_period_days` column on `job_briefs` (migration `020_job_notice_period.sql`); maximum acceptable notice period now saves and pre-fills correctly in the edit dialog, converting between UI value+unit and stored days
- Hiring stages (`process_stages`) now included in `saveJobBrief()` — saved as a string array from the comma-separated input and pre-filled on edit
- Compliance breakdown bars (SLA, ghosting-free rate, fairness, rejections) rendered in Overview tab from `compliance_breakdown` API data
- "Post new brief" dialog now auto-focuses the job title input on open

### Fixed
- Governance dashboard: `GET /escalations` and `GET /metrics` were incorrectly protected with `requireGovernance`; now public. Frontend `api()` no longer redirects on 401 for public reads; added separate `apiAuth()` for authenticated writes
- Live Governance Feed and Governance Bodies widgets wired to API (both were stuck on "Loading…" or showing hardcoded mockup data)
- Company dashboard compliance score: `TypeError: toFixed is not a function` — postgres.js returns NUMERIC columns as strings; fixed all three occurrences by routing through the existing `fmtScore()` helper
- Audit log export: was querying non-existent `audit.governance_log` table; now queries `audit.audit_log`; format switched from JSON to CSV with UTF-8 BOM so Excel renders special characters correctly
- Fairness metrics tab was blank: seed was missing job-level metrics (`scope_level = 'job'`); added three job-level rows
- Edit job dialog: salary, country, skills, and attestation fields were blank because `prefillJobDialog` expected nested objects (`jobObj.salary.min`, `jobObj.location.country`, `jobObj.prohibited_filters`) but the API returns flat fields (`salary_minimum`, `location_country`, `attest_no_*`); all mappings corrected
- Edit job dialog: subtitle showed raw API path (e.g. `API: PUT /v1/jobs/…`); replaced with `"Edit brief · FHP v1.0 compliant"`
- Edit job dialog: attestation checkboxes now restore from DB state; `attest-gaps` (no DB column) defaults to checked when editing an existing active job
- Edit job dialog: skills pre-fill now handles both API-created format (`requirement_type`, string proficiency) and seed format (`requirement_level`, numeric proficiency)
- SLA tab: "Active Interactions" and "Overall SLA Compliance" sub-labels were stuck on "Loading…"; now set to static descriptive text; page subtitle now dynamic from API data
- Pipeline tab: was showing 3 hardcoded mockup rows; replaced with a clean empty state pending the endpoint
- Mock seed jobs: added `location_country: 'GB'`, paragraph-length `role_summary`, multi-skill arrays with correct ontology IDs, and compliance attestations set to `true`

### Changed
- `saveJobBrief()` now sends flat field names matching the API (`salary_minimum`, `location_country`, `attest_no_*`) instead of the previous nested objects (`salary: {…}`, `location: {…}`, `prohibited_filters: {…}`)
- `PUT /v1/jobs/:id`: expanded from 4 updatable fields to full coverage — salary (all 4 fields), location, employment type, work mode, skills, process stages, notice period, all 4 attest columns
- `POST /v1/jobs`: now saves attest columns and sets `status = 'active'` immediately when all four attestations are provided as `true`; otherwise creates in `pending_review`
- Changing salary or skills in the edit dialog now clears all attestation checkboxes and shows a re-attestation warning
- Audit log CSV export adds a UTF-8 BOM and sets `Content-Type: text/csv; charset=utf-8`

---

## [0.3.0] — 2026-05-19

### Added
- Company register and login wired in `landing-page.html` (`POST /v1/auth/register-company`, `POST /v1/auth/login-company`); redirects to `company-dashboard.html` on success
- `company-dashboard.html` fully wired to API: Overview, Fairness, Jobs, SLA, Ghosting, Rejections, Audit Log, and Appeals tabs — all load live data; Pipeline tab left as stub
- `governance-dashboard.html` fully wired to API: Overview, Escalations, Fairness, Proposals, Audit Log, and Votes tabs — votes are read-only (submission mechanism TBD)
- Client-side CSV export for Fairness and Ghosting tabs (company dashboard)
- Audit log export uses API `?format=csv` param and triggers a browser download
- Lazy tab loading: each tab fetches data only on first activation
- Escalation filter dropdowns (type/priority/body) in governance dashboard are now functional

### Changed
- Job create/edit dialog: `saveJobBrief()` now calls `POST /v1/jobs` (create) or `PUT /v1/jobs/:id` (edit) instead of showing an alert stub
- Edit job dialog pre-fills from real API job data when opened from the Jobs tab

---

## [0.2.0] — 2026-05-11

### Added
- Demographic data capture: migration `017_candidate_demographics.sql`, route `demographics.ts`, UI in candidate app Data & Privacy tab
- Company authentication: migration `016_company_auth.sql`, route `auth-company.ts`
- Add/Edit job dialog fully wired in `company-dashboard.html` (all 6 sections, compliance attestations)
- `candidate-app.html` fully wired to API (auth, profile, skills, work history, certs, preferences, appeals, demographics, notifications, matches)
- Deployment and setup instructions
- API gap analysis document (`api-gap-analysis.md`)

### Fixed
- Multiple bug fixes across API routes and candidate app
- Moved mockup pages to `mockup-ui/` to allow live wired pages to coexist at root

---

## [0.1.0] — 2026-05-10

### Added
- PostgreSQL schema: 19 migrations (000–018 + 009b), 43 tables across 5 schemas (`identity`, `matching`, `analytical`, `audit`, `config`)
- REST API: 62 endpoints across 14 Fastify route files
- Reference implementation: 9-stage matching pipeline, 90+ conformance tests
- Nightly fairness job: per-dimension (sex/age/ethnicity/religion/education), data insufficiency handling, 39 tests
- Appeals workflow: state machine, TWG/PC/FOB routing, DB schema, API routes
- Governance escalation pipeline and dashboard UI
- SLA monitoring and ghosting event data model
- Candidate app UI (`candidate-app.html`): 6 tabs
- Company dashboard UI (`company-dashboard.html`): UI complete
- Governance dashboard UI (`governance-dashboard.html`): 6 tabs
- Landing page (`landing-page.html`): candidate register/login wired
- Legal and compliance documents (Privacy Policy, DPIA, DPA, EU AI Act conformity, ToS, Pseudonymisation procedure)
- Formal JSON schemas: candidate profile, job brief, match explanation, fairness metrics, ghosting event, identity model
- Skills ontology (`ontology/skills.json`)
- Architecture, design notes, protocol documents, and specs
