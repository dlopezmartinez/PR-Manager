/**
 * Tests for BaseGraphQLService
 * Tests the abstract base class through a concrete test implementation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BaseGraphQLService,
  HttpError,
  GraphQLError,
  getErrorMessage,
  isAuthError,
  isRateLimitError,
} from '../../../src/providers/base/BaseGraphQLService';

// Mock the configStore module
vi.mock('../../../src/stores/configStore', () => ({
  getApiKey: vi.fn(),
}));

// Mock the http module
vi.mock('../../../src/utils/http', () => ({
  executeGraphQL: vi.fn(),
  HttpError: class HttpError extends Error {
    status: number;
    statusText: string;
    url: string;
    constructor(message: string, status: number, statusText?: string, url?: string) {
      super(message);
      this.name = 'HttpError';
      this.status = status;
      this.statusText = statusText || '';
      this.url = url || '';
    }
  },
  GraphQLError: class GraphQLError extends Error {
    errors: Array<{ message: string }>;
    constructor(message: string, errors: Array<{ message: string }>) {
      super(message);
      this.name = 'GraphQLError';
      this.errors = errors;
    }
  },
  getErrorMessage: vi.fn((error: Error) => error.message),
  isAuthError: vi.fn((error: Error) => {
    if (error instanceof Error && 'status' in error) {
      const status = (error as { status: number }).status;
      return status === 401 || status === 403;
    }
    return false;
  }),
  isRateLimitError: vi.fn((error: Error) => {
    if (error instanceof Error && 'status' in error) {
      return (error as { status: number }).status === 429;
    }
    return false;
  }),
}));

import { getApiKey } from '../../../src/stores/configStore';
import { executeGraphQL } from '../../../src/utils/http';

// Concrete implementation for testing
class TestGraphQLService extends BaseGraphQLService {
  constructor(endpoint = 'https://api.test.com/graphql') {
    super({
      providerName: 'TestProvider',
      endpoint,
      authFormat: 'bearer',
      queryRetries: 3,
      timeout: 30000,
    });
  }

  // Expose protected methods for testing
  public testGetApiToken(): string {
    return this.getApiToken();
  }

  public testGetAuthHeaders(): Record<string, string> {
    return this.getAuthHeaders();
  }

  public getProviderName(): string {
    return this.providerName;
  }

  public getEndpoint(): string {
    return this.endpoint;
  }
}

// Create a service with token auth format
class TokenAuthService extends BaseGraphQLService {
  constructor() {
    super({
      providerName: 'TokenProvider',
      endpoint: 'https://api.token.com/graphql',
      authFormat: 'token',
      queryRetries: 2,
      timeout: 15000,
    });
  }

  public testGetAuthHeaders(): Record<string, string> {
    return this.getAuthHeaders();
  }
}

describe('BaseGraphQLService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {
      const service = new TestGraphQLService('https://custom.api.com/graphql');

      expect(service.getProviderName()).toBe('TestProvider');
      expect(service.getEndpoint()).toBe('https://custom.api.com/graphql');
    });

    it('should use default endpoint when not provided', () => {
      const service = new TestGraphQLService();

      expect(service.getEndpoint()).toBe('https://api.test.com/graphql');
    });
  });

  describe('getApiToken', () => {
    it('should return API key from configStore', () => {
      vi.mocked(getApiKey).mockReturnValue('test-api-key-123');
      const service = new TestGraphQLService();

      const token = service.testGetApiToken();

      expect(token).toBe('test-api-key-123');
      expect(getApiKey).toHaveBeenCalledTimes(1);
    });

    it('should throw error when API key is not configured', () => {
      vi.mocked(getApiKey).mockReturnValue(null);
      const service = new TestGraphQLService();

      expect(() => service.testGetApiToken()).toThrow(
        'API token not configured. Please set your TestProvider token.'
      );
    });

    it('should include provider name in error message', () => {
      vi.mocked(getApiKey).mockReturnValue(null);
      const service = new TestGraphQLService();

      expect(() => service.testGetApiToken()).toThrow(/TestProvider/);
    });
  });

  describe('getAuthHeaders', () => {
    it('should return Bearer auth header for bearer format', () => {
      vi.mocked(getApiKey).mockReturnValue('my-bearer-token');
      const service = new TestGraphQLService();

      const headers = service.testGetAuthHeaders();

      expect(headers).toEqual({
        Authorization: 'Bearer my-bearer-token',
      });
    });

    it('should return PRIVATE-TOKEN header for token format', () => {
      vi.mocked(getApiKey).mockReturnValue('my-private-token');
      const service = new TokenAuthService();

      const headers = service.testGetAuthHeaders();

      expect(headers).toEqual({
        'PRIVATE-TOKEN': 'my-private-token',
      });
    });
  });

  describe('executeQuery', () => {
    it('should execute GraphQL query with correct parameters', async () => {
      vi.mocked(getApiKey).mockReturnValue('test-token');
      vi.mocked(executeGraphQL).mockResolvedValue({ data: { user: { name: 'Test' } } });
      const service = new TestGraphQLService();

      const result = await service.executeQuery<{ data: { user: { name: string } } }>(
        '{ user { name } }',
        { id: '123' }
      );

      expect(executeGraphQL).toHaveBeenCalledWith(
        'https://api.test.com/graphql',
        '{ user { name } }',
        { id: '123' },
        { Authorization: 'Bearer test-token' },
        {
          maxRetries: 3,
          initialDelay: 1000,
          timeout: 30000,
        }
      );
      expect(result).toEqual({ data: { user: { name: 'Test' } } });
    });

    it('should use default empty variables when not provided', async () => {
      vi.mocked(getApiKey).mockReturnValue('test-token');
      vi.mocked(executeGraphQL).mockResolvedValue({ data: null });
      const service = new TestGraphQLService();

      await service.executeQuery('{ viewer { login } }');

      expect(executeGraphQL).toHaveBeenCalledWith(
        expect.any(String),
        '{ viewer { login } }',
        {},
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should rethrow HttpError as-is', async () => {
      vi.mocked(getApiKey).mockReturnValue('test-token');
      const actualHttpError = Object.assign(new Error('Not found'), {
        name: 'HttpError',
        status: 404,
        statusText: 'Not Found',
        url: 'https://api.test.com/graphql',
      });
      vi.mocked(executeGraphQL).mockRejectedValue(actualHttpError);
      const service = new TestGraphQLService();

      await expect(service.executeQuery('{ user { name } }')).rejects.toThrow('Not found');
    });

    it('should wrap generic errors with provider name', async () => {
      vi.mocked(getApiKey).mockReturnValue('test-token');
      vi.mocked(executeGraphQL).mockRejectedValue(new Error('Network failure'));
      const service = new TestGraphQLService();

      await expect(service.executeQuery('{ user { name } }')).rejects.toThrow(
        'TestProvider API error: Network failure'
      );
    });
  });

  describe('executeMutation', () => {
    it('should execute mutation with zero retries', async () => {
      vi.mocked(getApiKey).mockReturnValue('test-token');
      vi.mocked(executeGraphQL).mockResolvedValue({ data: { createUser: { id: '1' } } });
      const service = new TestGraphQLService();

      await service.executeMutation(
        'mutation { createUser(name: "Test") { id } }',
        { name: 'Test' }
      );

      expect(executeGraphQL).toHaveBeenCalledWith(
        'https://api.test.com/graphql',
        'mutation { createUser(name: "Test") { id } }',
        { name: 'Test' },
        { Authorization: 'Bearer test-token' },
        {
          maxRetries: 0,
          timeout: 30000,
        }
      );
    });

    it('should not retry mutations to avoid duplicates', async () => {
      vi.mocked(getApiKey).mockReturnValue('test-token');
      vi.mocked(executeGraphQL).mockResolvedValue({ data: null });
      const service = new TestGraphQLService();

      await service.executeMutation('mutation { deleteUser(id: "1") }');

      expect(executeGraphQL).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          maxRetries: 0,
        })
      );
    });

    it('should wrap generic errors with provider name for mutations', async () => {
      vi.mocked(getApiKey).mockReturnValue('test-token');
      vi.mocked(executeGraphQL).mockRejectedValue(new Error('Mutation failed'));
      const service = new TestGraphQLService();

      await expect(
        service.executeMutation('mutation { createUser }')
      ).rejects.toThrow('TestProvider API error: Mutation failed');
    });
  });

  describe('re-exported utilities', () => {
    it('should re-export HttpError', () => {
      expect(HttpError).toBeDefined();
    });

    it('should re-export GraphQLError', () => {
      expect(GraphQLError).toBeDefined();
    });

    it('should re-export getErrorMessage', () => {
      expect(getErrorMessage).toBeDefined();
    });

    it('should re-export isAuthError', () => {
      expect(isAuthError).toBeDefined();
    });

    it('should re-export isRateLimitError', () => {
      expect(isRateLimitError).toBeDefined();
    });
  });
});
