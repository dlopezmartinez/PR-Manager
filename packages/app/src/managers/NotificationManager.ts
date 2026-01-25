import type { PullRequestBasic } from '../model/types';
import { showNotification, isElectron } from '../utils/electron';
import { notificationLogger } from '../utils/logger';

export interface NotificationState {
  prIds: Set<string>;
  commentCounts: Map<string, number>;
  totalPRs: number;
  totalComments: number;
}

export interface NotificationChanges {
  newPRs: PullRequestBasic[];
  prsWithNewComments: Array<{
    pr: PullRequestBasic;
    newCommentsCount: number;
  }>;
}

export interface NotificationConfig {
  enabled: boolean;
  notifyOnNewPR: boolean;
  notifyOnNewComments: boolean;
}

export class NotificationManager {
  private previousState: NotificationState | null = null;
  private config: NotificationConfig = {
    enabled: true,
    notifyOnNewPR: true,
    notifyOnNewComments: true,
  };

  private readonly isElectronEnv: boolean;

  constructor() {
    this.isElectronEnv = isElectron();
    if (!this.isElectronEnv) {
      notificationLogger.warn('Not running in Electron, notifications may be limited');
    }
  }

  updateConfig(config: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async processUpdate(prs: PullRequestBasic[]): Promise<void> {
    const currentState = this.buildState(prs);

    if (!this.previousState) {
      this.previousState = currentState;
      return;
    }

    const changes = this.detectChanges(prs, this.previousState, currentState);

    notificationLogger.debug(
      `Changes detected: ${changes.newPRs.length} new PRs, ${changes.prsWithNewComments.length} PRs with new comments`
    );

    if (this.config.enabled) {
      if (changes.newPRs.length > 0 || changes.prsWithNewComments.length > 0) {
        notificationLogger.debug('Sending notifications for detected changes...');
      }
      await this.showNotifications(changes);
    }

    this.previousState = currentState;
  }

  private buildState(prs: PullRequestBasic[]): NotificationState {
    const prIds = new Set<string>();
    const commentCounts = new Map<string, number>();
    let totalComments = 0;

    for (const pr of prs) {
      prIds.add(pr.id);

      const regularComments = pr.comments?.totalCount ?? 0;
      const reviewComments = pr.reviews?.nodes?.reduce(
        (sum, review) => sum + (review.comments?.totalCount ?? 0),
        0
      ) ?? 0;
      const total = regularComments + reviewComments;

      commentCounts.set(pr.id, total);
      totalComments += total;
    }

    return {
      prIds,
      commentCounts,
      totalPRs: prs.length,
      totalComments,
    };
  }

  private detectChanges(
    prs: PullRequestBasic[],
    previous: NotificationState,
    current: NotificationState
  ): NotificationChanges {
    const newPRs: PullRequestBasic[] = [];
    const prsWithNewComments: NotificationChanges['prsWithNewComments'] = [];

    for (const pr of prs) {
      if (!previous.prIds.has(pr.id)) {
        newPRs.push(pr);
        continue;
      }

      const previousCount = previous.commentCounts.get(pr.id) ?? 0;
      const currentCount = current.commentCounts.get(pr.id) ?? 0;

      if (currentCount > previousCount) {
        prsWithNewComments.push({
          pr,
          newCommentsCount: currentCount - previousCount,
        });
      }
    }

    return { newPRs, prsWithNewComments };
  }

  private async showNotifications(changes: NotificationChanges): Promise<void> {
    const { newPRs, prsWithNewComments } = changes;

    if (this.config.notifyOnNewPR && newPRs.length > 0) {
      await this.showNewPRsNotification(newPRs);
    }

    if (this.config.notifyOnNewComments && prsWithNewComments.length > 0) {
      await this.showNewCommentsNotification(prsWithNewComments);
    }
  }

  private async showNewPRsNotification(newPRs: PullRequestBasic[]): Promise<void> {
    if (newPRs.length === 1) {
      const pr = newPRs[0];
      await this.sendNotification({
        title: 'New Pull Request',
        body: `${pr.author.login}: ${pr.title}`,
        subtitle: pr.repository.nameWithOwner,
        url: pr.url,
      });
    } else {
      await this.sendNotification({
        title: 'New Pull Requests',
        body: `You have ${newPRs.length} new PRs to review`,
        subtitle: newPRs.map(pr => pr.repository.nameWithOwner).join(', '),
      });
    }
  }

  private async showNewCommentsNotification(
    prsWithNewComments: NotificationChanges['prsWithNewComments']
  ): Promise<void> {
    const totalNewComments = prsWithNewComments.reduce(
      (sum, item) => sum + item.newCommentsCount,
      0
    );

    if (prsWithNewComments.length === 1) {
      const { pr, newCommentsCount } = prsWithNewComments[0];
      const commentText = newCommentsCount === 1 ? 'comment' : 'comments';
      await this.sendNotification({
        title: `${newCommentsCount} new ${commentText}`,
        body: pr.title,
        subtitle: `${pr.repository.nameWithOwner} #${pr.number}`,
        url: pr.url,
      });
    } else {
      const commentText = totalNewComments === 1 ? 'comment' : 'comments';
      await this.sendNotification({
        title: `${totalNewComments} new ${commentText}`,
        body: `In ${prsWithNewComments.length} pull requests`,
        subtitle: prsWithNewComments.map(item => `#${item.pr.number}`).join(', '),
      });
    }
  }

  private async sendNotification(options: {
    title: string;
    body: string;
    subtitle?: string;
    url?: string;
  }): Promise<void> {
    if (!this.isElectronEnv) {
      this.showWebNotification(options);
      return;
    }

    notificationLogger.debug('Sending notification', options);
    showNotification(options);
  }

  private showWebNotification(options: {
    title: string;
    body: string;
    url?: string;
  }): void {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      const notification = new Notification(options.title, {
        body: options.body,
        icon: '/icon.png',
      });

      if (options.url) {
        notification.onclick = () => {
          window.open(options.url, '_blank');
        };
      }
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }

  reset(): void {
    this.previousState = null;
  }

  getState(): NotificationState | null {
    return this.previousState;
  }
}

export const notificationManager = new NotificationManager();
