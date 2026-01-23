/**
 * Tests for notificationInboxStore.ts
 * Tests notification inbox functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// We need to reset modules before importing to get fresh state
let notificationInboxStore: typeof import('../../src/stores/notificationInboxStore');

// Mock notification data
const mockPRInfo = {
  prId: 'PR_123',
  prNumber: 42,
  prTitle: 'Test PR',
  repoNameWithOwner: 'owner/repo',
  url: 'https://github.com/owner/repo/pull/42',
  authorLogin: 'testuser',
  authorAvatarUrl: 'https://github.com/testuser.png',
};

describe('notificationInboxStore', () => {
  beforeEach(async () => {
    // Clear localStorage
    localStorage.clear();

    // Reset modules to get fresh store state
    vi.resetModules();

    // Re-import the store
    notificationInboxStore = await import('../../src/stores/notificationInboxStore');
  });

  describe('initial state', () => {
    it('should start with no notifications', () => {
      expect(notificationInboxStore.getAllNotifications()).toEqual([]);
      expect(notificationInboxStore.getUnreadCount()).toBe(0);
    });

    it('should have hasNotifications as false initially', () => {
      expect(notificationInboxStore.hasNotifications.value).toBe(false);
    });

    it('should have hasUnread as false initially', () => {
      expect(notificationInboxStore.hasUnread.value).toBe(false);
    });
  });

  describe('addNotification', () => {
    it('should add a notification', () => {
      const notification = notificationInboxStore.addNotification({
        ...mockPRInfo,
        type: 'new_commits',
        changeDetails: { count: 3 },
      });

      expect(notification.id).toBeDefined();
      expect(notification.read).toBe(false);
      expect(notification.createdAt).toBeDefined();
      expect(notificationInboxStore.getAllNotifications()).toHaveLength(1);
    });

    it('should add notification at the beginning (most recent first)', () => {
      notificationInboxStore.addNotification({
        ...mockPRInfo,
        type: 'new_commits',
        changeDetails: { count: 1 },
      });

      const secondNotification = notificationInboxStore.addNotification({
        ...mockPRInfo,
        prId: 'PR_456',
        type: 'new_comments',
        changeDetails: { count: 2 },
      });

      const all = notificationInboxStore.getAllNotifications();
      expect(all[0].id).toBe(secondNotification.id);
    });

    it('should enforce max notifications limit', () => {
      // Add 105 notifications (limit is 100)
      for (let i = 0; i < 105; i++) {
        notificationInboxStore.addNotification({
          ...mockPRInfo,
          prId: `PR_${i}`,
          type: 'new_commits',
          changeDetails: { count: 1 },
        });
      }

      expect(notificationInboxStore.getAllNotifications().length).toBeLessThanOrEqual(100);
    });
  });

  describe('addBatchNotifications', () => {
    it('should add multiple notifications for different change types', () => {
      const notifications = notificationInboxStore.addBatchNotifications(mockPRInfo, {
        newCommits: 3,
        newComments: 2,
        newReviews: 1,
      });

      expect(notifications).toHaveLength(3);
      expect(notificationInboxStore.getAllNotifications()).toHaveLength(3);
    });

    it('should only add notifications for non-zero changes', () => {
      const notifications = notificationInboxStore.addBatchNotifications(mockPRInfo, {
        newCommits: 2,
        newComments: 0,
        newReviews: 0,
      });

      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('new_commits');
    });

    it('should return empty array for no changes', () => {
      const notifications = notificationInboxStore.addBatchNotifications(mockPRInfo, {});

      expect(notifications).toHaveLength(0);
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read', () => {
      const notification = notificationInboxStore.addNotification({
        ...mockPRInfo,
        type: 'new_commits',
        changeDetails: { count: 1 },
      });

      expect(notification.read).toBe(false);
      notificationInboxStore.markAsRead(notification.id);

      const updated = notificationInboxStore.getAllNotifications().find(n => n.id === notification.id);
      expect(updated?.read).toBe(true);
    });

    it('should not throw for non-existent notification', () => {
      expect(() => notificationInboxStore.markAsRead('non-existent')).not.toThrow();
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', () => {
      notificationInboxStore.addNotification({ ...mockPRInfo, type: 'new_commits', changeDetails: { count: 1 } });
      notificationInboxStore.addNotification({ ...mockPRInfo, type: 'new_comments', changeDetails: { count: 1 } });

      expect(notificationInboxStore.getUnreadCount()).toBe(2);

      notificationInboxStore.markAllAsRead();

      expect(notificationInboxStore.getUnreadCount()).toBe(0);
      expect(notificationInboxStore.getAllNotifications().every(n => n.read)).toBe(true);
    });
  });

  describe('markPRNotificationsAsRead', () => {
    it('should mark all notifications for a specific PR as read', () => {
      notificationInboxStore.addNotification({ ...mockPRInfo, prId: 'PR_1', type: 'new_commits', changeDetails: { count: 1 } });
      notificationInboxStore.addNotification({ ...mockPRInfo, prId: 'PR_1', type: 'new_comments', changeDetails: { count: 1 } });
      notificationInboxStore.addNotification({ ...mockPRInfo, prId: 'PR_2', type: 'new_commits', changeDetails: { count: 1 } });

      notificationInboxStore.markPRNotificationsAsRead('PR_1');

      const all = notificationInboxStore.getAllNotifications();
      const pr1Notifications = all.filter(n => n.prId === 'PR_1');
      const pr2Notifications = all.filter(n => n.prId === 'PR_2');

      expect(pr1Notifications.every(n => n.read)).toBe(true);
      expect(pr2Notifications.every(n => !n.read)).toBe(true);
    });
  });

  describe('deleteNotification', () => {
    it('should delete a notification', () => {
      const notification = notificationInboxStore.addNotification({
        ...mockPRInfo,
        type: 'new_commits',
        changeDetails: { count: 1 },
      });

      notificationInboxStore.deleteNotification(notification.id);

      expect(notificationInboxStore.getAllNotifications()).toHaveLength(0);
    });
  });

  describe('deletePRNotifications', () => {
    it('should delete all notifications for a specific PR', () => {
      notificationInboxStore.addNotification({ ...mockPRInfo, prId: 'PR_1', type: 'new_commits', changeDetails: { count: 1 } });
      notificationInboxStore.addNotification({ ...mockPRInfo, prId: 'PR_1', type: 'new_comments', changeDetails: { count: 1 } });
      notificationInboxStore.addNotification({ ...mockPRInfo, prId: 'PR_2', type: 'new_commits', changeDetails: { count: 1 } });

      notificationInboxStore.deletePRNotifications('PR_1');

      const all = notificationInboxStore.getAllNotifications();
      expect(all).toHaveLength(1);
      expect(all[0].prId).toBe('PR_2');
    });
  });

  describe('getUnreadNotifications', () => {
    it('should return only unread notifications', () => {
      const n1 = notificationInboxStore.addNotification({ ...mockPRInfo, prId: 'PR_1', type: 'new_commits', changeDetails: { count: 1 } });
      notificationInboxStore.addNotification({ ...mockPRInfo, prId: 'PR_2', type: 'new_commits', changeDetails: { count: 1 } });

      notificationInboxStore.markAsRead(n1.id);

      const unread = notificationInboxStore.getUnreadNotifications();
      expect(unread).toHaveLength(1);
      expect(unread[0].prId).toBe('PR_2');
    });
  });

  describe('getPRNotifications', () => {
    it('should return notifications for a specific PR', () => {
      notificationInboxStore.addNotification({ ...mockPRInfo, prId: 'PR_1', type: 'new_commits', changeDetails: { count: 1 } });
      notificationInboxStore.addNotification({ ...mockPRInfo, prId: 'PR_1', type: 'new_comments', changeDetails: { count: 2 } });
      notificationInboxStore.addNotification({ ...mockPRInfo, prId: 'PR_2', type: 'new_commits', changeDetails: { count: 3 } });

      const pr1Notifications = notificationInboxStore.getPRNotifications('PR_1');
      expect(pr1Notifications).toHaveLength(2);
    });
  });

  describe('getNotificationsGroupedByPR', () => {
    it('should group notifications by PR', () => {
      notificationInboxStore.addNotification({ ...mockPRInfo, prId: 'PR_1', type: 'new_commits', changeDetails: { count: 1 } });
      notificationInboxStore.addNotification({ ...mockPRInfo, prId: 'PR_1', type: 'new_comments', changeDetails: { count: 1 } });
      notificationInboxStore.addNotification({ ...mockPRInfo, prId: 'PR_2', type: 'new_commits', changeDetails: { count: 1 } });

      const grouped = notificationInboxStore.getNotificationsGroupedByPR();

      expect(grouped.size).toBe(2);
      expect(grouped.get('PR_1')).toHaveLength(2);
      expect(grouped.get('PR_2')).toHaveLength(1);
    });
  });

  describe('clearAllNotifications', () => {
    it('should remove all notifications', () => {
      notificationInboxStore.addNotification({ ...mockPRInfo, type: 'new_commits', changeDetails: { count: 1 } });
      notificationInboxStore.addNotification({ ...mockPRInfo, type: 'new_comments', changeDetails: { count: 1 } });

      notificationInboxStore.clearAllNotifications();

      expect(notificationInboxStore.getAllNotifications()).toHaveLength(0);
    });
  });

  describe('getNotificationTypeText', () => {
    it('should return correct text for new commits', () => {
      expect(notificationInboxStore.getNotificationTypeText('new_commits', 1)).toBe('1 new commit');
      expect(notificationInboxStore.getNotificationTypeText('new_commits', 3)).toBe('3 new commits');
    });

    it('should return correct text for new comments', () => {
      expect(notificationInboxStore.getNotificationTypeText('new_comments', 1)).toBe('1 new comment');
      expect(notificationInboxStore.getNotificationTypeText('new_comments', 5)).toBe('5 new comments');
    });

    it('should return correct text for new reviews', () => {
      expect(notificationInboxStore.getNotificationTypeText('new_reviews', 1)).toBe('1 new review');
      expect(notificationInboxStore.getNotificationTypeText('new_reviews', 2)).toBe('2 new reviews');
    });

    it('should return correct text for status changes', () => {
      expect(notificationInboxStore.getNotificationTypeText('status_change')).toBe('Status changed');
      expect(notificationInboxStore.getNotificationTypeText('pr_closed')).toBe('PR closed');
      expect(notificationInboxStore.getNotificationTypeText('pr_merged')).toBe('PR merged');
    });
  });

  describe('reactive computeds', () => {
    it('unreadCount should be reactive', () => {
      expect(notificationInboxStore.unreadCount.value).toBe(0);

      const n = notificationInboxStore.addNotification({ ...mockPRInfo, type: 'new_commits', changeDetails: { count: 1 } });
      expect(notificationInboxStore.unreadCount.value).toBe(1);

      notificationInboxStore.markAsRead(n.id);
      expect(notificationInboxStore.unreadCount.value).toBe(0);
    });

    it('totalCount should be reactive', () => {
      expect(notificationInboxStore.totalCount.value).toBe(0);

      notificationInboxStore.addNotification({ ...mockPRInfo, type: 'new_commits', changeDetails: { count: 1 } });
      expect(notificationInboxStore.totalCount.value).toBe(1);
    });

    it('hasNotifications should be reactive', () => {
      expect(notificationInboxStore.hasNotifications.value).toBe(false);

      notificationInboxStore.addNotification({ ...mockPRInfo, type: 'new_commits', changeDetails: { count: 1 } });
      expect(notificationInboxStore.hasNotifications.value).toBe(true);
    });

    it('hasUnread should be reactive', () => {
      expect(notificationInboxStore.hasUnread.value).toBe(false);

      const n = notificationInboxStore.addNotification({ ...mockPRInfo, type: 'new_commits', changeDetails: { count: 1 } });
      expect(notificationInboxStore.hasUnread.value).toBe(true);

      notificationInboxStore.markAsRead(n.id);
      expect(notificationInboxStore.hasUnread.value).toBe(false);
    });

    it('notificationsList should be reactive', () => {
      expect(notificationInboxStore.notificationsList.value).toHaveLength(0);

      notificationInboxStore.addNotification({ ...mockPRInfo, type: 'new_commits', changeDetails: { count: 1 } });
      expect(notificationInboxStore.notificationsList.value).toHaveLength(1);
    });
  });

  describe('persistence', () => {
    it('should persist notifications to localStorage', async () => {
      notificationInboxStore.addNotification({ ...mockPRInfo, type: 'new_commits', changeDetails: { count: 1 } });

      // Wait for debounced save
      await new Promise(resolve => setTimeout(resolve, 600));

      const stored = localStorage.getItem('pr-manager-notification-inbox');
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed.notifications).toHaveLength(1);
    });

    it('should load notifications from localStorage on init', async () => {
      // Pre-populate localStorage
      const storedData = {
        notifications: [
          {
            id: 'notif_stored',
            prId: 'PR_stored',
            prNumber: 99,
            prTitle: 'Stored Notification',
            repoNameWithOwner: 'owner/repo',
            url: 'https://github.com/owner/repo/pull/99',
            authorLogin: 'user',
            authorAvatarUrl: 'https://github.com/user.png',
            type: 'new_commits',
            changeDetails: { count: 1 },
            createdAt: new Date().toISOString(),
            read: false,
          },
        ],
        lastPruned: new Date().toISOString(),
      };
      localStorage.setItem('pr-manager-notification-inbox', JSON.stringify(storedData));

      // Re-import store to load from localStorage
      vi.resetModules();
      notificationInboxStore = await import('../../src/stores/notificationInboxStore');

      expect(notificationInboxStore.getAllNotifications()).toHaveLength(1);
      expect(notificationInboxStore.getAllNotifications()[0].id).toBe('notif_stored');
    });
  });
});
