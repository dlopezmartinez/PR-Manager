import { prisma } from '../lib/prisma.js';
import { randomBytes, createHash } from 'crypto';
import logger from '../lib/logger.js';

export function generateSecret(): string {
  return randomBytes(32).toString('hex');
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export async function createAdminSecret(userId: string, name: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, email: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (user.role !== 'SUPERUSER') {
    throw new Error('Only SUPERUSER can have admin secrets');
  }

  const plainSecret = generateSecret();
  const secretHash = hashSecret(plainSecret);

  try {
    await prisma.adminSecret.create({
      data: {
        userId,
        secretHash,
        name,
      },
    });

    logger.info('Admin secret created', {
      userId,
      email: user.email,
      name,
    });

    return plainSecret;
  } catch (error) {
    logger.error('Failed to create admin secret', { error, userId, name });
    throw error;
  }
}

export async function getAdminSecretByHash(secretHash: string) {
  return await prisma.adminSecret.findUnique({
    where: { secretHash },
    select: {
      id: true,
      userId: true,
      user: {
        select: { id: true, email: true, role: true },
      },
      name: true,
      revokedAt: true,
      lastUsedAt: true,
    },
  });
}

export async function updateLastUsed(secretId: string): Promise<void> {
  try {
    await prisma.adminSecret.update({
      where: { id: secretId },
      data: { lastUsedAt: new Date() },
    });
  } catch (error) {
    logger.warn('Failed to update lastUsedAt for secret', { error, secretId });
  }
}

export async function listUserSecrets(userId: string) {
  return await prisma.adminSecret.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      revokedAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeSecret(secretId: string, userId: string): Promise<void> {
  const secret = await prisma.adminSecret.findUnique({
    where: { id: secretId },
    select: { userId: true },
  });

  if (!secret) {
    throw new Error('Secret not found');
  }

  if (secret.userId !== userId) {
    throw new Error('Not authorized to revoke this secret');
  }

  await prisma.adminSecret.update({
    where: { id: secretId },
    data: { revokedAt: new Date() },
  });

  logger.info('Admin secret revoked', { secretId, userId });
}

export async function deleteSecret(secretId: string, userId: string): Promise<void> {
  const secret = await prisma.adminSecret.findUnique({
    where: { id: secretId },
    select: { userId: true },
  });

  if (!secret) {
    throw new Error('Secret not found');
  }

  if (secret.userId !== userId) {
    throw new Error('Not authorized to delete this secret');
  }

  await prisma.adminSecret.delete({
    where: { id: secretId },
  });

  logger.info('Admin secret deleted', { secretId, userId });
}
