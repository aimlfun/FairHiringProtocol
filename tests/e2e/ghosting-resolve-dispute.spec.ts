/**
 * Ghosting resolve and dispute — scenarios 8.4, 8.5 from TESTING-SCENARIOS.md.
 *
 * Covers:
 *   8.4 — PUT /v1/companies/me/ghosting/:id with action=resolve → status=resolved
 *   8.5 — PUT /v1/companies/me/ghosting/:id with action=dispute → status=disputed
 *   8.4b — resolve wrong company's ghosting → 404
 *   8.5b — dispute already-resolved ghosting → 404 (only open events are actionable)
 *   8.4c — resolve without auth → 401
 *
 * Setup: register candidate + company, create job, run pipeline until matched,
 *        then create a synthetic ghosting event via POST /v1/test-helpers/create-ghosting-event.
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
    legal_name:                    `Ghosting Test Co ${Date.now()}`,
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
    title:           'DevOps Engineer',
    role_summary:    'Building and maintaining cloud infrastructure and CI/CD pipelines.',
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

/**
 * Register candidate, build a matchable profile, and run the pipeline until
 * we get a 'matched' decision. Returns the interaction_id created by the match.
 */
async function setupMatchedInteraction(companyToken: string, jobId: string): Promise<{
  interactionId: string;
  candidateToken: string;
}> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cToken = await registerCandidate();
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
    }, cToken);

    const { status, data } = await api('POST', '/v1/matches', { job_id: jobId }, cToken);
    if (status !== 201 || data.decision !== 'matched') continue;

    const matchId = data.match_id as string;
    await new Promise(r => setTimeout(r, 100));

    const { data: slaData } = await api('GET', '/v1/companies/me/sla', undefined, companyToken);
    const interaction = (slaData.interactions ?? []).find(
      (i: any) => i.match_id === matchId,
    );
    if (!interaction) continue;

    return { interactionId: interaction.interaction_id, candidateToken: cToken };
  }
  throw new Error('Could not get a matched interaction after 5 attempts');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Ghosting resolve and dispute (8.4, 8.5)', () => {

  let companyToken: string;
  let jobId: string;

  test.beforeAll(async () => {
    const company = await registerCompany();
    companyToken  = company.token;
    jobId         = await createJob(companyToken);
  });

  // ── 8.4: Resolve ghosting event ──────────────────────────────────────────

  test('8.4 — company resolves a ghosting event → status becomes resolved', async () => {
    const { interactionId } = await setupMatchedInteraction(companyToken, jobId);

    // Create a synthetic ghosting event
    const { status: createStatus, data: createData } = await api(
      'POST', '/v1/test-helpers/create-ghosting-event',
      { interaction_id: interactionId },
    );
    expect(createStatus).toBe(201);
    const ghostingId = createData.ghosting_id as string;

    // Resolve it
    const { status, data } = await api(
      'PUT',
      `/v1/companies/me/ghosting/${ghostingId}`,
      { action: 'resolve', resolution_notes: 'We have now contacted the candidate.' },
      companyToken,
    );

    expect(status).toBe(200);
    expect(data.ghosting_id).toBe(ghostingId);
    expect(data.status).toBe('resolved');
  });

  // ── 8.5: Dispute ghosting event ──────────────────────────────────────────

  test('8.5 — company disputes a ghosting event → status becomes disputed', async () => {
    const { interactionId } = await setupMatchedInteraction(companyToken, jobId);

    const { status: createStatus, data: createData } = await api(
      'POST', '/v1/test-helpers/create-ghosting-event',
      { interaction_id: interactionId },
    );
    expect(createStatus).toBe(201);
    const ghostingId = createData.ghosting_id as string;

    const { status, data } = await api(
      'PUT',
      `/v1/companies/me/ghosting/${ghostingId}`,
      { action: 'dispute', resolution_notes: 'We sent communication on time; this event is incorrect.' },
      companyToken,
    );

    expect(status).toBe(200);
    expect(data.ghosting_id).toBe(ghostingId);
    expect(data.status).toBe('disputed');
  });

  // ── 8.4b: Cannot resolve another company's ghosting ──────────────────────

  test('8.4b — resolving another company\'s ghosting event → 404', async () => {
    const { interactionId } = await setupMatchedInteraction(companyToken, jobId);

    const { data: createData } = await api(
      'POST', '/v1/test-helpers/create-ghosting-event',
      { interaction_id: interactionId },
    );
    const ghostingId = createData.ghosting_id as string;

    // Register a different company
    const otherCompany = await registerCompany();

    const { status } = await api(
      'PUT',
      `/v1/companies/me/ghosting/${ghostingId}`,
      { action: 'resolve' },
      otherCompany.token,
    );

    expect(status).toBe(404);
  });

  // ── 8.5b: Cannot dispute already-resolved ghosting ───────────────────────

  test('8.5b — disputing an already-resolved ghosting event → 404', async () => {
    const { interactionId } = await setupMatchedInteraction(companyToken, jobId);

    const { data: createData } = await api(
      'POST', '/v1/test-helpers/create-ghosting-event',
      { interaction_id: interactionId },
    );
    const ghostingId = createData.ghosting_id as string;

    // First, resolve it
    await api('PUT', `/v1/companies/me/ghosting/${ghostingId}`, { action: 'resolve' }, companyToken);

    // Then, try to dispute the now-resolved event
    const { status } = await api(
      'PUT',
      `/v1/companies/me/ghosting/${ghostingId}`,
      { action: 'dispute' },
      companyToken,
    );

    expect(status).toBe(404);
  });

  // ── 8.4c: Auth required ───────────────────────────────────────────────────

  test('8.4c — resolve without auth → 401', async () => {
    const { status } = await api(
      'PUT',
      '/v1/companies/me/ghosting/00000000-0000-0000-0000-000000000000',
      { action: 'resolve' },
    );
    expect(status).toBe(401);
  });

  // ── create-ghosting-event helper guards ──────────────────────────────────

  test('create-ghosting-event with unknown interaction → 404', async () => {
    const { status } = await api(
      'POST', '/v1/test-helpers/create-ghosting-event',
      { interaction_id: '00000000-0000-0000-0000-000000000000' },
    );
    expect(status).toBe(404);
  });

});
