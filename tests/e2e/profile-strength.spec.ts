import { test, expect } from '@playwright/test';
import {
  goToTab, profileStrengthPct,
  registerAndCaptureToken, injectTokenAndLoad,
} from './helpers.js';

let sharedToken = '';

test.describe('Profile strength widget', () => {

  test.beforeAll(async ({ browser }) => {
    sharedToken = await registerAndCaptureToken(browser);
  });

  test('fresh account starts at 0% strength — no demo data pre-populated', async ({ page }) => {
    await injectTokenAndLoad(page, sharedToken);
    const pct = await profileStrengthPct(page);
    expect(pct).toBe(0);
  });

  test('tips are shown for missing components on a fresh account', async ({ page }) => {
    await injectTokenAndLoad(page, sharedToken);
    const tips = await page.locator('.strength-tips .tip').first().count();
    expect(tips).toBeGreaterThan(0);
  });

  test('widget is visible on the dashboard', async ({ page }) => {
    await injectTokenAndLoad(page, sharedToken);
    await expect(page.locator('.strength-arc').first()).toBeVisible();
    await expect(page.locator('.strength-pct').first()).toBeVisible();
  });

  test('widget is also visible on the profile tab', async ({ page }) => {
    await injectTokenAndLoad(page, sharedToken);
    await goToTab(page, 'profile');
    await expect(page.locator('#pg-profile .strength-arc')).toBeVisible();
    await expect(page.locator('#pg-profile .strength-pct')).toBeVisible();
  });

  test('adding an evidence URL to a skill increases strength', async ({ page }) => {
    await injectTokenAndLoad(page, sharedToken);
    await goToTab(page, 'profile');

    // Add a skill so .ev-inp is rendered (profile starts empty)
    await page.evaluate(() => {
      (window as any).pickSkill('fhp:skill:python', 'Python', 'Software Eng');
    });
    await page.waitForTimeout(100);
    const before = await profileStrengthPct(page);

    await page.locator('.ev-inp').first().fill('https://github.com/example');
    await page.locator('.ev-inp').first().dispatchEvent('input');

    const after = await profileStrengthPct(page);
    expect(after).toBeGreaterThan(before);
  });

  test('clearing salary minimum decreases strength', async ({ page }) => {
    await injectTokenAndLoad(page, sharedToken);
    await goToTab(page, 'profile');

    // Set salary first so clearing it has something to reduce
    await page.locator('#pref-salary-min').fill('70000');
    await page.locator('#pref-salary-min').dispatchEvent('input');
    const before = await profileStrengthPct(page);

    await page.locator('#pref-salary-min').fill('');
    await page.locator('#pref-salary-min').dispatchEvent('input');

    const after = await profileStrengthPct(page);
    expect(after).toBeLessThan(before);
  });

  test('both dashboard and profile widgets show the same percentage', async ({ page }) => {
    await injectTokenAndLoad(page, sharedToken);

    const dashPct = await profileStrengthPct(page);

    await goToTab(page, 'profile');
    const profilePctText = await page.locator('#pg-profile .strength-pct').textContent();
    const profilePct = parseInt(profilePctText?.replace('%', '') ?? '0', 10);

    expect(profilePct).toBe(dashPct);
  });

  test('adding a preferred location increases strength and removes location tip', async ({ page }) => {
    await injectTokenAndLoad(page, sharedToken);
    await goToTab(page, 'profile');

    const before = await profileStrengthPct(page);
    const tipBefore = await page.locator('.strength-tips').first()
      .getByText('preferred location', { exact: false }).count();
    expect(tipBefore).toBeGreaterThan(0);

    await page.locator('button[onclick="addLoc()"]').click();

    const after = await profileStrengthPct(page);
    expect(after).toBe(before + 10);

    const tipAfter = await page.locator('.strength-tips').first()
      .getByText('preferred location', { exact: false }).count();
    expect(tipAfter).toBe(0);
  });

  test('removing the last preferred location decreases strength and restores location tip', async ({ page }) => {
    await injectTokenAndLoad(page, sharedToken);
    await goToTab(page, 'profile');

    // Add a location first
    await page.locator('button[onclick="addLoc()"]').click();
    const before = await profileStrengthPct(page);

    // Remove it
    await page.locator('#loc-list .loc-entry button').click();

    const after = await profileStrengthPct(page);
    expect(after).toBe(before - 10);

    const tipRestored = await page.locator('.strength-tips').first()
      .getByText('preferred location', { exact: false }).count();
    expect(tipRestored).toBeGreaterThan(0);
  });

  test('adding evidence URL removes the evidence tip', async ({ page }) => {
    await injectTokenAndLoad(page, sharedToken);
    await goToTab(page, 'profile');

    // Add a skill so .ev-inp is rendered (profile starts empty)
    await page.evaluate(() => {
      (window as any).pickSkill('fhp:skill:python', 'Python', 'Software Eng');
    });
    await page.waitForTimeout(100);

    const evidenceTipBefore = await page.locator('.strength-tips').first()
      .getByText('evidence URL', { exact: false }).count();
    expect(evidenceTipBefore).toBeGreaterThan(0);

    await page.locator('.ev-inp').first().fill('https://github.com/example');
    await page.locator('.ev-inp').first().dispatchEvent('input');

    const evidenceTipAfter = await page.locator('.strength-tips').first()
      .getByText('evidence URL', { exact: false }).count();
    expect(evidenceTipAfter).toBe(0);
  });

});
