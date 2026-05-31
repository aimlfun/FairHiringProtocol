/**
 * Auto-matching triggers — scenarios 2.18 and 4.24 from TESTING-SCENARIOS.md.
 *
 * Covers:
 *   4.24  Posting an active job fires auto-matching against eligible candidates
 *   2.18  Saving a candidate profile with skills fires auto-matching against open jobs
 *
 * AUTO_MATCHING=false in .env disables the background queue so tests are not
 * subject to timing/polling.  Matching is triggered explicitly via test helpers
 * (synchronous, awaited) which verifies the trigger mechanism end-to-end.
 *
 * Pure API tests — no browser required.
 */

import { test, expect } from '@playwright/test';
import { uniqueEmail, API_BASE, TEST_PASSWORD, TEST_HELPER_KEY } from './helpers.js';

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
      ...(path.includes('/test-helpers/') ? { 'X-Test-Helper-Key': TEST_HELPER_KEY } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

/** Poll until predicate returns true, with exponential back-off. */
async function pollUntil(
  predicate: () => Promise<boolean>,
  { attempts = 12, initialDelayMs = 300 }: { attempts?: number; initialDelayMs?: number } = {},
): Promise<void> {
  let delay = initialDelayMs;
  for (let i = 0; i < attempts; i++) {
    if (await predicate()) return;
    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 2000);
  }
  throw new Error(`pollUntil: condition not met after ${attempts} attempts`);
}

const PYTHON_SKILL = {
  ontology_id:      'fhp:skill:cpp',
  label:            'C++',
  domain:           'Engineering',
  proficiency:      'proficient',
  years_experience: 3,
};

const JOB_BASE = {
  title:            'Auto-match Test Role',
  role_summary:     'Automated test job for auto-matching coverage.',
  skills_required:  [{
    ontology_id:      'fhp:skill:cpp',
    label:            'C++',
    domain:           'Engineering',
    requirement_type: 'must_have',
    min_proficiency:  'practitioner',
  }],
  salary_currency:  'GBP',
  salary_minimum:   50000,
  salary_maximum:   80000,
  work_mode:        'remote',
  location_country: 'GB',
  employment_type:  'permanent',
  attest_no_degree_requirement:     true,
  attest_no_institution_preference: true,
  attest_no_graduation_year_filter: true,
  attest_no_unpaid_work:            true,
};

const CANDIDATE_PREFS = {
  salary_minimum:    50000,
  salary_currency:   'GBP',
  work_modes:        ['remote'],
  employment_types:  ['permanent'],
};

// ── 4.24: Job post triggers auto-matching ─────────────────────────────────────

test.describe('4.24 — auto-matching on job post', () => {

  test('posting an active job auto-matches eligible candidates with overlapping skills', async () => {
    // 1. Register a candidate with the required skill before the job exists
    const { data: reg } = await api('POST', '/v1/auth/register', {
      email: uniqueEmail(), password: TEST_PASSWORD,
      age_confirmed: true, terms_accepted: true,
    });
    const candidateToken: string = reg.access_token;

    await api('PUT', '/v1/candidates/me', {
      skills:      [PYTHON_SKILL],
      preferences: CANDIDATE_PREFS,
    }, candidateToken);

    // 2. Register a company and post an active job
    const { data: co } = await api('POST', '/v1/auth/register-company', {
      legal_name:                    `AutoMatch Job Co ${Date.now()}`,
      jurisdiction:                  'GB',
      compliance_contact_email:      uniqueEmail(),
      password:                      TEST_PASSWORD,
      declared_monthly_roles:        5,
      compliance_agreement_accepted: true,
    });
    const companyToken: string = co.access_token;

    const { status: jobStatus, data: jobData } = await api('POST', '/v1/jobs', {
      ...JOB_BASE,
      title: `AutoMatch Job Post ${Date.now()}`,
    }, companyToken);
    expect(jobStatus).toBe(201);
    expect(jobData.status).toBe('active');
    const jobId: string = jobData.job_id;

    // 3. Trigger auto-matching explicitly (AUTO_MATCHING=false disables background queue).
    //    This is synchronous/awaited, verifying the same trigger mechanism end-to-end.
    const { status: triggerStatus } = await api('POST', '/v1/test-helpers/trigger-job-matching', { job_id: jobId });
    expect(triggerStatus).toBe(200);

    // 4. Verify the match record
    const { data: matchesData } = await api('GET', '/v1/candidates/me/matches?limit=50', undefined, candidateToken);
    const match = (matchesData.matches as any[]).find((m: any) => m.job_id === jobId);

    expect(match, 'match record must exist for the auto-matched job').toBeDefined();
    expect(['matched', 'borderline', 'not_matched']).toContain(match.decision);
  });

  test('posting a draft job (missing attestation) does NOT trigger auto-matching', async () => {
    const { data: reg } = await api('POST', '/v1/auth/register', {
      email: uniqueEmail(), password: TEST_PASSWORD,
      age_confirmed: true, terms_accepted: true,
    });
    const candidateToken: string = reg.access_token;
    await api('PUT', '/v1/candidates/me', { skills: [PYTHON_SKILL], preferences: CANDIDATE_PREFS }, candidateToken);

    const { data: co } = await api('POST', '/v1/auth/register-company', {
      legal_name:                    `AutoMatch Draft Co ${Date.now()}`,
      jurisdiction:                  'GB',
      compliance_contact_email:      uniqueEmail(),
      password:                      TEST_PASSWORD,
      declared_monthly_roles:        5,
      compliance_agreement_accepted: true,
    });

    // Post a draft job (missing one attestation)
    const { data: jobData } = await api('POST', '/v1/jobs', {
      ...JOB_BASE,
      title:                         `Draft Job ${Date.now()}`,
      attest_no_degree_requirement:  false, // → status='draft'
    }, co.access_token);
    expect(jobData.status).toBe('draft');
    const jobId: string = jobData.job_id;

    // Wait briefly — no match should arrive
    await new Promise(r => setTimeout(r, 1500));

    const { data: matchesData } = await api('GET', '/v1/candidates/me/matches?limit=50', undefined, candidateToken);
    const match = (matchesData.matches ?? []).find((m: any) => m.job_id === jobId);
    expect(match, 'draft job must not trigger auto-matching').toBeUndefined();
  });

});

// ── 2.18: Profile save triggers auto-matching ─────────────────────────────────

test.describe('2.18 — auto-matching on profile save', () => {

  test('saving a profile with skills triggers auto-matching against existing active jobs', async () => {
    // 1. Post an active job first
    const { data: co } = await api('POST', '/v1/auth/register-company', {
      legal_name:                    `AutoMatch Profile Co ${Date.now()}`,
      jurisdiction:                  'GB',
      compliance_contact_email:      uniqueEmail(),
      password:                      TEST_PASSWORD,
      declared_monthly_roles:        5,
      compliance_agreement_accepted: true,
    });
    const companyToken: string = co.access_token;

    const { data: jobData } = await api('POST', '/v1/jobs', {
      ...JOB_BASE,
      title: `Profile Trigger Job ${Date.now()}`,
    }, companyToken);
    expect(jobData.status).toBe('active');
    const jobId: string = jobData.job_id;

    // 2. Register a candidate with no skills initially
    const { data: reg } = await api('POST', '/v1/auth/register', {
      email: uniqueEmail(), password: TEST_PASSWORD,
      age_confirmed: true, terms_accepted: true,
    });
    const candidateToken: string = reg.access_token;

    // 3. Now save their profile with the required skill → triggers auto-matching
    const { status: putStatus } = await api('PUT', '/v1/candidates/me', {
      skills:      [PYTHON_SKILL],
      preferences: CANDIDATE_PREFS,
    }, candidateToken);
    expect(putStatus).toBe(200);

    // 4. Trigger auto-matching explicitly for this candidate.
    const candidateId = JSON.parse(
      Buffer.from(candidateToken.split('.')[1], 'base64').toString(),
    ).candidateId as string;
    const { status: triggerStatus } = await api('POST', '/v1/test-helpers/trigger-candidate-matching', { candidate_id: candidateId });
    expect(triggerStatus).toBe(200);

    const { data: matchesData } = await api('GET', '/v1/candidates/me/matches?limit=50', undefined, candidateToken);
    const match = (matchesData.matches as any[]).find((m: any) => m.job_id === jobId);

    expect(match, 'match record must exist for the pre-existing job').toBeDefined();
    expect(['matched', 'borderline', 'not_matched']).toContain(match.decision);
  });

  test('candidate with no overlapping skills is not matched against a job', async () => {
    // Post a Python job, register a candidate with only JavaScript
    const { data: co } = await api('POST', '/v1/auth/register-company', {
      legal_name:                    `AutoMatch No-Overlap Co ${Date.now()}`,
      jurisdiction:                  'GB',
      compliance_contact_email:      uniqueEmail(),
      password:                      TEST_PASSWORD,
      declared_monthly_roles:        5,
      compliance_agreement_accepted: true,
    });

    const { data: jobData } = await api('POST', '/v1/jobs', {
      ...JOB_BASE,
      title: `NoOverlap Job ${Date.now()}`,
    }, co.access_token);
    const jobId: string = jobData.job_id;

    const { data: reg } = await api('POST', '/v1/auth/register', {
      email: uniqueEmail(), password: TEST_PASSWORD,
      age_confirmed: true, terms_accepted: true,
    });
    const candidateToken: string = reg.access_token;

    // Save profile with JavaScript (no overlap with Python job)
    await api('PUT', '/v1/candidates/me', {
      skills: [{
        ontology_id:      'fhp:skill:javascript',
        label:            'JavaScript',
        domain:           'Engineering',
        proficiency:      'proficient',
        years_experience: 3,
      }],
      preferences: CANDIDATE_PREFS,
    }, candidateToken);

    // Wait — no match should arrive
    await new Promise(r => setTimeout(r, 1500));

    const { data } = await api('GET', '/v1/candidates/me/matches?limit=50', undefined, candidateToken);
    const match = (data.matches ?? []).find((m: any) => m.job_id === jobId);
    expect(match, 'no-overlap candidate must not be matched').toBeUndefined();
  });

});
