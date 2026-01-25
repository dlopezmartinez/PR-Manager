import { test, expect } from '@playwright/test';
import { apiRequest } from './fixtures';

/**
 * Admin API Tests - Essential checks only
 */
test.describe('Admin API', () => {
  test('all admin endpoints require AdminSecret auth', async ({}) => {
    const endpoints = [
      { method: 'GET', path: '/admin/users' },
      { method: 'GET', path: '/admin/sessions' },
      { method: 'GET', path: '/admin/health' },
      { method: 'GET', path: '/admin/audit-logs' },
    ];

    for (const { method, path } of endpoints) {
      const response = await apiRequest(method, path);
      expect(response.status).toBe(401);
    }
  });

  test('admin write operations require auth', async ({}) => {
    const response = await apiRequest('POST', '/admin/users/test-id/suspend', { reason: 'test' });
    expect(response.status).toBe(401);
  });
});
