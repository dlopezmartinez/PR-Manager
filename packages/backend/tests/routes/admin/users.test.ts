import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import { prisma } from '../../../src/lib/prisma.js';
import { createTestSuperuser, createTestUser, createTestAdminSecret, createTestSession } from '../../helpers/testHelpers.js';

describe('Admin Users Routes', () => {
  const app = createApp();
  let adminSecret: string;
  let adminUser: any;

  beforeEach(async () => {
    // Create admin for each test (setup.ts truncates tables between tests)
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
      expect(res.body.error).toMatch(/your(self| own)/i);
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
      expect(res.body.error).toMatch(/your(self| own)/i);
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

  describe('PATCH /admin/users/:id/role - LIFETIME', () => {
    it('should change user role to LIFETIME', async () => {
      const user = await createTestUser({ role: 'USER', email: 'lifetime-role@test.com' });

      const res = await request(app)
        .patch(`/admin/users/${user.id}/role`)
        .set('Authorization', `AdminSecret ${adminSecret}`)
        .send({ role: 'LIFETIME' });

      expect(res.status).toBe(200);

      // Verify in database
      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updated?.role).toBe('LIFETIME');
    });

    it('should filter users by LIFETIME role', async () => {
      await createTestUser({ role: 'LIFETIME', email: 'filter-lifetime1@test.com' });
      await createTestUser({ role: 'LIFETIME', email: 'filter-lifetime2@test.com' });
      await createTestUser({ role: 'USER', email: 'filter-regular@test.com' });

      const res = await request(app)
        .get('/admin/users?role=LIFETIME')
        .set('Authorization', `AdminSecret ${adminSecret}`);

      expect(res.status).toBe(200);
      expect(res.body.users.length).toBe(2);
      expect(res.body.users.every((u: any) => u.role === 'LIFETIME')).toBe(true);
    });
  });

  describe('POST /admin/users/:id/grant-lifetime', () => {
    it('should grant LIFETIME access to user', async () => {
      const user = await createTestUser({ role: 'USER', email: 'grant-lifetime@test.com' });

      const res = await request(app)
        .post(`/admin/users/${user.id}/grant-lifetime`)
        .set('Authorization', `AdminSecret ${adminSecret}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/lifetime/i);

      // Verify in database
      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updated?.role).toBe('LIFETIME');
    });

    it('should reject if user already has LIFETIME', async () => {
      const user = await createTestUser({ role: 'LIFETIME', email: 'already-lifetime@test.com' });

      const res = await request(app)
        .post(`/admin/users/${user.id}/grant-lifetime`)
        .set('Authorization', `AdminSecret ${adminSecret}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already/i);
    });

    it('should require admin secret', async () => {
      const user = await createTestUser({ email: 'grant-no-auth@test.com' });

      const res = await request(app)
        .post(`/admin/users/${user.id}/grant-lifetime`);

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app)
        .post('/admin/users/non-existent-id/grant-lifetime')
        .set('Authorization', `AdminSecret ${adminSecret}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /admin/users/:id/revoke-lifetime', () => {
    it('should revoke LIFETIME access and set to USER', async () => {
      const user = await createTestUser({ role: 'LIFETIME', email: 'revoke-lifetime@test.com' });

      const res = await request(app)
        .post(`/admin/users/${user.id}/revoke-lifetime`)
        .set('Authorization', `AdminSecret ${adminSecret}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/revoked/i);

      // Verify in database
      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updated?.role).toBe('USER');
    });

    it('should reject if user does not have LIFETIME', async () => {
      const user = await createTestUser({ role: 'USER', email: 'not-lifetime@test.com' });

      const res = await request(app)
        .post(`/admin/users/${user.id}/revoke-lifetime`)
        .set('Authorization', `AdminSecret ${adminSecret}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/does not have/i);
    });

    it('should require admin secret', async () => {
      const user = await createTestUser({ role: 'LIFETIME', email: 'revoke-no-auth@test.com' });

      const res = await request(app)
        .post(`/admin/users/${user.id}/revoke-lifetime`);

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /admin/users/:id (soft delete)', () => {
    it('should soft delete user', async () => {
      const user = await createTestUser({ email: 'soft-delete@test.com' });

      const res = await request(app)
        .delete(`/admin/users/${user.id}`)
        .set('Authorization', `AdminSecret ${adminSecret}`);

      expect(res.status).toBe(200);

      // Verify in database - user still exists but isActive = false
      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updated).not.toBeNull();
      expect(updated?.isActive).toBe(false);
    });

    it('should require admin secret', async () => {
      const user = await createTestUser({ email: 'soft-delete-no-auth@test.com' });

      const res = await request(app)
        .delete(`/admin/users/${user.id}`);

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /admin/users/:id/permanent (hard delete)', () => {
    it('should permanently delete user with confirmation', async () => {
      const user = await createTestUser({ email: 'hard-delete@test.com' });

      const res = await request(app)
        .delete(`/admin/users/${user.id}/permanent`)
        .set('Authorization', `AdminSecret ${adminSecret}`)
        .send({ confirm: true });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/permanently deleted/i);

      // Verify user no longer exists
      const deleted = await prisma.user.findUnique({ where: { id: user.id } });
      expect(deleted).toBeNull();
    });

    it('should require confirmation', async () => {
      const user = await createTestUser({ email: 'hard-delete-no-confirm@test.com' });

      const res = await request(app)
        .delete(`/admin/users/${user.id}/permanent`)
        .set('Authorization', `AdminSecret ${adminSecret}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/confirmation/i);
    });

    it('should reject confirm: false', async () => {
      const user = await createTestUser({ email: 'hard-delete-false@test.com' });

      const res = await request(app)
        .delete(`/admin/users/${user.id}/permanent`)
        .set('Authorization', `AdminSecret ${adminSecret}`)
        .send({ confirm: false });

      expect(res.status).toBe(400);
    });

    it('should require admin secret', async () => {
      const user = await createTestUser({ email: 'hard-delete-no-auth@test.com' });

      const res = await request(app)
        .delete(`/admin/users/${user.id}/permanent`)
        .send({ confirm: true });

      expect(res.status).toBe(401);
    });

    it('should prevent deleting SUPERUSER accounts', async () => {
      const superuser = await createTestSuperuser({ email: 'superuser-nodelete@test.com' });

      const res = await request(app)
        .delete(`/admin/users/${superuser.id}/permanent`)
        .set('Authorization', `AdminSecret ${adminSecret}`)
        .send({ confirm: true });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/superuser/i);
    });

    it('should cascade delete related data', async () => {
      const user = await createTestUser({ email: 'hard-delete-cascade@test.com' });

      // Create related sessions
      await createTestSession(user.id);
      await createTestSession(user.id);

      // Verify sessions exist
      const sessionsBefore = await prisma.session.findMany({ where: { userId: user.id } });
      expect(sessionsBefore.length).toBe(2);

      // Delete user
      const res = await request(app)
        .delete(`/admin/users/${user.id}/permanent`)
        .set('Authorization', `AdminSecret ${adminSecret}`)
        .send({ confirm: true });

      expect(res.status).toBe(200);

      // Verify sessions are also deleted (cascade)
      const sessionsAfter = await prisma.session.findMany({ where: { userId: user.id } });
      expect(sessionsAfter.length).toBe(0);
    });
  });
});
