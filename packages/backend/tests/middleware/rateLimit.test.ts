import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loginLimiter, signupLimiter, downloadLimiter, globalLimiter } from '../../src/middleware/rateLimit.js';

describe('Rate Limiting Middleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('loginLimiter', () => {
    it('should allow requests within limit', () => {
      const req = { ip: '127.0.0.1' } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      // Allow up to 5 requests
      for (let i = 0; i < 5; i++) {
        loginLimiter(req, res, next);
        expect(next).toHaveBeenCalledTimes(i + 1);
        expect(res.status).not.toHaveBeenCalled();
      }
    });

    it('should block requests exceeding 5 per 5 minutes', () => {
      const req = { ip: '127.0.0.1' } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      // Fill up the limit
      for (let i = 0; i < 5; i++) {
        loginLimiter(req, res, next);
      }

      // 6th request should be blocked
      loginLimiter(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Too many'),
        })
      );
    });

    it('should reset after 5 minute window', () => {
      const req = { ip: '127.0.0.1' } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      // Fill up the limit
      for (let i = 0; i < 5; i++) {
        loginLimiter(req, res, next);
      }

      // Advance time by 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Reset mocks to check new request
      next.mockClear();
      res.status.mockClear();
      res.json.mockClear();

      // Should allow requests again
      loginLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should track by IP address', () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      const req1 = { ip: '192.168.1.1' } as any;
      const req2 = { ip: '192.168.1.2' } as any;

      // Fill limit for IP1
      for (let i = 0; i < 5; i++) {
        loginLimiter(req1, res, next);
      }

      // Reset mocks
      res.status.mockClear();
      next.mockClear();

      // IP2 should still have requests available
      loginLimiter(req2, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('signupLimiter', () => {
    it('should allow up to 3 requests per hour', () => {
      const req = { ip: '127.0.0.1' } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      // Allow up to 3 requests
      for (let i = 0; i < 3; i++) {
        signupLimiter(req, res, next);
        expect(next).toHaveBeenCalledTimes(i + 1);
        expect(res.status).not.toHaveBeenCalled();
      }
    });

    it('should block 4th request within hour', () => {
      const req = { ip: '127.0.0.1' } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      // Fill up the limit
      for (let i = 0; i < 3; i++) {
        signupLimiter(req, res, next);
      }

      // 4th request should be blocked
      signupLimiter(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
    });

    it('should reset after 1 hour', () => {
      const req = { ip: '127.0.0.1' } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      // Fill up the limit
      for (let i = 0; i < 3; i++) {
        signupLimiter(req, res, next);
      }

      // Advance time by 1 hour
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);

      // Reset mocks
      next.mockClear();
      res.status.mockClear();

      // Should allow requests again
      signupLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('downloadLimiter', () => {
    it('should allow up to 10 requests per hour', () => {
      const req = { ip: '127.0.0.1' } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      // Allow up to 10 requests
      for (let i = 0; i < 10; i++) {
        downloadLimiter(req, res, next);
        expect(next).toHaveBeenCalledTimes(i + 1);
      }
    });

    it('should block 11th request within hour', () => {
      const req = { ip: '127.0.0.1' } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      // Fill up the limit
      for (let i = 0; i < 10; i++) {
        downloadLimiter(req, res, next);
      }

      // 11th request should be blocked
      downloadLimiter(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
    });

    it('should reset after 1 hour', () => {
      const req = { ip: '127.0.0.1' } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      // Fill up the limit
      for (let i = 0; i < 10; i++) {
        downloadLimiter(req, res, next);
      }

      // Advance time by 1 hour
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);

      // Reset mocks
      next.mockClear();
      res.status.mockClear();

      // Should allow requests again
      downloadLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('globalLimiter', () => {
    it('should allow up to 100 requests per 15 minutes', () => {
      const req = { ip: '127.0.0.1' } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      // Allow up to 100 requests
      for (let i = 0; i < 100; i++) {
        globalLimiter(req, res, next);
        expect(next).toHaveBeenCalledTimes(i + 1);
      }
    });

    it('should block 101st request within 15 minutes', () => {
      const req = { ip: '127.0.0.1' } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      // Fill up the limit
      for (let i = 0; i < 100; i++) {
        globalLimiter(req, res, next);
      }

      // 101st request should be blocked
      globalLimiter(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
    });

    it('should reset after 15 minutes', () => {
      const req = { ip: '127.0.0.1' } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      // Fill up the limit (100 requests)
      for (let i = 0; i < 100; i++) {
        globalLimiter(req, res, next);
      }

      // Advance time by 15 minutes
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);

      // Reset mocks
      next.mockClear();
      res.status.mockClear();

      // Should allow requests again
      globalLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should track by IP address', () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      const req1 = { ip: '192.168.1.1' } as any;
      const req2 = { ip: '192.168.1.2' } as any;

      // Fill limit for IP1
      for (let i = 0; i < 100; i++) {
        globalLimiter(req1, res, next);
      }

      // Reset mocks
      res.status.mockClear();
      next.mockClear();

      // IP2 should still have requests available
      for (let i = 0; i < 10; i++) {
        globalLimiter(req2, res, next);
      }
      expect(next).toHaveBeenCalledTimes(10);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
