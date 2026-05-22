/**
 * Appeals — scenarios 9.1–9.10 from TESTING-SCENARIOS.md.
 *
 * Covers submitting, reading, withdrawing, and validating deadline enforcement.
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
    legal_name:                    `Appeals Test Co ${Date.now()}`,
    jurisdiction:                  'GB',
    compliance_contact_email:      uniqueEmail(),
    password:                      TEST_PASSWORD,
    declared_monthly_roles:        10,
    compliance_agreement_accepted: true,
  });
  companyToken = data.access_token;
  companyId    = data.company_id;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildNotMatchedScenario(jobOverrides: any = {}) {
  // Register a candidate with JavaScript; job requires Python → not_matched
  const { data: reg } = await api('POST', '/v1/auth/register', {
    email: uniqueEmail(), password: TEST_PASSWORD,
    age_confirmed: true, terms_accepted: true,
  });
  const token: string = reg.access_token;

  await api('PUT', '/v1/candidates/me', {
    skills: [{ ontology_id: 'fhp:skill:javascript', label: 'JavaScript', domain: 'Engineering',
               proficiency: 'proficient', years_experience: 3 }],
    preferences: { work_mode: ['remote'], employment_type: ['permanent'] },
  }, token);

  const { data: job } = await api('POST', '/v1/jobs', {
    title:            jobOverrides.title ?? 'Appeals Test Role',
    role_summary:     'Test role for appeal scenarios.',
    skills_required:  [{
      ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
      requirement_type: 'must_have', min_proficiency: 'practitioner',
    }],
    salary_currency: 'GBP', salary_minimum: 50000, salary_maximum: 80000,
    work_mode: 'remote', location_country: 'GB', employment_type: 'permanent',
    attest_no_degree_requirement: true, attest_no_institution_preference: true,
    attest_no_graduation_year_filter: true, attest_no_unpaid_work: true,
    ...jobOverrides,
  }, companyToken);

  const { data: match } = await api('POST', '/v1/matches', { job_id: job.job_id }, token);
  expect(match.decision).toBe('not_matched');

  return { token, match, jobId: job.job_id as string };
}

async function buildMatchedScenario(jobTitle = 'Matched Appeal Test') {
  // Register a candidate who will match (Python proficient)
  const { data: reg } = await api('POST', '/v1/auth/register', {
    email: uniqueEmail(), password: TEST_PASSWORD,
    age_confirmed: true, terms_accepted: true,
  });
  const token: string = reg.access_token;

  await api('PUT', '/v1/candidates/me', {
    skills: [{ ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
               proficiency: 'proficient', years_experience: 4 }],
    preferences: { salary_min: 50000, salary_currency: 'GBP', work_mode: ['remote'] },
  }, token);

  const { data: job } = await api('POST', '/v1/jobs', {
    title: jobTitle, role_summary: 'Matched test.',
    skills_required: [{ ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
                        requirement_type: 'must_have', min_proficiency: 'practitioner' }],
    salary_currency: 'GBP', salary_minimum: 50000, salary_maximum: 80000,
    work_mode: 'remote', location_country: 'GB', employment_type: 'permanent',
    attest_no_degree_requirement: true, attest_no_institution_preference: true,
    attest_no_graduation_year_filter: true, attest_no_unpaid_work: true,
  }, companyToken);

  const { data: match } = await api('POST', '/v1/matches', { job_id: job.job_id }, token);
  expect(match.decision).toBe('matched');

  return { token, match, jobId: job.job_id as string };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Appeals', () => {

  test('candidate submits appeal for not_matched decision', async () => {
    const { token, match } = await buildNotMatchedScenario({ title: 'Submit Appeal Test' });

    const { status, data } = await api('POST', '/v1/candidates/me/appeals', {
      match_id: match.match_id,
      ground:   'incorrect_skill_assessment',
      detail:   'I have Python experience not reflected in the ontology mapping.',
    }, token);

    expect(status).toBe(201);
    expect(data).toHaveProperty('appeal_id');
    expect(data.status).toBe('submitted');
    expect(data.match_id).toBe(match.match_id);
    expect(data.ground).toBe('incorrect_skill_assessment');
  });

  test('submitted appeal appears in GET /candidates/me/appeals list', async () => {
    const { token, match } = await buildNotMatchedScenario({ title: 'List Appeals Test' });

    const { data: submitted } = await api('POST', '/v1/candidates/me/appeals', {
      match_id: match.match_id,
      ground:   'preference_mismatch',
      detail:   'The salary range was a better fit than the algorithm calculated.',
    }, token);
    const appealId: string = submitted.appeal_id;

    const { status, data } = await api('GET', '/v1/candidates/me/appeals', undefined, token);

    expect(status).toBe(200);
    const found = (data.appeals ?? data).find((a: any) => a.appeal_id === appealId);
    expect(found, 'submitted appeal must appear in list').toBeDefined();
    expect(found.status).toBe('submitted');
  });

  test('appeal detail accessible via GET /candidates/me/appeals/:id', async () => {
    const { token, match } = await buildNotMatchedScenario({ title: 'Appeal Detail Test' });

    const { data: submitted } = await api('POST', '/v1/candidates/me/appeals', {
      match_id: match.match_id,
      ground:   'suspected_bias',
      detail:   'I believe demographic factors may have influenced the decision.',
    }, token);
    const appealId: string = submitted.appeal_id;

    const { status, data } = await api(
      'GET', `/v1/candidates/me/appeals/${appealId}`, undefined, token,
    );

    expect(status).toBe(200);
    expect(data.appeal_id).toBe(appealId);
    expect(data.ground).toBe('suspected_bias');
    expect(data.status).toBe('submitted');
    expect(data).toHaveProperty('created_at');
  });

  test('candidate can withdraw a submitted appeal', async () => {
    const { token, match } = await buildNotMatchedScenario({ title: 'Withdraw Appeal Test' });

    const { data: submitted } = await api('POST', '/v1/candidates/me/appeals', {
      match_id: match.match_id,
      ground:   'incorrect_skill_assessment',
      detail:   'Withdrawing this appeal as the issue has been resolved.',
    }, token);
    const appealId: string = submitted.appeal_id;

    const { status, data } = await api(
      'PUT', `/v1/candidates/me/appeals/${appealId}`,
      { action: 'withdraw' },
      token,
    );

    expect(status).toBe(200);

    // Verify the appeal is now withdrawn
    const { data: detail } = await api(
      'GET', `/v1/candidates/me/appeals/${appealId}`, undefined, token,
    );
    expect(detail.status).toBe('withdrawn');
  });

  test('cannot submit duplicate appeal for the same match', async () => {
    const { token, match } = await buildNotMatchedScenario({ title: 'Dupe Appeal Test' });

    await api('POST', '/v1/candidates/me/appeals', {
      match_id: match.match_id,
      ground:   'incorrect_skill_assessment',
      detail:   'First appeal submission requesting reassessment.',
    }, token);

    const { status, data } = await api('POST', '/v1/candidates/me/appeals', {
      match_id: match.match_id,
      ground:   'preference_mismatch',
      detail:   'Second appeal for same match.',
    }, token);

    expect(status).toBe(409);
    expect(data.error).toMatch(/CONFLICT|DUPLICATE_APPEAL/);
  });

  test('cannot appeal a matched decision', async () => {
    // Matched decisions have appeal_eligible = false
    const { token, match } = await buildMatchedScenario('Cannot Appeal Matched');

    expect(match.explanation?.appeal_eligible).toBe(false);

    const { status, data } = await api('POST', '/v1/candidates/me/appeals', {
      match_id: match.match_id,
      ground:   'incorrect_skill_assessment',
      detail:   'Trying to appeal a matched decision.',
    }, token);

    // Should be rejected — matched decisions cannot be appealed
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  test('appeal deadline is 30 days from match created_at', async () => {
    const { token, match } = await buildNotMatchedScenario({ title: 'Deadline Test' });

    const { data: submitted } = await api('POST', '/v1/candidates/me/appeals', {
      match_id: match.match_id,
      ground:   'incorrect_skill_assessment',
      detail:   'Checking deadline.',
    }, token);

    // The appeal deadline shown in GET /candidates/me/matches is created_at + 30 days
    const { data: history } = await api('GET', '/v1/candidates/me/matches', undefined, token);
    const matchRecord = history.matches.find((m: any) => m.match_id === match.match_id);
    expect(matchRecord, 'match must appear in history').toBeDefined();

    const createdAt = new Date(matchRecord.created_at).getTime();
    const deadline  = new Date(matchRecord.appeal_deadline).getTime();
    const diffDays  = (deadline - createdAt) / (1000 * 60 * 60 * 24);
    expect(Math.round(diffDays)).toBe(30);
  });

  test('appeal is visible to the company via GET /companies/me/appeals', async () => {
    const { token, match } = await buildNotMatchedScenario({ title: 'Company Sees Appeal' });

    const { data: submitted } = await api('POST', '/v1/candidates/me/appeals', {
      match_id: match.match_id,
      ground:   'incorrect_skill_assessment',
      detail:   'Company should see this.',
    }, token);
    const appealId: string = submitted.appeal_id;

    const { status, data } = await api('GET', '/v1/companies/me/appeals', undefined, companyToken);

    expect(status).toBe(200);
    const appeals: any[] = data.appeals ?? data;
    const found = appeals.find((a: any) => a.appeal_id === appealId);
    expect(found, 'company must see the appeal against their job').toBeDefined();
  });

});
