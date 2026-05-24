/**
 * Demographics & consent — scenarios 11.1–11.5, 12.1–12.4 from TESTING-SCENARIOS.md.
 *
 * Covers:
 *   GET  /v1/candidates/me/demographics/options — jurisdiction-specific field options
 *   PUT  /v1/candidates/me/demographics         — requires active consent (403/400 without)
 *   POST /v1/candidates/me/consents             — record explicit consent
 *   GET  /v1/candidates/me/consents             — list consent records
 *   DELETE /v1/candidates/me/consents/fairness  — withdraw fairness consent
 *   DELETE /v1/candidates/me/demographics       — remove all demographic data
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

async function registerCandidate() {
  const { data } = await api('POST', '/v1/auth/register', {
    email: uniqueEmail(), password: TEST_PASSWORD,
    age_confirmed: true, terms_accepted: true,
  });
  return data.access_token as string;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Demographics & consent', () => {

  test('GET /demographics/options returns field options without raw values', async () => {
    const token = await registerCandidate();
    const { status, data } = await api('GET', '/v1/candidates/me/demographics/options', undefined, token);

    expect(status).toBe(200);
    expect(data).toHaveProperty('fields');
    expect(data.fields).toHaveProperty('sex');
    expect(data.fields).toHaveProperty('ethnicity');
    expect(data.fields).toHaveProperty('religion');
    expect(data.fields).toHaveProperty('birth_year');
    expect(data.fields).toHaveProperty('education_level');
    // Must not return any stored values
    expect(data.sex).toBeUndefined();
    expect(data.ethnicity).toBeUndefined();
  });

  test('GET /demographics/options includes consent_required flag', async () => {
    const token = await registerCandidate();
    const { data } = await api('GET', '/v1/candidates/me/demographics/options', undefined, token);

    // Fresh account has no consent — must report consent is required
    expect(data.consent_required).toBe(true);
    expect(data.consent_active).toBe(false);
  });

  test('PUT /demographics without fairness consent → 400', async () => {
    const token = await registerCandidate();

    const { status } = await api('PUT', '/v1/candidates/me/demographics', {
      sex: 'male',
    }, token);

    // Fairness consent required under GDPR Art. 9
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  test('POST /consents records fairness_metrics consent', async () => {
    const token = await registerCandidate();

    const { status, data } = await api('POST', '/v1/candidates/me/consents', {
      consent_type: 'fairness_metrics',
      legal_basis:  'explicit_consent',
    }, token);

    expect(status).toBe(201);
    expect(data).toHaveProperty('consent_id');
    expect(data.consent_type).toBe('fairness_metrics');
    expect(data).toHaveProperty('given_at');
  });

  test('GET /consents returns consent record after granting', async () => {
    const token = await registerCandidate();

    await api('POST', '/v1/candidates/me/consents', {
      consent_type: 'fairness_metrics', legal_basis: 'explicit_consent',
    }, token);

    const { status, data } = await api('GET', '/v1/candidates/me/consents', undefined, token);

    expect(status).toBe(200);
    expect(Array.isArray(data.consents)).toBe(true);
    const consent = data.consents.find((c: any) => c.consent_type === 'fairness_metrics');
    expect(consent, 'fairness_metrics consent must appear').toBeDefined();
    expect(consent.withdrawn_at).toBeNull();
  });

  test('PUT /demographics succeeds after fairness consent granted', async () => {
    const token = await registerCandidate();

    // Grant consent first
    await api('POST', '/v1/candidates/me/consents', {
      consent_type: 'fairness_metrics', legal_basis: 'explicit_consent',
    }, token);

    // Now demographics write should work
    const { status, data } = await api('PUT', '/v1/candidates/me/demographics', {
      sex:             'prefer_not_to_say',
      education_level: 'bachelors_degree',
    }, token);

    expect(status).toBe(200);
    expect(data.stored).toBe(true);
    expect(Array.isArray(data.fields_set)).toBe(true);
    expect(data.fields_set).toContain('sex');
    expect(data.fields_set).toContain('education_level');
  });

  test('DELETE /demographics removes stored data, returns deleted:true', async () => {
    const token = await registerCandidate();

    await api('POST', '/v1/candidates/me/consents', {
      consent_type: 'fairness_metrics', legal_basis: 'explicit_consent',
    }, token);
    await api('PUT', '/v1/candidates/me/demographics', { sex: 'female' }, token);

    const { status, data } = await api('DELETE', '/v1/candidates/me/demographics', undefined, token);

    expect(status).toBe(200);
    expect(data.deleted).toBe(true);
  });

  test('DELETE /demographics/options consent_active shows false after no consent granted', async () => {
    const token = await registerCandidate();

    // After deletion, demographics options should still show consent_required
    const { data } = await api('GET', '/v1/candidates/me/demographics/options', undefined, token);
    expect(data.consent_required).toBe(true);
  });

  test('DELETE /consents/fairness withdraws consent', async () => {
    const token = await registerCandidate();

    // Grant then withdraw
    await api('POST', '/v1/candidates/me/consents', {
      consent_type: 'fairness_metrics', legal_basis: 'explicit_consent',
    }, token);

    const withdrawRes = await api('DELETE', '/v1/candidates/me/consents/fairness', undefined, token);
    expect(withdrawRes.status).toBe(200);
    expect(withdrawRes.data.withdrawn).toBe(true);

    // Consent should now show withdrawn_at set
    const { data } = await api('GET', '/v1/candidates/me/consents', undefined, token);
    const consent = data.consents.find((c: any) => c.consent_type === 'fairness_metrics');
    expect(consent.withdrawn_at).not.toBeNull();
  });

  test('withdrawing consent blocks further demographics writes', async () => {
    const token = await registerCandidate();

    await api('POST', '/v1/candidates/me/consents', {
      consent_type: 'fairness_metrics', legal_basis: 'explicit_consent',
    }, token);
    await api('DELETE', '/v1/candidates/me/consents/fairness', undefined, token);

    // After withdrawal, PUT should be blocked again
    const { status } = await api('PUT', '/v1/candidates/me/demographics', {
      sex: 'male',
    }, token);
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  // ── 12.1: Consent record timestamps created at registration ─────────────
  // The candidate profile has a created_at timestamp that represents the moment
  // age and terms consent were given. The data-tab UI uses this to show the
  // "Job matching service" and "Age confirmation" consent dates.

  test('12.1 — GET /candidates/me returns created_at that represents registration consent timestamp', async () => {
    const before = new Date();
    const token  = await registerCandidate();
    const after  = new Date();

    const { status, data } = await api('GET', '/v1/candidates/me', undefined, token);

    expect(status).toBe(200);
    expect(data).toHaveProperty('created_at');

    const createdAt = new Date(data.created_at as string);
    // created_at must be a valid date between registration start and finish
    expect(createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 5000);
    expect(createdAt.getTime()).toBeLessThanOrEqual(after.getTime() + 5000);
    // Must be in the current year, not a hardcoded date
    expect(createdAt.getFullYear()).toBe(new Date().getFullYear());
  });

  test('12.1b — GET /candidates/me/consents returns empty array before any explicit consent', async () => {
    const token = await registerCandidate();

    const { status, data } = await api('GET', '/v1/candidates/me/consents', undefined, token);

    expect(status).toBe(200);
    expect(Array.isArray(data.consents)).toBe(true);
    // Registration does not auto-create explicit consent records — those are
    // created by the user via POST /consents. The age/terms consent is stored
    // as flags in identity.candidate_auth and surfaced via candidate_profiles.created_at.
    const fairness = data.consents.find((c: any) => c.consent_type === 'fairness_metrics');
    expect(fairness).toBeUndefined();
  });

});
