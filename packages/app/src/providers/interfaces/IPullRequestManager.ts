import type {
  PullRequest,
  PullRequestBasic,
  PageInfo,
  Review,
  Comment,
  StatusCheckRollup,
  RepositoryInfo,
} from '../../model/types';

export interface ListResult {
  prs: PullRequestBasic[];
  pageInfo: PageInfo;
}

export interface EnrichedPullRequest {
  pr: PullRequestBasic;
  reviews: Review[];
  comments: Comment[];
  checks: StatusCheckRollup | null;
}

export interface IPullRequestManager {
  getCurrentUser(): Promise<string>;
  listPullRequests(query: string, limit?: number, after?: string): Promise<ListResult>;
  getPullRequestDetails(
    owner: string,
    repo: string,
    prNumber: number,
    useCache?: boolean
  ): Promise<PullRequest>;
  getPRsToReview(username?: string, limit?: number, after?: string): Promise<ListResult>;
  getMyPullRequests(username?: string, limit?: number, after?: string): Promise<ListResult>;
  loadReviews(pr: PullRequestBasic): Promise<Review[]>;
  loadComments(pr: PullRequestBasic): Promise<Comment[]>;
  loadChecks(pr: PullRequestBasic): Promise<StatusCheckRollup | null>;
  enrichPullRequest(pr: PullRequestBasic): Promise<EnrichedPullRequest>;
  clearAllCaches(): void;
  getRepositories(searchTerm?: string, limit?: number): Promise<RepositoryInfo[]>;
}
