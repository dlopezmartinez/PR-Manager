export const ErrorCodes = {
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_USER_NOT_FOUND: 'AUTH_USER_NOT_FOUND',
  AUTH_USER_SUSPENDED: 'AUTH_USER_SUSPENDED',
  AUTH_EMAIL_EXISTS: 'AUTH_EMAIL_EXISTS',
  AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_REFRESH_TOKEN_INVALID: 'AUTH_REFRESH_TOKEN_INVALID',
  AUTH_REFRESH_TOKEN_EXPIRED: 'AUTH_REFRESH_TOKEN_EXPIRED',
  AUTH_PASSWORD_INCORRECT: 'AUTH_PASSWORD_INCORRECT',
  AUTH_PASSWORD_WEAK: 'AUTH_PASSWORD_WEAK',
  AUTH_RESET_TOKEN_INVALID: 'AUTH_RESET_TOKEN_INVALID',
  AUTH_RESET_TOKEN_EXPIRED: 'AUTH_RESET_TOKEN_EXPIRED',
  AUTH_SESSION_NOT_FOUND: 'AUTH_SESSION_NOT_FOUND',
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',

  VALIDATION_FAILED: 'VALIDATION_FAILED',
  VALIDATION_EMAIL_INVALID: 'VALIDATION_EMAIL_INVALID',
  VALIDATION_PASSWORD_TOO_SHORT: 'VALIDATION_PASSWORD_TOO_SHORT',
  VALIDATION_REQUIRED_FIELD: 'VALIDATION_REQUIRED_FIELD',

  SUBSCRIPTION_NOT_FOUND: 'SUBSCRIPTION_NOT_FOUND',
  SUBSCRIPTION_ALREADY_ACTIVE: 'SUBSCRIPTION_ALREADY_ACTIVE',
  SUBSCRIPTION_EXPIRED: 'SUBSCRIPTION_EXPIRED',
  SUBSCRIPTION_CANCELLED: 'SUBSCRIPTION_CANCELLED',
  SUBSCRIPTION_NOT_CANCELLED: 'SUBSCRIPTION_NOT_CANCELLED',
  SUBSCRIPTION_REQUIRED: 'SUBSCRIPTION_REQUIRED',

  PAYMENT_CONFIG_ERROR: 'PAYMENT_CONFIG_ERROR',
  PAYMENT_CHECKOUT_FAILED: 'PAYMENT_CHECKOUT_FAILED',
  PAYMENT_SESSION_INVALID: 'PAYMENT_SESSION_INVALID',
  PAYMENT_SESSION_NOT_FOUND: 'PAYMENT_SESSION_NOT_FOUND',

  DOWNLOAD_INVALID_PLATFORM: 'DOWNLOAD_INVALID_PLATFORM',
  DOWNLOAD_LINK_INVALID: 'DOWNLOAD_LINK_INVALID',
  DOWNLOAD_LINK_EXPIRED: 'DOWNLOAD_LINK_EXPIRED',
  DOWNLOAD_UNAUTHORIZED: 'DOWNLOAD_UNAUTHORIZED',

  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_ALREADY_SUSPENDED: 'USER_ALREADY_SUSPENDED',
  USER_NOT_SUSPENDED: 'USER_NOT_SUSPENDED',
  USER_ALREADY_DELETED: 'USER_ALREADY_DELETED',
  USER_SELF_ACTION_FORBIDDEN: 'USER_SELF_ACTION_FORBIDDEN',

  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',

  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  SERVER_ERROR: 'SERVER_ERROR',
  SERVER_CONFIG_ERROR: 'SERVER_CONFIG_ERROR',
  SERVER_EXTERNAL_SERVICE_ERROR: 'SERVER_EXTERNAL_SERVICE_ERROR',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

const errorMessages: Record<ErrorCode, string> = {
  [ErrorCodes.AUTH_INVALID_CREDENTIALS]: 'The email or password you entered is incorrect.',
  [ErrorCodes.AUTH_USER_NOT_FOUND]: 'No account found with this email address.',
  [ErrorCodes.AUTH_USER_SUSPENDED]: 'Your account has been suspended.',
  [ErrorCodes.AUTH_EMAIL_EXISTS]: 'An account with this email already exists. Please sign in instead.',
  [ErrorCodes.AUTH_INVALID_TOKEN]: 'Your session is invalid. Please sign in again.',
  [ErrorCodes.AUTH_TOKEN_EXPIRED]: 'Your session has expired. Please sign in again.',
  [ErrorCodes.AUTH_REFRESH_TOKEN_INVALID]: 'Your session is invalid. Please sign in again.',
  [ErrorCodes.AUTH_REFRESH_TOKEN_EXPIRED]: 'Your session has expired. Please sign in again.',
  [ErrorCodes.AUTH_PASSWORD_INCORRECT]: 'The current password you entered is incorrect.',
  [ErrorCodes.AUTH_PASSWORD_WEAK]: 'Password must be at least 8 characters long.',
  [ErrorCodes.AUTH_RESET_TOKEN_INVALID]: 'This password reset link is invalid.',
  [ErrorCodes.AUTH_RESET_TOKEN_EXPIRED]: 'This password reset link has expired. Please request a new one.',
  [ErrorCodes.AUTH_SESSION_NOT_FOUND]: 'Session not found.',
  [ErrorCodes.AUTH_UNAUTHORIZED]: 'You must be signed in to access this resource.',

  [ErrorCodes.VALIDATION_FAILED]: 'Please check your input and try again.',
  [ErrorCodes.VALIDATION_EMAIL_INVALID]: 'Please enter a valid email address.',
  [ErrorCodes.VALIDATION_PASSWORD_TOO_SHORT]: 'Password must be at least 8 characters long.',
  [ErrorCodes.VALIDATION_REQUIRED_FIELD]: 'Please fill in all required fields.',

  [ErrorCodes.SUBSCRIPTION_NOT_FOUND]: 'No subscription found for your account.',
  [ErrorCodes.SUBSCRIPTION_ALREADY_ACTIVE]: 'You already have an active subscription.',
  [ErrorCodes.SUBSCRIPTION_EXPIRED]: 'Your subscription has expired. Please renew to continue.',
  [ErrorCodes.SUBSCRIPTION_CANCELLED]: 'Your subscription has been cancelled.',
  [ErrorCodes.SUBSCRIPTION_NOT_CANCELLED]: 'Your subscription is not scheduled for cancellation.',
  [ErrorCodes.SUBSCRIPTION_REQUIRED]: 'A subscription is required to access this feature.',

  [ErrorCodes.PAYMENT_CONFIG_ERROR]: 'Payment system is temporarily unavailable. Please try again later.',
  [ErrorCodes.PAYMENT_CHECKOUT_FAILED]: 'Unable to process payment. Please try again.',
  [ErrorCodes.PAYMENT_SESSION_INVALID]: 'Payment session is invalid or has expired.',
  [ErrorCodes.PAYMENT_SESSION_NOT_FOUND]: 'Payment session not found.',

  [ErrorCodes.DOWNLOAD_INVALID_PLATFORM]: 'Invalid platform specified.',
  [ErrorCodes.DOWNLOAD_LINK_INVALID]: 'This download link is invalid.',
  [ErrorCodes.DOWNLOAD_LINK_EXPIRED]: 'This download link has expired. Please request a new one.',
  [ErrorCodes.DOWNLOAD_UNAUTHORIZED]: 'You are not authorized to download this file.',

  [ErrorCodes.USER_NOT_FOUND]: 'User not found.',
  [ErrorCodes.USER_ALREADY_SUSPENDED]: 'This user is already suspended.',
  [ErrorCodes.USER_NOT_SUSPENDED]: 'This user is not suspended.',
  [ErrorCodes.USER_ALREADY_DELETED]: 'This user has already been deleted.',
  [ErrorCodes.USER_SELF_ACTION_FORBIDDEN]: 'You cannot perform this action on your own account.',

  [ErrorCodes.RESOURCE_NOT_FOUND]: 'The requested resource was not found.',
  [ErrorCodes.RESOURCE_ALREADY_EXISTS]: 'This resource already exists.',

  [ErrorCodes.RATE_LIMIT_EXCEEDED]: 'Too many requests. Please wait a moment and try again.',

  [ErrorCodes.SERVER_ERROR]: 'Something went wrong. Please try again later.',
  [ErrorCodes.SERVER_CONFIG_ERROR]: 'Server configuration error. Please contact support.',
  [ErrorCodes.SERVER_EXTERNAL_SERVICE_ERROR]: 'An external service is temporarily unavailable.',
};

export interface ApiErrorOptions {
  code: ErrorCode;
  message?: string;
  statusCode?: number;
  details?: unknown;
  cause?: Error;
  context?: Record<string, unknown>;
}

export class ApiError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly context?: Record<string, unknown>;
  public readonly cause?: Error;
  public readonly isOperational: boolean = true;

  constructor(options: ApiErrorOptions) {
    const message = options.message || errorMessages[options.code] || 'An error occurred';
    super(message);

    this.name = 'ApiError';
    this.code = options.code;
    this.statusCode = options.statusCode || getDefaultStatusCode(options.code);
    this.details = options.details;
    this.context = options.context;
    this.cause = options.cause;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): { code: ErrorCode; message: string; details?: unknown } {
    const result: { code: ErrorCode; message: string; details?: unknown } = {
      code: this.code,
      message: this.message,
    };
    if (this.details !== undefined) {
      result.details = this.details;
    }
    return result;
  }

  getSentryContext(): Record<string, unknown> {
    const result: Record<string, unknown> = {
      errorCode: this.code,
      statusCode: this.statusCode,
    };
    if (this.context) {
      Object.assign(result, this.context);
    }
    if (this.details !== undefined) {
      result.details = this.details;
    }
    return result;
  }
}

function getDefaultStatusCode(code: ErrorCode): number {
  const statusMap: Partial<Record<ErrorCode, number>> = {
    [ErrorCodes.VALIDATION_FAILED]: 400,
    [ErrorCodes.VALIDATION_EMAIL_INVALID]: 400,
    [ErrorCodes.VALIDATION_PASSWORD_TOO_SHORT]: 400,
    [ErrorCodes.VALIDATION_REQUIRED_FIELD]: 400,
    [ErrorCodes.AUTH_EMAIL_EXISTS]: 400,
    [ErrorCodes.AUTH_PASSWORD_WEAK]: 400,
    [ErrorCodes.AUTH_RESET_TOKEN_INVALID]: 400,
    [ErrorCodes.SUBSCRIPTION_ALREADY_ACTIVE]: 400,
    [ErrorCodes.SUBSCRIPTION_NOT_CANCELLED]: 400,
    [ErrorCodes.DOWNLOAD_INVALID_PLATFORM]: 400,
    [ErrorCodes.USER_ALREADY_SUSPENDED]: 400,
    [ErrorCodes.USER_NOT_SUSPENDED]: 400,
    [ErrorCodes.USER_ALREADY_DELETED]: 400,
    [ErrorCodes.USER_SELF_ACTION_FORBIDDEN]: 400,

    [ErrorCodes.AUTH_INVALID_CREDENTIALS]: 401,
    [ErrorCodes.AUTH_INVALID_TOKEN]: 401,
    [ErrorCodes.AUTH_TOKEN_EXPIRED]: 401,
    [ErrorCodes.AUTH_REFRESH_TOKEN_INVALID]: 401,
    [ErrorCodes.AUTH_REFRESH_TOKEN_EXPIRED]: 401,
    [ErrorCodes.AUTH_PASSWORD_INCORRECT]: 401,
    [ErrorCodes.AUTH_UNAUTHORIZED]: 401,

    [ErrorCodes.AUTH_USER_SUSPENDED]: 403,
    [ErrorCodes.SUBSCRIPTION_EXPIRED]: 403,
    [ErrorCodes.SUBSCRIPTION_REQUIRED]: 403,
    [ErrorCodes.DOWNLOAD_UNAUTHORIZED]: 403,
    [ErrorCodes.DOWNLOAD_LINK_EXPIRED]: 403,

    [ErrorCodes.AUTH_USER_NOT_FOUND]: 404,
    [ErrorCodes.AUTH_SESSION_NOT_FOUND]: 404,
    [ErrorCodes.AUTH_RESET_TOKEN_EXPIRED]: 404,
    [ErrorCodes.SUBSCRIPTION_NOT_FOUND]: 404,
    [ErrorCodes.PAYMENT_SESSION_NOT_FOUND]: 404,
    [ErrorCodes.DOWNLOAD_LINK_INVALID]: 404,
    [ErrorCodes.USER_NOT_FOUND]: 404,
    [ErrorCodes.RESOURCE_NOT_FOUND]: 404,

    [ErrorCodes.RESOURCE_ALREADY_EXISTS]: 409,

    [ErrorCodes.RATE_LIMIT_EXCEEDED]: 429,

    [ErrorCodes.SERVER_ERROR]: 500,
    [ErrorCodes.SERVER_CONFIG_ERROR]: 500,
    [ErrorCodes.PAYMENT_CONFIG_ERROR]: 500,

    [ErrorCodes.SERVER_EXTERNAL_SERVICE_ERROR]: 502,
  };

  return statusMap[code] || 500;
}

export function validationError(details: Array<{ path: (string | number)[]; message: string }>) {
  return new ApiError({
    code: ErrorCodes.VALIDATION_FAILED,
    details: details.map(d => ({
      field: d.path.map(String).join('.'),
      message: d.message,
    })),
  });
}

export function wrapError(error: unknown, defaultCode: ErrorCode = ErrorCodes.SERVER_ERROR): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  const originalError = error instanceof Error ? error : new Error(String(error));

  return new ApiError({
    code: defaultCode,
    cause: originalError,
    context: {
      originalMessage: originalError.message,
      originalName: originalError.name,
    },
  });
}

export const Errors = {
  invalidCredentials: () => new ApiError({ code: ErrorCodes.AUTH_INVALID_CREDENTIALS }),
  userNotFound: () => new ApiError({ code: ErrorCodes.AUTH_USER_NOT_FOUND }),
  userSuspended: (reason?: string) => new ApiError({
    code: ErrorCodes.AUTH_USER_SUSPENDED,
    message: reason || errorMessages[ErrorCodes.AUTH_USER_SUSPENDED],
    context: { suspendedReason: reason },
  }),
  emailExists: () => new ApiError({ code: ErrorCodes.AUTH_EMAIL_EXISTS }),
  unauthorized: () => new ApiError({ code: ErrorCodes.AUTH_UNAUTHORIZED }),
  tokenExpired: () => new ApiError({ code: ErrorCodes.AUTH_TOKEN_EXPIRED }),
  tokenInvalid: () => new ApiError({ code: ErrorCodes.AUTH_INVALID_TOKEN }),
  subscriptionRequired: () => new ApiError({ code: ErrorCodes.SUBSCRIPTION_REQUIRED }),
  subscriptionNotFound: () => new ApiError({ code: ErrorCodes.SUBSCRIPTION_NOT_FOUND }),
  notFound: (resource?: string) => new ApiError({
    code: ErrorCodes.RESOURCE_NOT_FOUND,
    message: resource ? `${resource} not found.` : errorMessages[ErrorCodes.RESOURCE_NOT_FOUND],
  }),
  serverError: (cause?: Error) => new ApiError({
    code: ErrorCodes.SERVER_ERROR,
    cause,
  }),
  rateLimitExceeded: () => new ApiError({ code: ErrorCodes.RATE_LIMIT_EXCEEDED }),
};
