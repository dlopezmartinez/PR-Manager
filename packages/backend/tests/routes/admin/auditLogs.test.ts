import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import { prisma } from '../../../src/lib/prisma.js';
import {
  createTestSuperuser,
  createTestUser,
  createTestAdminSecret,
  createTestAuditLog,
} from '../../helpers/testHelpers.js';

describe('Admin Audit Logs Routes', () => {
  const app = createApp();

  describe('GET /admin/audit-logs', () => {
    it('should list audit logs with pagination', async () => {
      const admin = await createTestSuperuser();
      const secret = await createTestAdminSecret(admin.id);
      const user = await createTestUser();

      // Create some audit logs
      await createTestAuditLog(admin.id, 'USER_CREATED', { email: user.email }, user.id);
      await createTestAuditLog(admin.id, 'USER_ROLE_CHANGED', { role: 'ADMIN' }, user.id);

      const res = await request(app)
        .get('/admin/audit-logs')
        .set('Authorization', `AdminSecret ${secret}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('logs');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.logs)).toBe(true);
      expect(res.body.pagination).toHaveProperty('page');
      expect(res.body.pagination).toHaveProperty('limit');
      expect(res.body.pagination).toHaveProperty('total');
    });

    it('should filter by action', async () => {
      const admin = await createTestSuperuser();
      const secret = await createTestAdminSecret(admin.id);
      const user = await createTestUser();

      // Create logs with different actions
      await createTestAuditLog(admin.id, 'USER_SUSPENDED', {}, user.id);
      await createTestAuditLog(admin.id, 'USER_UNSUSPENDED', {}, user.id);
      await createTestAuditLog(admin.id, 'USER_ROLE_CHANGED', {}, user.id);

      const res = await request(app)
        .get('/admin/audit-logs?action=USER_SUSPENDED')
        .set('Authorization', `AdminSecret ${secret}`);

      expect(res.status).toBe(200);
      expect(res.body.logs.length).toBeGreaterThan(0);
      expect(res.body.logs.every((log: any) => log.action === 'USER_SUSPENDED')).toBe(true);
    });

    it('should filter by performedBy user', async () => {
      const admin1 = await createTestSuperuser();
      const admin2 = await createTestSuperuser();
      const secret = await createTestAdminSecret(admin1.id);
      const user = await createTestUser();

      // Create logs by different admins
      await createTestAuditLog(admin1.id, 'USER_CREATED', {}, user.id);
      await createTestAuditLog(admin2.id, 'USER_CREATED', {}, user.id);

      const res = await request(app)
        .get(`/admin/audit-logs?performedBy=${admin1.id}`)
        .set('Authorization', `AdminSecret ${secret}`);

      expect(res.status).toBe(200);
      // At least some logs should be from admin1
      const admin1Logs = res.body.logs.filter((log: any) => log.performedBy === admin1.id);
      expect(admin1Logs.length).toBeGreaterThan(0);
    });

    it('should filter by targetUserId', async () => {
      const admin = await createTestSuperuser();
      const secret = await createTestAdminSecret(admin.id);
      const user1 = await createTestUser();
      const user2 = await createTestUser();

      await createTestAuditLog(admin.id, 'USER_SUSPENDED', {}, user1.id);
      await createTestAuditLog(admin.id, 'USER_UNSUSPENDED', {}, user2.id);

      const res = await request(app)
        .get(`/admin/audit-logs?targetUserId=${user1.id}`)
        .set('Authorization', `AdminSecret ${secret}`);

      expect(res.status).toBe(200);
      // Should include logs targeting user1
      const user1Logs = res.body.logs.filter((log: any) => log.targetUserId === user1.id);
      expect(user1Logs.length).toBeGreaterThan(0);
    });

    it('should filter by date range', async () => {
      const admin = await createTestSuperuser();
      const secret = await createTestAdminSecret(admin.id);
      const user = await createTestUser();

      // Create logs at different times
      const log1 = await createTestAuditLog(admin.id, 'USER_CREATED', {}, user.id);
      const log2 = await createTestAuditLog(admin.id, 'USER_UPDATED', {}, user.id);

      const startDate = new Date(log1.createdAt.getTime() - 1000);
      const endDate = new Date(log2.createdAt.getTime() + 1000);

      const res = await request(app)
        .get(`/admin/audit-logs?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`)
        .set('Authorization', `AdminSecret ${secret}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.logs)).toBe(true);
    });

    it('should handle pagination', async () => {
      const admin = await createTestSuperuser();
      const secret = await createTestAdminSecret(admin.id);
      const user = await createTestUser();

      // Create multiple logs
      for (let i = 0; i < 5; i++) {
        await createTestAuditLog(admin.id, 'USER_CREATED', {}, user.id);
      }

      const res = await request(app)
        .get('/admin/audit-logs?page=1&limit=2')
        .set('Authorization', `AdminSecret ${secret}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(2);
    });

    it('should reject invalid startDate format', async () => {
      const admin = await createTestSuperuser();
      const secret = await createTestAdminSecret(admin.id);

      const res = await request(app)
        .get('/admin/audit-logs?startDate=invalid-date')
        .set('Authorization', `AdminSecret ${secret}`);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject invalid endDate format', async () => {
      const admin = await createTestSuperuser();
      const secret = await createTestAdminSecret(admin.id);

      const res = await request(app)
        .get('/admin/audit-logs?endDate=invalid-date')
        .set('Authorization', `AdminSecret ${secret}`);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject without admin secret', async () => {
      const res = await request(app).get('/admin/audit-logs');

      expect(res.status).toBe(401);
    });

    it('should return empty logs if none match filters', async () => {
      const admin = await createTestSuperuser();
      const secret = await createTestAdminSecret(admin.id);

      const res = await request(app)
        .get('/admin/audit-logs?action=USER_PASSWORD_CHANGED')
        .set('Authorization', `AdminSecret ${secret}`);

      expect(res.status).toBe(200);
      expect(res.body.logs.length).toBe(0);
    });

    it('should include pagination info in response', async () => {
      const admin = await createTestSuperuser();
      const secret = await createTestAdminSecret(admin.id);
      const user = await createTestUser();

      await createTestAuditLog(admin.id, 'USER_CREATED', {}, user.id);

      const res = await request(app)
        .get('/admin/audit-logs')
        .set('Authorization', `AdminSecret ${secret}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination).toHaveProperty('page');
      expect(res.body.pagination).toHaveProperty('limit');
      expect(res.body.pagination).toHaveProperty('total');
      expect(res.body.pagination).toHaveProperty('pages');
    });
  });
});
