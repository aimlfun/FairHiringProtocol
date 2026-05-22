import { test, expect } from '@playwright/test';

test.describe('Landing page — links and in-page sections', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/landing-page.html');
    await page.waitForLoadState('networkidle');
  });

  // ── In-page sections ─────────────────────────────────────────────────────────

  test('#terms section exists and contains a Terms of Service heading', async ({ page }) => {
    await expect(page.locator('#terms')).toBeAttached();
    await expect(page.locator('#terms h2')).toContainText(/terms/i);
  });

  test('#privacy section exists and contains a Privacy Policy heading', async ({ page }) => {
    await expect(page.locator('#privacy')).toBeAttached();
    await expect(page.locator('#privacy h2')).toContainText(/privacy/i);
  });

  // ── Footer links ─────────────────────────────────────────────────────────────

  test('footer Terms link points to #terms anchor', async ({ page }) => {
    await expect(page.locator('.footer-links a[href="#terms"]')).toBeVisible();
  });

  test('footer Privacy link points to #privacy anchor', async ({ page }) => {
    await expect(page.locator('.footer-links a[href="#privacy"]')).toBeVisible();
  });

  test('footer Governance link points to governance-dashboard.html', async ({ page }) => {
    await expect(
      page.locator('.footer-links a[href="governance-dashboard.html"]')
    ).toBeVisible();
  });

  test('footer GitHub link points to the FairHiringProtocol repository', async ({ page }) => {
    await expect(
      page.locator('.footer-links a[href="https://github.com/aimlfun/FairHiringProtocol"]')
    ).toBeVisible();
  });

  // ── Scroll-to-section behaviour ───────────────────────────────────────────────

  test('clicking footer Terms link scrolls #terms into view', async ({ page }) => {
    await page.locator('.footer-links a[href="#terms"]').click();
    await expect(page.locator('#terms')).toBeInViewport();
  });

  test('clicking footer Privacy link scrolls #privacy into view', async ({ page }) => {
    await page.locator('.footer-links a[href="#privacy"]').click();
    await expect(page.locator('#privacy')).toBeInViewport();
  });

});
