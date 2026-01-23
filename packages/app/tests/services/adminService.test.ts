import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminService } from '../../src/services/adminService';
import * as httpModule from '../../src/services/http';

// Mock the http service
vi.mock('../../src/services/http', () => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
  httpPatch: vi.fn(),
  httpDelete: vi.fn(),
}));

describe('Admin Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Users Management', () => {
    it('should fetch users list with pagination', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          users: [
            { id: '1', email: 'user@test.com', role: 'USER' },
          ],
          pagination: { page: 1, limit: 50, total: 1, pages: 1 },
        }),
      };

      vi.mocked(httpModule.httpGet).mockResolvedValue(mockResponse as any);

      const result = await adminService.getUsers({ page: 1, limit: 50 });

      expect(httpModule.httpGet).toHaveBeenCalledWith(
        expect.stringContaining('/admin/users')
      );
      expect(result.users).toBeDefined();
      expect(result.pagination).toBeDefined();
    });

    it('should pass filter parameters to getUsers', async () => {
      const mockResponse = { ok: true, json: async () => ({ users: [], pagination: {} }) };
      vi.mocked(httpModule.httpGet).mockResolvedValue(mockResponse as any);

      await adminService.getUsers({
        role: 'ADMIN',
        isSuspended: false,
        search: 'test',
      });

      expect(httpModule.httpGet).toHaveBeenCalledWith(
        expect.stringContaining('role=ADMIN')
      );
      expect(httpModule.httpGet).toHaveBeenCalledWith(
        expect.stringContaining('search=test')
      );
    });

    it('should fetch individual user details', async () => {
      const mockUser = { id: '1', email: 'user@test.com', role: 'USER' };
      const mockResponse = { ok: true, json: async () => mockUser };
      vi.mocked(httpModule.httpGet).mockResolvedValue(mockResponse as any);

      const result = await adminService.getUserDetails('user-id');

      expect(httpModule.httpGet).toHaveBeenCalledWith(
        expect.stringContaining('/admin/users/user-id')
      );
      expect(result.email).toBe('user@test.com');
    });

    it('should change user role', async () => {
      const mockResponse = { ok: true, json: async () => ({ message: 'Role updated' }) };
      vi.mocked(httpModule.httpPatch).mockResolvedValue(mockResponse as any);

      await adminService.changeUserRole('user-id', 'ADMIN');

      expect(httpModule.httpPatch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/users/user-id/role'),
        { role: 'ADMIN' }
      );
    });

    it('should suspend user', async () => {
      const mockResponse = { ok: true, json: async () => ({ message: 'User suspended' }) };
      vi.mocked(httpModule.httpPost).mockResolvedValue(mockResponse as any);

      await adminService.suspendUser('user-id', 'Policy violation');

      expect(httpModule.httpPost).toHaveBeenCalledWith(
        expect.stringContaining('/admin/users/user-id/suspend'),
        { reason: 'Policy violation' }
      );
    });

    it('should unsuspend user', async () => {
      const mockResponse = { ok: true, json: async () => ({ message: 'User unsuspended' }) };
      vi.mocked(httpModule.httpPost).mockResolvedValue(mockResponse as any);

      await adminService.unsuspendUser('user-id');

      expect(httpModule.httpPost).toHaveBeenCalledWith(
        expect.stringContaining('/admin/users/user-id/unsuspend'),
        {}
      );
    });

    it('should delete user', async () => {
      const mockResponse = { ok: true, json: async () => ({ message: 'User deleted' }) };
      vi.mocked(httpModule.httpDelete).mockResolvedValue(mockResponse as any);

      await adminService.deleteUser('user-id');

      expect(httpModule.httpDelete).toHaveBeenCalledWith(
        expect.stringContaining('/admin/users/user-id')
      );
    });

    it('should throw error on failed user fetch', async () => {
      const mockResponse = { ok: false, json: async () => ({}) };
      vi.mocked(httpModule.httpGet).mockResolvedValue(mockResponse as any);

      await expect(adminService.getUsers()).rejects.toThrow('Failed to fetch users');
    });
  });

  describe('Sessions Management', () => {
    it('should fetch all sessions', async () => {
      const mockResponse = { ok: true, json: async () => ({ sessions: [], pagination: {} }) };
      vi.mocked(httpModule.httpGet).mockResolvedValue(mockResponse as any);

      await adminService.getSessions();

      expect(httpModule.httpGet).toHaveBeenCalledWith(
        expect.stringContaining('/admin/sessions')
      );
    });

    it('should fetch user sessions', async () => {
      const mockResponse = { ok: true, json: async () => ({ sessions: [], pagination: {} }) };
      vi.mocked(httpModule.httpGet).mockResolvedValue(mockResponse as any);

      await adminService.getUserSessions('user-id', { page: 1 });

      expect(httpModule.httpGet).toHaveBeenCalledWith(
        expect.stringContaining('/admin/sessions/user/user-id')
      );
    });

    it('should revoke single session', async () => {
      const mockResponse = { ok: true, json: async () => ({ message: 'Session revoked' }) };
      vi.mocked(httpModule.httpDelete).mockResolvedValue(mockResponse as any);

      await adminService.revokeSession('session-id');

      expect(httpModule.httpDelete).toHaveBeenCalledWith(
        expect.stringContaining('/admin/sessions/session-id')
      );
    });

    it('should revoke all user sessions', async () => {
      const mockResponse = { ok: true, json: async () => ({ count: 3 }) };
      vi.mocked(httpModule.httpDelete).mockResolvedValue(mockResponse as any);

      await adminService.revokeAllUserSessions('user-id');

      expect(httpModule.httpDelete).toHaveBeenCalledWith(
        expect.stringContaining('/admin/sessions/user/user-id/all')
      );
    });
  });

  describe('Subscriptions Management', () => {
    it('should fetch subscriptions', async () => {
      const mockResponse = { ok: true, json: async () => ({ subscriptions: [], pagination: {} }) };
      vi.mocked(httpModule.httpGet).mockResolvedValue(mockResponse as any);

      await adminService.getSubscriptions();

      expect(httpModule.httpGet).toHaveBeenCalledWith(
        expect.stringContaining('/admin/subscriptions')
      );
    });

    it('should fetch subscription details', async () => {
      const mockResponse = { ok: true, json: async () => ({ id: '1', status: 'active' }) };
      vi.mocked(httpModule.httpGet).mockResolvedValue(mockResponse as any);

      await adminService.getSubscriptionDetails('sub-id');

      expect(httpModule.httpGet).toHaveBeenCalledWith(
        expect.stringContaining('/admin/subscriptions/sub-id')
      );
    });

    it('should update subscription status', async () => {
      const mockResponse = { ok: true, json: async () => ({ message: 'Status updated' }) };
      vi.mocked(httpModule.httpPatch).mockResolvedValue(mockResponse as any);

      await adminService.updateSubscriptionStatus('sub-id', 'cancelled');

      expect(httpModule.httpPatch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/subscriptions/sub-id/status'),
        { status: 'cancelled' }
      );
    });
  });

  describe('Webhooks Management', () => {
    it('should fetch webhooks', async () => {
      const mockResponse = { ok: true, json: async () => ({ webhooks: [], pagination: {} }) };
      vi.mocked(httpModule.httpGet).mockResolvedValue(mockResponse as any);

      await adminService.getWebhooks();

      expect(httpModule.httpGet).toHaveBeenCalledWith(
        expect.stringContaining('/admin/webhooks')
      );
    });

    it('should fetch webhook details', async () => {
      const mockResponse = { ok: true, json: async () => ({ id: '1', eventName: 'test' }) };
      vi.mocked(httpModule.httpGet).mockResolvedValue(mockResponse as any);

      await adminService.getWebhookDetails('webhook-id');

      expect(httpModule.httpGet).toHaveBeenCalledWith(
        expect.stringContaining('/admin/webhooks/webhook-id')
      );
    });

    it('should retry webhook', async () => {
      const mockResponse = { ok: true, json: async () => ({ message: 'Retry queued' }) };
      vi.mocked(httpModule.httpPost).mockResolvedValue(mockResponse as any);

      await adminService.retryWebhook('webhook-id');

      expect(httpModule.httpPost).toHaveBeenCalledWith(
        expect.stringContaining('/admin/webhooks/webhook-id/retry'),
        {}
      );
    });
  });

  describe('Audit Logs', () => {
    it('should fetch audit logs', async () => {
      const mockResponse = { ok: true, json: async () => ({ logs: [], pagination: {} }) };
      vi.mocked(httpModule.httpGet).mockResolvedValue(mockResponse as any);

      await adminService.getAuditLogs();

      expect(httpModule.httpGet).toHaveBeenCalledWith(
        expect.stringContaining('/admin/audit-logs')
      );
    });

    it('should pass audit log filters', async () => {
      const mockResponse = { ok: true, json: async () => ({ logs: [], pagination: {} }) };
      vi.mocked(httpModule.httpGet).mockResolvedValue(mockResponse as any);

      await adminService.getAuditLogs({
        action: 'USER_DELETED',
        performedBy: 'admin-id',
      });

      expect(httpModule.httpGet).toHaveBeenCalledWith(
        expect.stringContaining('action=USER_DELETED')
      );
      expect(httpModule.httpGet).toHaveBeenCalledWith(
        expect.stringContaining('performedBy=admin-id')
      );
    });
  });

  describe('System Configuration', () => {
    it('should fetch config', async () => {
      const mockResponse = { ok: true, json: async () => ({ config: {} }) };
      vi.mocked(httpModule.httpGet).mockResolvedValue(mockResponse as any);

      await adminService.getConfig();

      expect(httpModule.httpGet).toHaveBeenCalledWith(
        expect.stringContaining('/admin/config')
      );
    });

    it('should fetch config value', async () => {
      const mockResponse = { ok: true, json: async () => ({ value: 'test' }) };
      vi.mocked(httpModule.httpGet).mockResolvedValue(mockResponse as any);

      await adminService.getConfigValue('setting-key');

      expect(httpModule.httpGet).toHaveBeenCalledWith(
        expect.stringContaining('/admin/config/setting-key')
      );
    });

    it('should update config', async () => {
      const mockResponse = { ok: true, json: async () => ({ message: 'Updated' }) };
      vi.mocked(httpModule.httpPost).mockResolvedValue(mockResponse as any);

      await adminService.updateConfig('key', 'value');

      expect(httpModule.httpPost).toHaveBeenCalledWith(
        expect.stringContaining('/admin/config'),
        { key: 'key', value: 'value' }
      );
    });

    it('should delete config', async () => {
      const mockResponse = { ok: true, json: async () => ({ message: 'Deleted' }) };
      vi.mocked(httpModule.httpDelete).mockResolvedValue(mockResponse as any);

      await adminService.deleteConfig('key');

      expect(httpModule.httpDelete).toHaveBeenCalledWith(
        expect.stringContaining('/admin/config/key')
      );
    });
  });

  describe('System Health', () => {
    it('should fetch health status', async () => {
      const mockResponse = { ok: true, json: async () => ({ status: 'healthy' }) };
      vi.mocked(httpModule.httpGet).mockResolvedValue(mockResponse as any);

      await adminService.getHealth();

      expect(httpModule.httpGet).toHaveBeenCalledWith(
        expect.stringContaining('/admin/health')
      );
    });
  });
});
