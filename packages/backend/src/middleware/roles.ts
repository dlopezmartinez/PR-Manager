import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';

export function requireSuperuser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== UserRole.SUPERUSER) {
    res.status(403).json({ error: 'SUPERUSER access required' });
    return;
  }

  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
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
