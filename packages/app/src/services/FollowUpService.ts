import type { PullRequestBasic, PullRequest, MergeStateStatus } from '../model/types';
import type { IPullRequestManager } from '../providers/interfaces';
import {
  getFollowedPRs,
  detectChanges,
  updatePRState,
  removeClosedPR,
  migrateNotificationPrefs,
  type FollowedPRInfo,
  type DetectedChanges,
} from '../stores/followUpStore';
import {
  addBatchNotifications,
  addNotification,
  hasNotificationOfType,
  deleteNotificationsByType,
  type InboxNotification,
  type BatchNotificationChanges,
} from '../stores/notificationInboxStore';
import { showNotification } from '../utils/electron';
import { configStore } from '../stores/configStore';

/**
 * Check if a PR is ready to merge using GitHub's mergeStateStatus.
 * This respects the actual branch protection rules configured on the repo.
 *
 * mergeStateStatus values:
 * - CLEAN: Ready to merge - all branch protection rules satisfied
 * - BLOCKED: Blocked by branch protection (checks failing, reviews needed, etc.)
 * - BEHIND: Branch is behind base branch
 * - DIRTY: Has merge conflicts
 * - DRAFT: Is a draft PR
 * - UNSTABLE: Some checks failing but still mergeable
 * - UNKNOWN: State is being calculated
 */
function isReadyToMerge(pr: PullRequestBasic | PullRequest): boolean {
  // Basic checks
  if (pr.state !== 'OPEN' || pr.isDraft) {
    return false;
  }

  // Use mergeStateStatus if available (from PR_DETAILS_BY_ID_QUERY)
  const mergeStateStatus = (pr as PullRequest).mergeStateStatus;

  if (mergeStateStatus) {
    console.log(`isReadyToMerge PR #${pr.number}: mergeStateStatus=${mergeStateStatus}`);
    // CLEAN means all branch protection rules are satisfied
    return mergeStateStatus === 'CLEAN';
  }

  // Fallback for list queries that don't include mergeStateStatus
  // Check if all CI checks pass
  const checksPass = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state === 'SUCCESS';
  console.log(`isReadyToMerge PR #${pr.number}: fallback check, checksPass=${checksPass}`);
  return checksPass;
}

export interface FollowUpPollingResult {
  checked: number;
  changesDetected: number;
  notificationsCreated: InboxNotification[];
  errors: string[];
}

export class FollowUpService {
  private pullRequestManager: IPullRequestManager;
  private isPolling = false;

  constructor(pullRequestManager: IPullRequestManager) {
    this.pullRequestManager = pullRequestManager;
  }

  async pollFollowedPRs(): Promise<FollowUpPollingResult> {
    if (this.isPolling) {
      console.log('FollowUpService: Already polling, skipping');
      return { checked: 0, changesDetected: 0, notificationsCreated: [], errors: [] };
    }

    this.isPolling = true;
    const result: FollowUpPollingResult = {
      checked: 0,
      changesDetected: 0,
      notificationsCreated: [],
      errors: [],
    };

    try {
      const followedPRs = getFollowedPRs();

      if (followedPRs.length === 0) {
        return result;
      }

      console.log(`FollowUpService: Polling ${followedPRs.length} followed PRs`);

      const CONCURRENCY_LIMIT = 5;
      const chunks = this.chunkArray(followedPRs, CONCURRENCY_LIMIT);

      for (const chunk of chunks) {
        const promises = chunk.map((info) => this.pollSinglePR(info, result));
        await Promise.all(promises);
      }

      // Show native notification if there are any notifications created
      // (not just changesDetected, as ready_to_merge doesn't increment that counter)
      if (result.notificationsCreated.length > 0 && configStore.notificationsEnabled) {
        this.showNativeNotification(result);
      }

      console.log(
        `FollowUpService: Polling complete. Checked: ${result.checked}, Changes: ${result.changesDetected}`
      );
    } catch (error) {
      console.error('FollowUpService: Error during polling:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.isPolling = false;
    }

    return result;
  }

  private async pollSinglePR(
    info: FollowedPRInfo,
    result: FollowUpPollingResult
  ): Promise<void> {
    try {
      const { owner, repo } = this.parseRepository(info.repoNameWithOwner);

      const currentPR = await this.pullRequestManager.getPullRequestDetails(
        owner,
        repo,
        info.prNumber,
        false
      );

      result.checked++;

      // Get merge state status from the detailed PR response
      const mergeStateStatus = (currentPR as PullRequest).mergeStateStatus ?? null;

      // Detect changes with the new mergeStateStatus parameter
      const changes = detectChanges(info.prId, currentPR as PullRequestBasic, mergeStateStatus);

      // Migrate preferences for backwards compatibility
      const prefs = migrateNotificationPrefs(info.notificationPrefs);

      console.log(`FollowUpService: PR #${info.prNumber} changes:`, changes);
      console.log(`FollowUpService: PR #${info.prNumber} prefs:`, prefs);

      // Handle PR merged or closed
      if (currentPR.state !== 'OPEN') {
        const prInfo = {
          prId: info.prId,
          prNumber: info.prNumber,
          prTitle: currentPR.title,
          repoNameWithOwner: info.repoNameWithOwner,
          url: info.url,
          authorLogin: info.authorLogin,
          authorAvatarUrl: info.authorAvatarUrl,
        };

        // Create merged notification if enabled
        if (currentPR.state === 'MERGED' && prefs.notifyOnMerged) {
          const notification = addNotification({
            ...prInfo,
            type: 'pr_merged',
            changeDetails: {},
          });
          result.notificationsCreated.push(notification);
        }

        removeClosedPR(info.prId);
        return;
      }

      if (changes.hasChanges) {
        result.changesDetected++;

        const notificationChanges: BatchNotificationChanges = {};

        // Respect per-PR notification preferences, with fallback to global settings
        const shouldNotifyCommits = prefs.notifyOnCommits ?? configStore.followUpNotifyOnCommits;
        const shouldNotifyComments = prefs.notifyOnComments ?? configStore.followUpNotifyOnComments;
        const shouldNotifyApproved = prefs.notifyOnApproved;
        const shouldNotifyChangesRequested = prefs.notifyOnChangesRequested;
        const shouldNotifyMergeStatusChange = prefs.notifyOnMergeStatusChange;

        // Commits
        if (changes.newCommits && shouldNotifyCommits) {
          notificationChanges.newCommits = changes.newCommits;
        }

        // Comments
        if (changes.newComments && shouldNotifyComments) {
          notificationChanges.newComments = changes.newComments;
        }

        // Review Approved
        if (changes.newApproved && shouldNotifyApproved) {
          notificationChanges.reviewApproved = changes.newApproved;
        }

        // Changes Requested
        if (changes.newChangesRequested && shouldNotifyChangesRequested) {
          notificationChanges.reviewChangesRequested = changes.newChangesRequested;
        }

        // Merge Status Change
        // Clear separation: merge_status_change ONLY fires for non-CLEAN statuses
        // CLEAN status is handled exclusively by ready_to_merge notification
        const isTransitionToClean = changes.newMergeStatus === 'CLEAN';

        if (changes.mergeStatusChanged && shouldNotifyMergeStatusChange && !isTransitionToClean) {
          notificationChanges.mergeStatusChange = changes.newMergeStatus ?? undefined;
        }

        if (Object.keys(notificationChanges).length > 0) {
          console.log(`FollowUpService: Creating notifications for PR #${info.prNumber}:`, notificationChanges);

          const notifications = addBatchNotifications(
            {
              prId: info.prId,
              prNumber: info.prNumber,
              prTitle: currentPR.title,
              repoNameWithOwner: info.repoNameWithOwner,
              url: currentPR.url,
              authorLogin: info.authorLogin,
              authorAvatarUrl: info.authorAvatarUrl,
            },
            notificationChanges
          );

          console.log(`FollowUpService: Created ${notifications.length} notifications:`, notifications.map(n => n.id));
          result.notificationsCreated.push(...notifications);
        }

        // Update state with merge status
        updatePRState(info.prId, currentPR as PullRequestBasic, mergeStateStatus);
      }

      // Check for ready-to-merge status
      const shouldNotifyReadyToMerge = prefs.notifyOnReadyToMerge;
      if (shouldNotifyReadyToMerge) {
        const currentlyReady = isReadyToMerge(currentPR as PullRequestBasic);
        const hasExistingNotification = hasNotificationOfType(info.prId, 'ready_to_merge');

        if (currentlyReady && !hasExistingNotification) {
          // PR is ready and user doesn't have a notification → create one
          console.log(`FollowUpService: PR #${info.prNumber} is ready to merge, creating notification`);

          const notification = addNotification({
            prId: info.prId,
            prNumber: info.prNumber,
            prTitle: currentPR.title,
            repoNameWithOwner: info.repoNameWithOwner,
            url: currentPR.url,
            authorLogin: info.authorLogin,
            authorAvatarUrl: info.authorAvatarUrl,
            type: 'ready_to_merge',
            changeDetails: {},
          });

          result.notificationsCreated.push(notification);
        } else if (!currentlyReady && hasExistingNotification) {
          // PR is no longer ready but user has a notification → remove it
          console.log(`FollowUpService: PR #${info.prNumber} is no longer ready to merge, removing notification`);
          deleteNotificationsByType(info.prId, 'ready_to_merge');
        }
      }
    } catch (error) {
      console.error(`FollowUpService: Error polling PR ${info.prNumber}:`, error);
      result.errors.push(
        `Failed to poll ${info.repoNameWithOwner}#${info.prNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private showNativeNotification(result: FollowUpPollingResult): void {
    const notifications = result.notificationsCreated;

    if (notifications.length === 0) return;

    // Count unique PRs
    const uniquePRs = new Set(notifications.map(n => n.prId));
    const prCount = uniquePRs.size;
    const updateCount = notifications.length;

    // Simple, concise notification format
    const body = prCount === 1
      ? `${updateCount} update${updateCount !== 1 ? 's' : ''}`
      : `${updateCount} update${updateCount !== 1 ? 's' : ''} on ${prCount} PRs`;

    showNotification({
      title: 'PR Manager',
      body,
    });
  }

  private parseRepository(nameWithOwner: string): { owner: string; repo: string } {
    const [owner, repo] = nameWithOwner.split('/');
    return { owner, repo };
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

let followUpServiceInstance: FollowUpService | null = null;

export function initializeFollowUpService(manager: IPullRequestManager): FollowUpService {
  followUpServiceInstance = new FollowUpService(manager);
  return followUpServiceInstance;
}

export function getFollowUpService(): FollowUpService | null {
  return followUpServiceInstance;
}
