/**
 * GitLabProvider - Main GitLab provider implementation
 * Implements IGitProvider interface
 */

import type { IGitProvider } from '../interfaces';
import type { ProviderType } from '../../model/provider-types';
import { GitLabService } from './GitLabService';
import { GitLabPullRequestManager } from './managers/GitLabPullRequestManager';
import { GitLabReviewsManager } from './managers/GitLabReviewsManager';
import { GitLabCommentsManager } from './managers/GitLabCommentsManager';
import { GitLabChecksManager } from './managers/GitLabChecksManager';
import { GitLabActionsManager } from './managers/GitLabActionsManager';
import { isConfigured } from '../../stores/configStore';

/**
 * Supported operations for GitLab
 */
const GITLAB_SUPPORTED_OPERATIONS = new Set([
  'listPullRequests',
  'getPullRequestDetails',
  'getPRsToReview',
  'getMyPullRequests',
  'getReviews',
  'getComments',
  'getChecks',
  'approvePullRequest',
  'requestChanges',
  'addComment',
  'mergePullRequest',
  'graphql',
  'rest',
  'cicd',
  'codeReview',
  'draft',
]);

export class GitLabProvider implements IGitProvider {
  private static instance: GitLabProvider | null = null;

  readonly type: ProviderType = 'gitlab';

  private gitlabService: GitLabService;

  readonly pullRequests: GitLabPullRequestManager;
  readonly reviews: GitLabReviewsManager;
  readonly comments: GitLabCommentsManager;
  readonly checks: GitLabChecksManager;
  readonly actions: GitLabActionsManager;

  /**
   * Private constructor for singleton pattern
   * @param baseUrl - Optional base URL for self-hosted GitLab instances
   */
  private constructor(baseUrl?: string) {
    this.gitlabService = new GitLabService(baseUrl);
    this.pullRequests = new GitLabPullRequestManager(this.gitlabService);

    // Expose nested managers for direct access
    this.reviews = this.pullRequests.reviews;
    this.comments = this.pullRequests.comments;
    this.checks = this.pullRequests.checks;

    // Initialize actions manager
    this.actions = new GitLabActionsManager(this.gitlabService);
  }

  /**
   * Get singleton instance
   * @param baseUrl - Optional base URL for self-hosted GitLab
   */
  static getInstance(baseUrl?: string): GitLabProvider {
    if (!GitLabProvider.instance) {
      GitLabProvider.instance = new GitLabProvider(baseUrl);
    }
    return GitLabProvider.instance;
  }

  /**
   * Reset singleton instance (useful for testing or switching accounts)
   */
  static resetInstance(): void {
    if (GitLabProvider.instance) {
      GitLabProvider.instance.clearAllCaches();
      GitLabProvider.instance = null;
    }
  }

  /**
   * Create a new instance without using singleton (useful for testing)
   * @param baseUrl - Optional base URL for self-hosted GitLab
   */
  static create(baseUrl?: string): GitLabProvider {
    return new GitLabProvider(baseUrl);
  }

  /**
   * Check if the provider is ready (configured with valid credentials)
   */
  isReady(): boolean {
    return isConfigured();
  }

  /**
   * Clear all caches across all managers
   */
  clearAllCaches(): void {
    this.pullRequests.clearAllCaches();
  }

  /**
   * Check if the provider supports a specific operation
   */
  supportsOperation(operation: string): boolean {
    return GITLAB_SUPPORTED_OPERATIONS.has(operation);
  }
}

export default GitLabProvider;
