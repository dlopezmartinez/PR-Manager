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
}
