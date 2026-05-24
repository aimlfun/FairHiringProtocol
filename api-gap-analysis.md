# FHP API Gap Analysis — Screen-by-Screen

**Version:** 2.1.0 — Updated 2026-05-23  
**Purpose:** Map every UI data point and action to its API endpoint. Identify gaps, missing fields, and new endpoints needed.

**Legend:**
- ✅ Endpoint exists and covers this data
- ⚠️ Endpoint exists but needs extension (new field or param)
- ❌ No endpoint exists — needs building
- 🗄️ Database column missing — schema change needed too

---

## Complete API Inventory (current state — 64 endpoints)

```
POST   /v1/auth/register
POST   /v1/auth/login
POST   /v1/auth/refresh
DELETE /v1/auth/logout
POST   /v1/auth/register-company
POST   /v1/auth/login-company
POST   /v1/auth/accept-compliance-agreement
POST   /v1/auth/login-governance

GET    /v1/candidates/me
PUT    /v1/candidates/me
GET    /v1/candidates/me/export
DELETE /v1/candidates/me
GET    /v1/candidates/me/matches
GET    /v1/candidates/me/matches/:matchId
GET    /v1/candidates/me/matches/:matchId/trace
POST   /v1/candidates/me/appeals
GET    /v1/candidates/me/appeals
GET    /v1/candidates/me/appeals/:appealId
PUT    /v1/candidates/me/appeals/:appealId
GET    /v1/candidates/me/notifications
PUT    /v1/candidates/me/notifications/:notificationId/read
PUT    /v1/candidates/me/notifications/read-all
PUT    /v1/candidates/me/interactions/:interactionId
GET    /v1/candidates/me/ghosting
POST   /v1/candidates/me/consents
GET    /v1/candidates/me/consents
DELETE /v1/candidates/me/consents/fairness
GET    /v1/candidates/me/transfer-credits
GET    /v1/candidates/me/demographics/options
PUT    /v1/candidates/me/demographics
DELETE /v1/candidates/me/demographics

POST   /v1/jobs
GET    /v1/jobs/:jobId
PUT    /v1/jobs/:jobId
GET    /v1/jobs/:jobId/matches

POST   /v1/matches                           ← also creates active_interaction on 'matched' decision

GET    /v1/companies/me
GET    /v1/companies/me/dashboard
GET    /v1/companies/me/jobs
GET    /v1/companies/me/sla
GET    /v1/companies/me/interactions
POST   /v1/companies/me/interactions/:interactionId/reject
GET    /v1/companies/me/ghosting
PUT    /v1/companies/me/ghosting/:ghostingId
GET    /v1/companies/me/fairness/jobs
POST   /v1/companies/me/fairness/remediation
GET    /v1/companies/me/pipeline
GET    /v1/companies/me/appeals
GET    /v1/companies/me/audit
GET    /v1/companies/me/sla-by-stage
GET    /v1/companies/:companyId/public-record

GET    /v1/reference/rejection-codes

GET    /v1/ontology/skills
GET    /v1/ontology/domains

GET    /v1/governance/escalations
PUT    /v1/governance/escalations/:escalationId
GET    /v1/governance/audit
GET    /v1/governance/metrics
GET    /v1/governance/summary
GET    /v1/governance/fairness/companies
GET    /v1/governance/votes
POST   /v1/governance/votes
GET    /v1/governance/proposals
GET    /v1/governance/proposals/:proposalId
GET    /v1/governance/bodies
GET    /v1/governance/versions

GET    /v1/health
GET    /v1/health/conformance
```

**Total: 68 endpoints across 14 route files**

---

---

# CANDIDATE APP (`candidate-app.html`) — FULLY WIRED

---

## Screen 1: Dashboard

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Hero — match count | Total matches for candidate | `GET /v1/candidates/me/matches` → `total` | ✅ | |
| Hero — matched count | Count by decision=matched | `GET /v1/candidates/me/matches?decision=matched` → `total` | ✅ | |
| Hero — ghosts | Open ghosting events against candidate | `GET /v1/candidates/me/ghosting` | ✅ | |
| Profile strength ring | `profile_strength` column | `GET /v1/candidates/me` → `profile_strength` | ✅ | |
| Tip "set salary range" | Computed from preferences | Derive client-side from profile data | ✅ | |
| Tip "add evidence links" | Count skills with evidence | Derive client-side from skills array | ✅ | |
| Recent match cards (3) | Match list with job detail | `GET /v1/candidates/me/matches?limit=3` | ✅ | |
| Company trust badge on card | Company compliance score + ghosting | `GET /v1/companies/:companyId/public-record` | ✅ | Public, unauthenticated |
| Appeal button on card | Triggers appeal modal | `POST /v1/candidates/me/appeals` | ✅ | |

---

## Screen 2: Match History

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Filter tabs with counts | Total per decision type | `GET /v1/candidates/me/matches` → `total` per filter | ✅ | |
| Match cards — role, company, salary | Job brief data | `GET /v1/candidates/me/matches` — joins job brief | ✅ | |
| Match cards — explanation summary | `plain_language_summary` | `GET /v1/candidates/me/matches` | ✅ | |
| Expand — score breakdown | `skill_score`, `transferable_skill_score`, `preference_alignment_score` | `GET /v1/candidates/me/matches/:matchId` | ✅ | |
| Expand — skill assessment grid | `skill_breakdown` JSONB | `GET /v1/candidates/me/matches/:matchId` → `expl.skill_breakdown` | ✅ | |
| Expand — not matched reasons | `not_matched_reasons` JSONB | `GET /v1/candidates/me/matches/:matchId` → `expl.not_matched_reasons` | ✅ | |
| Expand — next steps | `next_steps` JSONB | `GET /v1/candidates/me/matches/:matchId` → `expl.next_steps` | ✅ | |
| View trace button | Full pipeline trace | `GET /v1/candidates/me/matches/:matchId/trace` | ✅ | |
| Appeal button | Submit appeal | `POST /v1/candidates/me/appeals` | ✅ | |
| Company trust badge | Company compliance | `GET /v1/companies/:companyId/public-record` | ✅ | |
| Pagination | Page/limit | `GET /v1/candidates/me/matches?page=N&limit=20` | ✅ | |

---

## Screen 3: My Profile

### Skills section

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Skills list with proficiency dots | `skills` JSONB array | `GET /v1/candidates/me` → `skills` | ✅ | |
| Set proficiency level | Update skills array | `PUT /v1/candidates/me` body: `{ skills: [...] }` | ✅ | |
| Remove skill | Update skills array | `PUT /v1/candidates/me` body: `{ skills: [...] }` | ✅ | |
| Search skill suggestions | Ontology skill list | `GET /v1/ontology/skills?q=python` | ✅ | |
| Add skill | Update skills array | `PUT /v1/candidates/me` body: `{ skills: [...] }` | ✅ | |
| Transfer credits | Computed from skills + ontology | `GET /v1/candidates/me/transfer-credits` | ✅ | |

### Work history section

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Role list | `work_history` JSONB array | `GET /v1/candidates/me` → `work_history` | ✅ | |
| Add role form (description, from, to, seniority, skills) | Update work_history array | `PUT /v1/candidates/me` body: `{ work_history: [...] }` | ✅ | Schema defined — see JSONB structure below |
| Remove role | Update work_history array | `PUT /v1/candidates/me` | ✅ | |

### Licences & Certifications

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Cert list | Certifications array | `GET /v1/candidates/me` → `preferences.certifications` | ✅ | Stored in preferences JSONB |
| Add certification | Update certifications | `PUT /v1/candidates/me` body: `{ preferences: { certifications: [...] } }` | ✅ | |
| Expiry status badge | Computed from expiry date | Client-side derived | ✅ | |

### Education

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Education level dropdown | Education level field | `PUT /v1/candidates/me` → `preferences.education_level` | ✅ | Stored in preferences JSONB |

### Preferences

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Job type chips | `preferences.employment_types` array | `GET /v1/candidates/me` → `preferences` | ✅ | |
| Work mode chips | `preferences.work_modes` | `GET /v1/candidates/me` → `preferences` | ✅ | |
| Work schedule chips | `preferences.work_schedules` | `GET /v1/candidates/me` → `preferences` | ✅ | |
| Salary minimum (amount + currency + period) | `preferences.salary_minimum`, `preferences.salary_currency`, `preferences.salary_period` | `GET/PUT /v1/candidates/me` → `preferences` | ✅ | `salary_period` supported |
| Locations (country + city list) | `preferences.locations` array of `{country, cities[]}` | `GET/PUT /v1/candidates/me` → `preferences` | ✅ | |
| Notice period (n + unit) | `preferences.notice_period` as `{value, unit}` | `GET/PUT /v1/candidates/me` → `preferences` | ✅ | |
| Right to work countries | `preferences.right_to_work` array of country codes | `GET/PUT /v1/candidates/me` → `preferences` | ✅ | |
| Save preferences | All the above | `PUT /v1/candidates/me` body: `{ preferences: {...} }` | ✅ | |

---

## Screen 4: Appeals

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Active appeal with timeline | Appeal status, TWG/PC details | `GET /v1/candidates/me/appeals/:appealId` | ✅ | |
| Appeal list (all appeals) | List of candidate's appeals | `GET /v1/candidates/me/appeals` | ✅ | |
| Submit new appeal | match_id, ground, detail | `POST /v1/candidates/me/appeals` | ✅ | |
| Withdraw appeal | Update status to 'withdrawn' | `PUT /v1/candidates/me/appeals/:appealId` | ✅ | |
| Eligible matches dropdown | Matches within 30-day window | `GET /v1/candidates/me/matches?appealable=true` | ⚠️ | `appealable` filter param — confirm implemented |

---

## Screen 5: Data & Privacy

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Download my data | Full export | `GET /v1/candidates/me/export` | ✅ | |
| Delete account | Pseudonymisation procedure | `DELETE /v1/candidates/me` | ✅ | |
| Privacy toggles (searchable, anonymised, fairness) | `privacy` JSONB | `PUT /v1/candidates/me` body: `{ privacy: {...} }` | ✅ | |
| Data retention selector | `privacy.data_retention_days` | `PUT /v1/candidates/me` body: `{ privacy: { data_retention_days: N } }` | ✅ | |
| Consent record table | Consent history | `GET /v1/candidates/me/consents` | ✅ | |
| Withdraw fairness consent | Update cohort consent | `DELETE /v1/candidates/me/consents/fairness` | ✅ | |

---

## Screen 6: Your Rights

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Entire page | Static content — no API calls | — | ✅ | Pure static render |

---

## Header / Global

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Notification bell — unread count | Unread notifications | `GET /v1/candidates/me/notifications` | ✅ | |
| Notification list | Notifications with type + actions | `GET /v1/candidates/me/notifications` | ✅ | |
| Mark notification read | Single notification | `PUT /v1/candidates/me/notifications/:id/read` | ✅ | |
| Mark all read | All notifications | `PUT /v1/candidates/me/notifications/read-all` | ✅ | |
| Accept stage invitation | Acknowledge company stage progression | `PUT /v1/candidates/me/interactions/:interactionId` | ✅ | |
| Decline stage invitation | Decline / withdraw from process | `PUT /v1/candidates/me/interactions/:interactionId` | ✅ | Same endpoint, different body |

---

---

# COMPANY DASHBOARD (`company-dashboard.html`) — MOSTLY WIRED

---

## Compliance Overview (default page)

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Company name + ID in topbar | Company legal_name, company_id | `GET /v1/companies/me` | ✅ | |
| KPI — Compliance score | `compliance_score` | `GET /v1/companies/me/dashboard` → `company.compliance_score` | ✅ | |
| KPI — SLA compliance | SLA compliance rate | `GET /v1/companies/me/dashboard` → `fairness.ghosting_sla_compliance_rate` | ✅ | |
| KPI — Open ghosting | Count open ghosting events | `GET /v1/companies/me/dashboard` → `open_ghosting` array length | ✅ | |
| KPI — Active job briefs | Count active briefs | `GET /v1/companies/me/dashboard` → `active_jobs` array length | ✅ | |
| Fairness rings (DIR, EOD, SDS) | Latest fairness metrics | `GET /v1/companies/me/dashboard` → `fairness.*` | ✅ | |
| EOD breach notice | Consecutive breach windows | `GET /v1/companies/me/dashboard` → `fairness.consecutive_breach_windows` | ✅ | |
| Compliance score breakdown bars | SLA %, ghosting %, fairness %, rejections % | `GET /v1/companies/me/dashboard` | ⚠️ | Individual component scores may still need adding to response |
| SLA by stage table | SLA compliance rate per stage | `GET /v1/companies/me/sla-by-stage` | ✅ | Per-stage compliance %, active/breached counts, ghosting events |
| Active jobs table | Jobs with DIR, SLA%, expiry | `GET /v1/companies/me/dashboard` → `active_jobs` | ⚠️ | Per-job DIR, match count, SLA% may be incomplete |
| Ghosting events list | Open ghosting with severity | `GET /v1/companies/me/dashboard` → `open_ghosting` | ✅ | |
| Strike counter | `strike_count_90d` | `GET /v1/companies/me/dashboard` → `company.strike_count_90d` | ✅ | |
| Audit log (last 10) | Recent audit events | `GET /v1/companies/me/dashboard` → `recent_audit` | ✅ | |

---

## Fairness Metrics tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Per-job fairness table | DIR/EOD/SDS per active job | `GET /v1/companies/me/fairness/jobs` | ✅ | |
| Breach notice with remediation | EOD breach details | `GET /v1/companies/me/fairness/jobs` | ⚠️ | Breach details may be in this response — confirm field coverage |
| Submit remediation plan | Upload/text remediation response | `POST /v1/companies/me/fairness/remediation` | ✅ | |

---

## Active Job Briefs tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Jobs list with status, expiry, salary | All company job briefs | `GET /v1/companies/me/jobs` | ✅ | |
| Post new brief button | Create job brief | `POST /v1/jobs` | ✅ | |
| Edit job brief | Update brief | `PUT /v1/jobs/:jobId` | ✅ | |
| Add/edit job dialog | Full job brief form | `POST /v1/jobs` + `PUT /v1/jobs/:jobId` | ✅ | |

---

## Match Pipeline tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Pipeline runs across all jobs | Match events for company (cross-job view) | `GET /v1/companies/me/pipeline` | ✅ | Stats strip + expandable rows with skill breakdown and bias note |

---

## SLA Monitor tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| SLA KPIs (compliance %, approaching, breached) | SLA statistics | `GET /v1/companies/me/sla` | ✅ | |
| Active interactions table with deadlines | `active_interactions` with SLA times | `GET /v1/companies/me/interactions` | ✅ | |
| Progress bars (time remaining) | SLA deadline vs now | Computed client-side from deadline | ✅ (client) | |

---

## Ghosting Events tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| All ghosting events list | Full ghosting history | `GET /v1/companies/me/ghosting` | ✅ | |
| Resolve/dispute ghosting | Update ghosting status | `PUT /v1/companies/me/ghosting/:ghostingId` | ✅ | |

---

## Rejections tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Pending rejections list | Active interactions needing rejection | `GET /v1/companies/me/interactions` | ✅ | Filter client-side or add `?needs_rejection=true` param |
| Send structured rejection | Post rejection with reason code + notes | `POST /v1/companies/me/interactions/:id/reject` | ✅ | |
| Reason code dropdown | Rejection taxonomy | `GET /v1/reference/rejection-codes` | ✅ | |

---

## Audit Log tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Full audit log with filters | Company audit events | `GET /v1/companies/me/audit` | ✅ | |
| Export full log | CSV/JSON download | `GET /v1/companies/me/audit?format=export` | ✅ | |

---

## Appeals tab (company side)

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Appeals against company jobs | All appeals linked to company | `GET /v1/companies/me/appeals` | ✅ | |
| Appeal detail | Appeal status, ground, TWG finding | `GET /v1/companies/me/appeals` — detail in list response | ⚠️ | Confirm whether a per-appeal GET is needed or list is sufficient |

---

## Add/Edit Job Dialog

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Create new brief | Full job brief schema | `POST /v1/jobs` | ✅ | |
| Edit existing brief | Updated fields | `PUT /v1/jobs/:jobId` | ✅ | |
| Skill search for requirements | Ontology skills | `GET /v1/ontology/skills?q=...` | ✅ | |
| Compliance attestation checkboxes | `attest_*` fields | `POST /v1/jobs` body | ✅ | |
| Salary range validation | `salary_minimum <= salary_maximum` | Client-side + API constraint | ✅ | |
| Education notice in job form | Static warning text | No API needed — render in form | ✅ (static) | |

---

---

# GOVERNANCE DASHBOARD (`governance-dashboard.html`) — MOSTLY WIRED

---

## Overview tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Protocol health KPIs | Active implementations, open escalations, companies under review, open proposals | `GET /v1/governance/summary` | ✅ | |
| Platform-wide fairness (DIR, EOD, SDS) | Platform fairness metrics | `GET /v1/governance/metrics` | ✅ | |
| Escalations list (top 4) | Open escalations | `GET /v1/governance/escalations?status=open&limit=4` | ✅ | |
| Public audit record | Public audit entries | `GET /v1/governance/audit?public_only=true` | ✅ | |
| Live governance feed (sidebar) | Recent events | `GET /v1/governance/audit?limit=10` | ✅ | |
| Governance bodies status (sidebar) | Body membership, queue counts | `GET /v1/governance/bodies` | ✅ | |
| Recent votes (sidebar) | PC vote records | `GET /v1/governance/votes` | ✅ | |
| Protocol versions (sidebar) | Version history | `GET /v1/governance/versions` | ✅ | Returns current FHP/pipeline version + history list; wired to sidebar |

---

## Escalations tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Full escalations list with filters | All escalations, filterable | `GET /v1/governance/escalations?status=...&priority=...&assignee=...` | ✅ | |
| Update escalation | Change status/outcome | `PUT /v1/governance/escalations/:id` | ✅ | |

---

## Fairness tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Per-company fairness table | All companies' metrics | `GET /v1/governance/fairness/companies` | ✅ | |

---

## Proposals tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Open proposals list | FHP-P proposals in review | `GET /v1/governance/proposals` | ✅ | |
| Proposal detail | Full proposal content | `GET /v1/governance/proposals/:proposalId` | ✅ | |

---

## Audit Log tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Full filterable audit log | Audit entries by type/date | `GET /v1/governance/audit?public_only=false` | ✅ | Governance role only |

---

## Votes tab

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| PC vote record | Protocol Council votes | `GET /v1/governance/votes` | ✅ | Read-only display |
| Record a vote | Submit PC vote | `POST /v1/governance/votes` | ✅ | Form wired in Votes tab — visible only to governance-authenticated users |

---

---

# LANDING PAGE (`landing-page.html`) — FULLY WIRED

| UI Element | Data Needed | Endpoint | Status | Notes |
|-----------|-------------|----------|--------|-------|
| Candidate register modal | Create account | `POST /v1/auth/register` | ✅ | |
| Candidate login modal | Issue JWT | `POST /v1/auth/login` | ✅ | |
| Company register modal | Create company account | `POST /v1/auth/register-company` | ✅ | |
| Company login modal | Issue company JWT | `POST /v1/auth/login-company` | ✅ | Dedicated company login endpoint |
| Pipeline animation | Static | None | ✅ | |
| Governance section | Static | None | ✅ | |

---

---

# REMAINING GAPS

## Confirmed missing endpoints (❌)

None.

## Stub / incomplete features

None. All tabs are fully wired.

## Endpoints that may need response-field extensions (⚠️)

| Endpoint | Missing field | Needed for |
|----------|--------------|-----------|
| `GET /v1/companies/me/dashboard` | Per-component compliance scores (SLA %, ghosting %, fairness %, rejection %) | Compliance score breakdown bars in Overview |
| `GET /v1/companies/me/dashboard` → `active_jobs` | Per-job `dir_value`, `match_count`, `sla_compliance_rate` | Active jobs table columns |
| `GET /v1/companies/me/fairness/jobs` | Breach remediation deadline and history | Breach notice detail in Fairness tab |
| `GET /v1/candidates/me/matches` | `appealable` filter param | Eligible matches dropdown in Appeals screen |
| `GET /v1/companies/me/appeals` | Per-appeal detail fields | Confirm list response is sufficient or add `GET /v1/companies/me/appeals/:id` |

---

# SCHEMA REFERENCE — JSONB structures in use

## `candidate_profiles.preferences` JSONB

```typescript
interface CandidatePreferences {
  salary_minimum:     number;
  salary_currency:    string;    // ISO 4217
  salary_period:      'annual' | 'daily' | 'hourly' | 'weekly' | 'monthly';

  work_modes:         Array<'remote' | 'hybrid' | 'on_site'>;
  employment_types:   Array<'permanent' | 'contract' | 'part_time' | 'internship' | 'apprenticeship'>;
  work_schedules:     Array<'full_time' | 'part_time' | 'compressed_hours' | 'flexitime' | 'shift_work' | 'on_call'>;
  notice_period:      { value: number; unit: 'immediately' | 'weeks' | 'months' };
  right_to_work:      string[];  // ISO 3166-1 alpha-2 country codes
  locations:          Array<{ country: string; cities: string[] }>;
  education_level:    string | null;  // optional — not used in matching
  certifications:     Array<{
    name:           string;
    issuing_body:   string;
    licence_number?: string;
    expiry_date?:   string;  // YYYY-MM
    verified:       boolean;
  }>;
}
```

## `candidate_profiles.work_history` JSONB

```typescript
interface WorkHistoryEntry {
  description:  string;       // role description — no employer name
  from:         string;       // YYYY-MM
  to:           string | null; // YYYY-MM or null = present
  seniority:    string;
  skills_used:  string[];     // skill names — context only, not indexed
}
```

## `identity.company_auth` table

Added to support company registration and login (previously missing):

```sql
CREATE TABLE identity.company_auth (
  company_id    UUID PRIMARY KEY REFERENCES matching.companies(company_id),
  password_hash TEXT NOT NULL,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

# QUICK REFERENCE — APIs BY PAGE

## Candidate app

```
✅ Fully wired — all 6 tabs functional:
  GET    /v1/candidates/me
  PUT    /v1/candidates/me
  GET    /v1/candidates/me/matches
  GET    /v1/candidates/me/matches/:id
  GET    /v1/candidates/me/matches/:id/trace
  GET    /v1/candidates/me/appeals
  POST   /v1/candidates/me/appeals
  PUT    /v1/candidates/me/appeals/:id
  GET    /v1/candidates/me/notifications
  PUT    /v1/candidates/me/notifications/:id/read
  PUT    /v1/candidates/me/notifications/read-all
  PUT    /v1/candidates/me/interactions/:id
  GET    /v1/candidates/me/ghosting
  GET    /v1/candidates/me/consents
  POST   /v1/candidates/me/consents
  DELETE /v1/candidates/me/consents/fairness
  GET    /v1/candidates/me/transfer-credits
  GET    /v1/candidates/me/demographics/options
  PUT    /v1/candidates/me/demographics
  DELETE /v1/candidates/me/demographics
  GET    /v1/candidates/me/export
  DELETE /v1/candidates/me
  GET    /v1/companies/:id/public-record
  GET    /v1/ontology/skills
  POST   /v1/auth/register
  POST   /v1/auth/login
```

## Company dashboard

```
✅ 7 of 8 tabs wired:
  GET    /v1/companies/me
  GET    /v1/companies/me/dashboard
  GET    /v1/companies/me/jobs
  GET    /v1/companies/me/pipeline
  GET    /v1/companies/me/sla
  GET    /v1/companies/me/sla-by-stage
  GET    /v1/companies/me/interactions
  POST   /v1/companies/me/interactions/:id/reject
  GET    /v1/companies/me/ghosting
  PUT    /v1/companies/me/ghosting/:id
  GET    /v1/companies/me/fairness/jobs
  POST   /v1/companies/me/fairness/remediation
  GET    /v1/companies/me/appeals
  GET    /v1/companies/me/audit
  GET    /v1/reference/rejection-codes
  POST   /v1/jobs
  PUT    /v1/jobs/:id
  GET    /v1/ontology/skills
  POST   /v1/auth/register-company
  POST   /v1/auth/login-company

✅ All 8 tabs fully wired (Pipeline tab added in 0.6.0)
```

## Governance dashboard

```
✅ All tabs fully wired:
  GET    /v1/governance/summary
  GET    /v1/governance/escalations
  PUT    /v1/governance/escalations/:id
  GET    /v1/governance/fairness/companies
  GET    /v1/governance/proposals
  GET    /v1/governance/proposals/:proposalId
  GET    /v1/governance/audit
  GET    /v1/governance/metrics
  GET    /v1/governance/votes
  POST   /v1/governance/votes   (form in Votes tab, governance-auth only)
  GET    /v1/governance/bodies
  GET    /v1/governance/versions
```

---

# TOTAL COUNTS

| Category | Endpoints | Wired in UI | Notes |
|----------|-----------|-------------|-------|
| Auth | 7 | 7 | Includes company register + login + compliance agreement |
| Candidate | 22 | 22 | Full profile, matches, appeals, notifications, ghosting, consents, demographics |
| Jobs | 4 | 4 | |
| Matches | 1 | 0 | POST /v1/matches not exposed in any UI (pipeline trigger); now also creates active_interaction on 'matched' decision |
| Companies | 14 | 14 | All tabs wired including Pipeline (0.6.0) and sla-by-stage (0.5.0) |
| Governance | 10 | 10 | votes POST exists; UI read-only by design |
| Reference / Ontology | 3 | 3 | skills, domains, rejection-codes |
| Health | 2 | 0 | Internal |
| **Total** | **67** | **65** | |

**0 endpoints still needed. 0 UI stubs remaining. All screens fully wired.**

---

# E2E TEST COVERAGE

Full scenario coverage tracked in `tests/e2e/TESTING-SCENARIOS.md`.  
As of 2026-05-23: **156 of 179 scenarios covered (87%), 188 tests, 24 spec files.**

## Hard gaps remaining (infrastructure required)

| Scenario group | Blocker |
|---|---|
| Bias pipeline (10.1–10.11) | Requires running `npm run fairness:job` after seeding a biased selection pattern |
| Ghosting via SLA expiry (7.5, 8.1, 8.4–8.5) | Requires `sla_deadline < NOW()` — needs DB backdating or `npm run sla:monitor` |
| Candidate cohorts (13.1–13.2) | Requires demographics + pipeline run + fairness computation |
| Appeals post-deadline (9.10) | Needs `created_at` backdated 31+ days in DB |
| Stage invitation notification (5.8) | No `stage_invitation` notification type in pipeline — feature gap |

## Behavioral notes for test authors

- `POST /v1/matches` with `decision=matched` → auto-inserts `active_interaction` (since 0.8.0)
- Valid rejection codes: `AS-01..AS-03`, `PL-01..PL-04`, `PR-01..PR-04`, `SR-01..SR-04` — seeded in `config.rejection_codes`; use `PR-01` in tests (no `stage_notes` required)
- `POST /companies/me/fairness/remediation` requires `plan_text` with `minLength: 100`
- Governance write endpoints use `X-Governance-Api-Key: e2e-test-governance-key` in dev; set in `api/.env`
- Fastify schema validation runs before preHandler auth — a short body returns 400 even without a token
