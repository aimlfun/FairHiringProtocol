/**
 * Regression tests — each test guards a specific bug found and fixed
 * during manual Playwright testing on 2026-05-21.
 */

import { test, expect, type Page } from '@playwright/test';
import {
  uniqueEmail,
  registerCandidate, goToTab, saveProfile, reloadAndWait,
} from './helpers.js';

async function addSkillViaUI(page: Page, skillName: string): Promise<void> {
  await page.evaluate((name) => {
    const skill = (window as any).ALL_SKILLS?.find(
      (s: any) => s.label.toLowerCase().includes(name.toLowerCase())
    );
    if (skill) (window as any).pickSkill(skill.id, skill.label, skill.domain);
    else (window as any).pickSkill('fhp:skill:custom-test', name, 'Other');
  }, skillName);
  await page.waitForTimeout(100);
}

// ── Bug 1: toggleRoleForm() used f.style.display === 'none' ──────────────────
// CSS-class-controlled display was invisible to element.style; the form
// never opened. Fixed to use getComputedStyle(f).display.

test('work history: "Add role" button opens the role entry form', async ({ page }) => {
  await registerCandidate(page, uniqueEmail());
  await goToTab(page, 'profile');

  // Form should start hidden (CSS class hides it, not inline style)
  const form = page.locator('#role-form');
  await expect(form).toBeHidden();

  // Clicking "+ Add role" should reveal it
  await page.locator('button', { hasText: /\+ Add role/i }).click();
  await expect(form).toBeVisible();

  // Clicking again should hide it (toggle)
  await page.locator('button', { hasText: /\+ Add role/i }).click();
  await expect(form).toBeHidden();
});

// ── Bug 2: Work schedule chips had no IDs or data-val, were not in save ──────
// payload, and were not restored on loadProfile. Chips were rendered but
// selections were silently discarded on save.

test('work schedule chips save and restore (regression)', async ({ page }) => {
  const email = uniqueEmail();
  await registerCandidate(page, email);
  await goToTab(page, 'profile');

  // Deselect all schedule chips, then select only 'Part-time'
  await page.evaluate(() => {
    document.querySelectorAll('#chips-schedule .pch.on').forEach(el => el.classList.remove('on'));
  });
  await page.locator('#chips-schedule .pch[data-val="part-time"]').click();

  await saveProfile(page);
  await reloadAndWait(page);
  await goToTab(page, 'profile');

  await expect(page.locator('#chips-schedule .pch[data-val="part-time"]')).toHaveClass(/on/);
  await expect(page.locator('#chips-schedule .pch[data-val="full-time"]')).not.toHaveClass(/on/);
});

// ── Bug 3: Right-to-work chips had the same problem as schedule chips ─────────

test('right-to-work chips save and restore (regression)', async ({ page }) => {
  const email = uniqueEmail();
  await registerCandidate(page, email);
  await goToTab(page, 'profile');

  // Deselect all RTW chips, then select only 'US'
  await page.evaluate(() => {
    document.querySelectorAll('#chips-rtw .pch.on').forEach(el => el.classList.remove('on'));
  });
  await page.locator('#chips-rtw .pch[data-val="US"]').click();

  await saveProfile(page);
  await reloadAndWait(page);
  await goToTab(page, 'profile');

  await expect(page.locator('#chips-rtw .pch[data-val="US"]')).toHaveClass(/on/);
  await expect(page.locator('#chips-rtw .pch[data-val="GB"]')).not.toHaveClass(/on/);
  await expect(page.locator('#chips-rtw .pch[data-val="EU"]')).not.toHaveClass(/on/);
});

// ── Bug: New user profile showed hardcoded demo data ─────────────────────────
// skills, notifications, salary, preference chips, and dashboard stats were
// all pre-populated from mockup-era defaults. A new user appeared to see
// another account's data.

test('new user sees a blank slate — no demo data pre-populated (regression)', async ({ page }) => {
  await registerCandidate(page, uniqueEmail());
  // Wait for loadProfile() + loadNotifications() to finish
  await page.waitForLoadState('networkidle');

  // ── Dashboard stats must be real zeros, not hardcoded 18/7 ──────────────
  await expect(page.locator('#kpi-active-matches')).toHaveText('0');
  await expect(page.locator('#kpi-matched')).toHaveText('0');
  await expect(page.locator('#kpi-ghosts')).toHaveText('0');

  // ── Notifications bell: no badge, empty panel ────────────────────────────
  await expect(page.locator('#bbadge')).toBeHidden();
  await page.locator('.bell').click();
  await expect(page.locator('#nlist .ni')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // ── My Profile: skills, preferences, locations all empty ─────────────────
  await goToTab(page, 'profile');

  await expect(page.locator('#skills-list .skill-row')).toHaveCount(0);
  await expect(page.locator('.pchips .pch.on')).toHaveCount(0);
  await expect(page.locator('#pref-salary-min')).toHaveValue('');
  await expect(page.locator('#loc-list .loc-entry')).toHaveCount(0);
});

// ── Match History: counts come from the API, not hardcoded ───────────────────
// A new account has zero matches. The old code showed hardcoded "(18)" etc.

test('Match History filter buttons show real counts (0) for a fresh account', async ({ page }) => {
  await registerCandidate(page, uniqueEmail());
  await page.waitForLoadState('networkidle');
  await goToTab(page, 'matches');

  const allBtn = page.locator('.ft[data-decision=""]');
  const allText = await allBtn.textContent();
  expect(allText).toContain('(0)');
  expect(allText).not.toMatch(/\(\d{2,}\)/); // not a hardcoded two-digit number
});

// ── Consent Record: dates come from the API, not hardcoded ────────────────────
// Old code showed hardcoded "Nov 01" dates from demo data.

test('Consent Record shows dates from the real API, not hardcoded Nov 01', async ({ page }) => {
  await registerCandidate(page, uniqueEmail());
  await goToTab(page, 'data');
  await page.waitForTimeout(800); // allow loadConsentRecord() to finish

  const tbody = page.locator('#consent-record-body');
  const content = await tbody.textContent();
  expect(content).not.toContain('Nov 01');
  expect(content).not.toContain('Nov 2024');
});

// ── Matching Eligibility: fresh account is not eligible ───────────────────────
// Old code showed hardcoded "✓ Eligible · 1+ skills" even for new accounts.

test('Matching Eligibility shows "Not yet eligible" for a fresh account with no skills', async ({ page }) => {
  await registerCandidate(page, uniqueEmail());
  await page.waitForLoadState('networkidle');
  // Widget is in the profile sidebar — go to profile tab where the aside is rendered
  await goToTab(page, 'profile');

  await expect(page.locator('#eligibility-widget')).toContainText('Not yet eligible');
  await expect(page.locator('#eligibility-widget')).not.toContainText('Eligible for matching');
});

// ── Bug 4: Evidence URL was not in the skills save payload ────────────────────
// Skills were saved without evidence_url; the field was dropped silently.

test('skill evidence URL round-trips through save/reload (regression)', async ({ page }) => {
  const email = uniqueEmail();
  await registerCandidate(page, email);
  await goToTab(page, 'profile');

  await addSkillViaUI(page, 'Python');

  const url = 'https://github.com/regression/test-evidence';
  await page.locator('.ev-inp').first().fill(url);
  await page.locator('.ev-inp').first().dispatchEvent('input');

  await saveProfile(page);
  await reloadAndWait(page);
  await goToTab(page, 'profile');

  await expect(page.locator('.ev-inp').first()).toHaveValue(url);
});
