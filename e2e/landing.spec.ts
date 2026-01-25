import { test, expect } from '@playwright/test';

/**
 * Landing Page Tests - Essential checks only
 */
test.describe('Landing Page', () => {
  test('should load and display main content', async ({ page }) => {
    await page.goto('http://localhost:3000');

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
    await page.goto('http://localhost:3000');

    const body = page.locator('body');
    const scrollWidth = await body.evaluate((el) => el.scrollWidth);
    const clientWidth = await body.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 20);
  });
});
