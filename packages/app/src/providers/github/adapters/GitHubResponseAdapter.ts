/**
 * GitHubResponseAdapter - Transforms GitHub API responses to normalized types
 *
 * For GitHub, this is mostly a 1:1 transformation since the model types
 * were originally designed for GitHub. Future providers (GitLab, Bitbucket)
 * will have more complex transformations.
 */

import type {
  PullRequest,
  PullRequestBasic,
  Review,
  Comment,
  StatusCheckRollup,
  PageInfo,
  RepositoryInfo,
} from '../../../model/types';

/**
 * GitHub API response types (raw responses before transformation)
 */
export interface GitHubSearchResponse {
  data: {
    search: {
      pageInfo: PageInfo;
      nodes: PullRequestBasic[];
    };
  };
}

export interface GitHubPRDetailsResponse {
  data: {
    repository: {
      pullRequest: PullRequest;
    };
  };
}

export interface GitHubReviewsResponse {
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

export interface GitHubCommentsResponse {
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

export interface GitHubChecksResponse {
  data: {
    repository: {
      pullRequest: {
        id: string;
        commits: {
          nodes: {
            commit: {
              statusCheckRollup: StatusCheckRollup | null;
            };
          }[];
        };
      };
    };
  };
}

export interface GitHubViewerResponse {
  data: {
    viewer: {
      login: string;
    };
  };
}

interface GitHubRepositoryNode {
  nameWithOwner: string;
  name: string;
  owner: {
    login: string;
  };
  description: string | null;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  stargazerCount: number;
  updatedAt: string;
}

export interface GitHubRepositoriesResponse {
  data: {
    viewer: {
      repositories: {
        nodes: GitHubRepositoryNode[];
        pageInfo: PageInfo;
      };
      organizations?: {
        nodes: {
          repositories: {
            nodes: GitHubRepositoryNode[];
          };
        }[];
      };
    };
  };
}

export interface GitHubSearchRepositoriesResponse {
  data: {
    search: {
      nodes: GitHubRepositoryNode[];
    };
  };
}

/**
 * GitHubResponseAdapter
 *
 * Transforms raw GitHub API responses into normalized application types.
 * Currently performs 1:1 transformations since types were designed for GitHub.
 */
export class GitHubResponseAdapter {
  /**
   * Transform search response to list result
   */
  static transformSearchResponse(response: GitHubSearchResponse): {
    prs: PullRequestBasic[];
    pageInfo: PageInfo;
  } {
    return {
      prs: response.data.search.nodes,
      pageInfo: response.data.search.pageInfo,
    };
  }

  /**
   * Transform PR details response
   */
  static transformPRDetails(response: GitHubPRDetailsResponse): PullRequest {
    return response.data.repository.pullRequest;
  }

  /**
   * Transform reviews response
   */
  static transformReviews(response: GitHubReviewsResponse): Review[] {
    return response.data.repository.pullRequest.reviews.nodes;
  }

  /**
   * Transform comments response (combines issue and review comments)
   */
  static transformComments(response: GitHubCommentsResponse): Comment[] {
    const issueComments = response.data.repository.pullRequest.comments.nodes;

    // Extract and flatten review comments
    const reviewComments = response.data.repository.pullRequest.reviews.nodes.flatMap(
      (review) => review.comments.nodes
    );

    // Combine and sort by date
    return [...issueComments, ...reviewComments].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  /**
   * Transform checks response
   */
  static transformChecks(response: GitHubChecksResponse): StatusCheckRollup | null {
    const commits = response.data.repository.pullRequest.commits.nodes;
    return commits.length > 0 ? commits[0].commit.statusCheckRollup : null;
  }

  /**
   * Transform viewer response to get current user
   */
  static transformViewer(response: GitHubViewerResponse): string {
    return response.data.viewer.login;
  }

  /**
   * Transform repositories response (includes personal repos + organization repos)
   */
  static transformRepositories(response: GitHubRepositoriesResponse): RepositoryInfo[] {
    const repoMap = new Map<string, RepositoryInfo>();

    // Add personal/collaborator repos
    for (const repo of response.data.viewer.repositories.nodes) {
      repoMap.set(repo.nameWithOwner, {
        nameWithOwner: repo.nameWithOwner,
        name: repo.name,
        owner: repo.owner.login,
        description: repo.description || undefined,
        isPrivate: repo.isPrivate,
        isFork: repo.isFork,
        isArchived: repo.isArchived,
        starCount: repo.stargazerCount,
        updatedAt: repo.updatedAt,
      });
    }

    // Add organization repos (deduplicate by nameWithOwner)
    if (response.data.viewer.organizations?.nodes) {
      for (const org of response.data.viewer.organizations.nodes) {
        for (const repo of org.repositories.nodes) {
          if (!repoMap.has(repo.nameWithOwner)) {
            repoMap.set(repo.nameWithOwner, {
              nameWithOwner: repo.nameWithOwner,
              name: repo.name,
              owner: repo.owner.login,
              description: repo.description || undefined,
              isPrivate: repo.isPrivate,
              isFork: repo.isFork,
              isArchived: repo.isArchived,
              starCount: repo.stargazerCount,
              updatedAt: repo.updatedAt,
            });
          }
        }
      }
    }

    // Sort by updatedAt (most recent first)
    return Array.from(repoMap.values()).sort(
      (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
    );
  }

  /**
   * Transform search repositories response
   */
  static transformSearchRepositories(response: GitHubSearchRepositoriesResponse): RepositoryInfo[] {
    return response.data.search.nodes.map((repo) => ({
      nameWithOwner: repo.nameWithOwner,
      name: repo.name,
      owner: repo.owner.login,
      description: repo.description || undefined,
      isPrivate: repo.isPrivate,
      isFork: repo.isFork,
      isArchived: repo.isArchived,
      starCount: repo.stargazerCount,
      updatedAt: repo.updatedAt,
    }));
  }
}
