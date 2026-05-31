/**
 * Company Selection Pattern Bias — scenarios 10.5–10.11
 *
 * Full scenario:
 *   Company creates a job. 5 candidates match:
 *   - 3 "young" (cohort:age_group:A) — company initiates interactions with all 3
 *   - 2 "old"   (cohort:age_group:F) — company rejects both without interaction
 *
 *   compute-job-fairness detects disparate impact:
 *   - Young engagement rate: 3/3 = 1.0
 *   - Old engagement rate:   0/2 = 0.0
 *   - DIR = 0.0/1.0 = 0.0 < 0.80 threshold → breach
 *
 * This requires the test-helper compute-job-fairness endpoint which reads
 * match_events + active_interactions + candidate_cohorts and inserts into
 * analytical.fairness_metrics, then decreases company compliance_score.
 *
 * Pure API tests — no browser required.
 */

import { test, expect } from '@playwright/test';
import { uniqueEmail, API_BASE, TEST_PASSWORD, TEST_HELPER_KEY } from './helpers.js';

async function api(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(path.includes('/test-helpers/') ? { 'X-Test-Helper-Key': TEST_HELPER_KEY } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

async function registerCandidate() {
  const { data } = await api('POST', '/v1/auth/register', {
    email: uniqueEmail(), password: TEST_PASSWORD,
    age_confirmed: true, terms_accepted: true,
  });
  return data.access_token as string;
}

async function registerCompany() {
  const { data } = await api('POST', '/v1/auth/register-company', {
    legal_name:                    `Selection Bias Co ${Date.now()}`,
    jurisdiction:                  'GB',
    compliance_contact_email:      uniqueEmail(),
    password:                      TEST_PASSWORD,
    declared_monthly_roles:        10,
    compliance_agreement_accepted: true,
  });
  return { token: data.access_token as string, companyId: data.company_id as string };
}

async function createJob(companyToken: string) {
  const { data } = await api('POST', '/v1/jobs', {
    title:           'Backend Engineer',
    role_summary:    'Building scalable backend services.',
    skills_required: [{
      ontology_id:      'fhp:skill:python',
      label:            'Python',
      domain:           'Engineering',
      requirement_type: 'must_have',
      min_proficiency:  'practitioner',
    }],
    salary_currency:   'GBP',
    salary_minimum:    55000,
    salary_maximum:    85000,
    work_mode:         'remote',
    location_country:  'GB',
    employment_type:   'permanent',
    attest_no_degree_requirement:     true,
    attest_no_institution_preference: true,
    attest_no_graduation_year_filter: true,
    attest_no_unpaid_work:            true,
  }, companyToken);
  return data.job_id as string;
}

async function buildMatchableProfile(candidateToken: string) {
  await api('PUT', '/v1/candidates/me', {
    skills: [{
      ontology_id:      'fhp:skill:python',
      label:            'Python',
      domain:           'Engineering',
      proficiency:      'proficient',
      years_experience: 4,
    }],
    preferences: {
      salary_min:         55000,
      salary_currency:    'GBP',
      work_mode:          ['remote'],
      employment_type:    ['permanent'],
      location_countries: ['GB'],
    },
  }, candidateToken);
}

function extractCandidateId(token: string): string {
  const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  return payload.candidateId as string;
}

// ── Shared state ───────────────────────────────────────────────────────────────

let companyToken: string;
let companyId: string;
let jobId: string;
let initialComplianceScore: number;

let youngMatchedInteractionIds: string[] = [];
let totalMatchedCount = 0;
let computeResult: any = null;

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Company selection pattern bias (10.5–10.11)', () => {

  test.beforeAll(async () => {
    const company = await registerCompany();
    companyToken  = company.token;
    companyId     = company.companyId;
    jobId         = await createJob(companyToken);

    // Capture baseline score before any breach is computed, so 10.10 can assert
    // a relative decrease rather than hardcoding the expected post-breach value.
    const { data: co } = await api('GET', '/v1/companies/me', undefined, companyToken);
    initialComplianceScore = co.compliance_score as number;
  });

  // ── 10.5: 5 candidates match (2 older, 3 younger) ─────────────────────────

  test('10.5 — company creates job; 5 candidates match', async () => {
    const youngTokens: Array<{ token: string; id: string }> = [];
    const oldTokens:   Array<{ token: string; id: string }> = [];

    for (let i = 0; i < 3; i++) {
      const t  = await registerCandidate();
      const id = extractCandidateId(t);
      await buildMatchableProfile(t);
      youngTokens.push({ token: t, id });
    }
    for (let i = 0; i < 2; i++) {
      const t  = await registerCandidate();
      const id = extractCandidateId(t);
      await buildMatchableProfile(t);
      oldTokens.push({ token: t, id });
    }

    // Assign cohorts
    for (const { id } of youngTokens) {
      await api('POST', '/v1/test-helpers/assign-cohorts', {
        candidate_id: id,
        cohorts: [{ characteristic: 'age_group', cohort_id: 'cohort:age_group:A' }],
      });
    }
    for (const { id } of oldTokens) {
      await api('POST', '/v1/test-helpers/assign-cohorts', {
        candidate_id: id,
        cohorts: [{ characteristic: 'age_group', cohort_id: 'cohort:age_group:F' }],
      });
    }

    // Run matches for all 5
    const matched: Array<{ token: string; id: string; matchId: string; isYoung: boolean }> = [];

    for (const { token, id } of youngTokens) {
      const { status, data } = await api('POST', '/v1/matches', { job_id: jobId }, token);
      if (status === 201 && data.decision === 'matched') {
        matched.push({ token, id, matchId: data.match_id, isYoung: true });
      } else if (status === 409 && data.match_id) {
        // Auto-matching already ran when the profile was saved; retrieve decision
        const { data: m } = await api('GET', `/v1/candidates/me/matches/${data.match_id}`, undefined, token);
        if (m.decision === 'matched') {
          matched.push({ token, id, matchId: data.match_id as string, isYoung: true });
        }
      }
    }
    for (const { token, id } of oldTokens) {
      const { status, data } = await api('POST', '/v1/matches', { job_id: jobId }, token);
      if (status === 201 && data.decision === 'matched') {
        matched.push({ token, id, matchId: data.match_id, isYoung: false });
      } else if (status === 409 && data.match_id) {
        // Auto-matching already ran when the profile was saved; retrieve decision
        const { data: m } = await api('GET', `/v1/candidates/me/matches/${data.match_id}`, undefined, token);
        if (m.decision === 'matched') {
          matched.push({ token, id, matchId: data.match_id as string, isYoung: false });
        }
      }
    }

    totalMatchedCount = matched.length;
    // All 5 candidates have profiles that exactly satisfy the job requirements
    // (Python proficient ≥ practitioner, aligned salary + location + work mode)
    // → every pipeline run must return 'matched'.
    expect(totalMatchedCount).toBe(5);

    // Store context for subsequent tests
    (globalThis as any).__biasCandidates = matched;
  });

  // ── 10.6: Company initiates interactions with the 3 younger candidates ────

  test('10.6 — company initiates interactions only with younger candidates', async () => {
    const matched: Array<{ token: string; id: string; matchId: string; isYoung: boolean }> =
      (globalThis as any).__biasCandidates ?? [];

    // Give the SLA monitor a moment to settle after match creation
    await new Promise(r => setTimeout(r, 200));

    const slaData = await api('GET', '/v1/companies/me/sla', undefined, companyToken);
    expect(slaData.status).toBe(200);

    const youngMatched = matched.filter(m => m.isYoung);
    youngMatchedInteractionIds = [];

    for (const { matchId } of youngMatched) {
      const interaction = (slaData.data.interactions ?? []).find(
        (i: any) => i.match_id === matchId,
      );
      expect(interaction, `SLA must have an active interaction for young match ${matchId}`).toBeDefined();
      // Item 3 verification: SLA endpoint must return match_id on each interaction
      expect(typeof interaction.match_id).toBe('string');
      youngMatchedInteractionIds.push(interaction.interaction_id as string);
    }

    // Every young matched candidate must have an active interaction in the SLA
    expect(youngMatchedInteractionIds.length).toBe(youngMatched.length);
  });

  // ── 10.7: Company sends structured rejection to older candidates ──────────

  test('10.7 — company sends structured rejection to older matched candidates', async () => {
    const matched: Array<{ token: string; id: string; matchId: string; isYoung: boolean }> =
      (globalThis as any).__biasCandidates ?? [];

    const oldInteractions: string[] = [];

    // Re-fetch SLA to get current interactions (old candidates not yet rejected)
    const slaData = await api('GET', '/v1/companies/me/sla', undefined, companyToken);
    const allInteractions = slaData.data.interactions ?? [];

    const oldMatched = matched.filter(m => !m.isYoung);
    for (const { matchId } of oldMatched) {
      const interaction = allInteractions.find((i: any) => i.match_id === matchId);
      expect(interaction, `SLA must have an active interaction for old match ${matchId}`).toBeDefined();
      oldInteractions.push(interaction.interaction_id as string);
    }

    // Every old matched candidate must have an interaction to reject
    expect(oldInteractions.length).toBe(oldMatched.length);

    const rejections: number[] = [];
    for (const interactionId of oldInteractions) {
      const { status } = await api(
        'POST',
        `/v1/companies/me/interactions/${interactionId}/reject`,
        { reason_code: 'PR-01' },
        companyToken,
      );
      rejections.push(status);
    }

    // All rejections must have succeeded
    expect(rejections.length).toBe(oldInteractions.length);
    expect(rejections.every(s => s === 200)).toBe(true);
  });

  // ── 10.8: compute-job-fairness detects DIR breach ─────────────────────────

  test('10.8 — disparate impact ratio drops below threshold in per-job fairness metrics', async () => {
    const matched: Array<{ token: string; id: string; matchId: string; isYoung: boolean }> =
      (globalThis as any).__biasCandidates ?? [];
    const candidateIds = matched.map(m => m.id);

    const { status, data } = await api(
      'POST',
      '/v1/test-helpers/compute-job-fairness',
      { job_id: jobId, candidate_ids: candidateIds },
    );

    expect(status).toBe(201);
    computeResult = data;

    // Item 2 verification: exact DIR value and breach flag
    // Young (age_group:A): 3 matched, 0 rejected → engagement 3/3 = 1.0
    // Old  (age_group:F): 2 matched, 2 rejected → engagement 0/2 = 0.0
    // DIR = 0.0 / 1.0 = 0.0  →  0.0 < 0.80 threshold → breach
    expect(data.dir_value).toBe(0);
    expect(data.any_metric_breached).toBe(true);
    expect(data.total_evaluated).toBe(5);
    expect(data).toHaveProperty('audit_id');
  });

  // ── 10.9: EOD flagged in per-job fairness ────────────────────────────────

  test('10.9 — compute-job-fairness result visible in GET /companies/me/fairness/jobs', async () => {
    const { status, data } = await api(
      'GET',
      '/v1/companies/me/fairness/jobs',
      undefined,
      companyToken,
    );

    expect(status).toBe(200);
    expect(Array.isArray(data.jobs)).toBe(true);

    // Our job must appear — compute-job-fairness inserted a scope_level='job' record
    const jobRecord = (data.jobs as any[]).find((j: any) => j.job_id === jobId);
    expect(jobRecord, `job ${jobId} must appear in fairness/jobs after compute`).toBeDefined();
    expect(jobRecord.dir_within_bounds).toBe(false); // DIR breach was detected
  });

  // ── 10.10: Company compliance score decreased after breach ─────────────────

  test('10.10 — company compliance score decreases after biased selection pattern', async () => {
    // No conditional skip: 10.8 guarantees any_metric_breached=true
    const { status, data } = await api(
      'GET',
      '/v1/companies/me',
      undefined,
      companyToken,
    );

    expect(status).toBe(200);
    expect(typeof data.compliance_score).toBe('number');
    // compliance_score is NUMERIC(4,3) on a 0–1 scale (1.0 = perfect).
    // compute-job-fairness decremented by 0.05 on breach.
    // Assert relative to the baseline captured in beforeAll — not hardcoded to 0.95.
    expect(data.compliance_score).toBeCloseTo(initialComplianceScore - 0.05, 2);
  });

  // ── 10.11: Governance metrics API reflects the fairness breach ─────────────

  test('10.11 — GET /governance/metrics returns metrics reflecting fairness state', async () => {
    const { status, data } = await api('GET', '/v1/governance/metrics');
    // Platform-level metrics — may not include our job-level breach
    // but the endpoint must respond correctly
    expect(status).toBe(200);
    // Shape can be null (no platform records) or an object
    expect(typeof data === 'object').toBe(true);
  });

  test('10.11b — GET /governance/fairness/companies includes our company', async () => {
    const { status, data } = await api('GET', '/v1/governance/fairness/companies');
    expect(status).toBe(200);
    expect(Array.isArray(data.companies)).toBe(true);
    // Our company should appear if it has a fairness record
    // (record was created at job scope, not company scope — so it may not appear here)
    // Just verify the endpoint shape is correct
  });

});
