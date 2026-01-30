/**
 * Tests for http.ts utilities
 * Tests HTTP request handling, retry logic, and error classes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HttpError,
  GraphQLError,
  fetchWithRetry,
  executeGraphQL,
  isRateLimitError,
  isAuthError,
  getErrorMessage,
} from '../../src/utils/http';

describe('http utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('HttpError', () => {
    it('should create error with message and status', () => {
      const error = new HttpError('Not Found', 404, 'Not Found', 'https://api.example.com');
      expect(error.message).toBe('Not Found');
      expect(error.status).toBe(404);
      expect(error.statusText).toBe('Not Found');
      expect(error.url).toBe('https://api.example.com');
      expect(error.name).toBe('HttpError');
    });

    it('should create error from Response', () => {
      const mockResponse = {
        status: 500,
        statusText: 'Internal Server Error',
      } as Response;

      const error = HttpError.fromResponse(mockResponse, 'https://api.example.com');
      expect(error.status).toBe(500);
      expect(error.isRetryable).toBe(true);
    });

    it('should mark 500+ errors as retryable', () => {
      const error500 = HttpError.fromResponse({ status: 500, statusText: 'Error' } as Response, '');
      const error502 = HttpError.fromResponse({ status: 502, statusText: 'Error' } as Response, '');
      const error503 = HttpError.fromResponse({ status: 503, statusText: 'Error' } as Response, '');

      expect(error500.isRetryable).toBe(true);
      expect(error502.isRetryable).toBe(true);
      expect(error503.isRetryable).toBe(true);
    });

    it('should not mark 4xx errors as retryable', () => {
      const error400 = HttpError.fromResponse({ status: 400, statusText: 'Error' } as Response, '');
      const error401 = HttpError.fromResponse({ status: 401, statusText: 'Error' } as Response, '');
      const error404 = HttpError.fromResponse({ status: 404, statusText: 'Error' } as Response, '');

      expect(error400.isRetryable).toBe(false);
      expect(error401.isRetryable).toBe(false);
      expect(error404.isRetryable).toBe(false);
    });

    it('should create timeout error', () => {
      const error = HttpError.timeout('https://api.example.com', 5000);
      expect(error.message).toContain('timeout');
      expect(error.message).toContain('5000');
      expect(error.isRetryable).toBe(true);
    });

    it('should create network error', () => {
      const originalError = new Error('Failed to fetch');
      const error = HttpError.network('https://api.example.com', originalError);
      expect(error.message).toContain('Network error');
      expect(error.isRetryable).toBe(true);
    });
  });

  describe('GraphQLError', () => {
    it('should create error from GraphQL errors array', () => {
      const errors = [
        { message: 'Field not found', path: ['user', 'name'] },
        { message: 'Invalid query' },
      ];

      const error = GraphQLError.fromResponse(errors);
      expect(error.name).toBe('GraphQLError');
      expect(error.message).toContain('Field not found');
      expect(error.message).toContain('Invalid query');
      expect(error.errors).toEqual(errors);
    });
  });

  describe('fetchWithRetry', () => {
    it('should return response on successful fetch', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockResponse);

      const response = await fetchWithRetry('https://api.example.com');
      expect(response.ok).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on 500 error', async () => {
      const errorResponse = new Response('Error', { status: 500 });
      const successResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });

      vi.mocked(globalThis.fetch)
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(successResponse);

      const responsePromise = fetchWithRetry('https://api.example.com', {}, { maxRetries: 1 });

      // Advance timers to trigger retry
      await vi.runAllTimersAsync();

      const response = await responsePromise;
      expect(response.ok).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 401 error', async () => {
      const errorResponse = new Response('Unauthorized', { status: 401 });
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(errorResponse);

      const response = await fetchWithRetry('https://api.example.com', {}, { maxRetries: 3 });
      expect(response.status).toBe(401);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('should respect maxRetries option', async () => {
      const errorResponse = new Response('Error', { status: 503 });
      vi.mocked(globalThis.fetch).mockResolvedValue(errorResponse);

      const responsePromise = fetchWithRetry('https://api.example.com', {}, { maxRetries: 2 });

      // Advance timers to trigger all retries
      await vi.runAllTimersAsync();

      const response = await responsePromise;
      expect(response.status).toBe(503);
      // Initial + 2 retries = 3 calls
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('executeGraphQL', () => {
    it('should execute GraphQL query successfully', async () => {
      const mockData = { data: { user: { name: 'Test' } } };
      const mockResponse = new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockResponse);

      const result = await executeGraphQL<typeof mockData>(
        'https://api.example.com/graphql',
        '{ user { name } }'
      );

      expect(result).toEqual(mockData);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.example.com/graphql',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should throw GraphQLError on GraphQL errors', async () => {
      const mockData = {
        data: null,
        errors: [{ message: 'User not found' }],
      };
      const mockResponse = new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockResponse);

      await expect(
        executeGraphQL('https://api.example.com/graphql', '{ user { name } }')
      ).rejects.toThrow(GraphQLError);
    });

    it('should throw HttpError on non-OK response', async () => {
      const mockResponse = new Response('Internal Server Error', { status: 500 });
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockResponse);

      await expect(
        executeGraphQL('https://api.example.com/graphql', '{ user { name } }', {}, {}, { maxRetries: 0 })
      ).rejects.toThrow(HttpError);
    });

    it('should include custom headers', async () => {
      const mockData = { data: { viewer: { login: 'test' } } };
      const mockResponse = new Response(JSON.stringify(mockData), { status: 200 });
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockResponse);

      await executeGraphQL(
        'https://api.example.com/graphql',
        '{ viewer { login } }',
        {},
        { Authorization: 'Bearer token123' }
      );

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token123',
          }),
        })
      );
    });

    it('should include variables in request body', async () => {
      const mockData = { data: { user: { name: 'Test' } } };
      const mockResponse = new Response(JSON.stringify(mockData), { status: 200 });
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockResponse);

      await executeGraphQL(
        'https://api.example.com/graphql',
        '{ user(id: $id) { name } }',
        { id: '123' }
      );

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"variables":{"id":"123"}'),
        })
      );
    });
  });

  describe('isRateLimitError', () => {
    it('should return true for HttpError with status 429', () => {
      const error = new HttpError('Rate limited', 429);
      expect(isRateLimitError(error)).toBe(true);
    });

    it('should return true for GraphQLError with rate limit message', () => {
      const error = new GraphQLError('Rate limit exceeded', [
        { message: 'API rate limit exceeded' },
      ]);
      expect(isRateLimitError(error)).toBe(true);
    });

    it('should return false for other errors', () => {
      const httpError = new HttpError('Not found', 404);
      const graphqlError = new GraphQLError('Not found', [{ message: 'User not found' }]);

      expect(isRateLimitError(httpError)).toBe(false);
      expect(isRateLimitError(graphqlError)).toBe(false);
      expect(isRateLimitError(new Error('Random error'))).toBe(false);
    });
  });

  describe('isAuthError', () => {
    it('should return true for HttpError with status 401', () => {
      const error = new HttpError('Unauthorized', 401);
      expect(isAuthError(error)).toBe(true);
    });

    it('should return true for HttpError with status 403', () => {
      const error = new HttpError('Forbidden', 403);
      expect(isAuthError(error)).toBe(true);
    });

    it('should return true for GraphQLError with auth message', () => {
      const error = new GraphQLError('Auth error', [
        { message: 'Bad credentials' },
      ]);
      expect(isAuthError(error)).toBe(true);
    });

    it('should return false for other errors', () => {
      const error = new HttpError('Not found', 404);
      expect(isAuthError(error)).toBe(false);
    });
  });

  describe('getErrorMessage', () => {
    it('should return user-friendly message for 401', () => {
      const error = new HttpError('Unauthorized', 401);
      expect(getErrorMessage(error)).toContain('Authentication');
    });

    it('should return user-friendly message for 403', () => {
      const error = new HttpError('Forbidden', 403);
      expect(getErrorMessage(error)).toContain('Access denied');
    });

    it('should return user-friendly message for 404', () => {
      const error = new HttpError('Not found', 404);
      expect(getErrorMessage(error)).toContain('not found');
    });

    it('should return user-friendly message for 429', () => {
      const error = new HttpError('Too many requests', 429);
      expect(getErrorMessage(error)).toContain('Rate limit');
    });

    it('should return user-friendly message for 5xx', () => {
      const error = new HttpError('Server error', 500);
      expect(getErrorMessage(error)).toContain('Server error');
    });

    it('should return user-friendly message for timeout', () => {
      const error = HttpError.timeout('url', 5000);
      expect(getErrorMessage(error)).toContain('timed out');
    });

    it('should return GraphQL error messages', () => {
      const error = new GraphQLError('Error', [
        { message: 'Field not found' },
        { message: 'Invalid input' },
      ]);
      const message = getErrorMessage(error);
      expect(message).toContain('Field not found');
      expect(message).toContain('Invalid input');
    });

    it('should handle regular Error objects', () => {
      const error = new Error('Something went wrong');
      expect(getErrorMessage(error)).toBe('Something went wrong');
    });

    it('should handle unknown error types', () => {
      expect(getErrorMessage('string error')).toBe('An unknown error occurred');
      expect(getErrorMessage(null)).toBe('An unknown error occurred');
    });
  });
});
