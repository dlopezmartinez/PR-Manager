import { test, expect } from '@playwright/test';
import { loginUser, signupUser, TEST_USER } from './fixtures';

/**
 * Authentication API Tests
 *
 * Tests run against real environment with a dedicated test user.
 */
test.describe('Authentication API', () => {
  test('should login with test user', async ({}) => {
    const login = await loginUser(TEST_USER.email, TEST_USER.password);

    expect(login).toBeTruthy();
    expect(login?.accessToken).toBeTruthy();
    expect(login?.accessToken.split('.')).toHaveLength(3); // Valid JWT
    expect(login?.user.email).toBe(TEST_USER.email);
  });

  test('should reject invalid credentials', async ({}) => {
    const login = await loginUser('nonexistent@example.com', 'wrongpass');
    expect(login).toBeNull();
  });

  test('should reject wrong password', async ({}) => {
    const login = await loginUser(TEST_USER.email, 'wrongpassword');
    expect(login).toBeNull();
  });

  test('should reject weak password on signup', async ({}) => {
    const response = await signupUser('test-weak@example.com', '123');
    expect(response.ok).toBe(false);
    expect(response.status).toBe(400);
  });

  test('should reject invalid email on signup', async ({}) => {
    const response = await signupUser('not-an-email', 'SecurePass123!');
    expect(response.ok).toBe(false);
    expect(response.status).toBe(400);
  });
});
