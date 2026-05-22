/**
 * Company dashboard API — scenarios 19.1–19.5 from TESTING-SCENARIOS.md.
 *
 * Covers:
 *   GET /v1/companies/me              — company profile
 *   GET /v1/companies/me/dashboard    — fairness + SLA + ghosting KPIs
 *   GET /v1/companies/me/sla          — SLA monitor KPIs + interactions
 *   GET /v1/companies/me/audit        — compliance audit log
 *   GET /v1/companies/me/sla-by-stage — SLA compliance rate per stage
 *   GET /v1/companies/me/pipeline     — cross-job pipeline run history
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
    legal_name:                    `Dashboard Test Co ${Date.now()}`,
    jurisdiction:                  'GB',
    compliance_contact_email:      uniqueEmail(),
    password:                      TEST_PASSWORD,
    declared_monthly_roles:        20,
    compliance_agreement_accepted: true,
  });
  companyToken = data.access_token;
  companyId    = data.company_id;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Company dashboard API', () => {

  test('GET /companies/me returns company profile fields', async () => {
    const { status, data } = await api('GET', '/v1/companies/me', undefined, companyToken);

    expect(status).toBe(200);
    expect(data.company_id).toBe(companyId);
    expect(data).toHaveProperty('legal_name');
    expect(data).toHaveProperty('jurisdiction');
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('compliance_score');
    expect(data.status).toBe('active');
  });

  test('GET /companies/me requires authentication', async () => {
    const { status } = await api('GET', '/v1/companies/me');
    expect(status).toBe(401);
  });

  test('GET /companies/me/dashboard returns compliance KPIs', async () => {
    const { status, data } = await api('GET', '/v1/companies/me/dashboard', undefined, companyToken);

    expect(status).toBe(200);
    expect(data).toHaveProperty('company');
    expect(data).toHaveProperty('open_ghosting');
    expect(data).toHaveProperty('active_jobs');
    expect(data).toHaveProperty('compliance_breakdown');

    const breakdown = data.compliance_breakdown;
    expect(breakdown).toHaveProperty('sla_pct');
    expect(breakdown).toHaveProperty('ghosting_pct');
    expect(breakdown).toHaveProperty('fairness_pct');
    expect(breakdown).toHaveProperty('rejection_pct');
  });

  test('GET /companies/me/sla returns SLA KPIs', async () => {
    const { status, data } = await api('GET', '/v1/companies/me/sla', undefined, companyToken);

    expect(status).toBe(200);
    expect(data).toHaveProperty('kpis');
    expect(data).toHaveProperty('interactions');
    expect(Array.isArray(data.interactions)).toBe(true);

    const kpis = data.kpis;
    expect(typeof kpis.total_active).toBe('number');
    expect(typeof kpis.breached).toBe('number');
    expect(typeof kpis.on_track).toBe('number');
    expect(typeof kpis.compliance_pct_30d).toBe('number');
  });

  test('GET /companies/me/audit returns audit log', async () => {
    const { status, data } = await api('GET', '/v1/companies/me/audit', undefined, companyToken);

    expect(status).toBe(200);
    expect(data).toHaveProperty('audit_log');
    expect(Array.isArray(data.audit_log)).toBe(true);
  });

  test('GET /companies/me/audit CSV format returns text/csv', async () => {
    const res = await fetch(`${API_BASE}/v1/companies/me/audit?format=csv`, {
      headers: { Authorization: `Bearer ${companyToken}` },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
  });

  test('GET /companies/me/sla-by-stage returns stage breakdown array', async () => {
    const { status, data } = await api('GET', '/v1/companies/me/sla-by-stage', undefined, companyToken);

    expect(status).toBe(200);
    expect(data).toHaveProperty('stages');
    expect(Array.isArray(data.stages)).toBe(true);
  });

  test('GET /companies/me/pipeline returns run stats and array', async () => {
    const { status, data } = await api('GET', '/v1/companies/me/pipeline', undefined, companyToken);

    expect(status).toBe(200);
    expect(data).toHaveProperty('stats');
    expect(data).toHaveProperty('runs');
    expect(data).toHaveProperty('total');
    expect(Array.isArray(data.runs)).toBe(true);
    expect(typeof data.stats.total_runs).toBe('number');
  });

  test('GET /companies/me/pipeline stats reflect actual matches after a match run', async () => {
    // Create a job and run a match to ensure stats are non-trivial
    const { data: job } = await api('POST', '/v1/jobs', {
      title:            'Pipeline Stats Test Role',
      role_summary:     'Testing pipeline stats.',
      skills_required:  [{ ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
                           requirement_type: 'must_have', min_proficiency: 'practitioner' }],
      salary_currency: 'GBP', salary_minimum: 60000, salary_maximum: 90000,
      work_mode: 'remote', location_country: 'GB', employment_type: 'permanent',
      attest_no_degree_requirement: true, attest_no_institution_preference: true,
      attest_no_graduation_year_filter: true, attest_no_unpaid_work: true,
    }, companyToken);

    const { data: reg } = await api('POST', '/v1/auth/register', {
      email: uniqueEmail(), password: TEST_PASSWORD,
      age_confirmed: true, terms_accepted: true,
    });
    await api('PUT', '/v1/candidates/me', {
      skills: [{ ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
                 proficiency: 'proficient', years_experience: 3 }],
    }, reg.access_token);
    await api('POST', '/v1/matches', { job_id: job.job_id }, reg.access_token);

    const { data } = await api('GET', '/v1/companies/me/pipeline', undefined, companyToken);

    expect(data.stats.total_runs).toBeGreaterThan(0);
  });

  test('all company dashboard endpoints require authentication', async () => {
    const paths = [
      '/v1/companies/me',
      '/v1/companies/me/dashboard',
      '/v1/companies/me/sla',
      '/v1/companies/me/audit',
      '/v1/companies/me/sla-by-stage',
      '/v1/companies/me/pipeline',
    ];

    const results = await Promise.all(paths.map(p => api('GET', p)));
    for (const { status } of results) {
      expect(status).toBe(401);
    }
  });

});
