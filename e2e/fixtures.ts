import { test as base } from '@playwright/test';
import crypto from 'crypto';

/**
 * Test Users for E2E Testing
 */
export const TEST_USERS = {
  superuser: {
    email: 'superuser@prmanager.test',
    password: 'SuperSecure123!@#',
    role: 'SUPERUSER',
  },
  admin: {
    email: 'admin@prmanager.test',
    password: 'AdminSecure123!@#',
    role: 'ADMIN',
  },
  user: {
    email: 'user@prmanager.test',
    password: 'UserSecure123!@#',
    role: 'USER',
  },
  newUser: {
    email: `user-${crypto.randomBytes(4).toString('hex')}@prmanager.test`,
    password: 'NewUser123!@#',
    role: 'USER',
  },
};

/**
 * API Request Helper
 */
export async function apiRequest(method: string, endpoint: string, body?: any, token?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`http://localhost:3001/api${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  return {
    status: response.status,
    data: await response.json(),
    ok: response.ok,
  };
}

/**
 * Signup a new user
 */
export async function signupUser(email: string, password: string, name?: string) {
  return apiRequest('POST', '/auth/signup', {
    email,
    password,
    name: name || 'Test User',
  });
}

/**
 * Login user and return tokens
 */
export async function loginUser(email: string, password: string) {
  const response = await apiRequest('POST', '/auth/login', {
    email,
    password,
  });

  if (response.ok) {
    return {
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken,
      user: response.data.user,
    };
  }
  return null;
}

/**
 * Create test fixture with authentication
 */
export const test = base.extend<{
  authenticatedPage: typeof base;
  apiToken: string;
}>({
  authenticatedPage: async ({ page }, use) => {
    // This will be set after login
    await use(page);
  },
  apiToken: async ({}, use) => {
    // This will be set after login
    await use('');
  },
});

export { expect } from '@playwright/test';
