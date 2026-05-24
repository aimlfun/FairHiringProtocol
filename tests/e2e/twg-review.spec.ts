/**
 * TWG Review — scenario 9.11
 *
 * Full end-to-end governance review flow:
 *   1. Candidate registers, gets a not_matched decision
 *   2. Submits appeal → auto-creates escalation assigned to TWG
 *   3. GET /governance/escalations — finds the escalation by linked_appeal_id
 *   4. PUT /governance/escalations/:id with GOVERNANCE_API_KEY
 *   5. Verify outcome set to 'upheld' and status 'resolved'
 *
 * Pure API tests — no browser required.
 */

import { test, expect } from '@playwright/test';
import { uniqueEmail, API_BASE, TEST_PASSWORD } from './helpers.js';

const GOV_KEY = 'e2e-test-governance-key';

async function api(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
  govKey?: string,
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token  ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(govKey ? { 'X-Governance-Api-Key': govKey } : {}),
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
    legal_name:                    `TWG Test Co ${Date.now()}`,
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
    title:           'Senior Python Engineer',
    role_summary:    'Building high-performance data pipelines.',
    skills_required: [{
      ontology_id:      'fhp:skill:python',
      label:            'Python',
      domain:           'Engineering',
      requirement_type: 'must_have',
      min_proficiency:  'expert',
    }],
    salary_currency:   'GBP',
    salary_minimum:    80000,
    salary_maximum:    120000,
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

/**
 * Run the pipeline until we get a not_matched decision.
 * Requires a candidate with insufficient skill to pass must_have at expert level.
 */
async function getNotMatchedDecision(jobId: string): Promise<{ candidateToken: string; matchId: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cToken = await registerCandidate();

    // Candidate has Python only at 'aware' — far below expert requirement → not_matched
    await api('PUT', '/v1/candidates/me', {
      skills: [{
        ontology_id:      'fhp:skill:python',
        label:            'Python',
        domain:           'Engineering',
        proficiency:      'aware',
        years_experience: 1,
      }],
      preferences: {
        salary_min: 70000, salary_currency: 'GBP',
        work_mode: ['remote'], employment_type: ['permanent'],
        location_countries: ['GB'],
      },
    }, cToken);

    const { status, data } = await api('POST', '/v1/matches', { job_id: jobId }, cToken);
    if (status !== 201) continue;

    // Pipeline may short-circuit to 'not_matched' or 'borderline' — both are appeal-eligible
    if (data.decision === 'matched') continue; // retry with a different candidate

    return { candidateToken: cToken, matchId: data.match_id as string };
  }
  throw new Error('Could not obtain a not_matched/borderline decision after 5 attempts');
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('TWG review (scenario 9.11)', () => {

  let candidateToken: string;
  let matchId: string;
  let appealId: string;
  let escalationId: string;

  test.beforeAll(async () => {
    const companyToken = await registerCompany();
    const jobId        = await createJob(companyToken);
    const result       = await getNotMatchedDecision(jobId);
    candidateToken     = result.candidateToken;
    matchId            = result.matchId;
  });

  test('9.11a — candidate submits appeal for a not_matched/borderline decision', async () => {
    const { status, data } = await api(
      'POST',
      '/v1/candidates/me/appeals',
      {
        match_id: matchId,
        ground:   'incorrect_skill_assessment',
        detail:   'My Python proficiency was rated below my demonstrated capability on recent projects.',
      },
      candidateToken,
    );

    expect(status).toBe(201);
    expect(data).toHaveProperty('appeal_id');
    expect(data.status).toBe('submitted');
    appealId = data.appeal_id as string;
  });

  test('9.11b — GET /governance/escalations finds the new escalation', async () => {
    // Escalation is auto-created when the appeal is submitted.
    // Filter by linked_appeal_id so we find exactly our escalation regardless of
    // how many other escalations exist in the DB from prior test runs.
    const { status, data } = await api(`GET`, `/v1/governance/escalations?linked_appeal_id=${appealId}`);

    expect(status).toBe(200);
    expect(Array.isArray(data.escalations)).toBe(true);

    const escalation = (data.escalations as any[]).find(
      e => e.linked_appeal_id === appealId
    );
    expect(escalation, `escalation linked to appeal ${appealId} must be visible`).toBeDefined();
    expect(escalation.status).toBe('open');
    expect(escalation.assignee_body).toBe('twg');
    escalationId = escalation.escalation_id as string;
  });

  test('9.11c — PUT /governance/escalations/:id updates outcome (requires governance key)', async () => {
    const { status, data } = await api(
      'PUT',
      `/v1/governance/escalations/${escalationId}`,
      {
        status:         'resolved',
        outcome:        'upheld',
        outcome_notes:  'After review, the candidate\'s skill level was confirmed as practitioner. The algorithm under-weighted self-study evidence.',
        public_summary: 'Appeal upheld: candidate re-assessed at practitioner level. Pipeline configuration reviewed.',
      },
      undefined, // no candidate/company token
      GOV_KEY,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('resolved');
    expect(data.outcome).toBe('upheld');
    expect(data).toHaveProperty('resolved_at');
  });

  test('9.11d — resolved escalation appears in GET /governance/escalations with resolved status', async () => {
    const { status, data } = await api('GET', `/v1/governance/escalations?status=resolved&linked_appeal_id=${appealId}`);

    expect(status).toBe(200);
    const resolved = (data.escalations as any[]).find(e => e.escalation_id === escalationId);
    expect(resolved, 'resolved escalation must appear in resolved list').toBeDefined();
    expect(resolved.status).toBe('resolved');
    expect(resolved.outcome).toBe('upheld');
  });

  test('9.11e — PUT /governance/escalations without governance auth → 401', async () => {
    const { status } = await api(
      'PUT',
      `/v1/governance/escalations/${escalationId}`,
      { status: 'in_review' },
    );
    expect(status).toBe(401);
  });

});
