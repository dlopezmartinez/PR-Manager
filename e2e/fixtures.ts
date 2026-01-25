import { test as base } from '@playwright/test';

/**
 * E2E Test Configuration
 *
 * Uses real environment (staging/production) with a dedicated test user.
 * No local servers required.
 */

// API URL from environment or default to production
const API_URL = process.env.E2E_API_URL || 'https://api.prmanager.app';

/**
 * Test User Credentials
 * Set via environment variables or use defaults
 */
export const TEST_USER = {
  email: process.env.E2E_USER_EMAIL || 'e2e-test@prmanager.app',
  password: process.env.E2E_USER_PASSWORD || 'pass1234',
};

/**
 * API Request Helper
 */
export async function apiRequest(method: string, endpoint: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return {
    status: response.status,
    data,
    ok: response.ok,
  };
}

/**
 * Signup a new user (for testing signup validation)
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
 * Login with the default test user
 */
export async function loginTestUser() {
  return loginUser(TEST_USER.email, TEST_USER.password);
}

/**
 * Create test fixture with authentication
 */
export const test = base.extend<{
  authenticatedPage: typeof base;
  apiToken: string;
}>({
  authenticatedPage: async ({ page }, use) => {
    await use(page);
  },
  apiToken: async ({}, use) => {
    const login = await loginTestUser();
    await use(login?.accessToken || '');
  },
});

export { expect } from '@playwright/test';
