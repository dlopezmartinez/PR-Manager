export interface Author {
  login: string;
  avatarUrl: string;
}

export interface Repository {
  nameWithOwner: string;
}

export interface RepositoryInfo {
  nameWithOwner: string;
  name: string;
  owner: string;
  description?: string;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  starCount?: number;
  updatedAt?: string;
}

export interface Label {
  name: string;
  color: string;
}

export type MyReviewStatus = 'author' | 'pending' | 'reviewed' | 'none';

export interface PullRequestBasic {
  id: string;
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  repository: Repository;
  author: Author;
  createdAt: string;
  updatedAt: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  headRefName?: string;
  baseRefName?: string;
  myReviewStatus?: MyReviewStatus;
  comments?: {
    totalCount: number;
    nodes?: Comment[];
  };
  reviews?: {
    nodes: {
      author?: Author;
      state?: string;
      comments: {
        totalCount: number;
      };
    }[];
  };
  commits?: {
    totalCount?: number;
    nodes: {
      commit: {
        statusCheckRollup?: {
          state: string;
          contexts?: {
            nodes: (CheckRun | StatusContext)[];
          };
        };
      };
    }[];
  };
  reviewRequests?: {
    nodes: {
      requestedReviewer: {
        __typename: string;
        login?: string;
        name?: string;
      };
    }[];
  };
}

// GitHub merge state status values
export type MergeStateStatus =
  | 'BEHIND'      // Branch is behind base branch
  | 'BLOCKED'     // Blocked by branch protection rules
  | 'CLEAN'       // Ready to merge - all rules satisfied
  | 'DIRTY'       // Has merge conflicts
  | 'DRAFT'       // Is a draft PR
  | 'HAS_HOOKS'   // Has pre-receive hooks
  | 'UNKNOWN'     // State is being calculated
  | 'UNSTABLE';   // Some checks failing but mergeable

export interface PullRequest extends PullRequestBasic {
  additions: number;
  deletions: number;
  changedFiles: number;
  mergeable: string;
  mergeStateStatus?: MergeStateStatus;
  reviews?: {
    totalCount: number;
    nodes: Review[];
  };
  comments?: {
    totalCount: number;
    nodes?: Comment[];
  };
  commits?: {
    totalCount?: number;
    nodes: Commit[];
  };
  labels: {
    nodes: Label[];
  };
}

export interface ReviewComment {
  id: string;
  body: string;
  createdAt: string;
  path?: string;
  position?: number;
}

export interface Review {
  id: string;
  author: Author;
  state: string;
  createdAt: string;
  body?: string;
  comments: {
    totalCount: number;
    nodes?: ReviewComment[];
  };
}

export interface Comment {
  id: string;
  author: Author;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface CheckRun {
  __typename: 'CheckRun';
  id: string;
  name: string;
  conclusion: string | null;
  status: string;
  detailsUrl?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface StatusContext {
  __typename: 'StatusContext';
  id: string;
  context: string;
  state: string;
  targetUrl?: string;
  createdAt?: string;
}

export type CheckContext = CheckRun | StatusContext;

export interface StatusCheckRollup {
  state: string;
  contexts: {
    totalCount: number;
    nodes: CheckContext[];
  };
}

export interface Commit {
  commit: {
    statusCheckRollup: StatusCheckRollup | null;
  };
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface PullRequestSearchResponse {
  data: {
    search: {
      pageInfo: PageInfo;
      nodes: PullRequestBasic[];
    };
  };
}

export interface PullRequestByIdResponse {
  data: {
    repository: {
      pullRequest: PullRequest;
    };
  };
}

export interface PullRequestReviewsResponse {
  data: {
    repository: {
      pullRequest: {
        id: string;
        reviews: {
          totalCount: number;
          nodes: Review[];
        };
      };
    };
  };
}

export interface PullRequestCommentsResponse {
  data: {
    repository: {
      pullRequest: {
        id: string;
        comments: {
          totalCount: number;
          nodes: Comment[];
        };
        reviews: {
          nodes: {
            comments: {
              nodes: Comment[];
            };
          }[];
        };
      };
    };
  };
}

export interface PullRequestChecksResponse {
  data: {
    repository: {
      pullRequest: {
        id: string;
        commits: {
          nodes: Commit[];
        };
      };
    };
  };
}
