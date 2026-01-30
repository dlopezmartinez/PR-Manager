/**
 * Tests for GitLabService
 * Tests the GitLab-specific service with both GraphQL and REST API support
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GitLabService,
  HttpError,
  GraphQLError,
  getErrorMessage,
  isAuthError,
  isRateLimitError,
  type GitLabRestMergeRequest,
} from '../../../src/providers/gitlab/GitLabService';

// Mock the configStore module
vi.mock('../../../src/stores/configStore', () => ({
  getApiKey: vi.fn(),
}));

// Mock the http module
vi.mock('../../../src/utils/http', () => ({
  executeGraphQL: vi.fn(),
  fetchWithRetry: vi.fn(),
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
import { executeGraphQL, fetchWithRetry } from '../../../src/utils/http';

describe('GitLabService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiKey).mockReturnValue('glpat-test-token-123');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should use default GitLab endpoints', async () => {
      vi.mocked(executeGraphQL).mockResolvedValue({ data: null });

      const service = new GitLabService();
      await service.executeQuery('{ currentUser { username } }');

      expect(executeGraphQL).toHaveBeenCalledWith(
        'https://gitlab.com/api/graphql',
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should allow custom base URL for self-hosted GitLab', async () => {
      vi.mocked(executeGraphQL).mockResolvedValue({ data: null });

      const service = new GitLabService('https://gitlab.mycompany.com');
      await service.executeQuery('{ currentUser { username } }');

      expect(executeGraphQL).toHaveBeenCalledWith(
        'https://gitlab.mycompany.com/api/graphql',
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('executeQuery', () => {
    it('should execute GraphQL query with Bearer authorization', async () => {
      vi.mocked(executeGraphQL).mockResolvedValue({
        data: { currentUser: { username: 'testuser' } },
      });

      const service = new GitLabService();
      const result = await service.executeQuery<{ data: { currentUser: { username: string } } }>(
        '{ currentUser { username } }'
      );

      expect(executeGraphQL).toHaveBeenCalledWith(
        'https://gitlab.com/api/graphql',
        '{ currentUser { username } }',
        {},
        { Authorization: 'Bearer glpat-test-token-123' },
        expect.objectContaining({
          maxRetries: 3,
          timeout: 30000,
        })
      );
      expect(result).toEqual({ data: { currentUser: { username: 'testuser' } } });
    });
  });

  describe('executeRest', () => {
    it('should execute GET request with retry', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ id: 1, title: 'Test MR' })),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      const result = await service.executeRest<{ id: number; title: string }>(
        'GET',
        '/projects/123/merge_requests/1'
      );

      expect(fetchWithRetry).toHaveBeenCalledWith(
        'https://gitlab.com/api/v4/projects/123/merge_requests/1',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'PRIVATE-TOKEN': 'glpat-test-token-123',
          }),
        }),
        expect.objectContaining({
          maxRetries: 3,
          timeout: 30000,
        })
      );
      expect(result).toEqual({ id: 1, title: 'Test MR' });
    });

    it('should execute POST request without retry', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ approved: true })),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      await service.executeRest('POST', '/projects/123/merge_requests/1/approve');

      expect(fetchWithRetry).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          maxRetries: 0,
        })
      );
    });

    it('should include body for POST requests', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ id: 1 })),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      await service.executeRest('POST', '/projects/123/merge_requests/1/notes', {
        body: 'Test comment',
      });

      expect(fetchWithRetry).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ body: 'Test comment' }),
        }),
        expect.any(Object)
      );
    });

    it('should include body for PUT requests', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ merged: true })),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      await service.executeRest('PUT', '/projects/123/merge_requests/1/merge', {
        squash: true,
      });

      expect(fetchWithRetry).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ squash: true }),
        }),
        expect.any(Object)
      );
    });

    it('should not include body for DELETE requests', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(''),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      await service.executeRest('DELETE', '/projects/123/merge_requests/1');

      expect(fetchWithRetry).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.objectContaining({
          body: expect.anything(),
        }),
        expect.any(Object)
      );
    });

    it('should handle empty response', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(''),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      const result = await service.executeRest<Record<string, unknown>>('POST', '/test');

      expect(result).toEqual({});
    });

    it('should throw HttpError on non-OK response', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: vi.fn().mockResolvedValue('Resource not found'),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();

      await expect(
        service.executeRest('GET', '/projects/999/merge_requests/1')
      ).rejects.toThrow('GitLab REST API error');
    });

    it('should wrap network errors', async () => {
      vi.mocked(fetchWithRetry).mockRejectedValue(new Error('Network error'));

      const service = new GitLabService();

      await expect(service.executeRest('GET', '/test')).rejects.toThrow(
        'GitLab REST API error: Network error'
      );
    });
  });

  describe('approveMergeRequest', () => {
    it('should approve a merge request', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(''),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      await service.approveMergeRequest('my-group/my-project', 42);

      expect(fetchWithRetry).toHaveBeenCalledWith(
        'https://gitlab.com/api/v4/projects/my-group%2Fmy-project/merge_requests/42/approve',
        expect.objectContaining({ method: 'POST' }),
        expect.any(Object)
      );
    });

    it('should URL-encode project ID with special characters', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(''),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      await service.approveMergeRequest('group/sub-group/project', 1);

      expect(fetchWithRetry).toHaveBeenCalledWith(
        expect.stringContaining('group%2Fsub-group%2Fproject'),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('unapproveMergeRequest', () => {
    it('should unapprove a merge request', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(''),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      await service.unapproveMergeRequest('my-project', 42);

      expect(fetchWithRetry).toHaveBeenCalledWith(
        'https://gitlab.com/api/v4/projects/my-project/merge_requests/42/unapprove',
        expect.objectContaining({ method: 'POST' }),
        expect.any(Object)
      );
    });
  });

  describe('getMergeRequestApprovals', () => {
    it('should get merge request approvals', async () => {
      const mockApprovals = {
        approved: true,
        approved_by: [{ user: { username: 'reviewer' } }],
      };
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify(mockApprovals)),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      const result = await service.getMergeRequestApprovals('my-project', 42);

      expect(fetchWithRetry).toHaveBeenCalledWith(
        'https://gitlab.com/api/v4/projects/my-project/merge_requests/42/approvals',
        expect.objectContaining({ method: 'GET' }),
        expect.any(Object)
      );
      expect(result).toEqual(mockApprovals);
    });
  });

  describe('acceptMergeRequest', () => {
    it('should merge a merge request', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ merged: true })),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      await service.acceptMergeRequest('my-project', 42);

      expect(fetchWithRetry).toHaveBeenCalledWith(
        'https://gitlab.com/api/v4/projects/my-project/merge_requests/42/merge',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            squash: false,
            squash_commit_message: undefined,
            merge_commit_message: undefined,
            should_remove_source_branch: undefined,
          }),
        }),
        expect.any(Object)
      );
    });

    it('should merge with squash option', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ merged: true })),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      await service.acceptMergeRequest('my-project', 42, {
        squash: true,
        squashCommitMessage: 'feat: squashed commit',
      });

      expect(fetchWithRetry).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"squash":true'),
        }),
        expect.any(Object)
      );
    });

    it('should merge with remove source branch option', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ merged: true })),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      await service.acceptMergeRequest('my-project', 42, {
        shouldRemoveSourceBranch: true,
      });

      expect(fetchWithRetry).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"should_remove_source_branch":true'),
        }),
        expect.any(Object)
      );
    });
  });

  describe('addMergeRequestNote', () => {
    it('should add a comment to merge request', async () => {
      const mockNote = {
        id: 123,
        body: 'Great work!',
        created_at: '2024-01-01T00:00:00Z',
        author: {
          id: 1,
          username: 'commenter',
          name: 'Test User',
          avatar_url: 'https://gitlab.com/avatar.png',
        },
      };
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify(mockNote)),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      const result = await service.addMergeRequestNote('my-project', 42, 'Great work!');

      expect(fetchWithRetry).toHaveBeenCalledWith(
        'https://gitlab.com/api/v4/projects/my-project/merge_requests/42/notes',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ body: 'Great work!' }),
        }),
        expect.any(Object)
      );
      expect(result).toEqual(mockNote);
    });
  });

  describe('listMergeRequests', () => {
    const mockMergeRequests: GitLabRestMergeRequest[] = [
      {
        id: 1,
        iid: 42,
        title: 'Test MR',
        description: 'Test description',
        state: 'opened',
        draft: false,
        web_url: 'https://gitlab.com/project/-/merge_requests/42',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        merged_at: null,
        source_branch: 'feature',
        target_branch: 'main',
        source_project_id: 123,
        target_project_id: 123,
        author: {
          id: 1,
          username: 'author',
          name: 'Test Author',
          avatar_url: 'https://gitlab.com/avatar.png',
        },
        reviewers: [],
        labels: [],
        milestone: null,
        merge_status: 'can_be_merged',
        has_conflicts: false,
        blocking_discussions_resolved: true,
        user_notes_count: 0,
        changes_count: '5',
        references: { full: 'project!42' },
      },
    ];

    it('should list merge requests with default options', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify(mockMergeRequests)),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      const result = await service.listMergeRequests({});

      expect(fetchWithRetry).toHaveBeenCalledWith(
        expect.stringContaining('https://gitlab.com/api/v4/merge_requests?'),
        expect.any(Object),
        expect.any(Object)
      );
      expect(result).toEqual(mockMergeRequests);
    });

    it('should filter by state', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify(mockMergeRequests)),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      await service.listMergeRequests({ state: 'merged' });

      expect(fetchWithRetry).toHaveBeenCalledWith(
        expect.stringContaining('state=merged'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should filter by scope', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify(mockMergeRequests)),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      await service.listMergeRequests({ scope: 'assigned_to_me' });

      expect(fetchWithRetry).toHaveBeenCalledWith(
        expect.stringContaining('scope=assigned_to_me'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should filter by author username', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify(mockMergeRequests)),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      await service.listMergeRequests({ authorUsername: 'johndoe' });

      expect(fetchWithRetry).toHaveBeenCalledWith(
        expect.stringContaining('author_username=johndoe'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should filter by labels', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify(mockMergeRequests)),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      await service.listMergeRequests({ labels: ['bug', 'urgent'] });

      expect(fetchWithRetry).toHaveBeenCalledWith(
        expect.stringContaining('labels=bug%2Curgent'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should filter by draft status', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify(mockMergeRequests)),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      await service.listMergeRequests({ draft: true });

      expect(fetchWithRetry).toHaveBeenCalledWith(
        expect.stringContaining('wip=yes'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should use project-specific endpoint when projectPath is provided', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify(mockMergeRequests)),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      await service.listMergeRequests({ projectPath: 'my-group/my-project' });

      expect(fetchWithRetry).toHaveBeenCalledWith(
        expect.stringContaining('/projects/my-group%2Fmy-project/merge_requests'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should include pagination options', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify(mockMergeRequests)),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      await service.listMergeRequests({ perPage: 50, page: 2 });

      expect(fetchWithRetry).toHaveBeenCalledWith(
        expect.stringMatching(/per_page=50.*page=2|page=2.*per_page=50/),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should include with_labels_details parameter', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify(mockMergeRequests)),
      };
      vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as unknown as Response);

      const service = new GitLabService();
      await service.listMergeRequests({});

      expect(fetchWithRetry).toHaveBeenCalledWith(
        expect.stringContaining('with_labels_details=true'),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('getBaseUrl', () => {
    it('should return base URL without /api/v4', () => {
      const service = new GitLabService();
      expect(service.getBaseUrl()).toBe('https://gitlab.com');
    });

    it('should work with custom base URL', () => {
      const service = new GitLabService('https://gitlab.mycompany.com');
      expect(service.getBaseUrl()).toBe('https://gitlab.mycompany.com');
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
