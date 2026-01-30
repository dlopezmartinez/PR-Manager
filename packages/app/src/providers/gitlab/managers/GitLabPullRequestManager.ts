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
import {
  isGitLabStructuredQuery,
  parseGitLabQuery,
  convertLegacyQueryToGitLabFilter,
  type GitLabQueryFilter,
} from '../types/GitLabQueryTypes';

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
   * Supports two query formats:
   * 1. Structured JSON queries (preferred) - Start with '{' and contain GitLabQueryFilter
   * 2. Legacy GitHub-style queries - Automatically converted to structured format
   */
  async listPullRequests(query: string, limit = 20, after?: string): Promise<ListResult> {
    const currentUsername = await this.getCurrentUser();

    // Parse the query - either structured JSON or legacy format
    let filter: GitLabQueryFilter;

    if (isGitLabStructuredQuery(query)) {
      const parsed = parseGitLabQuery(query);
      if (!parsed) {
        return this.getMyPullRequests(undefined, limit, after);
      }
      filter = parsed;
    } else {
      filter = convertLegacyQueryToGitLabFilter(query);
    }

    // Replace {{username}} placeholder
    if (filter.authorUsername === '{{username}}') {
      filter.authorUsername = currentUsername;
    }
    if (filter.reviewerUsername === '{{username}}') {
      filter.reviewerUsername = currentUsername;
    }

    // Use REST API for complex filters
    const needsRestApi = Boolean(
      filter.projectPaths?.length ||
      filter.labels?.length ||
      filter.draft !== undefined ||
      filter.search ||
      filter.authorUsername ||
      filter.reviewerUsername
    );

    if (needsRestApi) {
      return this.listMergeRequestsWithFilter(filter, currentUsername, limit);
    }

    // Use GraphQL for simple queries
    if (filter.type === 'authored') {
      return this.getMyPullRequests(undefined, limit, after);
    } else if (filter.type === 'review-requested') {
      return this.getPRsToReview(undefined, limit, after);
    }

    return this.listMergeRequestsWithFilter(filter, currentUsername, limit);
  }

  /**
   * Execute a filtered merge request query using the REST API
   */
  private async listMergeRequestsWithFilter(
    filter: GitLabQueryFilter,
    currentUsername: string,
    limit: number
  ): Promise<ListResult> {
    if (filter.projectPaths && filter.projectPaths.length > 0) {
      return this.listMergeRequestsFromProjects(filter, limit);
    }

    let scope: 'created_by_me' | 'assigned_to_me' | 'all' | undefined;
    if (filter.type === 'authored' && !filter.authorUsername) {
      scope = 'created_by_me';
    } else if (filter.type === 'review-requested' && !filter.reviewerUsername) {
      filter.reviewerUsername = currentUsername;
      scope = 'all';
    } else {
      scope = 'all';
    }

    let orderBy: 'created_at' | 'updated_at' = 'updated_at';
    let sort: 'asc' | 'desc' = 'desc';

    if (filter.orderBy) {
      if (filter.orderBy.startsWith('created')) orderBy = 'created_at';
      if (filter.orderBy.endsWith('_asc')) sort = 'asc';
    }

    const mrs = await this.gitlabService.listMergeRequests({
      state: filter.state || 'opened',
      scope,
      authorUsername: filter.authorUsername,
      reviewerUsername: filter.reviewerUsername,
      labels: filter.labels,
      draft: filter.draft,
      orderBy,
      sort,
      perPage: limit,
      search: filter.search,
    });

    const baseUrl = this.gitlabService.getBaseUrl();
    const prs = GitLabResponseAdapter.transformRestMergeRequests(mrs, baseUrl);

    return {
      prs,
      pageInfo: {
        hasNextPage: mrs.length === limit,
        endCursor: mrs.length > 0 ? String(mrs.length) : null,
      },
    };
  }

  /**
   * Query merge requests from specific projects
   */
  private async listMergeRequestsFromProjects(
    filter: GitLabQueryFilter,
    limit: number
  ): Promise<ListResult> {
    if (!filter.projectPaths || filter.projectPaths.length === 0) {
      return { prs: [], pageInfo: { hasNextPage: false, endCursor: null } };
    }

    let orderBy: 'created_at' | 'updated_at' = 'updated_at';
    let sort: 'asc' | 'desc' = 'desc';

    if (filter.orderBy) {
      if (filter.orderBy.startsWith('created')) orderBy = 'created_at';
      if (filter.orderBy.endsWith('_asc')) sort = 'asc';
    }

    const perProjectLimit = Math.ceil(limit / filter.projectPaths.length);
    const projectPromises = filter.projectPaths.map((projectPath) =>
      this.gitlabService.listMergeRequests({
        state: filter.state || 'opened',
        projectPath,
        authorUsername: filter.authorUsername,
        reviewerUsername: filter.reviewerUsername,
        labels: filter.labels,
        draft: filter.draft,
        orderBy,
        sort,
        perPage: perProjectLimit,
        search: filter.search,
      }).catch((): never[] => [])
    );

    const results = await Promise.all(projectPromises);
    const allMrs = results.flat();

    allMrs.sort((a, b) => {
      const dateA = new Date(orderBy === 'created_at' ? a.created_at : a.updated_at);
      const dateB = new Date(orderBy === 'created_at' ? b.created_at : b.updated_at);
      return sort === 'desc' ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
    });

    const limitedMrs = allMrs.slice(0, limit);
    const baseUrl = this.gitlabService.getBaseUrl();
    const prs = GitLabResponseAdapter.transformRestMergeRequests(limitedMrs, baseUrl);

    return {
      prs,
      pageInfo: {
        hasNextPage: allMrs.length > limit,
        endCursor: limitedMrs.length > 0 ? String(limitedMrs.length) : null,
      },
    };
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
  async getPRsToReview(_username?: string, limit = 20, after?: string): Promise<ListResult> {
    const result = await this.gitlabService.executeQuery<GitLabMRListResponse>(
      MERGE_REQUESTS_LIST_QUERY,
      {
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
  async getMyPullRequests(_username?: string, limit = 20, after?: string): Promise<ListResult> {
    const result = await this.gitlabService.executeQuery<GitLabMRListResponse>(
      MY_MERGE_REQUESTS_QUERY,
      {
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
