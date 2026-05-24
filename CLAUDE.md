# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Fair Hiring Protocol (FHP) — an open-source, community-governed, bias-aware hiring standard. Public good, not a product.

## Commands

### API (`/api`)
```bash
cd api
npm run dev          # Start with tsx watch (hot reload)
npm run build        # Compile TypeScript
npm run typecheck    # Type-check without emitting
npm run lint         # ESLint
npm test             # Vitest (run once)
npm run test:watch   # Vitest (watch mode)
npm run seed:mock    # Insert mock data for all dashboard tabs (idempotent)
npm run seed:mock -- --clean   # Delete mock records first, then re-insert
```

### Reference implementation (`/reference-impl`)
```bash
cd reference-impl
npm test                    # Run all Vitest tests
npm run test:conform        # Conformance tests only
npm run fairness:job        # Run nightly fairness computation
npm run sla:monitor         # Run SLA monitor
```

### Database
```bash
# Run migrations (bash — sequential, filename order)
psql $DATABASE_URL -f db/roles/000_roles.sql
for f in db/migrations/*.sql; do psql $DATABASE_URL -f "$f"; done
for f in db/seeds/*.sql; do psql $DATABASE_URL -f "$f"; done
psql $DATABASE_URL -f db/partitions/create_monthly_partitions.sql
```

### Required environment variables (API)
- `DATABASE_URL` — fhp_api_user connection string
- `IDENTITY_DATABASE_URL` — fhp_identity_user connection string (falls back to `DATABASE_URL` in dev)
- `FAIRNESS_DATABASE_URL` — fhp_fairness_service connection string (falls back to `DATABASE_URL` in dev)
- `JWT_SECRET` — minimum 32 characters

## Architecture

### Components

**`/api`** — Fastify 4.29.1 REST API (TypeScript, Node 20+, postgres.js). 62 endpoints across 14 route files. The server entry point (`server.ts`) calls `buildApp()` from `app.ts` to keep the app testable without binding a port.

**`/db`** — PostgreSQL 16 schema. 21 migration files (000–020 + 009b), run in filename order. 43 tables across 5 schemas. Never edit a committed migration — add a new one.

**`/reference-impl`** — Canonical matching pipeline implementation. Uses SQLite (better-sqlite3) and Express 5, not Fastify/Postgres. Standalone — not imported by the API. Run the conformance tests here to validate protocol compliance.

**`/*.html` (project root)** — The live application pages (no framework, vanilla JS). All four are wired to the API:
- `candidate-app.html` — fully wired (auth, profile, skills, work history, certs, preferences, appeals, demographics, notifications, matches)
- `company-dashboard.html` — fully wired (all 8 tabs including Pipeline)
- `governance-dashboard.html` — fully wired (votes tab has governance-auth submission form)
- `landing-page.html` — candidate and company auth fully wired

**`/mockup-ui/`** — Static design mockups with hardcoded data. These are reference visuals only — do NOT wire them to the API. When a page gets wired, the live version lives at root (`/`) and the mockup in `mockup-ui/` stays frozen as the design reference.

### Three database pools (critical separation)

All three pools connect to the same PostgreSQL instance but as different Postgres roles with different RLS permissions:

| Pool | Role | Use for |
|------|------|---------|
| `app.db` | `fhp_api_user` | All standard operations — no access to identity schema |
| `app.identityDb` | `fhp_identity_user` | PII only: registration, login, contact info |
| `app.fairnessDb` | `fhp_fairness_service` | `candidate_demographics` only — RLS blocks access from the other two pools |

Using the wrong pool for an operation will silently return no rows (RLS), not an error.

### RLS session context

Every authenticated request must set the session context before any query. The auth middleware (`api/src/middleware/auth.ts`) does this automatically via `SET_CONFIG`. For manual transactions, use `setSessionContext()` or `withTransaction()` from `api/src/db/index.ts`.

### Matching pipeline (reference-impl)

Nine-stage pipeline in `reference-impl/matching-engine/`:
1. Normalise → 2. Semantic expansion → 3. Constraint check (abort if fail) → 4. Skill scoring → 5. Transferable skill compensation → 6. Preference alignment → 7. Bias detection → 8. Bias correction → 9. Explanation generation

Each stage receives a `PipelineContext` (governance constants, ontology) and a `TraceBuilder`. The trace and explanation are written atomically on completion.

### Database schemas

- `identity` — PII (candidate_identity, candidate_auth) — only `identityDb` can access
- `matching` — transactional hot path (companies, candidate_profiles, job_briefs, match_events, appeals, ghosting_events, etc.)
- `analytical` — append-only (pipeline_traces, fairness_metrics — partitioned by month)
- `audit` — legal/compliance (audit_log, deletion_records, data_subject_requests)
- `config` — governance constants and ontology domains

## Security — mandatory, not optional

### Defence-in-depth for user input (OWASP A03)

**Two layers are always required. Neither alone is sufficient.**

| Layer | Where | What | Tool |
|-------|-------|------|------|
| Rejection | API route, before DB write | Refuse HTML tags in free-text fields | `rejectHtml(value, 'fieldName')` from `api/src/utils/validation.ts` |
| Encoding | HTML page, before innerHTML | Escape `< > & " '` in any value rendered into DOM | `h(value)` — defined in each HTML page's Helpers section |

**Rule**: any time you add or modify an API route that writes free-text from user input, you must call `rejectHtml()` on every free-text field before the INSERT/UPDATE. Any time you write a value into innerHTML on a page, you must wrap it in `h()`.

Client-side `hasHtml()` checks are a UX nicety only — they are not a security control. The API is the security boundary.

### Checklist for any change touching user input

1. **New API route / field**: does the route call `rejectHtml()` for every free-text field before writing to the DB?
2. **New innerHTML render**: does every value from user data or API response go through `h()`?
3. **SQL**: always use postgres.js tagged-template parameters — never string-concatenate into queries.
4. **`onclick` attributes in generated HTML**: escape single quotes with `\'` or use `addEventListener` instead of inline handlers.

### Existing implementations

- `api/src/utils/validation.ts` — `rejectHtml(value, field)` throws `ValidationError` on HTML tag pattern
- `h()` is defined near the top of each `*.html` file's `<script>` block — search for `function h(s)`

## Critical patterns

**JSONB inserts**: Never use `JSON.stringify(value)::jsonb`. Use `app.db.json(value)`.

**Fastify response schemas**: Strip undeclared properties silently. Always declare all nested object properties in route schemas or they will be dropped from responses.

**Fastify version**: Pinned to exact `4.29.1`. All plugins are also pinned. Do not upgrade — v5 has breaking changes.

**Demographic data**: Write-only from the API by design (GDPR Art. 9). There is no GET endpoint that returns raw demographic values.

**Skills ontology IDs**: Use exact IDs from `ontology/skills.json` (e.g. `fhp:skill:machine-learning`, not `fhp:skill:ml`).

**Frontend JS**: Do not use template literals or nested quotes in any scripts that are generated by Python/server-side code. Use `createElement`/`addEventListener` or plain string concatenation.

## Known DB column names (non-obvious)

- `matching.appeals`: `twg_deadline` (not `deadline_twg_review`), `outcome` (not `resolution`), `twg_finding` (not `twg_notes`)
- `matching.match_events`: `overall_score` (not `composite_score`)
- `candidate_demographics`: `last_updated_at` (not `updated_at`)
- `appeal_deadline`: computed as `created_at + INTERVAL '30 days'` — not a stored column

## Known gaps

- MMIL (multi-model inference layer) is deferred — spec at `specs/multi-model-inference-spec.md`
- E2E test gaps requiring infrastructure: bias pipeline (scenarios 10.1–10.11), ghosting via SLA timer (7.5, 8.1, 8.4–8.5), candidate cohorts (13.1–13.2), post-deadline appeals (9.10) — see `tests/e2e/TESTING-SCENARIOS.md`
- No `stage_invitation` notification emitted when active_interaction is created — candidate not notified when matched (scenario 5.8)
- Candidate profile: skill entry should be constrained to ontology IDs (free-text skills break matching)
