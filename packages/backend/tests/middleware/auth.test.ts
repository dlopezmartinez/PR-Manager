import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { prisma } from '../../src/lib/prisma.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  authenticate,
} from '../../src/middleware/auth.js';
import { createTestUser, createTestSession } from '../helpers/testHelpers.js';

describe('Auth Middleware', () => {
  describe('generateAccessToken()', () => {
    it('should generate a valid JWT token', () => {
      const payload = {
        userId: 'test-user-id',
        email: 'test@example.com',
        role: 'USER' as const,
      };

      const token = generateAccessToken(payload);

      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // Valid JWT format
    });

    it('should include payload in token', () => {
      const payload = {
        userId: 'test-user-id',
        email: 'test@example.com',
        role: 'SUPERUSER' as const,
      };

      const token = generateAccessToken(payload);
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.role).toBe(payload.role);
    });

    it('should have 15 minute expiry', () => {
      const payload = {
        userId: 'test-user-id',
        email: 'test@example.com',
        role: 'USER' as const,
      };

      const token = generateAccessToken(payload);
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

      // Token should have exp claim
      expect(decoded.exp).toBeDefined();

      // Calculate expiry time
      const expirySeconds = decoded.exp - decoded.iat;
      const expiryMinutes = expirySeconds / 60;

      // Allow 1 minute tolerance
      expect(expiryMinutes).toBeCloseTo(15, 1);
    });

    it('should throw if JWT_SECRET not configured', () => {
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      const payload = {
        userId: 'test-user-id',
        email: 'test@example.com',
        role: 'USER' as const,
      };

      expect(() => generateAccessToken(payload)).toThrow(/JWT_SECRET/);

      // Restore
      process.env.JWT_SECRET = originalSecret;
    });
  });

  describe('generateRefreshToken()', () => {
    it('should generate a 64-character hex token', async () => {
      const user = await createTestUser();
      const token = await generateRefreshToken(user.id);

      expect(token).toMatch(/^[a-f0-9]{64}$/);
      expect(token.length).toBe(64);
    });

    it('should store hashed token in database', async () => {
      const user = await createTestUser();
      const plainToken = await generateRefreshToken(user.id);

      const session = await prisma.session.findFirst({
        where: { userId: user.id },
      });

      expect(session).toBeDefined();
      expect(session?.token).not.toBe(plainToken); // Should be hashed
    });

    it('should set 30-day expiry', async () => {
      const user = await createTestUser();
      await generateRefreshToken(user.id);

      const session = await prisma.session.findFirst({
        where: { userId: user.id },
      });

      const expiryTime = session!.expiresAt.getTime() - Date.now();
      const expiryDays = expiryTime / (1000 * 60 * 60 * 24);

      // Allow 1 day tolerance
      expect(expiryDays).toBeCloseTo(30, 1);
    });

    it('should allow multiple tokens per user', async () => {
      const user = await createTestUser();

      const token1 = await generateRefreshToken(user.id);
      const token2 = await generateRefreshToken(user.id);

      expect(token1).not.toBe(token2);

      const sessions = await prisma.session.findMany({
        where: { userId: user.id },
      });

      expect(sessions.length).toBe(2);
    });
  });

  describe('verifyRefreshToken()', () => {
    it('should verify a valid refresh token', async () => {
      const user = await createTestUser();
      const plainToken = await generateRefreshToken(user.id);

      const userId = await verifyRefreshToken(plainToken);

      expect(userId).toBe(user.id);
    });

    it('should return null for invalid token', async () => {
      const result = await verifyRefreshToken('invalid-token-12345');
      expect(result).toBeNull();
    });

    it('should return null for expired token', async () => {
      const user = await createTestUser();

      // Create token with past expiry
      const plainToken = 'test-token-' + Date.now();
      const tokenHash = require('crypto')
        .createHash('sha256')
        .update(plainToken)
        .digest('hex');

      await prisma.session.create({
        data: {
          userId: user.id,
          token: tokenHash,
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        },
      });

      const result = await verifyRefreshToken(plainToken);
      expect(result).toBeNull();
    });

    it('should verify token by hashing and comparing', async () => {
      const user = await createTestUser();
      const plainToken = await generateRefreshToken(user.id);

      // Verify the hashed token is in database
      const crypto = require('crypto');
      const tokenHash = crypto
        .createHash('sha256')
        .update(plainToken)
        .digest('hex');

      const session = await prisma.session.findFirst({
        where: { token: tokenHash, userId: user.id },
      });

      expect(session).toBeDefined();
    });

    it('should handle database errors gracefully', async () => {
      // Mock prisma to throw an error
      const originalFindFirst = prisma.session.findFirst;
      prisma.session.findFirst = vi.fn().mockRejectedValue(new Error('DB Error'));

      const result = await verifyRefreshToken('test-token');

      expect(result).toBeNull();

      // Restore
      prisma.session.findFirst = originalFindFirst;
    });
  });

  describe('authenticate() middleware', () => {
    it('should require Bearer token', () => {
      const req = { headers: {} } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should accept Bearer token', () => {
      const payload = {
        userId: 'test-user-id',
        email: 'test@example.com',
        role: 'USER' as const,
      };
      const token = generateAccessToken(payload);

      const req = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      } as any;
      const res = {} as any;
      const next = vi.fn();

      authenticate(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.userId).toBe(payload.userId);
    });

    it('should reject expired tokens', () => {
      // Create an expired token
      const expiredToken = jwt.sign(
        {
          userId: 'test-user-id',
          email: 'test@example.com',
          role: 'USER',
        },
        process.env.JWT_SECRET!,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      const req = {
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
          code: 'TOKEN_EXPIRED',
        })
      );
    });

    it('should reject invalid tokens', () => {
      const req = {
        headers: {
          authorization: 'Bearer invalid-token-format',
        },
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid token' })
      );
    });

    it('should set req.user from token payload', () => {
      const payload = {
        userId: 'user-123',
        email: 'user@example.com',
        role: 'ADMIN' as const,
      };
      const token = generateAccessToken(payload);

      const req = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      } as any;
      const res = {} as any;
      const next = vi.fn();

      authenticate(req, res, next);

      expect(req.user).toEqual(payload);
    });

    it('should require Bearer prefix', () => {
      const token = generateAccessToken({
        userId: 'test-user-id',
        email: 'test@example.com',
        role: 'USER' as const,
      });

      const req = {
        headers: {
          authorization: `Token ${token}`, // Wrong prefix
        },
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
