import { test, expect } from '@playwright/test';
import { apiRequest, loginTestUser } from './fixtures';

/**
 * Security Tests
 *
 * Tests run against real environment.
 */
test.describe('Security', () => {
  test('admin endpoints require authentication', async ({}) => {
    const endpoints = ['/admin/health', '/admin/users', '/admin/sessions'];

    for (const endpoint of endpoints) {
      const response = await apiRequest('GET', endpoint);
      expect(response.status).toBe(401);
    }
  });

  test('admin endpoints reject invalid tokens', async ({}) => {
    const response = await apiRequest('GET', '/admin/health', undefined, 'invalid-token');
    expect(response.status).toBe(401);
  });

  test('login response does not expose password hash', async ({}) => {
    const login = await loginTestUser();

    expect(login).toBeTruthy();
    // User object should not contain password data
    expect((login?.user as Record<string, unknown>)?.passwordHash).toBeUndefined();
    expect((login?.user as Record<string, unknown>)?.password).toBeUndefined();
  });

  test('handles SQL injection safely', async ({}) => {
    const malicious = "'; DROP TABLE users; --";
    const response = await apiRequest('GET', `/admin/users?search=${encodeURIComponent(malicious)}`);
    // Should return 401 (no auth), not crash
    expect(response.status).toBe(401);
  });
});
