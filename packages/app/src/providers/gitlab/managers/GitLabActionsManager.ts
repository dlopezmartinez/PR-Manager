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
import { MR_MERGE_STATUS_QUERY } from '../queries/mergeRequests';
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

interface MRMergeStatusResponse {
  data: {
    project: {
      mergeRequest: {
        id: string;
        iid: string;
        state: string;
        draft: boolean;
        mergeable: boolean;
        conflicts: boolean;
        mergeableDiscussionsState: boolean;
        detailedMergeStatus: string;
        approvalsRequired: number | null;
        approvalsLeft: number | null;
        approved: boolean;
        headPipeline: {
          id: string;
          status: string;
          active: boolean;
          complete: boolean;
        } | null;
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
   * Maps GitLab merge status to GitHub-equivalent states for UI consistency
   *
   * GitLab detailedMergeStatus values:
   * - MERGEABLE: Can be merged
   * - BLOCKED_STATUS: Pipeline failed
   * - BROKEN_STATUS: Source branch doesn't exist
   * - CHECKING: Merge status being calculated
   * - CI_MUST_PASS: Pipeline must succeed
   * - CI_STILL_RUNNING: Pipeline in progress
   * - CONFLICT: Has merge conflicts
   * - DISCUSSIONS_NOT_RESOLVED: Unresolved threads
   * - DRAFT_STATUS: MR is draft
   * - EXTERNAL_STATUS_CHECKS: External checks pending
   * - JIRA_ASSOCIATION_MISSING: Jira issue required
   * - NEED_REBASE: Branch needs rebase
   * - NOT_APPROVED: Approvals required
   * - NOT_OPEN: MR is not open
   * - POLICIES_DENIED: Security policy blocks merge
   * - UNCHECKED: Status not yet checked
   */
  async getPRNodeId(owner: string, repo: string, prNumber: number): Promise<PRNodeIdResult> {
    const projectPath = `${owner}/${repo}`;

    const result = await this.gitlabService.executeQuery<MRMergeStatusResponse>(MR_MERGE_STATUS_QUERY, {
      projectPath,
      iid: String(prNumber),
    });

    const mr = result.data.project.mergeRequest;
    const mergeStateStatus = this.mapGitLabStatusToGitHubStatus(mr);

    logger.debug(`GitLabActionsManager: MR #${prNumber} status - detailedMergeStatus=${mr.detailedMergeStatus}, ` +
      `mergeable=${mr.mergeable}, conflicts=${mr.conflicts}, draft=${mr.draft}, ` +
      `approved=${mr.approved}, pipeline=${mr.headPipeline?.status}, mapped=${mergeStateStatus}`);

    return {
      id: mr.id,
      mergeable: mergeStateStatus,
      mergeStateStatus,
      canMerge: mergeStateStatus === 'CLEAN',
    };
  }

  /**
   * Map GitLab's detailedMergeStatus and other fields to GitHub-equivalent status
   * This ensures the UI shows consistent messages regardless of provider
   */
  private mapGitLabStatusToGitHubStatus(mr: MRMergeStatusResponse['data']['project']['mergeRequest']): string {
    // Handle non-open states first
    if (mr.state === 'merged') {
      return 'MERGED';
    }
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
          // Check if pipeline is actually failing or just required
          // Normalize to uppercase for consistent comparison
          if (mr.headPipeline?.status?.toUpperCase() === 'FAILED') {
            return 'UNSTABLE';
          }
          return 'BLOCKED';

        case 'NOT_APPROVED':
        case 'DISCUSSIONS_NOT_RESOLVED':
        case 'POLICIES_DENIED':
        case 'JIRA_ASSOCIATION_MISSING':
        case 'BROKEN_STATUS':
        case 'NOT_OPEN':
        default:
          return 'BLOCKED';
      }
    }

    // Fallback logic for older GitLab versions without detailedMergeStatus
    // Check pipeline status
    if (mr.headPipeline) {
      const pipelineStatus = mr.headPipeline.status.toUpperCase();
      if (pipelineStatus === 'FAILED') {
        return 'UNSTABLE';
      }
      if (pipelineStatus === 'RUNNING' || pipelineStatus === 'PENDING') {
        return 'UNKNOWN';
      }
    }

    // Check approvals
    if (mr.approvalsLeft && mr.approvalsLeft > 0) {
      return 'BLOCKED';
    }

    // Check discussions
    if (!mr.mergeableDiscussionsState) {
      return 'BLOCKED';
    }

    // If mergeable flag is true and no blockers detected, it's clean
    if (mr.mergeable) {
      return 'CLEAN';
    }

    // Default to blocked if we can't determine status
    return 'BLOCKED';
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
   *
   * Supported formats:
   * - Composite format: "group/subgroup/project:123" (preferred, from adapter)
   * - Simple format: "project:123"
   *
   * Note: GitLab global IDs (gid://gitlab/MergeRequest/123) are NOT supported
   * because they don't contain the project path needed for REST API calls.
   */
  private parseNodeId(nodeId: string): { projectPath: string; iid: number } {
    // Handle composite format "projectPath:iid" (e.g., "mygroup/myproject:123")
    // Find the last colon, as project paths can contain multiple segments
    const lastColonIndex = nodeId.lastIndexOf(':');

    if (lastColonIndex > 0) {
      const projectPath = nodeId.substring(0, lastColonIndex);
      const iidStr = nodeId.substring(lastColonIndex + 1);
      const iid = parseInt(iidStr, 10);

      if (!isNaN(iid) && projectPath.length > 0) {
        return { projectPath, iid };
      }
    }

    // Log the problematic ID for debugging
    logger.error(`GitLabActionsManager: Unable to parse node ID: ${nodeId}`);
    throw new Error(
      `Invalid GitLab MR identifier format. Expected "project/path:iid", got: ${nodeId}`
    );
  }
}
