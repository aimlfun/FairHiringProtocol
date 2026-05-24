import { test, expect, type Page } from '@playwright/test';
import {
  uniqueEmail,
  registerCandidate,
  goToTab, saveProfile, reloadAndWait,
} from './helpers.js';

async function addSkillViaUI(page: Page, skillName: string): Promise<void> {
  // Type into the skill input and pick the first autocomplete suggestion.
  // This goes through the real filterSkills → pickSkill flow with a valid ontology ID.
  await page.locator('#skill-inp').fill(skillName);
  await page.locator('#sugg .sugg-item').first().waitFor({ state: 'visible', timeout: 3_000 });
  await page.locator('#sugg .sugg-item').first().click();
  await page.waitForTimeout(100);
}

test.describe('Candidate profile — save and restore', () => {

  test('skill added and saved persists after reload', async ({ page }) => {
    const email = uniqueEmail();
    await registerCandidate(page, email);

    await goToTab(page, 'profile');
    await addSkillViaUI(page, 'Python');
    const label = 'Python'; // matched by pickSkill from ALL_SKILLS

    await saveProfile(page);
    await reloadAndWait(page);
    await goToTab(page, 'profile');

    await expect(page.locator('#skills-list')).toContainText(label ?? 'Python');
  });

  test('skill evidence URL saves and restores', async ({ page }) => {
    const email = uniqueEmail();
    await registerCandidate(page, email);
    const evidenceUrl = 'https://github.com/example/portfolio';

    await goToTab(page, 'profile');
    await addSkillViaUI(page, 'Python');

    // Fill in evidence URL
    await page.locator('.ev-inp').first().fill(evidenceUrl);
    await page.locator('.ev-inp').first().dispatchEvent('input');

    await saveProfile(page);
    await reloadAndWait(page);
    await goToTab(page, 'profile');

    await expect(page.locator('.ev-inp').first()).toHaveValue(evidenceUrl);
  });

  test('salary minimum saves and restores', async ({ page }) => {
    const email = uniqueEmail();
    await registerCandidate(page, email);

    await goToTab(page, 'profile');
    await page.locator('#pref-salary-min').fill('75000');
    await page.locator('#pref-salary-min').dispatchEvent('input');

    await saveProfile(page);
    await reloadAndWait(page);
    await goToTab(page, 'profile');

    await expect(page.locator('#pref-salary-min')).toHaveValue('75000');
  });

  test('job type chip selection saves and restores', async ({ page }) => {
    const email = uniqueEmail();
    await registerCandidate(page, email);

    await goToTab(page, 'profile');

    // Deselect all, then select only 'Contract'
    await page.evaluate(() => {
      document.querySelectorAll('#chips-job-type .pch.on').forEach(el => el.classList.remove('on'));
    });
    const contractChip = page.locator('#chips-job-type .pch[data-val="contract"]');
    await contractChip.click();

    await saveProfile(page);
    await reloadAndWait(page);
    await goToTab(page, 'profile');

    await expect(page.locator('#chips-job-type .pch[data-val="contract"]')).toHaveClass(/on/);
    await expect(page.locator('#chips-job-type .pch[data-val="permanent"]')).not.toHaveClass(/on/);
  });

  test('invalid evidence URL marks the input with ev-invalid and blocks save', async ({ page }) => {
    const email = uniqueEmail();
    await registerCandidate(page, email);
    await goToTab(page, 'profile');

    await addSkillViaUI(page, 'Python');

    await page.locator('.ev-inp').first().fill('not-a-url');
    await page.locator('.ev-inp').first().dispatchEvent('input');

    // Input should be marked invalid
    await expect(page.locator('.ev-inp').first()).toHaveClass(/ev-invalid/);

    // Save should be blocked — no PUT fires, error message appears instead
    let putFired = false;
    page.on('request', req => {
      if (req.url().includes('/candidates/me') && req.method() === 'PUT') putFired = true;
    });
    await page.locator('#profile-save-btn').click();
    await page.waitForTimeout(400);
    expect(putFired).toBe(false);
    await expect(page.locator('#profile-save-error')).toBeVisible();
    await expect(page.locator('#profile-save-error')).toContainText('invalid evidence URL');
  });

  test('clearing an invalid evidence URL re-enables save', async ({ page }) => {
    const email = uniqueEmail();
    await registerCandidate(page, email);
    await goToTab(page, 'profile');

    await addSkillViaUI(page, 'Python');

    await page.locator('.ev-inp').first().fill('bad://url');
    await page.locator('.ev-inp').first().dispatchEvent('input');
    await expect(page.locator('.ev-inp').first()).toHaveClass(/ev-invalid/);

    // Clear the input
    await page.locator('.ev-inp').first().fill('');
    await page.locator('.ev-inp').first().dispatchEvent('input');
    await expect(page.locator('.ev-inp').first()).not.toHaveClass(/ev-invalid/);

    // Save should now proceed
    await saveProfile(page);
  });

  test('valid http and https evidence URLs are accepted without ev-invalid', async ({ page }) => {
    const email = uniqueEmail();
    await registerCandidate(page, email);
    await goToTab(page, 'profile');

    await addSkillViaUI(page, 'Python');

    for (const url of ['https://github.com/example', 'http://example.com/portfolio']) {
      await page.locator('.ev-inp').first().fill(url);
      await page.locator('.ev-inp').first().dispatchEvent('input');
      await expect(page.locator('.ev-inp').first()).not.toHaveClass(/ev-invalid/);
    }
  });

  test('work mode chip selection saves and restores', async ({ page }) => {
    const email = uniqueEmail();
    await registerCandidate(page, email);

    await goToTab(page, 'profile');
    // Wait for profile section to be visible so loadProfile() has completed
    await page.locator('#chips-work-mode').waitFor({ state: 'visible' });

    // Deselect any already-active chips via real clicks (goes through toggleChip event handler)
    const activeChips = await page.locator('#chips-work-mode .pch.on').all();
    for (const chip of activeChips) {
      await chip.click();
    }

    // Select only 'On-site'
    const onsiteChip = page.locator('#chips-work-mode .pch[data-val="on_site"]');
    await onsiteChip.click();
    // Confirm the chip is actually selected before saving
    await expect(onsiteChip).toHaveClass(/on/);

    await saveProfile(page);
    await reloadAndWait(page);
    await goToTab(page, 'profile');
    await page.locator('#chips-work-mode').waitFor({ state: 'visible' });

    await expect(page.locator('#chips-work-mode .pch[data-val="on_site"]')).toHaveClass(/on/);
    await expect(page.locator('#chips-work-mode .pch[data-val="remote"]')).not.toHaveClass(/on/);
  });

});
