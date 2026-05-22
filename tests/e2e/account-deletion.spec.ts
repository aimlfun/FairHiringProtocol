/**
 * Account deletion — scenarios 15.7, 15.8 from TESTING-SCENARIOS.md.
 *
 * Covers:
 *   DELETE /v1/candidates/me — pseudonymises account; GET /me → 404 afterwards
 *   Deleted account cannot log in (identity records deleted)
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

test.describe('Account deletion (GDPR Art. 17)', () => {

  test('DELETE /candidates/me returns 204 and profile is gone', async () => {
    const email = uniqueEmail();
    const { data: reg } = await api('POST', '/v1/auth/register', {
      email, password: TEST_PASSWORD,
      age_confirmed: true, terms_accepted: true,
    });
    const token: string = reg.access_token;

    // Verify profile exists before deletion
    const { status: beforeStatus } = await api('GET', '/v1/candidates/me', undefined, token);
    expect(beforeStatus).toBe(200);

    // Delete account
    const res = await fetch(`${API_BASE}/v1/candidates/me`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(204);

    // Profile must be gone — old token still has valid signature but no profile record
    const { status: afterStatus } = await api('GET', '/v1/candidates/me', undefined, token);
    expect(afterStatus).toBe(404);
  });

  test('deleted account cannot log in', async () => {
    const email = uniqueEmail();
    const { data: reg } = await api('POST', '/v1/auth/register', {
      email, password: TEST_PASSWORD,
      age_confirmed: true, terms_accepted: true,
    });

    // Delete the account
    await fetch(`${API_BASE}/v1/candidates/me`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${reg.access_token}` },
    });

    // Login should fail — identity records were deleted
    const { status } = await api('POST', '/v1/auth/login', {
      email,
      password: TEST_PASSWORD,
    });

    expect(status).toBe(401);
  });

  test('account deletion blocked when active appeal exists', async () => {
    const email = uniqueEmail();
    const { data: reg } = await api('POST', '/v1/auth/register', {
      email, password: TEST_PASSWORD,
      age_confirmed: true, terms_accepted: true,
    });
    const token: string = reg.access_token;

    // Create an active company and job to get a not_matched result
    const { data: company } = await api('POST', '/v1/auth/register-company', {
      legal_name:                    `Deletion Block Test Co ${Date.now()}`,
      jurisdiction:                  'GB',
      compliance_contact_email:      uniqueEmail(),
      password:                      TEST_PASSWORD,
      declared_monthly_roles:        5,
      compliance_agreement_accepted: true,
    });

    const { data: job } = await api('POST', '/v1/jobs', {
      title:            'Deletion Block Test Role',
      role_summary:     'Role for testing deletion block.',
      skills_required:  [{ ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
                           requirement_type: 'must_have', min_proficiency: 'practitioner' }],
      salary_currency: 'GBP', salary_minimum: 50000, salary_maximum: 80000,
      work_mode: 'remote', location_country: 'GB', employment_type: 'permanent',
      attest_no_degree_requirement: true, attest_no_institution_preference: true,
      attest_no_graduation_year_filter: true, attest_no_unpaid_work: true,
    }, company.access_token);

    // Candidate has JavaScript but job requires Python → not_matched
    await api('PUT', '/v1/candidates/me', {
      skills: [{ ontology_id: 'fhp:skill:javascript', label: 'JavaScript', domain: 'Engineering',
                 proficiency: 'proficient', years_experience: 3 }],
    }, token);

    const { data: match } = await api('POST', '/v1/matches', { job_id: job.job_id }, token);
    expect(match.decision).toBe('not_matched');

    // Submit an appeal (active)
    await api('POST', '/v1/candidates/me/appeals', {
      match_id: match.match_id,
      ground:   'incorrect_skill_assessment',
      detail:   'I have relevant experience that was not counted in the assessment.',
    }, token);

    // Now try to delete — must be blocked
    const res = await fetch(`${API_BASE}/v1/candidates/me`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(400);
    const body = await res.json().catch(() => ({})) as any;
    expect(JSON.stringify(body)).toMatch(/appeal/i);
  });

  test('match history is preserved (pseudonymised) after deletion', async () => {
    // Create a match, delete the account, verify match still exists but with replacement ID
    const email = uniqueEmail();
    const { data: reg } = await api('POST', '/v1/auth/register', {
      email, password: TEST_PASSWORD,
      age_confirmed: true, terms_accepted: true,
    });
    const token: string = reg.access_token;
    const originalId: string = reg.candidate_id;

    const { data: company } = await api('POST', '/v1/auth/register-company', {
      legal_name:                    `Pseudonymise Test Co ${Date.now()}`,
      jurisdiction:                  'GB',
      compliance_contact_email:      uniqueEmail(),
      password:                      TEST_PASSWORD,
      declared_monthly_roles:        5,
      compliance_agreement_accepted: true,
    });
    const { data: job } = await api('POST', '/v1/jobs', {
      title:            'Pseudonymise Test Role',
      role_summary:     'Testing pseudonymisation.',
      skills_required:  [{ ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
                           requirement_type: 'must_have', min_proficiency: 'practitioner' }],
      salary_currency: 'GBP', salary_minimum: 50000, salary_maximum: 80000,
      work_mode: 'remote', location_country: 'GB', employment_type: 'permanent',
      attest_no_degree_requirement: true, attest_no_institution_preference: true,
      attest_no_graduation_year_filter: true, attest_no_unpaid_work: true,
    }, company.access_token);

    await api('PUT', '/v1/candidates/me', {
      skills: [{ ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
                 proficiency: 'proficient', years_experience: 3 }],
    }, token);
    const { data: match } = await api('POST', '/v1/matches', { job_id: job.job_id }, token);
    const matchId: string = match.match_id;

    // Delete account
    await fetch(`${API_BASE}/v1/candidates/me`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    // Company can still see the match in their job matches (pseudonymised candidate)
    const { status, data } = await api('GET', `/v1/jobs/${job.job_id}/matches`, undefined, company.access_token);
    expect(status).toBe(200);
    const found = data.matches.find((m: any) => m.match_id === matchId);
    expect(found, 'match must still exist after deletion').toBeDefined();
    // The match must not expose the original candidate_id
    expect(found?.candidate_id).not.toBe(originalId);
  });

});
