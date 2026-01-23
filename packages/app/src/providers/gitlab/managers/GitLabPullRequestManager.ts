/**
 * GitLabPullRequestManager - Manages merge request operations for GitLab
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
import { GitLabService } from '../GitLabService';
import { GitLabReviewsManager } from './GitLabReviewsManager';
import { GitLabCommentsManager } from './GitLabCommentsManager';
import { GitLabChecksManager } from './GitLabChecksManager';
import {
  MERGE_REQUESTS_LIST_QUERY,
  MY_MERGE_REQUESTS_QUERY,
  MR_DETAILS_QUERY,
  CURRENT_USER_QUERY,
  USER_PROJECTS_QUERY,
} from '../queries/mergeRequests';
import type {
  GitLabMRListResponse,
  GitLabMRDetailsResponse,
  GitLabCurrentUserResponse,
  GitLabProjectsResponse,
} from '../adapters/GitLabResponseAdapter';
import { GitLabResponseAdapter } from '../adapters/GitLabResponseAdapter';

export class GitLabPullRequestManager implements IPullRequestManager {
  private gitlabService: GitLabService;
  private prsCache: Map<string, PullRequest> = new Map();
  private currentUser: string | null = null;

  public reviews: GitLabReviewsManager;
  public comments: GitLabCommentsManager;
  public checks: GitLabChecksManager;

  constructor(gitlabService: GitLabService) {
    this.gitlabService = gitlabService;
    this.reviews = new GitLabReviewsManager(gitlabService);
    this.comments = new GitLabCommentsManager(gitlabService);
    this.checks = new GitLabChecksManager(gitlabService);
  }

  /**
   * Get the authenticated user's username
   */
  async getCurrentUser(): Promise<string> {
    if (this.currentUser) return this.currentUser;

    const result = await this.gitlabService.executeQuery<GitLabCurrentUserResponse>(
      CURRENT_USER_QUERY
    );
    this.currentUser = GitLabResponseAdapter.transformCurrentUser(result);
    return this.currentUser;
  }

  /**
   * List merge requests based on a search query
   *
   * Note: GitLab's GraphQL API doesn't support arbitrary search queries like GitHub.
   * We map common query patterns to specific GitLab queries.
   */
  async listPullRequests(query: string, limit = 20, after?: string): Promise<ListResult> {
    // Parse the query to determine what type of MRs to fetch
    const isAuthorQuery = query.includes('author:');
    const isReviewQuery = query.includes('review-requested:') || query.includes('reviewer:');

    // Extract username from query if present
    let username = '';
    const authorMatch = query.match(/author:(\S+)/);
    const reviewerMatch = query.match(/(?:review-requested:|reviewer:)(\S+)/);

    if (authorMatch) {
      username = authorMatch[1].replace('@me', '');
    } else if (reviewerMatch) {
      username = reviewerMatch[1].replace('@me', '');
    }

    // Determine state filter (currently we always use 'opened' for simplicity)
    const isOpenOnly = query.includes('is:open') || query.includes('state:opened');
    // Note: state filter will be used in future when we support closed MRs
    void isOpenOnly; // Suppress unused variable warning

    if (isAuthorQuery || (!isReviewQuery && !isAuthorQuery)) {
      // Default to authored MRs if no specific query type
      return this.getMyPullRequests(username || undefined, limit, after);
    } else {
      // Review requested
      return this.getPRsToReview(username || undefined, limit, after);
    }
  }

  /**
   * Get detailed information for a specific merge request
   */
  async getPullRequestDetails(
    owner: string,
    repo: string,
    prNumber: number,
    useCache = true
  ): Promise<PullRequest> {
    const projectPath = `${owner}/${repo}`;
    const cacheKey = `${projectPath}/${prNumber}`;

    if (useCache && this.prsCache.has(cacheKey)) {
      return this.prsCache.get(cacheKey)!;
    }

    const result = await this.gitlabService.executeQuery<GitLabMRDetailsResponse>(MR_DETAILS_QUERY, {
      projectPath,
      iid: String(prNumber),
    });

    const pr = GitLabResponseAdapter.transformMergeRequestFull(result.data.project.mergeRequest);

    this.prsCache.set(cacheKey, pr);
    return pr;
  }

  /**
   * Get merge requests awaiting review from the specified user
   */
  async getPRsToReview(username?: string, limit = 20, after?: string): Promise<ListResult> {
    const user = username || (await this.getCurrentUser());

    const result = await this.gitlabService.executeQuery<GitLabMRListResponse>(
      MERGE_REQUESTS_LIST_QUERY,
      {
        username: user,
        state: 'opened',
        first: limit,
        after,
      }
    );

    return GitLabResponseAdapter.transformListResponse(result, 'review');
  }

  /**
   * Get merge requests authored by the specified user
   */
  async getMyPullRequests(username?: string, limit = 20, after?: string): Promise<ListResult> {
    const user = username || (await this.getCurrentUser());

    const result = await this.gitlabService.executeQuery<GitLabMRListResponse>(
      MY_MERGE_REQUESTS_QUERY,
      {
        username: user,
        state: 'opened',
        first: limit,
        after,
      }
    );

    return GitLabResponseAdapter.transformListResponse(result, 'authored');
  }

  /**
   * Extract owner and repo from project fullPath
   * GitLab uses "group/subgroup/project" format
   */
  private parseRepository(fullPath: string): { owner: string; repo: string } {
    const parts = fullPath.split('/');
    const repo = parts.pop() || '';
    const owner = parts.join('/');
    return { owner, repo };
  }

  /**
   * Load reviews for a specific MR (lazy loading)
   */
  async loadReviews(pr: PullRequestBasic): Promise<Review[]> {
    const { owner, repo } = this.parseRepository(pr.repository.nameWithOwner);
    return this.reviews.getReviews(owner, repo, pr.number);
  }

  /**
   * Load comments for a specific MR (lazy loading)
   */
  async loadComments(pr: PullRequestBasic): Promise<Comment[]> {
    const { owner, repo } = this.parseRepository(pr.repository.nameWithOwner);
    return this.comments.getComments(owner, repo, pr.number);
  }

  /**
   * Load CI/CD pipeline status for a specific MR (lazy loading)
   */
  async loadChecks(pr: PullRequestBasic): Promise<StatusCheckRollup | null> {
    const { owner, repo } = this.parseRepository(pr.repository.nameWithOwner);
    return this.checks.getChecks(owner, repo, pr.number);
  }

  /**
   * Load all details for a MR in parallel (lazy loading)
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
   * Get projects (repositories) the user has access to
   */
  async getRepositories(searchTerm?: string, limit = 50): Promise<RepositoryInfo[]> {
    const result = await this.gitlabService.executeQuery<GitLabProjectsResponse>(
      USER_PROJECTS_QUERY,
      {
        first: limit,
        search: searchTerm && searchTerm.trim().length > 0 ? searchTerm : null,
      }
    );
    return GitLabResponseAdapter.transformProjects(result);
  }
}
