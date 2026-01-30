import * as Sentry from '@sentry/vue';
import type { App } from 'vue';
import { uiLogger } from '../utils/logger';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';
const sentryLogger = uiLogger.child('Sentry');

export function initSentryRenderer(app: App): void {
  if (!SENTRY_DSN) {
    sentryLogger.info('DSN not configured, error tracking disabled');
    return;
  }

  Sentry.init({
    app,
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE || 'development',
    enabled: import.meta.env.PROD || import.meta.env.VITE_SENTRY_ENABLED === 'true',
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

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

  sentryLogger.info('Error tracking initialized for renderer process');
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

/**
 * Test function to verify Sentry is working
 * Can be called from DevTools console: window.testSentry()
 */
export function testSentry(): void {
  sentryLogger.info('Sending test error...');
  try {
    throw new Error('Sentry Test Error - Please ignore this error');
  } catch (error) {
    captureException(error as Error, { test: true, timestamp: new Date().toISOString() });
    sentryLogger.info('Error sent! Check your Sentry dashboard.');
  }
}

// Expose test function globally in development
if (import.meta.env.DEV || import.meta.env.VITE_SENTRY_ENABLED === 'true') {
  (window as unknown as Record<string, unknown>).testSentry = testSentry;
}

export { Sentry };
