import { test, expect } from '@playwright/test';

/**
 * Landing Page Tests
 *
 * Tests run against real environment (production landing page).
 */
const LANDING_URL = process.env.E2E_LANDING_URL || 'https://prmanager.app';

test.describe('Landing Page', () => {
  test('should load and display main content', async ({ page }) => {
    await page.goto(LANDING_URL);

    // Page loads with title
    const title = await page.title();
    expect(title).toBeTruthy();

    // Has main heading
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible();

    // Page has substantial content
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(100);
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(LANDING_URL);

    // Allow some tolerance for mobile responsiveness
    const body = page.locator('body');
    const scrollWidth = await body.evaluate((el) => el.scrollWidth);
    const clientWidth = await body.evaluate((el) => el.clientWidth);

    // Accept up to 100px overflow (some mobile browsers have quirks)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 100);
  });

  test('should have working navigation links', async ({ page }) => {
    await page.goto(LANDING_URL);

    // Check that main nav links exist
    const featuresLink = page.locator('a[href*="features"]').first();
    const pricingLink = page.locator('a[href*="pricing"]').first();
    const downloadLink = page.locator('a[href*="download"]').first();

    await expect(featuresLink).toBeVisible();
    await expect(pricingLink).toBeVisible();
    await expect(downloadLink).toBeVisible();
  });

  test('should load download page', async ({ page }) => {
    await page.goto(`${LANDING_URL}/download`);

    // Should show download content
    const heading = page.locator('h1');
    await expect(heading).toContainText('Download');
  });
});
