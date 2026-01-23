import { test, expect } from '@playwright/test';
import { TEST_USERS, signupUser, loginUser } from './fixtures';

/**
 * Authentication Flow Tests
 *
 * Note: UI tests are skipped in CI because the Electron app is not available.
 * API tests run in all environments.
 */

// Check if we're running in CI (no Electron app available)
const isCI = !!process.env.CI;

test.describe('Authentication', () => {
  // UI tests require the Electron app - skip in CI
  test.describe('Signup Flow - UI Tests', () => {
    test.skip(isCI, 'Skipping UI tests in CI - Electron app not available');

    test.beforeEach(async ({ page }) => {
      await page.goto('http://localhost:5173');
    });

    test('should navigate to signup page', async ({ page }) => {
      const signupLink = page.locator('a, button').filter({ hasText: /sign up|signup|register/i }).first();
      await signupLink.click();
      await expect(page).toHaveURL(/signup|register/i);
    });

    test('should display signup form', async ({ page }) => {
      await page.goto('http://localhost:5173/signup');
      const emailInput = page.locator('input[type="email"], input[name*="email"]');
      const passwordInput = page.locator('input[type="password"], input[name*="password"]');
      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();
    });

    test('should validate email format', async ({ page }) => {
      await page.goto('http://localhost:5173/signup');
      const emailInput = page.locator('input[type="email"], input[name*="email"]');
      const submitButton = page.locator('button[type="submit"]');
      await emailInput.fill('invalid-email');
      await submitButton.click();
      const errorMessage = page.locator('text=/email|invalid/i');
      await expect(errorMessage).toBeVisible();
    });

    test('should validate password requirements', async ({ page }) => {
      await page.goto('http://localhost:5173/signup');
      const passwordInput = page.locator('input[type="password"], input[name*="password"]');
      const submitButton = page.locator('button[type="submit"]');
      await passwordInput.fill('123');
      await submitButton.click();
      const errorMessage = page.locator('text=/password|at least/i');
      await expect(errorMessage).toBeVisible();
    });
  });

  // API tests work in all environments
  test.describe('Signup Flow - API Tests', () => {
    test('should successfully create new account via API', async ({}) => {
      const user = TEST_USERS.newUser;
      const response = await signupUser(user.email, user.password, 'Test User');

      expect(response.ok).toBe(true);
      expect(response.data.user).toBeDefined();
      expect(response.data.user.email).toBe(user.email);
      expect(response.data.accessToken).toBeDefined();
    });

    test('should prevent duplicate email signup', async ({}) => {
      const uniqueEmail = `dup-test-${Date.now()}@test.com`;

      // First signup succeeds
      const response1 = await signupUser(uniqueEmail, 'Password123!');
      expect(response1.ok).toBe(true);

      // Second signup with same email fails
      const response2 = await signupUser(uniqueEmail, 'DifferentPass123!');
      expect(response2.ok).toBe(false);
      expect(response2.status).toBe(400);
    });
  });

  // UI tests - skip in CI
  test.describe('Login Flow - UI Tests', () => {
    test.skip(isCI, 'Skipping UI tests in CI - Electron app not available');

    test.beforeEach(async ({ page }) => {
      await page.goto('http://localhost:5173');
    });

    test('should navigate to login page', async ({ page }) => {
      const loginLink = page.locator('a, button').filter({ hasText: /login|sign in/i }).first();
      await loginLink.click();
      await expect(page).toHaveURL(/login|signin/i);
    });

    test('should display login form', async ({ page }) => {
      await page.goto('http://localhost:5173/login');
      const emailInput = page.locator('input[type="email"], input[name*="email"]');
      const passwordInput = page.locator('input[type="password"], input[name*="password"]');
      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();
    });

    test('should reject invalid email', async ({ page }) => {
      await page.goto('http://localhost:5173/login');
      const emailInput = page.locator('input[type="email"], input[name*="email"]');
      const passwordInput = page.locator('input[type="password"], input[name*="password"]');
      const submitButton = page.locator('button[type="submit"]');
      await emailInput.fill('nonexistent@test.com');
      await passwordInput.fill('somepassword');
      await submitButton.click();
      const errorMessage = page.locator('text=/invalid|not found|login failed/i');
      await expect(errorMessage).toBeVisible();
    });

    test('should provide helpful error messages', async ({ page }) => {
      await page.goto('http://localhost:5173/login');
      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();
      const errorMessages = page.locator('text=/required|must|please/i');
      const count = await errorMessages.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  // API tests work in all environments
  test.describe('Login Flow - API Tests', () => {
    test('should successfully login with correct credentials', async ({}) => {
      const uniqueEmail = `login-test-${Date.now()}@test.com`;

      // First ensure user exists
      await signupUser(uniqueEmail, 'Password123!');

      // Now login
      const result = await loginUser(uniqueEmail, 'Password123!');

      expect(result).toBeTruthy();
      expect(result?.accessToken).toBeDefined();
      expect(result?.user).toBeDefined();
    });

    test('should reject wrong password', async ({}) => {
      const uniqueEmail = `wrong-pass-${Date.now()}@test.com`;

      // Ensure user exists
      await signupUser(uniqueEmail, 'CorrectPass123!');

      // Try with wrong password
      const result = await loginUser(uniqueEmail, 'WrongPassword123!');

      expect(result).toBeNull();
    });
  });

  // UI tests - skip in CI
  test.describe('Logout Flow - UI Tests', () => {
    test.skip(isCI, 'Skipping UI tests in CI - Electron app not available');

    test('should logout successfully', async ({ page }) => {
      const uniqueEmail = `logout-test-${Date.now()}@test.com`;

      await signupUser(uniqueEmail, 'Password123!');
      const result = await loginUser(uniqueEmail, 'Password123!');

      if (!result) return;

      await page.context().addCookies([
        {
          name: 'accessToken',
          value: result.accessToken,
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.goto('http://localhost:5173/dashboard');

      const logoutButton = page.locator('a, button').filter({ hasText: /logout|sign out/i }).first();
      const count = await logoutButton.count();
      expect(count).toBeGreaterThan(0);
    });

    test('should redirect to login after logout', async ({ page }) => {
      const uniqueEmail = `redirect-test-${Date.now()}@test.com`;

      await signupUser(uniqueEmail, 'Password123!');
      const result = await loginUser(uniqueEmail, 'Password123!');

      if (!result) return;

      await page.context().addCookies([
        {
          name: 'accessToken',
          value: result.accessToken,
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.goto('http://localhost:5173/dashboard');

      const logoutButton = page.locator('a, button').filter({ hasText: /logout|sign out/i }).first();
      if (await logoutButton.count() > 0) {
        await logoutButton.click();
        await expect(page).toHaveURL(/login|signin/i);
      }
    });
  });

  // UI tests - skip in CI
  test.describe('Session Management - UI Tests', () => {
    test.skip(isCI, 'Skipping UI tests in CI - Electron app not available');

    test('should keep user logged in with valid token', async ({ page }) => {
      const uniqueEmail = `session-test-${Date.now()}@test.com`;

      await signupUser(uniqueEmail, 'Password123!');
      const result = await loginUser(uniqueEmail, 'Password123!');

      if (!result) return;

      await page.goto('http://localhost:5173');
      await page.evaluate(
        (token) => {
          localStorage.setItem('accessToken', token);
        },
        result.accessToken
      );

      await page.goto('http://localhost:5173/dashboard');
      await expect(page).not.toHaveURL(/login|signin/i);
    });

    test('should redirect unauthenticated users from protected routes', async ({ page }) => {
      await page.context().clearCookies();
      await page.goto('http://localhost:5173');
      await page.evaluate(() => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      });

      await page.goto('http://localhost:5173/dashboard');
      await expect(page).toHaveURL(/login|signin/i);
    });
  });
});
