/**
 * Matching decision scenarios.
 *
 * Covers scenarios 4.2–4.19 from TESTING-SCENARIOS.md.
 *
 * All tests are pure API — no browser required.
 * One company is registered once in beforeAll and reused across tests.
 * Each test registers a fresh candidate and creates a dedicated job brief
 * to avoid the 24-hour duplicate-match guard.
 */

import { test, expect } from '@playwright/test';
import { uniqueEmail, API_BASE, TEST_PASSWORD } from './helpers.js';

// ── Shared API helper ─────────────────────────────────────────────────────────

async function api(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

// ── Shared company setup ──────────────────────────────────────────────────────

let companyToken: string;

test.beforeAll(async () => {
  const { data } = await api('POST', '/v1/auth/register-company', {
    legal_name:                    `Decisions Test Co ${Date.now()}`,
    jurisdiction:                  'GB',
    compliance_contact_email:      uniqueEmail(),
    password:                      TEST_PASSWORD,
    declared_monthly_roles:        10,
    compliance_agreement_accepted: true,
  });
  expect(data.status, 'company must be active').toBe('active');
  companyToken = data.access_token;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function registerCandidate(skills: any[], preferences: any = {}): Promise<string> {
  const { data: reg } = await api('POST', '/v1/auth/register', {
    email:             uniqueEmail(),
    password:          TEST_PASSWORD,
    age_confirmed:     true,
    terms_accepted:    true,
  });
  const token: string = reg.access_token;
  await api('PUT', '/v1/candidates/me', { skills, preferences }, token);
  return token;
}

async function createJob(overrides: any = {}): Promise<string> {
  const { data } = await api('POST', '/v1/jobs', {
    title:            overrides.title ?? 'Test Role',
    role_summary:     'Test role for automated matching decision tests.',
    skills_required:  overrides.skills_required ?? [{
      ontology_id:      'fhp:skill:python',
      label:            'Python',
      domain:           'Engineering',
      requirement_type: 'must_have',
      min_proficiency:  'practitioner',
    }],
    salary_currency:  'GBP',
    salary_minimum:   50000,
    salary_maximum:   80000,
    work_mode:        overrides.work_mode ?? 'remote',
    location_country: 'GB',
    employment_type:  'permanent',
    attest_no_degree_requirement:     true,
    attest_no_institution_preference: true,
    attest_no_graduation_year_filter: true,
    attest_no_unpaid_work:            true,
    ...overrides,
  }, companyToken);
  return data.job_id as string;
}

async function runMatch(candidateToken: string, jobId: string) {
  return api('POST', '/v1/matches', { job_id: jobId }, candidateToken);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Matching decisions', () => {

  test('not_matched — candidate missing must-have skill', async () => {
    // Candidate has JavaScript; job requires Python as must_have
    const token = await registerCandidate([
      { ontology_id: 'fhp:skill:javascript', label: 'JavaScript', domain: 'Engineering',
        proficiency: 'proficient', years_experience: 3 },
    ], {
      salary_min: 50000, salary_currency: 'GBP',
      work_mode: ['remote'], employment_type: ['permanent'],
    });
    const jobId = await createJob();

    const { status, data } = await runMatch(token, jobId);

    expect(status).toBe(201);
    expect(data.decision).toBe('not_matched');
    expect(data.score).toBe(0);

    // Explanation must list the missing skill as a reason
    const reasons: any[] = data.explanation?.outcome?.not_matched_reasons ?? [];
    expect(reasons.length).toBeGreaterThan(0);
    const missingSkill = reasons.find((r: any) => r.reason_code === 'missing_must_have_skill');
    expect(missingSkill, 'should report missing_must_have_skill').toBeDefined();
    expect(missingSkill.ontology_id).toBe('fhp:skill:python');

    // not_matched decisions are appeal_eligible
    expect(data.explanation?.appeal_eligible).toBe(true);
  });

  test('not_matched — candidate proficiency more than one level below minimum', async () => {
    // aware (0.20) vs expert (0.87) requirement: three levels below → constraint abort
    const token = await registerCandidate([
      { ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
        proficiency: 'aware', years_experience: 1 },
    ], { work_mode: ['remote'], employment_type: ['permanent'] });

    const jobId = await createJob({
      skills_required: [{
        ontology_id:      'fhp:skill:python',
        label:            'Python',
        domain:           'Engineering',
        requirement_type: 'must_have',
        min_proficiency:  'expert',
      }],
    });

    const { status, data } = await runMatch(token, jobId);

    expect(status).toBe(201);
    expect(data.decision).toBe('not_matched');
    expect(data.score).toBe(0);

    const reasons: any[] = data.explanation?.outcome?.not_matched_reasons ?? [];
    const belowMin = reasons.find((r: any) => r.reason_code === 'below_minimum_proficiency');
    expect(belowMin, 'should report below_minimum_proficiency').toBeDefined();
  });

  test('not_matched — work_mode constraint: candidate remote-only, job on_site', async () => {
    // Preference is remote, job is on_site → hard constraint mismatch → abort
    const token = await registerCandidate([
      { ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
        proficiency: 'proficient', years_experience: 3 },
    ], { work_mode: ['remote'] });

    const jobId = await createJob({ work_mode: 'on_site' });

    const { status, data } = await runMatch(token, jobId);

    expect(status).toBe(201);
    expect(data.decision).toBe('not_matched');
    expect(data.score).toBe(0);

    const reasons: any[] = data.explanation?.outcome?.not_matched_reasons ?? [];
    const modeMismatch = reasons.find((r: any) => r.reason_code === 'constraint_work_mode_mismatch');
    expect(modeMismatch, 'should report constraint_work_mode_mismatch').toBeDefined();
  });

  test('borderline — skill present one level below minimum (partial credit, no abort)', async () => {
    // aware (0.20) vs practitioner (0.45) requirement: exactly one level below
    // → partial credit (sMust = 0.20/0.45 ≈ 0.444), no constraint abort
    // With full preference alignment, composite score ≈ 0.592 → borderline
    const token = await registerCandidate([
      { ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
        proficiency: 'aware', years_experience: 1 },
    ], {
      salary_min: 60000, salary_currency: 'GBP',
      work_mode: ['remote'],
      // no employment_type pref → no employment_type constraint check
    });

    const jobId = await createJob({
      skills_required: [{
        ontology_id:      'fhp:skill:python',
        label:            'Python',
        domain:           'Engineering',
        requirement_type: 'must_have',
        min_proficiency:  'practitioner',
      }],
    });

    const { status, data } = await runMatch(token, jobId);

    expect(status).toBe(201);
    expect(data.decision).toBe('borderline');
    expect(data.score).toBeGreaterThanOrEqual(0.50);
    expect(data.score).toBeLessThan(0.60);

    // borderline is also appeal_eligible
    expect(data.explanation?.appeal_eligible).toBe(true);

    // 4.19: plain_language_summary is populated in the explanation
    expect(data.explanation?.plain_language_summary).toBeTruthy();

    // skill_breakdown must show a partial, non-zero score contribution
    const breakdown = data.explanation?.skill_breakdown ?? [];
    const pythonEntry = breakdown.find((b: any) => b.ontology_id === 'fhp:skill:python');
    expect(pythonEntry, 'python must appear in breakdown').toBeDefined();
    // matched=true means non-zero score contribution (partial credit); score < 1 means not fully met
    expect(pythonEntry.score_contribution).toBeGreaterThan(0);
    expect(pythonEntry.score_contribution).toBeLessThan(1);
  });

  test('matched — exact skill and full preference alignment', async () => {
    // proficient (0.70) >= practitioner (0.45) → sMust = 1.0, full preference align
    const token = await registerCandidate([
      { ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
        proficiency: 'proficient', years_experience: 4 },
    ], {
      salary_min: 50000, salary_currency: 'GBP',
      work_mode: ['remote'],
      employment_type: ['permanent'],
      location_countries: ['GB'],
    });

    const jobId = await createJob();

    const { status, data } = await runMatch(token, jobId);

    expect(status).toBe(201);
    expect(data.decision).toBe('matched');
    expect(data.score).toBeGreaterThanOrEqual(0.60);

    // matched decisions are NOT appeal_eligible
    expect(data.explanation?.appeal_eligible).toBe(false);

    // skill score should be 1.0 (full match)
    expect(data.explanation?.scores?.skill_score).toBe(1);

    // 4.10: work mode matches (remote/remote) → preference_alignment_score > 0
    expect(data.explanation?.scores?.preference_alignment_score).toBeGreaterThan(0);
  });

  test('preference alignment raises score — salary in range vs out of range', async () => {
    // Both candidates have the same Python skill (proficient meets practitioner)
    // Candidate A salary_min=50000 → salary fits job range (50k–80k) → aSalary=1.0
    // Candidate B salary_min=90000 → above job max (80k) → aSalary=0.0
    // Both pass constraints (B's mismatch is a preference penalty, not constraint abort
    // because 80000 >= 90000 * 0.85 = 76500).
    // Expected: score_A > score_B, both 'matched'.

    const skill = {
      ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
      proficiency: 'proficient', years_experience: 4,
    };

    const tokenA = await registerCandidate([skill], {
      salary_min: 50000, salary_currency: 'GBP',
      work_mode: ['remote'],
    });
    const tokenB = await registerCandidate([skill], {
      salary_min: 90000, salary_currency: 'GBP',
      work_mode: ['remote'],
    });

    // Separate jobs to avoid duplicate-match guard
    const jobIdA = await createJob({ title: 'Salary Test A' });
    const jobIdB = await createJob({ title: 'Salary Test B' });

    const [resA, resB] = await Promise.all([
      runMatch(tokenA, jobIdA),
      runMatch(tokenB, jobIdB),
    ]);

    expect(resA.data.decision).toBe('matched');
    expect(resB.data.decision).toBe('matched');
    expect(resA.data.score).toBeGreaterThan(resB.data.score);
  });

  test('pipeline trace is written and accessible after a match', async () => {
    const token = await registerCandidate([
      { ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
        proficiency: 'proficient', years_experience: 3 },
    ], { work_mode: ['remote'] });

    const jobId = await createJob({ title: 'Trace Test' });

    const { data: matchData } = await runMatch(token, jobId);
    const matchId: string = matchData.match_id;

    const { status, data: trace } = await api(
      'GET', `/v1/candidates/me/matches/${matchId}/trace`, undefined, token,
    );

    expect(status).toBe(200);
    expect(trace).toHaveProperty('trace_id');
    expect(trace).toHaveProperty('status');
    // Trace must record all completed stages
    expect(Array.isArray(trace.stages)).toBe(true);
    expect(trace.stages.length).toBeGreaterThan(0);
  });

  test('duplicate match within 24h is rejected with 409', async () => {
    const token = await registerCandidate([
      { ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
        proficiency: 'proficient', years_experience: 3 },
    ], { work_mode: ['remote'] });

    const jobId = await createJob({ title: 'Dupe Guard Test' });

    // First run — must succeed
    const { status: s1 } = await runMatch(token, jobId);
    expect(s1).toBe(201);

    // Second run within 24h — must be rejected
    const { status: s2, data: d2 } = await runMatch(token, jobId);
    expect(s2).toBe(409);
    expect(d2.error).toBe('CONFLICT');
  });

  test('not_matched — employment_type constraint: candidate contract-only, job permanent', async () => {
    const token = await registerCandidate([
      { ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
        proficiency: 'proficient', years_experience: 3 },
    ], { employment_type: ['contract'] });

    const jobId = await createJob({ title: 'Employment Type Test' });
    // Default job employment_type is 'permanent'; candidate only accepts 'contract'

    const { status, data } = await runMatch(token, jobId);

    expect(status).toBe(201);
    expect(data.decision).toBe('not_matched');
    expect(data.score).toBe(0);

    const reasons: any[] = data.explanation?.outcome?.not_matched_reasons ?? [];
    const mismatch = reasons.find((r: any) => r.reason_code === 'constraint_employment_type_mismatch');
    expect(mismatch, 'should report constraint_employment_type_mismatch').toBeDefined();
  });

  test('nice-to-have skill raises score above candidate without it', async () => {
    // Both candidates meet the must-have Python requirement.
    // Candidate A also has TypeScript (nice_to_have) → sNice=1.0 → higher composite.
    // Candidate B has Python only → sNice=0.0 → lower composite.
    const skillsRequired = [
      { ontology_id: 'fhp:skill:python',     label: 'Python',     domain: 'Engineering',
        requirement_type: 'must_have',    min_proficiency: 'practitioner' },
      { ontology_id: 'fhp:skill:typescript', label: 'TypeScript', domain: 'Engineering',
        requirement_type: 'nice_to_have', min_proficiency: 'practitioner' },
    ];

    const tokenA = await registerCandidate([
      { ontology_id: 'fhp:skill:python',     label: 'Python',     domain: 'Engineering',
        proficiency: 'proficient', years_experience: 4 },
      { ontology_id: 'fhp:skill:typescript', label: 'TypeScript', domain: 'Engineering',
        proficiency: 'proficient', years_experience: 3 },
    ]);
    const tokenB = await registerCandidate([
      { ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
        proficiency: 'proficient', years_experience: 4 },
    ]);

    const [jobIdA, jobIdB] = await Promise.all([
      createJob({ title: 'NiceToHave Test A', skills_required: skillsRequired }),
      createJob({ title: 'NiceToHave Test B', skills_required: skillsRequired }),
    ]);

    const [resA, resB] = await Promise.all([
      runMatch(tokenA, jobIdA),
      runMatch(tokenB, jobIdB),
    ]);

    expect(resA.data.decision).toBe('matched');
    expect(resB.data.decision).toBe('matched');
    expect(resA.data.score).toBeGreaterThan(resB.data.score);

    const breakdownA = resA.data.explanation?.skill_breakdown ?? [];
    const tsEntry = breakdownA.find((b: any) => b.ontology_id === 'fhp:skill:typescript');
    expect(tsEntry, 'TypeScript must appear in breakdown for candidate A').toBeDefined();
    expect(tsEntry.score_contribution).toBeGreaterThan(0);
  });

  test('transferable skill (docker→kubernetes) compensates for missing nice-to-have', async () => {
    // Docker transfers to Kubernetes at weight 0.70 per the ontology.
    // The constraint stage does not abort on missing nice-to-have skills, so stage 5 runs
    // and applies the transfer credit before the composite score is computed.
    // Candidate A gets partial nice-to-have credit; candidate B gets none.
    const skillsRequired = [
      { ontology_id: 'fhp:skill:python',     label: 'Python',     domain: 'Engineering',
        requirement_type: 'must_have',    min_proficiency: 'practitioner' },
      { ontology_id: 'fhp:skill:kubernetes', label: 'Kubernetes', domain: 'Engineering',
        requirement_type: 'nice_to_have', min_proficiency: 'practitioner' },
    ];

    const tokenA = await registerCandidate([
      { ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
        proficiency: 'proficient', years_experience: 4 },
      { ontology_id: 'fhp:skill:docker', label: 'Docker', domain: 'Engineering',
        proficiency: 'proficient', years_experience: 3 },
    ]);
    const tokenB = await registerCandidate([
      { ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
        proficiency: 'proficient', years_experience: 4 },
    ]);

    const [jobIdA, jobIdB] = await Promise.all([
      createJob({ title: 'Transfer Test A', skills_required: skillsRequired }),
      createJob({ title: 'Transfer Test B', skills_required: skillsRequired }),
    ]);

    const [resA, resB] = await Promise.all([
      runMatch(tokenA, jobIdA),
      runMatch(tokenB, jobIdB),
    ]);

    expect(resA.data.decision).toBe('matched');
    expect(resB.data.decision).toBe('matched');
    expect(resA.data.score).toBeGreaterThan(resB.data.score);

    // Kubernetes entry for A must show partial credit from the transfer
    const breakdownA = resA.data.explanation?.skill_breakdown ?? [];
    const k8sEntry = breakdownA.find((b: any) => b.ontology_id === 'fhp:skill:kubernetes');
    expect(k8sEntry, 'kubernetes must appear in breakdown').toBeDefined();
    expect(k8sEntry.score_contribution).toBeGreaterThan(0);
    expect(k8sEntry.score_contribution).toBeLessThan(1); // partial, not full credit
  });

  test('location preference match raises score vs mismatch (soft penalty, not hard constraint)', async () => {
    // Job is on_site in GB. Neither candidate sets work_mode preferences (no constraint check).
    // Candidate A prefers GB → aLocation=1.0; Candidate B prefers US → aLocation=0.5.
    // Both must reach a positive decision; A must score higher than B.
    const tokenA = await registerCandidate([
      { ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
        proficiency: 'proficient', years_experience: 4 },
    ], { location_countries: ['GB'] });
    const tokenB = await registerCandidate([
      { ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
        proficiency: 'proficient', years_experience: 4 },
    ], { location_countries: ['US'] });

    const [jobIdA, jobIdB] = await Promise.all([
      createJob({ title: 'Location Test A', work_mode: 'on_site' }),
      createJob({ title: 'Location Test B', work_mode: 'on_site' }),
    ]);

    const [resA, resB] = await Promise.all([
      runMatch(tokenA, jobIdA),
      runMatch(tokenB, jobIdB),
    ]);

    // Location is a preference, not a hard constraint — neither candidate is rejected
    expect(resA.data.decision).not.toBe('not_matched');
    expect(resB.data.decision).not.toBe('not_matched');
    expect(resA.data.score).toBeGreaterThan(resB.data.score);
  });

  test('match against inactive job (draft status) → 422 JOB_NOT_ACTIVE', async () => {
    // Omitting one attestation creates the job with status='draft' (not 'active').
    // The matching route only accepts jobs with status='active'.
    const token = await registerCandidate([
      { ontology_id: 'fhp:skill:python', label: 'Python', domain: 'Engineering',
        proficiency: 'proficient', years_experience: 3 },
    ], { work_mode: ['remote'] });

    const jobId = await createJob({
      title: 'Inactive Job Test',
      attest_no_degree_requirement: false, // overrides default true → status = 'draft'
    });

    const { status, data } = await runMatch(token, jobId);
    expect(status).toBe(422);
    expect(data.error).toBe('JOB_NOT_ACTIVE');
  });

  test('ineligible candidate (no skills) cannot trigger a match', async () => {
    const { data: reg } = await api('POST', '/v1/auth/register', {
      email:          uniqueEmail(),
      password:       TEST_PASSWORD,
      age_confirmed:  true,
      terms_accepted: true,
    });
    const token: string = reg.access_token;
    // No skills PUT → matching_eligible stays false

    const jobId = await createJob({ title: 'Ineligible Test' });

    const { status, data } = await runMatch(token, jobId);
    expect(status).toBe(422);
    expect(data.error).toMatch(/VALIDATION_ERROR|MATCHING_INELIGIBLE/);
  });

});
