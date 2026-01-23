import { test, expect } from '@playwright/test';
import { signupUser, loginUser } from './fixtures';
import crypto from 'crypto';

// Generate truly unique email for each test
const uniqueEmail = () => `test-${Date.now()}-${crypto.randomBytes(4).toString('hex')}@example.com`;

/**
 * Authentication API Tests - Essential checks only
 */
test.describe('Authentication API', () => {
  test('signup and login flow', async ({}) => {
    const email = uniqueEmail();
    const password = 'SecurePass123!';

    // Signup
    const signup = await signupUser(email, password, 'Test User');
    expect(signup.ok).toBe(true);
    expect(signup.data.user.email).toBe(email);
    expect(signup.data.accessToken).toBeTruthy();

    // Login
    const login = await loginUser(email, password);
    expect(login).toBeTruthy();
    expect(login?.accessToken).toBeTruthy();
    expect(login?.accessToken.split('.')).toHaveLength(3); // Valid JWT
  });

  test('should reject invalid credentials', async ({}) => {
    const login = await loginUser('nonexistent@example.com', 'wrongpass');
    expect(login).toBeNull();
  });

  test('should reject weak password on signup', async ({}) => {
    const response = await signupUser(uniqueEmail(), '123');
    expect(response.ok).toBe(false);
    expect(response.status).toBe(400);
  });

  test('should reject invalid email on signup', async ({}) => {
    const response = await signupUser('not-an-email', 'SecurePass123!');
    expect(response.ok).toBe(false);
    expect(response.status).toBe(400);
  });
});
