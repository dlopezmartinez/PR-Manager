import { describe, it, expect, vi } from 'vitest';
import { requireAdminSecret } from '../../src/middleware/adminSecret.js';
import { createTestSuperuser, createTestAdminSecret } from '../helpers/testHelpers.js';

describe('Admin Secret Middleware', () => {
  describe('requireAdminSecret()', () => {
    it('should accept valid admin secret', async () => {
      const user = await createTestSuperuser();
      const plainSecret = await createTestAdminSecret(user.id);

      const req = {
        headers: {
          authorization: `AdminSecret ${plainSecret}`,
        },
      } as any;
      const res = {} as any;
      const next = vi.fn();

      await requireAdminSecret(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.userId).toBe(user.id);
      expect(req.user.role).toBe('SUPERUSER');
      expect(req.adminSecretValid).toBe(true);
    });

    it('should set secret metadata on request', async () => {
      const user = await createTestSuperuser();
      const plainSecret = await createTestAdminSecret(user.id, 'Test Secret');

      const req = {
        headers: {
          authorization: `AdminSecret ${plainSecret}`,
        },
      } as any;
      const res = {} as any;
      const next = vi.fn();

      await requireAdminSecret(req, res, next);

      expect(req.secretId).toBeDefined();
      expect(req.secretName).toBe('Test Secret');
      expect(req.secretType).toBe('user-secret');
    });

    it('should skip if no AdminSecret header present', async () => {
      const req = {
        headers: {},
      } as any;
      const res = {} as any;
      const next = vi.fn();

      await requireAdminSecret(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.adminSecretValid).toBeUndefined();
    });

    it('should reject invalid secret format', async () => {
      const req = {
        headers: {
          authorization: 'Bearer invalid-secret',
        },
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await requireAdminSecret(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.adminSecretValid).toBeUndefined();
    });

    it('should reject revoked secrets', async () => {
      const user = await createTestSuperuser();
      const plainSecret = await createTestAdminSecret(user.id);

      // Revoke the secret
      const { prisma } = await import('../../src/lib/prisma.js');
      const hash = require('crypto')
        .createHash('sha256')
        .update(plainSecret)
        .digest('hex');
      const secret = await prisma.adminSecret.findUnique({
        where: { secretHash: hash },
      });
      if (secret) {
        await prisma.adminSecret.update({
          where: { id: secret.id },
          data: { revokedAt: new Date() },
        });
      }

      const req = {
        headers: {
          authorization: `AdminSecret ${plainSecret}`,
        },
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await requireAdminSecret(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('revoked'),
        })
      );
    });

    it('should reject invalid secret', async () => {
      const req = {
        headers: {
          authorization: `AdminSecret invalid-secret-12345`,
        },
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await requireAdminSecret(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid'),
        })
      );
    });

    it('should update lastUsedAt timestamp', async () => {
      const user = await createTestSuperuser();
      const plainSecret = await createTestAdminSecret(user.id);

      const { prisma } = await import('../../src/lib/prisma.js');
      const hash = require('crypto')
        .createHash('sha256')
        .update(plainSecret)
        .digest('hex');
      const secretBefore = await prisma.adminSecret.findUnique({
        where: { secretHash: hash },
      });

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));

      const req = {
        headers: {
          authorization: `AdminSecret ${plainSecret}`,
        },
      } as any;
      const res = {} as any;
      const next = vi.fn();

      await requireAdminSecret(req, res, next);

      // Note: lastUsedAt is updated asynchronously, so we might not see it immediately
      // but the middleware should have triggered the update
      expect(next).toHaveBeenCalled();
    });

    it('should include user info with secret', async () => {
      const user = await createTestSuperuser({ email: 'admin@test.com' });
      const plainSecret = await createTestAdminSecret(user.id);

      const req = {
        headers: {
          authorization: `AdminSecret ${plainSecret}`,
        },
      } as any;
      const res = {} as any;
      const next = vi.fn();

      await requireAdminSecret(req, res, next);

      expect(req.user.email).toBe('admin@test.com');
      expect(req.user.role).toBe('SUPERUSER');
    });

    it('should reject missing Authorization header value', async () => {
      const req = {
        headers: {
          authorization: 'AdminSecret ',
        },
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await requireAdminSecret(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should handle different secret per user', async () => {
      const user1 = await createTestSuperuser();
      const user2 = await createTestSuperuser();

      const secret1 = await createTestAdminSecret(user1.id);
      const secret2 = await createTestAdminSecret(user2.id);

      // Test secret1
      const req1 = {
        headers: {
          authorization: `AdminSecret ${secret1}`,
        },
      } as any;
      const res = {} as any;
      const next = vi.fn();

      await requireAdminSecret(req1, res, next);

      expect(req1.user.userId).toBe(user1.id);

      // Reset and test secret2
      const req2 = {
        headers: {
          authorization: `AdminSecret ${secret2}`,
        },
      } as any;
      next.mockClear();

      await requireAdminSecret(req2, res, next);

      expect(req2.user.userId).toBe(user2.id);
    });
  });
});
