# Admin Dashboard Plan - Database Management & Control Panel

**Status:** 📋 Plan (Implementation pending)
**Priority:** 🟠 High (Post-Phase 2)
**Scope:** Backend Admin API + Frontend Admin UI
**Security Level:** 🔐 SUPERUSER ONLY

---

## Overview

Comprehensive admin dashboard for managing:
- 👥 Users (CRUD, role assignment, suspension)
- 🔑 Sessions (view, revoke, logout all)
- 💰 Subscriptions (view, update, cancel)
- 🔗 Webhooks (view, replay, debug)
- 📊 Analytics (usage, logins, downloads)
- 🔍 Audit Logs (security events)
- 🛠️ System Configuration

**Style**: Swagger/PostMan-like interface with rich admin capabilities

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│              Admin Dashboard UI (Vue)               │
│  ├─ Users Management                              │
│  ├─ Sessions Control                              │
│  ├─ Webhooks Debugger                             │
│  ├─ Analytics Dashboard                           │
│  └─ System Health                                 │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│         Admin API (Backend - /admin/*)              │
│  ├─ Authentication & SUPERUSER check              │
│  ├─ User Management Endpoints                     │
│  ├─ Session Management Endpoints                  │
│  ├─ Subscription Management Endpoints             │
│  ├─ Webhook Management Endpoints                  │
│  ├─ Analytics Endpoints                           │
│  ├─ Audit Log Endpoints                           │
│  └─ System Configuration Endpoints                │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│              Database (Prisma)                      │
│  - User (with role: SUPERUSER, ADMIN, USER)       │
│  - Session, Subscription, WebhookEvent            │
│  - AuditLog (new)                                 │
│  - SystemConfig (new)                             │
└─────────────────────────────────────────────────────┘
```

---

## Backend Implementation

### Phase 1: Database Schema

#### Update User Model
```prisma
// schema.prisma

enum UserRole {
  USER
  ADMIN
  SUPERUSER  // Full access to admin endpoints
}

model User {
  id String @id @default(cuid())

  // Authentication
  email String @unique
  passwordHash String
  name String?
  role UserRole @default(USER)

  // Status
  isActive Boolean @default(true)
  isSuspended Boolean @default(false)
  suspendedReason String?
  suspendedAt DateTime?

  // Metadata
  lastLoginAt DateTime?
  loginAttempts Int @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  sessions Session[]
  subscription Subscription?
  auditLogs AuditLog[]

  @@index([role])
  @@index([isActive])
}
```

#### New AuditLog Model
```prisma
enum AuditAction {
  // User actions
  USER_CREATED
  USER_UPDATED
  USER_DELETED
  USER_SUSPENDED
  USER_UNSUSPENDED
  USER_PASSWORD_CHANGED
  USER_ROLE_CHANGED

  // Session actions
  SESSION_CREATED
  SESSION_REVOKED
  SESSION_INVALIDATED

  // Subscription actions
  SUBSCRIPTION_CREATED
  SUBSCRIPTION_UPDATED
  SUBSCRIPTION_CANCELED

  // Webhook actions
  WEBHOOK_REPLAYED

  // Login actions
  LOGIN_SUCCESS
  LOGIN_FAILED
  LOGIN_BRUTE_FORCE_BLOCKED
}

model AuditLog {
  id String @id @default(cuid())

  // Action details
  action AuditAction
  resourceType String // "User", "Session", "Subscription", etc.
  resourceId String

  // Who did it
  performedBy User @relation(fields: [performedById], references: [id])
  performedById String

  // What changed
  changes Json // { old: {...}, new: {...} }
  details String? // Description

  // Request context
  ipAddress String?
  userAgent String?

  createdAt DateTime @default(now())

  @@index([action])
  @@index([performedById])
  @@index([resourceId])
  @@index([createdAt])
}
```

#### New SystemConfig Model
```prisma
model SystemConfig {
  id String @id @default("global")

  // Auth settings
  jwtExpiryMinutes Int @default(15)
  refreshTokenExpiryDays Int @default(30)
  maxLoginAttempts Int @default(5)
  lockoutDurationMinutes Int @default(5)

  // Rate limiting
  rateLimitWindowMs Int @default(300000)
  rateLimitMaxAttempts Int @default(5)

  // System status
  maintenanceMode Boolean @default(false)
  maintenanceMessage String?

  // Webhook settings
  webhookRetryDelays String // JSON: [5, 30, 120, 1440] (minutes)
  webhookMaxRetries Int @default(4)

  updatedAt DateTime @updatedAt
  updatedBy User? @relation(fields: [updatedById], references: [id])
  updatedById String?
}
```

---

### Phase 2: Admin Middleware & Authentication

#### SUPERUSER Protection Middleware
```typescript
// packages/backend/src/middleware/adminAuth.ts

import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';

/**
 * Middleware to require SUPERUSER role for admin endpoints
 * Logs access attempts for audit trail
 */
export function requireSuperuser(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== UserRole.SUPERUSER) {
    // Log failed admin access attempt
    logAuditEvent({
      action: 'ADMIN_ACCESS_DENIED',
      performedById: req.user.userId,
      resourceType: 'AdminAPI',
      resourceId: req.path,
      details: `Unauthorized admin access attempt: ${req.method} ${req.path}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(403).json({
      error: 'SUPERUSER access required',
      message: 'This endpoint requires superuser privileges'
    });
    return;
  }

  // Log successful admin access
  logAuditEvent({
    action: 'ADMIN_ACCESS_GRANTED',
    performedById: req.user.userId,
    resourceType: 'AdminAPI',
    resourceId: req.path,
    details: `Admin access: ${req.method} ${req.path}`,
    ipAddress: req.ip
  });

  next();
}

/**
 * Also support ADMIN role for some read-only endpoints
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.SUPERUSER) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}
```

---

### Phase 3: Admin API Endpoints

#### 3.1 User Management Endpoints
```typescript
// packages/backend/src/routes/admin.ts

const router = Router();

// ============ USER ENDPOINTS ============

/**
 * GET /admin/users
 * List all users with filters
 * Query params: page, limit, role, isActive, search
 */
router.get('/users', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 50, role, isActive, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      where.OR = [
        { email: { contains: String(search), mode: 'insensitive' } },
        { name: { contains: String(search), mode: 'insensitive' } }
      ];
    }

    const users = await prisma.user.findMany({
      where,
      skip,
      take: Number(limit),
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        isSuspended: true,
        lastLoginAt: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const total = await prisma.user.count({ where });

    res.json({
      users,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    logger.error('Failed to list users:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

/**
 * GET /admin/users/:userId
 * Get user details with full information
 */
router.get('/users/:userId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      include: {
        sessions: {
          select: { id: true, createdAt: true, expiresAt: true }
        },
        subscription: {
          select: {
            status: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            trialEndsAt: true
          }
        }
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    logger.error('Failed to get user:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

/**
 * POST /admin/users
 * Create a new user (admin can directly create superusers)
 */
router.post('/users', requireSuperuser, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email().max(255),
      password: z.string().min(8).max(255),
      name: z.string().max(255).optional(),
      role: z.enum(['USER', 'ADMIN', 'SUPERUSER']).default('USER')
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors
      });
      return;
    }

    const { email, password, name, role } = validation.data;

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role
      },
      select: { id: true, email: true, name: true, role: true }
    });

    // Log audit
    await logAuditEvent({
      action: 'USER_CREATED',
      performedById: req.user!.userId,
      resourceType: 'User',
      resourceId: user.id,
      changes: { new: user },
      details: `Admin created user: ${email} with role ${role}`,
      ipAddress: req.ip
    });

    res.status(201).json(user);
  } catch (error) {
    logger.error('Failed to create user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * PATCH /admin/users/:userId/role
 * Change user role
 */
router.patch(
  '/users/:userId/role',
  requireSuperuser,
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        role: z.enum(['USER', 'ADMIN', 'SUPERUSER'])
      });

      const validation = schema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ error: 'Validation failed' });
        return;
      }

      const { role } = validation.data;

      const user = await prisma.user.update({
        where: { id: req.params.userId },
        data: { role }
      });

      // Log audit
      await logAuditEvent({
        action: 'USER_ROLE_CHANGED',
        performedById: req.user!.userId,
        resourceType: 'User',
        resourceId: user.id,
        changes: { new: { role } },
        details: `Role changed to ${role}`
      });

      res.json({ message: 'Role updated', user });
    } catch (error) {
      logger.error('Failed to update user role:', error);
      res.status(500).json({ error: 'Failed to update role' });
    }
  }
);

/**
 * POST /admin/users/:userId/suspend
 * Suspend user account
 */
router.post(
  '/users/:userId/suspend',
  requireSuperuser,
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        reason: z.string().max(500)
      });

      const validation = schema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ error: 'Validation failed' });
        return;
      }

      const { reason } = validation.data;

      const user = await prisma.user.update({
        where: { id: req.params.userId },
        data: {
          isSuspended: true,
          suspendedReason: reason,
          suspendedAt: new Date()
        }
      });

      // Invalidate all sessions
      await prisma.session.deleteMany({
        where: { userId: user.id }
      });

      // Log audit
      await logAuditEvent({
        action: 'USER_SUSPENDED',
        performedById: req.user!.userId,
        resourceType: 'User',
        resourceId: user.id,
        details: `User suspended. Reason: ${reason}`
      });

      res.json({ message: 'User suspended', user });
    } catch (error) {
      logger.error('Failed to suspend user:', error);
      res.status(500).json({ error: 'Failed to suspend user' });
    }
  }
);

/**
 * POST /admin/users/:userId/unsuspend
 * Unsuspend user account
 */
router.post(
  '/users/:userId/unsuspend',
  requireSuperuser,
  async (req: Request, res: Response) => {
    try {
      const user = await prisma.user.update({
        where: { id: req.params.userId },
        data: {
          isSuspended: false,
          suspendedReason: null,
          suspendedAt: null
        }
      });

      // Log audit
      await logAuditEvent({
        action: 'USER_UNSUSPENDED',
        performedById: req.user!.userId,
        resourceType: 'User',
        resourceId: user.id,
        details: 'User unsuspended'
      });

      res.json({ message: 'User unsuspended', user });
    } catch (error) {
      logger.error('Failed to unsuspend user:', error);
      res.status(500).json({ error: 'Failed to unsuspend user' });
    }
  }
);

/**
 * DELETE /admin/users/:userId
 * Permanently delete user (soft delete: set isActive=false)
 */
router.delete(
  '/users/:userId',
  requireSuperuser,
  async (req: Request, res: Response) => {
    try {
      const user = await prisma.user.update({
        where: { id: req.params.userId },
        data: { isActive: false }
      });

      // Invalidate all sessions
      await prisma.session.deleteMany({
        where: { userId: user.id }
      });

      // Log audit
      await logAuditEvent({
        action: 'USER_DELETED',
        performedById: req.user!.userId,
        resourceType: 'User',
        resourceId: user.id,
        details: 'User deactivated'
      });

      res.json({ message: 'User deactivated' });
    } catch (error) {
      logger.error('Failed to delete user:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  }
);

// ============ SESSION ENDPOINTS ============

/**
 * GET /admin/sessions
 * List all active sessions globally
 */
router.get('/sessions', requireAdmin, async (req: Request, res: Response) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { expiresAt: { gt: new Date() } },
      include: {
        user: {
          select: { id: true, email: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.json({
      sessions,
      total: sessions.length
    });
  } catch (error) {
    logger.error('Failed to list sessions:', error);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

/**
 * DELETE /admin/sessions/:sessionId
 * Revoke specific session
 */
router.delete(
  '/sessions/:sessionId',
  requireSuperuser,
  async (req: Request, res: Response) => {
    try {
      const session = await prisma.session.delete({
        where: { id: req.params.sessionId }
      });

      // Log audit
      await logAuditEvent({
        action: 'SESSION_REVOKED',
        performedById: req.user!.userId,
        resourceType: 'Session',
        resourceId: session.id,
        details: `Session revoked for user ${session.userId}`
      });

      res.json({ message: 'Session revoked' });
    } catch (error) {
      logger.error('Failed to revoke session:', error);
      res.status(500).json({ error: 'Failed to revoke session' });
    }
  }
);

/**
 * POST /admin/sessions/:userId/logout-all
 * Logout user from all sessions (omnipotent logout)
 */
router.post(
  '/sessions/:userId/logout-all',
  requireSuperuser,
  async (req: Request, res: Response) => {
    try {
      const result = await prisma.session.deleteMany({
        where: { userId: req.params.userId }
      });

      // Log audit
      await logAuditEvent({
        action: 'SESSION_INVALIDATED',
        performedById: req.user!.userId,
        resourceType: 'User',
        resourceId: req.params.userId,
        details: `All sessions invalidated (${result.count} sessions revoked)`
      });

      res.json({
        message: `User logged out from all sessions`,
        sessionsRevoked: result.count
      });
    } catch (error) {
      logger.error('Failed to logout user:', error);
      res.status(500).json({ error: 'Failed to logout user' });
    }
  }
);

// ============ SUBSCRIPTION ENDPOINTS ============

/**
 * GET /admin/subscriptions
 * List all subscriptions
 */
router.get(
  '/subscriptions',
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const subscriptions = await prisma.subscription.findMany({
        include: {
          user: {
            select: { id: true, email: true, name: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({
        subscriptions,
        total: subscriptions.length
      });
    } catch (error) {
      logger.error('Failed to list subscriptions:', error);
      res.status(500).json({ error: 'Failed to list subscriptions' });
    }
  }
);

/**
 * PATCH /admin/subscriptions/:subscriptionId
 * Update subscription manually
 */
router.patch(
  '/subscriptions/:subscriptionId',
  requireSuperuser,
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        status: z.enum(['active', 'on_trial', 'canceled', 'expired']).optional(),
        cancelAtPeriodEnd: z.boolean().optional(),
        currentPeriodEnd: z.string().datetime().optional()
      });

      const validation = schema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ error: 'Validation failed' });
        return;
      }

      const updates = validation.data;

      const subscription = await prisma.subscription.update({
        where: { id: req.params.subscriptionId },
        data: {
          ...updates,
          currentPeriodEnd: updates.currentPeriodEnd
            ? new Date(updates.currentPeriodEnd)
            : undefined
        }
      });

      // Log audit
      await logAuditEvent({
        action: 'SUBSCRIPTION_UPDATED',
        performedById: req.user!.userId,
        resourceType: 'Subscription',
        resourceId: subscription.id,
        changes: { new: updates },
        details: 'Subscription manually updated by admin'
      });

      res.json({ message: 'Subscription updated', subscription });
    } catch (error) {
      logger.error('Failed to update subscription:', error);
      res.status(500).json({ error: 'Failed to update subscription' });
    }
  }
);

// ============ WEBHOOK ENDPOINTS ============

/**
 * GET /admin/webhooks/events
 * List webhook events with filtering
 */
router.get(
  '/webhooks/events',
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { eventType, provider, processed, page = 1, limit = 50 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};
      if (eventType) where.eventType = String(eventType);
      if (provider) where.provider = String(provider);
      if (processed !== undefined)
        where.processed = processed === 'true';

      const events = await prisma.webhookEvent.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' }
      });

      const total = await prisma.webhookEvent.count({ where });

      res.json({
        events,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      logger.error('Failed to list webhook events:', error);
      res.status(500).json({ error: 'Failed to list webhook events' });
    }
  }
);

/**
 * POST /admin/webhooks/replay/:eventId
 * Replay webhook event
 */
router.post(
  '/webhooks/replay/:eventId',
  requireSuperuser,
  async (req: Request, res: Response) => {
    try {
      const event = await prisma.webhookEvent.findUnique({
        where: { id: req.params.eventId }
      });

      if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }

      // Replay the webhook
      await replayWebhook(req.params.eventId);

      // Log audit
      await logAuditEvent({
        action: 'WEBHOOK_REPLAYED',
        performedById: req.user!.userId,
        resourceType: 'WebhookEvent',
        resourceId: event.id,
        details: `Webhook replayed: ${event.eventType}`
      });

      res.json({ message: 'Webhook replayed successfully' });
    } catch (error) {
      logger.error('Failed to replay webhook:', error);
      res.status(500).json({ error: 'Failed to replay webhook' });
    }
  }
);

// ============ AUDIT LOG ENDPOINTS ============

/**
 * GET /admin/audit-logs
 * List audit logs
 */
router.get(
  '/audit-logs',
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { action, resourceType, page = 1, limit = 50 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};
      if (action) where.action = String(action);
      if (resourceType) where.resourceType = String(resourceType);

      const logs = await prisma.auditLog.findMany({
        where,
        include: {
          performedBy: {
            select: { id: true, email: true, name: true }
          }
        },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' }
      });

      const total = await prisma.auditLog.count({ where });

      res.json({
        logs,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      logger.error('Failed to list audit logs:', error);
      res.status(500).json({ error: 'Failed to list audit logs' });
    }
  }
);

// ============ SYSTEM CONFIG ENDPOINTS ============

/**
 * GET /admin/config
 * Get system configuration
 */
router.get('/config', requireAdmin, async (req: Request, res: Response) => {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { id: 'global' }
    });

    res.json(config || {});
  } catch (error) {
    logger.error('Failed to get config:', error);
    res.status(500).json({ error: 'Failed to get config' });
  }
});

/**
 * PATCH /admin/config
 * Update system configuration
 */
router.patch(
  '/config',
  requireSuperuser,
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        jwtExpiryMinutes: z.number().int().positive().optional(),
        refreshTokenExpiryDays: z.number().int().positive().optional(),
        maxLoginAttempts: z.number().int().positive().optional(),
        maintenanceMode: z.boolean().optional(),
        maintenanceMessage: z.string().optional()
      });

      const validation = schema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ error: 'Validation failed' });
        return;
      }

      const config = await prisma.systemConfig.upsert({
        where: { id: 'global' },
        create: {
          id: 'global',
          ...validation.data,
          updatedById: req.user!.userId
        },
        update: {
          ...validation.data,
          updatedById: req.user!.userId
        }
      });

      // Log audit
      await logAuditEvent({
        action: 'SYSTEM_CONFIG_UPDATED',
        performedById: req.user!.userId,
        resourceType: 'SystemConfig',
        resourceId: 'global',
        changes: { new: validation.data },
        details: 'System configuration updated'
      });

      res.json({ message: 'Configuration updated', config });
    } catch (error) {
      logger.error('Failed to update config:', error);
      res.status(500).json({ error: 'Failed to update config' });
    }
  }
);

// ============ SYSTEM HEALTH ============

/**
 * GET /admin/health
 * System health check
 */
router.get('/health', requireAdmin, async (req: Request, res: Response) => {
  try {
    const stats = {
      users: await prisma.user.count(),
      activeSessions: await prisma.session.count({
        where: { expiresAt: { gt: new Date() } }
      }),
      activeSubscriptions: await prisma.subscription.count({
        where: { status: { in: ['active', 'on_trial'] } }
      }),
      pendingWebhooks: await prisma.webhookQueue.count(),
      recentLogins: await prisma.auditLog.count({
        where: {
          action: 'LOGIN_SUCCESS',
          createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      })
    };

    res.json({
      status: 'healthy',
      timestamp: new Date(),
      stats
    });
  } catch (error) {
    logger.error('Failed to get health:', error);
    res.status(500).json({ error: 'Failed to get health' });
  }
});

export default router;
```

---

## Frontend Implementation

### Admin Dashboard UI

#### 3.2 Dashboard Structure
```typescript
// packages/app/src/components/AdminDashboard.vue

<template>
  <div v-if="!isSuperuser" class="unauthorized">
    <p>Access denied. Superuser privileges required.</p>
  </div>

  <div v-else class="admin-dashboard">
    <!-- Navigation Tabs -->
    <div class="admin-nav">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        :class="{ active: activeTab === tab.id }"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Tab Content -->
    <div class="admin-content">
      <!-- Users Tab -->
      <AdminUsersPanel v-if="activeTab === 'users'" />

      <!-- Sessions Tab -->
      <AdminSessionsPanel v-if="activeTab === 'sessions'" />

      <!-- Subscriptions Tab -->
      <AdminSubscriptionsPanel v-if="activeTab === 'subscriptions'" />

      <!-- Webhooks Tab -->
      <AdminWebhooksPanel v-if="activeTab === 'webhooks'" />

      <!-- Audit Logs Tab -->
      <AdminAuditLogsPanel v-if="activeTab === 'audit'" />

      <!-- System Config Tab -->
      <AdminConfigPanel v-if="activeTab === 'config'" />

      <!-- Health Status Tab -->
      <AdminHealthPanel v-if="activeTab === 'health'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { authStore } from '@/stores/authStore';
import AdminUsersPanel from './admin/UsersPanel.vue';
import AdminSessionsPanel from './admin/SessionsPanel.vue';
import AdminSubscriptionsPanel from './admin/SubscriptionsPanel.vue';
import AdminWebhooksPanel from './admin/WebhooksPanel.vue';
import AdminAuditLogsPanel from './admin/AuditLogsPanel.vue';
import AdminConfigPanel from './admin/ConfigPanel.vue';
import AdminHealthPanel from './admin/HealthPanel.vue';

const activeTab = ref('users');

const isSuperuser = computed(
  () => authStore.state.user?.role === 'SUPERUSER'
);

const tabs = [
  { id: 'users', label: '👥 Users' },
  { id: 'sessions', label: '🔑 Sessions' },
  { id: 'subscriptions', label: '💰 Subscriptions' },
  { id: 'webhooks', label: '🔗 Webhooks' },
  { id: 'audit', label: '📋 Audit Logs' },
  { id: 'config', label: '⚙️ Config' },
  { id: 'health', label: '📊 Health' }
];
</script>

<style scoped>
.admin-dashboard {
  display: flex;
  height: 100%;
}

.admin-nav {
  width: 200px;
  background: #f3f4f6;
  border-right: 1px solid #d1d5db;
  padding: 1rem;
}

.admin-nav button {
  display: block;
  width: 100%;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
}

.admin-nav button.active {
  background: #0ea5e9;
  color: white;
  border-color: #0284c7;
}

.admin-content {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
}
</style>
```

#### 3.3 Users Panel Example
```typescript
// packages/app/src/components/admin/UsersPanel.vue

<template>
  <div class="users-panel">
    <div class="header">
      <h2>User Management</h2>
      <button @click="showCreateModal = true" class="btn btn-primary">
        + Create User
      </button>
    </div>

    <!-- Search & Filter -->
    <div class="filters">
      <input
        v-model="searchQuery"
        placeholder="Search by email or name..."
        class="search-input"
      />
      <select v-model="filterRole" class="filter-select">
        <option value="">All Roles</option>
        <option value="USER">User</option>
        <option value="ADMIN">Admin</option>
        <option value="SUPERUSER">Superuser</option>
      </select>
      <select v-model="filterActive" class="filter-select">
        <option value="">All Status</option>
        <option value="true">Active</option>
        <option value="false">Inactive</option>
      </select>
    </div>

    <!-- Users Table -->
    <div class="table-container">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Role</th>
            <th>Status</th>
            <th>Last Login</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id">
            <td>{{ user.email }}</td>
            <td>{{ user.name || '-' }}</td>
            <td>
              <span :class="['badge', `badge-${user.role.toLowerCase()}`]">
                {{ user.role }}
              </span>
            </td>
            <td>
              <span
                :class="[
                  'badge',
                  user.isActive ? 'badge-success' : 'badge-danger'
                ]"
              >
                {{ user.isActive ? 'Active' : 'Inactive' }}
              </span>
              <span v-if="user.isSuspended" class="badge badge-warning">
                Suspended
              </span>
            </td>
            <td>{{ formatDate(user.lastLoginAt) }}</td>
            <td>{{ formatDate(user.createdAt) }}</td>
            <td class="actions">
              <button @click="editUser(user)" class="btn btn-sm btn-info">
                Edit
              </button>
              <button
                @click="changeRole(user)"
                class="btn btn-sm btn-secondary"
              >
                Role
              </button>
              <button
                @click="suspendUser(user)"
                :disabled="user.isSuspended"
                class="btn btn-sm btn-warning"
              >
                Suspend
              </button>
              <button
                @click="deleteUser(user)"
                class="btn btn-sm btn-danger"
              >
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="pagination">
      <button
        @click="previousPage"
        :disabled="page === 1"
        class="btn btn-sm"
      >
        Previous
      </button>
      <span>Page {{ page }} of {{ totalPages }}</span>
      <button
        @click="nextPage"
        :disabled="page === totalPages"
        class="btn btn-sm"
      >
        Next
      </button>
    </div>

    <!-- Create/Edit Modal -->
    <AdminUserModal
      v-if="showCreateModal"
      :user="selectedUser"
      @close="showCreateModal = false"
      @save="saveUser"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { httpGet, httpPost, httpPatch, httpDelete } from '@/services/http';

const searchQuery = ref('');
const filterRole = ref('');
const filterActive = ref('');
const page = ref(1);
const limit = ref(50);
const users = ref([]);
const totalUsers = ref(0);
const showCreateModal = ref(false);
const selectedUser = ref(null);

const totalPages = computed(() =>
  Math.ceil(totalUsers.value / limit.value)
);

async function loadUsers() {
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      limit: String(limit.value),
      ...(searchQuery.value && { search: searchQuery.value }),
      ...(filterRole.value && { role: filterRole.value }),
      ...(filterActive.value && { isActive: filterActive.value })
    });

    const response = await httpGet(`/admin/users?${params}`);
    const data = await response.json();

    users.value = data.users;
    totalUsers.value = data.pagination.total;
  } catch (error) {
    console.error('Failed to load users:', error);
  }
}

async function changeRole(user: any) {
  const newRole = prompt(
    `Change role for ${user.email}:\nCurrent: ${user.role}\nEnter new role (USER/ADMIN/SUPERUSER):`
  );

  if (!newRole) return;

  try {
    const response = await httpPatch(`/admin/users/${user.id}/role`, {
      role: newRole
    });

    if (response.ok) {
      await loadUsers();
    }
  } catch (error) {
    console.error('Failed to change role:', error);
  }
}

async function suspendUser(user: any) {
  const reason = prompt(`Suspend user ${user.email}?\nReason:`);

  if (!reason) return;

  try {
    const response = await httpPost(`/admin/users/${user.id}/suspend`, {
      reason
    });

    if (response.ok) {
      await loadUsers();
    }
  } catch (error) {
    console.error('Failed to suspend user:', error);
  }
}

async function deleteUser(user: any) {
  if (!confirm(`Delete user ${user.email}? This is permanent.`)) return;

  try {
    const response = await httpDelete(`/admin/users/${user.id}`);

    if (response.ok) {
      await loadUsers();
    }
  } catch (error) {
    console.error('Failed to delete user:', error);
  }
}

function editUser(user: any) {
  selectedUser.value = user;
  showCreateModal.value = true;
}

async function saveUser(userData: any) {
  try {
    if (selectedUser.value) {
      // Update user
      const response = await httpPatch(
        `/admin/users/${selectedUser.value.id}`,
        userData
      );
      if (response.ok) await loadUsers();
    } else {
      // Create user
      const response = await httpPost('/admin/users', userData);
      if (response.ok) await loadUsers();
    }
  } catch (error) {
    console.error('Failed to save user:', error);
  }
}

function previousPage() {
  if (page.value > 1) page.value--;
}

function nextPage() {
  if (page.value < totalPages.value) page.value++;
}

function formatDate(date: string | null) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString();
}

onMounted(() => loadUsers());
</script>

<style scoped>
.users-panel {
  background: white;
  border-radius: 8px;
  padding: 2rem;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.filters {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
}

.search-input,
.filter-select {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}

.table-container {
  overflow-x: auto;
  margin-bottom: 2rem;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
}

.admin-table th,
.admin-table td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid #d1d5db;
}

.admin-table th {
  background: #f3f4f6;
  font-weight: bold;
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: bold;
}

.badge-success {
  background: #dcfce7;
  color: #166534;
}

.badge-danger {
  background: #fee2e2;
  color: #991b1b;
}

.badge-warning {
  background: #fef3c7;
  color: #92400e;
}

.badge-user {
  background: #dbeafe;
  color: #1e40af;
}

.badge-admin {
  background: #fce7f3;
  color: #831843;
}

.badge-superuser {
  background: #f0fdf4;
  color: #166534;
}

.actions {
  display: flex;
  gap: 0.5rem;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

.btn-primary {
  background: #0ea5e9;
  color: white;
}

.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
}

.btn-info {
  background: #0ea5e9;
  color: white;
}

.btn-secondary {
  background: #6b7280;
  color: white;
}

.btn-warning {
  background: #f59e0b;
  color: white;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
```

---

## Security & Access Control

### Authentication Layer
```typescript
// All admin endpoints protected by requireSuperuser middleware
// Only SUPERUSER role can access:
// - POST /admin/users (create user)
// - PATCH /admin/users/*/role (change role)
// - POST /admin/users/*/suspend (suspend user)
// - DELETE /admin/users/* (delete user)
// - POST /admin/sessions/*/logout-all (logout all)
// - PATCH /admin/subscriptions/* (update subscription)
// - POST /admin/webhooks/replay/* (replay webhook)
// - PATCH /admin/config (update system config)

// ADMIN role can access (read-only):
// - GET /admin/users (view users)
// - GET /admin/sessions (view sessions)
// - GET /admin/subscriptions (view subscriptions)
// - GET /admin/webhooks/events (view webhooks)
// - GET /admin/audit-logs (view audit logs)
// - GET /admin/health (view system health)
```

### Audit Trail
```
Every admin action is logged:
- User creation/modification/deletion
- Role changes
- Session revocation
- Subscription updates
- Webhook replays
- Configuration changes
- Login attempts (failed & successful)

AuditLog stores:
- Who did it (performedById)
- What action (action)
- What changed (changes: { old, new })
- When (createdAt)
- Context (IP, user agent)
```

---

## Routing Structure

```
Backend Admin API:
├─ GET    /admin/users
├─ GET    /admin/users/:userId
├─ POST   /admin/users (SUPERUSER)
├─ PATCH  /admin/users/:userId/role (SUPERUSER)
├─ POST   /admin/users/:userId/suspend (SUPERUSER)
├─ POST   /admin/users/:userId/unsuspend (SUPERUSER)
├─ DELETE /admin/users/:userId (SUPERUSER)
│
├─ GET    /admin/sessions
├─ DELETE /admin/sessions/:sessionId (SUPERUSER)
├─ POST   /admin/sessions/:userId/logout-all (SUPERUSER)
│
├─ GET    /admin/subscriptions
├─ PATCH  /admin/subscriptions/:subscriptionId (SUPERUSER)
│
├─ GET    /admin/webhooks/events
├─ POST   /admin/webhooks/replay/:eventId (SUPERUSER)
│
├─ GET    /admin/audit-logs
│
├─ GET    /admin/config
├─ PATCH  /admin/config (SUPERUSER)
│
├─ GET    /admin/health
└─ POST   /admin/health/test (for testing)

Frontend:
/admin
├─ /admin/dashboard
├─ /admin/users
├─ /admin/sessions
├─ /admin/subscriptions
├─ /admin/webhooks
├─ /admin/audit
├─ /admin/config
└─ /admin/health
```

---

## Implementation Timeline

**Phase 1 (Days 1-2)**:
- [ ] Update Prisma schema (User, AuditLog, SystemConfig)
- [ ] Create migrations
- [ ] Implement admin middleware

**Phase 2 (Days 3-4)**:
- [ ] Implement all backend admin endpoints
- [ ] Add audit logging
- [ ] Test admin API

**Phase 3 (Days 5-6)**:
- [ ] Create AdminDashboard component
- [ ] Create individual admin panels (Users, Sessions, etc.)
- [ ] Implement admin UI

**Phase 4 (Day 7)**:
- [ ] End-to-end testing
- [ ] Security review
- [ ] Performance optimization

---

## Success Criteria

✅ All admin endpoints implemented and tested
✅ SUPERUSER role properly restricted
✅ Complete audit trail of all actions
✅ Admin UI responsive and user-friendly
✅ Zero security vulnerabilities
✅ Performance acceptable under load

---

**Status**: 📋 Ready for implementation tomorrow
**Estimated Total Time**: 4-5 days
**Complexity**: 🟠 Medium-High
**Security Impact**: 🔐 Critical

