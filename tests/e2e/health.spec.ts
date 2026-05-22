/**
 * Health & conformance — scenarios 2.1–2.4 from TESTING-SCENARIOS.md.
 *
 * Covers GET /v1/health and GET /v1/health/conformance.
 * Pure API tests — no browser required.
 */

import { test, expect } from '@playwright/test';
import { API_BASE } from './helpers.js';

async function api(path: string): Promise<{ status: number; data: any }> {
  const res = await fetch(`${API_BASE}${path}`);
  let data: any;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

test.describe('Health', () => {

  test('GET /v1/health returns 200 with status ok', async () => {
    const { status, data } = await api('/v1/health');

    expect(status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('timestamp');
  });

  test('GET /v1/health reports all three database pools', async () => {
    const { status, data } = await api('/v1/health');

    expect(status).toBe(200);
    expect(data.database).toBeDefined();
    expect(data.database.api).toBe('ok');
    expect(data.database.identity).toBe('ok');
    expect(data.database.fairness).toBe('ok');
  });

  test('GET /v1/health/conformance returns FHP version and endpoint count', async () => {
    const { status, data } = await api('/v1/health/conformance');

    expect(status).toBe(200);
    expect(data.fhp_version).toBe('1.0.0');
    expect(typeof data.endpoints_implemented).toBe('number');
    expect(data.endpoints_implemented).toBeGreaterThan(0);
    expect(data).toHaveProperty('api_version');
    expect(data).toHaveProperty('timestamp');
  });

  test('GET /v1/health requires no authentication', async () => {
    // Both health endpoints must be accessible without a token
    const [health, conformance] = await Promise.all([
      api('/v1/health'),
      api('/v1/health/conformance'),
    ]);

    expect(health.status).toBe(200);
    expect(conformance.status).toBe(200);
  });

});
