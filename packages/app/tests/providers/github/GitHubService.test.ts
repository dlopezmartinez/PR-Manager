/**
 * Tests for GitHubService
 * Tests the GitHub-specific GraphQL service implementation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GitHubService,
  HttpError,
  GraphQLError,
  getErrorMessage,
  isAuthError,
  isRateLimitError,
} from '../../../src/providers/github/GitHubService';

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

describe('GitHubService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use default GitHub API endpoint', () => {
      vi.mocked(getApiKey).mockReturnValue('test-token');
      vi.mocked(executeGraphQL).mockResolvedValue({ data: null });

      const service = new GitHubService();
      service.executeQuery('{ viewer { login } }');

      expect(executeGraphQL).toHaveBeenCalledWith(
        'https://api.github.com/graphql',
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should allow custom endpoint for GitHub Enterprise', () => {
      vi.mocked(getApiKey).mockReturnValue('test-token');
      vi.mocked(executeGraphQL).mockResolvedValue({ data: null });

      const service = new GitHubService('https://github.mycompany.com/api/graphql');
      service.executeQuery('{ viewer { login } }');

      expect(executeGraphQL).toHaveBeenCalledWith(
        'https://github.mycompany.com/api/graphql',
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('executeQuery', () => {
    it('should execute query with Bearer authorization', async () => {
      vi.mocked(getApiKey).mockReturnValue('ghp_test_token_123');
      vi.mocked(executeGraphQL).mockResolvedValue({
        data: { viewer: { login: 'testuser' } },
      });

      const service = new GitHubService();
      const result = await service.executeQuery<{ data: { viewer: { login: string } } }>(
        '{ viewer { login } }'
      );

      expect(executeGraphQL).toHaveBeenCalledWith(
        'https://api.github.com/graphql',
        '{ viewer { login } }',
        {},
        { Authorization: 'Bearer ghp_test_token_123' },
        expect.objectContaining({
          maxRetries: 3,
          timeout: 30000,
        })
      );
      expect(result).toEqual({ data: { viewer: { login: 'testuser' } } });
    });

    it('should pass variables to GraphQL query', async () => {
      vi.mocked(getApiKey).mockReturnValue('test-token');
      vi.mocked(executeGraphQL).mockResolvedValue({ data: { repository: { name: 'test-repo' } } });

      const service = new GitHubService();
      await service.executeQuery(
        'query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { name } }',
        { owner: 'octocat', name: 'hello-world' }
      );

      expect(executeGraphQL).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { owner: 'octocat', name: 'hello-world' },
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should throw error when token is not configured', async () => {
      vi.mocked(getApiKey).mockReturnValue(null);

      const service = new GitHubService();

      await expect(service.executeQuery('{ viewer { login } }')).rejects.toThrow(
        'API token not configured. Please set your GitHub token.'
      );
    });
  });

  describe('executeMutation', () => {
    it('should execute mutation without retries', async () => {
      vi.mocked(getApiKey).mockReturnValue('test-token');
      vi.mocked(executeGraphQL).mockResolvedValue({
        data: { addComment: { id: '123' } },
      });

      const service = new GitHubService();
      await service.executeMutation(
        'mutation($input: AddCommentInput!) { addComment(input: $input) { id } }',
        { input: { body: 'Test comment', subjectId: 'PR_123' } }
      );

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
  });

  describe('error handling', () => {
    it('should include GitHub in error message for API errors', async () => {
      vi.mocked(getApiKey).mockReturnValue('test-token');
      vi.mocked(executeGraphQL).mockRejectedValue(new Error('Connection refused'));

      const service = new GitHubService();

      await expect(service.executeQuery('{ viewer { login } }')).rejects.toThrow(
        'GitHub API error: Connection refused'
      );
    });
  });

  describe('re-exported utilities', () => {
    it('should re-export HttpError for consumers', () => {
      expect(HttpError).toBeDefined();
      expect(typeof HttpError).toBe('function');
    });

    it('should re-export GraphQLError for consumers', () => {
      expect(GraphQLError).toBeDefined();
      expect(typeof GraphQLError).toBe('function');
    });

    it('should re-export getErrorMessage for consumers', () => {
      expect(getErrorMessage).toBeDefined();
      expect(typeof getErrorMessage).toBe('function');
    });

    it('should re-export isAuthError for consumers', () => {
      expect(isAuthError).toBeDefined();
      expect(typeof isAuthError).toBe('function');
    });

    it('should re-export isRateLimitError for consumers', () => {
      expect(isRateLimitError).toBeDefined();
      expect(typeof isRateLimitError).toBe('function');
    });
  });
});
