import { test, expect } from '@playwright/test';
import {
  uniqueEmail,
  registerCandidate,
  goToTab,
  API_BASE,
  TEST_PASSWORD,
} from './helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiFetch(
  url: string,
  method: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; data: any }> {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    throw new Error(
      `${method} ${url} → HTTP ${res.status}: ${JSON.stringify(data)}`,
    );
  }
  return { status: res.status, data };
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.describe('End-to-end matching simulation', () => {

  test(
    'candidate with skills matches against an active job brief and the result appears in the UI',
    async ({ page }) => {

      // ── Step 1: Register a candidate via the landing-page UI ──────────────

      const candidateEmail = uniqueEmail();
      await registerCandidate(page, candidateEmail);

      const candidateToken = await page.evaluate(
        () => sessionStorage.getItem('fhp_access_token') ?? '',
      );
      expect(candidateToken).not.toBe('');

      // ── Step 2: Build a matchable profile via API ─────────────────────────

      await apiFetch(
        `${API_BASE}/v1/candidates/me`,
        'PUT',
        {
          skills: [
            {
              ontology_id:      'fhp:skill:python',
              label:            'Python',
              domain:           'Engineering',
              proficiency:      'proficient',
              years_experience: 4,
            },
          ],
          preferences: {
            salary_min:          50000,
            salary_currency:     'GBP',
            work_mode:           ['remote'],
            employment_type:     ['permanent'],
            location_countries:  ['GB'],
          },
        },
        candidateToken,
      );

      // Verify matching_eligible flipped to true
      const { data: profile } = await apiFetch(
        `${API_BASE}/v1/candidates/me`,
        'GET',
        undefined,
        candidateToken,
      );
      expect(profile.matching_eligible).toBe(true);

      // ── Step 3: Register a company ─────────────────────────────────────────

      const { data: company } = await apiFetch(
        `${API_BASE}/v1/auth/register-company`,
        'POST',
        {
          legal_name:                    `E2E Simulation Co ${Date.now()}`,
          jurisdiction:                  'GB',
          compliance_contact_email:      uniqueEmail(),
          password:                      TEST_PASSWORD,
          declared_monthly_roles:        5,
          compliance_agreement_accepted: true,
        },
      );

      expect(company.status).toBe('active');
      const companyToken: string = company.access_token;

      // ── Step 4: Create an active job brief ────────────────────────────────

      const { data: job } = await apiFetch(
        `${API_BASE}/v1/jobs`,
        'POST',
        {
          title:            'Python Developer',
          role_summary:     'Building data pipelines and automation tooling in Python.',
          skills_required:  [
            {
              ontology_id:      'fhp:skill:python',
              label:            'Python',
              domain:           'Engineering',
              requirement_type: 'must_have',
              min_proficiency:  'practitioner',
            },
          ],
          salary_currency:   'GBP',
          salary_minimum:    50000,
          salary_maximum:    80000,
          work_mode:         'remote',
          location_country:  'GB',
          employment_type:   'permanent',
          attest_no_degree_requirement:     true,
          attest_no_institution_preference: true,
          attest_no_graduation_year_filter: true,
          attest_no_unpaid_work:            true,
        },
        companyToken,
      );

      expect(job.status).toBe('active');
      const jobId: string = job.job_id;

      // ── Step 5: Trigger the match pipeline ───────────────────────────────

      const { status: matchStatus, data: matchResult } = await apiFetch(
        `${API_BASE}/v1/matches`,
        'POST',
        { job_id: jobId },
        candidateToken,
      );

      expect(matchStatus).toBe(201);
      expect(matchResult).toHaveProperty('match_id');
      expect(matchResult).toHaveProperty('decision');
      expect(matchResult).toHaveProperty('score');
      expect(['matched', 'not_matched', 'borderline']).toContain(matchResult.decision);
      expect(typeof matchResult.score).toBe('number');

      // ── Step 6: Verify match appears in the candidate's history via API ───

      const { data: history } = await apiFetch(
        `${API_BASE}/v1/candidates/me/matches`,
        'GET',
        undefined,
        candidateToken,
      );

      expect(history.total).toBeGreaterThanOrEqual(1);
      const found = history.matches.find(
        (m: any) => m.match_id === matchResult.match_id,
      );
      expect(found).toBeDefined();
      expect(found.job_title).toBe('Python Developer');
      expect(found.decision).toBe(matchResult.decision);

      // ── Step 7: Verify the match card appears in the candidate app UI ─────

      await goToTab(page, 'matches');
      // Allow loadMatches() to complete and animate cards in
      await page.waitForTimeout(1500);

      // Filter buttons should reflect 1 total match
      const allBtn = page.locator('.ft[data-decision=""]');
      await expect(allBtn).toContainText('(1)');

      // At least one match card must be visible
      await expect(page.locator('#mh-cards .mc').first()).toBeVisible();

      // The card must carry the job title
      await expect(page.locator('#mh-cards .mc-role').first()).toContainText(
        'Python Developer',
      );
    },
  );

});
