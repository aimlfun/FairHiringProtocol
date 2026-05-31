/**
 * Post-deadline appeal rejection — scenario 9.10 from TESTING-SCENARIOS.md.
 *
 * Covers:
 *   An appeal submitted after the 30-day window must be rejected with 422.
 *   Uses POST /v1/test-helpers/create-backdated-match to insert a synthetic
 *   match with created_at set in the past (match_events is immutable — UPDATE
 *   is blocked by the immutability trigger; INSERT with explicit created_at works).
 *
 * Pure API test — no browser required.
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
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    legal_name:                    `Deadline Test Co ${Date.now()}`,
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
    title:           'QA Engineer',
    role_summary:    'Building and maintaining automated quality assurance pipelines.',
    skills_required: [{
      ontology_id:      'fhp:skill:rust',
      label:            'Rust',
      domain:           'Engineering',
      requirement_type: 'must_have',
      min_proficiency:  'practitioner',
    }],
    salary_currency:   'GBP',
    salary_minimum:    45000,
    salary_maximum:    65000,
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

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Post-deadline appeal (9.10)', () => {

  let companyToken: string;
  let jobId: string;

  test.beforeAll(async () => {
    companyToken = await registerCompany();
    jobId        = await createJob(companyToken);
  });

  test('9.10 — appeal after 30-day window returns 422', async () => {
    const candidateToken = await registerCandidate();

    // Create a backdated match (31 days ago) — not_matched is appeal-eligible
    const { status: createStatus, data: createData } = await api(
      'POST', '/v1/test-helpers/create-backdated-match',
      { job_id: jobId, days: 31 },
      candidateToken,
    );
    expect(createStatus).toBe(201);
    const matchId = createData.match_id as string;

    // Attempt to appeal — the 30-day window has expired
    const { status, data } = await api('POST', '/v1/candidates/me/appeals', {
      match_id: matchId,
      ground:   'incorrect_skill_assessment',
      detail:   'I believe my Python proficiency was scored incorrectly based on my project evidence.',
    }, candidateToken);

    expect(status).toBe(422);
    expect(data.error).toBe('APPEAL_WINDOW_EXPIRED');
  });

  test('9.10b — appeal within window succeeds with 29-day-old match', async () => {
    const candidateToken = await registerCandidate();

    // 29 days — still within the 30-day window
    const { status: createStatus, data: createData } = await api(
      'POST', '/v1/test-helpers/create-backdated-match',
      { job_id: jobId, days: 29 },
      candidateToken,
    );
    expect(createStatus).toBe(201);
    const matchId = createData.match_id as string;

    const { status } = await api('POST', '/v1/candidates/me/appeals', {
      match_id: matchId,
      ground:   'incorrect_skill_assessment',
      detail:   'I believe my Python proficiency was scored incorrectly based on my project evidence.',
    }, candidateToken);

    expect(status).toBe(201);
  });

  test('9.10c — create-backdated-match with unknown job → 404', async () => {
    const candidateToken = await registerCandidate();

    const { status } = await api(
      'POST', '/v1/test-helpers/create-backdated-match',
      { job_id: '00000000-0000-0000-0000-000000000000', days: 31 },
      candidateToken,
    );
    expect(status).toBe(404);
  });

  test('9.10d — create-backdated-match requires auth', async () => {
    const { status } = await api(
      'POST', '/v1/test-helpers/create-backdated-match',
      { job_id: '00000000-0000-0000-0000-000000000000', days: 31 },
    );
    expect(status).toBe(401);
  });

  test('9.10e — create-backdated-match requires both fields', async () => {
    const candidateToken = await registerCandidate();

    const { status } = await api(
      'POST', '/v1/test-helpers/create-backdated-match',
      { job_id: '00000000-0000-0000-0000-000000000000' },  // missing days
      candidateToken,
    );
    expect(status).toBe(400);
  });

});
