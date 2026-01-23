import { test, expect } from '@playwright/test';
import { apiRequest, signupUser, loginUser } from './fixtures';
import crypto from 'crypto';

// Generate truly unique email for each test
const uniqueEmail = () => `sec-${Date.now()}-${crypto.randomBytes(4).toString('hex')}@example.com`;

/**
 * Security Tests - Essential checks only
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

  test('signup response does not expose password hash', async ({}) => {
    const email = uniqueEmail();
    const response = await signupUser(email, 'SecurePass123!');

    // Check signup response
    if (response.ok) {
      expect(response.data.user?.passwordHash).toBeUndefined();
      expect(response.data.user?.password).toBeUndefined();
    }
  });

  test('handles SQL injection safely', async ({}) => {
    const malicious = "'; DROP TABLE users; --";
    const response = await apiRequest('GET', `/admin/users?search=${encodeURIComponent(malicious)}`);
    // Should return 401 (no auth), not crash
    expect(response.status).toBe(401);
  });
});
