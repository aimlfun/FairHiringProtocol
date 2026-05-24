/**
 * Transfer credits — scenarios 14.1, 14.2 from TESTING-SCENARIOS.md.
 *
 * Covers:
 *   GET /v1/candidates/me/transfer-credits
 *   - fresh candidate (no skills) → empty array
 *   - candidate with docker skill at proficient → Kubernetes credit computed correctly
 *
 * Transfer credit formula:
 *   rawCredit    = (profLevel / 4) * transferWeight
 *   cappedCredit = min(rawCredit, 0.60)   ← TRANSFER_SCORE_CAP
 *   is_capped    = rawCredit > 0.60
 *   raw_credit / capped_credit are in percent (multiply by 100, round)
 *
 * Hardcoded transfer pair tested:
 *   fhp:skill:docker → Kubernetes, weight: 0.70
 *   proficient = level 2 → rawCredit = (2/4) * 0.70 = 0.35 → capped_credit: 35, is_capped: false
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

async function registerCandidate(): Promise<string> {
  const { data } = await api('POST', '/v1/auth/register', {
    email: uniqueEmail(), password: TEST_PASSWORD,
    age_confirmed: true, terms_accepted: true,
  });
  return data.access_token as string;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Transfer credits', () => {

  test('14.1 — fresh candidate with no skills → empty transfer_credits array', async () => {
    const token = await registerCandidate();

    const { status, data } = await api('GET', '/v1/candidates/me/transfer-credits', undefined, token);

    expect(status).toBe(200);
    expect(data).toHaveProperty('transfer_credits');
    expect(Array.isArray(data.transfer_credits)).toBe(true);
    expect(data.transfer_credits).toHaveLength(0);
  });

  test('14.2 — docker skill at proficient → Kubernetes credit computed', async () => {
    const token = await registerCandidate();

    // Add docker skill at proficient level
    await api('PUT', '/v1/candidates/me', {
      skills: [{
        ontology_id:  'fhp:skill:docker',
        label:        'Docker',
        proficiency:  'proficient',
        years:        2,
      }],
    }, token);

    const { status, data } = await api('GET', '/v1/candidates/me/transfer-credits', undefined, token);

    expect(status).toBe(200);
    const credits: any[] = data.transfer_credits;
    expect(Array.isArray(credits)).toBe(true);
    expect(credits.length).toBeGreaterThan(0);

    const kubeCredit = credits.find((c: any) => c.target_skill_label === 'Kubernetes');
    expect(kubeCredit, 'Kubernetes credit must be present for docker/proficient').toBeDefined();

    // proficient = level 2, weight = 0.70
    // rawCredit = (2/4) * 0.70 = 0.35  →  raw_credit = 35
    // TRANSFER_CAP = 0.60  →  capped_credit = 35, is_capped = false
    expect(kubeCredit.source_skill_id).toBe('fhp:skill:docker');
    expect(kubeCredit.source_proficiency).toBe('proficient');
    expect(kubeCredit.transfer_weight).toBe(0.70);
    expect(kubeCredit.raw_credit).toBe(35);
    expect(kubeCredit.capped_credit).toBe(35);
    expect(kubeCredit.is_capped).toBe(false);
  });

  test('14.3 — docker skill at expert → Kubernetes credit higher but still uncapped', async () => {
    const token = await registerCandidate();

    // expert = level 3 → rawCredit = (3/4) * 0.70 = 0.525 → capped_credit: 53, is_capped: false
    await api('PUT', '/v1/candidates/me', {
      skills: [{
        ontology_id: 'fhp:skill:docker',
        label:       'Docker',
        proficiency: 'expert',
        years:       4,
      }],
    }, token);

    const { status, data } = await api('GET', '/v1/candidates/me/transfer-credits', undefined, token);

    expect(status).toBe(200);
    const kubeCredit = data.transfer_credits.find((c: any) => c.target_skill_label === 'Kubernetes');
    expect(kubeCredit).toBeDefined();
    expect(kubeCredit.raw_credit).toBe(52);    // Math.round(3/4 * 0.70 * 100) = Math.round(52.5) = 52 (IEEE 754)
    expect(kubeCredit.capped_credit).toBe(52);
    expect(kubeCredit.is_capped).toBe(false);
  });

  test('14.4 — unauthenticated request → 401', async () => {
    const { status } = await api('GET', '/v1/candidates/me/transfer-credits');
    expect(status).toBe(401);
  });

});
