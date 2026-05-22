/**
 * Reference data & ontology — scenarios 13.1–13.6 from TESTING-SCENARIOS.md.
 *
 * Covers:
 *   GET /v1/reference/rejection-codes — structured rejection taxonomy
 *   GET /v1/ontology/skills            — skill search / autocomplete
 *   GET /v1/ontology/domains           — skill domain list
 *   GET /v1/companies/:id/public-record — company trust badge (public)
 *
 * Pure API tests — no browser required.
 */

import { test, expect } from '@playwright/test';
import { API_BASE, uniqueEmail, TEST_PASSWORD } from './helpers.js';

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

// ── Shared company (for public-record test) ───────────────────────────────────

let companyId: string;

test.beforeAll(async () => {
  const { data } = await api('POST', '/v1/auth/register-company', {
    legal_name:                    `Ref Data Test Co ${Date.now()}`,
    jurisdiction:                  'GB',
    compliance_contact_email:      uniqueEmail(),
    password:                      TEST_PASSWORD,
    declared_monthly_roles:        5,
    compliance_agreement_accepted: true,
  });
  companyId = data.company_id;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Reference data & ontology', () => {

  test('GET /v1/reference/rejection-codes returns seeded taxonomy', async () => {
    const { status, data } = await api('GET', '/v1/reference/rejection-codes');

    expect(status).toBe(200);
    expect(Array.isArray(data.rejection_codes)).toBe(true);
    expect(data.rejection_codes.length).toBeGreaterThan(0);

    const code = data.rejection_codes[0];
    expect(code).toHaveProperty('code');
    expect(code).toHaveProperty('category');
    expect(code).toHaveProperty('label');
    expect(code).toHaveProperty('requires_stage_notes');
  });

  test('GET /v1/reference/rejection-codes requires no authentication', async () => {
    const { status } = await api('GET', '/v1/reference/rejection-codes');
    expect(status).toBe(200);
  });

  test('GET /v1/ontology/skills returns skill list', async () => {
    const { status, data } = await api('GET', '/v1/ontology/skills');

    expect(status).toBe(200);
    expect(Array.isArray(data.skills)).toBe(true);
    expect(typeof data.total).toBe('number');
  });

  test('GET /v1/ontology/skills?q=python finds Python skill', async () => {
    const { status, data } = await api('GET', '/v1/ontology/skills?q=python');

    expect(status).toBe(200);
    expect(Array.isArray(data.skills)).toBe(true);
    expect(data.skills.length).toBeGreaterThan(0);

    const python = data.skills.find((s: any) =>
      s.label.toLowerCase().includes('python') ||
      s.skill_id.toLowerCase().includes('python'),
    );
    expect(python, 'Python skill must appear in results').toBeDefined();
  });

  test('GET /v1/ontology/skills skill entry has expected shape', async () => {
    const { status, data } = await api('GET', '/v1/ontology/skills?q=python&limit=1');

    expect(status).toBe(200);
    const skill = data.skills[0];
    expect(skill).toHaveProperty('skill_id');
    expect(skill).toHaveProperty('label');
    expect(skill).toHaveProperty('domain');
  });

  test('GET /v1/ontology/domains returns distinct domain list', async () => {
    const { status, data } = await api('GET', '/v1/ontology/domains');

    expect(status).toBe(200);
    expect(Array.isArray(data.domains)).toBe(true);
    expect(data.domains.length).toBeGreaterThan(0);

    const domain = data.domains[0];
    expect(domain).toHaveProperty('domain');
    expect(typeof domain.skill_count).toBe('number');
    expect(domain.skill_count).toBeGreaterThan(0);
  });

  test('GET /v1/ontology/skills?domain= filters by domain', async () => {
    // Get any domain from the domains list first
    const { data: domainsData } = await api('GET', '/v1/ontology/domains');
    const firstDomain: string = domainsData.domains[0].domain;

    const { status, data } = await api('GET', `/v1/ontology/skills?domain=${encodeURIComponent(firstDomain)}`);

    expect(status).toBe(200);
    expect(Array.isArray(data.skills)).toBe(true);
    for (const skill of data.skills) {
      expect(skill.domain).toBe(firstDomain);
    }
  });

  test('GET /v1/ontology endpoints require no authentication', async () => {
    const [skills, domains] = await Promise.all([
      api('GET', '/v1/ontology/skills'),
      api('GET', '/v1/ontology/domains'),
    ]);
    expect(skills.status).toBe(200);
    expect(domains.status).toBe(200);
  });

  test('GET /v1/companies/:id/public-record returns compliance data for active company', async () => {
    const { status, data } = await api('GET', `/v1/companies/${companyId}/public-record`);

    expect(status).toBe(200);
    expect(data.company_id).toBe(companyId);
    expect(data).toHaveProperty('legal_name');
    expect(data).toHaveProperty('jurisdiction');
    expect(data).toHaveProperty('compliance_score');
  });

  test('GET /v1/companies/:id/public-record 404 for unknown company', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const { status } = await api('GET', `/v1/companies/${fakeId}/public-record`);

    expect(status).toBe(404);
  });

  test('GET /v1/companies/:id/public-record requires no authentication', async () => {
    // No token supplied — should still succeed for a real company
    const { status } = await api('GET', `/v1/companies/${companyId}/public-record`);
    expect(status).toBe(200);
  });

});
