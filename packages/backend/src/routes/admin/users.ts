import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireSuperuser } from '../../middleware/roles.js';
import { logAudit } from '../../services/auditService.js';
import logger from '../../lib/logger.js';
import { getQueryString, getQueryBoolean, getQueryNumber, toStr } from '../../utils/queryParams.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, getQueryNumber(req.query.page) || 1);
    const limit = Math.min(Math.max(1, getQueryNumber(req.query.limit) || 50), 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    const role = getQueryString(req.query.role);
    if (role) {
      where.role = role;
    }

    const isActive = getQueryBoolean(req.query.isActive);
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const isSuspended = getQueryBoolean(req.query.isSuspended);
    if (isSuspended !== undefined) {
      where.isSuspended = isSuspended;
    }

    const search = getQueryString(req.query.search);
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          isSuspended: true,
          suspendedReason: true,
          suspendedAt: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('Failed to list users', { error });
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Helper: Find user by email (useful for Postman/scripts)
router.get('/by-email/:email', async (req: Request, res: Response) => {
  try {
    const email = decodeURIComponent(toStr(req.params.email) || '');
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        isSuspended: true,
        createdAt: true,
        subscription: {
          select: {
            status: true,
            currentPeriodEnd: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    logger.error('Failed to find user by email', { error });
    res.status(500).json({ error: 'Failed to find user' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: toStr(req.params.id) || '' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        isSuspended: true,
        suspendedReason: true,
        suspendedAt: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        subscription: {
          select: {
            id: true,
            status: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    logger.error('Failed to get user', { error });
    res.status(500).json({ error: 'Failed to get user' });
  }
});

router.patch('/:id/role', requireSuperuser, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      role: z.enum(['USER', 'ADMIN', 'SUPERUSER', 'LIFETIME']),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: 'Validation failed', details: validation.error.errors });
      return;
    }

    if (req.params.id === req.user!.userId) {
      res.status(400).json({ error: 'Cannot change your own role' });
      return;
    }

    const oldUser = await prisma.user.findUnique({
      where: { id: toStr(req.params.id) || '' },
      select: { role: true },
    });

    if (!oldUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: toStr(req.params.id) || '' },
        data: { role: validation.data.role },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      });

      await logAudit({
        action: 'USER_ROLE_CHANGED',
        performedBy: req.user!.userId,
        targetUserId: user.id,
        changes: {
          before: { role: oldUser.role },
          after: { role: user.role },
        },
        metadata: { ip: req.ip, userAgent: req.get('user-agent') },
      });

      return user;
    });

    logger.info('User role changed', {
      adminId: req.user!.userId,
      targetId: req.params.id,
      newRole: validation.data.role,
    });

    res.json({ message: 'Role updated', user: updatedUser });
  } catch (error) {
    logger.error('Failed to update role', { error });
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Quick helper: Grant LIFETIME access to a user
router.post('/:id/grant-lifetime', requireSuperuser, async (req: Request, res: Response) => {
  try {
    const userId = toStr(req.params.id) || '';

    const oldUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true },
    });

    if (!oldUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (oldUser.role === 'LIFETIME') {
      res.status(400).json({ error: 'User already has LIFETIME access' });
      return;
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { role: 'LIFETIME' },
        select: { id: true, email: true, name: true, role: true },
      });

      await logAudit({
        action: 'USER_ROLE_CHANGED',
        performedBy: req.user!.userId,
        targetUserId: user.id,
        changes: {
          before: { role: oldUser.role },
          after: { role: 'LIFETIME' },
        },
        metadata: { ip: req.ip, userAgent: req.get('user-agent'), action: 'grant-lifetime' },
      });

      return user;
    });

    logger.info('LIFETIME access granted', { adminId: req.user!.userId, targetId: userId });
    res.json({ message: 'LIFETIME access granted', user: updatedUser });
  } catch (error) {
    logger.error('Failed to grant LIFETIME access', { error });
    res.status(500).json({ error: 'Failed to grant LIFETIME access' });
  }
});

// Quick helper: Revoke LIFETIME access (set back to USER)
router.post('/:id/revoke-lifetime', requireSuperuser, async (req: Request, res: Response) => {
  try {
    const userId = toStr(req.params.id) || '';

    const oldUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!oldUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (oldUser.role !== 'LIFETIME') {
      res.status(400).json({ error: 'User does not have LIFETIME access' });
      return;
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { role: 'USER' },
        select: { id: true, email: true, name: true, role: true },
      });

      await logAudit({
        action: 'USER_ROLE_CHANGED',
        performedBy: req.user!.userId,
        targetUserId: user.id,
        changes: {
          before: { role: 'LIFETIME' },
          after: { role: 'USER' },
        },
        metadata: { ip: req.ip, userAgent: req.get('user-agent'), action: 'revoke-lifetime' },
      });

      return user;
    });

    logger.info('LIFETIME access revoked', { adminId: req.user!.userId, targetId: userId });
    res.json({ message: 'LIFETIME access revoked, user is now USER', user: updatedUser });
  } catch (error) {
    logger.error('Failed to revoke LIFETIME access', { error });
    res.status(500).json({ error: 'Failed to revoke LIFETIME access' });
  }
});

router.post('/:id/suspend', requireSuperuser, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      reason: z.string().min(1, 'Reason is required').max(500, 'Reason too long'),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: 'Validation failed', details: validation.error.errors });
      return;
    }

    if (req.params.id === req.user!.userId) {
      res.status(400).json({ error: 'Cannot suspend yourself' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: toStr(req.params.id) || '' },
      select: { isSuspended: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.isSuspended) {
      res.status(400).json({ error: 'User is already suspended' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: toStr(req.params.id) || '' },
        data: {
          isSuspended: true,
          suspendedReason: validation.data.reason,
          suspendedAt: new Date(),
        },
      });

      await tx.session.deleteMany({
        where: { userId: toStr(req.params.id) || '' },
      });

      await logAudit({
        action: 'USER_SUSPENDED',
        performedBy: req.user!.userId,
        targetUserId: toStr(req.params.id),
        changes: { reason: validation.data.reason },
        metadata: { ip: req.ip, userAgent: req.get('user-agent') },
      });
    });

    logger.info('User suspended', {
      adminId: req.user!.userId,
      targetId: req.params.id,
      reason: validation.data.reason,
    });

    res.json({ message: 'User suspended and all sessions revoked' });
  } catch (error) {
    logger.error('Failed to suspend user', { error });
    res.status(500).json({ error: 'Failed to suspend user' });
  }
});

router.post('/:id/unsuspend', requireSuperuser, async (req: Request, res: Response) => {
  try {
    if (req.params.id === req.user!.userId) {
      res.status(400).json({ error: 'Cannot unsuspend yourself' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: toStr(req.params.id) || '' },
      select: { isSuspended: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.isSuspended) {
      res.status(400).json({ error: 'User is not suspended' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: toStr(req.params.id) || '' },
        data: {
          isSuspended: false,
          suspendedReason: null,
          suspendedAt: null,
        },
      });

      await logAudit({
        action: 'USER_UNSUSPENDED',
        performedBy: req.user!.userId,
        targetUserId: toStr(req.params.id),
        metadata: { ip: req.ip, userAgent: req.get('user-agent') },
      });
    });

    logger.info('User unsuspended', {
      adminId: req.user!.userId,
      targetId: req.params.id,
    });

    res.json({ message: 'User unsuspended' });
  } catch (error) {
    logger.error('Failed to unsuspend user', { error });
    res.status(500).json({ error: 'Failed to unsuspend user' });
  }
});

router.delete('/:id', requireSuperuser, async (req: Request, res: Response) => {
  try {
    if (req.params.id === req.user!.userId) {
      res.status(400).json({ error: 'Cannot delete yourself' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: toStr(req.params.id) || '' },
      select: { isActive: true, email: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.isActive) {
      res.status(400).json({ error: 'User is already deleted' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: toStr(req.params.id) || '' },
        data: {
          isActive: false,
        },
      });

      await tx.session.deleteMany({
        where: { userId: toStr(req.params.id) || '' },
      });

      await logAudit({
        action: 'USER_DELETED',
        performedBy: req.user!.userId,
        targetUserId: toStr(req.params.id),
        changes: { email: user.email },
        metadata: { ip: req.ip, userAgent: req.get('user-agent') },
      });
    });

    logger.info('User deleted', {
      adminId: req.user!.userId,
      targetId: req.params.id,
    });

    res.json({ message: 'User deleted' });
  } catch (error) {
    logger.error('Failed to delete user', { error });
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Hard delete: Permanently removes user and all related data
// Only accessible with AdminSecret authentication
router.delete('/:id/permanent', requireSuperuser, async (req: Request, res: Response) => {
  try {
    // Require explicit confirmation
    const schema = z.object({
      confirm: z.literal(true, {
        errorMap: () => ({ message: 'Must confirm with { "confirm": true }' }),
      }),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: 'Confirmation required', details: validation.error.errors });
      return;
    }

    // Only allow with AdminSecret, not regular auth
    if (!(req as any).adminSecretValid) {
      res.status(403).json({ error: 'Hard delete requires AdminSecret authentication' });
      return;
    }

    const userId = toStr(req.params.id) || '';

    if (userId === req.user!.userId) {
      res.status(400).json({ error: 'Cannot delete yourself' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        _count: {
          select: {
            sessions: true,
            adminSecrets: true,
          },
        },
        subscription: {
          select: { id: true },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Prevent deleting other superusers
    if (user.role === 'SUPERUSER') {
      res.status(403).json({ error: 'Cannot permanently delete a SUPERUSER account' });
      return;
    }

    // Log before deletion (audit log will have targetUserId set to null after cascade)
    await logAudit({
      action: 'USER_DELETED',
      performedBy: req.user!.userId,
      targetUserId: undefined, // Set to undefined since user will be deleted
      changes: {
        permanentDelete: true,
        email: user.email,
        role: user.role,
        hadSubscription: !!user.subscription,
        sessionCount: user._count.sessions,
        adminSecretCount: user._count.adminSecrets,
      },
      metadata: {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        deletedUserId: userId,
      },
    });

    // Delete user - cascades to sessions, subscription, adminSecrets, passwordResetTokens
    await prisma.user.delete({
      where: { id: userId },
    });

    logger.warn('User permanently deleted', {
      adminId: req.user!.userId,
      deletedUserId: userId,
      deletedEmail: user.email,
    });

    res.json({
      message: 'User permanently deleted',
      deleted: {
        userId,
        email: user.email,
      },
    });
  } catch (error) {
    logger.error('Failed to permanently delete user', { error });
    res.status(500).json({ error: 'Failed to permanently delete user' });
  }
});

export default router;
