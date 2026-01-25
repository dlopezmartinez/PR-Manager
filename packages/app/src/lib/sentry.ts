import * as Sentry from '@sentry/electron/main';
import { app } from 'electron';

const SENTRY_DSN = process.env.SENTRY_DSN || '';

export function initSentryMain(): void {
  if (!SENTRY_DSN) {
    console.log('[Sentry] DSN not configured, error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    release: `pr-manager@${app.getVersion()}`,
    environment: process.env.NODE_ENV || 'development',
    enabled: process.env.NODE_ENV === 'production' || process.env.SENTRY_ENABLED === 'true',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    beforeSend(event) {
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
          if (breadcrumb.message) {
            breadcrumb.message = breadcrumb.message
              .replace(/ghp_[a-zA-Z0-9]+/g, '[GITHUB_TOKEN]')
              .replace(/glpat-[a-zA-Z0-9-]+/g, '[GITLAB_TOKEN]')
              .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]');
          }
          return breadcrumb;
        });
      }
      return event;
    },

    ignoreErrors: [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'net::ERR_INTERNET_DISCONNECTED',
      'net::ERR_NAME_NOT_RESOLVED',
      'net::ERR_CONNECTION_REFUSED',
      'ResizeObserver loop limit exceeded',
    ],
  });

  console.log('[Sentry] Error tracking initialized for main process');
}

export function captureException(error: Error, context?: Record<string, unknown>): void {
  if (context) {
    Sentry.withScope((scope) => {
      scope.setExtras(context);
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  Sentry.captureMessage(message, level);
}

export function setUser(user: { id: string; email?: string } | null): void {
  Sentry.setUser(user);
}

export { Sentry };
