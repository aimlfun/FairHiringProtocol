import { type Page, type Browser, expect } from '@playwright/test';

export const API_BASE = 'http://localhost:3000';

let _counter = Date.now();
export function uniqueEmail(): string {
  return `e2e-${++_counter}@fhp-test.local`;
}

export const TEST_PASSWORD = 'TestPassword123!';

/**
 * Register a new candidate via the landing page UI.
 * Returns the email used.
 */
export async function registerCandidate(page: Page, email: string, password = TEST_PASSWORD): Promise<void> {
  await page.goto('/landing-page.html');
  await page.waitForLoadState('networkidle');

  // Open the auth modal (registration form is inside a hidden modal)
  await page.locator('button.nav-cta', { hasText: 'Get started' }).click();
  await page.locator('#modal').waitFor({ state: 'visible' });

  // Modal defaults to candidate register tab
  await page.locator('#creg-email').fill(email);
  await page.locator('#creg-password').fill(password);
  await page.locator('#age-confirm').check();
  await page.locator('#terms-confirm').check();
  await page.locator('#creg-btn').click();

  // Wait for redirect to candidate app
  await page.waitForURL('**/candidate-app**', { timeout: 10_000 });
}

/**
 * Log in as an existing candidate via the landing page UI.
 */
export async function loginCandidate(page: Page, email: string, password = TEST_PASSWORD): Promise<void> {
  await page.goto('/landing-page.html');
  await page.waitForLoadState('networkidle');

  // Open the auth modal
  await page.locator('button.nav-cta', { hasText: 'Get started' }).click();
  await page.locator('#modal').waitFor({ state: 'visible' });

  // Switch to login tab (modal defaults to register)
  await page.locator('#tab-candidate button.mode-btn', { hasText: 'Sign in' }).click();
  await page.locator('#clog-email').fill(email);
  await page.locator('#clog-password').fill(password);
  await page.locator('#clog-btn').click();

  await page.waitForURL('**/candidate-app**', { timeout: 10_000 });
}

/**
 * Navigate to a top-level page in the candidate app.
 *
 * Valid names: dashboard, matches, profile, appeals, data, rights
 *
 * Skills, work history, and preferences are all sections within the
 * profile page — navigate there with goToTab(page, 'profile').
 */
export async function goToTab(page: Page, tab: string): Promise<void> {
  // Map shorthand aliases that live inside the profile page
  const profileSections = new Set(['skills', 'history', 'preferences', 'certs']);
  const navTarget = profileSections.has(tab) ? 'profile' : tab;

  await page.locator(`#nav-${navTarget}`).click();
  await page.waitForTimeout(400); // allow lazy tab render
}

/**
 * Read the current profile strength percentage shown in the sidebar.
 * Returns a number 0–100.
 */
export async function profileStrengthPct(page: Page): Promise<number> {
  const text = await page.locator('.strength-pct').first().textContent();
  return parseInt(text?.replace('%', '') ?? '0', 10);
}

/**
 * Save the current profile — waits for the "✓ Saved" indicator or error message.
 * Throws if the save appears to have failed (error element is shown).
 */
export async function saveProfile(page: Page): Promise<void> {
  // Wait for PUT /candidates/me to complete
  const [response] = await Promise.all([
    page.waitForResponse(
      r => r.url().includes('/candidates/me') && r.request().method() === 'PUT',
      { timeout: 10_000 }
    ),
    page.locator('#profile-save-btn').click(),
  ]);

  if (!response.ok()) {
    const body = await response.text().catch(() => '');
    throw new Error(`saveProfile: API returned ${response.status()}. Body: ${body}`);
  }
  // Small wait for DOM feedback to settle
  await page.waitForTimeout(300);
}

/**
 * Register one user via the landing page, capture their token, and return it.
 * Use this in beforeAll to share a single registration across read-only tests.
 */
export async function registerAndCaptureToken(browser: Browser): Promise<string> {
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto('/landing-page.html');
  await page.waitForLoadState('networkidle');
  await page.locator('button.nav-cta', { hasText: 'Get started' }).click();
  await page.locator('#modal').waitFor({ state: 'visible' });
  await page.locator('#creg-email').fill(uniqueEmail());
  await page.locator('#creg-password').fill(TEST_PASSWORD);
  await page.locator('#age-confirm').check();
  await page.locator('#terms-confirm').check();
  await page.locator('#creg-btn').click();
  await page.waitForURL('**/candidate-app**', { timeout: 15_000 });

  const token = await page.evaluate(() =>
    sessionStorage.getItem('fhp_access_token') ?? ''
  );
  await ctx.close();
  return token;
}

/**
 * Navigate to candidate-app with a pre-captured token injected into
 * sessionStorage. Uses addInitScript so the token is present before
 * the page's own JS runs (avoids the 401-redirect race that page.reload()
 * caused when the token was set after navigation).
 */
export async function injectTokenAndLoad(page: Page, token: string): Promise<void> {
  await page.addInitScript(([t, r]: [string, string]) => {
    sessionStorage.setItem('fhp_access_token', t);
    sessionStorage.setItem('fhp_role', r);
  }, [token, 'candidate']);

  const [,] = await Promise.all([
    page.waitForResponse(
      r => r.url().includes('/candidates/me') && r.request().method() === 'GET',
      { timeout: 10_000 }
    ),
    page.goto('/candidate-app'),
  ]);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
}

/**
 * Reload the page and wait for loadProfile() to finish populating the UI.
 */
export async function reloadAndWait(page: Page): Promise<void> {
  const [,] = await Promise.all([
    page.waitForResponse(
      r => r.url().includes('/candidates/me') && r.request().method() === 'GET',
      { timeout: 10_000 }
    ),
    page.reload(),
  ]);
  // Give the DOM update (renderSkills, chip toggles etc.) a moment to complete
  await page.waitForTimeout(500);
}
