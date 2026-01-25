const { test, expect } = require('@playwright/test');
const {
  TEST_USERS,
  setAuthTokens,
  getAuthTokens,
  clearAuthTokens,
} = require('./fixtures.cjs');

// Uses baseURL from playwright.config.cjs (http://localhost:4321)

test.describe('Landing Auth Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to home page and clear any existing tokens
    await page.goto('/');
    await clearAuthTokens(page);
  });

  test('logout should clear all auth tokens including refresh_token', async ({
    page,
  }) => {
    // Set mock tokens in localStorage
    await setAuthTokens(page, {
      token: 'test-access-token',
      refreshToken: 'test-refresh-token',
      user: { email: 'test@example.com', name: 'Test User' },
    });

    // Verify tokens are set
    const tokensBefore = await getAuthTokens(page);
    expect(tokensBefore.token).toBe('test-access-token');
    expect(tokensBefore.refreshToken).toBe('test-refresh-token');
    expect(tokensBefore.user).toBeTruthy();

    // Reload page to trigger nav update
    await page.reload();

    // Click logout button
    await page.click('#logout-btn');

    // Wait for navigation to home
    await page.waitForURL('/');

    // Verify all tokens are cleared
    const tokensAfter = await getAuthTokens(page);
    expect(tokensAfter.token).toBeNull();
    expect(tokensAfter.refreshToken).toBeNull();
    expect(tokensAfter.user).toBeNull();
  });

  test('should block open redirect attacks', async ({ page }) => {
    // Navigate to login with malicious redirect
    await page.goto('/login?redirect=https://evil.com');

    // Fill login form with test credentials
    await page.fill('#email', TEST_USERS.user.email);
    await page.fill('#password', TEST_USERS.user.password);

    // Mock successful login response
    await page.route('**/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'test-token',
          refreshToken: 'test-refresh',
          user: { email: TEST_USERS.user.email },
        }),
      });
    });

    // Submit form
    await page.click('#submit-btn');

    // Wait for redirect - should go to /success, NOT evil.com
    await page.waitForURL(/\/success/);
    expect(page.url()).toContain('/success');
    expect(page.url()).not.toContain('evil.com');
  });

  test('should redirect authenticated users from /login to /success', async ({
    page,
  }) => {
    // Set auth tokens first (before navigating)
    await setAuthTokens(page, {
      token: 'valid-test-token',
      refreshToken: 'valid-refresh-token',
      user: { email: 'test@example.com' },
    });

    // Navigate to login page - should redirect to /success
    await page.goto('/login');

    // Should redirect to /success
    await page.waitForURL(/\/success/);
    expect(page.url()).toContain('/success');
  });

  test('should redirect authenticated users from /signup to /success', async ({
    page,
  }) => {
    // Set auth tokens first
    await setAuthTokens(page, {
      token: 'valid-test-token',
      refreshToken: 'valid-refresh-token',
      user: { email: 'test@example.com' },
    });

    // Navigate to signup page - should redirect to /success
    await page.goto('/signup');

    // Should redirect to /success
    await page.waitForURL(/\/success/);
    expect(page.url()).toContain('/success');
  });

  test('should redirect authenticated users from /forgot-password to /success', async ({
    page,
  }) => {
    // Set auth tokens first
    await setAuthTokens(page, {
      token: 'valid-test-token',
      refreshToken: 'valid-refresh-token',
      user: { email: 'test@example.com' },
    });

    // Navigate to forgot-password page - should redirect to /success
    await page.goto('/forgot-password');

    // Should redirect to /success
    await page.waitForURL(/\/success/);
    expect(page.url()).toContain('/success');
  });

  test('checkout 401 should clear all tokens', async ({ page }) => {
    // Set an invalid token
    await setAuthTokens(page, {
      token: 'invalid-expired-token',
      refreshToken: 'invalid-refresh-token',
      user: { email: 'test@example.com' },
    });

    // Verify tokens are set
    const tokensBefore = await getAuthTokens(page);
    expect(tokensBefore.token).toBe('invalid-expired-token');
    expect(tokensBefore.refreshToken).toBe('invalid-refresh-token');

    // Mock 401 response from checkout API
    await page.route('**/subscription/create-checkout', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      });
    });

    // Navigate to checkout (will trigger 401 from API)
    await page.goto('/checkout?plan=monthly');

    // Wait for the auth-required state to appear (indicates 401 was handled)
    await page.waitForSelector('#auth-required-state:not(.hidden)', {
      timeout: 10000,
    });

    // Verify all tokens are cleared
    const tokensAfter = await getAuthTokens(page);
    expect(tokensAfter.token).toBeNull();
    expect(tokensAfter.refreshToken).toBeNull();
    expect(tokensAfter.user).toBeNull();
  });

  test('should allow valid relative redirects', async ({ page }) => {
    // Navigate to login with valid relative redirect
    await page.goto('/login?redirect=/pricing');

    // Fill login form
    await page.fill('#email', TEST_USERS.user.email);
    await page.fill('#password', TEST_USERS.user.password);

    // Mock successful login response
    await page.route('**/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'test-token',
          refreshToken: 'test-refresh',
          user: { email: TEST_USERS.user.email },
        }),
      });
    });

    // Submit form
    await page.click('#submit-btn');

    // Should redirect to /pricing
    await page.waitForURL(/\/pricing/);
    expect(page.url()).toContain('/pricing');
  });

  test('should block protocol-relative URL redirects', async ({ page }) => {
    // Navigate to login with protocol-relative redirect attempt
    await page.goto('/login?redirect=//evil.com');

    // Fill login form
    await page.fill('#email', TEST_USERS.user.email);
    await page.fill('#password', TEST_USERS.user.password);

    // Mock successful login response
    await page.route('**/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'test-token',
          refreshToken: 'test-refresh',
          user: { email: TEST_USERS.user.email },
        }),
      });
    });

    // Submit form
    await page.click('#submit-btn');

    // Should redirect to /success, NOT evil.com
    await page.waitForURL(/\/success/);
    expect(page.url()).toContain('/success');
    expect(page.url()).not.toContain('evil.com');
  });

  test('should block javascript: URL redirects', async ({ page }) => {
    // Navigate to login with javascript: redirect attempt
    await page.goto('/login?redirect=javascript:alert(1)');

    // Fill login form
    await page.fill('#email', TEST_USERS.user.email);
    await page.fill('#password', TEST_USERS.user.password);

    // Mock successful login response
    await page.route('**/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'test-token',
          refreshToken: 'test-refresh',
          user: { email: TEST_USERS.user.email },
        }),
      });
    });

    // Submit form
    await page.click('#submit-btn');

    // Should redirect to /success
    await page.waitForURL(/\/success/);
    expect(page.url()).toContain('/success');
  });
});
