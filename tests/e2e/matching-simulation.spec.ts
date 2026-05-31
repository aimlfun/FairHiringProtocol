import { test, expect } from '@playwright/test';
import {
  uniqueEmail,
  registerCandidate,
  loginCandidate,
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
    async ({ page, browser }) => {

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
      // triggerJobMatching fires async when the job is created and may have already
      // matched this candidate, so POST /v1/matches can return 409 with a match_id.
      // Handle both paths: fresh 201 or existing match via 409 + GET.

      let matchResult: any;
      const matchRaw = await fetch(`${API_BASE}/v1/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${candidateToken}` },
        body: JSON.stringify({ job_id: jobId }),
      });
      const matchRawData = await matchRaw.json();

      if (matchRaw.status === 201) {
        matchResult = matchRawData;
      } else if (matchRaw.status === 409 && matchRawData.match_id) {
        const { data: existing } = await apiFetch(
          `${API_BASE}/v1/candidates/me/matches/${matchRawData.match_id}`,
          'GET', undefined, candidateToken,
        );
        matchResult = existing;
      } else {
        throw new Error(`POST /v1/matches → HTTP ${matchRaw.status}: ${JSON.stringify(matchRawData)}`);
      }

      expect(matchResult).toHaveProperty('match_id');
      expect(matchResult).toHaveProperty('decision');
      expect(['matched', 'not_matched', 'borderline']).toContain(matchResult.decision);

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
      // Navigate to a fresh candidate-app load with the token explicitly injected
      // via addInitScript so sessionStorage is set before any page JS runs.
      // This is the proven pattern from ui-candidate-app.spec.ts.

      // Load candidate-app via the real login flow so landing-page.js calls
      // storeTokens(), which puts the token in sessionStorage BEFORE candidate-app.js
      // reads _token at module scope. addInitScript/evaluate-based approaches do not
      // reliably pre-populate sessionStorage before the module initialises.
      const uiCtx  = await browser.newContext();
      const uiPage = await uiCtx.newPage();
      await loginCandidate(uiPage, candidateEmail);
      // uiPage is now on candidate-app.html with _token correctly set

      await uiPage.locator('#nav-matches').click();
      await uiPage.waitForTimeout(1500);

      const allBtn = uiPage.locator('.ft[data-decision=""]');
      const allText = await allBtn.textContent();
      const totalCount = parseInt(allText!.match(/\((\d+)\)/)?.[1] ?? '0', 10);
      expect(totalCount).toBeGreaterThanOrEqual(1);

      // At least one match card must be visible
      await expect(uiPage.locator('#mh-cards .mc').first()).toBeVisible();

      // A card for our specific job must exist
      await expect(
        uiPage.locator('#mh-cards .mc-role', { hasText: 'Python Developer' }).first(),
      ).toBeVisible();

      await uiCtx.close();
    },
  );

});
