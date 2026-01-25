import type { PullRequestBasic, PullRequest, MergeStateStatus } from '../model/types';
import type { IPullRequestManager } from '../providers/interfaces';
import {
  getFollowedPRs,
  detectChanges,
  updatePRState,
  removeClosedPR,
  type FollowedPRInfo,
} from '../stores/followUpStore';
import {
  addBatchNotifications,
  addNotification,
  hasNotificationOfType,
  deleteNotificationsByType,
  type InboxNotification,
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

      if (result.changesDetected > 0 && configStore.notificationsEnabled) {
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

      if (currentPR.state !== 'OPEN') {
        removeClosedPR(info.prId);
        addBatchNotifications(
          {
            prId: info.prId,
            prNumber: info.prNumber,
            prTitle: currentPR.title,
            repoNameWithOwner: info.repoNameWithOwner,
            url: info.url,
            authorLogin: info.authorLogin,
            authorAvatarUrl: info.authorAvatarUrl,
          },
          {}
        );
        return;
      }

      const changes = detectChanges(info.prId, currentPR as PullRequestBasic);
      const prefs = info.notificationPrefs;

      console.log(`FollowUpService: PR #${info.prNumber} changes:`, changes);
      console.log(`FollowUpService: PR #${info.prNumber} prefs:`, prefs);

      if (changes.hasChanges) {
        result.changesDetected++;

        const notificationChanges: {
          newCommits?: number;
          newComments?: number;
          newReviews?: number;
        } = {};

        // Respect per-PR notification preferences, with fallback to global settings
        const shouldNotifyCommits = prefs?.notifyOnCommits ?? configStore.followUpNotifyOnCommits;
        const shouldNotifyComments = prefs?.notifyOnComments ?? configStore.followUpNotifyOnComments;
        const shouldNotifyReviews = prefs?.notifyOnReviews ?? configStore.followUpNotifyOnReviews;

        if (changes.newCommits && shouldNotifyCommits) {
          notificationChanges.newCommits = changes.newCommits;
        }
        if (changes.newComments && shouldNotifyComments) {
          notificationChanges.newComments = changes.newComments;
        }
        if (changes.newReviews && shouldNotifyReviews) {
          notificationChanges.newReviews = changes.newReviews;
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

        updatePRState(info.prId, currentPR as PullRequestBasic);
      }

      // Check for ready-to-merge status
      const shouldNotifyReadyToMerge = prefs?.notifyOnReadyToMerge ?? true;
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

    const uniquePRs = new Map<string, typeof notifications[0]>();
    for (const notif of notifications) {
      if (!uniquePRs.has(notif.prId)) {
        uniquePRs.set(notif.prId, notif);
      }
    }

    if (uniquePRs.size === 1) {
      const notif = notifications[0];
      const changeText = this.formatChangeText(notifications);

      showNotification({
        title: 'PR Update',
        body: `${notif.prTitle}`,
        subtitle: `${notif.repoNameWithOwner} • ${changeText}`,
        url: notif.url,
      });
    } else {
      showNotification({
        title: 'PR Updates',
        body: `${uniquePRs.size} followed PRs have updates`,
        subtitle: Array.from(uniquePRs.values())
          .map((n) => `#${n.prNumber}`)
          .join(', '),
      });
    }
  }

  private formatChangeText(notifications: InboxNotification[]): string {
    const parts: string[] = [];

    const commits = notifications.filter((n) => n.type === 'new_commits');
    const comments = notifications.filter((n) => n.type === 'new_comments');
    const reviews = notifications.filter((n) => n.type === 'new_reviews');

    if (commits.length > 0) {
      const count = commits.reduce((sum, n) => sum + (n.changeDetails.count || 0), 0);
      parts.push(`${count} commit${count !== 1 ? 's' : ''}`);
    }

    if (comments.length > 0) {
      const count = comments.reduce((sum, n) => sum + (n.changeDetails.count || 0), 0);
      parts.push(`${count} comment${count !== 1 ? 's' : ''}`);
    }

    if (reviews.length > 0) {
      const count = reviews.reduce((sum, n) => sum + (n.changeDetails.count || 0), 0);
      parts.push(`${count} review${count !== 1 ? 's' : ''}`);
    }

    return parts.join(', ') || 'Updates';
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
