import * as Sentry from '@sentry/vue';
import type { App } from 'vue';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';

export function initSentryRenderer(app: App): void {
  if (!SENTRY_DSN) {
    console.log('[Sentry] DSN not configured, error tracking disabled');
    return;
  }

  Sentry.init({
    app,
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE || 'development',
    enabled: import.meta.env.PROD || import.meta.env.VITE_SENTRY_ENABLED === 'true',
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    trackComponents: true,
    hooks: ['activate', 'create', 'destroy', 'mount', 'update'],

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
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
      'net::ERR_INTERNET_DISCONNECTED',
      'net::ERR_NAME_NOT_RESOLVED',
      'net::ERR_CONNECTION_REFUSED',
      'NetworkError',
      'Failed to fetch',
    ],
  });

  console.log('[Sentry] Error tracking initialized for renderer process');
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
