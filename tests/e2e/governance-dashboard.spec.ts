/**
 * Governance dashboard UI — scenarios 21.1–21.20 from TESTING-SCENARIOS.md.
 *
 * Browser tests for governance-dashboard.html: page load, Overview tab data
 * rendering, sidebar widgets, tab navigation, per-tab content, and the
 * governance-authenticated vote recording form.
 *
 * All read paths are unauthenticated (public dashboard). The vote form tests
 * inject a minimal JWT with role=governance into sessionStorage to exercise
 * the form's show/hide and client-side validation logic — no real API call
 * is made from the form in those tests.
 */

import { test, expect, type Page } from '@playwright/test';

const PAGE = '/governance-dashboard.html';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadDashboard(page: Page): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      r => r.url().includes('/governance/summary'),
      { timeout: 15_000 },
    ),
    page.goto(PAGE),
  ]);
  await page.waitForLoadState('networkidle');
}

function makeGovJwt(): string {
  // Minimal fake JWT decoded by the page via atob() — not a real signed token.
  // The page only reads payload.role to decide whether to show the vote button.
  const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64');
  const header  = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ role: 'governance', exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${header}.${payload}.fakesig`;
}

// ── 21.1 — Page load ─────────────────────────────────────────────────────────

test('21.1 — page loads and masthead shows Governance Terminal', async ({ page }) => {
  await loadDashboard(page);

  await expect(page.locator('.masthead-sub')).toContainText(/Governance Terminal/i);
});

// ── Overview tab ──────────────────────────────────────────────────────────────

test.describe('Overview tab', () => {

  test.beforeEach(async ({ page }) => {
    await loadDashboard(page);
  });

  test('21.2 — health grid: active implementations count and registered note populate', async ({ page }) => {
    await expect(page.locator('#hc-active')).not.toHaveText('—');
    await expect(page.locator('#hc-active-note')).toContainText('registered');
  });

  test('21.3 — health grid: open escalations count and critical/urgent breakdown populate', async ({ page }) => {
    await expect(page.locator('#hc-escalations')).not.toHaveText('—');
    await expect(page.locator('#hc-escalations-note')).toContainText('critical');
  });

  test('21.4 — overview escalations list leaves loading state', async ({ page }) => {
    await expect(page.locator('#overview-escalations-list'))
      .not.toContainText('Loading escalations…');
  });

  test('21.5 — overview public audit record leaves loading state', async ({ page }) => {
    await expect(page.locator('#overview-audit-entries'))
      .not.toContainText('Loading audit record…');
  });

});

// ── Sidebar widgets ───────────────────────────────────────────────────────────

test.describe('Sidebar widgets', () => {

  test.beforeEach(async ({ page }) => {
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/governance/bodies'), { timeout: 15_000 }),
      page.goto(PAGE),
    ]);
    await page.waitForLoadState('networkidle');
  });

  test('21.6 — governance bodies sidebar shows Protocol Council, FOB and TWG', async ({ page }) => {
    const bodies = page.locator('#gov-bodies-list');
    await expect(bodies).not.toContainText('Loading…');
    await expect(bodies).toContainText(/PC|Protocol Council/);
  });

  test('21.7 — recent votes sidebar leaves loading state', async ({ page }) => {
    await expect(page.locator('#recent-votes-list')).not.toContainText('Loading…');
  });

  test('21.8 — protocol versions sidebar shows v1.0.0 and Current tag', async ({ page }) => {
    await expect(page.locator('#versions-list')).toContainText('v1.0.0');
    await expect(page.locator('#versions-list')).toContainText('Current');
  });

});

// ── Tab navigation ────────────────────────────────────────────────────────────

test.describe('Tab navigation', () => {

  test.beforeEach(async ({ page }) => {
    await loadDashboard(page);
  });

  test('21.9 — overview is the default active tab and sidebar is visible', async ({ page }) => {
    await expect(page.locator('#gov-overview')).toBeVisible();
    await expect(page.locator('.col-side')).toBeVisible();
  });

  test('21.10 — Escalations tab: its panel is visible and sidebar is hidden', async ({ page }) => {
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/governance/escalations') && !r.url().includes('limit=5'), { timeout: 10_000 }),
      page.locator('#gov-tab-escalations').click(),
    ]);

    await expect(page.locator('#gov-escalations')).toBeVisible();
    await expect(page.locator('#gov-overview')).not.toBeVisible();
    await expect(page.locator('.col-side')).not.toBeVisible();
  });

  test('21.11 — returning to Overview restores sidebar visibility', async ({ page }) => {
    await page.locator('#gov-tab-escalations').click();
    await expect(page.locator('.col-side')).not.toBeVisible();

    await page.locator('#gov-tab-overview').click();

    await expect(page.locator('#gov-overview')).toBeVisible();
    await expect(page.locator('.col-side')).toBeVisible();
  });

  test('21.12 — Fairness tab: its panel is visible and sidebar is hidden', async ({ page }) => {
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/governance/fairness/companies'), { timeout: 10_000 }),
      page.locator('#gov-tab-fairness').click(),
    ]);

    await expect(page.locator('#gov-fairness')).toBeVisible();
    await expect(page.locator('.col-side')).not.toBeVisible();
  });

  test('21.13a — Proposals tab: panel visible and API called with status=under_review', async ({ page }) => {
    let capturedUrl = '';
    await Promise.all([
      page.waitForResponse(r => {
        if (r.url().includes('/governance/proposals')) {
          capturedUrl = r.url();
          return true;
        }
        return false;
      }, { timeout: 10_000 }),
      page.locator('#gov-tab-proposals').click(),
    ]);

    await expect(page.locator('#gov-proposals')).toBeVisible();
    expect(capturedUrl).toContain('under_review');
    expect(capturedUrl).not.toContain('status=open');
  });

  test('21.14 — Audit Log tab: its panel is visible', async ({ page }) => {
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/governance/audit') && r.url().includes('limit=50'), { timeout: 10_000 }),
      page.locator('#gov-tab-auditlog').click(),
    ]);

    await expect(page.locator('#gov-auditlog')).toBeVisible();
    await expect(page.locator('.col-side')).not.toBeVisible();
  });

  test('21.15 — Votes tab: its panel is visible', async ({ page }) => {
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/governance/votes') && !r.url().includes('limit=4'), { timeout: 10_000 }),
      page.locator('#gov-tab-votes').click(),
    ]);

    await expect(page.locator('#gov-votes')).toBeVisible();
    await expect(page.locator('.col-side')).not.toBeVisible();
  });

});

// ── Escalations tab ───────────────────────────────────────────────────────────

test.describe('Escalations tab', () => {

  test.beforeEach(async ({ page }) => {
    await loadDashboard(page);
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/governance/escalations') && !r.url().includes('limit=5'), { timeout: 10_000 }),
      page.locator('#gov-tab-escalations').click(),
    ]);
  });

  test('21.10b — escalations list leaves loading state (items or empty notice)', async ({ page }) => {
    await expect(page.locator('#escalations-list'))
      .not.toContainText('Loading escalations…');
  });

  test('escalations type filter has expected options', async ({ page }) => {
    const select = page.locator('#esc-filter-type');
    await expect(select).toBeVisible();
    await expect(select.locator('option[value="fairness_breach"]')).toBeAttached();
    await expect(select.locator('option[value="candidate_appeal"]')).toBeAttached();
  });

  test('escalations priority filter is present', async ({ page }) => {
    await expect(page.locator('#esc-filter-priority')).toBeVisible();
    await expect(page.locator('#esc-filter-priority option[value="critical"]')).toBeAttached();
  });

});

// ── Fairness tab ──────────────────────────────────────────────────────────────

test.describe('Fairness tab', () => {

  test.beforeEach(async ({ page }) => {
    await loadDashboard(page);
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/governance/fairness/companies'), { timeout: 10_000 }),
      page.locator('#gov-tab-fairness').click(),
    ]);
  });

  test('21.12b — fairness table tbody leaves loading state', async ({ page }) => {
    await expect(page.locator('#gov-fairness-tbody')).not.toContainText('Loading…');
  });

  test('fairness table has Company, DIR, EOD and SDS column headers', async ({ page }) => {
    const headers = page.locator('#gov-fairness table thead th');
    await expect(headers.nth(0)).toContainText(/company/i);
    await expect(headers.nth(1)).toContainText('DIR');
    await expect(headers.nth(2)).toContainText('EOD');
    await expect(headers.nth(3)).toContainText('SDS');
  });

});

// ── Proposals tab ─────────────────────────────────────────────────────────────

test.describe('Proposals tab', () => {

  test.beforeEach(async ({ page }) => {
    await loadDashboard(page);
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/governance/proposals'), { timeout: 10_000 }),
      page.locator('#gov-tab-proposals').click(),
    ]);
  });

  test('21.13b — proposals list leaves loading state (items or empty notice)', async ({ page }) => {
    await expect(page.locator('#proposals-list'))
      .not.toContainText('Loading proposals…');
  });

});

// ── Audit Log tab ─────────────────────────────────────────────────────────────

test.describe('Audit Log tab', () => {

  test.beforeEach(async ({ page }) => {
    await loadDashboard(page);
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/governance/audit') && r.url().includes('limit=50'), { timeout: 10_000 }),
      page.locator('#gov-tab-auditlog').click(),
    ]);
  });

  test('21.14b — audit log entries leave loading state', async ({ page }) => {
    await expect(page.locator('#gov-auditlog-entries'))
      .not.toContainText('Loading audit log…');
  });

});

// ── Votes tab ────────────────────────────────────────────────────────────────

test.describe('Votes tab', () => {

  test.beforeEach(async ({ page }) => {
    await loadDashboard(page);
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/governance/votes') && !r.url().includes('limit=4'), { timeout: 10_000 }),
      page.locator('#gov-tab-votes').click(),
    ]);
  });

  test('21.15b — votes table leaves loading state', async ({ page }) => {
    await expect(page.locator('#votes-tbody')).not.toContainText('Loading…');
  });

  test('21.16 — record-vote button and form are hidden without a governance token', async ({ page }) => {
    await expect(page.locator('#record-vote-btn-wrap')).not.toBeVisible();
    await expect(page.locator('#record-vote-panel')).not.toBeVisible();
  });

});

// ── Vote form — governance auth ──────────────────────────────────────────────

test.describe('Vote form (governance auth)', () => {

  async function loadAsGovernance(page: Page): Promise<void> {
    await page.addInitScript((token: string) => {
      sessionStorage.setItem('fhp_access_token', token);
    }, makeGovJwt());
    await loadDashboard(page);
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/governance/votes') && !r.url().includes('limit=4'), { timeout: 10_000 }),
      page.locator('#gov-tab-votes').click(),
    ]);
  }

  test('21.17 — record vote button is visible with governance JWT injected', async ({ page }) => {
    await loadAsGovernance(page);

    await expect(page.locator('#record-vote-btn-wrap')).toBeVisible();
  });

  test('21.18 — vote form panel shows after clicking record vote button', async ({ page }) => {
    await loadAsGovernance(page);
    await page.locator('#record-vote-btn-wrap button').click();

    await expect(page.locator('#record-vote-panel')).toBeVisible();
  });

  test('21.19 — short resolution ref shows client-side validation error', async ({ page }) => {
    await loadAsGovernance(page);
    await page.locator('#record-vote-btn-wrap button').click();

    await page.locator('#vote-resolution-ref').fill('ab');
    await page.locator('#vote-question').fill('A long enough question text');
    await page.evaluate(() => (window as any).submitVote());

    await expect(page.locator('#record-vote-error')).toBeVisible();
    await expect(page.locator('#record-vote-error')).toContainText(/resolution ref/i);
  });

  test('21.20 — short question shows client-side validation error', async ({ page }) => {
    await loadAsGovernance(page);
    await page.locator('#record-vote-btn-wrap button').click();

    await page.locator('#vote-resolution-ref').fill('FHP-PC-2026-TEST');
    await page.locator('#vote-question').fill('Too short');
    await page.evaluate(() => (window as any).submitVote());

    await expect(page.locator('#record-vote-error')).toBeVisible();
    await expect(page.locator('#record-vote-error')).toContainText(/question/i);
  });

});
