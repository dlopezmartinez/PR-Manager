import { Request, Response, NextFunction } from 'express';
import { hashSecret, getAdminSecretByHash, updateLastUsed } from '../services/adminSecretService.js';
import logger from '../lib/logger.js';

export async function requireAdminSecret(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('AdminSecret ')) {
    next();
    return;
  }

  const providedSecret = authHeader.substring('AdminSecret '.length).trim();

  const globalSecret = process.env.ADMIN_SECRET_KEY;
  if (globalSecret && providedSecret === globalSecret) {
    (req as any).user = {
      userId: 'system-admin',
      email: 'system@prmanager.app',
      role: 'SUPERUSER',
    };
    (req as any).adminSecretValid = true;
    (req as any).secretType = 'global';
    logger.info('Accessed with global admin secret');
    next();
    return;
  }

  try {
    const secretHash = hashSecret(providedSecret);
    const adminSecret = await getAdminSecretByHash(secretHash);

    if (!adminSecret) {
      res.status(401).json({ error: 'Invalid admin secret' });
      return;
    }

    if (adminSecret.revokedAt) {
      res.status(401).json({ error: 'Admin secret has been revoked' });
      return;
    }

    (req as any).user = {
      userId: adminSecret.userId,
      email: adminSecret.user.email,
      role: 'SUPERUSER',
    };
    (req as any).adminSecretValid = true;
    (req as any).secretType = 'user-secret';
    (req as any).secretId = adminSecret.id;
    (req as any).secretName = adminSecret.name;

    updateLastUsed(adminSecret.id).catch((err) => logger.error('Failed to update last used', { error: err.message }));

    logger.info('Accessed with user secret', {
      userId: adminSecret.userId,
      email: adminSecret.user.email,
      secretName: adminSecret.name,
    });

    next();
    return;
  } catch (error) {
    logger.error('Error validating admin secret', { error: (error as Error).message });
    res.status(401).json({ error: 'Invalid admin secret' });
    return;
  }
}
