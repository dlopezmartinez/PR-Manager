/**
 * Centralized Error Handler Middleware
 *
 * Catches all errors and returns standardized API responses.
 * Also integrates with Sentry for error tracking.
 */

import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import { ApiError, ErrorCodes, wrapError } from '../lib/errors.js';
import logger from '../lib/logger.js';

/**
 * Express error handling middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Convert unknown errors to ApiError
  const apiError = err instanceof ApiError ? err : wrapError(err);

  // Log the error
  const logContext = {
    code: apiError.code,
    statusCode: apiError.statusCode,
    path: req.path,
    method: req.method,
    requestId: req.requestId,
    userId: req.user?.userId,
    ...apiError.context,
  };

  if (apiError.statusCode >= 500) {
    logger.error('Server error', { ...logContext, stack: apiError.stack });
  } else if (apiError.statusCode >= 400) {
    logger.warn('Client error', logContext);
  }

  // Report to Sentry (only 5xx errors and unexpected errors)
  if (apiError.statusCode >= 500 || !apiError.isOperational) {
    Sentry.withScope((scope) => {
      // Add error context
      scope.setTag('error.code', apiError.code);
      scope.setTag('error.statusCode', String(apiError.statusCode));
      scope.setTag('error.isOperational', String(apiError.isOperational));

      // Add request context
      scope.setContext('request', {
        path: req.path,
        method: req.method,
        requestId: req.requestId,
        query: req.query,
        // Don't include body to avoid leaking sensitive data
      });

      // Add error-specific context
      scope.setContext('apiError', apiError.getSentryContext());

      // Add user context if available
      if (req.user) {
        scope.setUser({
          id: req.user.userId,
          email: req.user.email,
        });
      }

      // Capture the original error if available, otherwise the ApiError
      Sentry.captureException(apiError.cause || apiError);
    });
  }

  // Send response
  res.status(apiError.statusCode).json(apiError.toJSON());
}

/**
 * Async route handler wrapper
 * Catches async errors and passes them to the error handler
 */
export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: T, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Not Found handler - returns 404 for unmatched routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  const error = new ApiError({
    code: ErrorCodes.RESOURCE_NOT_FOUND,
    message: `Route ${req.method} ${req.path} not found`,
    context: { path: req.path, method: req.method },
  });

  res.status(404).json(error.toJSON());
}
