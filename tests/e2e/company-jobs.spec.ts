/**
 * Company job brief management — scenarios 3.1–3.9 from TESTING-SCENARIOS.md.
 *
 * Covers:
 *   POST /v1/jobs                — company creates a job brief
 *   GET  /v1/companies/me/jobs   — authenticated list with match counts
 *   GET  /v1/jobs/:id            — public fetch of an active job
 *   PUT  /v1/jobs/:id            — company updates their job
 *   GET  /v1/jobs/:id/matches    — company sees matches for their job
 *
 * Pure API tests — no browser required.
 */

import { test, expect } from '@playwright/test';
import { uniqueEmail, API_BASE, TEST_PASSWORD } from './helpers.js';

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
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

// ── Shared company ────────────────────────────────────────────────────────────

let companyToken: string;
let companyId: string;

test.beforeAll(async () => {
  const { data } = await api('POST', '/v1/auth/register-company', {
    legal_name:                    `Job Brief Test Co ${Date.now()}`,
    jurisdiction:                  'GB',
    compliance_contact_email:      uniqueEmail(),
    password:                      TEST_PASSWORD,
    declared_monthly_roles:        15,
    compliance_agreement_accepted: true,
  });
  companyToken = data.access_token;
  companyId    = data.company_id;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function activeJobPayload(overrides: any = {}) {
  return {
    title:            overrides.title ?? 'Software Engineer',
    role_summary:     'Build and maintain backend services.',
    skills_required:  [{
      ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
      requirement_type: 'must_have', min_proficiency: 'practitioner',
    }],
    salary_currency:  'GBP',
    salary_minimum:   60000,
    salary_maximum:   90000,
    work_mode:        'remote',
    location_country: 'GB',
    employment_type:  'permanent',
    attest_no_degree_requirement:    true,
    attest_no_institution_preference: true,
    attest_no_graduation_year_filter: true,
    attest_no_unpaid_work:           true,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Company job briefs', () => {

  test('company creates an active job brief (all attestations provided)', async () => {
    const { status, data } = await api('POST', '/v1/jobs', activeJobPayload(), companyToken);

    expect(status).toBe(201);
    expect(data).toHaveProperty('job_id');
    expect(data.status).toBe('active');
    expect(data.title).toBe('Software Engineer');
  });

  test('job without all attestations is created as draft', async () => {
    const { status, data } = await api('POST', '/v1/jobs', activeJobPayload({
      attest_no_degree_requirement: false,
    }), companyToken);

    expect(status).toBe(201);
    expect(data.status).toBe('draft');
  });

  test('GET /companies/me/jobs lists company jobs with match counts', async () => {
    // Create a job to ensure at least one exists
    const { data: created } = await api('POST', '/v1/jobs', activeJobPayload({
      title: 'Jobs List Test Role',
    }), companyToken);
    const jobId: string = created.job_id;

    const { status, data } = await api('GET', '/v1/companies/me/jobs?status=all', undefined, companyToken);

    expect(status).toBe(200);
    expect(Array.isArray(data.jobs)).toBe(true);
    expect(typeof data.total).toBe('number');

    const found = data.jobs.find((j: any) => j.job_id === jobId);
    expect(found, 'created job must appear in list').toBeDefined();
    expect(typeof found.total_candidates).toBe('number');
    expect(typeof found.matched_count).toBe('number');
  });

  test('GET /v1/jobs/:id (no auth) returns active job', async () => {
    const { data: created } = await api('POST', '/v1/jobs', activeJobPayload({
      title: 'Public Fetch Test Role',
    }), companyToken);
    const jobId: string = created.job_id;

    const { status, data } = await api('GET', `/v1/jobs/${jobId}`);

    expect(status).toBe(200);
    expect(data.job_id).toBe(jobId);
    expect(data.title).toBe('Public Fetch Test Role');
  });

  test('GET /v1/jobs/:id returns 404 for draft job', async () => {
    const { data: created } = await api('POST', '/v1/jobs', activeJobPayload({
      attest_no_degree_requirement: false,
    }), companyToken);
    const jobId: string = created.job_id;

    // Draft jobs must not be publicly visible
    const { status } = await api('GET', `/v1/jobs/${jobId}`);
    expect(status).toBe(404);
  });

  test('GET /v1/jobs/:id returns 404 for unknown id', async () => {
    const { status } = await api('GET', '/v1/jobs/00000000-0000-0000-0000-000000000000');
    expect(status).toBe(404);
  });

  test('PUT /v1/jobs/:id updates the job title', async () => {
    const { data: created } = await api('POST', '/v1/jobs', activeJobPayload({
      title: 'Original Title',
    }), companyToken);
    const jobId: string = created.job_id;

    const { status, data } = await api('PUT', `/v1/jobs/${jobId}`, {
      title: 'Updated Title',
    }, companyToken);

    expect(status).toBe(200);
    expect(data.title).toBe('Updated Title');
    expect(data.job_id).toBe(jobId);
  });

  test('PUT /v1/jobs/:id partial update preserves other fields', async () => {
    const payload = activeJobPayload({ title: 'Partial Update Test' });
    const { data: created } = await api('POST', '/v1/jobs', payload, companyToken);
    const jobId: string = created.job_id;

    await api('PUT', `/v1/jobs/${jobId}`, { title: 'New Title Only' }, companyToken);

    // Fetch via company jobs list and verify other fields preserved
    const { data } = await api('GET', `/v1/companies/me/jobs?status=all`, undefined, companyToken);
    const job = data.jobs.find((j: any) => j.job_id === jobId);
    expect(job.title).toBe('New Title Only');
    expect(job.work_mode).toBe(payload.work_mode);
    expect(Number(job.salary_minimum)).toBe(payload.salary_minimum);
  });

  test('GET /v1/jobs/:id/matches returns match list for company', async () => {
    // Create a job
    const { data: job } = await api('POST', '/v1/jobs', activeJobPayload({
      title: 'Matches List Test Role',
    }), companyToken);
    const jobId: string = job.job_id;

    // Register a candidate and run a match against this job
    const { data: reg } = await api('POST', '/v1/auth/register', {
      email: uniqueEmail(), password: TEST_PASSWORD,
      age_confirmed: true, terms_accepted: true,
    });
    const candidateToken: string = reg.access_token;

    await api('PUT', '/v1/candidates/me', {
      skills: [{ ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
                 proficiency: 'proficient', years_experience: 3 }],
      preferences: { work_mode: ['remote'], employment_type: ['permanent'] },
    }, candidateToken);

    await api('POST', '/v1/matches', { job_id: jobId }, candidateToken);

    // Company fetches matches
    const { status, data } = await api('GET', `/v1/jobs/${jobId}/matches`, undefined, companyToken);

    expect(status).toBe(200);
    expect(Array.isArray(data.matches)).toBe(true);
    expect(data.matches.length).toBeGreaterThanOrEqual(1);

    const match = data.matches[0];
    expect(match).toHaveProperty('match_id');
    expect(match).toHaveProperty('overall_score');
    expect(match).toHaveProperty('decision');
    // Employer view must not expose candidate PII — no candidate_id
    expect(match.candidate_id).toBeUndefined();
  });

  test('GET /companies/me/jobs requires authentication', async () => {
    const { status } = await api('GET', '/v1/companies/me/jobs');
    expect(status).toBe(401);
  });

  test('salary_maximum < salary_minimum is rejected', async () => {
    const { status, data } = await api('POST', '/v1/jobs', activeJobPayload({
      salary_minimum: 90000,
      salary_maximum: 60000,
    }), companyToken);

    expect(status).toBe(400);
    expect(JSON.stringify(data)).toMatch(/salary/i);
  });

});
