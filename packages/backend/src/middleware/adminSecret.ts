import { Request, Response, NextFunction } from 'express';
import { hashSecret, getAdminSecretByHash, updateLastUsed } from '../services/adminSecretService.js';

/**
 * Admin Secret Middleware - supports two authentication methods:
 *
 * 1. Global admin secret (ADMIN_SECRET_KEY env var) for initial setup
 * 2. Per-user secrets stored in database for production use
 *
 * Creates per-user secrets with: npm run admin:create-secret
 * Usage: Authorization: AdminSecret <secret>
 */
export async function requireAdminSecret(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('AdminSecret ')) {
    next();
    return;
  }

  const providedSecret = authHeader.substring('AdminSecret '.length).trim();

  const globalSecret = process.env.ADMIN_SECRET_KEY;
  if (globalSecret && providedSecret === globalSecret) {
    (req as any).adminSecretValid = true;
    (req as any).secretType = 'global';
    console.log('[AdminSecret] Accessed with global admin secret');
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

    updateLastUsed(adminSecret.id).catch(console.error);

    console.log('[AdminSecret] Accessed with user secret', {
      userId: adminSecret.userId,
      email: adminSecret.user.email,
      secretName: adminSecret.name,
    });

    next();
    return;
  } catch (error) {
    console.error('[AdminSecret] Error validating secret', error);
    res.status(401).json({ error: 'Invalid admin secret' });
    return;
  }
}
