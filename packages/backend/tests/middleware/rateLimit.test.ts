import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loginLimiter, signupLimiter, downloadLimiter, globalLimiter } from '../../src/middleware/rateLimit.js';

describe('Rate Limiting Middleware', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // Rate limiting is skipped in test/development, so set to production for these tests
    process.env.NODE_ENV = 'production';
    vi.useFakeTimers();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.useRealTimers();
  });

  // Helper to create a properly mocked request with unique IP per test
  const createMockReq = (overrides = {}) => ({
    ip: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    headers: {},
    body: {},
    user: undefined,
    app: {
      get: vi.fn().mockReturnValue(false), // trustProxy setting
    },
    ...overrides,
  });

  // Helper to call middleware and wait for completion
  const callMiddleware = (limiter: any, req: any, res: any, next: any): Promise<void> => {
    return new Promise((resolve) => {
      const wrappedNext = (...args: any[]) => {
        next(...args);
        resolve();
      };
      const result = limiter(req, res, wrappedNext);
      // If middleware returns a promise, wait for it
      if (result && typeof result.then === 'function') {
        result.then(resolve).catch(resolve);
      }
    });
  };

  describe('loginLimiter', () => {
    it('should allow requests within limit', async () => {
      const req = createMockReq({ body: { email: `test-${Date.now()}@example.com` } });
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
        getHeader: vi.fn(),
      } as any;
      const next = vi.fn();

      // Allow up to 5 requests
      for (let i = 0; i < 5; i++) {
        await callMiddleware(loginLimiter, req, res, next);
      }

      expect(next).toHaveBeenCalledTimes(5);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should block requests exceeding 5 per 5 minutes', async () => {
      const req = createMockReq({ body: { email: `block-${Date.now()}@example.com` } });
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
        getHeader: vi.fn(),
      } as any;
      const next = vi.fn();

      // Fill up the limit
      for (let i = 0; i < 5; i++) {
        await callMiddleware(loginLimiter, req, res, next);
      }

      // 6th request should be blocked
      await callMiddleware(loginLimiter, req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Too many'),
        })
      );
    });

    it('should track by email for login', async () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
        getHeader: vi.fn(),
      } as any;
      const next = vi.fn();

      const req1 = createMockReq({ body: { email: `email1-${Date.now()}@example.com` } });
      const req2 = createMockReq({ body: { email: `email2-${Date.now()}@example.com` } });

      // Fill limit for email1
      for (let i = 0; i < 5; i++) {
        await callMiddleware(loginLimiter, req1, res, next);
      }

      // Reset mocks
      res.status.mockClear();
      next.mockClear();

      // email2 should still have requests available
      await callMiddleware(loginLimiter, req2, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('signupLimiter', () => {
    it('should allow up to 3 requests per hour', async () => {
      const req = createMockReq();
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
        getHeader: vi.fn(),
      } as any;
      const next = vi.fn();

      // Allow up to 3 requests
      for (let i = 0; i < 3; i++) {
        await callMiddleware(signupLimiter, req, res, next);
      }

      expect(next).toHaveBeenCalledTimes(3);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should block 4th request within hour', async () => {
      const req = createMockReq();
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
        getHeader: vi.fn(),
      } as any;
      const next = vi.fn();

      // Fill up the limit
      for (let i = 0; i < 3; i++) {
        await callMiddleware(signupLimiter, req, res, next);
      }

      // 4th request should be blocked
      await callMiddleware(signupLimiter, req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
    });
  });

  describe('downloadLimiter', () => {
    it('should allow up to 10 requests per hour', async () => {
      const req = createMockReq();
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
        getHeader: vi.fn(),
      } as any;
      const next = vi.fn();

      // Allow up to 10 requests
      for (let i = 0; i < 10; i++) {
        await callMiddleware(downloadLimiter, req, res, next);
      }

      expect(next).toHaveBeenCalledTimes(10);
    });

    it('should block 11th request within hour', async () => {
      const req = createMockReq();
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
        getHeader: vi.fn(),
      } as any;
      const next = vi.fn();

      // Fill up the limit
      for (let i = 0; i < 10; i++) {
        await callMiddleware(downloadLimiter, req, res, next);
      }

      // 11th request should be blocked
      await callMiddleware(downloadLimiter, req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
    });
  });

  describe('globalLimiter', () => {
    it('should allow up to 100 requests per 15 minutes', async () => {
      const req = createMockReq();
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
        getHeader: vi.fn(),
      } as any;
      const next = vi.fn();

      // Allow up to 100 requests
      for (let i = 0; i < 100; i++) {
        await callMiddleware(globalLimiter, req, res, next);
      }

      expect(next).toHaveBeenCalledTimes(100);
    });

    it('should block 101st request within 15 minutes', async () => {
      const req = createMockReq();
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
        getHeader: vi.fn(),
      } as any;
      const next = vi.fn();

      // Fill up the limit
      for (let i = 0; i < 100; i++) {
        await callMiddleware(globalLimiter, req, res, next);
      }

      // 101st request should be blocked
      await callMiddleware(globalLimiter, req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
    });

    it('should track by IP address', async () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
        getHeader: vi.fn(),
      } as any;
      const next = vi.fn();

      const req1 = createMockReq({ ip: `10.0.0.${Math.floor(Math.random() * 255)}` });
      const req2 = createMockReq({ ip: `10.0.1.${Math.floor(Math.random() * 255)}` });

      // Fill limit for IP1
      for (let i = 0; i < 100; i++) {
        await callMiddleware(globalLimiter, req1, res, next);
      }

      // Reset mocks
      res.status.mockClear();
      next.mockClear();

      // IP2 should still have requests available
      for (let i = 0; i < 10; i++) {
        await callMiddleware(globalLimiter, req2, res, next);
      }
      expect(next).toHaveBeenCalledTimes(10);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
