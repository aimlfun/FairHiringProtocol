/**
 * Candidate profile API edge cases — scenarios 2.13, 2.15 from TESTING-SCENARIOS.md.
 *
 * Covers:
 *   PUT /v1/candidates/me
 *   - ontology skill IDs are accepted and round-trip through GET (2.13)
 *   - empty skills array sets matching_eligible to false (2.15)
 *   - skills array with valid entries sets matching_eligible to true
 *   - required field validation
 *
 *   GET /v1/ontology/skills
 *   - C# and C++ are searchable by their common symbols (regression: these were absent
 *     from the hardcoded ALL_SKILLS fallback list in the candidate UI, causing silent
 *     no-results for a live API that actually has them)
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

test.describe('Candidate profile API', () => {

  test('2.13 — ontology skill ID round-trips through save/GET', async () => {
    const token = await registerCandidate();

    const putRes = await api('PUT', '/v1/candidates/me', {
      skills: [{
        ontology_id:  'fhp:skill:python',
        label:        'Python',
        proficiency:  'proficient',
        years:        3,
      }],
    }, token);

    expect(putRes.status).toBe(200);

    const { status, data } = await api('GET', '/v1/candidates/me', undefined, token);

    expect(status).toBe(200);
    expect(Array.isArray(data.skills)).toBe(true);
    const skill = data.skills.find((s: any) => s.ontology_id === 'fhp:skill:python');
    expect(skill, 'python skill with ontology_id must be returned by GET').toBeDefined();
    expect(skill.proficiency).toBe('proficient');
  });

  test('2.15 — empty skills array sets matching_eligible to false', async () => {
    const token = await registerCandidate();

    // First add a skill to set matching_eligible=true
    await api('PUT', '/v1/candidates/me', {
      skills: [{
        ontology_id: 'fhp:skill:python',
        label:       'Python',
        proficiency: 'practitioner',
        years:       1,
      }],
    }, token);

    // Confirm eligible
    const afterAdd = await api('GET', '/v1/candidates/me', undefined, token);
    expect(afterAdd.data.matching_eligible).toBe(true);

    // Now clear skills
    await api('PUT', '/v1/candidates/me', { skills: [] }, token);

    const { status, data } = await api('GET', '/v1/candidates/me', undefined, token);

    expect(status).toBe(200);
    expect(data.matching_eligible).toBe(false);
    expect(data.skills).toHaveLength(0);
  });

  test('2.16 — skills with entries → matching_eligible auto-set to true', async () => {
    const token = await registerCandidate();

    // Fresh account — not eligible
    const fresh = await api('GET', '/v1/candidates/me', undefined, token);
    expect(fresh.data.matching_eligible).toBe(false);

    await api('PUT', '/v1/candidates/me', {
      skills: [{
        ontology_id: 'fhp:skill:react',
        label:       'React',
        proficiency: 'practitioner',
        years:       1,
      }],
    }, token);

    const after = await api('GET', '/v1/candidates/me', undefined, token);
    expect(after.data.matching_eligible).toBe(true);
  });

  test('2.17 — preferences fields survive a PUT round-trip', async () => {
    const token = await registerCandidate();

    const payload = {
      preferences: {
        work_schedule:    ['full_time'],
        right_to_work:    ['uk_citizen'],
        location_type:    ['remote'],
        desired_location: 'London',
        salary_min:       50000,
        salary_max:       80000,
      },
    };

    const putRes = await api('PUT', '/v1/candidates/me', payload, token);
    expect(putRes.status).toBe(200);

    const { data } = await api('GET', '/v1/candidates/me', undefined, token);

    expect(data.preferences.work_schedule).toEqual(['full_time']);
    expect(data.preferences.right_to_work).toEqual(['uk_citizen']);
    expect(data.preferences.location_type).toEqual(['remote']);
    expect(data.preferences.desired_location).toBe('London');
    expect(Number(data.preferences.salary_min)).toBe(50000);
    expect(Number(data.preferences.salary_max)).toBe(80000);
  });

  test('2.14 — location_countries preference saves and restores via API', async () => {
    const token = await registerCandidate();

    await api('PUT', '/v1/candidates/me', {
      preferences: {
        location_countries: ['GB', 'DE'],
        work_mode:          ['remote'],
      },
    }, token);

    const { status, data } = await api('GET', '/v1/candidates/me', undefined, token);

    expect(status).toBe(200);
    const prefs = data.preferences ?? {};
    // Stored as location_countries
    expect(Array.isArray(prefs.location_countries)).toBe(true);
    expect(prefs.location_countries).toContain('GB');
    expect(prefs.location_countries).toContain('DE');
  });

  test('2.18 — GET /candidates/me without auth → 401', async () => {
    const { status } = await api('GET', '/v1/candidates/me');
    expect(status).toBe(401);
  });

  test('2.19 — PUT /candidates/me without auth → 401', async () => {
    const { status } = await api('PUT', '/v1/candidates/me', { skills: [] });
    expect(status).toBe(401);
  });

  // ── Ontology validation ──────────────────────────────────────────────────────

  test('ontology — unknown skill ontology_id is rejected with 400', async () => {
    const token = await registerCandidate();

    const { status, data } = await api('PUT', '/v1/candidates/me', {
      skills: [{
        ontology_id: 'fhp:skill:made-up-nonexistent',
        label:       'Made-up skill',
        proficiency: 'practitioner',
      }],
    }, token);

    expect(status).toBe(400);
    expect(data.message ?? data.error).toMatch(/unknown skill ontology/i);
  });

  test('ontology — skill missing ontology_id is rejected with 400', async () => {
    const token = await registerCandidate();

    const { status, data } = await api('PUT', '/v1/candidates/me', {
      skills: [{ label: 'Python', proficiency: 'practitioner' }],
    }, token);

    expect(status).toBe(400);
    expect(data.message ?? data.error).toMatch(/ontology_id/i);
  });

  test('ontology — valid ontology_id is accepted (regression guard)', async () => {
    const token = await registerCandidate();

    const { status } = await api('PUT', '/v1/candidates/me', {
      skills: [{ ontology_id: 'fhp:skill:python', label: 'Python', proficiency: 'practitioner' }],
    }, token);

    expect(status).toBe(200);
  });

});

// ── Ontology skill search — GET /v1/ontology/skills ───────────────────────────
//
// Regression suite for the skill autocomplete endpoint.  A previous bug caused
// the candidate UI to silently return no results for C# and C++ because the
// frontend fell back to a hardcoded list that omitted both symbols.  These tests
// verify the API itself surfaces every symbol-named skill, so any regression
// (whether in the API query, the DB seed, or a future hardcoded-list reversion)
// is caught before it reaches users.

test.describe('Ontology skill search API', () => {

  test('returns C# by symbol search', async () => {
    const { status, data } = await api('GET', '/v1/ontology/skills?q=c%23');
    expect(status).toBe(200);
    expect(Array.isArray(data.skills)).toBe(true);
    const csharp = data.skills.find((s: any) => s.skill_id === 'fhp:skill:csharp');
    expect(csharp, 'fhp:skill:csharp must appear when searching "c#"').toBeDefined();
    expect(csharp.label).toMatch(/c#/i);
  });

  test('returns C++ by symbol search', async () => {
    const { status, data } = await api('GET', '/v1/ontology/skills?q=c%2B%2B');
    expect(status).toBe(200);
    expect(Array.isArray(data.skills)).toBe(true);
    const cpp = data.skills.find((s: any) => s.skill_id === 'fhp:skill:cpp');
    expect(cpp, 'fhp:skill:cpp must appear when searching "c++"').toBeDefined();
    expect(cpp.label).toMatch(/c\+\+/i);
  });

  test('returns Python by name (baseline)', async () => {
    const { status, data } = await api('GET', '/v1/ontology/skills?q=python');
    expect(status).toBe(200);
    const python = data.skills.find((s: any) => s.skill_id === 'fhp:skill:python');
    expect(python, 'fhp:skill:python must appear when searching "python"').toBeDefined();
  });

  test('returns empty skills array for a nonsense query', async () => {
    const { status, data } = await api('GET', '/v1/ontology/skills?q=xyzzy_no_such_skill_ever');
    expect(status).toBe(200);
    expect(data.skills).toHaveLength(0);
  });

  test('returns all active skills when no query is given', async () => {
    const { status, data } = await api('GET', '/v1/ontology/skills?limit=50');
    expect(status).toBe(200);
    expect(data.skills.length).toBeGreaterThanOrEqual(10);
    // Both symbol-named skills must be present in the full listing
    const ids = data.skills.map((s: any) => s.skill_id);
    expect(ids).toContain('fhp:skill:csharp');
    expect(ids).toContain('fhp:skill:cpp');
  });

});
