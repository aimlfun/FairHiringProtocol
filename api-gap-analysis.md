# FHP API Gap Analysis — Screen-by-Screen

**Version:** 1.0.0  
**Purpose:** Map every UI data point and action to its API endpoint. Identify gaps, missing fields, and new endpoints needed.

**Legend:**
- ✅ Endpoint exists and covers this data
- ⚠️ Endpoint exists but needs extension (new field or param)
- ❌ No endpoint exists — needs building
- 🗄️ Database column missing — schema change needed too

---

## Complete API Inventory (what exists today)

```
POST   /v1/auth/register
POST   /v1/auth/login
POST   /v1/auth/refresh
DELETE /v1/auth/logout

GET    /v1/candidates/me
PUT    /v1/candidates/me
GET    /v1/candidates/me/export
DELETE /v1/candidates/me
GET    /v1/candidates/me/matches
GET    /v1/candidates/me/matches/:matchId
GET    /v1/candidates/me/matches/:matchId/trace
POST   /v1/candidates/me/appeals
GET    /v1/candidates/me/appeals/:appealId

POST   /v1/jobs
GET    /v1/jobs/:jobId
PUT    /v1/jobs/:jobId
GET    /v1/jobs/:jobId/matches

POST   /v1/matches

GET    /v1/companies/me
GET    /v1/companies/me/dashboard

GET    /v1/governance/escalations
PUT    /v1/governance/escalations/:escalationId
GET    /v1/governance/audit
GET    /v1/governance/metrics

GET    /v1/health
GET    /v1/health/conformance
```

**Total: 27 endpoints**

---

---

# CANDIDATE APP (`candidate-app.html`)

---

## Screen 1: Dashboard

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Hero — match count (18) | Total matches for candidate | `GET /v1/candidates/me/matches` — check `total` field in response | ✅ | Use `?limit=1` to get just the count cheaply |
| Hero — matched count (7) | Count by decision=matched | `GET /v1/candidates/me/matches?decision=matched` — `total` field | ✅ | |
| Hero — ghosts (0) | Open ghosting events against candidate | ❌ `GET /v1/candidates/me/ghosting` | ❌ | New endpoint needed |
| Profile strength ring (80%) | `profile_strength` column | `GET /v1/candidates/me` → `profile_strength` | ✅ | |
| Tip "set salary range" | Computed from preferences | Derive client-side from profile data | ✅ | |
| Tip "add evidence links" | Count skills with evidence | Derive client-side from skills array | ✅ | |
| Recent match cards (3) | Match list with job detail | `GET /v1/candidates/me/matches?limit=3` | ✅ | |
| Company trust badge on card | Company compliance score + ghosting | ❌ `GET /v1/companies/:companyId/public-record` | ❌ | New endpoint — public, unauthenticated |
| Appeal button on card | Triggers appeal modal | `POST /v1/candidates/me/appeals` | ✅ | |

---

## Screen 2: Match History

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Filter tabs with counts | Total per decision type | `GET /v1/candidates/me/matches` — `total` per filter | ✅ | Need 4 calls or add `counts_by_decision` to response |
| Match cards — role, company, salary | Job brief data | `GET /v1/candidates/me/matches` joins job brief | ✅ | Already joins `jb.title`, `salary_minimum` etc |
| Match cards — explanation summary | `plain_language_summary` | `GET /v1/candidates/me/matches` — included in join | ✅ | |
| Expand — score breakdown | `skill_score`, `transferable_skill_score`, `preference_alignment_score` | `GET /v1/candidates/me/matches/:matchId` | ✅ | |
| Expand — skill assessment grid | `skill_breakdown` JSONB | `GET /v1/candidates/me/matches/:matchId` → `expl.skill_breakdown` | ✅ | |
| Expand — not matched reasons | `not_matched_reasons` JSONB | `GET /v1/candidates/me/matches/:matchId` → `expl.not_matched_reasons` | ✅ | |
| Expand — next steps | `next_steps` JSONB | `GET /v1/candidates/me/matches/:matchId` → `expl.next_steps` | ✅ | |
| View trace button | Full pipeline trace | `GET /v1/candidates/me/matches/:matchId/trace` | ✅ | |
| Appeal button | Submit appeal | `POST /v1/candidates/me/appeals` | ✅ | |
| Company trust badge | Company compliance | ❌ `GET /v1/companies/:companyId/public-record` | ❌ | Same gap as dashboard |
| Pagination | Page/limit | `GET /v1/candidates/me/matches?page=N&limit=20` | ✅ | |

---

## Screen 3: My Profile

### Skills section

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Skills list with proficiency dots | `skills` JSONB array | `GET /v1/candidates/me` → `skills` | ✅ | |
| Set proficiency level | Update skills array | `PUT /v1/candidates/me` body: `{ skills: [...] }` | ✅ | |
| Remove skill | Update skills array | `PUT /v1/candidates/me` body: `{ skills: [...] }` | ✅ | |
| Search skill suggestions | Ontology skill list | ❌ `GET /v1/ontology/skills?q=python` | ❌ | New endpoint — ontology search |
| Add skill | Update skills array | `PUT /v1/candidates/me` body: `{ skills: [...] }` | ✅ | |
| Transfer credits | Computed from skills + ontology | ❌ `GET /v1/candidates/me/transfer-credits` | ❌ | New endpoint — or compute client-side from ontology |

### Work history section

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Role list | `work_history` JSONB array | `GET /v1/candidates/me` → `work_history` | ✅ | |
| Add role form (description, from, to, seniority, skills) | Update work_history array | `PUT /v1/candidates/me` body: `{ work_history: [...] }` | ⚠️ | Work history schema needs to be defined — what fields go in each JSONB object? Currently open-ended |
| Remove role | Update work_history array | `PUT /v1/candidates/me` | ✅ | |

### Licences & Certifications

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Cert list | Certifications array | `GET /v1/candidates/me` → `preferences.certifications` (if stored in preferences JSONB) | ⚠️ | No dedicated certifications field exists — needs adding to preferences JSONB or as a top-level field |
| Add certification | Update certifications | `PUT /v1/candidates/me` body: `{ preferences: { certifications: [...] } }` | ⚠️ | Works if stored in preferences JSONB |
| Expiry status badge | Computed from expiry date | Client-side derived | ✅ | |

### Education

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Education level dropdown | Education level field | `PUT /v1/candidates/me` — needs `education_level` field | ⚠️ | Not a top-level DB column — store in `preferences.education_level` JSONB |

### Preferences

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Job type chips | `preferences.job_types` array | `GET /v1/candidates/me` → `preferences` | ⚠️ | No explicit schema for preferences JSONB — needs defining |
| Work mode chips | `preferences.work_modes` | `GET /v1/candidates/me` → `preferences` | ⚠️ | Same |
| Work schedule chips | `preferences.work_schedules` | `GET /v1/candidates/me` → `preferences` | ⚠️ | **New field — not in current schema spec** |
| Salary minimum (amount + currency + period) | `preferences.salary_minimum`, `preferences.salary_currency`, `preferences.salary_period` | `GET/PUT /v1/candidates/me` → `preferences` | ⚠️ | `salary_period` is new — currently only annual implied |
| Locations (country + city list) | `preferences.locations` array of `{country, cities[]}` | `GET/PUT /v1/candidates/me` → `preferences` | ⚠️ | Currently unstructured — needs schema |
| Notice period (n + unit) | `preferences.notice_period` as `{value, unit}` | `GET/PUT /v1/candidates/me` → `preferences` | ⚠️ | New structured field |
| Right to work countries | `preferences.right_to_work` array of country codes | `GET/PUT /v1/candidates/me` → `preferences` | ⚠️ | New field |
| Save preferences | All the above | `PUT /v1/candidates/me` body: `{ preferences: {...} }` | ✅ | Endpoint exists, schema needs agreeing |

---

## Screen 4: Appeals

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Active appeal with timeline | Appeal status, TWG/PC details | `GET /v1/candidates/me/appeals/:appealId` | ✅ | |
| Appeal list (all appeals) | List of candidate's appeals | ❌ `GET /v1/candidates/me/appeals` | ❌ | Currently only GET by ID exists — need list endpoint |
| Submit new appeal | match_id, ground, detail | `POST /v1/candidates/me/appeals` | ✅ | |
| Withdraw appeal | Update status to 'withdrawn' | ❌ `PUT /v1/candidates/me/appeals/:appealId` | ❌ | No update/withdraw endpoint |
| Eligible matches dropdown | Matches within 30-day window | `GET /v1/candidates/me/matches?appealable=true` | ⚠️ | Add `appealable` filter param |

---

## Screen 5: Data & Privacy

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Download my data | Full export | `GET /v1/candidates/me/export` | ✅ | |
| Delete account | Pseudonymisation procedure | `DELETE /v1/candidates/me` | ✅ | |
| Privacy toggles (searchable, anonymised, fairness) | `privacy` JSONB | `PUT /v1/candidates/me` body: `{ privacy: {...} }` | ✅ | |
| Data retention selector | `privacy.data_retention_days` | `PUT /v1/candidates/me` body: `{ privacy: { data_retention_days: N } }` | ✅ | |
| Consent record table | Consent history | ❌ `GET /v1/candidates/me/consents` | ❌ | New endpoint — or embed in GET /me response |
| Withdraw fairness consent | Update cohort consent | ❌ `DELETE /v1/candidates/me/consents/fairness` | ❌ | New endpoint |

---

## Screen 6: Your Rights

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Entire page | Static content — no API calls | — | ✅ | Pure static render |
| Regulation links | Link targets | Link to spec documents | ✅ | |
| Governance dashboard link | External navigation | Link to governance-dashboard.html | ✅ | |

---

## Header / Global

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Notification bell — unread count | Unread notifications | ❌ `GET /v1/candidates/me/notifications` | ❌ | New endpoint |
| Notification list | Notifications with type + actions | ❌ `GET /v1/candidates/me/notifications` | ❌ | New endpoint |
| Accept stage invitation | Acknowledge company stage progression | ❌ `PUT /v1/candidates/me/interactions/:interactionId` | ❌ | New endpoint |
| Decline stage invitation | Decline / withdraw from process | ❌ `PUT /v1/candidates/me/interactions/:interactionId` | ❌ | Same endpoint, different body |

---

---

# COMPANY DASHBOARD (`company-dashboard.html`)

---

## Compliance Overview (default page)

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Company name + ID in topbar | Company legal_name, company_id | `GET /v1/companies/me` | ✅ | |
| KPI — Compliance score (0.74) | `compliance_score` | `GET /v1/companies/me/dashboard` → `company.compliance_score` | ✅ | |
| KPI — SLA compliance (91%) | SLA compliance rate | `GET /v1/companies/me/dashboard` → `fairness.ghosting_sla_compliance_rate` | ✅ | |
| KPI — Open ghosting (2) | Count open ghosting events | `GET /v1/companies/me/dashboard` → `open_ghosting` array length | ✅ | |
| KPI — Active job briefs (12) | Count active briefs | `GET /v1/companies/me/dashboard` → `active_jobs` array length | ✅ | |
| Fairness rings (DIR, EOD, SDS) | Latest fairness metrics | `GET /v1/companies/me/dashboard` → `fairness.dir_value` etc | ✅ | |
| EOD breach notice | Consecutive breach windows | `GET /v1/companies/me/dashboard` → `fairness.consecutive_breach_windows` | ✅ | |
| Compliance score breakdown bars | SLA %, ghosting %, fairness %, rejections % | `GET /v1/companies/me/dashboard` | ⚠️ | Individual component scores not returned — need adding to response |
| SLA by stage table | SLA compliance rate per stage | ❌ `GET /v1/companies/me/sla-by-stage` | ❌ | New endpoint — aggregate SLA % by hiring stage |
| Active jobs table | Jobs with DIR, SLA%, expiry | `GET /v1/companies/me/dashboard` → `active_jobs` | ⚠️ | Active jobs list returned but missing per-job DIR, match count, SLA% |
| Ghosting events list | Open ghosting with severity | `GET /v1/companies/me/dashboard` → `open_ghosting` | ✅ | |
| Strike counter (1 of 3) | `strike_count_90d` | `GET /v1/companies/me/dashboard` → `company.strike_count_90d` | ✅ | |
| Audit log (last 10) | Recent audit events | `GET /v1/companies/me/dashboard` → `recent_audit` | ✅ | |

---

## Fairness Metrics tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Per-job fairness table | DIR/EOD/SDS per active job | ❌ `GET /v1/companies/me/fairness/jobs` | ❌ | New endpoint |
| Breach notice with remediation | EOD breach details | ❌ `GET /v1/companies/me/fairness/breaches` | ❌ | Or include in fairness metrics endpoint |
| Submit remediation plan | Upload/text remediation response | ❌ `POST /v1/companies/me/fairness/remediation` | ❌ | New endpoint |

---

## Active Job Briefs tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Jobs list with status, expiry, salary | All company job briefs | ❌ `GET /v1/companies/me/jobs` | ❌ | New endpoint — list all briefs |
| Post new brief button | Create job brief | `POST /v1/jobs` | ✅ | |
| Edit job brief | Update brief | `PUT /v1/jobs/:jobId` | ✅ | |
| Add/edit job dialog | Full job brief form | `POST /v1/jobs` + `PUT /v1/jobs/:jobId` | ✅ | Dialog discussed — see below |

---

## Match Pipeline tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Recent pipeline runs | Match events for company | `GET /v1/jobs/:jobId/matches` | ⚠️ | Exists per-job — need cross-job company view |
| Pipeline run detail | Score, decision, duration, bias delta | `GET /v1/jobs/:jobId/matches` → match data | ✅ | |

---

## SLA Monitor tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| SLA KPIs (compliance %, approaching, breached) | SLA statistics | ❌ `GET /v1/companies/me/sla` | ❌ | New endpoint |
| Active interactions table with deadlines | `active_interactions` with SLA times | ❌ `GET /v1/companies/me/interactions` | ❌ | New endpoint |
| Progress bars (time remaining) | SLA deadline vs now | Computed client-side from deadline | ✅ (client) | |

---

## Ghosting Events tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| All ghosting events list | Full ghosting history | ❌ `GET /v1/companies/me/ghosting` | ❌ | New endpoint |
| Resolve/dispute ghosting | Update ghosting status | ❌ `PUT /v1/companies/me/ghosting/:ghostingId` | ❌ | New endpoint |

---

## Rejections tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Pending rejections list | Active interactions needing rejection | ❌ `GET /v1/companies/me/interactions?needs_rejection=true` | ❌ | New param on interactions endpoint |
| Send structured rejection | Post rejection with reason code + notes | ❌ `POST /v1/companies/me/interactions/:id/reject` | ❌ | New endpoint |
| Reason code dropdown | Rejection taxonomy | ❌ `GET /v1/reference/rejection-codes` | ❌ | New endpoint — or static list |

---

## Audit Log tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Full audit log with filters | Company audit events | ❌ `GET /v1/companies/me/audit` | ❌ | New endpoint |
| Export full log | CSV/JSON download | ❌ `GET /v1/companies/me/audit?format=export` | ❌ | New endpoint |

---

## Appeals tab (company side)

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Appeals against company jobs | All appeals linked to company | ❌ `GET /v1/companies/me/appeals` | ❌ | New endpoint |
| Appeal detail | Appeal status, ground, TWG finding | ❌ `GET /v1/companies/me/appeals/:appealId` | ❌ | New endpoint |

---

## Add/Edit Job Dialog (requested)

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Create new brief | Full job brief schema | `POST /v1/jobs` | ✅ | Endpoint exists |
| Edit existing brief | Updated fields | `PUT /v1/jobs/:jobId` | ✅ | Endpoint exists |
| Skill search for requirements | Ontology skills | ❌ `GET /v1/ontology/skills?q=...` | ❌ | Same ontology search gap as candidate side |
| Compliance attestation checkboxes | `attest_*` fields | `POST /v1/jobs` body | ✅ | Fields in DB and API |
| Salary range validation | `salary_minimum <= salary_maximum` | Client-side + API constraint | ✅ | |
| **Education notice in job form** | Static warning text | No API needed — render in form | ✅ (static) | "Degree requirements are prohibited — Equality Act 2010 indirect discrimination" |

---

---

# GOVERNANCE DASHBOARD (`governance-dashboard.html`)

---

## Overview tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Protocol health KPIs (active implementations, open escalations, companies under review, open proposals) | Platform-level counts | ❌ `GET /v1/governance/summary` | ❌ | New endpoint |
| Platform-wide fairness (DIR, EOD, SDS) | Platform fairness metrics | `GET /v1/governance/metrics` | ✅ | |
| Escalations list (top 4) | Open escalations | `GET /v1/governance/escalations?status=open&limit=4` | ✅ | |
| Public audit record | Public audit entries | `GET /v1/governance/audit?public_only=true` | ✅ | |
| Live governance feed (sidebar) | Recent events | `GET /v1/governance/audit?limit=10` | ✅ | |
| Governance bodies status (sidebar) | Body membership, queue counts | ❌ `GET /v1/governance/bodies` | ❌ | New endpoint — or static |
| Recent votes (sidebar) | PC vote records | ❌ `GET /v1/governance/votes` | ❌ | New endpoint |
| Protocol versions (sidebar) | Version history | ❌ `GET /v1/governance/versions` | ❌ | New endpoint — or static |

---

## Escalations tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Full escalations list with filters | All escalations, filterable | `GET /v1/governance/escalations?status=...&priority=...&assignee=...` | ✅ | Filters exist in the endpoint |
| Update escalation | Change status/outcome | `PUT /v1/governance/escalations/:id` | ✅ | |

---

## Fairness tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Per-company fairness table | All companies' metrics | ❌ `GET /v1/governance/fairness/companies` | ❌ | New endpoint |

---

## Proposals tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Open proposals list | FHP-P proposals in review | ❌ `GET /v1/governance/proposals` | ❌ | New endpoint |
| Proposal detail | Full proposal content | ❌ `GET /v1/governance/proposals/:proposalId` | ❌ | New endpoint |

---

## Audit Log tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Full filterable audit log | Audit entries by type/date | `GET /v1/governance/audit?public_only=false` | ✅ | Governance role only |

---

## Votes tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| PC vote record | Protocol Council votes | ❌ `GET /v1/governance/votes` | ❌ | New endpoint |
| Record a vote | Submit PC vote | ❌ `POST /v1/governance/votes` | ❌ | New endpoint |

---

---

# LANDING PAGE (`landing-page.html`)

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Candidate register modal | Create account | `POST /v1/auth/register` | ✅ | |
| Candidate login modal | Issue JWT | `POST /v1/auth/login` | ✅ | |
| Company register modal | Create company account | ❌ `POST /v1/auth/register-company` | ❌ | New endpoint — currently register only creates candidates |
| Company login modal | Issue company JWT | `POST /v1/auth/login` | ⚠️ | Login exists but needs to handle company role |
| Pipeline animation | Static | None | ✅ | |
| Governance section | Static | None | ✅ | |

---

---

# GAP SUMMARY — NEW ENDPOINTS NEEDED

## Priority 1: Core candidate flow (blockers)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/candidates/me/notifications` | GET | Notification bell — unread count + list |
| `/v1/candidates/me/interactions/:id` | PUT | Accept/decline company stage invitation |
| `/v1/candidates/me/appeals` | GET | List all candidate's appeals (currently only GET by ID) |
| `/v1/candidates/me/appeals/:appealId` | PUT | Withdraw an appeal |
| `/v1/candidates/me/ghosting` | GET | Candidate-facing ghosting events (how many ghosts) |
| `/v1/companies/:companyId/public-record` | GET | Company trust score for match cards (public, no auth) |
| `/v1/auth/register-company` | POST | Company registration (distinct from candidate) |

## Priority 2: Profile completeness

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/ontology/skills` | GET | Skill search for profile and job brief forms |
| `/v1/candidates/me/consents` | GET | Consent record table in Data & Privacy |
| `/v1/candidates/me/consents/fairness` | DELETE | Withdraw fairness consent |
| `/v1/candidates/me/transfer-credits` | GET | Transfer credits for profile page (or compute client-side) |

## Priority 3: Company dashboard

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/companies/me/jobs` | GET | List all company job briefs (not just active 10) |
| `/v1/companies/me/sla` | GET | SLA monitor KPIs and active interactions with deadlines |
| `/v1/companies/me/interactions` | GET | All active hiring processes |
| `/v1/companies/me/interactions/:id/reject` | POST | Send structured rejection |
| `/v1/companies/me/ghosting` | GET | Full ghosting event list |
| `/v1/companies/me/ghosting/:id` | PUT | Resolve/dispute a ghosting event |
| `/v1/companies/me/fairness/jobs` | GET | Per-job fairness metrics |
| `/v1/companies/me/fairness/remediation` | POST | Submit remediation plan |
| `/v1/companies/me/appeals` | GET | Appeals against company jobs |
| `/v1/companies/me/audit` | GET | Company audit log |
| `/v1/reference/rejection-codes` | GET | Structured rejection taxonomy |

## Priority 4: Governance dashboard

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/governance/summary` | GET | Protocol health KPIs |
| `/v1/governance/fairness/companies` | GET | Per-company fairness table |
| `/v1/governance/votes` | GET | PC vote record |
| `/v1/governance/votes` | POST | Record a PC vote |
| `/v1/governance/proposals` | GET | FHP-P proposals list |
| `/v1/governance/proposals/:id` | GET | Single proposal detail |

---

# SCHEMA CHANGES NEEDED

These are database/API schema gaps where new fields are required:

## `candidate_profiles.preferences` JSONB — needs agreed structure

```typescript
// Proposed preferences schema
interface CandidatePreferences {
  // Already implied
  salary_minimum:     number;
  salary_currency:    string;    // ISO 4217
  salary_period:      'annual' | 'daily' | 'hourly' | 'weekly' | 'monthly';  // NEW

  // Already implied
  work_modes:         Array<'remote' | 'hybrid' | 'on_site'>;
  employment_types:   Array<'permanent' | 'contract' | 'part_time' | 'internship' | 'apprenticeship'>;

  // NEW
  work_schedules:     Array<'full_time' | 'part_time' | 'compressed_hours' | 'flexitime' | 'shift_work' | 'on_call'>;
  notice_period:      { value: number; unit: 'immediately' | 'weeks' | 'months' };
  right_to_work:      string[];  // Array of ISO 3166-1 alpha-2 country codes
  locations:          Array<{ country: string; cities: string[] }>;
  education_level:    string | null;  // optional, not used in matching
  certifications:     Array<{
    name:           string;
    issuing_body:   string;
    licence_number?: string;
    expiry_date?:   string;  // YYYY-MM
    verified:       boolean;
  }>;
}
```

## `candidate_profiles.work_history` JSONB — needs agreed structure

```typescript
interface WorkHistoryEntry {
  description:  string;   // role description — no employer name
  from:         string;   // YYYY-MM
  to:           string | null;  // YYYY-MM or null = present
  seniority:    string;
  skills_used:  string[];  // free-text skill names — for context only
}
```

## `companies` table — company registration endpoint needs

Company registration currently doesn't exist as a separate endpoint.
`POST /v1/auth/register-company` needs to:
1. Create `identity.candidate_identity`-equivalent for companies (or use a separate auth table)
2. Create `matching.companies` row
3. Issue a company-role JWT (`role: 'company'`, `companyId: uuid`)

Note: The DB has `matching.companies` with a `compliance_contact_email` field.
A company auth table is not in the current schema — needs adding:

```sql
CREATE TABLE identity.company_auth (
  company_id    UUID PRIMARY KEY REFERENCES matching.companies(company_id),
  password_hash TEXT NOT NULL,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

# QUICK REFERENCE — APIs BY SCREEN

## To build the candidate app you need:

```
✅ Already works:
  GET  /v1/candidates/me               → profile, skills, preferences, privacy
  PUT  /v1/candidates/me               → update any profile field
  GET  /v1/candidates/me/matches       → match history list
  GET  /v1/candidates/me/matches/:id   → single match + explanation
  GET  /v1/candidates/me/matches/:id/trace
  POST /v1/candidates/me/appeals       → submit appeal
  GET  /v1/candidates/me/appeals/:id   → appeal status
  GET  /v1/candidates/me/export        → GDPR data export
  DELETE /v1/candidates/me             → pseudonymisation deletion
  POST /v1/auth/register
  POST /v1/auth/login

❌ Need to build (7 endpoints):
  GET  /v1/candidates/me/notifications
  PUT  /v1/candidates/me/interactions/:id
  GET  /v1/candidates/me/appeals        (list, not just by ID)
  PUT  /v1/candidates/me/appeals/:id    (withdraw)
  GET  /v1/candidates/me/ghosting
  GET  /v1/companies/:id/public-record  (trust badge — public)
  GET  /v1/ontology/skills              (skill search)
```

## To build the company dashboard you need:

```
✅ Already works:
  GET  /v1/companies/me
  GET  /v1/companies/me/dashboard       (overview + fairness + ghosting + jobs + audit)
  POST /v1/jobs
  PUT  /v1/jobs/:id
  GET  /v1/jobs/:id/matches

❌ Need to build (11 endpoints):
  POST /v1/auth/register-company
  GET  /v1/companies/me/jobs
  GET  /v1/companies/me/sla
  GET  /v1/companies/me/interactions
  POST /v1/companies/me/interactions/:id/reject
  GET  /v1/companies/me/ghosting
  PUT  /v1/companies/me/ghosting/:id
  GET  /v1/companies/me/fairness/jobs
  POST /v1/companies/me/fairness/remediation
  GET  /v1/companies/me/appeals
  GET  /v1/companies/me/audit
  GET  /v1/reference/rejection-codes
```

## To build the governance dashboard you need:

```
✅ Already works:
  GET  /v1/governance/escalations
  PUT  /v1/governance/escalations/:id
  GET  /v1/governance/audit
  GET  /v1/governance/metrics

❌ Need to build (6 endpoints):
  GET  /v1/governance/summary
  GET  /v1/governance/fairness/companies
  GET  /v1/governance/votes
  POST /v1/governance/votes
  GET  /v1/governance/proposals
  GET  /v1/governance/proposals/:id
```

---

# TOTAL COUNTS

| Category | Existing | New needed | Total |
|----------|----------|-----------|-------|
| Auth | 4 | 1 (company register) | 5 |
| Candidate | 11 | 7 | 18 |
| Jobs | 4 | 0 | 4 |
| Matches | 1 | 0 | 1 |
| Companies | 2 | 11 | 13 |
| Governance | 4 | 6 | 10 |
| Reference / Ontology | 0 | 2 | 2 |
| Health | 2 | 0 | 2 |
| **Total** | **28** | **27** | **55** |

27 new endpoints to build. Most are straightforward reads from tables that already exist. The largest single effort is the company dashboard set (11) — but several are simple queries against `matching.active_interactions`, `matching.ghosting_events`, and `analytical.fairness_metrics` which are already fully populated by the pipeline and SLA monitor.

The most architecturally interesting new piece is **company authentication** — that needs a `company_auth` table and a distinct register/login flow, since companies and candidates are different entities.
