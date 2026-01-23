/**
 * GitLabService - Low-level API client for GitLab
 * Supports both GraphQL and REST APIs
 *
 * GitLab API endpoints:
 * - GraphQL: https://gitlab.com/api/graphql (or self-hosted)
 * - REST: https://gitlab.com/api/v4 (or self-hosted)
 */

import { configStore } from '../../stores/configStore';

const GITLAB_GRAPHQL_ENDPOINT = 'https://gitlab.com/api/graphql';
const GITLAB_REST_ENDPOINT = 'https://gitlab.com/api/v4';

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
   * Get the API token from configStore
   */
  private getApiToken(): string {
    const apiKey = configStore.apiKey;
    if (!apiKey) {
      throw new Error('API token not configured. Please set your GitLab token.');
    }
    return apiKey;
  }

  /**
   * Execute a GraphQL query
   */
  async executeQuery<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(this.graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getApiToken()}`,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`GitLab GraphQL Error: ${JSON.stringify(result.errors)}`);
    }

    return result;
  }

  /**
   * Execute a REST API call
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

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitLab REST API error: ${response.statusText} - ${errorText}`);
    }

    // Some endpoints return empty response
    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text);
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
