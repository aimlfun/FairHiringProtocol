/**
 * Candidate notifications — scenarios 5.1–5.8 from TESTING-SCENARIOS.md.
 *
 * Verifies the FHP protocol rule: notify candidate on matched/borderline,
 * suppress notification on not_matched.
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

test.beforeAll(async () => {
  const { data } = await api('POST', '/v1/auth/register-company', {
    legal_name:                    `Notifications Test Co ${Date.now()}`,
    jurisdiction:                  'GB',
    compliance_contact_email:      uniqueEmail(),
    password:                      TEST_PASSWORD,
    declared_monthly_roles:        10,
    compliance_agreement_accepted: true,
  });
  companyToken = data.access_token;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function registerAndMatch(skills: any[], preferences: any, jobOverrides: any = {}) {
  const { data: reg } = await api('POST', '/v1/auth/register', {
    email: uniqueEmail(), password: TEST_PASSWORD,
    age_confirmed: true, terms_accepted: true,
  });
  const token: string = reg.access_token;

  await api('PUT', '/v1/candidates/me', { skills, preferences }, token);

  const { data: job } = await api('POST', '/v1/jobs', {
    title:            jobOverrides.title ?? 'Notification Test Role',
    role_summary:     'Test role for notification scenarios.',
    skills_required:  jobOverrides.skills_required ?? [{
      ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
      requirement_type: 'must_have', min_proficiency: 'practitioner',
    }],
    salary_currency:  'GBP', salary_minimum: 50000, salary_maximum: 80000,
    work_mode:        jobOverrides.work_mode ?? 'remote',
    location_country: 'GB', employment_type: 'permanent',
    attest_no_degree_requirement: true, attest_no_institution_preference: true,
    attest_no_graduation_year_filter: true, attest_no_unpaid_work: true,
    ...jobOverrides,
  }, companyToken);

  const { data: match } = await api('POST', '/v1/matches', { job_id: job.job_id }, token);
  return { token, match, jobId: job.job_id as string };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Candidate notifications', () => {

  test('fresh account has empty notification list and unread_count 0', async () => {
    const { data: reg } = await api('POST', '/v1/auth/register', {
      email: uniqueEmail(), password: TEST_PASSWORD,
      age_confirmed: true, terms_accepted: true,
    });
    const token: string = reg.access_token;

    const { status, data } = await api('GET', '/v1/candidates/me/notifications', undefined, token);

    expect(status).toBe(200);
    expect(data.notifications).toHaveLength(0);
    expect(data.unread_count).toBe(0);
  });

  test('matched decision creates a notification', async () => {
    const { token, match } = await registerAndMatch(
      [{ ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
         proficiency: 'proficient', years_experience: 4 }],
      { salary_min: 50000, salary_currency: 'GBP', work_mode: ['remote'] },
    );

    expect(match.decision).toBe('matched');

    const { data } = await api('GET', '/v1/candidates/me/notifications', undefined, token);

    expect(data.notifications.length).toBeGreaterThanOrEqual(1);
    expect(data.unread_count).toBeGreaterThanOrEqual(1);

    const notif = data.notifications.find(
      (n: any) => n.match_id === match.match_id && n.notification_type === 'match_result',
    );
    expect(notif, 'match_result notification must reference the match').toBeDefined();
    expect(notif.read_at).toBeNull();
  });

  test('not_matched decision creates NO notification', async () => {
    // Candidate has JavaScript, job requires Python → constraint abort → not_matched
    const { token, match } = await registerAndMatch(
      [{ ontology_id: 'fhp:skill:javascript', label: 'JavaScript', domain: 'Engineering',
         proficiency: 'proficient', years_experience: 3 }],
      { work_mode: ['remote'] },
      { title: 'No Notif Test' },
    );

    expect(match.decision).toBe('not_matched');

    const { data } = await api('GET', '/v1/candidates/me/notifications', undefined, token);

    // No notification should exist for this not_matched result
    const notif = data.notifications.find((n: any) => n.match_id === match.match_id);
    expect(notif, 'no notification expected for not_matched').toBeUndefined();
  });

  test('borderline decision creates a notification', async () => {
    // aware skill vs practitioner requirement → borderline
    const { token, match } = await registerAndMatch(
      [{ ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
         proficiency: 'aware', years_experience: 1 }],
      { salary_min: 60000, salary_currency: 'GBP', work_mode: ['remote'] },
      { title: 'Borderline Notif Test' },
    );

    expect(match.decision).toBe('borderline');

    const { data } = await api('GET', '/v1/candidates/me/notifications', undefined, token);

    const notif = data.notifications.find((n: any) => n.match_id === match.match_id);
    expect(notif, 'borderline must produce a notification').toBeDefined();
    expect(notif.read_at).toBeNull();
  });

  test('unread_only filter returns only unread notifications', async () => {
    const { token, match } = await registerAndMatch(
      [{ ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
         proficiency: 'proficient', years_experience: 3 }],
      { salary_min: 50000, salary_currency: 'GBP', work_mode: ['remote'] },
      { title: 'Unread Filter Test' },
    );
    expect(match.decision).toBe('matched');

    const { data } = await api(
      'GET', '/v1/candidates/me/notifications?unread_only=true', undefined, token,
    );
    expect(data.notifications.length).toBeGreaterThanOrEqual(1);
    // All returned notifications must be unread
    for (const n of data.notifications) {
      expect(n.read_at).toBeNull();
    }
  });

  test('mark single notification read', async () => {
    const { token, match } = await registerAndMatch(
      [{ ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
         proficiency: 'proficient', years_experience: 3 }],
      { salary_min: 50000, salary_currency: 'GBP', work_mode: ['remote'] },
      { title: 'Mark Read Test' },
    );
    expect(match.decision).toBe('matched');

    const { data: before } = await api('GET', '/v1/candidates/me/notifications', undefined, token);
    const notif = before.notifications.find((n: any) => n.match_id === match.match_id);
    expect(notif).toBeDefined();
    const notifId: string = notif.notification_id;

    // Mark it read
    const { status: readStatus } = await api(
      'PUT', `/v1/candidates/me/notifications/${notifId}/read`, undefined, token,
    );
    expect(readStatus).toBe(200);

    // Fetch again — read_at must be populated and unread_count must have decreased
    const { data: after } = await api('GET', '/v1/candidates/me/notifications', undefined, token);
    const readNotif = after.notifications.find((n: any) => n.notification_id === notifId);
    expect(readNotif.read_at).not.toBeNull();
    expect(after.unread_count).toBe(before.unread_count - 1);
  });

  test('mark all notifications read clears unread_count to 0', async () => {
    // Create two matched notifications
    const skill = { ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
                    proficiency: 'proficient', years_experience: 3 };
    const prefs = { salary_min: 50000, salary_currency: 'GBP', work_mode: ['remote'] };

    const { data: reg } = await api('POST', '/v1/auth/register', {
      email: uniqueEmail(), password: TEST_PASSWORD,
      age_confirmed: true, terms_accepted: true,
    });
    const token: string = reg.access_token;
    await api('PUT', '/v1/candidates/me', { skills: [skill], preferences: prefs }, token);

    // Two separate jobs → two separate matches → two notifications
    for (const title of ['Read-All Job 1', 'Read-All Job 2']) {
      const { data: job } = await api('POST', '/v1/jobs', {
        title, role_summary: 'Test.', skills_required: [{
          ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
          requirement_type: 'must_have', min_proficiency: 'practitioner',
        }],
        salary_currency: 'GBP', salary_minimum: 50000, salary_maximum: 80000,
        work_mode: 'remote', location_country: 'GB', employment_type: 'permanent',
        attest_no_degree_requirement: true, attest_no_institution_preference: true,
        attest_no_graduation_year_filter: true, attest_no_unpaid_work: true,
      }, companyToken);
      await api('POST', '/v1/matches', { job_id: job.job_id }, token);
    }

    const { data: before } = await api('GET', '/v1/candidates/me/notifications', undefined, token);
    expect(before.unread_count).toBeGreaterThanOrEqual(2);

    // Mark all read
    const { status } = await api('PUT', '/v1/candidates/me/notifications/read-all', undefined, token);
    expect(status).toBe(200);

    const { data: after } = await api('GET', '/v1/candidates/me/notifications', undefined, token);
    expect(after.unread_count).toBe(0);
    for (const n of after.notifications) {
      expect(n.read_at).not.toBeNull();
    }
  });

});
