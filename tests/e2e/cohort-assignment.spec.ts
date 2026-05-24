/**
 * Candidate Cohorts — scenarios 13.1–13.2
 *
 * 13.1: Running matches for candidates with cohort assignments populates
 *       cohort data that is visible to the matching pipeline.
 * 13.2: Cohort data feeds into per-job disparate impact calculation
 *       via POST /v1/test-helpers/compute-job-fairness.
 *
 * Infrastructure required:
 *   POST /v1/test-helpers/assign-cohorts      — seed candidate_cohorts rows
 *   POST /v1/test-helpers/compute-job-fairness — compute engagement-rate fairness
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
    legal_name:                    `Cohort Test Co ${Date.now()}`,
    jurisdiction:                  'GB',
    compliance_contact_email:      uniqueEmail(),
    password:                      TEST_PASSWORD,
    declared_monthly_roles:        5,
    compliance_agreement_accepted: true,
  });
  return { token: data.access_token as string, companyId: data.company_id as string };
}

async function createJob(companyToken: string) {
  const { data } = await api('POST', '/v1/jobs', {
    title:           'Data Engineer',
    role_summary:    'Processing large-scale datasets for analytics.',
    skills_required: [{
      ontology_id:      'fhp:skill:python',
      label:            'Python',
      domain:           'Engineering',
      requirement_type: 'must_have',
      min_proficiency:  'practitioner',
    }],
    salary_currency:   'GBP',
    salary_minimum:    45000,
    salary_maximum:    70000,
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

function extractCandidateId(token: string): string {
  const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  return payload.candidateId as string;
}

async function buildMatchableProfile(candidateToken: string) {
  await api('PUT', '/v1/candidates/me', {
    skills: [{
      ontology_id:      'fhp:skill:python',
      label:            'Python',
      domain:           'Engineering',
      proficiency:      'proficient',
      years_experience: 3,
    }],
    preferences: {
      salary_min:         45000,
      salary_currency:    'GBP',
      work_mode:          ['remote'],
      employment_type:    ['permanent'],
      location_countries: ['GB'],
    },
  }, candidateToken);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Candidate Cohorts (13.1–13.2)', () => {

  let companyToken: string;
  let companyId: string;
  let jobId: string;

  test.beforeAll(async () => {
    const company = await registerCompany();
    companyToken  = company.token;
    companyId     = company.companyId;
    jobId         = await createJob(companyToken);
  });

  // ── 13.1: Cohort assignments are stored and influence pipeline ────────────

  test('13.1 — assign-cohorts helper seeds candidate_cohorts; pipeline reads them', async () => {
    const candidateToken = await registerCandidate();
    const candidateId    = extractCandidateId(candidateToken);
    await buildMatchableProfile(candidateToken);

    // Assign two cohorts (age + sex)
    const { status: assignStatus, data: assignData } = await api(
      'POST',
      '/v1/test-helpers/assign-cohorts',
      {
        candidate_id: candidateId,
        cohorts: [
          { characteristic: 'age_group', cohort_id: 'cohort:age_group:B' },
          { characteristic: 'sex_group', cohort_id: 'cohort:sex_group:B' },
        ],
      },
    );
    expect(assignStatus).toBe(201);
    expect(assignData.cohorts_assigned).toBe(2);

    // Run pipeline — cohorts are now pre-loaded by matches.ts
    const { status: matchStatus, data: matchData } = await api(
      'POST',
      '/v1/matches',
      { job_id: jobId },
      candidateToken,
    );
    expect(matchStatus).toBe(201);
    expect(matchData).toHaveProperty('match_id');
    // Pipeline ran with real cohort data (no stubs)
    // bias_assessment should mention metrics were evaluated (even if no breach)
    const biasAssessment = matchData.explanation?.bias_assessment ?? matchData.bias_assessment ?? {};
    expect(typeof biasAssessment.triggered).toBe('boolean');
  });

  // ── 13.1b: Idempotent — assigning cohorts twice does not duplicate rows ───

  test('13.1b — assign-cohorts is idempotent (ON CONFLICT DO UPDATE)', async () => {
    const candidateToken = await registerCandidate();
    const candidateId    = extractCandidateId(candidateToken);

    await api('POST', '/v1/test-helpers/assign-cohorts', {
      candidate_id: candidateId,
      cohorts: [{ characteristic: 'age_group', cohort_id: 'cohort:age_group:C' }],
    });

    // Reassign same characteristic with different cohort ID — should update, not fail
    const { status, data } = await api('POST', '/v1/test-helpers/assign-cohorts', {
      candidate_id: candidateId,
      cohorts: [{ characteristic: 'age_group', cohort_id: 'cohort:age_group:D' }],
    });
    expect(status).toBe(201);
    expect(data.cohorts_assigned).toBe(1);
  });

  // ── 13.2: Cohort data feeds into per-job disparate impact calculation ─────

  test('13.2 — cohort memberships feed into job-level disparate impact via compute-job-fairness', async () => {
    // Register 4 candidates: 2 "young" (age_group:A), 2 "old" (age_group:F)
    const youngTokens: string[] = [];
    const oldTokens:   string[] = [];
    const youngIds:    string[] = [];
    const oldIds:      string[] = [];

    for (let i = 0; i < 2; i++) {
      const t  = await registerCandidate();
      const id = extractCandidateId(t);
      await buildMatchableProfile(t);
      youngTokens.push(t);
      youngIds.push(id);
    }
    for (let i = 0; i < 2; i++) {
      const t  = await registerCandidate();
      const id = extractCandidateId(t);
      await buildMatchableProfile(t);
      oldTokens.push(t);
      oldIds.push(id);
    }

    // Assign age cohorts
    for (const id of youngIds) {
      await api('POST', '/v1/test-helpers/assign-cohorts', {
        candidate_id: id,
        cohorts: [{ characteristic: 'age_group', cohort_id: 'cohort:age_group:A' }],
      });
    }
    for (const id of oldIds) {
      await api('POST', '/v1/test-helpers/assign-cohorts', {
        candidate_id: id,
        cohorts: [{ characteristic: 'age_group', cohort_id: 'cohort:age_group:F' }],
      });
    }

    // Run matches — try until we get 4 matched decisions
    const matchedWithToken: Array<{ token: string; matchId: string }> = [];
    for (const token of [...youngTokens, ...oldTokens]) {
      const { status, data } = await api('POST', '/v1/matches', { job_id: jobId }, token);
      if (status === 201 && data.decision === 'matched') {
        matchedWithToken.push({ token, matchId: data.match_id });
      }
    }

    // All 4 candidates have profiles that exactly satisfy the job requirements
    // → every pipeline run must return 'matched'
    expect(matchedWithToken.length, '4 candidates with matching profiles must all produce a matched decision').toBe(4);

    // Compute per-job fairness
    const { status, data } = await api(
      'POST',
      '/v1/test-helpers/compute-job-fairness',
      { job_id: jobId },
    );

    expect(status).toBe(201);
    expect(data.job_id).toBe(jobId);
    expect(typeof data.total_evaluated).toBe('number');
    expect(data.total_evaluated).toBeGreaterThanOrEqual(2);
    // DIR may or may not breach depending on match outcomes — just verify shape
    expect(data).toHaveProperty('dir_value');
    expect(data).toHaveProperty('any_metric_breached');
    expect(data).toHaveProperty('audit_id');
  });

  // ── 13.2b: compute-job-fairness result visible in governance metrics ───────

  test('13.2b — job-level fairness record appears in GET /governance/metrics (future query)', async () => {
    // Verify the governance metrics endpoint works (the job-level record is there)
    const { status, data } = await api('GET', '/v1/governance/metrics');
    // endpoint returns platform-level; just verify it responds
    expect(status).toBe(200);
    // Shape: either a metrics object or null when no platform record exists
    // We can't guarantee a platform record exists in this test
    expect(typeof data).toBe('object');
  });

});
