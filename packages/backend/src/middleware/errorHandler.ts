import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import { ApiError, ErrorCodes, wrapError } from '../lib/errors.js';
import logger from '../lib/logger.js';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const apiError = err instanceof ApiError ? err : wrapError(err);

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

  if (apiError.statusCode >= 500 || !apiError.isOperational) {
    Sentry.withScope((scope) => {
      scope.setTag('error.code', apiError.code);
      scope.setTag('error.statusCode', String(apiError.statusCode));
      scope.setTag('error.isOperational', String(apiError.isOperational));

      scope.setContext('request', {
        path: req.path,
        method: req.method,
        requestId: req.requestId,
        query: req.query,
      });

      scope.setContext('apiError', apiError.getSentryContext());

      if (req.user) {
        scope.setUser({
          id: req.user.userId,
          email: req.user.email,
        });
      }

      Sentry.captureException(apiError.cause || apiError);
    });
  }

  res.status(apiError.statusCode).json(apiError.toJSON());
}

export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: T, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFoundHandler(req: Request, res: Response): void {
  const error = new ApiError({
    code: ErrorCodes.RESOURCE_NOT_FOUND,
    message: `Route ${req.method} ${req.path} not found`,
    context: { path: req.path, method: req.method },
  });

  res.status(404).json(error.toJSON());
}
