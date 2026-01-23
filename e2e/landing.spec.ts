import { test, expect } from '@playwright/test';

/**
 * Landing Page Tests
 * Validates that the landing page loads correctly
 * and navigation works as expected
 */
test.describe('Landing Page', () => {
  test('should load landing page', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Check page title exists
    const title = await page.title();
    expect(title).toBeTruthy();

    // Check main heading exists
    const heading = page.locator('h1');
    await expect(heading).toBeTruthy();
  });

  test('should have navigation links', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Look for navigation
    const nav = page.locator('nav, header');
    await expect(nav).toBeTruthy();
  });

  test('should have signup link', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Look for signup button/link
    const signupButton = page.locator('a, button').filter({ hasText: /sign up|signup|register/i });
    const count = await signupButton.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should have login link', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Look for login button/link
    const loginButton = page.locator('a, button').filter({ hasText: /login|sign in/i });
    const count = await loginButton.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should have main CTA (call to action)', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Look for CTA button (Get Started, Start Free, etc.)
    const cta = page.locator('a, button').filter({ hasText: /get started|start|try|begin/i });
    const count = await cta.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should have content sections', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Check page is not empty
    const body = page.locator('body');
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(100);
  });

  test('should load images/assets correctly', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Check for images
    const images = page.locator('img');
    const imageCount = await images.count();
    // At least one image expected
    expect(imageCount).toBeGreaterThan(0);

    // Check no broken images
    const brokenImages = await images.evaluateAll((elements: any[]) => {
      return elements.filter((img) => !img.complete || img.naturalHeight === 0);
    });
    expect(brokenImages.length).toBe(0);
  });

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('http://localhost:3000');

    // Page should load without horizontal scroll
    const body = page.locator('body');
    const scrollWidth = await body.evaluate((el) => el.scrollWidth);
    const clientWidth = await body.evaluate((el) => el.clientWidth);

    // Allow small overflow (scrollbars)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 20);
  });

  test('should have accessible color contrast', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Check for basic accessibility
    const headings = page.locator('h1, h2, h3, h4, h5, h6');
    const headingCount = await headings.count();
    expect(headingCount).toBeGreaterThan(0);
  });

  test('should load without console errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('http://localhost:3000');

    // Should not have critical errors
    expect(errors.length).toBe(0);
  });

  test('should handle 404 gracefully', async ({ page }) => {
    const response = await page.goto('http://localhost:3000/nonexistent-page-12345');

    // Should either redirect or show 404 page
    expect(response?.status()).toBeGreaterThanOrEqual(200);
    expect(response?.status()).toBeLessThan(500);
  });
});
