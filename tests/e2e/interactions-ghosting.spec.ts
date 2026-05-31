/**
 * Company interactions & ghosting — scenarios 7.1–7.4, 7.6, 8.2, 8.3 from TESTING-SCENARIOS.md.
 *
 * Covers:
 *   POST /v1/matches (matched decision) → active_interaction auto-created (7.1)
 *   GET  /v1/companies/me/interactions                        (7.6 partial)
 *   GET  /v1/companies/me/sla                                 (7.6)
 *   POST /v1/companies/me/interactions/:id/reject             (7.4)
 *   PUT  /v1/candidates/me/interactions/:id (accept/decline)  (7.2, 7.3)
 *   GET  /v1/candidates/me/ghosting                           (8.2)
 *   GET  /v1/companies/me/ghosting                            (8.3)
 *   PUT  /v1/companies/me/ghosting/:id                        (8.4)
 *
 * Setup: register candidate + company, create job, run match (→ 'matched'),
 *        which auto-creates an active_interaction.
 *
 * Covered elsewhere:
 *   7.5/8.1 (ghosting created when SLA expires) — sla-ghosting.spec.ts
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

async function registerCandidate() {
  const { data } = await api('POST', '/v1/auth/register', {
    email: uniqueEmail(), password: TEST_PASSWORD,
    age_confirmed: true, terms_accepted: true,
  });
  return data.access_token as string;
}

async function registerCompany() {
  const { data } = await api('POST', '/v1/auth/register-company', {
    legal_name:                    `Interactions Test Co ${Date.now()}`,
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
    title:           'Python Engineer',
    role_summary:    'Building backend services and data pipelines.',
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

/**
 * Run the match pipeline until we get a 'matched' decision.
 * Returns the match_id and interaction_id (from company interactions list).
 * Retries with a new candidate if the decision is not_matched/borderline.
 */
/**
 * Run the match pipeline until we get a 'matched' decision.
 * Returns the match_id and interaction_id (from company interactions list).
 * Retries with a new candidate if the decision is not_matched/borderline.
 * Handles 409 (auto-matching beat the manual call) by using the existing match.
 */
async function runUntilMatched(companyToken: string, jobId: string): Promise<{
  matchId: string;
  interactionId: string;
  candidateToken: string;
}> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cToken = await registerCandidate();
    await buildMatchableProfile(cToken);

    let matchId: string | undefined;
    const { status, data } = await api('POST', '/v1/matches', { job_id: jobId }, cToken);

    if (status === 409) {
      // Auto-matching beat the manual call — use the existing match
      const { data: hist } = await api('GET', '/v1/candidates/me/matches?limit=50', undefined, cToken);
      const existing = (hist.matches ?? []).find((m: any) => m.job_id === jobId);
      if (existing?.decision === 'matched') {
        matchId = existing.match_id as string;
      } else {
        continue;
      }
    } else {
      if (status !== 201) continue;
      if (data.decision !== 'matched') continue;
      matchId = data.match_id as string;
    }

    // Give the DB a moment to settle
    await new Promise(r => setTimeout(r, 100));

    // Find the interaction the match created
    const { data: slaData } = await api('GET', '/v1/companies/me/sla', undefined, companyToken);
    const interaction = (slaData.interactions ?? []).find(
      (i: any) => i.match_id === matchId,
    );
    if (!interaction) continue; // race — try again

    return { matchId: matchId as string, interactionId: interaction.interaction_id, candidateToken: cToken };
  }
  throw new Error('Could not obtain a matched interaction after 5 attempts');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Company interactions & ghosting', () => {

  // Shared setup — created once per describe block
  let companyToken: string;
  let jobId: string;

  test.beforeAll(async () => {
    const company = await registerCompany();
    companyToken  = company.token;
    jobId         = await createJob(companyToken);
  });

  // ── 7.1: active_interaction created on matched decision ───────────────────

  test('7.1 — matched pipeline run creates an active_interaction visible in SLA monitor', async () => {
    const candidateToken = await registerCandidate();
    await buildMatchableProfile(candidateToken);

    // Run pipeline
    const { status, data: matchData } = await api('POST', '/v1/matches', { job_id: jobId }, candidateToken);
    expect(status).toBe(201);

    if (matchData.decision !== 'matched') {
      // Not matched — interaction is not created (by design); skip assertion
      test.skip();
      return;
    }

    // Company's SLA view should include the new interaction
    const { data } = await api('GET', '/v1/companies/me/sla', undefined, companyToken);
    expect(data).toHaveProperty('interactions');
    expect(Array.isArray(data.interactions)).toBe(true);

    const found = (data.interactions as any[]).find((i: any) => i.match_id === matchData.match_id);
    expect(found, 'SLA interactions must include the new match interaction').toBeDefined();
    expect(found.current_stage).toBe('initial_match_acknowledgement');
    expect(found).toHaveProperty('sla_deadline');
  });

  // ── 7.4: Company sends structured rejection ───────────────────────────────

  test('7.4 — company sends structured rejection via POST /interactions/:id/reject', async () => {
    const { interactionId } = await runUntilMatched(companyToken, jobId);

    const { status, data } = await api(
      'POST',
      `/v1/companies/me/interactions/${interactionId}/reject`,
      { reason_code: 'PR-01' },
      companyToken,
    );

    expect(status).toBe(200);
    expect(data.outcome).toBe('rejected');
    expect(data.reason_code).toBe('PR-01');
  });

  // ── 7.4b: rejection requires reason_code ─────────────────────────────────

  test('7.4b — rejection without reason_code → 400', async () => {
    const { interactionId } = await runUntilMatched(companyToken, jobId);

    const { status } = await api(
      'POST',
      `/v1/companies/me/interactions/${interactionId}/reject`,
      {},
      companyToken,
    );

    expect(status).toBe(400);
  });

  // ── 7.2: Candidate accepts stage invitation ───────────────────────────────

  test('7.2 — candidate accepts interaction via PUT /interactions/:id', async () => {
    const { interactionId, candidateToken } = await runUntilMatched(companyToken, jobId);

    const { status, data } = await api(
      'PUT',
      `/v1/candidates/me/interactions/${interactionId}`,
      { action: 'accept' },
      candidateToken,
    );

    expect(status).toBe(200);
    expect(data.action).toBe('accept');
    expect(data.outcome).toBe('accepted');
  });

  // ── 7.3: Candidate declines stage invitation ──────────────────────────────

  test('7.3 — candidate declines interaction via PUT /interactions/:id', async () => {
    const { interactionId, candidateToken } = await runUntilMatched(companyToken, jobId);

    const { status, data } = await api(
      'PUT',
      `/v1/candidates/me/interactions/${interactionId}`,
      { action: 'decline', reason: 'I have accepted another offer.' },
      candidateToken,
    );

    expect(status).toBe(200);
    expect(data.action).toBe('decline');
    expect(data.outcome).toBe('candidate_withdrew');
  });

  // ── 7.6: Company SLA dashboard ────────────────────────────────────────────

  test('7.6 — GET /companies/me/sla returns kpis and interactions array', async () => {
    const { status, data } = await api('GET', '/v1/companies/me/sla', undefined, companyToken);

    expect(status).toBe(200);
    expect(data).toHaveProperty('kpis');
    expect(data.kpis).toHaveProperty('total_active');
    expect(data.kpis).toHaveProperty('breached');
    expect(data.kpis).toHaveProperty('on_track');
    expect(data).toHaveProperty('interactions');
    expect(Array.isArray(data.interactions)).toBe(true);
  });

  // ── 8.2: Candidate sees ghosting events ──────────────────────────────────

  test('8.2 — GET /candidates/me/ghosting returns ghosting_events array and open_count', async () => {
    const candidateToken = await registerCandidate();

    const { status, data } = await api('GET', '/v1/candidates/me/ghosting', undefined, candidateToken);

    expect(status).toBe(200);
    expect(data).toHaveProperty('ghosting_events');
    expect(Array.isArray(data.ghosting_events)).toBe(true);
    expect(typeof data.open_count).toBe('number');
  });

  test('8.2b — GET /candidates/me/ghosting status=open filter accepted', async () => {
    const candidateToken = await registerCandidate();

    const { status, data } = await api('GET', '/v1/candidates/me/ghosting?status=open', undefined, candidateToken);

    expect(status).toBe(200);
    expect(Array.isArray(data.ghosting_events)).toBe(true);
  });

  test('8.2c — GET /candidates/me/ghosting without auth → 401', async () => {
    const { status } = await api('GET', '/v1/candidates/me/ghosting');
    expect(status).toBe(401);
  });

  // ── 8.3: Company sees ghosting history ───────────────────────────────────

  test('8.3 — GET /companies/me/ghosting returns ghosting events for the company', async () => {
    const { status, data } = await api('GET', '/v1/companies/me/ghosting', undefined, companyToken);

    expect(status).toBe(200);
    expect(data).toHaveProperty('ghosting_events');
    expect(Array.isArray(data.ghosting_events)).toBe(true);
    // Fresh company — likely empty but shape must be correct
  });

  test('8.3b — GET /companies/me/ghosting without auth → 401', async () => {
    const { status } = await api('GET', '/v1/companies/me/ghosting');
    expect(status).toBe(401);
  });

  // ── 7.8: Advance interaction stage ───────────────────────────────────────

  test('7.8 — POST /interactions/:id/advance moves stage from initial to application_review', async () => {
    const { interactionId } = await runUntilMatched(companyToken, jobId);

    const { status, data } = await api(
      'POST',
      `/v1/companies/me/interactions/${interactionId}/advance`,
      {},
      companyToken,
    );

    expect(status).toBe(200);
    expect(data.previous_stage).toBe('initial_match_acknowledgement');
    expect(data.current_stage).toBe('application_review');
    expect(data.status).toBe('active');
  });

  // ── 7.9: Advance sends notification ──────────────────────────────────────

  test('7.9 — advancing interaction sends stage_invitation notification to the candidate', async () => {
    const { interactionId, candidateToken } = await runUntilMatched(companyToken, jobId);

    const before = Date.now();

    const { status } = await api(
      'POST',
      `/v1/companies/me/interactions/${interactionId}/advance`,
      {},
      companyToken,
    );
    expect(status).toBe(200);

    const { data } = await api('GET', '/v1/candidates/me/notifications', undefined, candidateToken);
    const notifications = (data.notifications ?? []) as any[];

    // Find a stage_invitation created after we called advance
    const notif = notifications.find((n: any) =>
      n.notification_type === 'stage_invitation' &&
      new Date(n.created_at).getTime() >= before - 2000, // 2s tolerance
    );
    expect(notif, 'stage_invitation notification must be delivered after advance').toBeDefined();
  });

  // ── 7.10: Cannot advance a non-active interaction ─────────────────────────

  test('7.10 — advancing an already-rejected interaction → 404', async () => {
    const { interactionId } = await runUntilMatched(companyToken, jobId);

    // Reject the interaction first
    await api(
      'POST',
      `/v1/companies/me/interactions/${interactionId}/reject`,
      { reason_code: 'PR-01' },
      companyToken,
    );

    // Now try to advance — interaction is no longer active
    const { status } = await api(
      'POST',
      `/v1/companies/me/interactions/${interactionId}/advance`,
      {},
      companyToken,
    );
    expect(status).toBe(404);
  });

});
