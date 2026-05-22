/**
 * Auth gaps — scenarios 1.9, 1.10, 1.13, 1.14, 1.15 from TESTING-SCENARIOS.md.
 *
 * Covers:
 *   POST /v1/auth/refresh                    — exchange refresh token for new access token
 *   DELETE /v1/auth/logout                   — logout (stateless 204)
 *   POST /v1/auth/login-company              — company login
 *   Company registers without compliance_agreement_accepted → status pending_verification
 *   POST /v1/auth/accept-compliance-agreement — company accepts agreement → status active
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

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Auth gaps', () => {

  test('POST /auth/refresh issues new access token from refresh token', async () => {
    // Register a candidate to get tokens
    const email = uniqueEmail();
    const { data: reg } = await api('POST', '/v1/auth/register', {
      email, password: TEST_PASSWORD,
      age_confirmed: true, terms_accepted: true,
    });
    const refreshToken: string = reg.refresh_token;
    expect(refreshToken).toBeTruthy();

    // Exchange refresh token for new access token
    const { status, data } = await api('POST', '/v1/auth/refresh', {
      refresh_token: refreshToken,
    });

    expect(status).toBe(200);
    expect(typeof data.access_token).toBe('string');
    expect(data.access_token.length).toBeGreaterThan(10);
  });

  test('POST /auth/refresh with invalid token → 401', async () => {
    const { status } = await api('POST', '/v1/auth/refresh', {
      refresh_token: 'not-a-valid-jwt',
    });
    expect(status).toBe(401);
  });

  test('new access token from refresh works for authenticated requests', async () => {
    const email = uniqueEmail();
    const { data: reg } = await api('POST', '/v1/auth/register', {
      email, password: TEST_PASSWORD,
      age_confirmed: true, terms_accepted: true,
    });

    const { data: refreshed } = await api('POST', '/v1/auth/refresh', {
      refresh_token: reg.refresh_token,
    });

    // Use the new token to access a protected endpoint
    const { status } = await api('GET', '/v1/candidates/me', undefined, refreshed.access_token);
    expect(status).toBe(200);
  });

  test('DELETE /auth/logout returns 204', async () => {
    const { data: reg } = await api('POST', '/v1/auth/register', {
      email: uniqueEmail(), password: TEST_PASSWORD,
      age_confirmed: true, terms_accepted: true,
    });

    const res = await fetch(`${API_BASE}/v1/auth/logout`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${reg.access_token}` },
    });

    expect(res.status).toBe(204);
  });

  test('POST /auth/login-company issues company tokens', async () => {
    const email = uniqueEmail();
    const { data: reg } = await api('POST', '/v1/auth/register-company', {
      legal_name:                    `Login Test Co ${Date.now()}`,
      jurisdiction:                  'GB',
      compliance_contact_email:      email,
      password:                      TEST_PASSWORD,
      declared_monthly_roles:        5,
      compliance_agreement_accepted: true,
    });
    expect(reg.company_id).toBeTruthy();

    const { status, data } = await api('POST', '/v1/auth/login-company', {
      email,
      password: TEST_PASSWORD,
    });

    expect(status).toBe(200);
    expect(typeof data.access_token).toBe('string');
    expect(typeof data.refresh_token).toBe('string');
    expect(data.company_id).toBe(reg.company_id);
    expect(data.status).toBe('active');
  });

  test('POST /auth/login-company with wrong password → 401', async () => {
    const email = uniqueEmail();
    await api('POST', '/v1/auth/register-company', {
      legal_name:                    `Wrong Pass Co ${Date.now()}`,
      jurisdiction:                  'GB',
      compliance_contact_email:      email,
      password:                      TEST_PASSWORD,
      declared_monthly_roles:        5,
      compliance_agreement_accepted: true,
    });

    const { status } = await api('POST', '/v1/auth/login-company', {
      email,
      password: 'WrongPassword999!',
    });

    expect(status).toBe(401);
  });

  test('company registered without compliance agreement has pending_verification status', async () => {
    const { status, data } = await api('POST', '/v1/auth/register-company', {
      legal_name:                    `Pending Co ${Date.now()}`,
      jurisdiction:                  'DE',
      compliance_contact_email:      uniqueEmail(),
      password:                      TEST_PASSWORD,
      declared_monthly_roles:        3,
      // compliance_agreement_accepted NOT provided
    });

    expect(status).toBe(201);
    expect(data.status).toBe('pending_verification');
  });

  test('pending company cannot create jobs until agreement accepted', async () => {
    const { data: reg } = await api('POST', '/v1/auth/register-company', {
      legal_name:                    `Pending Jobs Co ${Date.now()}`,
      jurisdiction:                  'GB',
      compliance_contact_email:      uniqueEmail(),
      password:                      TEST_PASSWORD,
      declared_monthly_roles:        3,
    });

    const { status } = await api('POST', '/v1/jobs', {
      title:            'Cannot Create This',
      role_summary:     'Should be blocked.',
      skills_required:  [{ ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
                           requirement_type: 'must_have', min_proficiency: 'practitioner' }],
      salary_currency:  'GBP', salary_minimum: 50000, salary_maximum: 80000,
      work_mode:        'remote', location_country: 'GB', employment_type: 'permanent',
      attest_no_degree_requirement: true, attest_no_institution_preference: true,
      attest_no_graduation_year_filter: true, attest_no_unpaid_work: true,
    }, reg.access_token);

    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('POST /auth/accept-compliance-agreement activates pending company', async () => {
    const { data: reg } = await api('POST', '/v1/auth/register-company', {
      legal_name:                    `Accept Agreement Co ${Date.now()}`,
      jurisdiction:                  'FR',
      compliance_contact_email:      uniqueEmail(),
      password:                      TEST_PASSWORD,
      declared_monthly_roles:        5,
      // No compliance_agreement_accepted — starts pending
    });
    expect(reg.status).toBe('pending_verification');

    const { status, data } = await api('POST', '/v1/auth/accept-compliance-agreement', {
      accepted: true,
    }, reg.access_token);

    expect(status).toBe(200);
    expect(data.status).toBe('active');
    expect(data.compliance_agreement_accepted).toBe(true);
  });

});
