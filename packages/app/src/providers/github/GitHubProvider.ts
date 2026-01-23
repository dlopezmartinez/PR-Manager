/**
 * GitHubProvider - Main GitHub provider implementation
 * Implements IGitProvider interface
 */

import type { IGitProvider } from '../interfaces';
import type { ProviderType } from '../../model/provider-types';
import { GitHubService } from './GitHubService';
import { GitHubPullRequestManager } from './managers/GitHubPullRequestManager';
import { GitHubReviewsManager } from './managers/GitHubReviewsManager';
import { GitHubCommentsManager } from './managers/GitHubCommentsManager';
import { GitHubChecksManager } from './managers/GitHubChecksManager';
import { GitHubActionsManager } from './managers/GitHubActionsManager';
import { isConfigured } from '../../stores/configStore';

/**
 * Supported operations for GitHub
 */
const GITHUB_SUPPORTED_OPERATIONS = new Set([
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

export class GitHubProvider implements IGitProvider {
  private static instance: GitHubProvider | null = null;

  readonly type: ProviderType = 'github';

  private githubService: GitHubService;

  readonly pullRequests: GitHubPullRequestManager;
  readonly reviews: GitHubReviewsManager;
  readonly comments: GitHubCommentsManager;
  readonly checks: GitHubChecksManager;
  readonly actions: GitHubActionsManager;

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    this.githubService = new GitHubService();
    this.pullRequests = new GitHubPullRequestManager(this.githubService);

    // Expose nested managers for direct access
    this.reviews = this.pullRequests.reviews;
    this.comments = this.pullRequests.comments;
    this.checks = this.pullRequests.checks;

    // Initialize actions manager
    this.actions = new GitHubActionsManager(this.githubService);
  }

  /**
   * Get singleton instance
   */
  static getInstance(): GitHubProvider {
    if (!GitHubProvider.instance) {
      GitHubProvider.instance = new GitHubProvider();
    }
    return GitHubProvider.instance;
  }

  /**
   * Reset singleton instance (useful for testing or switching accounts)
   */
  static resetInstance(): void {
    if (GitHubProvider.instance) {
      GitHubProvider.instance.clearAllCaches();
      GitHubProvider.instance = null;
    }
  }

  /**
   * Create a new instance without using singleton (useful for testing)
   */
  static create(): GitHubProvider {
    return new GitHubProvider();
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
    return GITHUB_SUPPORTED_OPERATIONS.has(operation);
  }
}

export default GitHubProvider;
