import { test, expect } from '@playwright/test';
import { loginUser, TEST_USERS, signupUser, apiRequest } from './fixtures';

/**
 * Admin Dashboard Tests
 *
 * Note: UI tests are skipped in CI because the Electron app is not available.
 * API tests run in all environments.
 */

// Check if we're running in CI (no Electron app available)
const isCI = !!process.env.CI;

test.describe('Admin Dashboard', () => {
  // UI tests - skip in CI
  test.describe('Access Control - UI Tests', () => {
    test.skip(isCI, 'Skipping UI tests in CI - Electron app not available');

    test('should deny access to regular users', async ({ page }) => {
      const uniqueEmail = `admin-deny-${Date.now()}@test.com`;

      await signupUser(uniqueEmail, 'Password123!');
      const login = await loginUser(uniqueEmail, 'Password123!');

      if (!login) return;

      await page.context().addCookies([
        {
          name: 'accessToken',
          value: login.accessToken,
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.goto('http://localhost:5173/admin', { waitUntil: 'domcontentloaded' });

      const isOnAdminPage = page.url().includes('/admin');
      const hasError = await page.locator('text=/access denied|not authorized|forbidden/i').count();

      expect(isOnAdminPage === false || hasError > 0).toBe(true);
    });

    test('should redirect to login when accessing /admin without auth', async ({ page }) => {
      await page.context().clearCookies();
      await page.goto('http://localhost:5173/admin', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/login|signin/i);
    });
  });

  // API tests - run in all environments
  test.describe('Access Control - API Tests', () => {
    test('should require authentication for admin endpoints', async ({}) => {
      // Request without any token should return 401
      const response = await apiRequest('GET', '/admin/users');
      expect(response.status).toBe(401);
    });

    test('should reject invalid admin tokens', async ({}) => {
      const response = await apiRequest('GET', '/admin/users', undefined, 'invalid-token-12345');
      expect(response.status).toBe(401);
    });
  });

  test.describe('Admin Users Management - API Tests', () => {
    test('should require auth to list users', async ({}) => {
      const response = await apiRequest('GET', '/admin/users?page=1&limit=50');
      expect(response.status).toBe(401);
    });

    test('should require auth to get user details', async ({}) => {
      const response = await apiRequest('GET', '/admin/users/some-user-id');
      expect(response.status).toBe(401);
    });

    test('should require auth to change user role', async ({}) => {
      const response = await apiRequest(
        'PATCH',
        '/admin/users/some-user-id/role',
        { role: 'ADMIN' }
      );
      expect(response.status).toBe(401);
    });
  });

  test.describe('Admin Sessions Management - API Tests', () => {
    test('should require auth to list sessions', async ({}) => {
      const response = await apiRequest('GET', '/admin/sessions');
      expect(response.status).toBe(401);
    });

    test('should require auth to revoke sessions', async ({}) => {
      const response = await apiRequest('DELETE', '/admin/sessions/some-session-id');
      expect(response.status).toBe(401);
    });
  });

  test.describe('Admin Audit Logs - API Tests', () => {
    test('should require auth to view audit logs', async ({}) => {
      const response = await apiRequest('GET', '/admin/audit-logs');
      expect(response.status).toBe(401);
    });
  });

  test.describe('Admin Health Monitoring - API Tests', () => {
    test('should require auth to access admin health endpoint', async ({}) => {
      const response = await apiRequest('GET', '/admin/health');
      expect(response.status).toBe(401);
    });
  });

  test.describe('Admin Form Validation - API Tests', () => {
    test('should require auth for suspend action', async ({}) => {
      const response = await apiRequest(
        'POST',
        '/admin/users/some-user-id/suspend',
        { reason: 'Test reason' }
      );
      expect(response.status).toBe(401);
    });

    test('should require auth for role change', async ({}) => {
      const response = await apiRequest(
        'PATCH',
        '/admin/users/some-user-id/role',
        { role: 'ADMIN' }
      );
      expect(response.status).toBe(401);
    });
  });
});
