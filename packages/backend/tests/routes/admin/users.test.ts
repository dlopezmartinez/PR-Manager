import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import { prisma } from '../../../src/lib/prisma.js';
import { createTestSuperuser, createTestUser, createTestAdminSecret, createTestSession } from '../../helpers/testHelpers.js';

describe('Admin Users Routes', () => {
  const app = createApp();
  let adminSecret: string;
  let adminUser: any;

  beforeAll(async () => {
    // Create a persistent admin for all tests
    adminUser = await createTestSuperuser({ email: 'admin-users@test.local' });
    adminSecret = await createTestAdminSecret(adminUser.id);
  });

  describe('GET /admin/users', () => {
    it('should list users with pagination', async () => {
      // Create test users
      await createTestUser({ email: 'user1@test.com' });
      await createTestUser({ email: 'user2@test.com' });

      const res = await request(app)
        .get('/admin/users')
        .set('Authorization', `AdminSecret ${adminSecret}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('users');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.users)).toBe(true);
    });

    it('should reject requests without admin secret', async () => {
      const res = await request(app).get('/admin/users');

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should filter users by role', async () => {
      await createTestUser({ role: 'USER', email: 'filter-user1@test.com' });
      await createTestUser({ role: 'USER', email: 'filter-user2@test.com' });

      const res = await request(app)
        .get('/admin/users?role=USER')
        .set('Authorization', `AdminSecret ${adminSecret}`);

      expect(res.status).toBe(200);
      expect(res.body.users.length).toBeGreaterThan(0);
      expect(res.body.users.every((u: any) => u.role === 'USER')).toBe(true);
    });
  });

  describe('GET /admin/users/:id', () => {
    it('should get user details', async () => {
      const user = await createTestUser({ email: 'detail@test.com' });

      const res = await request(app)
        .get(`/admin/users/${user.id}`)
        .set('Authorization', `AdminSecret ${adminSecret}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', user.id);
      expect(res.body).toHaveProperty('email', user.email);
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app)
        .get('/admin/users/non-existent-id')
        .set('Authorization', `AdminSecret ${adminSecret}`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('PATCH /admin/users/:id/role', () => {
    it('should change user role', async () => {
      const user = await createTestUser({ role: 'USER', email: 'role-change@test.com' });

      const res = await request(app)
        .patch(`/admin/users/${user.id}/role`)
        .set('Authorization', `AdminSecret ${adminSecret}`)
        .send({ role: 'ADMIN' });

      expect(res.status).toBe(200);

      // Verify in database
      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updated?.role).toBe('ADMIN');
    });

    it('should prevent admin from changing own role', async () => {
      const res = await request(app)
        .patch(`/admin/users/${adminUser.id}/role`)
        .set('Authorization', `AdminSecret ${adminSecret}`)
        .send({ role: 'USER' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/own/i);
    });

    it('should reject invalid role', async () => {
      const user = await createTestUser({ email: 'invalid-role@test.com' });

      const res = await request(app)
        .patch(`/admin/users/${user.id}/role`)
        .set('Authorization', `AdminSecret ${adminSecret}`)
        .send({ role: 'INVALID_ROLE' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should require admin secret', async () => {
      const user = await createTestUser({ email: 'no-auth-role@test.com' });

      const res = await request(app)
        .patch(`/admin/users/${user.id}/role`)
        .send({ role: 'ADMIN' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /admin/users/:id/suspend', () => {
    it('should suspend user', async () => {
      const user = await createTestUser({ email: 'suspend@test.com' });

      const res = await request(app)
        .post(`/admin/users/${user.id}/suspend`)
        .set('Authorization', `AdminSecret ${adminSecret}`)
        .send({ reason: 'Violation of terms' });

      expect(res.status).toBe(200);

      // Verify in database
      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updated?.isSuspended).toBe(true);
      expect(updated?.suspendedReason).toBe('Violation of terms');
    });

    it('should invalidate user sessions on suspension', async () => {
      const user = await createTestUser({ email: 'suspend-sessions@test.com' });

      // Create sessions for the user
      await createTestSession(user.id);
      await createTestSession(user.id);

      await request(app)
        .post(`/admin/users/${user.id}/suspend`)
        .set('Authorization', `AdminSecret ${adminSecret}`)
        .send({ reason: 'Test suspension' });

      // Verify sessions deleted
      const sessions = await prisma.session.findMany({
        where: { userId: user.id },
      });
      expect(sessions.length).toBe(0);
    });

    it('should require admin secret', async () => {
      const user = await createTestUser({ email: 'suspend-no-auth@test.com' });

      const res = await request(app)
        .post(`/admin/users/${user.id}/suspend`)
        .send({ reason: 'Test' });

      expect(res.status).toBe(401);
    });

    it('should prevent suspending own account', async () => {
      const res = await request(app)
        .post(`/admin/users/${adminUser.id}/suspend`)
        .set('Authorization', `AdminSecret ${adminSecret}`)
        .send({ reason: 'Self-suspension' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/own/i);
    });
  });

  describe('POST /admin/users/:id/unsuspend', () => {
    it('should unsuspend user', async () => {
      const user = await createTestUser({ email: 'unsuspend@test.com', isSuspended: true });

      const res = await request(app)
        .post(`/admin/users/${user.id}/unsuspend`)
        .set('Authorization', `AdminSecret ${adminSecret}`);

      expect(res.status).toBe(200);

      // Verify in database
      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updated?.isSuspended).toBe(false);
    });

    it('should require admin secret', async () => {
      const user = await createTestUser({ email: 'unsuspend-no-auth@test.com', isSuspended: true });

      const res = await request(app)
        .post(`/admin/users/${user.id}/unsuspend`);

      expect(res.status).toBe(401);
    });
  });

  // Note: DELETE /admin/users/:id requires middleware fixes in admin.ts
  // The endpoint exists but the admin secret middleware chain needs adjustment
});
