/**
 * GitHubPullRequestManager - Manages pull request operations for GitHub
 * Implements IPullRequestManager interface
 */

import type {
  PullRequest,
  PullRequestBasic,
  Review,
  Comment,
  StatusCheckRollup,
  RepositoryInfo,
} from '../../../model/types';
import type { IPullRequestManager, ListResult, EnrichedPullRequest } from '../../interfaces';
import { GitHubService } from '../GitHubService';
import { GitHubReviewsManager } from './GitHubReviewsManager';
import { GitHubCommentsManager } from './GitHubCommentsManager';
import { GitHubChecksManager } from './GitHubChecksManager';
import { PULL_REQUESTS_LIST_QUERY, PR_DETAILS_BY_ID_QUERY, USER_REPOSITORIES_QUERY, SEARCH_REPOSITORIES_QUERY } from '../queries/pullRequests';
import type { GitHubSearchResponse, GitHubPRDetailsResponse, GitHubViewerResponse, GitHubRepositoriesResponse, GitHubSearchRepositoriesResponse } from '../adapters/GitHubResponseAdapter';
import { GitHubResponseAdapter } from '../adapters/GitHubResponseAdapter';

export class GitHubPullRequestManager implements IPullRequestManager {
  private githubService: GitHubService;
  private prsCache: Map<string, PullRequest> = new Map();
  private currentUser: string | null = null;

  public reviews: GitHubReviewsManager;
  public comments: GitHubCommentsManager;
  public checks: GitHubChecksManager;

  constructor(githubService: GitHubService) {
    this.githubService = githubService;
    this.reviews = new GitHubReviewsManager(githubService);
    this.comments = new GitHubCommentsManager(githubService);
    this.checks = new GitHubChecksManager(githubService);
  }

  /**
   * Get the authenticated user's username
   */
  async getCurrentUser(): Promise<string> {
    if (this.currentUser) return this.currentUser;

    const query = `
      query {
        viewer {
          login
        }
      }
    `;
    const result = await this.githubService.executeQuery<GitHubViewerResponse>(query);
    this.currentUser = GitHubResponseAdapter.transformViewer(result);
    return this.currentUser;
  }

  /**
   * List pull requests based on a search query
   */
  async listPullRequests(query: string, limit = 20, after?: string): Promise<ListResult> {
    const result = await this.githubService.executeQuery<GitHubSearchResponse>(
      PULL_REQUESTS_LIST_QUERY,
      { query, limit, after }
    );
    return GitHubResponseAdapter.transformSearchResponse(result);
  }

  /**
   * Get detailed information for a specific pull request
   */
  async getPullRequestDetails(
    owner: string,
    repo: string,
    prNumber: number,
    useCache = true
  ): Promise<PullRequest> {
    const cacheKey = `${owner}/${repo}/${prNumber}`;

    if (useCache && this.prsCache.has(cacheKey)) {
      return this.prsCache.get(cacheKey)!;
    }

    const result = await this.githubService.executeQuery<GitHubPRDetailsResponse>(
      PR_DETAILS_BY_ID_QUERY,
      { owner, repo, number: prNumber }
    );
    const pr = GitHubResponseAdapter.transformPRDetails(result);

    this.prsCache.set(cacheKey, pr);
    return pr;
  }

  /**
   * Get pull requests awaiting review from the specified user
   */
  async getPRsToReview(username?: string, limit = 20, after?: string): Promise<ListResult> {
    const userTarget = username || '@me';
    const query = `is:pr is:open review-requested:${userTarget}`;
    return this.listPullRequests(query, limit, after);
  }

  /**
   * Get pull requests authored by the specified user
   */
  async getMyPullRequests(username?: string, limit = 20, after?: string): Promise<ListResult> {
    const userTarget = username || '@me';
    const query = `is:pr is:open author:${userTarget}`;
    return this.listPullRequests(query, limit, after);
  }

  /**
   * Extract owner and repo from nameWithOwner
   */
  private parseRepository(nameWithOwner: string): { owner: string; repo: string } {
    const [owner, repo] = nameWithOwner.split('/');
    return { owner, repo };
  }

  /**
   * Load reviews for a specific PR (lazy loading)
   */
  async loadReviews(pr: PullRequestBasic): Promise<Review[]> {
    const { owner, repo } = this.parseRepository(pr.repository.nameWithOwner);
    return this.reviews.getReviews(owner, repo, pr.number);
  }

  /**
   * Load comments for a specific PR (lazy loading)
   */
  async loadComments(pr: PullRequestBasic): Promise<Comment[]> {
    const { owner, repo } = this.parseRepository(pr.repository.nameWithOwner);
    return this.comments.getComments(owner, repo, pr.number);
  }

  /**
   * Load CI/CD checks for a specific PR (lazy loading)
   */
  async loadChecks(pr: PullRequestBasic): Promise<StatusCheckRollup | null> {
    const { owner, repo } = this.parseRepository(pr.repository.nameWithOwner);
    return this.checks.getChecks(owner, repo, pr.number);
  }

  /**
   * Load all details for a PR in parallel (lazy loading)
   */
  async enrichPullRequest(pr: PullRequestBasic): Promise<EnrichedPullRequest> {
    const [reviews, comments, checks] = await Promise.all([
      this.loadReviews(pr),
      this.loadComments(pr),
      this.loadChecks(pr),
    ]);

    return { pr, reviews, comments, checks };
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.prsCache.clear();
    this.reviews.clearCache();
    this.comments.clearCache();
    this.checks.clearCache();
  }

  /**
   * Get repositories the user has access to
   * If searchTerm is provided, performs a search across all GitHub
   * Otherwise, returns user's affiliated repositories
   */
  async getRepositories(searchTerm?: string, limit = 50): Promise<RepositoryInfo[]> {
    if (searchTerm && searchTerm.trim().length > 0) {
      // Search repositories by name
      const query = `${searchTerm} in:name fork:true`;
      const result = await this.githubService.executeQuery<GitHubSearchRepositoriesResponse>(
        SEARCH_REPOSITORIES_QUERY,
        { query, limit }
      );
      return GitHubResponseAdapter.transformSearchRepositories(result);
    }

    // Get user's affiliated repositories
    const result = await this.githubService.executeQuery<GitHubRepositoriesResponse>(
      USER_REPOSITORIES_QUERY,
      { limit }
    );
    return GitHubResponseAdapter.transformRepositories(result);
  }
}
