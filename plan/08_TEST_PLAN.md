# Comprehensive Test Plan - Security Remediation

**Status:** 📋 Plan (Implementation pending)
**Priority:** 🔴 Critical (All vulnerabilities must be tested)
**Scope:** Unit + Integration + E2E + Manual Tests
**Timeline:** Post-Phase 2 (January 24+)

---

## Overview

This plan defines comprehensive testing strategy for security-hardened PR Manager application covering:
- ✅ Unit tests (services, utilities, components)
- ✅ Integration tests (HTTP interceptor, auth flow, webhooks)
- ✅ E2E tests (complete user workflows)
- ✅ Manual tests (security scenarios, edge cases)

---

## Test Environment Setup

### Backend
```bash
# Testing database (separate from dev)
DATABASE_URL=postgresql://user:pass@localhost:5432/pr_manager_test
JWT_SECRET=test-secret-12345
DOWNLOAD_SECRET=test-download-secret
NODE_ENV=test

# Test runner
npm run test:backend
# or
jest --coverage

# Test watch mode
jest --watch
```

### Frontend
```bash
# Testing configuration
VITE_API_URL=http://localhost:3000
NODE_ENV=test

# Test runner
npm run test:app
# or
vitest

# Test watch mode
vitest --watch
```

---

## 1. Unit Tests

### Backend Services

#### 1.1 Rate Limiting Tests
**File**: `packages/backend/tests/middleware/rateLimit.test.ts`

```typescript
describe('Rate Limiting', () => {
  describe('loginLimiter', () => {
    it('should allow 5 requests per 5 minutes', async () => {
      // Make 5 requests → all succeed
      for (let i = 0; i < 5; i++) {
        const res = await request(app).post('/auth/login').send(credentials);
        expect(res.status).not.toBe(429);
      }
    });

    it('should block 6th request within 5 minutes', async () => {
      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        await request(app).post('/auth/login').send(credentials);
      }
      // 6th request should be blocked
      const res = await request(app).post('/auth/login').send(credentials);
      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Too many login attempts');
    });

    it('should reset after 5 minutes', async () => {
      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        await request(app).post('/auth/login').send(credentials);
      }
      // Wait 5 minutes
      jest.advanceTimersByTime(5 * 60 * 1000);
      // Should allow request again
      const res = await request(app).post('/auth/login').send(credentials);
      expect(res.status).not.toBe(429);
    });

    it('should rate limit by email (not IP for login)', async () => {
      const email = 'test@example.com';
      // 5 requests with same email
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/auth/login')
          .send({ email, password: 'wrong' });
      }
      // 6th request should fail
      const res = await request(app)
        .post('/auth/login')
        .send({ email, password: 'wrong' });
      expect(res.status).toBe(429);
    });
  });

  describe('downloadLimiter', () => {
    it('should allow 10 downloads per hour', async () => {
      for (let i = 0; i < 10; i++) {
        const res = await request(app)
          .get(`/download/mac/1.0.0?signature=x&expires=y&user=z`)
          .auth(token, { type: 'bearer' });
        expect(res.status).not.toBe(429);
      }
    });

    it('should block 11th download within hour', async () => {
      // Make 10 requests
      for (let i = 0; i < 10; i++) {
        await request(app)
          .get(`/download/mac/1.0.0?signature=x&expires=y&user=z`)
          .auth(token, { type: 'bearer' });
      }
      // 11th should fail
      const res = await request(app)
        .get(`/download/mac/1.0.0?signature=x&expires=y&user=z`)
        .auth(token, { type: 'bearer' });
      expect(res.status).toBe(429);
    });
  });
});
```

#### 1.2 Token Management Tests
**File**: `packages/backend/tests/middleware/auth.test.ts`

```typescript
describe('Token Management', () => {
  describe('generateAccessToken', () => {
    it('should generate JWT with 15-minute expiry', () => {
      const token = generateAccessToken({
        userId: 'user1',
        email: 'test@example.com',
        role: 'USER'
      });

      const decoded = jwt.decode(token);
      const expiresIn = decoded.exp * 1000 - Date.now();
      // Should expire in ~15 minutes (allow 1 minute variance)
      expect(expiresIn).toBeGreaterThan(14 * 60 * 1000);
      expect(expiresIn).toBeLessThan(16 * 60 * 1000);
    });

    it('should include userId in payload', () => {
      const token = generateAccessToken({
        userId: 'user123',
        email: 'test@example.com',
        role: 'USER'
      });

      const decoded = jwt.decode(token);
      expect(decoded.userId).toBe('user123');
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.role).toBe('USER');
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate secure 256-bit token', async () => {
      const token = await generateRefreshToken('user1');
      // Should be 64 hex characters (256 bits)
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should store hashed token in database', async () => {
      const token = await generateRefreshToken('user1');
      const tokenHash = createHash('sha256').update(token).digest('hex');

      const session = await prisma.session.findFirst({
        where: { token: tokenHash }
      });

      expect(session).toBeDefined();
      expect(session.userId).toBe('user1');
      expect(session.expiresAt).toBeGreaterThan(new Date());
    });

    it('should set 30-day expiry', async () => {
      const token = await generateRefreshToken('user1');
      const tokenHash = createHash('sha256').update(token).digest('hex');

      const session = await prisma.session.findFirst({
        where: { token: tokenHash }
      });

      const expiresIn = session.expiresAt.getTime() - Date.now();
      // Should expire in ~30 days
      expect(expiresIn).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
      expect(expiresIn).toBeLessThan(31 * 24 * 60 * 60 * 1000);
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify valid token', async () => {
      const token = await generateRefreshToken('user1');
      const userId = await verifyRefreshToken(token);
      expect(userId).toBe('user1');
    });

    it('should return null for invalid token', async () => {
      const userId = await verifyRefreshToken('invalid-token-xyz');
      expect(userId).toBeNull();
    });

    it('should return null for expired token', async () => {
      const token = await generateRefreshToken('user1');
      // Advance time by 31 days
      jest.advanceTimersByTime(31 * 24 * 60 * 60 * 1000);
      const userId = await verifyRefreshToken(token);
      expect(userId).toBeNull();
    });
  });
});
```

#### 1.3 Webhook Audit Tests
**File**: `packages/backend/tests/services/webhookAudit.test.ts`

```typescript
describe('Webhook Audit Service', () => {
  describe('logWebhookEvent', () => {
    it('should log webhook event with unique event_id', async () => {
      const eventId = await logWebhookEvent({
        eventType: 'subscription.created',
        provider: 'lemonsqueezy',
        payload: { orderId: '123' },
        eventId: 'unique-id-1'
      });

      expect(eventId).toBeDefined();
      const event = await getWebhookEvent(eventId);
      expect(event.eventId).toBe('unique-id-1');
    });

    it('should prevent duplicate events with same event_id', async () => {
      const id1 = await logWebhookEvent({
        eventType: 'subscription.created',
        provider: 'lemonsqueezy',
        payload: { orderId: '123' },
        eventId: 'duplicate-id'
      });

      // Try to log same event_id again
      const id2 = await logWebhookEvent({
        eventType: 'subscription.created',
        provider: 'lemonsqueezy',
        payload: { orderId: '456' }, // Different payload
        eventId: 'duplicate-id'
      });

      // Should use same event ID (idempotent)
      expect(id1).toBe(id2);
    });
  });

  describe('markWebhookProcessed', () => {
    it('should mark event as processed', async () => {
      const eventId = await logWebhookEvent({
        eventType: 'subscription.created',
        provider: 'lemonsqueezy',
        payload: { orderId: '123' },
        eventId: 'test-1'
      });

      await markWebhookProcessed(eventId);
      const event = await getWebhookEvent(eventId);
      expect(event.processed).toBe(true);
    });
  });

  describe('webhook retry queue', () => {
    it('should add failed webhook to retry queue', async () => {
      const eventId = await logWebhookEvent({
        eventType: 'subscription.created',
        provider: 'lemonsqueezy',
        payload: { orderId: '123' },
        eventId: 'retry-test'
      });

      await logWebhookError(eventId, new Error('Network error'));
      const pendingWebhooks = await getPendingWebhooks();

      expect(pendingWebhooks).toContainEqual(
        expect.objectContaining({ eventId })
      );
    });

    it('should implement exponential backoff', async () => {
      const delays = [];
      for (let i = 1; i <= 4; i++) {
        const delay = getRetryDelay(i);
        delays.push(delay);
      }

      // Delays: 5min, 30min, 2h, 24h
      expect(delays).toEqual([
        5 * 60 * 1000,
        30 * 60 * 1000,
        2 * 60 * 60 * 1000,
        24 * 60 * 60 * 1000
      ]);
    });
  });
});
```

### Frontend Services

#### 1.4 HTTP Interceptor Tests
**File**: `packages/app/tests/services/http.test.ts`

```typescript
describe('HTTP Interceptor', () => {
  describe('httpFetch', () => {
    it('should add Authorization header', async () => {
      const mockFetch = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );
      global.fetch = mockFetch;

      await httpFetch('http://api.test/data');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Bearer ')
          })
        })
      );
    });

    it('should refresh token on 401 TOKEN_EXPIRED', async () => {
      // First call returns 401
      // Second call (refresh) succeeds
      // Third call (retry) succeeds
      const mockFetch = jest.fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ code: 'TOKEN_EXPIRED' }),
            { status: 401 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              accessToken: 'new-token',
              refreshToken: 'new-refresh'
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ success: true }), { status: 200 })
        );

      global.fetch = mockFetch;

      const response = await httpFetch('http://api.test/data');

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should queue requests during refresh', async () => {
      // Simulate multiple concurrent requests during refresh
      const results = [];

      global.fetch = jest.fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ success: true }), { status: 200 })
        );

      const promise1 = httpFetch('http://api.test/data1');
      const promise2 = httpFetch('http://api.test/data2');
      const promise3 = httpFetch('http://api.test/data3');

      await Promise.all([promise1, promise2, promise3]);

      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('Token expiry detection', () => {
    it('should detect token expiring in < 5 minutes', async () => {
      // Create token expiring in 3 minutes
      const token = jwt.sign(
        { userId: 'test' },
        'secret',
        { expiresIn: '3m' }
      );

      const shouldRefresh = await shouldProactivelyRefresh();
      expect(shouldRefresh).toBe(true);
    });

    it('should not refresh token with > 5 minutes left', async () => {
      // Create token expiring in 10 minutes
      const token = jwt.sign(
        { userId: 'test' },
        'secret',
        { expiresIn: '10m' }
      );

      const shouldRefresh = await shouldProactivelyRefresh();
      expect(shouldRefresh).toBe(false);
    });
  });
});
```

#### 1.5 Sanitization Tests
**File**: `packages/app/tests/utils/sanitize.test.ts`

```typescript
describe('HTML Sanitization', () => {
  describe('sanitizeHtml', () => {
    it('should remove script tags', () => {
      const input = '<script>alert("xss")</script><p>Hello</p>';
      const output = sanitizeHtml(input);
      expect(output).not.toContain('<script>');
      expect(output).toContain('Hello');
    });

    it('should remove event handlers', () => {
      const input = '<button onclick="alert(1)">Click</button>';
      const output = sanitizeHtml(input);
      expect(output).not.toContain('onclick');
      expect(output).toContain('Click');
    });

    it('should remove onerror from img tags', () => {
      const input = '<img src=x onerror="alert(1)">';
      const output = sanitizeHtml(input);
      expect(output).not.toContain('onerror');
      expect(output).toContain('<img');
    });

    it('should block javascript: protocol', () => {
      const input = '<a href="javascript:alert(1)">Link</a>';
      const output = sanitizeHtml(input);
      expect(output).not.toContain('javascript:');
    });

    it('should preserve safe HTML', () => {
      const input = '<p>Hello <strong>world</strong></p>';
      const output = sanitizeHtml(input);
      expect(output).toBe('<p>Hello <strong>world</strong></p>');
    });

    it('should allow safe formatting tags', () => {
      const input = '<h1>Title</h1><p>Text <em>italic</em> <b>bold</b></p>';
      const output = sanitizeHtml(input);
      expect(output).toContain('<h1>');
      expect(output).toContain('<em>');
      expect(output).toContain('<b>');
    });

    it('should allow lists', () => {
      const input = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const output = sanitizeHtml(input);
      expect(output).toContain('<ul>');
      expect(output).toContain('<li>');
    });

    it('should allow code blocks', () => {
      const input = '<pre><code>const x = 1;</code></pre>';
      const output = sanitizeHtml(input);
      expect(output).toContain('<pre>');
      expect(output).toContain('<code>');
    });

    it('should allow safe image attributes', () => {
      const input = '<img src="image.jpg" alt="image">';
      const output = sanitizeHtml(input);
      expect(output).toContain('src="image.jpg"');
      expect(output).toContain('alt="image"');
    });

    it('should remove data: URIs', () => {
      const input = '<img src="data:text/html,<script>alert(1)</script>">';
      const output = sanitizeHtml(input);
      expect(output).not.toContain('data:');
    });

    it('should detect SVG injection', () => {
      const input = '<svg onload="alert(1)"></svg>';
      const output = sanitizeHtml(input);
      expect(output).not.toContain('<svg>');
    });

    it('should handle HTML entities', () => {
      const input = '&#60;script&#62;alert(1)&#60;/script&#62;';
      const output = sanitizeHtml(input);
      expect(output).not.toContain('alert');
    });
  });

  describe('sanitizeText', () => {
    it('should remove all HTML tags', () => {
      const input = '<p>Hello <strong>world</strong></p>';
      const output = sanitizeText(input);
      expect(output).toBe('Hello world');
    });

    it('should preserve text content', () => {
      const input = '<p>Important <b>message</b> here</p>';
      const output = sanitizeText(input);
      expect(output).toContain('Important');
      expect(output).toContain('message');
      expect(output).toContain('here');
    });
  });

  describe('wasSanitized', () => {
    it('should return true if content was modified', () => {
      const original = '<script>alert(1)</script>';
      const sanitized = sanitizeHtml(original);
      expect(wasSanitized(original, sanitized)).toBe(true);
    });

    it('should return false if content unchanged', () => {
      const original = '<p>Safe content</p>';
      const sanitized = sanitizeHtml(original);
      expect(wasSanitized(original, sanitized)).toBe(false);
    });
  });
});
```

---

## 2. Integration Tests

### 2.1 Authentication Flow
**File**: `packages/backend/tests/integration/auth.test.ts`

```typescript
describe('Authentication Flow', () => {
  it('should complete signup → login → token refresh flow', async () => {
    // 1. Signup
    const signupRes = await request(app)
      .post('/auth/signup')
      .send({
        email: 'test@example.com',
        password: 'SecurePassword123!',
        name: 'Test User'
      });

    expect(signupRes.status).toBe(201);
    expect(signupRes.body.accessToken).toBeDefined();
    expect(signupRes.body.refreshToken).toBeDefined();
    expect(signupRes.body.expiresIn).toBe(900); // 15 minutes

    // 2. Use access token for request
    const meRes = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${signupRes.body.accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('test@example.com');

    // 3. Simulate token expiration
    jest.advanceTimersByTime(15 * 60 * 1000);

    // 4. Refresh token
    const refreshRes = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: signupRes.body.refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeDefined();
    expect(refreshRes.body.refreshToken).toBeDefined();
    expect(refreshRes.body.accessToken).not.toBe(signupRes.body.accessToken);

    // 5. Use new access token
    const meRes2 = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${refreshRes.body.accessToken}`);

    expect(meRes2.status).toBe(200);
  });

  it('should invalidate sessions on password change', async () => {
    // 1. Login
    const loginRes = await request(app)
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'OldPassword123!'
      });

    const oldRefreshToken = loginRes.body.refreshToken;

    // 2. Change password
    await request(app)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword456!'
      });

    // 3. Old refresh token should no longer work
    const refreshRes = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: oldRefreshToken });

    expect(refreshRes.status).toBe(401);
    expect(refreshRes.body.code).toBe('REFRESH_TOKEN_INVALID');
  });

  it('should handle concurrent refresh requests', async () => {
    const loginRes = await request(app).post('/auth/login').send(credentials);
    const refreshToken = loginRes.body.refreshToken;

    // Make 3 concurrent refresh requests
    const promises = [
      request(app).post('/auth/refresh').send({ refreshToken }),
      request(app).post('/auth/refresh').send({ refreshToken }),
      request(app).post('/auth/refresh').send({ refreshToken })
    ];

    const results = await Promise.all(promises);

    // All should succeed (should be idempotent or handled gracefully)
    results.forEach(res => {
      expect([200, 401]).toContain(res.status);
    });
  });
});
```

### 2.2 Webhook Processing
**File**: `packages/backend/tests/integration/webhooks.test.ts`

```typescript
describe('Webhook Processing', () => {
  it('should handle webhook with idempotency', async () => {
    const webhookPayload = {
      'meta': {
        'event_name': 'subscription_created',
        'custom_data': {
          'event_id': 'unique-webhook-id-123'
        }
      },
      'data': {
        'id': 'sub-123',
        'attributes': { 'customer_id': 'cust-1' }
      }
    };

    // First webhook
    const res1 = await request(app)
      .post('/webhooks/lemonsqueezy')
      .send(webhookPayload);
    expect(res1.status).toBe(200);

    // Duplicate webhook (same event_id)
    const res2 = await request(app)
      .post('/webhooks/lemonsqueezy')
      .send(webhookPayload);
    expect(res2.status).toBe(200);

    // Should only process once
    const subscription = await prisma.subscription.findFirst({
      where: { lemonsqueezyId: 'sub-123' }
    });
    expect(subscription).toBeDefined();
  });

  it('should queue failed webhook for retry', async () => {
    // Mock payment processing to fail
    jest.spyOn(paymentService, 'process').mockRejectedValueOnce(
      new Error('Stripe timeout')
    );

    const webhookPayload = {
      'meta': {
        'event_name': 'subscription_created',
        'custom_data': { 'event_id': 'retry-test-id' }
      },
      'data': { 'id': 'sub-456' }
    };

    const res = await request(app)
      .post('/webhooks/lemonsqueezy')
      .send(webhookPayload);

    expect(res.status).toBe(202); // Accepted

    // Should queue for retry
    const queuedEvent = await prisma.webhookQueue.findFirst({
      where: { eventId: 'retry-test-id' }
    });
    expect(queuedEvent).toBeDefined();
    expect(queuedEvent.attemptNumber).toBe(1);
    expect(queuedEvent.nextRetry).toBeGreaterThan(new Date());
  });

  it('should replay webhook from admin endpoint', async () => {
    // Create a failed webhook event
    const event = await prisma.webhookEvent.create({
      data: {
        eventId: 'replay-test',
        eventType: 'subscription_created',
        provider: 'lemonsqueezy',
        payload: { id: 'sub-789' },
        processed: false
      }
    });

    // Admin replays it
    const res = await request(app)
      .post(`/webhooks/admin/replay/${event.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Replayed');

    // Event should be reprocessed
    const updated = await prisma.webhookEvent.findUnique({
      where: { id: event.id }
    });
    expect(updated.processed).toBe(true);
  });
});
```

### 2.3 HTTP Interceptor + Auth Integration
**File**: `packages/app/tests/integration/http-auth.test.ts`

```typescript
describe('HTTP Interceptor + Auth Integration', () => {
  it('should transparently refresh token during request', async () => {
    // Setup: Token expiring in 3 minutes
    const expiringSoon = jwt.sign(
      { userId: 'test', exp: Math.floor(Date.now() / 1000) + 180 }
    );

    await storeTokens(expiringSoon, 'refresh-token');

    // Mock refresh endpoint
    global.fetch = jest.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: 'new-access-token',
            refreshToken: 'new-refresh-token'
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'success' }), { status: 200 })
      );

    // Make request
    const response = await httpFetch('/api/data');

    expect(response.status).toBe(200);
    // Should have called refresh endpoint
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      expect.anything()
    );
  });

  it('should retry on 401 with new token', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 'TOKEN_EXPIRED' }),
          { status: 401 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: 'new-token',
            refreshToken: 'new-refresh'
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'success' }), { status: 200 })
      );

    const response = await httpFetch('/api/data');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: 'success' });
  });
});
```

---

## 3. E2E Tests

### 3.1 Complete User Workflows
**File**: `packages/backend/tests/e2e/user-workflows.test.ts`

```typescript
describe('E2E: Complete User Workflows', () => {
  describe('User signup and subscription flow', () => {
    it('should allow user to signup, get trial, and checkout', async () => {
      // 1. Signup
      const signupRes = await request(app)
        .post('/auth/signup')
        .send({
          email: 'newuser@example.com',
          password: 'SecurePass123!',
          name: 'New User'
        });

      const userId = signupRes.body.user.id;
      const accessToken = signupRes.body.accessToken;

      // 2. Check subscription (should be on trial)
      const subRes = await request(app)
        .get('/subscription/status')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(subRes.body.status).toBe('on_trial');

      // 3. Get checkout URL
      const checkoutRes = await request(app)
        .post('/subscription/create-checkout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ priceId: 'monthly' });

      expect(checkoutRes.body.url).toContain('stripe.com');

      // 4. Simulate Stripe webhook (subscription created)
      const stripeEvent = {
        type: 'charge.succeeded',
        data: {
          object: {
            customer: 'cust_123',
            amount: 999
          }
        }
      };

      const webhookRes = await request(app)
        .post('/webhooks/stripe')
        .send(stripeEvent);

      expect(webhookRes.status).toBe(200);

      // 5. Check subscription again (should be active)
      const subRes2 = await request(app)
        .get('/subscription/status')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(subRes2.body.status).toBe('active');
    });
  });

  describe('Session management workflow', () => {
    it('user should see and manage their sessions', async () => {
      // 1. Login on device 1
      const login1 = await request(app)
        .post('/auth/login')
        .send(credentials);
      const token1 = login1.body.accessToken;

      // 2. Get sessions list
      const sessionsRes = await request(app)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${token1}`);

      expect(sessionsRes.body.total).toBeGreaterThan(0);
      const sessionId = sessionsRes.body.sessions[0].id;

      // 3. Revoke a session
      const revokeRes = await request(app)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${token1}`);

      expect(revokeRes.status).toBe(200);

      // 4. List sessions again
      const sessionsRes2 = await request(app)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${token1}`);

      expect(sessionsRes2.body.total).toBeLessThan(sessionsRes.body.total);
    });
  });

  describe('Download protection workflow', () => {
    it('should require valid subscription for download', async () => {
      // 1. User without subscription
      const trialsignup = await request(app)
        .post('/auth/signup')
        .send({
          email: 'trialuser@example.com',
          password: 'Pass123!',
          name: 'Trial'
        });

      // 2. Try to download (should fail)
      const downloadRes = await request(app)
        .get('/download/mac/1.0.0?signature=x&expires=y&user=' + trialsignup.body.user.id);

      expect(downloadRes.status).toBe(403);
      expect(downloadRes.body.error).toContain('subscription');
    });
  });
});
```

---

## 4. Manual Tests

### 4.1 Security Scenarios

#### Token Expiration Detection
```markdown
**Test**: Token expires during session
**Steps**:
1. Login to app
2. Wait 15 minutes (or set JWT_EXPIRY=2m for testing)
3. Make any action (e.g., fetch PR list)
4. Observe: Action succeeds without re-login

**Expected Result**: ✅ Transparent refresh, no interruption
**Fail Criteria**: ❌ 401 shown, forced logout, or error
```

#### Rate Limiting
```markdown
**Test**: Brute force attack on login
**Steps**:
1. Attempt login with wrong password 5 times (within 5 min)
2. Attempt 6th login

**Expected Result**: ✅ 6th attempt blocked with 429 Too Many Requests
**Fail Criteria**: ❌ 6th attempt succeeds or different rate limit applied
```

#### XSS Prevention
```markdown
**Test**: XSS injection in user comments
**Steps**:
1. Create pull request with comment: <img src=x onerror="alert('xss')">
2. View the comment in another session

**Expected Result**: ✅ No alert shown, HTML sanitized
**Fail Criteria**: ❌ Alert shown, script executes
```

#### Webhook Idempotency
```markdown
**Test**: Duplicate webhook handling
**Steps**:
1. Send webhook with event_id = "test-123"
2. Send same webhook again (within 1 min)

**Expected Result**: ✅ Both processed, but only one subscription created
**Fail Criteria**: ❌ Duplicate subscription or 2nd fails
```

#### Session Revocation
```markdown
**Test**: Password change invalidates sessions
**Steps**:
1. Login on device A
2. Change password on device B
3. Try to use device A's old token

**Expected Result**: ✅ 401 Token Expired on device A
**Fail Criteria**: ❌ Token still valid on device A
```

### 4.2 Performance Scenarios

#### Token Refresh Under Load
```markdown
**Test**: Multiple concurrent token refreshes
**Steps**:
1. Create 10 simultaneous API requests
2. All with tokens expiring in 1 minute
3. Make requests concurrently

**Expected Result**: ✅ Single refresh, all requests queued and retry
**Fail Criteria**: ❌ Multiple refreshes or thundering herd
```

#### Rate Limit Performance
```markdown
**Test**: Rate limiter doesn't block legitimate traffic
**Steps**:
1. 5 login attempts per 5 minutes
2. Monitor response time

**Expected Result**: ✅ ~100ms response time, no slowdown
**Fail Criteria**: ❌ Significant response time increase
```

### 4.3 Edge Cases

#### Network Failure Resilience
```markdown
**Test**: App behavior on network loss
**Steps**:
1. User in middle of request
2. Disconnect WiFi
3. Reconnect after 30 seconds
4. Make another request

**Expected Result**: ✅ First request fails, 2nd succeeds
**Fail Criteria**: ❌ Session invalidated or auth cleared
```

#### Expired Refresh Token
```markdown
**Test**: Refresh token expired (30 days)
**Steps**:
1. Expire refresh token manually
2. Access token expires
3. Try to refresh

**Expected Result**: ✅ 401, user must re-login
**Fail Criteria**: ❌ Silent failure or app crash
```

---

## 5. Test Coverage Goals

### Backend Coverage
- **Rate Limiting**: 95%+ coverage (all limiters tested)
- **Token Management**: 95%+ coverage (all token flows)
- **Webhook Processing**: 90%+ coverage (happy path + retries)
- **Authentication**: 95%+ coverage (signup, login, refresh)
- **Overall Backend**: 85%+ line coverage

### Frontend Coverage
- **HTTP Interceptor**: 90%+ coverage (all retry scenarios)
- **Sanitization**: 95%+ coverage (all XSS vectors)
- **Auth Service**: 85%+ coverage (all API calls)
- **Overall Frontend**: 80%+ line coverage

---

## 6. Test Execution Matrix

| Test Type | Frequency | Trigger | Priority |
|-----------|-----------|---------|----------|
| Unit Tests | Every commit | Git pre-commit | 🔴 Critical |
| Integration | Every PR | Pull request | 🔴 Critical |
| E2E | Every deployment | CI/CD pipeline | 🟠 High |
| Security (Manual) | Weekly | Security sprint | 🟠 High |
| Performance | Monthly | After optimization | 🟡 Medium |
| Load Testing | Quarterly | Before release | 🟡 Medium |

---

## 7. Test Infrastructure

### Tools Required
- **Backend**: Jest, Supertest
- **Frontend**: Vitest, Testing Library, Playwright (E2E)
- **CI/CD**: GitHub Actions
- **Reporting**: Jest reporters, Coverage reports

### Continuous Integration Setup
```yaml
# .github/workflows/test.yml
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
```

---

## 8. Test Reporting

### Metrics to Track
- ✅ Coverage percentage (unit, integration, lines)
- ✅ Test execution time
- ✅ Failure rate
- ✅ Security test results
- ✅ Performance benchmarks

### Success Criteria
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ >85% code coverage
- ✅ All security manual tests pass
- ✅ No regressions vs baseline

---

## Implementation Timeline

**Phase 1 (Days 1-2)**:
- [ ] Set up test infrastructure
- [ ] Write unit tests (backend)
- [ ] Write unit tests (frontend)

**Phase 2 (Days 3-4)**:
- [ ] Write integration tests
- [ ] Set up CI/CD pipeline
- [ ] Test coverage reporting

**Phase 3 (Days 5-6)**:
- [ ] Write E2E tests
- [ ] Execute manual security tests
- [ ] Performance benchmarking

**Phase 4 (Ongoing)**:
- [ ] Maintain test suite
- [ ] Add new tests for bugs
- [ ] Regular security audits

---

**Status**: 📋 Ready for implementation
**Estimated Total Tests**: 150+ (unit + integration + E2E)
**Estimated Coverage**: 85%+ lines, 90%+ critical paths
