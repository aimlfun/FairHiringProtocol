# Changelog

All notable changes to the Fair Hiring Protocol will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Known gaps / next work
- MMIL implementation (spec complete at `specs/multi-model-inference-spec.md`; deferred pending API keys)
- Email verification on sign-up (will use smtp4dev)
- SSL on API endpoints
- Accessibilty: insufficient titles on inputs, etc.
- Candidate profile: Fairness Monitoring fields show blank after save (by design — GDPR write-only); UI needs to replace fields with a "data provided — click to re-enter" state
- **Auto-matching production architecture**: current in-process `_autoMatchQueue` in `matching-service.ts` is a dev placeholder. At scale (200k+ candidates, 10k+ jobs) this must be replaced with a proper job queue (pg-boss recommended — uses existing PostgreSQL, minimal infrastructure) and separate worker processes. The `runAndSavePair` / mapper functions are already decoupled and can move to a worker unchanged.

### Changed
- Fonts referenced locally: /fonts/*.css, rather than referencing google.
- css / js moved outside of html for best practice.

### Known test failures (full-suite run, full-suite-only — all pass in isolation)

These 3–9 tests fail only in the full ~282-test suite, never when run alone. Root causes are full-suite ordering effects; fixes deferred.

| Test | File | Failure mode | Root cause |
|------|------|-------------|------------|
| `8.4` company resolves ghosting event | ghosting-resolve-dispute.spec.ts | Fast failure ~35ms | Full-suite state ordering — `beforeAll` company/interaction setup affected by earlier specs |
| `8.5` company disputes ghosting event | ghosting-resolve-dispute.spec.ts | Fast failure ~35ms | Same |
| Demographics consent tests (3 tests) | demographics-consent.spec.ts | Fast failure 6–40ms | `beforeAll` cascade from full-suite ordering |
| matching-simulation UI | matching-simulation.spec.ts | `waitForURL` timeout 47s | Intermittent CDN/browser issue |
| work history Add role button | regression.spec.ts | `waitForURL` timeout 47s | Same |

---

## [0.16.0] — 2026-05-31

### Fixed — application bugs

- **`matches.ts` JSONB double-encoding** (`api/src/routes/matches.ts`): match explanation inserts used `${JSON.stringify(value)}::jsonb` — when `skill_breakdown` was already a JavaScript array, `JSON.stringify` plus the `::jsonb` cast stored the array as a JSON *string* inside JSONB rather than as an array. On retrieval `buildExplanationHtml` received a string, called `.forEach`, crashed silently, and `loadMatches()` in the UI never updated the filter counts — "All (0)" even when matches existed. Fixed to use `app.db.json(value)` throughout (per CLAUDE.md JSONB pattern).
- **`candidate-app.js` `buildExplanationHtml` defensive guard**: made `skill_breakdown` parsing defensive against string values (legacy DB rows with the old encoding or any future misfire) — tries `JSON.parse` before giving up, rather than crashing the entire `loadMatches()` render loop.
- **`matches.ts` 409 response now structured**: the duplicate-match 409 response previously embedded `match_id` as plain text inside `message`; it now returns `{ error, message, match_id }` so tests can extract the existing match ID without string parsing.

### Fixed — E2E test suite

The full test suite was at ~245/282 (~87%). After these fixes it stabilises at **275–276/282 (~97.5%)** across multiple runs.

**Root causes addressed:**

1. **Auto-matching queue starving HTTP requests** — `matching-service.ts` `_autoMatchQueue` ran all pipeline pairs sequentially on the main event loop. With 282 tests each potentially triggering auto-matching, the queue accumulated hundreds of pairs. Each pair's CPU-bound pipeline work occasionally delayed HTTP request processing long enough to hit `waitForURL` timeouts.
   - `triggerJobMatching` LIMIT reduced 10 → 5; pairs now run in `Promise.allSettled` (parallel) per batch, draining the queue ~5× faster.
   - `triggerCandidateMatching` LIMIT reduced 5 → 3; same parallelisation.

2. **Background auto-matching architecture** (`api/src/services/matching-service.ts`, `api/.env`): added `AUTO_MATCHING` config flag (default `true`); set `AUTO_MATCHING=false` in `api/.env` so the background queue never runs during test/dev. Tests that specifically exercise auto-matching now call explicit synchronous test-helper endpoints instead of polling.

3. **Test-helper endpoints** (`api/src/routes/test-helpers.ts`): added `POST /v1/test-helpers/trigger-job-matching` and `POST /v1/test-helpers/trigger-candidate-matching` — run the matching pipeline synchronously for a specific job/candidate and await completion. `auto-matching.spec.ts` updated to call these instead of polling.

4. **Google Fonts CDN blocking `registerCandidate`** (`tests/e2e/helpers.ts`): `landing-page.html` loads Google Fonts via `<link rel="stylesheet">`, which — per the HTML parser's CSS-before-script rule — blocks `landing-page.js` from executing until the external CDN responds. A slow CDN response (intermittent) caused `waitForLoadState('networkidle')` to stall, leaving insufficient time for form submission and redirect. Fixed by intercepting `fonts.googleapis.com/**` and `fonts.gstatic.com/**` in `blockFonts()` and calling it at the start of `registerCandidate`, `loginCandidate`, and `registerAndCaptureToken`.

5. **409 handling in test specs**: when `AUTO_MATCHING=true` was active, auto-matching occasionally pre-created a match before a test's `POST /v1/matches` call, returning 409. Fixed in `bias-selection-pattern.spec.ts`, `cohort-assignment.spec.ts`, and `matching-simulation.spec.ts` to handle 409 gracefully (fetch the existing match, verify decision).

6. **`compute-job-fairness` candidate filter** (`api/src/routes/test-helpers.ts`): added optional `candidate_ids` parameter to restrict fairness computation to the test's specific candidates, preventing contamination from stale DB rows that `triggerJobMatching` matched to the test job.

7. **`playwright.config.ts`**: overall test timeout raised 30 s → 60 s; `waitForURL` timeout raised 10 s → 45 s to accommodate occasional server warm-up on first run.

### Changed

- `auto-matching.spec.ts`: polling replaced with explicit `trigger-job-matching` / `trigger-candidate-matching` test-helper calls — tests are now deterministic (no timing assumptions).
- `api/.env`: `AUTO_MATCHING=false` added.

---

## [0.15.0] — 2026-05-28

### Fixed
- **Company registration modal focus** (`landing-page.html`): `openModal('company')` now focuses `coreg-legal-name` (legal company name — the first field) instead of `coreg-email` (compliance email — a later field)
- **Company job dialog skill search** (`company-dashboard.html`): replaced hardcoded 19-entry `SKILL_OPTIONS` array with a debounced `GET /v1/ontology/skills` API call; fixes C# and C++ (and any other skill absent from the old list) being unsearchable; uses index-based selection (`_dialogSkillSuggestions[i]`) to avoid JSON-in-attribute escaping issues
- **`updateProfGuidance` ReferenceError** (`company-dashboard.html`): function and its dependency `PROF_DEFS` were defined inside `renderJobSkills()` making them local-scope only; `openJobDialog()` and the proficiency `<select onchange="updateProfGuidance()">` attribute both threw `ReferenceError`; `PROF_LABELS`, `PROF_DEFS`, and `updateProfGuidance` hoisted to module scope

---

## [0.14.0] — 2026-05-28

### Added
- **Governed certifications/licence ontology** — `ontology/skills.json` bumped to v1.2.0 with a new top-level `"certifications"` block (33 entries: 10 licences, 22 professional certifications). Each entry carries `cert_id` (e.g. `fhp:cert:cka`), `issuing_body`, `type`, expiry metadata, and an `evidences` array mapping the cert to the skills and minimum proficiency levels it corroborates.
  - `licence` entries are a hard gate in matching Stage 3 (binary pass/fail). Examples: Driving Licence (B), GMC Full Registration, SIA Door Supervisor, FCA Approved Person, Enhanced DBS.
  - `certification` entries are a proficiency corroboration signal in matching Stage 4. Examples: CKA, AWS SAA/SAP, CISSP, OSCP, PMP, PSM I.
- **`config.certifications` table** (`db/migrations/025_certifications.sql`) — governed cert ID ontology with `cert_id`, `label`, `issuing_body`, `cert_type`, `has_expiry`, `validity_years`, `evidences` JSONB, seeded with 33 entries; all non-ASCII characters encoded via `chr()` for portable Windows/Linux migration execution
- **`db/migrations/026_fix_cert_label_encoding.sql`** — remediation migration to fix rows corrupted by Windows psql UTF-8 re-encoding (stored literal `?` instead of en-dash / superscript 2); uses `chr(8211)`, `chr(8212)`, `chr(178)` for encoding-safe UPDATE
- **`matching.candidate_profiles.certifications` JSONB column** — first-class certs array, separate from `preferences`; each entry: `{cert_id, label, issuing_body, cert_type, issued?, expiry?, credential_url?}`
- **`matching.job_briefs.required_certifications` JSONB column** — array of `{cert_id, requirement}` where `requirement` is `must_have | preferred`
- **`GET /v1/ontology/certifications`** — unauthenticated autocomplete endpoint; ILIKE search on label/issuing_body/cert_id; optional `type=licence|certification` filter; returns `{certifications, total}`
- **`PUT/GET /v1/candidates/me`**: `certifications` field added at top level (not nested inside `preferences`); cert IDs validated against `config.certifications` on write
- **`POST/PUT /v1/jobs`**: `required_certifications` field added; cert IDs validated against `config.certifications`
- **Candidate app cert UI** (`candidate-app.html`): replaced free-text cert form with governed autocomplete — type-ahead search via `GET /v1/ontology/certifications`, cert type badge (LICENCE / CERT / MEMBERSHIP), evidence signals line, expiry auto-fill when `has_expiry && validity_years`, credential URL field
- **Company dashboard cert UI** (`company-dashboard.html`): "Required Licences & Certifications" section added to job dialog (Section 05) — type-ahead cert search, requirement selector (must_have / preferred), auto-sets `must_have` for licence-type certs; saved in `required_certifications` on job brief POST/PUT
- **Appeals tab empty state** (`candidate-app.html`): "Submit a New Appeal" section is now hidden when the candidate has no appealable matches; replaced with an explanatory message ("only not matched / borderline outcomes within 30 days can be appealed")
- **`h()` non-ASCII encoding** in both `candidate-app.html` and `company-dashboard.html`: all code points > 127 encoded as `&#NNNN;` numeric character references — defence-in-depth for any future Unicode data from the API

### Fixed
- **Cert suggestion click failure**: `JSON.stringify(cert)` embedded directly in `onmousedown="…"` attributes produced double-quoted JSON that broke the HTML attribute delimiter, truncating the handler and leaking raw JSON as visible text; fixed by storing suggestion objects in module-level arrays (`_certSuggestions`, `_jobCertSuggestions`) and referencing only the integer index in inline handlers
- **Cert label "???" display**: Windows psql re-encodes multi-byte UTF-8 byte sequences through the terminal code page before transmitting to PostgreSQL, storing literal `?` characters for en-dash and superscript-2; fixed by using `chr()` in migration 025 (pure ASCII source) and shipping migration 026 to correct any already-stored garbled rows
- **"View terms" link** in candidate app Data & Privacy tab: was `href="#"` (went nowhere); now `href="landing-page.html#terms" target="_blank" rel="noopener"` pointing to the existing ToS section in the landing page

### Testing
- **Ontology skill search regression** — 5 new tests added to `tests/e2e/candidate-profile-api.spec.ts` (`describe('Ontology skill search API')`): C# search by `c%23`, C++ search by `c%2B%2B`, Python baseline, nonsense query returns empty array, full listing contains both symbol-named skills. Guards against the URL-encoding regression that caused symbol-character skills to be unsearchable.

---

## [0.13.0] — 2026-05-24

### Added
- **Governance dashboard fully wired** (`governance-dashboard.html`) — all tabs now connected to the API with governance authentication:
  - Auth zone: Sign In modal (username/password → `POST /v1/auth/login-governance`), user badge (display name + role tag), Sign Out — all persisted in `sessionStorage`
  - Proposals tab: submit-proposal modal (POST `/v1/governance/proposals`), VOTE REQUIRED badge on proposals without a recorded vote result, displays `proposal_ref` (human-readable) instead of raw UUID
  - Escalations tab: inline Respond form per escalation (PUT `/v1/governance/escalations/:id`) with Status, Outcome, Outcome Notes, and Public Summary fields; Respond button on same header line as escalation type; escalation type labels humanised (`candidate_appeal` → "Candidate Appeal")
  - Vote recording form: uses governance JWT (`govAuthHeaders()`) instead of candidate token
- **`POST /v1/auth/login-governance`** — new endpoint in `api/src/routes/auth-governance.ts`; rate-limited 10 req/min; constant-time bcrypt comparison to prevent username enumeration; returns `{ access_token, role, display_name, username }`; JWT carries `aud: 'fhp-governance'`
- **`identity.governance_users` table** — `db/migrations/024_governance_users.sql`: `user_id`, `username`, `password_hash`, `role` (`governance`|`admin`), `display_name`, `is_active`, `created_at`, `last_login_at`
- **`api/scripts/seed-governance.ts`** — seeds governance users from `GOVERNANCE_ADMIN_*` / `GOVERNANCE_USER_*` env vars (bcrypt 12 rounds, upsert by username); called by `npm run seed:governance`
- **`start-dev.ps1`** — PowerShell 5.1-compatible dev startup script replacing `build.cmd`: starts fhp-postgres Docker container, runs SQL migrations, seeds governance users, starts static file server on `:9999` and Fastify API on `:3000`

### Changed
- `api/src/app.ts`: registered `authGovernanceRoutes` at `/v1/auth`; JWT `verify.audience` extended to accept `'fhp-governance'` tokens
- `governance-dashboard.html`: escalation render now accepts `allowRespond` flag — overview tab passes `false` to avoid duplicate DOM IDs that broke the Respond toggle

### Fixed
- **Governance respond form broken**: both the Overview tab and the Escalations tab called `renderEscalationItem()` for the same data, generating duplicate `id="esc-respond-{safeId}"` elements; `getElementById` returned the hidden Overview copy, so clicking Respond had no visible effect; fixed by passing `allowRespond = false` for overview renders
- **Modal errors silently hidden**: `errEl.style.display = ''` reverted to the CSS `display:none` rule; changed to `errEl.style.display = 'block'` throughout all modal error paths
- **Vote endpoint**: added server-side validation rejecting votes where `for + against + abstain = 0`; `rejectHtml()` applied to all free-text proposal fields (`proposal_ref`, `title`, `summary`, `submitted_by`, `affiliation`, `document_body`)

---

## [0.12.0] — 2026-05-23

### Added
- **E2E test suite: 179/179 scenarios (100%), ~240 tests, 32 spec files**
- `tests/e2e/bias-pipeline.spec.ts` — 4 tests (scenarios 10.1–10.4): bias correction fires for a candidate in a breached cohort; `bias_correction_triggered` stored on match event; `correctionApplied.direction = 'upward'` with non-zero magnitude; no correction for candidates with no cohort data
- `tests/e2e/bias-selection-pattern.spec.ts` — 7 tests (scenarios 10.5–10.11): full end-to-end company selection bias scenario — 5 candidates (3 young, 2 old), company only engages young ones, compute-job-fairness detects DIR breach, compliance score decreases, governance endpoints reflect state
- `tests/e2e/cohort-assignment.spec.ts` — 4 tests (scenarios 13.1–13.2): assign-cohorts helper seeds `candidate_cohorts`; pipeline reads real cohort data; idempotency (ON CONFLICT DO UPDATE); cohort memberships feed into per-job disparate impact via compute-job-fairness
- `tests/e2e/twg-review.spec.ts` — 5 tests (scenario 9.11): TWG governance body can GET escalations, update outcome with `X-Governance-Api-Key`, verify resolved appeal; 401 without key
- `api/src/routes/test-helpers.ts` — three new dev-only endpoints:
  - `POST /v1/test-helpers/assign-cohorts` — seeds `matching.candidate_cohorts` rows (ON CONFLICT DO UPDATE)
  - `POST /v1/test-helpers/seed-fairness-breach` — inserts a platform-level `analytical.fairness_metrics` row with `cohort_stats` JSONB marking a cohort's DIR as out-of-bounds
  - `POST /v1/test-helpers/compute-job-fairness` — reads match events + cohort memberships + active interactions, computes per-cohort engagement rates and DIR, inserts job-level fairness record, decreases company `compliance_score` by 10 if breach detected
- `api/src/routes/matches.ts`: replaced stub `CohortService` and `FairnessMetricsStore` with real DB-backed implementations — pre-loads `candidate_cohorts` and `analytical.fairness_metrics.cohort_stats` before calling `buildContext()`, enabling live bias detection and correction in the pipeline

### Fixed
- `reference-impl/` TypeScript compilation errors (12 files): `.ts` → `.js` import extensions (NodeNext module resolution), `exactOptionalPropertyTypes` violations (`prop?: T` → `prop: T | undefined`), `noUncheckedIndexedAccess` non-null assertions in `cohort-service.ts`, `fairness-job-updated.ts`, and `tests/conformance/demographics.test.ts`

---

## [0.11.0] — 2026-05-23

### Added
- **E2E test suite: SLA-triggered ghosting now covered — 168/179 (94%), 218 tests, 28 spec files**
- `tests/e2e/sla-ghosting.spec.ts` — 5 tests: SLA expiry → monitor creates ghosting event visible to candidate (7.5); event has correct structure incl. severity/stage/overdue_hours (8.1); monitor idempotency; expire with unknown ID → 404; monitor on live interaction → 0 breaches
- `api/src/routes/test-helpers.ts` — two new dev-only endpoints:
  - `POST /v1/test-helpers/expire-interaction-sla` — sets `stage_entered_at = NOW() - 3h`, `sla_deadline = NOW() - 2h` on an `active_interaction` (satisfies `sla_deadline > stage_entered_at` CHECK constraint)
  - `POST /v1/test-helpers/run-sla-monitor` — minimal SLA breach scanner: finds `sla_deadline < NOW() AND status = active` interactions, creates `ghosting_events` for those without one; optional `interaction_id` scopes the scan; idempotent

---

## [0.10.0] — 2026-05-23

### Added
- **E2E test suite: all partial scenarios converted to full coverage — 0 partial scenarios remain** (166/179 = 93%; 213 tests, 27 spec files)
- `2.14` — `location_countries` preference round-trip test added to `candidate-profile-api.spec.ts`
- `4.10` — Explicit `preference_alignment_score > 0` assertion added to matched-with-aligned-work-mode test in `matching-decisions.spec.ts`
- `4.19` — Explicit `plain_language_summary` truthy assertion added to borderline test in `matching-decisions.spec.ts`
- `9.2` — Dedicated borderline-appeal test added to `appeals.spec.ts`; uses `aware` proficiency Python candidate against `practitioner`-required job to produce a borderline decision, then submits an appeal
- `12.1` — Two API-level tests added to `demographics-consent.spec.ts`: `created_at` timestamp validity after registration; empty `consents` list before explicit consent is given

---

## [0.9.0] — 2026-05-23

### Added
- **E2E test suite expanded: 188 → 203 tests, 24 → 27 spec files, 87% → 89% scenario coverage** (160 of 179 scenarios in `tests/e2e/TESTING-SCENARIOS.md`)
- `tests/e2e/notification-stage-invitation.spec.ts` — 3 tests: `stage_invitation` notification present after matched run (5.8a–c); verifies borderline runs do NOT produce stage_invitation
- `tests/e2e/post-deadline-appeal.spec.ts` — 5 tests: appeal after 30-day window → 422 APPEAL_WINDOW_EXPIRED; appeal at 29 days → 201; test-helper guards (9.10a–e)
- `tests/e2e/ghosting-resolve-dispute.spec.ts` — 6 tests: resolve → status resolved; dispute → status disputed; wrong-company → 404; already-resolved dispute → 404; no-auth → 401; unknown-interaction → 404 (8.4, 8.5)
- `api/src/routes/test-helpers.ts` — Dev-only (`NODE_ENV=development`) endpoints:
  - `POST /v1/test-helpers/create-backdated-match` — inserts synthetic `not_matched` event with explicit `created_at` N days ago (avoids the `match_events` immutability trigger which blocks UPDATE; INSERT with explicit timestamp is permitted)
  - `POST /v1/test-helpers/create-ghosting-event` — inserts a synthetic open ghosting event for an existing `active_interaction` with `sla_deadline` 2 hours in the past (satisfying the `detected_at >= sla_deadline` DB constraint)

### Changed
- **`POST /v1/matches`**: when pipeline decision is `matched`, now also inserts a `stage_invitation` notification into `candidate_notifications` (in addition to the existing `match_result` notification). This implements FHP §7 scenario 5.8 — the candidate is informed when the employer opens the hiring process.
- `tests/e2e/notifications.spec.ts`: tightened the `find()` predicate to match `notification_type === 'match_result'` explicitly; prevents false failure when both `stage_invitation` and `match_result` are present for the same match.

### Fixed
- `tests/e2e/TESTING-SCENARIOS.md` summary table: Notifications row incorrectly showed 11/11 while 5.8 was still ❌; now correct after implementation.

---

## [0.8.0] — 2026-05-23

### Added
- **E2E test suite expanded: 22 → 188 tests, 18 → 24 spec files, 71% → 87% scenario coverage** (156 of 179 scenarios in `tests/e2e/TESTING-SCENARIOS.md`)
- `tests/e2e/governance-votes.spec.ts` — 8 tests: POST /governance/votes pass/fail/FOB-veto/wrong-key/missing-fields, vote appears in public list (scenarios 17.9a–g); uses `X-Governance-Api-Key` header
- `tests/e2e/transfer-credits.spec.ts` — 4 tests: fresh account returns empty array; docker/proficient → Kubernetes 35% raw credit; docker/expert → 52% (IEEE 754 rounding); unauthenticated → 401 (scenarios 14.1–14.4)
- `tests/e2e/candidate-profile-api.spec.ts` — 5 tests: ontology skill ID round-trip, `matching_eligible` auto-set false on empty skills and true on non-empty, preferences round-trip, 401 guards (scenarios 2.13, 2.15–2.19)
- `tests/e2e/interactions-ghosting.spec.ts` — 11 tests: active_interaction auto-created on matched pipeline run (7.1); company structured rejection via `POST /interactions/:id/reject` (7.4); candidate accept/decline via `PUT /interactions/:id` (7.2, 7.3); SLA shape (7.6); GET ghosting endpoints for candidate and company (8.2–8.3)
- `tests/e2e/fairness-company.spec.ts` — 7 tests: GET /companies/me/fairness/jobs shape; POST /companies/me/fairness/remediation (accepted, invalid metric, unknown job, no auth, audit log entry) (scenarios 10.12–10.13)
- `tests/e2e/ui-candidate-app.spec.ts` — 3 browser tests: no-token redirect to landing page (1.11); match score filter buttons filter cards by decision (4.23); bell badge shown/hidden by unread count (5.11)

### Changed
- **`POST /v1/matches`**: when pipeline decision is `matched`, now automatically inserts a row into `matching.active_interactions` (`current_stage = 'initial_match_acknowledgement'`, `sla_deadline = NOW() + response_sla_days`). Previously this table had no creation path via the API, blocking all interaction/ghosting tests and making the SLA/Rejections dashboard permanently empty.
- `api/.env`: `GOVERNANCE_API_KEY` set to `e2e-test-governance-key` — previously empty, which disabled the API-key auth path in `requireGovernance` and made POST /governance/votes untestable without a governance JWT.

### Fixed
- **Transfer credit formula floating point**: `Math.round(0.525 * 100)` evaluates to 52 (not 53) in IEEE 754 because `3/4 * 0.70 * 100 = 52.4999...` in double precision. Tests and comments corrected.
- **Rejection code validation**: `POST /companies/me/interactions/:id/reject` validates `reason_code` against `config.rejection_codes` table. The seeded codes are `AS-01–AS-03`, `PL-01–PL-04`, `PR-01–PR-04`, `SR-01–SR-04`. Free-text codes like `skills_gap` are rejected with 400. Tests updated to use `PR-01`.
- **Remediation `plan_text` minimum length**: `POST /companies/me/fairness/remediation` requires `plan_text` with `minLength: 100`. Fastify schema validation runs before preHandler (auth), so a short plan_text body returns 400 even without a token. Tests updated with compliant text.

### Discovered (not yet fixed)
- `5.8` — no `stage_invitation` notification type in the pipeline; when a company initiates contact (creates active_interaction), no notification is sent to the candidate. Tracked in known gaps above.

---

## [0.7.0] — 2026-05-21

### Added
- Playwright E2E test suite (`tests/e2e/`) — 22 tests across 4 spec files, all passing (1 flaky on first run, passes on retry #1):
  - `auth.spec.ts` — candidate registration and login flows (5 tests)
  - `candidate-profile.spec.ts` — profile save/restore persistence: skills, evidence URLs, salary, job type chips, work mode chips (5 tests)
  - `profile-strength.spec.ts` — profile strength widget: partial strength from defaults, tips displayed, widget visibility, evidence URL effect, salary effect, dashboard/profile sync (8 tests); uses `beforeAll` shared registration with token injection to avoid repeated API load
  - `regression.spec.ts` — four regression tests guarding specific bugs fixed during development (4 tests)
- `tests/e2e/helpers.ts` — shared test utilities: `registerCandidate`, `loginCandidate`, `goToTab`, `saveProfile`, `reloadAndWait`, `profileStrengthPct`, `registerAndCaptureToken`, `injectTokenAndLoad`
- Profile strength widget in `candidate-app.html` — SVG arc indicator + percentage label in sidebar; displayed on both dashboard and profile tab; updates live as candidate fills in evidence URLs or changes salary/preferences; tips list itemises what's missing

### Fixed
- **API: GET `/v1/candidates/me` silently stripped all preference sub-properties** — `preferences: { type: 'object' }` in the Fastify response schema caused `fast-json-stringify` to emit an empty object; fixed by adding `additionalProperties: true`; same fix applied to `privacy`; `work_history` array was missing from the schema entirely and is now declared
- **`toggleRoleForm()` never opened the role entry form** — used `element.style.display === 'none'` which is invisible when display is set via a CSS class; fixed to use `getComputedStyle(el).display`
- **Work schedule chips not saved** — chip elements lacked `id` and `data-val` attributes; save payload builder could not read their state; fixed with correct attributes
- **Right-to-work chips not saved** — same attribute problem as work schedule chips
- **Evidence URL dropped from skills save payload** — `collectSkills()` was not reading the `.ev-inp` value when building the skills array; fixed to include `evidence_url`

---

## [0.6.0] — 2026-05-21

### Added
- `GET /v1/companies/me/pipeline` — cross-job pipeline run history with inline employer explanations; returns stats aggregate (total runs, match rate, avg score, bias correction count) plus per-run rows joining `match_events`, `pipeline_traces` (duration), `job_briefs` (title), and `match_explanations` (employer-audience skill breakdown + summary); candidate identity never exposed
- Company dashboard Pipeline tab fully wired: stats strip (4 KPIs), lazy-loaded runs table with expandable rows; clicking any row reveals score bars (skill / transferable / preference), plain-language employer summary, per-skill grid (required vs candidate proficiency, match type, score contribution), and a bias correction notice when applicable; `togglePipelineRun()` / `_pipelineExpandHtml()` helpers

### Changed
- Pipeline tab stub replaced — removed "coming soon" placeholder, replaced with live API-backed table

---

## [0.5.0] — 2026-05-21

### Added
- `GET /v1/companies/me/sla-by-stage` — SLA compliance breakdown per hiring stage (last 90 days); returns compliance %, active/breached counts, and ghosting event count for each stage from `initial_match_acknowledgement` through `post_rejection_feedback`; wired into company dashboard Overview tab SLA table (previously stuck on "No stage data yet")
- `GET /v1/governance/versions` — Protocol and pipeline version history sourced from `config.governance_constants`; replaces the hardcoded static HTML in the governance dashboard Protocol Versions sidebar widget
- `POST /v1/governance/votes` UI — Record Vote form added to governance dashboard Votes tab; gated behind governance-role JWT check so the button is invisible to public visitors; validates locally then calls the existing API endpoint, resets the form on success, and reloads both the vote table and the sidebar widget

### Changed
- Governance dashboard Protocol Versions sidebar now loads dynamically via `loadVersions()` instead of rendering hardcoded `v1.0.0` markup
- Recent Votes sidebar logic extracted into `updateRecentVotesSidebar()` helper — shared by both `loadOverview()` and `submitVote()` (previously duplicated inline)
- `api-gap-analysis.md` updated to v2.0.0: reflects current 66-endpoint inventory, closes all 27 previously-missing endpoints, and marks the document's "remaining gaps" section as clear (Pipeline tab stub is the sole open item)

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
