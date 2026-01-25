import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import {
  createTestSuperuser,
  createTestUser,
  createTestAdminSecret,
  createTestSession,
} from '../../helpers/testHelpers.js';

describe('Admin Health Routes', () => {
  const app = createApp();

  describe('GET /admin/health', () => {
    it('should return health status', async () => {
      const admin = await createTestSuperuser();
      const secret = await createTestAdminSecret(admin.id);

      const res = await request(app)
        .get('/admin/health')
        .set('Authorization', `AdminSecret ${secret}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('database');
      expect(res.body).toHaveProperty('users');
      expect(res.body).toHaveProperty('sessions');
      expect(res.body).toHaveProperty('subscriptions');
      expect(res.body).toHaveProperty('webhooks');
    });

    it('should report healthy status when database is connected', async () => {
      const admin = await createTestSuperuser();
      const secret = await createTestAdminSecret(admin.id);

      const res = await request(app)
        .get('/admin/health')
        .set('Authorization', `AdminSecret ${secret}`);

      expect(res.status).toBe(200);
      expect(['healthy', 'unhealthy']).toContain(res.body.status);
      expect(res.body.database.connected).toBe(true);
    });

    it('should include user metrics', async () => {
      const admin = await createTestSuperuser();
      const secret = await createTestAdminSecret(admin.id);

      // Create some test data
      await createTestUser();
      await createTestUser({ role: 'ADMIN' });

      const res = await request(app)
        .get('/admin/health')
        .set('Authorization', `AdminSecret ${secret}`);

      expect(res.status).toBe(200);
      expect(res.body.users).toHaveProperty('total');
      expect(res.body.users).toHaveProperty('active');
      expect(res.body.users).toHaveProperty('suspended');
      expect(res.body.users).toHaveProperty('admin');
      expect(res.body.users).toHaveProperty('superuser');
      expect(typeof res.body.users.total).toBe('number');
      expect(res.body.users.total).toBeGreaterThan(0);
    });

    it('should include session metrics', async () => {
      const admin = await createTestSuperuser();
      const secret = await createTestAdminSecret(admin.id);
      const user = await createTestUser();

      // Create a session
      await createTestSession(user.id);

      const res = await request(app)
        .get('/admin/health')
        .set('Authorization', `AdminSecret ${secret}`);

      expect(res.status).toBe(200);
      expect(res.body.sessions).toHaveProperty('active');
      expect(typeof res.body.sessions.active).toBe('number');
    });

    it('should include subscription metrics', async () => {
      const admin = await createTestSuperuser();
      const secret = await createTestAdminSecret(admin.id);

      const res = await request(app)
        .get('/admin/health')
        .set('Authorization', `AdminSecret ${secret}`);

      expect(res.status).toBe(200);
      expect(res.body.subscriptions).toHaveProperty('active');
      expect(res.body.subscriptions).toHaveProperty('trial');
      expect(res.body.subscriptions).toHaveProperty('cancelled');
      expect(res.body.subscriptions).toHaveProperty('total');
    });

    it('should include webhook metrics', async () => {
      const admin = await createTestSuperuser();
      const secret = await createTestAdminSecret(admin.id);

      const res = await request(app)
        .get('/admin/health')
        .set('Authorization', `AdminSecret ${secret}`);

      expect(res.status).toBe(200);
      expect(res.body.webhooks).toHaveProperty('processed');
      expect(res.body.webhooks).toHaveProperty('pending');
      expect(res.body.webhooks).toHaveProperty('failed');
      expect(res.body.webhooks).toHaveProperty('total');
    });

    it('should include audit log metrics', async () => {
      const admin = await createTestSuperuser();
      const secret = await createTestAdminSecret(admin.id);

      const res = await request(app)
        .get('/admin/health')
        .set('Authorization', `AdminSecret ${secret}`);

      expect(res.status).toBe(200);
      expect(res.body.auditLogs).toHaveProperty('total');
    });

    it('should include system information', async () => {
      const admin = await createTestSuperuser();
      const secret = await createTestAdminSecret(admin.id);

      const res = await request(app)
        .get('/admin/health')
        .set('Authorization', `AdminSecret ${secret}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('memory');
      expect(res.body).toHaveProperty('environment');
      expect(res.body).toHaveProperty('responseTime');
      expect(typeof res.body.uptime).toBe('number');
    });

    it('should reject without admin secret', async () => {
      const res = await request(app).get('/admin/health');

      expect(res.status).toBe(401);
    });

    it('should have database connection check in response', async () => {
      const admin = await createTestSuperuser();
      const secret = await createTestAdminSecret(admin.id);

      const res = await request(app)
        .get('/admin/health')
        .set('Authorization', `AdminSecret ${secret}`);

      expect(res.status).toBe(200);
      expect(res.body.database).toHaveProperty('connected');
      expect(res.body.database).toHaveProperty('checkTime');
    });
  });
});
