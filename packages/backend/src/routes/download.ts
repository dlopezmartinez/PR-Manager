import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifySignedDownload, getGitHubReleaseUrl } from '../lib/signature.js';
import { hasActiveSubscriptionOrIsSuperuser } from '../lib/authorization.js';
import { downloadLimiter } from '../middleware/rateLimit.js';

const router = Router();

/**
 * GET /download/:platform/:version
 * Protected download endpoint with signed URL verification
 *
 * Query params:
 * - signature: HMAC signature for verification
 * - expires: Timestamp when the link expires
 * - user: User ID who requested the download
 */
router.get('/:platform/:version', downloadLimiter, async (req: Request, res: Response) => {
  try {
    const paramsSchema = z.object({
      platform: z.enum(['mac', 'windows', 'linux-deb', 'linux-rpm']),
      version: z.string().regex(/^\d+\.\d+\.\d+(-[a-z]+\.\d+)?$/).max(50, 'Version too long'),
    });

    const querySchema = z.object({
      signature: z.string().min(1).max(512, 'Signature too long'),
      expires: z.string().min(1).max(20, 'Expires too long'),
      user: z.string().min(1).max(255, 'User ID too long'),
    });

    // Validate path params
    const paramsValidation = paramsSchema.safeParse(req.params);
    if (!paramsValidation.success) {
      res.status(400).json({
        error: 'Invalid platform or version',
        details: paramsValidation.error.errors,
      });
      return;
    }

    // Validate query params
    const queryValidation = querySchema.safeParse(req.query);
    if (!queryValidation.success) {
      res.status(400).json({
        error: 'Missing or invalid download parameters',
        details: queryValidation.error.errors,
      });
      return;
    }

    const { platform, version } = paramsValidation.data;
    const { signature, expires, user: userId } = queryValidation.data;

    // Verify the signed URL
    const verification = verifySignedDownload(userId, platform, version, signature, expires);
    if (!verification.valid) {
      res.status(403).json({
        error: verification.error || 'Invalid download link',
      });
      return;
    }

    // Verify user exists and has access
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    if (!user) {
      res.status(403).json({
        error: 'User not found',
      });
      return;
    }

    // Check if user has active subscription or is SUPERUSER
    if (!hasActiveSubscriptionOrIsSuperuser(user.role, user.subscription)) {
      res.status(403).json({
        error: 'Access denied. Active subscription required.',
        status: user.subscription?.status || 'none',
      });
      return;
    }

    // Get the GitHub release URL and redirect
    const downloadUrl = getGitHubReleaseUrl(platform, version);

    // Log download for analytics (optional)
    console.log(`Download: user=${userId}, platform=${platform}, version=${version}`);

    // Redirect to the actual download URL
    res.redirect(302, downloadUrl);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to process download' });
  }
});

/**
 * GET /download/latest/:platform
 * Get the latest version download URL (requires valid signed params)
 * This could be used if you want to always redirect to the latest version
 */
router.get('/latest/:platform', async (req: Request, res: Response) => {
  try {
    const paramsSchema = z.object({
      platform: z.enum(['mac', 'windows', 'linux-deb', 'linux-rpm']),
    });

    const querySchema = z.object({
      signature: z.string().min(1).max(512, 'Signature too long'),
      expires: z.string().min(1).max(20, 'Expires too long'),
      user: z.string().min(1).max(255, 'User ID too long'),
    });

    const paramsValidation = paramsSchema.safeParse(req.params);
    if (!paramsValidation.success) {
      res.status(400).json({ error: 'Invalid platform' });
      return;
    }

    const queryValidation = querySchema.safeParse(req.query);
    if (!queryValidation.success) {
      res.status(400).json({ error: 'Missing download parameters' });
      return;
    }

    const { platform } = paramsValidation.data;
    const { signature, expires, user: userId } = queryValidation.data;

    // Get current version from environment or package.json
    const currentVersion = process.env.CURRENT_APP_VERSION || '1.0.0';

    // Verify signature with "latest" as version placeholder
    const verification = verifySignedDownload(userId, platform, 'latest', signature, expires);
    if (!verification.valid) {
      res.status(403).json({ error: verification.error || 'Invalid download link' });
      return;
    }

    // Verify user exists and has access
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    if (!user) {
      res.status(403).json({
        error: 'User not found',
      });
      return;
    }

    // Check if user has active subscription or is SUPERUSER
    if (!hasActiveSubscriptionOrIsSuperuser(user.role, user.subscription)) {
      res.status(403).json({
        error: 'Access denied. Active subscription required.',
        status: user.subscription?.status || 'none',
      });
      return;
    }

    const downloadUrl = getGitHubReleaseUrl(platform, currentVersion);
    res.redirect(302, downloadUrl);
  } catch (error) {
    console.error('Latest download error:', error);
    res.status(500).json({ error: 'Failed to process download' });
  }
});

export default router;
