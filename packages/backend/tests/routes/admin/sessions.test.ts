import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import { prisma } from '../../../src/lib/prisma.js';
import { createTestSuperuser, createTestUser, createTestAdminSecret, createTestSession } from '../../helpers/testHelpers.js';

describe('Admin Sessions Routes', () => {
  const app = createApp();
  let adminSecret: string;
  let adminUser: any;

  beforeAll(async () => {
    adminUser = await createTestSuperuser({ email: 'admin-sessions@test.local' });
    adminSecret = await createTestAdminSecret(adminUser.id);
  });

  describe('GET /admin/sessions', () => {
    it('should list all sessions with pagination', async () => {
      const user = await createTestUser({ email: 'user-sessions@test.com' });
      await createTestSession(user.id);
      await createTestSession(user.id);

      const res = await request(app)
        .get('/admin/sessions')
        .set('Authorization', `AdminSecret ${adminSecret}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('sessions');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.sessions)).toBe(true);
    });

    it('should require admin secret', async () => {
      const res = await request(app).get('/admin/sessions');

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /admin/sessions/user/:userId', () => {
    it('should list sessions for specific user', async () => {
      const user = await createTestUser({ email: 'user-specific-sessions@test.com' });
      await createTestSession(user.id);
      await createTestSession(user.id);

      const res = await request(app)
        .get(`/admin/sessions/user/${user.id}`)
        .set('Authorization', `AdminSecret ${adminSecret}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('sessions');
      expect(Array.isArray(res.body.sessions)).toBe(true);
      expect(res.body.sessions.every((s: any) => s.userId === user.id)).toBe(true);
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app)
        .get('/admin/sessions/user/non-existent-id')
        .set('Authorization', `AdminSecret ${adminSecret}`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('should require admin secret', async () => {
      const user = await createTestUser({ email: 'user-sessions-no-auth@test.com' });

      const res = await request(app).get(`/admin/sessions/user/${user.id}`);

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /admin/sessions/:id', () => {
    it('should revoke specific session', async () => {
      const user = await createTestUser({ email: 'user-revoke-session@test.com' });
      const session = await createTestSession(user.id);

      const res = await request(app)
        .delete(`/admin/sessions/${session.id}`)
        .set('Authorization', `AdminSecret ${adminSecret}`);

      expect(res.status).toBe(200);

      // Verify session deleted
      const deleted = await prisma.session.findUnique({ where: { id: session.id } });
      expect(deleted).toBeNull();
    });

    it('should return 404 for non-existent session', async () => {
      const res = await request(app)
        .delete('/admin/sessions/non-existent-id')
        .set('Authorization', `AdminSecret ${adminSecret}`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('should require admin secret', async () => {
      const user = await createTestUser({ email: 'user-revoke-no-auth@test.com' });
      const session = await createTestSession(user.id);

      const res = await request(app).delete(`/admin/sessions/${session.id}`);

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /admin/sessions/user/:userId/all', () => {
    it('should revoke all sessions for user', async () => {
      const user = await createTestUser({ email: 'user-revoke-all@test.com' });
      await createTestSession(user.id);
      await createTestSession(user.id);

      const res = await request(app)
        .delete(`/admin/sessions/user/${user.id}/all`)
        .set('Authorization', `AdminSecret ${adminSecret}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('count');

      // Verify all sessions deleted
      const remaining = await prisma.session.findMany({
        where: { userId: user.id },
      });
      expect(remaining.length).toBe(0);
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app)
        .delete('/admin/sessions/user/non-existent-id/all')
        .set('Authorization', `AdminSecret ${adminSecret}`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('should handle no sessions gracefully', async () => {
      const user = await createTestUser({ email: 'user-no-sessions@test.com' });

      const res = await request(app)
        .delete(`/admin/sessions/user/${user.id}/all`)
        .set('Authorization', `AdminSecret ${adminSecret}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
    });

    it('should require admin secret', async () => {
      const user = await createTestUser({ email: 'user-revoke-all-no-auth@test.com' });

      const res = await request(app).delete(`/admin/sessions/user/${user.id}/all`);

      expect(res.status).toBe(401);
    });
  });
});
