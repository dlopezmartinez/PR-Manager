import type { Author } from './types';

export type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

export interface AddPullRequestReviewInput {
  pullRequestId: string;
  event: ReviewEvent;
  body?: string;
}

export interface AddCommentInput {
  subjectId: string;
  body: string;
}

export type MergeMethod = 'MERGE' | 'SQUASH' | 'REBASE';

export interface MergePullRequestInput {
  pullRequestId: string;
  commitHeadline?: string;
  commitBody?: string;
  mergeMethod?: MergeMethod;
}

export interface ReviewResponse {
  id: string;
  state: string;
  body: string | null;
  createdAt: string;
  author: Author;
}

export interface CommentResponse {
  id: string;
  body: string;
  createdAt: string;
  author: Author;
}

export interface MergeResponse {
  id: string;
  number: number;
  state: string;
  merged: boolean;
  mergedAt: string | null;
  url: string;
}

export interface AddPullRequestReviewResponse {
  data: {
    addPullRequestReview: {
      pullRequestReview: ReviewResponse;
    };
  };
}

export interface AddCommentResponse {
  data: {
    addComment: {
      commentEdge: {
        node: CommentResponse;
      };
    };
  };
}

export interface MergePullRequestResponse {
  data: {
    mergePullRequest: {
      pullRequest: MergeResponse;
    };
  };
}

export interface GetPRNodeIdResponse {
  data: {
    repository: {
      pullRequest: {
        id: string;
        mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
        viewerCanMergeAsAdmin: boolean;
        mergeStateStatus: string;
      };
    };
  };
}

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type ApproveResult = ActionResult<ReviewResponse>;
export type RequestChangesResult = ActionResult<ReviewResponse>;
export type CommentResult = ActionResult<CommentResponse>;
export type MergeResult = ActionResult<MergeResponse>;
