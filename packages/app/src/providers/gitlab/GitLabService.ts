/**
 * GitLabService - Low-level API client for GitLab
 * Supports both GraphQL and REST APIs with retry logic
 *
 * GitLab API endpoints:
 * - GraphQL: https://gitlab.com/api/graphql (or self-hosted)
 * - REST: https://gitlab.com/api/v4 (or self-hosted)
 */

import { getApiKey } from '../../stores/configStore';
import {
  executeGraphQL,
  fetchWithRetry,
  HttpError,
  GraphQLError,
  getErrorMessage,
  isAuthError,
  isRateLimitError,
} from '../../utils/http';

const GITLAB_GRAPHQL_ENDPOINT = 'https://gitlab.com/api/graphql';
const GITLAB_REST_ENDPOINT = 'https://gitlab.com/api/v4';

// Re-export error utilities for consumers
export { HttpError, GraphQLError, getErrorMessage, isAuthError, isRateLimitError };

export class GitLabService {
  private graphqlEndpoint: string;
  private restEndpoint: string;

  constructor(baseUrl?: string) {
    if (baseUrl) {
      // Self-hosted GitLab
      this.graphqlEndpoint = `${baseUrl}/api/graphql`;
      this.restEndpoint = `${baseUrl}/api/v4`;
    } else {
      this.graphqlEndpoint = GITLAB_GRAPHQL_ENDPOINT;
      this.restEndpoint = GITLAB_REST_ENDPOINT;
    }
  }

  /**
   * Get the API token from secure storage
   */
  private getApiToken(): string {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('API token not configured. Please set your GitLab token.');
    }
    return apiKey;
  }

  /**
   * Execute a GraphQL query with automatic retry on transient failures
   *
   * Features:
   * - Automatic retry on 5xx errors, timeouts, and network issues
   * - Exponential backoff with jitter
   * - Proper error typing (HttpError, GraphQLError)
   * - User-friendly error messages
   */
  async executeQuery<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    try {
      return await executeGraphQL<T>(
        this.graphqlEndpoint,
        query,
        variables,
        {
          'Authorization': `Bearer ${this.getApiToken()}`,
        },
        {
          maxRetries: 3,
          initialDelay: 1000,
          timeout: 30000,
        }
      );
    } catch (error) {
      // Re-throw with better context if needed
      if (error instanceof HttpError || error instanceof GraphQLError) {
        throw error;
      }

      // Wrap unknown errors
      throw new Error(`GitLab API error: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Execute a mutation (typically no retry for mutations to avoid duplicates)
   */
  async executeMutation<T>(
    mutation: string,
    variables: Record<string, unknown> = {}
  ): Promise<T> {
    try {
      return await executeGraphQL<T>(
        this.graphqlEndpoint,
        mutation,
        variables,
        {
          'Authorization': `Bearer ${this.getApiToken()}`,
        },
        {
          maxRetries: 0, // No retry for mutations
          timeout: 30000,
        }
      );
    } catch (error) {
      if (error instanceof HttpError || error instanceof GraphQLError) {
        throw error;
      }
      throw new Error(`GitLab API error: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Execute a REST API call with retry support
   * Used for operations not available in GraphQL (like approvals)
   */
  async executeRest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.restEndpoint}${path}`;

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'PRIVATE-TOKEN': this.getApiToken(),
      },
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    try {
      // Use retry for GET requests, no retry for mutations
      const retryOptions = method === 'GET'
        ? { maxRetries: 3, initialDelay: 1000, timeout: 30000 }
        : { maxRetries: 0, timeout: 30000 };

      const response = await fetchWithRetry(url, options, retryOptions);

      if (!response.ok) {
        const errorText = await response.text();
        throw new HttpError(
          `GitLab REST API error: ${response.statusText} - ${errorText}`,
          response.status,
          response.statusText,
          url
        );
      }

      // Some endpoints return empty response
      const text = await response.text();
      if (!text) {
        return {} as T;
      }

      return JSON.parse(text);
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      throw new Error(`GitLab REST API error: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Approve a merge request (REST API only)
   */
  async approveMergeRequest(projectId: string, mergeRequestIid: number): Promise<void> {
    const encodedProjectId = encodeURIComponent(projectId);
    await this.executeRest(
      'POST',
      `/projects/${encodedProjectId}/merge_requests/${mergeRequestIid}/approve`
    );
  }

  /**
   * Unapprove a merge request (REST API only)
   */
  async unapproveMergeRequest(projectId: string, mergeRequestIid: number): Promise<void> {
    const encodedProjectId = encodeURIComponent(projectId);
    await this.executeRest(
      'POST',
      `/projects/${encodedProjectId}/merge_requests/${mergeRequestIid}/unapprove`
    );
  }

  /**
   * Get merge request approvals (REST API)
   */
  async getMergeRequestApprovals(projectId: string, mergeRequestIid: number): Promise<unknown> {
    const encodedProjectId = encodeURIComponent(projectId);
    return this.executeRest(
      'GET',
      `/projects/${encodedProjectId}/merge_requests/${mergeRequestIid}/approvals`
    );
  }

  /**
   * Accept (merge) a merge request (REST API)
   */
  async acceptMergeRequest(
    projectId: string,
    mergeRequestIid: number,
    options?: {
      squash?: boolean;
      squashCommitMessage?: string;
      mergeCommitMessage?: string;
      shouldRemoveSourceBranch?: boolean;
    }
  ): Promise<unknown> {
    const encodedProjectId = encodeURIComponent(projectId);
    return this.executeRest(
      'PUT',
      `/projects/${encodedProjectId}/merge_requests/${mergeRequestIid}/merge`,
      {
        squash: options?.squash ?? false,
        squash_commit_message: options?.squashCommitMessage,
        merge_commit_message: options?.mergeCommitMessage,
        should_remove_source_branch: options?.shouldRemoveSourceBranch,
      }
    );
  }

  /**
   * Add a note (comment) to a merge request (REST API)
   */
  async addMergeRequestNote(
    projectId: string,
    mergeRequestIid: number,
    body: string
  ): Promise<{
    id: number;
    body: string;
    created_at: string;
    author: {
      id: number;
      username: string;
      name: string;
      avatar_url: string;
    };
  }> {
    const encodedProjectId = encodeURIComponent(projectId);
    return this.executeRest(
      'POST',
      `/projects/${encodedProjectId}/merge_requests/${mergeRequestIid}/notes`,
      { body }
    );
  }

  /**
   * List merge requests with flexible filtering (REST API)
   */
  async listMergeRequests(options: {
    state?: 'opened' | 'closed' | 'merged' | 'all';
    scope?: 'created_by_me' | 'assigned_to_me' | 'all';
    authorUsername?: string;
    reviewerUsername?: string;
    labels?: string[];
    projectPath?: string;
    draft?: boolean;
    orderBy?: 'created_at' | 'updated_at';
    sort?: 'asc' | 'desc';
    perPage?: number;
    page?: number;
    search?: string;
  }): Promise<GitLabRestMergeRequest[]> {
    const params = new URLSearchParams();

    if (options.state) params.append('state', options.state);
    if (options.scope) params.append('scope', options.scope);
    if (options.authorUsername) params.append('author_username', options.authorUsername);
    if (options.reviewerUsername) params.append('reviewer_username', options.reviewerUsername);
    if (options.labels && options.labels.length > 0) {
      params.append('labels', options.labels.join(','));
    }
    if (options.draft !== undefined) {
      params.append('wip', options.draft ? 'yes' : 'no');
    }
    if (options.orderBy) params.append('order_by', options.orderBy);
    if (options.sort) params.append('sort', options.sort);
    if (options.perPage) params.append('per_page', String(options.perPage));
    if (options.page) params.append('page', String(options.page));
    if (options.search) params.append('search', options.search);
    params.append('with_labels_details', 'true');

    let path: string;
    if (options.projectPath) {
      const encodedProjectId = encodeURIComponent(options.projectPath);
      path = `/projects/${encodedProjectId}/merge_requests?${params.toString()}`;
    } else {
      path = `/merge_requests?${params.toString()}`;
    }

    return this.executeRest<GitLabRestMergeRequest[]>('GET', path);
  }

  /**
   * Get the base URL for the REST API
   */
  getBaseUrl(): string {
    return this.restEndpoint.replace('/api/v4', '');
  }
}

/**
 * GitLab REST API Merge Request type
 */
export interface GitLabRestMergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string | null;
  state: 'opened' | 'closed' | 'merged' | 'locked';
  draft: boolean;
  web_url: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  source_branch: string;
  target_branch: string;
  source_project_id: number;
  target_project_id: number;
  author: {
    id: number;
    username: string;
    name: string;
    avatar_url: string;
  };
  reviewers: Array<{
    id: number;
    username: string;
    name: string;
    avatar_url: string;
  }>;
  labels: Array<{
    id: number;
    name: string;
    color: string;
    description: string | null;
  }> | string[];
  milestone: {
    id: number;
    title: string;
  } | null;
  merge_status: string;
  detailed_merge_status?: string;
  has_conflicts: boolean;
  blocking_discussions_resolved: boolean;
  user_notes_count: number;
  changes_count: string | null;
  references: {
    full: string;
  };
  head_pipeline?: {
    id: number;
    status: string;
  } | null;
}
