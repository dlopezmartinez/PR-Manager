const { test, expect } = require('@playwright/test');

test.describe('Password Reset Flow', () => {
  test.describe('Forgot Password Page', () => {
    test('should display forgot password form', async ({ page }) => {
      await page.goto('/forgot-password');

      // Check page title and heading
      await expect(page).toHaveTitle(/Forgot Password/);
      await expect(page.locator('h1')).toContainText('Reset your password');

      // Check form elements exist
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toContainText('Send Reset Link');

      // Check link back to login (use text to find the specific link)
      await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
    });

    test('should show error for empty email', async ({ page }) => {
      await page.goto('/forgot-password');

      // Submit empty form
      await page.click('button[type="submit"]');

      // Should show error (HTML5 validation or custom)
      const emailInput = page.locator('input[type="email"]');
      await expect(emailInput).toBeFocused();
    });

    test('should show success message after submission', async ({ page }) => {
      await page.goto('/forgot-password');

      // Fill email
      await page.fill('input[type="email"]', 'test@example.com');

      // Mock API response
      await page.route('**/auth/forgot-password', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'If an account exists, a reset email will be sent' }),
        });
      });

      // Submit form
      await page.click('button[type="submit"]');

      // Should show success message
      await expect(page.locator('#success-message')).toBeVisible();
      await expect(page.locator('#success-message')).toContainText('reset link');

      // Button should be disabled after success
      await expect(page.locator('button[type="submit"]')).toBeDisabled();
    });

    test('should navigate to login from forgot password', async ({ page }) => {
      await page.goto('/forgot-password');

      await page.click('a[href="/login"]');

      await expect(page).toHaveURL('/login');
    });
  });

  test.describe('Reset Password Page', () => {
    test('should show error when no token is provided', async ({ page }) => {
      await page.goto('/reset-password');

      // Should show no token message
      await expect(page.locator('#no-token-message')).toBeVisible();
      await expect(page.locator('#no-token-message')).toContainText('Invalid or missing reset token');

      // Form should be hidden
      await expect(page.locator('#reset-form')).toBeHidden();

      // Should have link to request new reset
      await expect(page.locator('a[href="/forgot-password"]')).toBeVisible();
    });

    test('should display reset form when token is provided', async ({ page }) => {
      await page.goto('/reset-password?token=test-token-123');

      // Form should be visible
      await expect(page.locator('#reset-form')).toBeVisible();

      // No token message should be hidden
      await expect(page.locator('#no-token-message')).toBeHidden();

      // Check form elements
      await expect(page.locator('#password')).toBeVisible();
      await expect(page.locator('#confirm-password')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toContainText('Reset Password');
    });

    test('should show error when passwords do not match', async ({ page }) => {
      await page.goto('/reset-password?token=test-token-123');

      // Fill passwords that don't match
      await page.fill('#password', 'password123');
      await page.fill('#confirm-password', 'differentpassword');

      // Submit form
      await page.click('button[type="submit"]');

      // Should show error
      await expect(page.locator('#error-message')).toBeVisible();
      await expect(page.locator('#error-message')).toContainText('do not match');
    });

    test('should show error for short password', async ({ page }) => {
      await page.goto('/reset-password?token=test-token-123');

      // Fill short password
      await page.fill('#password', 'short');
      await page.fill('#confirm-password', 'short');

      // Submit form
      await page.click('button[type="submit"]');

      // Should show validation error (HTML5 minlength validation or custom error)
      // Check if either custom error message is shown or input has validation error
      const errorVisible = await page.locator('#error-message').isVisible();
      if (errorVisible) {
        await expect(page.locator('#error-message')).toContainText('8 characters');
      } else {
        // HTML5 validation - input should be invalid
        const isInvalid = await page.locator('#password').evaluate(el => !el.validity.valid);
        expect(isInvalid).toBe(true);
      }
    });

    test('should successfully reset password and redirect to login', async ({ page }) => {
      await page.goto('/reset-password?token=valid-test-token');

      // Mock API response
      await page.route('**/auth/reset-password', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Password reset successfully' }),
        });
      });

      // Fill valid passwords
      await page.fill('#password', 'newpassword123');
      await page.fill('#confirm-password', 'newpassword123');

      // Submit form
      await page.click('button[type="submit"]');

      // Should show success message
      await expect(page.locator('#success-message')).toBeVisible();
      await expect(page.locator('#success-message')).toContainText('successfully');

      // Should redirect to login (after 2 seconds)
      await expect(page).toHaveURL('/login', { timeout: 5000 });
    });

    test('should show error for invalid or expired token', async ({ page }) => {
      await page.goto('/reset-password?token=expired-token');

      // Mock API error response
      await page.route('**/auth/reset-password', async (route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid or expired token' }),
        });
      });

      // Fill valid passwords
      await page.fill('#password', 'newpassword123');
      await page.fill('#confirm-password', 'newpassword123');

      // Submit form
      await page.click('button[type="submit"]');

      // Should show error
      await expect(page.locator('#error-message')).toBeVisible();
      await expect(page.locator('#error-message')).toContainText('Unable to reset password');
    });
  });

  test.describe('Login Page Integration', () => {
    test('should have forgot password link on login page', async ({ page }) => {
      await page.goto('/login');

      // Check forgot password link exists
      const forgotLink = page.locator('a[href="/forgot-password"]');
      await expect(forgotLink).toBeVisible();
      await expect(forgotLink).toContainText('Forgot password?');
    });

    test('should navigate from login to forgot password', async ({ page }) => {
      await page.goto('/login');

      await page.click('a[href="/forgot-password"]');

      await expect(page).toHaveURL('/forgot-password');
      await expect(page.locator('h1')).toContainText('Reset your password');
    });
  });

  test.describe('Full Flow Navigation', () => {
    test('should complete forgot -> reset -> login flow', async ({ page }) => {
      // Start at login
      await page.goto('/login');

      // Click forgot password
      await page.click('a[href="/forgot-password"]');
      await expect(page).toHaveURL('/forgot-password');

      // Submit email
      await page.route('**/auth/forgot-password', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Email sent' }),
        });
      });

      await page.fill('input[type="email"]', 'user@example.com');
      await page.click('button[type="submit"]');

      // Verify success
      await expect(page.locator('#success-message')).toBeVisible();

      // Navigate to reset password (simulating clicking email link)
      await page.goto('/reset-password?token=test-token');

      // Mock successful reset
      await page.route('**/auth/reset-password', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Password reset' }),
        });
      });

      // Fill and submit new password
      await page.fill('#password', 'mynewpassword123');
      await page.fill('#confirm-password', 'mynewpassword123');
      await page.click('button[type="submit"]');

      // Should redirect to login
      await expect(page).toHaveURL('/login', { timeout: 5000 });
    });
  });
});
