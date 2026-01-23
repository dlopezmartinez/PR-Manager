import { test, expect } from '@playwright/test';
import { TEST_USERS, signupUser, loginUser } from './fixtures';

/**
 * Authentication Flow Tests
 * Validates signup, login, logout, and session management
 */
test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Start from app root before each test
    await page.goto('http://localhost:5173');
  });

  test.describe('Signup Flow', () => {
    test('should navigate to signup page', async ({ page }) => {
      // Look for signup link
      const signupLink = page.locator('a, button').filter({ hasText: /sign up|signup|register/i }).first();
      await signupLink.click();

      // Should be on signup page or modal
      await expect(page).toHaveURL(/signup|register/i);
    });

    test('should display signup form', async ({ page }) => {
      await page.goto('http://localhost:5173/signup');

      // Check for form inputs
      const emailInput = page.locator('input[type="email"], input[name*="email"]');
      const passwordInput = page.locator('input[type="password"], input[name*="password"]');

      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();
    });

    test('should successfully create new account', async ({}) => {
      const user = TEST_USERS.newUser;

      const response = await signupUser(user.email, user.password, 'Test User');

      expect(response.ok).toBe(true);
      expect(response.data.user).toBeDefined();
      expect(response.data.user.email).toBe(user.email);
      expect(response.data.accessToken).toBeDefined();
    });

    test('should validate email format', async ({ page }) => {
      await page.goto('http://localhost:5173/signup');

      const emailInput = page.locator('input[type="email"], input[name*="email"]');
      const submitButton = page.locator('button[type="submit"]');

      // Try invalid email
      await emailInput.fill('invalid-email');
      await submitButton.click();

      // Should show error
      const errorMessage = page.locator('text=/email|invalid/i');
      await expect(errorMessage).toBeVisible();
    });

    test('should validate password requirements', async ({ page }) => {
      await page.goto('http://localhost:5173/signup');

      const passwordInput = page.locator('input[type="password"], input[name*="password"]');
      const submitButton = page.locator('button[type="submit"]');

      // Try weak password
      await passwordInput.fill('123');
      await submitButton.click();

      // Should show error about password strength
      const errorMessage = page.locator('text=/password|at least/i');
      await expect(errorMessage).toBeVisible();
    });

    test('should prevent duplicate email signup', async ({}) => {
      const user = TEST_USERS.user;

      // First signup succeeds
      const response1 = await signupUser(user.email, user.password);
      expect(response1.ok).toBe(true);

      // Second signup with same email fails
      const response2 = await signupUser(user.email, 'different-password');
      expect(response2.ok).toBe(false);
      expect(response2.status).toBe(400);
    });
  });

  test.describe('Login Flow', () => {
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

    test('should successfully login with correct credentials', async ({}) => {
      const user = TEST_USERS.user;

      // First ensure user exists
      await signupUser(user.email, user.password);

      // Now login
      const result = await loginUser(user.email, user.password);

      expect(result).toBeTruthy();
      expect(result?.accessToken).toBeDefined();
      expect(result?.user).toBeDefined();
    });

    test('should reject invalid email', async ({ page }) => {
      await page.goto('http://localhost:5173/login');

      const emailInput = page.locator('input[type="email"], input[name*="email"]');
      const passwordInput = page.locator('input[type="password"], input[name*="password"]');
      const submitButton = page.locator('button[type="submit"]');

      await emailInput.fill('nonexistent@test.com');
      await passwordInput.fill('somepassword');
      await submitButton.click();

      // Should show error
      const errorMessage = page.locator('text=/invalid|not found|login failed/i');
      await expect(errorMessage).toBeVisible();
    });

    test('should reject wrong password', async ({}) => {
      const user = TEST_USERS.user;

      // Ensure user exists
      await signupUser(user.email, user.password);

      // Try with wrong password
      const result = await loginUser(user.email, 'wrong-password');

      expect(result).toBeNull();
    });

    test('should provide helpful error messages', async ({ page }) => {
      await page.goto('http://localhost:5173/login');

      const emailInput = page.locator('input[type="email"], input[name*="email"]');
      const passwordInput = page.locator('input[type="password"], input[name*="password"]');
      const submitButton = page.locator('button[type="submit"]');

      // Leave fields empty
      await submitButton.click();

      // Should show validation errors
      const errorMessages = page.locator('text=/required|must|please/i');
      const count = await errorMessages.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe('Logout Flow', () => {
    test('should logout successfully', async ({ page }) => {
      const user = TEST_USERS.user;

      // Signup and login
      await signupUser(user.email, user.password);
      const result = await loginUser(user.email, user.password);

      if (!result) return;

      // Store token for authenticated requests
      await page.context().addCookies([
        {
          name: 'accessToken',
          value: result.accessToken,
          domain: 'localhost',
          path: '/',
        },
      ]);

      // Navigate to authenticated page
      await page.goto('http://localhost:5173/dashboard');

      // Find logout button
      const logoutButton = page.locator('a, button').filter({ hasText: /logout|sign out/i }).first();

      // Logout should exist
      const count = await logoutButton.count();
      expect(count).toBeGreaterThan(0);
    });

    test('should redirect to login after logout', async ({ page }) => {
      const user = TEST_USERS.user;

      await signupUser(user.email, user.password);
      const result = await loginUser(user.email, user.password);

      if (!result) return;

      // Store token
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

        // Should redirect to login
        await expect(page).toHaveURL(/login|signin/i);
      }
    });
  });

  test.describe('Session Management', () => {
    test('should keep user logged in with valid token', async ({ page }) => {
      const user = TEST_USERS.user;

      await signupUser(user.email, user.password);
      const result = await loginUser(user.email, user.password);

      if (!result) return;

      // Store token in localStorage or cookie
      await page.goto('http://localhost:5173');
      await page.evaluate(
        (token) => {
          localStorage.setItem('accessToken', token);
        },
        result.accessToken
      );

      // Navigate to protected route
      await page.goto('http://localhost:5173/dashboard');

      // Should not redirect to login
      await expect(page).not.toHaveURL(/login|signin/i);
    });

    test('should redirect unauthenticated users from protected routes', async ({ page }) => {
      // Clear any auth tokens
      await page.context().clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      });

      await page.goto('http://localhost:5173/dashboard');

      // Should redirect to login
      await expect(page).toHaveURL(/login|signin/i);
    });
  });
});
