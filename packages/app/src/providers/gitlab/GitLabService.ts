/**
 * GitLabService - API client for GitLab
 * Extends BaseGraphQLService with GitLab-specific REST API support
 *
 * GitLab API endpoints:
 * - GraphQL: https://gitlab.com/api/graphql (or self-hosted)
 * - REST: https://gitlab.com/api/v4 (or self-hosted)
 */

import {
  BaseGraphQLService,
  HttpError,
  GraphQLError,
  getErrorMessage,
  isAuthError,
  isRateLimitError,
} from '../base/BaseGraphQLService';
import { fetchWithRetry } from '../../utils/http';

const GITLAB_GRAPHQL_ENDPOINT = 'https://gitlab.com/api/graphql';
const GITLAB_REST_ENDPOINT = 'https://gitlab.com/api/v4';

// Re-export error utilities for consumers
export { HttpError, GraphQLError, getErrorMessage, isAuthError, isRateLimitError };

export class GitLabService extends BaseGraphQLService {
  private restEndpoint: string;

  constructor(baseUrl?: string) {
    const graphqlEndpoint = baseUrl
      ? `${baseUrl}/api/graphql`
      : GITLAB_GRAPHQL_ENDPOINT;

    super({
      providerName: 'GitLab',
      endpoint: graphqlEndpoint,
      authFormat: 'bearer',
      queryRetries: 3,
      timeout: 30000,
    });

    this.restEndpoint = baseUrl
      ? `${baseUrl}/api/v4`
      : GITLAB_REST_ENDPOINT;
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
