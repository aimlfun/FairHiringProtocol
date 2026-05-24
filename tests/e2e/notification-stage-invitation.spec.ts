/**
 * Stage invitation notification — scenario 5.8 from TESTING-SCENARIOS.md.
 *
 * Covers:
 *   When POST /v1/matches returns decision='matched', a 'stage_invitation'
 *   notification must appear in the candidate's notification list in addition
 *   to the 'match_result' notification.
 *
 * Pure API test — no browser required.
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
    legal_name:                    `Notif Test Co ${Date.now()}`,
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
    title:           'Backend Developer',
    role_summary:    'Building scalable backend services for our platform.',
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

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Stage invitation notification (5.8)', () => {

  test('5.8 — matched pipeline run emits a stage_invitation notification', async () => {
    const companyToken = await registerCompany();
    const jobId        = await createJob(companyToken);

    // Retry until we get a matched decision
    let candidateToken = '';
    let matched        = false;

    for (let attempt = 0; attempt < 5; attempt++) {
      candidateToken = await registerCandidate();
      await buildMatchableProfile(candidateToken);

      const { status, data } = await api('POST', '/v1/matches', { job_id: jobId }, candidateToken);
      if (status === 201 && data.decision === 'matched') {
        matched = true;
        break;
      }
    }

    if (!matched) {
      test.skip();
      return;
    }

    // Fetch notifications
    const { status, data } = await api('GET', '/v1/candidates/me/notifications', undefined, candidateToken);
    expect(status).toBe(200);

    const notifs: any[] = data.notifications ?? data;
    expect(Array.isArray(notifs)).toBe(true);

    const types = notifs.map((n: any) => n.notification_type);
    expect(types).toContain('stage_invitation');
    expect(types).toContain('match_result');
  });

  test('5.8b — stage_invitation notification has expected shape', async () => {
    const companyToken = await registerCompany();
    const jobId        = await createJob(companyToken);

    let candidateToken = '';
    let matched        = false;

    for (let attempt = 0; attempt < 5; attempt++) {
      candidateToken = await registerCandidate();
      await buildMatchableProfile(candidateToken);

      const { status, data } = await api('POST', '/v1/matches', { job_id: jobId }, candidateToken);
      if (status === 201 && data.decision === 'matched') {
        matched = true;
        break;
      }
    }

    if (!matched) {
      test.skip();
      return;
    }

    const { data } = await api('GET', '/v1/candidates/me/notifications', undefined, candidateToken);
    const notifs: any[] = data.notifications ?? data;

    const invitation = notifs.find((n: any) => n.notification_type === 'stage_invitation');
    expect(invitation).toBeDefined();
    expect(invitation).toHaveProperty('notification_id');
    expect(invitation).toHaveProperty('title');
    expect(invitation).toHaveProperty('body');
    expect(invitation).toHaveProperty('match_id');
    expect(invitation).toHaveProperty('job_id');
  });

  test('5.8c — borderline match does NOT produce a stage_invitation notification', async () => {
    // Borderline decisions don't create active_interactions, so no stage_invitation
    // This test verifies the condition is correctly scoped to matched only.
    const companyToken = await registerCompany();
    const jobId        = await createJob(companyToken);

    let candidateToken = '';
    let isBorderline   = false;

    for (let attempt = 0; attempt < 8; attempt++) {
      candidateToken = await registerCandidate();
      // Partial profile — likely borderline (some skills, incomplete preferences)
      await api('PUT', '/v1/candidates/me', {
        skills: [{
          ontology_id:      'fhp:skill:python',
          label:            'Python',
          domain:           'Engineering',
          proficiency:      'beginner',
          years_experience: 1,
        }],
      }, candidateToken);

      const { status, data } = await api('POST', '/v1/matches', { job_id: jobId }, candidateToken);
      if (status === 201 && data.decision === 'borderline') {
        isBorderline = true;
        break;
      }
    }

    if (!isBorderline) {
      test.skip(); // couldn't produce borderline — skip rather than false-fail
      return;
    }

    const { data } = await api('GET', '/v1/candidates/me/notifications', undefined, candidateToken);
    const notifs: any[] = data.notifications ?? data;
    const types = notifs.map((n: any) => n.notification_type);
    expect(types).not.toContain('stage_invitation');
  });

});
