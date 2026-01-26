/**
 * GitLabResponseAdapter - Transforms GitLab API responses to normalized types
 *
 * Handles the mapping between GitLab concepts and our normalized types:
 * - Merge Request → PullRequest
 * - Pipeline → StatusCheckRollup
 * - Discussions/Notes → Reviews/Comments
 * - Approvals → Review states
 */

import type {
  PullRequest,
  PullRequestBasic,
  Review,
  Comment,
  StatusCheckRollup,
  CheckRun,
  PageInfo,
  Author,
  Label,
  RepositoryInfo,
} from '../../../model/types';

// ===== GitLab API Types =====

export interface GitLabUser {
  id: string;
  username: string;
  name: string;
  avatarUrl?: string;
}

export interface GitLabProject {
  id: string;
  fullPath: string;
  webUrl?: string;
}

export interface GitLabLabel {
  id: string;
  title: string;
  color: string;
}

export interface GitLabDiffStats {
  additions: number;
  deletions: number;
  fileCount: number;
}

export interface GitLabPipelineStatus {
  label: string;
  group: string;
  icon?: string;
  text?: string;
}

export interface GitLabJob {
  id: string;
  name: string;
  status: string;
  detailedStatus?: GitLabPipelineStatus;
  webPath?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface GitLabStage {
  id: string;
  name: string;
  status: string;
  detailedStatus?: GitLabPipelineStatus;
  jobs?: {
    nodes: GitLabJob[];
  };
}

export interface GitLabPipeline {
  id: string;
  iid?: string;
  status: string;
  detailedStatus?: GitLabPipelineStatus;
  stages?: {
    nodes: GitLabStage[];
  };
}

export interface GitLabReviewerInteraction {
  reviewState?: 'UNREVIEWED' | 'REVIEWED' | 'REQUESTED_CHANGES';
}

export interface GitLabReviewer extends GitLabUser {
  mergeRequestInteraction?: GitLabReviewerInteraction;
}

export interface GitLabNote {
  id: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
  system: boolean;
  resolvable?: boolean;
  resolved?: boolean;
  position?: {
    filePath?: string;
    newLine?: number;
    oldLine?: number;
  };
  author: GitLabUser;
}

export interface GitLabDiscussion {
  id: string;
  createdAt: string;
  resolved?: boolean;
  resolvable?: boolean;
  notes: {
    nodes: GitLabNote[];
  };
}

export interface GitLabMergeRequest {
  id: string;
  iid: string;
  title: string;
  webUrl: string;
  state: 'opened' | 'closed' | 'merged' | 'locked';
  draft?: boolean;
  createdAt: string;
  updatedAt: string;
  mergedAt?: string;
  // Merge status fields
  mergeable?: boolean;
  mergeableDiscussionsState?: boolean;
  conflicts?: boolean;
  detailedMergeStatus?: string;
  // Approval fields
  approved?: boolean;
  approvalsRequired?: number;
  approvalsLeft?: number;
  // Other fields
  diffStatsSummary?: GitLabDiffStats;
  sourceBranch: string;
  targetBranch: string;
  project: GitLabProject;
  author: GitLabUser;
  labels?: {
    nodes: GitLabLabel[];
  };
  reviewers?: {
    nodes: GitLabReviewer[];
  };
  approvedBy?: {
    nodes: GitLabUser[];
  };
  userDiscussionsCount?: number;
  headPipeline?: GitLabPipeline;
}

// ===== Response wrapper types =====

export interface GitLabMRListResponse {
  data: {
    currentUser: {
      reviewRequestedMergeRequests?: {
        pageInfo: PageInfo;
        nodes: GitLabMergeRequest[];
      };
      authoredMergeRequests?: {
        pageInfo: PageInfo;
        nodes: GitLabMergeRequest[];
      };
    };
  };
}

export interface GitLabMRDetailsResponse {
  data: {
    project: {
      mergeRequest: GitLabMergeRequest;
    };
  };
}

export interface GitLabDiscussionsResponse {
  data: {
    project: {
      mergeRequest: {
        id: string;
        discussions: {
          nodes: GitLabDiscussion[];
        };
      };
    };
  };
}

export interface GitLabPipelineResponse {
  data: {
    project: {
      mergeRequest: {
        id: string;
        headPipeline: GitLabPipeline | null;
      };
    };
  };
}

export interface GitLabApprovalsResponse {
  data: {
    project: {
      mergeRequest: {
        id: string;
        approved: boolean;
        approvalsRequired: number;
        approvalsLeft: number;
        approvedBy: {
          nodes: GitLabUser[];
        };
        reviewers: {
          nodes: GitLabReviewer[];
        };
      };
    };
  };
}

export interface GitLabCurrentUserResponse {
  data: {
    currentUser: GitLabUser;
  };
}

export interface GitLabProjectNode {
  id: string;
  fullPath: string;
  name: string;
  namespace: {
    fullPath: string;
  };
  description: string | null;
  visibility: 'public' | 'private' | 'internal';
  forkedFromProject: { id: string } | null;
  archived: boolean;
  starCount: number;
  lastActivityAt: string;
}

export interface GitLabProjectsResponse {
  data: {
    projects: {
      pageInfo: PageInfo;
      nodes: GitLabProjectNode[];
    };
  };
}

// ===== Adapter Implementation =====

export class GitLabResponseAdapter {
  /**
   * Transform GitLab user to normalized Author
   */
  static transformUser(user: GitLabUser): Author {
    return {
      login: user.username,
      avatarUrl: user.avatarUrl || '',
    };
  }

  /**
   * Transform GitLab MR state to normalized state
   */
  static transformState(state: GitLabMergeRequest['state']): string {
    switch (state) {
      case 'opened':
        return 'OPEN';
      case 'merged':
        return 'MERGED';
      case 'closed':
        return 'CLOSED';
      case 'locked':
        return 'CLOSED';
      default:
        return 'OPEN';
    }
  }

  /**
   * Transform GitLab pipeline status to normalized check state
   */
  static transformPipelineStatus(status: string): string {
    switch (status.toLowerCase()) {
      case 'success':
        return 'SUCCESS';
      case 'failed':
        return 'FAILURE';
      case 'running':
      case 'pending':
      case 'waiting_for_resource':
      case 'preparing':
        return 'PENDING';
      case 'canceled':
      case 'skipped':
        return 'NEUTRAL';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Transform GitLab job to CheckRun
   */
  static transformJob(job: GitLabJob, stage?: GitLabStage): CheckRun {
    const conclusion = this.transformPipelineStatus(job.status);
    return {
      __typename: 'CheckRun',
      id: job.id,
      name: stage ? `${stage.name} / ${job.name}` : job.name,
      conclusion: conclusion === 'PENDING' ? null : conclusion,
      status: job.status === 'running' ? 'IN_PROGRESS' : job.status.toUpperCase(),
      detailsUrl: job.webPath,
      startedAt: job.startedAt,
      completedAt: job.finishedAt,
    };
  }

  /**
   * Transform GitLab pipeline to StatusCheckRollup
   */
  static transformPipeline(pipeline: GitLabPipeline | null): StatusCheckRollup | null {
    if (!pipeline) return null;

    const jobs: CheckRun[] = [];

    // Extract jobs from all stages
    if (pipeline.stages?.nodes) {
      for (const stage of pipeline.stages.nodes) {
        if (stage.jobs?.nodes) {
          for (const job of stage.jobs.nodes) {
            jobs.push(this.transformJob(job, stage));
          }
        }
      }
    }

    return {
      state: this.transformPipelineStatus(pipeline.status),
      contexts: {
        totalCount: jobs.length,
        nodes: jobs,
      },
    };
  }

  /**
   * Transform GitLab labels
   */
  static transformLabels(labels?: { nodes: GitLabLabel[] }): Label[] {
    if (!labels?.nodes) return [];
    return labels.nodes.map((label) => ({
      name: label.title,
      color: label.color.replace('#', ''),
    }));
  }

  /**
   * Transform GitLab MR to PullRequestBasic
   */
  static transformMergeRequest(mr: GitLabMergeRequest): PullRequestBasic {
    // Build review data from reviewers and approvals
    const reviewNodes = (mr.reviewers?.nodes || []).map((reviewer) => {
      const approved = mr.approvedBy?.nodes?.some((a) => a.username === reviewer.username);
      let state = 'PENDING';

      if (approved) {
        state = 'APPROVED';
      } else if (reviewer.mergeRequestInteraction?.reviewState === 'REQUESTED_CHANGES') {
        state = 'CHANGES_REQUESTED';
      } else if (reviewer.mergeRequestInteraction?.reviewState === 'REVIEWED') {
        state = 'COMMENTED';
      }

      return {
        author: { login: reviewer.username },
        state,
        comments: { totalCount: 0 },
      };
    });

    // Build check rollup from pipeline
    let commits = undefined;
    if (mr.headPipeline) {
      commits = {
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                state: this.transformPipelineStatus(mr.headPipeline.status),
              },
            },
          },
        ],
      };
    }

    // Build review requests
    const reviewRequests = {
      nodes: (mr.reviewers?.nodes || [])
        .filter((r) => !mr.approvedBy?.nodes?.some((a) => a.username === r.username))
        .map((reviewer) => ({
          requestedReviewer: {
            __typename: 'User' as const,
            login: reviewer.username,
          },
        })),
    };

    // Create composite ID format "projectPath:iid" for REST API operations
    // This allows the ActionsManager to extract both project path and MR iid
    const compositeId = `${mr.project.fullPath}:${mr.iid}`;

    return {
      id: compositeId,
      number: parseInt(mr.iid, 10),
      title: mr.title,
      url: mr.webUrl,
      state: this.transformState(mr.state),
      isDraft: mr.draft || false,
      repository: {
        nameWithOwner: mr.project.fullPath,
      },
      author: this.transformUser(mr.author),
      createdAt: mr.createdAt,
      updatedAt: mr.updatedAt,
      additions: mr.diffStatsSummary?.additions,
      deletions: mr.diffStatsSummary?.deletions,
      changedFiles: mr.diffStatsSummary?.fileCount,
      headRefName: mr.sourceBranch,
      baseRefName: mr.targetBranch,
      comments: {
        totalCount: mr.userDiscussionsCount || 0,
      },
      reviews: {
        nodes: reviewNodes,
      },
      commits,
      reviewRequests,
    };
  }

  /**
   * Transform GitLab MR to full PullRequest
   */
  static transformMergeRequestFull(mr: GitLabMergeRequest): PullRequest {
    const basic = this.transformMergeRequest(mr);
    const mergeStateStatus = this.mapGitLabMergeStatus(mr);

    return {
      ...basic,
      additions: mr.diffStatsSummary?.additions || 0,
      deletions: mr.diffStatsSummary?.deletions || 0,
      changedFiles: mr.diffStatsSummary?.fileCount || 0,
      mergeable: mr.mergeable ? 'MERGEABLE' : 'UNKNOWN',
      mergeStateStatus,
      labels: {
        nodes: this.transformLabels(mr.labels),
      },
    };
  }

  /**
   * Map GitLab merge status to GitHub-equivalent MergeStateStatus
   * This ensures consistent status values across both providers
   */
  static mapGitLabMergeStatus(mr: GitLabMergeRequest): 'CLEAN' | 'BLOCKED' | 'DIRTY' | 'BEHIND' | 'DRAFT' | 'UNKNOWN' | 'UNSTABLE' {
    // Handle non-open states
    if (mr.state !== 'opened') {
      return 'BLOCKED';
    }

    // Check draft status
    if (mr.draft) {
      return 'DRAFT';
    }

    // Check for conflicts
    if (mr.conflicts) {
      return 'DIRTY';
    }

    // Use detailedMergeStatus if available (GitLab 14.0+)
    if (mr.detailedMergeStatus) {
      switch (mr.detailedMergeStatus) {
        case 'MERGEABLE':
          return 'CLEAN';
        case 'CONFLICT':
          return 'DIRTY';
        case 'DRAFT_STATUS':
          return 'DRAFT';
        case 'NEED_REBASE':
          return 'BEHIND';
        case 'CI_STILL_RUNNING':
        case 'CHECKING':
        case 'UNCHECKED':
        case 'EXTERNAL_STATUS_CHECKS':
          return 'UNKNOWN';
        case 'BLOCKED_STATUS':
        case 'CI_MUST_PASS':
          if (mr.headPipeline?.status === 'failed') {
            return 'UNSTABLE';
          }
          return 'BLOCKED';
        default:
          return 'BLOCKED';
      }
    }

    // Fallback for older GitLab versions
    if (mr.headPipeline?.status === 'failed') {
      return 'UNSTABLE';
    }

    if (mr.headPipeline?.status === 'running' || mr.headPipeline?.status === 'pending') {
      return 'UNKNOWN';
    }

    if (mr.approvalsLeft && mr.approvalsLeft > 0) {
      return 'BLOCKED';
    }

    if (mr.mergeableDiscussionsState === false) {
      return 'BLOCKED';
    }

    if (mr.mergeable) {
      return 'CLEAN';
    }

    return 'BLOCKED';
  }

  /**
   * Transform GitLab discussions to Reviews
   */
  static transformDiscussionsToReviews(discussions: GitLabDiscussion[]): Review[] {
    // Group discussions by author and determine review state
    const reviewsByAuthor = new Map<string, Review>();

    for (const discussion of discussions) {
      const notes = discussion.notes.nodes.filter((n) => !n.system);
      if (notes.length === 0) continue;

      const firstNote = notes[0];
      const authorLogin = firstNote.author.username;

      if (!reviewsByAuthor.has(authorLogin)) {
        reviewsByAuthor.set(authorLogin, {
          id: discussion.id,
          author: this.transformUser(firstNote.author),
          state: 'COMMENTED',
          createdAt: discussion.createdAt,
          body: firstNote.body,
          comments: {
            totalCount: notes.length,
            nodes: notes.map((n) => ({
              id: n.id,
              body: n.body,
              createdAt: n.createdAt,
              path: n.position?.filePath,
              position: n.position?.newLine,
            })),
          },
        });
      } else {
        const review = reviewsByAuthor.get(authorLogin)!;
        review.comments.totalCount += notes.length;
        if (review.comments.nodes) {
          review.comments.nodes.push(
            ...notes.map((n) => ({
              id: n.id,
              body: n.body,
              createdAt: n.createdAt,
              path: n.position?.filePath,
              position: n.position?.newLine,
            }))
          );
        }
      }
    }

    return Array.from(reviewsByAuthor.values());
  }

  /**
   * Transform GitLab discussions to Comments
   */
  static transformDiscussionsToComments(discussions: GitLabDiscussion[]): Comment[] {
    const comments: Comment[] = [];

    for (const discussion of discussions) {
      for (const note of discussion.notes.nodes) {
        if (note.system) continue; // Skip system notes

        comments.push({
          id: note.id,
          author: this.transformUser(note.author),
          body: note.body,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt || note.createdAt,
        });
      }
    }

    return comments.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  /**
   * Transform approvals response to Reviews
   */
  static transformApprovalsToReviews(
    approvedBy: GitLabUser[],
    reviewers: GitLabReviewer[]
  ): Review[] {
    const reviews: Review[] = [];

    // Add approved reviews
    for (const approver of approvedBy) {
      reviews.push({
        id: `approval-${approver.id}`,
        author: this.transformUser(approver),
        state: 'APPROVED',
        createdAt: new Date().toISOString(),
        comments: { totalCount: 0 },
      });
    }

    // Add pending/requested changes from reviewers
    for (const reviewer of reviewers) {
      const isApproved = approvedBy.some((a) => a.username === reviewer.username);
      if (isApproved) continue;

      let state = 'PENDING';
      if (reviewer.mergeRequestInteraction?.reviewState === 'REQUESTED_CHANGES') {
        state = 'CHANGES_REQUESTED';
      }

      reviews.push({
        id: `review-${reviewer.id}`,
        author: this.transformUser(reviewer),
        state,
        createdAt: new Date().toISOString(),
        comments: { totalCount: 0 },
      });
    }

    return reviews;
  }

  /**
   * Transform list response
   */
  static transformListResponse(
    response: GitLabMRListResponse,
    type: 'review' | 'authored'
  ): { prs: PullRequestBasic[]; pageInfo: PageInfo } {
    const data =
      type === 'review'
        ? response.data.currentUser.reviewRequestedMergeRequests
        : response.data.currentUser.authoredMergeRequests;

    if (!data) {
      return {
        prs: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    }

    return {
      prs: data.nodes.map((mr) => this.transformMergeRequest(mr)),
      pageInfo: data.pageInfo,
    };
  }

  /**
   * Transform current user response
   */
  static transformCurrentUser(response: GitLabCurrentUserResponse): string {
    return response.data.currentUser.username;
  }

  /**
   * Transform projects response to RepositoryInfo[]
   */
  static transformProjects(response: GitLabProjectsResponse): RepositoryInfo[] {
    return response.data.projects.nodes.map((project) => ({
      nameWithOwner: project.fullPath,
      name: project.name,
      owner: project.namespace.fullPath,
      description: project.description || undefined,
      isPrivate: project.visibility !== 'public',
      isFork: project.forkedFromProject !== null,
      isArchived: project.archived,
      starCount: project.starCount,
      updatedAt: project.lastActivityAt,
    }));
  }
}
