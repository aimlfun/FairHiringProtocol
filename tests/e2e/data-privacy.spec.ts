import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  uniqueEmail,
  registerCandidate,
  goToTab,
} from './helpers.js';

test.describe('Data & Privacy tab', () => {

  // ── Download my data ─────────────────────────────────────────────────────────

  test('Download my data saves a file named fhp-export-YYYY-MM-DD.json', async ({ page }) => {
    await registerCandidate(page, uniqueEmail());
    await goToTab(page, 'data');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-data-btn').click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^fhp-export-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('Downloaded file is valid JSON with expected top-level keys', async ({ page }) => {
    await registerCandidate(page, uniqueEmail());
    await goToTab(page, 'data');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-data-btn').click(),
    ]);

    const filePath = await download.path();
    expect(filePath).not.toBeNull();
    const text = readFileSync(filePath!, 'utf-8');
    const data = JSON.parse(text);

    expect(data).toHaveProperty('candidate_id');
    expect(data).toHaveProperty('profile');
    expect(data).toHaveProperty('fhp_schema_version');
    expect(data).toHaveProperty('matches');
    expect(data).toHaveProperty('appeals');
  });

  test('downloaded filename contains today\'s date', async ({ page }) => {
    await registerCandidate(page, uniqueEmail());
    await goToTab(page, 'data');

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-data-btn').click(),
    ]);

    expect(download.suggestedFilename()).toContain(today);
  });

  // ── Delete account modal ──────────────────────────────────────────────────────

  test('Delete my account button opens a modal dialog, not a confirm() prompt', async ({ page }) => {
    // Register the dialog handler before any navigation so it catches anything
    let nativeDialogFired = false;
    page.on('dialog', dialog => {
      nativeDialogFired = true;
      dialog.dismiss();
    });

    await registerCandidate(page, uniqueEmail());
    await goToTab(page, 'data');

    // Use the specific trigger button selector to avoid matching the confirm button inside the modal
    await page.locator('[onclick="openDelModal()"]').click();

    // Native confirm() should NOT have fired
    expect(nativeDialogFired).toBe(false);

    // The custom modal should be open
    await expect(page.locator('#del-modal')).toHaveClass(/open/);
    await expect(page.locator('#del-modal')).toBeVisible();
  });

  test('Delete modal contains the required warning text', async ({ page }) => {
    await registerCandidate(page, uniqueEmail());
    await goToTab(page, 'data');

    await page.locator('[onclick="openDelModal()"]').click();
    await expect(page.locator('#del-modal')).toBeVisible();

    await expect(page.locator('#del-modal')).toContainText('permanently deleted');
    await expect(page.locator('#del-modal')).toContainText('cannot be undone');
    await expect(page.locator('#del-modal')).toContainText('no recovery path');
  });

  test('Cancel button closes the delete account modal', async ({ page }) => {
    await registerCandidate(page, uniqueEmail());
    await goToTab(page, 'data');

    await page.locator('[onclick="openDelModal()"]').click();
    await expect(page.locator('#del-modal')).toHaveClass(/open/);

    await page.locator('#del-modal').getByRole('button', { name: /^cancel$/i }).click();

    await expect(page.locator('#del-modal')).not.toHaveClass(/open/);
  });

  test('clicking the overlay outside the delete modal closes it', async ({ page }) => {
    await registerCandidate(page, uniqueEmail());
    await goToTab(page, 'data');

    await page.locator('[onclick="openDelModal()"]').click();
    await expect(page.locator('#del-modal')).toHaveClass(/open/);

    // Click the overlay backdrop (outside the modal box)
    await page.locator('#del-modal').click({ position: { x: 10, y: 10 } });

    await expect(page.locator('#del-modal')).not.toHaveClass(/open/);
  });

});
