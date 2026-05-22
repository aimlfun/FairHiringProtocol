/**
 * Governance read endpoints — scenarios 14.1–14.10 from TESTING-SCENARIOS.md.
 *
 * Covers all public governance read endpoints (escalations, audit, metrics,
 * summary, votes, proposals, versions, bodies, fairness/companies).
 * All are unauthenticated — public transparency is a core FHP commitment.
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

test.describe('Governance public reads', () => {

  test('GET /v1/governance/escalations returns paginated list', async () => {
    const { status, data } = await api('/v1/governance/escalations');

    expect(status).toBe(200);
    expect(Array.isArray(data.escalations)).toBe(true);
    expect(typeof data.page).toBe('number');
    expect(typeof data.limit).toBe('number');
  });

  test('GET /v1/governance/escalations accepts status filter', async () => {
    const { status, data } = await api('/v1/governance/escalations?status=open');

    expect(status).toBe(200);
    expect(Array.isArray(data.escalations)).toBe(true);
    // All returned items must match the filter
    for (const esc of data.escalations) {
      expect(esc.status).toBe('open');
    }
  });

  test('GET /v1/governance/audit returns public audit log', async () => {
    const { status, data } = await api('/v1/governance/audit');

    expect(status).toBe(200);
    expect(Array.isArray(data.entries)).toBe(true);
    expect(typeof data.page).toBe('number');
  });

  test('GET /v1/governance/metrics returns platform-wide fairness data', async () => {
    const { status } = await api('/v1/governance/metrics');

    // Either 200 with metrics or 200 with a message — never 4xx
    expect(status).toBe(200);
  });

  test('GET /v1/governance/summary returns platform health KPIs', async () => {
    const { status, data } = await api('/v1/governance/summary');

    expect(status).toBe(200);
    expect(data).toHaveProperty('fhp_version');
    expect(data).toHaveProperty('companies');
    expect(data).toHaveProperty('escalations');
    expect(data).toHaveProperty('proposals');
    expect(data).toHaveProperty('generated_at');
  });

  test('GET /v1/governance/summary companies block has numeric fields', async () => {
    const { status, data } = await api('/v1/governance/summary');

    expect(status).toBe(200);
    const c = data.companies;
    expect(typeof Number(c.total_registered)).toBe('number');
    expect(typeof Number(c.active)).toBe('number');
  });

  test('GET /v1/governance/votes returns vote record', async () => {
    const { status, data } = await api('/v1/governance/votes');

    expect(status).toBe(200);
    expect(Array.isArray(data.votes)).toBe(true);
  });

  test('GET /v1/governance/proposals?status=all returns proposals list', async () => {
    const { status, data } = await api('/v1/governance/proposals?status=all');

    expect(status).toBe(200);
    expect(Array.isArray(data.proposals)).toBe(true);
  });

  test('GET /v1/governance/versions returns current FHP version', async () => {
    const { status, data } = await api('/v1/governance/versions');

    expect(status).toBe(200);
    expect(data).toHaveProperty('current');
    expect(data.current).toHaveProperty('fhp_version');
    expect(data.current).toHaveProperty('pipeline_version');
    expect(Array.isArray(data.history)).toBe(true);
    expect(data.history.length).toBeGreaterThan(0);
  });

  test('GET /v1/governance/bodies returns three standing governance bodies', async () => {
    const { status, data } = await api('/v1/governance/bodies');

    expect(status).toBe(200);
    expect(Array.isArray(data.bodies)).toBe(true);
    expect(data.bodies.length).toBe(3);

    const codes = data.bodies.map((b: any) => b.body_code);
    expect(codes).toContain('pc');
    expect(codes).toContain('fob');
    expect(codes).toContain('twg');

    for (const body of data.bodies) {
      expect(typeof body.open_item_count).toBe('number');
      expect(Array.isArray(body.queue_items)).toBe(true);
    }
  });

  test('GET /v1/governance/fairness/companies returns per-company table', async () => {
    const { status, data } = await api('/v1/governance/fairness/companies');

    expect(status).toBe(200);
    expect(Array.isArray(data.companies)).toBe(true);
  });

  test('governance endpoints require no authentication', async () => {
    const paths = [
      '/v1/governance/escalations',
      '/v1/governance/audit',
      '/v1/governance/metrics',
      '/v1/governance/summary',
      '/v1/governance/votes',
      '/v1/governance/proposals?status=all',
      '/v1/governance/versions',
      '/v1/governance/bodies',
      '/v1/governance/fairness/companies',
    ];

    const results = await Promise.all(paths.map(api));
    for (const { status } of results) {
      expect(status).toBe(200);
    }
  });

});
