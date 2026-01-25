import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import { prisma } from '../../../src/lib/prisma.js';
import { createTestUser } from '../../helpers/testHelpers.js';
import { generateTokens } from '../../../src/middleware/auth.js';

describe('Auth Routes', () => {
  const app = createApp();

  describe('POST /auth/signup', () => {
    it('should create a new user account', async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send({
          email: 'newuser@test.com',
          password: 'SecurePass123!',
          name: 'New User',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('expiresIn');
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user.email).toBe('newuser@test.com');
      expect(res.body.user.name).toBe('New User');
      expect(res.body.user.role).toBe('USER');
      // Should not expose password hash
      expect(res.body.user).not.toHaveProperty('passwordHash');
    });

    it('should lowercase email on signup', async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send({
          email: 'UPPERCASE@TEST.COM',
          password: 'SecurePass123!',
        });

      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe('uppercase@test.com');
    });

    it('should reject duplicate email', async () => {
      await createTestUser({ email: 'existing@test.com' });

      const res = await request(app)
        .post('/auth/signup')
        .send({
          email: 'existing@test.com',
          password: 'SecurePass123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('AUTH_EMAIL_EXISTS');
      expect(res.body.message).toContain('already exists');
    });

    it('should reject invalid email format', async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send({
          email: 'not-an-email',
          password: 'SecurePass123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should reject weak password (less than 8 chars)', async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send({
          email: 'weakpass@test.com',
          password: '1234567',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should reject missing email', async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send({
          password: 'SecurePass123!',
        });

      expect(res.status).toBe(400);
    });

    it('should reject missing password', async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send({
          email: 'nopass@test.com',
        });

      expect(res.status).toBe(400);
    });

    it('should return valid JWT token', async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send({
          email: 'jwttest@test.com',
          password: 'SecurePass123!',
        });

      expect(res.status).toBe(201);
      // JWT has 3 parts separated by dots
      expect(res.body.accessToken.split('.')).toHaveLength(3);
      expect(res.body.refreshToken).toBeTruthy();
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await createTestUser({
        email: 'login@test.com',
        // Password is 'password123' (bcrypt hashed in createTestUser)
      });
    });

    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'login@test.com',
          password: 'password123',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('expiresIn');
      expect(res.body.user.email).toBe('login@test.com');
    });

    it('should login with uppercase email (case insensitive)', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'LOGIN@TEST.COM',
          password: 'password123',
        });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('login@test.com');
    });

    it('should reject invalid password', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'login@test.com',
          password: 'wrongpassword',
        });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('should reject non-existent email', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'password123',
        });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('should reject invalid email format', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'not-an-email',
          password: 'password123',
        });

      expect(res.status).toBe(400);
    });

    it('should reject empty password', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'login@test.com',
          password: '',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /auth/me', () => {
    it('should return current user info with valid token', async () => {
      const user = await createTestUser({ email: 'me@test.com', name: 'Test Me' });
      const tokens = await generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toHaveProperty('id', user.id);
      expect(res.body.user).toHaveProperty('email', 'me@test.com');
      expect(res.body.user).toHaveProperty('name', 'Test Me');
      expect(res.body.user).toHaveProperty('role');
    });

    it('should reject request without token', async () => {
      const res = await request(app).get('/auth/me');

      expect(res.status).toBe(401);
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });

    it('should reject malformed authorization header', async () => {
      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', 'NotBearer token');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /auth/health', () => {
    it('should return valid status with valid token', async () => {
      const user = await createTestUser({ email: 'health@test.com' });
      const tokens = await generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const res = await request(app)
        .get('/auth/health')
        .set('Authorization', `Bearer ${tokens.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('valid', true);
      expect(res.body).toHaveProperty('userId', user.id);
    });

    it('should reject without token', async () => {
      const res = await request(app).get('/auth/health');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh tokens with valid refresh token', async () => {
      const user = await createTestUser({ email: 'refresh@test.com' });
      const tokens = await generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: tokens.refreshToken });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('expiresIn');
      // Verify the new token is valid JWT format
      expect(res.body.accessToken.split('.')).toHaveLength(3);
      expect(res.body.refreshToken).toBeTruthy();
    });

    it('should reject invalid refresh token', async () => {
      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-refresh-token' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_REFRESH_TOKEN_INVALID');
    });

    it('should reject missing refresh token', async () => {
      const res = await request(app)
        .post('/auth/refresh')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject empty refresh token', async () => {
      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: '' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/verify-token', () => {
    it('should verify valid access token', async () => {
      const user = await createTestUser({ email: 'verify@test.com' });
      const tokens = await generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const res = await request(app)
        .post('/auth/verify-token')
        .send({ token: tokens.accessToken });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('valid', true);
      expect(res.body.user).toHaveProperty('id', user.id);
      expect(res.body.user).toHaveProperty('email', 'verify@test.com');
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .post('/auth/verify-token')
        .send({ token: 'invalid-token' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_INVALID_TOKEN');
    });

    it('should reject missing token', async () => {
      const res = await request(app)
        .post('/auth/verify-token')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/change-password', () => {
    it('should change password with correct current password', async () => {
      const user = await createTestUser({ email: 'changepass@test.com' });
      const tokens = await generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const res = await request(app)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({
          currentPassword: 'password123',
          newPassword: 'NewSecurePass456!',
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Password changed successfully');

      // Verify new password works
      const loginRes = await request(app)
        .post('/auth/login')
        .send({
          email: 'changepass@test.com',
          password: 'NewSecurePass456!',
        });

      expect(loginRes.status).toBe(200);
    });

    it('should reject with incorrect current password', async () => {
      const user = await createTestUser({ email: 'wrongpass@test.com' });
      const tokens = await generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const res = await request(app)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'NewSecurePass456!',
        });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_PASSWORD_INCORRECT');
    });

    it('should reject weak new password', async () => {
      const user = await createTestUser({ email: 'weaknew@test.com' });
      const tokens = await generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const res = await request(app)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({
          currentPassword: 'password123',
          newPassword: '123',
        });

      expect(res.status).toBe(400);
    });

    it('should invalidate all sessions after password change', async () => {
      const user = await createTestUser({ email: 'invalidsess@test.com' });
      const tokens = await generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      // Get session count before
      const sessionsBefore = await prisma.session.count({
        where: { userId: user.id },
      });
      expect(sessionsBefore).toBeGreaterThan(0);

      // Change password
      await request(app)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({
          currentPassword: 'password123',
          newPassword: 'NewSecurePass456!',
        });

      // Sessions should be deleted
      const sessionsAfter = await prisma.session.count({
        where: { userId: user.id },
      });
      expect(sessionsAfter).toBe(0);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/auth/change-password')
        .send({
          currentPassword: 'password123',
          newPassword: 'NewSecurePass456!',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout and invalidate refresh token', async () => {
      const user = await createTestUser({ email: 'logout@test.com' });
      const tokens = await generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ refreshToken: tokens.refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out successfully');

      // Refresh token should no longer work
      const refreshRes = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: tokens.refreshToken });

      expect(refreshRes.status).toBe(401);
    });

    it('should succeed even without refresh token', async () => {
      const user = await createTestUser({ email: 'logoutnotoken@test.com' });
      const tokens = await generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({});

      expect(res.status).toBe(200);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/auth/logout')
        .send({ refreshToken: 'some-token' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/logout-all', () => {
    it('should logout from all devices', async () => {
      const user = await createTestUser({ email: 'logoutall@test.com' });

      // Create multiple sessions
      const tokens1 = await generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role,
      });
      const tokens2 = await generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      // Verify multiple sessions exist
      const sessionsBefore = await prisma.session.count({
        where: { userId: user.id },
      });
      expect(sessionsBefore).toBeGreaterThanOrEqual(2);

      // Logout all
      const res = await request(app)
        .post('/auth/logout-all')
        .set('Authorization', `Bearer ${tokens1.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out from all devices');

      // All sessions should be deleted
      const sessionsAfter = await prisma.session.count({
        where: { userId: user.id },
      });
      expect(sessionsAfter).toBe(0);
    });

    it('should require authentication', async () => {
      const res = await request(app).post('/auth/logout-all');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /auth/sessions', () => {
    it('should list active sessions', async () => {
      const user = await createTestUser({ email: 'sessions@test.com' });
      const tokens = await generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const res = await request(app)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${tokens.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('sessions');
      expect(Array.isArray(res.body.sessions)).toBe(true);
      expect(res.body.sessions.length).toBeGreaterThan(0);
      expect(res.body.sessions[0]).toHaveProperty('id');
      expect(res.body.sessions[0]).toHaveProperty('createdAt');
      expect(res.body.sessions[0]).toHaveProperty('expiresAt');
      expect(res.body.sessions[0]).toHaveProperty('isActive', true);
      // Should NOT expose token hash
      expect(res.body.sessions[0]).not.toHaveProperty('token');
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/auth/sessions');

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /auth/sessions/:id', () => {
    it('should delete specific session', async () => {
      const user = await createTestUser({ email: 'deletesess@test.com' });
      const tokens = await generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      // Get session ID
      const sessionsRes = await request(app)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${tokens.accessToken}`);

      const sessionId = sessionsRes.body.sessions[0].id;

      // Delete session
      const res = await request(app)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${tokens.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Session terminated');

      // Session should be gone
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
      });
      expect(session).toBeNull();
    });

    it('should not delete other users sessions', async () => {
      const user1 = await createTestUser({ email: 'user1sess@test.com' });
      const user2 = await createTestUser({ email: 'user2sess@test.com' });

      const tokens1 = await generateTokens({
        userId: user1.id,
        email: user1.email,
        role: user1.role,
      });
      const tokens2 = await generateTokens({
        userId: user2.id,
        email: user2.email,
        role: user2.role,
      });

      // Get user2's session
      const sessionsRes = await request(app)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${tokens2.accessToken}`);

      const user2SessionId = sessionsRes.body.sessions[0].id;

      // Try to delete user2's session as user1
      const res = await request(app)
        .delete(`/auth/sessions/${user2SessionId}`)
        .set('Authorization', `Bearer ${tokens1.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('AUTH_SESSION_NOT_FOUND');
    });

    it('should return 404 for non-existent session', async () => {
      const user = await createTestUser({ email: 'nosess@test.com' });
      const tokens = await generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const res = await request(app)
        .delete('/auth/sessions/non-existent-id')
        .set('Authorization', `Bearer ${tokens.accessToken}`);

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app).delete('/auth/sessions/some-id');

      expect(res.status).toBe(401);
    });
  });
});
