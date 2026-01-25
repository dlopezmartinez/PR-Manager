/**
 * GitLabActionsManager - Handles quick actions for GitLab
 * Implements IActionsManager interface
 *
 * Note: GitLab uses REST API for some operations (approvals, merge)
 * that aren't fully supported in GraphQL
 */

import type {
  ApproveResult,
  RequestChangesResult,
  CommentResult,
  MergeResult,
  ReviewResponse,
  CommentResponse,
  MergeResponse,
} from '../../../model/mutation-types';
import type { IActionsManager, MergeOptions, PRNodeIdResult } from '../../interfaces';
import { GitLabService } from '../GitLabService';
import { CREATE_NOTE_MUTATION } from '../queries/mutations';
import { MR_DETAILS_QUERY } from '../queries/mergeRequests';
import { githubLogger as logger } from '../../../utils/logger';

interface CreateNoteResponse {
  data: {
    createNote: {
      note: {
        id: string;
        body: string;
        createdAt: string;
        author: {
          id: string;
          username: string;
          name: string;
          avatarUrl: string;
        };
      };
      errors: string[];
    };
  };
}

interface MRDetailsResponse {
  data: {
    project: {
      mergeRequest: {
        id: string;
        state: string;
        mergeableDiscussionsState: boolean;
      };
    };
  };
}

export class GitLabActionsManager implements IActionsManager {
  private gitlabService: GitLabService;
  private pendingActions: Set<string> = new Set();

  constructor(gitlabService: GitLabService) {
    this.gitlabService = gitlabService;
  }

  /**
   * Check if an action is currently pending for a MR
   */
  isActionPending(prId: string): boolean {
    return this.pendingActions.has(prId);
  }

  /**
   * Get MR node ID and merge status
   * Note: GitLab doesn't have the same granular mergeStateStatus as GitHub
   * We map to equivalent values where possible
   */
  async getPRNodeId(owner: string, repo: string, prNumber: number): Promise<PRNodeIdResult> {
    const projectPath = `${owner}/${repo}`;

    const result = await this.gitlabService.executeQuery<MRDetailsResponse>(MR_DETAILS_QUERY, {
      projectPath,
      iid: String(prNumber),
    });

    const mr = result.data.project.mergeRequest;

    // Map GitLab state to GitHub-like mergeStateStatus
    // GitLab states: opened, closed, merged, locked
    // We consider 'opened' with no blocking discussions as CLEAN
    let mergeStateStatus = 'BLOCKED';
    if (mr.state === 'opened') {
      mergeStateStatus = mr.mergeableDiscussionsState ? 'CLEAN' : 'BLOCKED';
    } else if (mr.state === 'merged') {
      mergeStateStatus = 'MERGED';
    }

    return {
      id: mr.id,
      mergeable: mergeStateStatus,
      mergeStateStatus,
      canMerge: mr.state === 'opened' && mr.mergeableDiscussionsState,
    };
  }

  /**
   * Approve a merge request
   * Uses REST API as GraphQL doesn't support approval mutation directly
   */
  async approvePullRequest(pullRequestId: string, body?: string): Promise<ApproveResult> {
    if (this.pendingActions.has(pullRequestId)) {
      return { success: false, error: 'Action already in progress' };
    }

    this.pendingActions.add(pullRequestId);
    logger.info(`GitLabActionsManager: Approving MR ${pullRequestId}`);

    try {
      // Parse the pullRequestId which should be in format "gid://gitlab/MergeRequest/123"
      // or we need project path and iid
      const { projectPath, iid } = this.parseNodeId(pullRequestId);

      await this.gitlabService.approveMergeRequest(projectPath, iid);

      // Add comment if provided
      if (body) {
        await this.addComment(pullRequestId, body);
      }

      logger.info(`GitLabActionsManager: MR approved successfully`);

      const reviewResponse: ReviewResponse = {
        id: `approval-${Date.now()}`,
        state: 'APPROVED',
        body: body || null,
        createdAt: new Date().toISOString(),
        author: { login: 'current-user', avatarUrl: '' },
      };

      return { success: true, data: reviewResponse };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to approve MR';
      logger.error(`GitLabActionsManager: Failed to approve MR - ${errorMessage}`);
      return { success: false, error: errorMessage };
    } finally {
      this.pendingActions.delete(pullRequestId);
    }
  }

  /**
   * Request changes on a merge request
   * In GitLab, this is done by adding a comment (no native "request changes" feature)
   */
  async requestChanges(pullRequestId: string, body: string): Promise<RequestChangesResult> {
    if (!body || body.trim().length === 0) {
      return { success: false, error: 'Comment is required when requesting changes' };
    }

    if (this.pendingActions.has(pullRequestId)) {
      return { success: false, error: 'Action already in progress' };
    }

    this.pendingActions.add(pullRequestId);
    logger.info(`GitLabActionsManager: Requesting changes on MR ${pullRequestId}`);

    try {
      // In GitLab, we unapprove and add a comment
      const { projectPath, iid } = this.parseNodeId(pullRequestId);

      // Try to unapprove (may fail if not previously approved)
      try {
        await this.gitlabService.unapproveMergeRequest(projectPath, iid);
      } catch {
        // Ignore - user might not have approved yet
      }

      // Add the comment with changes requested
      const commentResult = await this.addComment(pullRequestId, `**Changes Requested:**\n\n${body}`);

      if (!commentResult.success) {
        return { success: false, error: commentResult.error };
      }

      logger.info(`GitLabActionsManager: Changes requested successfully`);

      const reviewResponse: ReviewResponse = {
        id: `changes-${Date.now()}`,
        state: 'CHANGES_REQUESTED',
        body,
        createdAt: new Date().toISOString(),
        author: { login: 'current-user', avatarUrl: '' },
      };

      return { success: true, data: reviewResponse };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to request changes';
      logger.error(`GitLabActionsManager: Failed to request changes - ${errorMessage}`);
      return { success: false, error: errorMessage };
    } finally {
      this.pendingActions.delete(pullRequestId);
    }
  }

  /**
   * Add a comment to a merge request
   */
  async addComment(pullRequestId: string, body: string): Promise<CommentResult> {
    if (!body || body.trim().length === 0) {
      return { success: false, error: 'Comment cannot be empty' };
    }

    if (this.pendingActions.has(pullRequestId)) {
      return { success: false, error: 'Action already in progress' };
    }

    this.pendingActions.add(pullRequestId);
    logger.info(`GitLabActionsManager: Adding comment to MR ${pullRequestId}`);

    try {
      const result = await this.gitlabService.executeQuery<CreateNoteResponse>(
        CREATE_NOTE_MUTATION,
        {
          noteableId: pullRequestId,
          body,
        }
      );

      if (result.data.createNote.errors?.length > 0) {
        throw new Error(result.data.createNote.errors.join(', '));
      }

      const note = result.data.createNote.note;
      logger.info(`GitLabActionsManager: Comment added successfully`);

      const commentResponse: CommentResponse = {
        id: note.id,
        body: note.body,
        createdAt: note.createdAt,
        author: {
          login: note.author.username,
          avatarUrl: note.author.avatarUrl,
        },
      };

      return { success: true, data: commentResponse };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add comment';
      logger.error(`GitLabActionsManager: Failed to add comment - ${errorMessage}`);
      return { success: false, error: errorMessage };
    } finally {
      this.pendingActions.delete(pullRequestId);
    }
  }

  /**
   * Merge a merge request
   */
  async mergePullRequest(pullRequestId: string, options?: MergeOptions): Promise<MergeResult> {
    if (this.pendingActions.has(pullRequestId)) {
      return { success: false, error: 'Action already in progress' };
    }

    this.pendingActions.add(pullRequestId);
    logger.info(`GitLabActionsManager: Merging MR ${pullRequestId}`);

    try {
      const { projectPath, iid } = this.parseNodeId(pullRequestId);

      const mergeOptions = {
        squash: options?.mergeMethod === 'SQUASH',
        squashCommitMessage: options?.commitHeadline,
        mergeCommitMessage: options?.commitBody,
      };

      const result = await this.gitlabService.acceptMergeRequest(projectPath, iid, mergeOptions);

      logger.info(`GitLabActionsManager: MR merged successfully`);

      const mrResult = result as { id: string; iid: number; state: string; merged_at: string; web_url: string };

      const mergeResponse: MergeResponse = {
        id: mrResult.id || pullRequestId,
        number: mrResult.iid || iid,
        state: 'MERGED',
        merged: true,
        mergedAt: mrResult.merged_at || new Date().toISOString(),
        url: mrResult.web_url || '',
      };

      return { success: true, data: mergeResponse };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to merge MR';
      logger.error(`GitLabActionsManager: Failed to merge MR - ${errorMessage}`);
      return { success: false, error: errorMessage };
    } finally {
      this.pendingActions.delete(pullRequestId);
    }
  }

  /**
   * Parse repository string into owner/repo components
   */
  parseRepo(repoString: string): { owner: string; repo: string } | null {
    const parts = repoString.split('/');
    if (parts.length < 2) return null;
    // GitLab can have nested groups, so take the last part as repo
    // and everything else as owner/group
    const repo = parts.pop()!;
    const owner = parts.join('/');
    return { owner, repo };
  }

  /**
   * Parse GitLab node ID to extract project path and iid
   * Format: "gid://gitlab/MergeRequest/123" or stored as "projectPath:iid"
   */
  private parseNodeId(nodeId: string): { projectPath: string; iid: number } {
    // If it's a stored format "projectPath:iid"
    if (nodeId.includes(':') && !nodeId.includes('gid://')) {
      const [projectPath, iidStr] = nodeId.split(':');
      return { projectPath, iid: parseInt(iidStr, 10) };
    }

    // If it's a GitLab global ID, we need additional context
    // This is a limitation - we'd need to store project context separately
    throw new Error(
      'Cannot parse GitLab node ID without project context. Use format "projectPath:iid"'
    );
  }
}
