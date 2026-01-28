/**
 * GitHubActionsManager - Handles quick actions for GitHub
 * Implements IActionsManager interface
 */

import type {
  AddPullRequestReviewInput,
  AddCommentInput,
  MergePullRequestInput,
  ApproveResult,
  RequestChangesResult,
  CommentResult,
  MergeResult,
} from '../../../model/mutation-types';
import type { IActionsManager, MergeOptions, PRNodeIdResult } from '../../interfaces';
import { GitHubService } from '../GitHubService';
import {
  ADD_PULL_REQUEST_REVIEW_MUTATION,
  ADD_COMMENT_MUTATION,
  MERGE_PULL_REQUEST_MUTATION,
  GET_PR_NODE_ID_QUERY,
} from '../queries/mutations';
import { githubLogger } from '../../../utils/logger';

interface AddPullRequestReviewResponse {
  data: {
    addPullRequestReview: {
      pullRequestReview: {
        id: string;
        state: string;
        body: string | null;
        createdAt: string;
        author: {
          login: string;
          avatarUrl: string;
        };
      };
    };
  };
}

interface AddCommentResponse {
  data: {
    addComment: {
      commentEdge: {
        node: {
          id: string;
          body: string;
          createdAt: string;
          author: {
            login: string;
            avatarUrl: string;
          };
        };
      };
    };
  };
}

interface MergePullRequestResponse {
  data: {
    mergePullRequest: {
      pullRequest: {
        id: string;
        number: number;
        state: string;
        merged: boolean;
        mergedAt: string | null;
        url: string;
      };
    };
  };
}

interface GetPRNodeIdResponse {
  data: {
    repository: {
      squashMergeAllowed: boolean;
      mergeCommitAllowed: boolean;
      rebaseMergeAllowed: boolean;
      pullRequest: {
        id: string;
        mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
        viewerCanMergeAsAdmin: boolean;
        mergeStateStatus: string;
      };
    };
  };
}

export class GitHubActionsManager implements IActionsManager {
  private githubService: GitHubService;
  private pendingActions: Set<string> = new Set();

  constructor(githubService: GitHubService) {
    this.githubService = githubService;
  }

  /**
   * Check if an action is currently pending for a PR
   */
  isActionPending(prId: string): boolean {
    return this.pendingActions.has(prId);
  }

  /**
   * Get PR node ID from owner/repo/number
   * Returns merge status information including mergeStateStatus
   */
  async getPRNodeId(owner: string, repo: string, prNumber: number): Promise<PRNodeIdResult> {
    const result = await this.githubService.executeQuery<GetPRNodeIdResponse>(
      GET_PR_NODE_ID_QUERY,
      { owner, repo, number: prNumber }
    );

    const repo_data = result.data.repository;
    const pr = repo_data.pullRequest;

    // Use mergeStateStatus as the primary indicator for merge readiness
    // CLEAN = All branch protection rules are satisfied
    // viewerCanMergeAsAdmin is a fallback for repos with admin bypass
    const canMerge = pr.mergeStateStatus === 'CLEAN' ||
      (pr.viewerCanMergeAsAdmin && pr.mergeable === 'MERGEABLE');

    // Determine allowed merge method (prefer MERGE > SQUASH > REBASE)
    let allowedMergeMethod: 'MERGE' | 'SQUASH' | 'REBASE' = 'MERGE';
    if (repo_data.mergeCommitAllowed) {
      allowedMergeMethod = 'MERGE';
    } else if (repo_data.squashMergeAllowed) {
      allowedMergeMethod = 'SQUASH';
    } else if (repo_data.rebaseMergeAllowed) {
      allowedMergeMethod = 'REBASE';
    }

    return {
      id: pr.id,
      mergeable: pr.mergeStateStatus, // Return mergeStateStatus as the main status
      mergeStateStatus: pr.mergeStateStatus,
      canMerge,
      allowedMergeMethod,
    };
  }

  /**
   * Approve a pull request
   */
  async approvePullRequest(pullRequestId: string, body?: string): Promise<ApproveResult> {
    if (this.pendingActions.has(pullRequestId)) {
      return { success: false, error: 'Action already in progress' };
    }

    this.pendingActions.add(pullRequestId);
    githubLogger.info(`GitHubActionsManager: Approving PR ${pullRequestId}`);

    try {
      const input: AddPullRequestReviewInput = {
        pullRequestId,
        event: 'APPROVE',
        body: body || undefined,
      };

      const result = await this.githubService.executeQuery<AddPullRequestReviewResponse>(
        ADD_PULL_REQUEST_REVIEW_MUTATION,
        { input }
      );

      const review = result.data.addPullRequestReview.pullRequestReview;
      githubLogger.info(`GitHubActionsManager: PR approved successfully`);

      return { success: true, data: review };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to approve PR';
      githubLogger.error(`GitHubActionsManager: Failed to approve PR - ${errorMessage}`);
      return { success: false, error: errorMessage };
    } finally {
      this.pendingActions.delete(pullRequestId);
    }
  }

  /**
   * Request changes on a pull request
   */
  async requestChanges(pullRequestId: string, body: string): Promise<RequestChangesResult> {
    if (!body || body.trim().length === 0) {
      return { success: false, error: 'Comment is required when requesting changes' };
    }

    if (this.pendingActions.has(pullRequestId)) {
      return { success: false, error: 'Action already in progress' };
    }

    this.pendingActions.add(pullRequestId);
    githubLogger.info(`GitHubActionsManager: Requesting changes on PR ${pullRequestId}`);

    try {
      const input: AddPullRequestReviewInput = {
        pullRequestId,
        event: 'REQUEST_CHANGES',
        body,
      };

      const result = await this.githubService.executeQuery<AddPullRequestReviewResponse>(
        ADD_PULL_REQUEST_REVIEW_MUTATION,
        { input }
      );

      const review = result.data.addPullRequestReview.pullRequestReview;
      githubLogger.info(`GitHubActionsManager: Changes requested successfully`);

      return { success: true, data: review };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to request changes';
      githubLogger.error(`GitHubActionsManager: Failed to request changes - ${errorMessage}`);
      return { success: false, error: errorMessage };
    } finally {
      this.pendingActions.delete(pullRequestId);
    }
  }

  /**
   * Add a comment to a pull request
   */
  async addComment(pullRequestId: string, body: string): Promise<CommentResult> {
    if (!body || body.trim().length === 0) {
      return { success: false, error: 'Comment cannot be empty' };
    }

    if (this.pendingActions.has(pullRequestId)) {
      return { success: false, error: 'Action already in progress' };
    }

    this.pendingActions.add(pullRequestId);
    githubLogger.info(`GitHubActionsManager: Adding comment to PR ${pullRequestId}`);

    try {
      const input: AddCommentInput = {
        subjectId: pullRequestId,
        body,
      };

      const result = await this.githubService.executeQuery<AddCommentResponse>(
        ADD_COMMENT_MUTATION,
        { input }
      );

      const comment = result.data.addComment.commentEdge.node;
      githubLogger.info(`GitHubActionsManager: Comment added successfully`);

      return { success: true, data: comment };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add comment';
      githubLogger.error(`GitHubActionsManager: Failed to add comment - ${errorMessage}`);
      return { success: false, error: errorMessage };
    } finally {
      this.pendingActions.delete(pullRequestId);
    }
  }

  /**
   * Merge a pull request
   */
  async mergePullRequest(pullRequestId: string, options?: MergeOptions): Promise<MergeResult> {
    if (this.pendingActions.has(pullRequestId)) {
      return { success: false, error: 'Action already in progress' };
    }

    this.pendingActions.add(pullRequestId);
    githubLogger.info(`GitHubActionsManager: Merging PR ${pullRequestId}`);

    try {
      const input: MergePullRequestInput = {
        pullRequestId,
        commitHeadline: options?.commitHeadline,
        commitBody: options?.commitBody,
        mergeMethod: options?.mergeMethod || 'SQUASH',
      };

      const result = await this.githubService.executeQuery<MergePullRequestResponse>(
        MERGE_PULL_REQUEST_MUTATION,
        { input }
      );

      const mergedPR = result.data.mergePullRequest.pullRequest;
      githubLogger.info(`GitHubActionsManager: PR merged successfully`);

      return { success: true, data: mergedPR };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to merge PR';
      githubLogger.error(`GitHubActionsManager: Failed to merge PR - ${errorMessage}`);
      return { success: false, error: errorMessage };
    } finally {
      this.pendingActions.delete(pullRequestId);
    }
  }

  /**
   * Parse repository string (owner/repo) into components
   */
  parseRepo(repoString: string): { owner: string; repo: string } | null {
    const parts = repoString.split('/');
    if (parts.length !== 2) return null;
    return { owner: parts[0], repo: parts[1] };
  }
}
