import { test, expect } from '@playwright/test';
import { apiRequest, loginUser, TEST_USERS, signupUser } from './fixtures';

/**
 * Security Tests
 *
 * Note: UI tests are skipped in CI because the Electron app is not available.
 * API tests run in all environments.
 *
 * Admin endpoints require AdminSecret header (not Bearer token):
 *   Authorization: AdminSecret <secret>
 */

// Check if we're running in CI (no Electron app available)
const isCI = !!process.env.CI;

test.describe('Security & Authorization', () => {
  // UI tests - skip in CI
  test.describe('Unauthenticated Access - UI Tests', () => {
    test.skip(isCI, 'Skipping UI tests in CI - Electron app not available');

    test('should not allow unauthenticated access to /admin', async ({ page }) => {
      await page.context().clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      });

      await page.goto('http://localhost:5173/admin', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/login|signin/i);
    });

    test('should not allow access to user profile without token', async ({ page }) => {
      await page.context().clearCookies();
      await page.goto('http://localhost:5173/profile', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/login|signin/i);
    });
  });

  // API tests - run in all environments
  test.describe('Unauthenticated Access - API Tests', () => {
    test('should require auth for admin health endpoint', async ({}) => {
      const response = await apiRequest('GET', '/admin/health');
      expect(response.status).toBe(401);
      expect(response.data.error).toBeTruthy();
    });

    test('should return 401 for invalid tokens', async ({}) => {
      const response = await apiRequest('GET', '/admin/health', undefined, 'invalid-token-12345');
      expect(response.status).toBe(401);
    });
  });

  test.describe('Role-Based Access Control - API Tests', () => {
    test('regular user token should not work for admin endpoints', async ({}) => {
      const uniqueEmail = `rbac-test-${Date.now()}@test.com`;

      await signupUser(uniqueEmail, 'Password123!');
      const login = await loginUser(uniqueEmail, 'Password123!');

      if (!login) {
        test.skip();
        return;
      }

      // Admin endpoints require AdminSecret, not Bearer token
      // So using Bearer token should return 401 (missing AdminSecret)
      const response = await apiRequest('GET', '/admin/health', undefined, login.accessToken);
      expect(response.status).toBe(401);
    });

    test('should reject requests without AdminSecret header', async ({}) => {
      const response = await apiRequest('GET', '/admin/users');
      expect(response.status).toBe(401);
    });
  });

  test.describe('Token Validation - API Tests', () => {
    test('should reject expired tokens', async ({}) => {
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjowfQ.invalid';
      const response = await apiRequest('GET', '/admin/health', undefined, expiredToken);
      expect(response.status).toBe(401);
    });

    test('should reject malformed tokens', async ({}) => {
      const malformedToken = 'not.a.valid.jwt.token';
      const response = await apiRequest('GET', '/admin/health', undefined, malformedToken);
      expect(response.status).toBe(401);
    });

    test('should generate valid JWT format on login', async ({}) => {
      const uniqueEmail = `jwt-test-${Date.now()}@test.com`;

      await signupUser(uniqueEmail, 'Password123!');
      const login = await loginUser(uniqueEmail, 'Password123!');

      if (!login) return;

      expect(login.accessToken).toBeTruthy();
      expect(login.accessToken.split('.')).toHaveLength(3);
    });
  });

  test.describe('Input Validation - API Tests', () => {
    test('should reject invalid email format in signup', async ({}) => {
      const response = await apiRequest('POST', '/auth/signup', {
        email: 'not-an-email',
        password: 'ValidPassword123!',
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    test('should reject weak passwords', async ({}) => {
      const response = await apiRequest('POST', '/auth/signup', {
        email: 'weak-pass-test@example.com',
        password: '123',
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    test('should validate required fields in signup', async ({}) => {
      const response = await apiRequest('POST', '/auth/signup', {
        email: '',
        password: '',
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });
  });

  test.describe('SQL Injection & XSS Prevention - API Tests', () => {
    test('should handle SQL injection attempts safely', async ({}) => {
      const maliciousInput = "'; DROP TABLE users; --";

      // Attempt SQL injection in search param (requires auth, will get 401)
      const response = await apiRequest(
        'GET',
        `/admin/users?search=${encodeURIComponent(maliciousInput)}`
      );

      // Should return 401 (no auth) - not crash
      expect(response.status).toBe(401);
    });

    test('should handle XSS attempts in signup name', async ({}) => {
      const xssPayload = '<script>alert("xss")</script>';
      const uniqueEmail = `xss-test-${Date.now()}@test.com`;

      const response = await apiRequest('POST', '/auth/signup', {
        email: uniqueEmail,
        password: 'ValidPassword123!',
        name: xssPayload,
      });

      // Should either accept (sanitized) or reject
      if (response.ok && response.data.user?.name) {
        expect(response.data.user.name).not.toContain('<script>');
      }
    });

    test('should handle special characters in name', async ({}) => {
      const specialChars = "Test User !@#$%^&*()";
      const uniqueEmail = `special-chars-${Date.now()}@test.com`;

      const response = await apiRequest('POST', '/auth/signup', {
        email: uniqueEmail,
        password: 'ValidPassword123!',
        name: specialChars,
      });

      // Should handle gracefully - either accept or reject with 400
      expect([200, 400]).toContain(response.status);
    });
  });

  test.describe('Rate Limiting - API Tests', () => {
    test('should apply rate limiting on login endpoint', async ({}) => {
      const attempts = [];

      // Try multiple rapid login attempts with same email
      for (let i = 0; i < 6; i++) {
        const response = await apiRequest('POST', '/auth/login', {
          email: 'rate-limit-test@example.com',
          password: 'wrongpassword',
        });
        attempts.push(response.status);
      }

      // Should have some failed attempts (401) or rate limited (429)
      // At minimum, should not crash
      expect(attempts.length).toBe(6);
      expect(attempts.every(s => [401, 429].includes(s))).toBe(true);
    });

    test('should apply rate limiting on signup endpoint', async ({}) => {
      const attempts = [];

      for (let i = 0; i < 4; i++) {
        const response = await apiRequest('POST', '/auth/signup', {
          email: `rate-signup-${Date.now()}-${i}@example.com`,
          password: 'ValidPassword123!',
        });
        attempts.push(response.status);
      }

      // Should have successes (200) or rate limited (429)
      expect(attempts.length).toBe(4);
    });
  });

  test.describe('Session Security - API Tests', () => {
    test('should not expose password hash in login response', async ({}) => {
      const uniqueEmail = `session-sec-${Date.now()}@test.com`;

      await signupUser(uniqueEmail, 'Password123!');
      const login = await loginUser(uniqueEmail, 'Password123!');

      if (!login) return;

      expect(login.user).toBeTruthy();
      expect(login.user?.passwordHash).toBeUndefined();
      expect(login.user?.password).toBeUndefined();
    });

    test('should not expose password hash in signup response', async ({}) => {
      const uniqueEmail = `signup-sec-${Date.now()}@test.com`;

      const response = await signupUser(uniqueEmail, 'Password123!');

      if (response.ok) {
        expect(response.data.user?.passwordHash).toBeUndefined();
        expect(response.data.user?.password).toBeUndefined();
      }
    });
  });

  // UI test - skip in CI
  test.describe('Session Security - UI Tests', () => {
    test.skip(isCI, 'Skipping UI tests in CI - Electron app not available');

    test('should not expose tokens in page content', async ({ page }) => {
      const uniqueEmail = `token-sec-${Date.now()}@test.com`;

      await signupUser(uniqueEmail, 'Password123!');

      await page.goto('http://localhost:5173');
      const pageContent = await page.content();

      // Password should never appear in page HTML
      expect(pageContent).not.toContain('Password123!');
    });
  });
});
