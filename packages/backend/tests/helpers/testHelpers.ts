import { prisma } from '../../src/lib/prisma.js';
import bcrypt from 'bcryptjs';
import { createAdminSecret } from '../../src/services/adminSecretService.js';
import { UserRole } from '@prisma/client';

export async function createTestUser(overrides: Partial<{
  email: string;
  name: string | null;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  isSuspended: boolean;
}> = {}) {
  const defaultUser = {
    email: `test-${Date.now()}-${Math.random()}.com`,
    name: 'Test User',
    passwordHash: await bcrypt.hash('password123', 12),
    role: 'USER' as const,
    isActive: true,
    isSuspended: false,
    suspendedReason: undefined as string | undefined,
  };

  const data = { ...defaultUser, ...overrides };
  // If suspending but no reason provided, set default
  if (data.isSuspended && !data.suspendedReason) {
    data.suspendedReason = 'Test suspension';
  }

  return prisma.user.create({
    data,
  });
}

export async function createTestSuperuser(overrides: Partial<{
  email: string;
  name: string | null;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  isSuspended: boolean;
}> = {}) {
  return createTestUser({ role: 'SUPERUSER', ...overrides });
}

export async function createTestAdminSecret(userId: string, name = 'Test Secret') {
  return createAdminSecret(userId, name);
}

export async function createTestSession(userId: string, overrides: Partial<{
  token: string;
  expiresAt: Date;
}> = {}) {
  return prisma.session.create({
    data: {
      userId,
      token: `test-token-${Date.now()}-${Math.random()}`,
      expiresAt: new Date(Date.now() + 86400000), // 1 day
      ...overrides,
    },
  });
}

export async function createTestAuditLog(
  userId: string,
  action: string,
  changes: any = {},
  targetUserId?: string
) {
  return prisma.auditLog.create({
    data: {
      performedBy: userId,
      action: action as any,
      changes: changes || undefined,
      targetUserId: targetUserId || undefined,
    },
  });
}
