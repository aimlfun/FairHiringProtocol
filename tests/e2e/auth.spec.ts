import { test, expect } from '@playwright/test';
import { uniqueEmail, TEST_PASSWORD, registerCandidate, loginCandidate } from './helpers.js';

test.describe('Candidate authentication', () => {

  test('registers a new candidate and lands on My Profile tab', async ({ page }) => {
    const email = uniqueEmail();
    await registerCandidate(page, email);

    await expect(page).toHaveURL(/candidate-app/);
    // Registration sends new users straight to My Profile so they fill in their details first
    await expect(page.locator('#pg-profile')).toBeVisible();
    await expect(page.locator('#pg-dashboard')).toBeHidden();
  });

  test('email field is auto-focused when the Get started modal opens', async ({ page }) => {
    await page.goto('/landing-page.html');
    await page.waitForLoadState('networkidle');
    await page.locator('button.nav-cta', { hasText: 'Get started' }).click();
    await page.locator('#modal').waitFor({ state: 'visible' });
    await page.waitForTimeout(100); // allow the 50 ms setTimeout to fire
    const focusedId = await page.evaluate(() => document.activeElement?.id ?? '');
    expect(focusedId).toBe('creg-email');
  });

  test('submitting register form with blank email focuses the email field', async ({ page }) => {
    await page.goto('/landing-page.html');
    await page.waitForLoadState('networkidle');
    await page.locator('button.nav-cta', { hasText: 'Get started' }).click();
    await page.locator('#modal').waitFor({ state: 'visible' });
    await page.locator('#creg-password').fill(TEST_PASSWORD);
    await page.locator('#age-confirm').check();
    await page.locator('#terms-confirm').check();
    await page.locator('#creg-btn').click();
    await page.waitForTimeout(100);
    const focusedId = await page.evaluate(() => document.activeElement?.id ?? '');
    expect(focusedId).toBe('creg-email');
    await expect(page).toHaveURL(/landing-page/);
  });

  test('submitting register form with blank password focuses the password field', async ({ page }) => {
    await page.goto('/landing-page.html');
    await page.waitForLoadState('networkidle');
    await page.locator('button.nav-cta', { hasText: 'Get started' }).click();
    await page.locator('#modal').waitFor({ state: 'visible' });
    await page.locator('#creg-email').fill(uniqueEmail());
    await page.locator('#age-confirm').check();
    await page.locator('#terms-confirm').check();
    await page.locator('#creg-btn').click();
    await page.waitForTimeout(100);
    const focusedId = await page.evaluate(() => document.activeElement?.id ?? '');
    expect(focusedId).toBe('creg-password');
    await expect(page).toHaveURL(/landing-page/);
  });

  test('login with wrong password shows an error', async ({ page }) => {
    const email = uniqueEmail();
    await registerCandidate(page, email);

    // Go back to landing page and try to log in with wrong password
    await page.goto('/landing-page.html');
    await page.waitForLoadState('networkidle');
    await page.locator('button.nav-cta', { hasText: 'Get started' }).click();
    await page.locator('#modal').waitFor({ state: 'visible' });
    await page.locator('#tab-candidate button.mode-btn', { hasText: 'Sign in' }).click();
    await page.locator('#clog-email').fill(email);
    await page.locator('#clog-password').fill('WrongPassword999!');
    await page.locator('#clog-btn').click();

    await expect(page.locator('#clog-error')).toBeVisible();
    // Should NOT have navigated away
    await expect(page).toHaveURL(/landing-page/);
  });

  test('logs in with correct credentials', async ({ page }) => {
    const email = uniqueEmail();
    await registerCandidate(page, email);

    // Log out by navigating away
    await page.goto('/landing-page.html');
    await loginCandidate(page, email);

    await expect(page).toHaveURL(/candidate-app/);
    await expect(page.locator('#pg-dashboard')).toBeVisible();
  });

  test('registration with password under 12 chars shows error', async ({ page }) => {
    await page.goto('/landing-page.html');
    await page.waitForLoadState('networkidle');
    await page.locator('button.nav-cta', { hasText: 'Get started' }).click();
    await page.locator('#modal').waitFor({ state: 'visible' });

    await page.locator('#creg-email').fill(uniqueEmail());
    await page.locator('#creg-password').fill('short');
    await page.locator('#age-confirm').check();
    await page.locator('#terms-confirm').check();
    await page.locator('#creg-btn').click();

    await expect(page.locator('#creg-error')).toBeVisible();
    await expect(page).toHaveURL(/landing-page/);
  });

  test('registration without accepting terms shows error', async ({ page }) => {
    await page.goto('/landing-page.html');
    await page.waitForLoadState('networkidle');
    await page.locator('button.nav-cta', { hasText: 'Get started' }).click();
    await page.locator('#modal').waitFor({ state: 'visible' });

    await page.locator('#creg-email').fill(uniqueEmail());
    await page.locator('#creg-password').fill(TEST_PASSWORD);
    await page.locator('#age-confirm').check();
    // terms-confirm deliberately NOT checked
    await page.locator('#creg-btn').click();

    await expect(page.locator('#creg-error')).toBeVisible();
    await expect(page).toHaveURL(/landing-page/);
  });

});
