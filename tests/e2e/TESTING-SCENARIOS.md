# FHP E2E Testing Scenarios

Status legend: ✅ covered · ❌ not yet tested · ⚠️ partially covered

---

## 1. Authentication & Session

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 1.1 | Candidate registers — redirected to candidate-app, token in sessionStorage | ✅ | auth.spec.ts |
| 1.2 | Email field auto-focused when modal opens | ✅ | auth.spec.ts |
| 1.3 | Register with blank email — validation error | ✅ | auth.spec.ts |
| 1.4 | Register with blank password — validation error | ✅ | auth.spec.ts |
| 1.5 | Register with password < 12 chars — error shown | ✅ | auth.spec.ts |
| 1.6 | Register without accepting terms — error shown | ✅ | auth.spec.ts |
| 1.7 | Login with wrong password — error shown | ✅ | auth.spec.ts |
| 1.8 | Login with correct credentials — token issued | ✅ | auth.spec.ts |
| 1.9 | Token refresh — POST /auth/refresh issues new access token | ✅ | auth-gaps.spec.ts |
| 1.10 | Logout — DELETE /auth/logout invalidates refresh token | ✅ | auth-gaps.spec.ts |
| 1.11 | Accessing candidate-app with no token redirects to landing page | ❌ | — |
| 1.12 | Company registers — status active when compliance_agreement_accepted | ✅ | matching-simulation.spec.ts |
| 1.13 | Company login — POST /auth/login-company issues token | ✅ | auth-gaps.spec.ts |
| 1.14 | Company registers without compliance agreement — status pending | ✅ | auth-gaps.spec.ts |
| 1.15 | Company accepts compliance agreement — POST /auth/accept-compliance-agreement | ✅ | auth-gaps.spec.ts |

---

## 2. Candidate Profile

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 2.1 | Skill added + saved persists after reload | ✅ | candidate-profile.spec.ts |
| 2.2 | Skill evidence URL saves and restores | ✅ | candidate-profile.spec.ts |
| 2.3 | Salary minimum saves and restores | ✅ | candidate-profile.spec.ts |
| 2.4 | Job type chip (employment_type) saves and restores | ✅ | candidate-profile.spec.ts |
| 2.5 | Work mode chip saves and restores | ✅ | candidate-profile.spec.ts |
| 2.6 | Invalid evidence URL blocks save | ✅ | candidate-profile.spec.ts |
| 2.7 | Clearing invalid URL re-enables save | ✅ | candidate-profile.spec.ts |
| 2.8 | Valid http/https URLs accepted without error | ✅ | candidate-profile.spec.ts |
| 2.9 | Work history Add role button opens form | ✅ | regression.spec.ts |
| 2.10 | Work schedule chips save and restore | ✅ | regression.spec.ts |
| 2.11 | Right-to-work chips save and restore | ✅ | regression.spec.ts |
| 2.12 | Fresh account — blank slate, no demo data | ✅ | regression.spec.ts |
| 2.13 | Skills via ontology search (fhp:skill:*) accepted | ❌ | — |
| 2.14 | Location country preference saves and restores | ⚠️ | profile-strength.spec.ts (strength only) |
| 2.15 | PUT /me with empty skills array sets matching_eligible to FALSE | ❌ | — |
| 2.16 | PUT /me with skills sets matching_eligible to TRUE | ✅ | matching-simulation.spec.ts |
| 2.17 | DELETE /me pseudonymises account — profile no longer fetchable | ❌ | — |

---

## 3. Profile Strength Widget

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 3.1 | Fresh account starts at 0% | ✅ | profile-strength.spec.ts |
| 3.2 | Tips shown for missing components | ✅ | profile-strength.spec.ts |
| 3.3 | Widget visible on dashboard | ✅ | profile-strength.spec.ts |
| 3.4 | Widget visible on profile tab | ✅ | profile-strength.spec.ts |
| 3.5 | Adding evidence URL increases strength | ✅ | profile-strength.spec.ts |
| 3.6 | Clearing salary minimum decreases strength | ✅ | profile-strength.spec.ts |
| 3.7 | Dashboard and profile widgets show same % | ✅ | profile-strength.spec.ts |
| 3.8 | Adding preferred location increases strength | ✅ | profile-strength.spec.ts |
| 3.9 | Removing last location decreases strength | ✅ | profile-strength.spec.ts |
| 3.10 | Adding evidence URL removes evidence tip | ✅ | profile-strength.spec.ts |

---

## 4. Matching Pipeline — Decisions

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 4.1 | Candidate with matching skills + aligned prefs → `matched` decision | ✅ | matching-simulation.spec.ts, matching-decisions.spec.ts |
| 4.2 | Candidate missing all must-have skills → `not_matched` (constraint abort) | ✅ | matching-decisions.spec.ts |
| 4.3 | Candidate score between BORDERLINE_THRESHOLD and MATCH_THRESHOLD → `borderline` | ✅ | matching-decisions.spec.ts |
| 4.4 | Must-have skill present at required proficiency → skill_score = 1.0 | ✅ | matching-decisions.spec.ts |
| 4.5 | Must-have skill present >1 level below minimum → `not_matched`; 1 level below → partial credit, `borderline` | ✅ | matching-decisions.spec.ts |
| 4.6 | Nice-to-have skill present → score boost above candidate without it | ✅ | matching-decisions.spec.ts |
| 4.7 | Transferable skill compensates for missing nice-to-have (constraint stage aborts on missing must-have before stage 5 runs, so transfer only helps nice-to-have) | ✅ | matching-decisions.spec.ts |
| 4.8 | Salary range overlaps → preference score increases | ✅ | matching-decisions.spec.ts |
| 4.9 | Salary range does not overlap → preference score decreases | ✅ | matching-decisions.spec.ts |
| 4.10 | Work mode matches (remote/remote) → preference score increases | ⚠️ | matching-decisions.spec.ts (tested via full-match score, no isolated comparison) |
| 4.11 | Work mode mismatch (remote/onsite) → `not_matched` constraint abort | ✅ | matching-decisions.spec.ts |
| 4.12 | Employment type mismatch → hard constraint abort, `not_matched` | ✅ | matching-decisions.spec.ts |
| 4.13 | Location match raises score; mismatch is soft penalty (aLocation=0.5), not hard constraint | ✅ | matching-decisions.spec.ts |
| 4.14 | Pipeline returns match_id, decision, score, explanation in response | ✅ | matching-simulation.spec.ts |
| 4.15 | Match ineligible candidate (matching_eligible=false) → 422 error | ✅ | matching-decisions.spec.ts |
| 4.16 | Match against inactive job (draft/non-active status) → 422 JOB_NOT_ACTIVE | ✅ | matching-decisions.spec.ts |
| 4.17 | Duplicate candidate+job within 24h → 409 CONFLICT | ✅ | matching-decisions.spec.ts |
| 4.18 | Pipeline trace accessible via GET /candidates/me/matches/:id/trace | ✅ | matching-decisions.spec.ts |
| 4.19 | Full explanation (plain_language_summary) populated in match response | ⚠️ | matching-decisions.spec.ts (explanation returned; summary field not explicitly asserted) |
| 4.20 | Match appears in GET /candidates/me/matches history | ✅ | matching-simulation.spec.ts |
| 4.21 | Match card renders in candidate-app UI with correct decision + score | ✅ | matching-simulation.spec.ts |
| 4.22 | Company sees the match in GET /jobs/:id/matches | ✅ | company-jobs.spec.ts |
| 4.23 | Match score filter buttons (Matched/Not matched/Borderline) filter cards | ❌ | — |

---

## 5. Notifications

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 5.1 | Candidate receives notification when match decision is `matched` | ✅ | notifications.spec.ts |
| 5.2 | Candidate does NOT receive notification when decision is `not_matched` | ✅ | notifications.spec.ts |
| 5.3 | `unread_count` reflects unread notifications; `unread_only` filter works | ✅ | notifications.spec.ts |
| 5.4 | `unread_count` drops to 0 after mark-all-read | ✅ | notifications.spec.ts |
| 5.5 | Mark single notification read — PUT /notifications/:id/read | ✅ | notifications.spec.ts |
| 5.6 | Mark all notifications read — PUT /notifications/read-all | ✅ | notifications.spec.ts |
| 5.7 | Notification has correct type (`match_result`) and `read_at` null when unread | ✅ | notifications.spec.ts |
| 5.8 | Stage invitation notification delivered when company initiates interaction | ❌ | — |
| 5.9 | Fresh account — notification list empty, unread_count 0 | ✅ | notifications.spec.ts |
| 5.10 | `borderline` decision also creates a notification | ✅ | notifications.spec.ts |
| 5.11 | Bell badge UI shows/hides based on unread count | ❌ | — (API only; no UI test) |

---

## 6. Company Job Briefs

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 6.1 | Company creates job with all 4 attestations → status `active` | ✅ | matching-simulation.spec.ts |
| 6.2 | Job without attestations → not active / error | ✅ | company-jobs.spec.ts |
| 6.3 | GET /jobs/:id — public access, no auth needed | ✅ | company-jobs.spec.ts |
| 6.4 | PUT /jobs/:id — company updates their job | ✅ | company-jobs.spec.ts |
| 6.5 | Company sees their job list via GET /companies/me/jobs | ✅ | company-jobs.spec.ts |
| 6.6 | Company sees match count per job | ✅ | company-jobs.spec.ts |

---

## 7. Company Hiring Interactions (Active Interactions / SLA)

> Tests the `active_interactions` table — currently empty in the database.

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 7.1 | Company initiates stage invitation → creates active_interaction | ❌ | — |
| 7.2 | Candidate accepts stage invitation → interaction status updates | ❌ | — |
| 7.3 | Candidate declines stage invitation → interaction status updates | ❌ | — |
| 7.4 | Company sends structured rejection → rejection event recorded | ❌ | — |
| 7.5 | SLA deadline exceeded → ghosting event created | ❌ | — |
| 7.6 | Company SLA dashboard shows current interactions + deadlines | ❌ | — |
| 7.7 | Company pipeline view shows cross-job run history | ❌ | — |

---

## 8. Ghosting

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 8.1 | Ghosting event recorded when company does not respond within SLA | ❌ | — |
| 8.2 | Candidate sees ghosting events via GET /candidates/me/ghosting | ❌ | — |
| 8.3 | Company sees ghosting history via GET /companies/me/ghosting | ❌ | — |
| 8.4 | Company resolves ghosting event — PUT /companies/me/ghosting/:id | ❌ | — |
| 8.5 | Company disputes ghosting event | ❌ | — |

---

## 9. Appeals

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 9.1 | Candidate submits appeal for a `not_matched` decision | ✅ | appeals.spec.ts |
| 9.2 | Candidate submits appeal for a `borderline` decision | ⚠️ | appeals.spec.ts (borderline is appeal_eligible per matched-test inverse; no dedicated borderline-appeal test) |
| 9.3 | Appeal rejected for a `matched` decision (not appeal_eligible) | ✅ | appeals.spec.ts |
| 9.4 | Appeal appears in candidate's appeal list (GET /candidates/me/appeals) | ✅ | appeals.spec.ts |
| 9.5 | Appeal status is `submitted` immediately after submission | ✅ | appeals.spec.ts |
| 9.6 | Appeal details visible via GET /candidates/me/appeals/:id (incl. created_at) | ✅ | appeals.spec.ts |
| 9.7 | Candidate withdraws appeal — PUT /candidates/me/appeals/:id | ✅ | appeals.spec.ts |
| 9.8 | Appeal visible to company via GET /companies/me/appeals | ✅ | appeals.spec.ts |
| 9.9 | Appeal deadline is created_at + 30 days | ✅ | appeals.spec.ts |
| 9.10 | Submitting appeal after deadline → error | ❌ | — |
| 9.11 | TWG review — governance body sees escalation and can update outcome | ❌ | — |
| 9.12 | Duplicate appeal for same match → 409 | ✅ | appeals.spec.ts |

---

## 10. Bias Detection & Fairness

> The core fair hiring guarantee. Currently no bias-path tests exist.

### 10a. Pipeline-level bias correction

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 10.1 | Candidate whose score is inflated by demographic pattern → correction applied | ❌ | — |
| 10.2 | `bias_correction_triggered` flag set on match_event when correction fires | ❌ | — |
| 10.3 | `biasCorrectionDelta` in explanation reflects the correction amount | ❌ | — |
| 10.4 | No bias triggered for unambiguous skills-based match | ❌ | — |

### 10b. Company selection pattern → disparate impact

> Full scenario: company receives matched candidates, systematically selects only young candidates and rejects older ones → fairness metrics detect disparate impact.

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 10.5 | Company creates job, 5 candidates match (2 older, 3 younger) | ❌ | — |
| 10.6 | Company initiates interaction only with the 3 younger candidates | ❌ | — |
| 10.7 | Company sends rejection to the 2 older candidates | ❌ | — |
| 10.8 | Disparate impact ratio drops below threshold in fairness metrics | ❌ | — |
| 10.9 | Equal opportunity difference flagged in per-job fairness | ❌ | — |
| 10.10 | Company compliance score decreases after biased selection | ❌ | — |
| 10.11 | Governance metrics API reflects the fairness breach | ❌ | — |
| 10.12 | Company submits remediation plan — POST /companies/me/fairness/remediation | ❌ | — |
| 10.13 | Per-job fairness visible via GET /companies/me/fairness/jobs | ❌ | — |

---

## 11. Demographics

> `candidate_demographics` table — currently empty. No e2e tests cover the demographics flow.

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 11.1 | GET /candidates/me/demographics/options returns jurisdiction-specific fields | ✅ | demographics-consent.spec.ts |
| 11.2 | PUT /demographics without prior fairness consent → 403 | ✅ | demographics-consent.spec.ts |
| 11.3 | Candidate records fairness consent (POST /consents), then submits demographics | ✅ | demographics-consent.spec.ts |
| 11.4 | Demographics stored — no GET returning raw values (GDPR Art. 9) | ✅ | demographics-consent.spec.ts (options endpoint has no raw values) |
| 11.5 | DELETE /demographics removes all demographic data | ✅ | demographics-consent.spec.ts |
| 11.6 | Withdrawing fairness consent also prevents future demographic reads | ✅ | demographics-consent.spec.ts |

---

## 12. Consent

> `candidate_consents` table — currently empty. Only consent record dates are tested.

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 12.1 | Consent record created at registration (age + terms timestamps) | ⚠️ | regression.spec.ts (dates only) |
| 12.2 | POST /consents records explicit purpose consent | ✅ | demographics-consent.spec.ts |
| 12.3 | GET /consents returns all recorded consents | ✅ | demographics-consent.spec.ts |
| 12.4 | DELETE /consents/fairness withdraws fairness metric consent | ✅ | demographics-consent.spec.ts |
| 12.5 | Withdrawing consent blocks demographics update | ✅ | demographics-consent.spec.ts |

---

## 13. Candidate Cohorts

> `candidate_cohorts` table — currently empty. Cohorts are computed from pipeline + demographics data.

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 13.1 | Running matches for candidates with demographics populates cohort groupings | ❌ | — |
| 13.2 | Cohort data feeds into per-job disparate impact calculation | ❌ | — |

---

## 14. Transfer Credits

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 14.1 | GET /candidates/me/transfer-credits returns computed credits for candidate's skill set | ❌ | — |
| 14.2 | Transferable skill in candidate profile allows partial must-have satisfaction | ❌ | — |

---

## 15. GDPR / Data Rights

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 15.1 | Data export returns valid JSON with expected top-level keys | ✅ | data-privacy.spec.ts |
| 15.2 | Export filename contains today's date | ✅ | data-privacy.spec.ts |
| 15.3 | Delete account modal opens (not a confirm() prompt) | ✅ | data-privacy.spec.ts |
| 15.4 | Delete modal contains required warning text | ✅ | data-privacy.spec.ts |
| 15.5 | Cancel closes delete modal | ✅ | data-privacy.spec.ts |
| 15.6 | Clicking overlay closes delete modal | ✅ | data-privacy.spec.ts |
| 15.7 | Completing account deletion — profile returns 404 afterwards | ✅ | account-deletion.spec.ts |
| 15.8 | Deleted account cannot log in | ✅ | account-deletion.spec.ts |

---

## 16. Landing Page

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 16.1 | #terms section exists with ToS heading | ✅ | landing-page.spec.ts |
| 16.2 | #privacy section exists with Privacy Policy heading | ✅ | landing-page.spec.ts |
| 16.3 | Footer Terms link → #terms anchor | ✅ | landing-page.spec.ts |
| 16.4 | Footer Privacy link → #privacy anchor | ✅ | landing-page.spec.ts |
| 16.5 | Footer Governance link → governance-dashboard.html | ✅ | landing-page.spec.ts |
| 16.6 | Footer GitHub link → FairHiringProtocol repo | ✅ | landing-page.spec.ts |
| 16.7 | Clicking footer Terms scrolls #terms into view | ✅ | landing-page.spec.ts |
| 16.8 | Clicking footer Privacy scrolls #privacy into view | ✅ | landing-page.spec.ts |

---

## 17. Governance (Read-only public endpoints)

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 17.1 | GET /governance/escalations — returns open escalations | ✅ | governance.spec.ts |
| 17.2 | GET /governance/audit — returns audit log entries | ✅ | governance.spec.ts |
| 17.3 | GET /governance/metrics — returns platform-wide fairness metrics | ✅ | governance.spec.ts |
| 17.4 | GET /governance/summary — platform health KPIs | ✅ | governance.spec.ts |
| 17.5 | GET /governance/fairness/companies — per-company fairness data | ✅ | governance.spec.ts |
| 17.6 | GET /governance/votes — protocol vote history | ✅ | governance.spec.ts |
| 17.7 | GET /governance/proposals — proposal list | ✅ | governance.spec.ts |
| 17.8 | GET /governance/bodies — governance bodies with open item counts | ✅ | governance.spec.ts |
| 17.9 | POST /governance/votes — governance role can record a vote | ❌ | — |

---

## 18. Reference Data & Ontology

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 18.1 | GET /reference/rejection-codes — returns taxonomy | ✅ | reference-ontology.spec.ts |
| 18.2 | GET /ontology/skills?q=python — returns matching skills | ✅ | reference-ontology.spec.ts |
| 18.3 | GET /ontology/domains — returns skill domain list | ✅ | reference-ontology.spec.ts |
| 18.4 | Company public record — GET /companies/:id/public-record | ✅ | reference-ontology.spec.ts |

---

## 19. Company Dashboard (API layer)

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 19.1 | GET /companies/me — returns name, jurisdiction, status, compliance_score | ✅ | company-dashboard.spec.ts |
| 19.2 | GET /companies/me/dashboard — returns fairness, SLA, ghosting KPIs | ✅ | company-dashboard.spec.ts |
| 19.3 | GET /companies/me/sla — SLA KPIs + active interactions with deadline status | ✅ | company-dashboard.spec.ts |
| 19.4 | GET /companies/me/audit — compliance audit log | ✅ | company-dashboard.spec.ts |
| 19.5 | GET /companies/me/sla-by-stage — SLA rate per hiring stage | ✅ | company-dashboard.spec.ts |

---

## 20. Health & Conformance

| # | Scenario | Status | Spec |
|---|----------|--------|------|
| 20.1 | GET /v1/health — returns 200 with status ok | ✅ | health.spec.ts |
| 20.2 | GET /v1/health/conformance — returns FHP conformance declaration | ✅ | health.spec.ts |

---

## Summary

| Category | Total | ✅ Done | ⚠️ Partial | ❌ Not tested |
|----------|-------|---------|-----------|---------------|
| Authentication | 15 | 13 | 0 | 2 |
| Candidate profile | 17 | 13 | 1 | 3 |
| Profile strength | 10 | 10 | 0 | 0 |
| Matching — decisions | 23 | 21 | 1 | 1 |
| Notifications | 11 | 10 | 0 | 1 |
| Company job briefs | 6 | 6 | 0 | 0 |
| Company interactions / SLA | 7 | 0 | 0 | 7 |
| Ghosting | 5 | 0 | 0 | 5 |
| Appeals | 12 | 10 | 1 | 1 |
| Bias detection & fairness | 13 | 0 | 0 | 13 |
| Demographics | 6 | 6 | 0 | 0 |
| Consent | 5 | 4 | 1 | 0 |
| Candidate cohorts | 2 | 0 | 0 | 2 |
| Transfer credits | 2 | 0 | 0 | 2 |
| GDPR / data rights | 8 | 8 | 0 | 0 |
| Landing page | 8 | 8 | 0 | 0 |
| Governance | 9 | 8 | 0 | 1 |
| Reference data & ontology | 4 | 4 | 0 | 0 |
| Company dashboard (API) | 5 | 5 | 0 | 0 |
| Health & conformance | 2 | 2 | 0 | 0 |
| **Total** | **179** | **128** | **4** | **36** |

146 tests passing across 18 spec files (as of 2026-05-22).

---

## Priority order for next iterations

1. **Bias / fairness** (10.1–10.13) — core protocol guarantee; nothing tested yet
2. **Company interactions / SLA** (7.1–7.7) — `active_interactions` table; no test data yet
3. **Ghosting** (8.1–8.5) — depends on interactions data
4. **Remaining auth** (1.11) — UI redirect when no token; low value
5. **Appeals** (9.10) — post-deadline rejection
6. **Matching UI** (4.23) — score filter buttons in candidate-app UI
7. **Candidate cohorts** (13.1, 13.2) — requires demographics + pipeline data
8. **Transfer credits** (14.1, 14.2) — GET /candidates/me/transfer-credits
9. **Governance write** (17.9) — POST /governance/votes; needs governance role token
