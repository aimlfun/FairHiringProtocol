/**
 * SLA-triggered ghosting — scenarios 7.5, 8.1 from TESTING-SCENARIOS.md.
 *
 * Covers:
 *   POST /v1/test-helpers/expire-interaction-sla — set SLA deadline to 2h ago (time simulation)
 *   POST /v1/test-helpers/run-sla-monitor        — detect breaches, create ghosting events
 *   GET  /v1/candidates/me/ghosting              — candidate sees SLA-triggered event (7.5)
 *   GET  /v1/companies/me/ghosting               — company sees SLA-triggered event (8.1)
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
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(path.includes('/test-helpers/') ? { 'X-Test-Helper-Key': TEST_HELPER_KEY } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

/**
 * Register a candidate with Python proficient, register a company, create a job,
 * run the match pipeline until decision === 'matched', and return the interaction_id.
 */
async function buildMatchedInteraction(): Promise<{
  candidateToken: string;
  companyToken:   string;
  interactionId:  string;
  matchId:        string;
}> {
  const { data: companyData } = await api('POST', '/v1/auth/register-company', {
    legal_name:                    `SLA Test Co ${Date.now()}`,
    jurisdiction:                  'GB',
    compliance_contact_email:      uniqueEmail(),
    password:                      TEST_PASSWORD,
    declared_monthly_roles:        5,
    compliance_agreement_accepted: true,
  });
  const companyToken: string = companyData.access_token;

  const { data: jobData } = await api('POST', '/v1/jobs', {
    title:            'SLA Monitor Test Role',
    role_summary:     'Testing SLA breach detection via the test-helper monitor.',
    skills_required:  [{
      ontology_id:      'fhp:skill:python',
      label:            'Python',
      domain:           'Engineering',
      requirement_type: 'must_have',
      min_proficiency:  'practitioner',
    }],
    salary_currency:  'GBP',
    salary_minimum:   50000,
    salary_maximum:   80000,
    work_mode:        'remote',
    location_country: 'GB',
    employment_type:  'permanent',
    attest_no_degree_requirement:     true,
    attest_no_institution_preference: true,
    attest_no_graduation_year_filter: true,
    attest_no_unpaid_work:            true,
  }, companyToken);
  const jobId: string = jobData.job_id;

  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: reg } = await api('POST', '/v1/auth/register', {
      email: uniqueEmail(), password: TEST_PASSWORD,
      age_confirmed: true, terms_accepted: true,
    });
    const candidateToken: string = reg.access_token;

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

    const { data: matchData } = await api('POST', '/v1/matches', { job_id: jobId }, candidateToken);
    if (matchData.decision !== 'matched') continue;

    const matchId: string = matchData.match_id;

    // Wait for DB to settle
    await new Promise(r => setTimeout(r, 150));

    const { data: slaData } = await api('GET', '/v1/companies/me/sla', undefined, companyToken);
    const interaction = (slaData.interactions ?? []).find((i: any) => i.match_id === matchId);
    if (!interaction) continue;

    return {
      candidateToken,
      companyToken,
      interactionId: interaction.interaction_id as string,
      matchId,
    };
  }
  throw new Error('Could not obtain a matched interaction after 6 attempts');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('SLA-triggered ghosting', () => {

  test('7.5 — SLA deadline expired → monitor creates ghosting event visible to candidate', async () => {
    const { candidateToken, interactionId } = await buildMatchedInteraction();

    // Simulate time passage by setting sla_deadline to 2h ago
    const expireRes = await api('POST', '/v1/test-helpers/expire-interaction-sla',
      { interaction_id: interactionId });
    expect(expireRes.status).toBe(200);
    expect(expireRes.data.interaction_id).toBe(interactionId);

    // Run the SLA monitor — should detect the breach and create a ghosting event
    const monitorRes = await api('POST', '/v1/test-helpers/run-sla-monitor',
      { interaction_id: interactionId });
    expect(monitorRes.status).toBe(200);
    expect(monitorRes.data.breaches_detected).toBe(1);
    expect(Array.isArray(monitorRes.data.ghosting_ids)).toBe(true);

    const ghostingId: string = monitorRes.data.ghosting_ids[0];

    // Candidate sees the ghosting event
    const { status, data } = await api('GET', '/v1/candidates/me/ghosting', undefined, candidateToken);
    expect(status).toBe(200);
    const events: any[] = data.ghosting_events ?? [];
    const event = events.find(g => g.ghosting_id === ghostingId);
    expect(event, 'SLA-triggered ghosting event must appear in candidate ghosting list').toBeDefined();
    expect(event.status).toBe('open');
    expect(event.stage_name).toBe('initial_match_acknowledgement');
  });

  test('8.1 — SLA-triggered ghosting event has correct structure', async () => {
    const { companyToken, interactionId } = await buildMatchedInteraction();

    await api('POST', '/v1/test-helpers/expire-interaction-sla', { interaction_id: interactionId });
    const monitorRes = await api('POST', '/v1/test-helpers/run-sla-monitor',
      { interaction_id: interactionId });
    expect(monitorRes.data.breaches_detected).toBe(1);

    const ghostingId: string = monitorRes.data.ghosting_ids[0];

    // Company sees the ghosting event with full structure
    const { status, data } = await api('GET', '/v1/companies/me/ghosting', undefined, companyToken);
    expect(status).toBe(200);
    const events: any[] = data.ghosting_events ?? [];
    const event = events.find(g => g.ghosting_id === ghostingId);
    expect(event, 'SLA-triggered ghosting event must appear in company ghosting list').toBeDefined();

    expect(event.ghosting_id).toBe(ghostingId);
    expect(event.stage_name).toBe('initial_match_acknowledgement');
    expect(event.severity).toBe('minor');   // 2h overdue at initial_match_acknowledgement
    expect(event.status).toBe('open');
    expect(event).toHaveProperty('detected_at');
    expect(event).toHaveProperty('overdue_hours');
    expect(parseFloat(event.overdue_hours)).toBeGreaterThan(0);
  });

  test('7.5b — SLA monitor is idempotent — second run does not create duplicate', async () => {
    const { interactionId } = await buildMatchedInteraction();

    await api('POST', '/v1/test-helpers/expire-interaction-sla', { interaction_id: interactionId });

    // First run — creates the event
    const first = await api('POST', '/v1/test-helpers/run-sla-monitor',
      { interaction_id: interactionId });
    expect(first.data.breaches_detected).toBe(1);

    // Second run — event already exists, no new event created
    const second = await api('POST', '/v1/test-helpers/run-sla-monitor',
      { interaction_id: interactionId });
    expect(second.data.breaches_detected).toBe(0);
  });

  test('expire-interaction-sla with unknown interaction_id → 404', async () => {
    const res = await api('POST', '/v1/test-helpers/expire-interaction-sla',
      { interaction_id: '00000000-0000-0000-0000-000000000001' });
    expect(res.status).toBe(404);
  });

  test('run-sla-monitor with no expired interactions → breaches_detected 0', async () => {
    // Build an interaction but do NOT expire it
    const { interactionId } = await buildMatchedInteraction();

    const res = await api('POST', '/v1/test-helpers/run-sla-monitor',
      { interaction_id: interactionId });
    expect(res.status).toBe(200);
    expect(res.data.breaches_detected).toBe(0);
  });

});
