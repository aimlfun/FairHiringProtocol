/**
 * Bias Detection & Correction — scenarios 10.1–10.4
 *
 * Tests that the matching pipeline applies bias correction when a candidate
 * belongs to a demographic cohort with a known fairness breach, and does NOT
 * apply correction when no cohort data is present.
 *
 * Infrastructure required (dev-only test-helpers):
 *   POST /v1/test-helpers/assign-cohorts       — seed candidate_cohorts rows
 *   POST /v1/test-helpers/seed-fairness-breach — seed analytical.fairness_metrics breach
 *
 * matches.ts pre-loads these at match time instead of using stubs.
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
    legal_name:                    `Bias Test Co ${Date.now()}`,
    jurisdiction:                  'GB',
    compliance_contact_email:      uniqueEmail(),
    password:                      TEST_PASSWORD,
    declared_monthly_roles:        5,
    compliance_agreement_accepted: true,
  });
  return data.access_token as string;
}

async function createJob(companyToken: string) {
  const { data } = await api('POST', '/v1/jobs', {
    title:           'Python Engineer',
    role_summary:    'Building data pipelines and API services.',
    skills_required: [{
      ontology_id:      'fhp:skill:python',
      label:            'Python',
      domain:           'Engineering',
      requirement_type: 'must_have',
      min_proficiency:  'practitioner',
    }],
    salary_currency:   'GBP',
    salary_minimum:    50000,
    salary_maximum:    80000,
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
      salary_min:         50000,
      salary_currency:    'GBP',
      work_mode:          ['remote'],
      employment_type:    ['permanent'],
      location_countries: ['GB'],
    },
  }, candidateToken);
}

function extractCandidateId(token: string): string {
  // JWT payload is base64url-encoded — decode to get sub/candidateId
  const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  return payload.candidateId as string;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Bias Detection & Correction (10.1–10.4)', () => {

  let companyToken: string;
  let jobId: string;

  // Shared cohort ID used across tests in this group
  const BREACHED_COHORT_ID = 'cohort:age_group:F';
  let breachSeeded = false;

  test.beforeAll(async () => {
    companyToken = await registerCompany();
    jobId        = await createJob(companyToken);

    // Seed a platform-level DIR breach for the age_group:F cohort (once)
    const { status } = await api('POST', '/v1/test-helpers/seed-fairness-breach', {
      cohort_id:   BREACHED_COHORT_ID,
      dir_value:   0.375,   // 0.375 < 0.80 lower bound → breach
      scope_level: 'platform',
    });
    breachSeeded = status === 201;
  });

  // ── 10.1: Bias correction fires for a candidate in a breached cohort ─────

  test('10.1 — candidate in breached cohort receives bias correction', async () => {
    if (!breachSeeded) test.fail(true, 'Fairness breach seeding failed — skipping dependent test');

    const candidateToken = await registerCandidate();
    const candidateId    = extractCandidateId(candidateToken);
    await buildMatchableProfile(candidateToken);

    // Assign candidate to the breached cohort
    await api('POST', '/v1/test-helpers/assign-cohorts', {
      candidate_id: candidateId,
      cohorts: [{ characteristic: 'age_group', cohort_id: BREACHED_COHORT_ID }],
    });

    // Run the pipeline
    const { status, data } = await api('POST', '/v1/matches', { job_id: jobId }, candidateToken);
    expect(status).toBe(201);

    // Bias correction should have fired (constraint-passing candidate in breached cohort)
    const biasAssessment = data.explanation?.bias_assessment ?? data.bias_assessment ?? {};
    expect(biasAssessment.triggered, 'bias_assessment.triggered must be true for cohort with DIR breach').toBe(true);
  });

  // ── 10.2: bias_correction_triggered stored on match_event ─────────────────

  test('10.2 — bias_correction_triggered flag is true in match history', async () => {
    if (!breachSeeded) test.fail(true, 'Fairness breach seeding failed — skipping dependent test');

    const candidateToken = await registerCandidate();
    const candidateId    = extractCandidateId(candidateToken);
    await buildMatchableProfile(candidateToken);

    await api('POST', '/v1/test-helpers/assign-cohorts', {
      candidate_id: candidateId,
      cohorts: [{ characteristic: 'age_group', cohort_id: BREACHED_COHORT_ID }],
    });

    const { data: matchData } = await api('POST', '/v1/matches', { job_id: jobId }, candidateToken);
    const matchId = matchData.match_id as string;

    // Retrieve the match from history
    const { status, data } = await api('GET', `/v1/candidates/me/matches/${matchId}`, undefined, candidateToken);
    expect(status).toBe(200);

    // bias_correction_triggered is stored on the match event
    expect(data.bias_correction_triggered).toBe(true);
  });

  // ── 10.3: biasCorrectionDelta non-zero in explanation ─────────────────────

  test('10.3 — biasCorrectionDelta reflects upward correction in explanation', async () => {
    if (!breachSeeded) test.fail(true, 'Fairness breach seeding failed — skipping dependent test');

    const candidateToken = await registerCandidate();
    const candidateId    = extractCandidateId(candidateToken);
    await buildMatchableProfile(candidateToken);

    await api('POST', '/v1/test-helpers/assign-cohorts', {
      candidate_id: candidateId,
      cohorts: [{ characteristic: 'age_group', cohort_id: BREACHED_COHORT_ID }],
    });

    const { data } = await api('POST', '/v1/matches', { job_id: jobId }, candidateToken);

    const biasAssessment = data.explanation?.bias_assessment ?? data.bias_assessment ?? {};
    expect(biasAssessment.triggered).toBe(true);
    // correctionApplied documents the metric and direction
    expect(biasAssessment.correctionApplied).toBeDefined();
    expect(biasAssessment.correctionApplied.direction).toBe('upward');
    expect(biasAssessment.correctionApplied.magnitude).toBeGreaterThan(0);
  });

  // ── 10.4: No bias triggered for candidate without cohort data ─────────────

  test('10.4 — no bias correction for candidate with no cohort data', async () => {
    const candidateToken = await registerCandidate();
    await buildMatchableProfile(candidateToken);

    // Deliberately do NOT assign any cohorts

    const { status, data } = await api('POST', '/v1/matches', { job_id: jobId }, candidateToken);
    expect(status).toBe(201);

    const biasAssessment = data.explanation?.bias_assessment ?? data.bias_assessment ?? {};
    // No cohort data → no metrics to evaluate → triggered=false
    expect(biasAssessment.triggered).toBe(false);
    expect(biasAssessment.correctionApplied).toBeUndefined();
  });

});

// ── Item 1: DEFAULT partition coverage ────────────────────────────────────────
// analytical.fairness_metrics is partitioned by month. The defined monthly
// partitions only go up to 2026-03; rows for the current month land in DEFAULT.
// This describe is isolated so the INSERT doesn't affect the ORDER BY computed_at
// DESC LIMIT 1 read in matches.ts that tests 10.1–10.4 depend on.

test.describe('Infrastructure: analytical.fairness_metrics DEFAULT partition (item 1)', () => {

  test('seed-fairness-breach INSERT commits to DEFAULT partition for the current month', async () => {
    const { status, data } = await api('POST', '/v1/test-helpers/seed-fairness-breach', {
      cohort_id:   'cohort:age_group:G', // cohort not used in any other test — no interference
      dir_value:   0.6,
      scope_level: 'platform',
    });
    // 201 means the INSERT committed; DEFAULT partition exists and is writable
    expect(status).toBe(201);
    expect(typeof data.audit_id).toBe('string');
  });

});
