import { reactive, watch, computed } from 'vue';

export type NotificationChangeType =
  | 'new_commits'
  | 'new_comments'
  | 'new_reviews'           // Kept for backwards compatibility
  | 'review_approved'       // New: Review with approval
  | 'review_changes_requested'  // New: Review requesting changes
  | 'status_change'
  | 'merge_status_change'   // New: Change in merge status
  | 'pr_closed'
  | 'pr_merged'
  | 'ready_to_merge';

export interface InboxNotification {
  id: string;
  prId: string;
  prNumber: number;
  prTitle: string;
  repoNameWithOwner: string;
  url: string;
  authorLogin: string;
  authorAvatarUrl: string;
  type: NotificationChangeType;
  changeDetails: {
    before?: number;
    after?: number;
    count?: number;
    newStatus?: string;  // For merge_status_change notifications
  };
  createdAt: string;
  read: boolean;
}

interface NotificationInboxStoreData {
  notifications: InboxNotification[];
  lastPruned: string;
}

const STORAGE_KEY = 'pr-manager-notification-inbox';
const MAX_NOTIFICATIONS = 100;
const PRUNE_AGE_DAYS = 7;
const SAVE_DEBOUNCE_MS = 500;

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function generateNotificationId(): string {
  return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function loadNotificationInboxState(): NotificationInboxStoreData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      return {
        notifications: data.notifications || [],
        lastPruned: data.lastPruned || new Date().toISOString(),
      };
    }
  } catch (e) {
    console.error('Error loading notification inbox state:', e);
  }
  return {
    notifications: [],
    lastPruned: new Date().toISOString(),
  };
}

function saveNotificationInboxState(data: NotificationInboxStoreData): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Error saving notification inbox state:', e);
    }
  }, SAVE_DEBOUNCE_MS);
}

function pruneOldNotifications(data: NotificationInboxStoreData): void {
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - PRUNE_AGE_DAYS * 24 * 60 * 60 * 1000);

  const before = data.notifications.length;
  data.notifications = data.notifications.filter(notif => {
    const createdDate = new Date(notif.createdAt);
    return createdDate >= cutoffDate;
  });

  if (data.notifications.length > MAX_NOTIFICATIONS) {
    data.notifications = data.notifications
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, MAX_NOTIFICATIONS);
  }

  const pruned = before - data.notifications.length;
  if (pruned > 0) {
    console.log(`NotificationInboxStore: Pruned ${pruned} old notifications`);
  }

  data.lastPruned = now.toISOString();
}

const storeData = reactive<NotificationInboxStoreData>(loadNotificationInboxState());

const lastPruned = new Date(storeData.lastPruned);
const now = new Date();
if (now.getTime() - lastPruned.getTime() > 24 * 60 * 60 * 1000) {
  pruneOldNotifications(storeData);
  saveNotificationInboxState(storeData);
}

watch(
  () => ({ ...storeData }),
  (newData) => {
    saveNotificationInboxState(newData);
  },
  { deep: true }
);

export function addNotification(
  notification: Omit<InboxNotification, 'id' | 'createdAt' | 'read'>
): InboxNotification {
  const newNotification: InboxNotification = {
    ...notification,
    id: generateNotificationId(),
    createdAt: new Date().toISOString(),
    read: false,
  };

  console.log('NotificationInboxStore: Adding notification:', newNotification.id, newNotification.type);
  console.log('NotificationInboxStore: Notification details:', JSON.stringify(newNotification, null, 2));
  console.log('NotificationInboxStore: Store reference check - notifications array length before:', storeData.notifications.length);

  // Create a new array to ensure Vue's reactivity detects the change
  // This is more robust than array mutation methods like unshift
  const updatedNotifications = [newNotification, ...storeData.notifications];

  // Enforce max notifications limit
  if (updatedNotifications.length > MAX_NOTIFICATIONS) {
    storeData.notifications = updatedNotifications.slice(0, MAX_NOTIFICATIONS);
  } else {
    storeData.notifications = updatedNotifications;
  }

  console.log('NotificationInboxStore: Total notifications now:', storeData.notifications.length);
  console.log('NotificationInboxStore: Unread notifications:', storeData.notifications.filter(n => !n.read).length);
  console.log('NotificationInboxStore: First notification in array:', storeData.notifications[0]?.id);

  return newNotification;
}

export interface BatchNotificationChanges {
  newCommits?: number;
  newComments?: number;
  newReviews?: number;           // Kept for backwards compatibility
  reviewApproved?: number;       // New
  reviewChangesRequested?: number;  // New
  mergeStatusChange?: string;    // New: New merge status value
  prMerged?: boolean;            // New
}

export function addBatchNotifications(
  prInfo: {
    prId: string;
    prNumber: number;
    prTitle: string;
    repoNameWithOwner: string;
    url: string;
    authorLogin: string;
    authorAvatarUrl: string;
  },
  changes: BatchNotificationChanges
): InboxNotification[] {
  const added: InboxNotification[] = [];

  if (changes.newCommits && changes.newCommits > 0) {
    added.push(addNotification({
      ...prInfo,
      type: 'new_commits',
      changeDetails: { count: changes.newCommits },
    }));
  }

  if (changes.newComments && changes.newComments > 0) {
    added.push(addNotification({
      ...prInfo,
      type: 'new_comments',
      changeDetails: { count: changes.newComments },
    }));
  }

  // Legacy support for newReviews
  if (changes.newReviews && changes.newReviews > 0) {
    added.push(addNotification({
      ...prInfo,
      type: 'new_reviews',
      changeDetails: { count: changes.newReviews },
    }));
  }

  // New: Review approved
  if (changes.reviewApproved && changes.reviewApproved > 0) {
    added.push(addNotification({
      ...prInfo,
      type: 'review_approved',
      changeDetails: { count: changes.reviewApproved },
    }));
  }

  // New: Changes requested
  if (changes.reviewChangesRequested && changes.reviewChangesRequested > 0) {
    added.push(addNotification({
      ...prInfo,
      type: 'review_changes_requested',
      changeDetails: { count: changes.reviewChangesRequested },
    }));
  }

  // New: Merge status change
  if (changes.mergeStatusChange) {
    added.push(addNotification({
      ...prInfo,
      type: 'merge_status_change',
      changeDetails: { newStatus: changes.mergeStatusChange },
    }));
  }

  // New: PR merged
  if (changes.prMerged) {
    added.push(addNotification({
      ...prInfo,
      type: 'pr_merged',
      changeDetails: {},
    }));
  }

  return added;
}

export function markAsRead(notificationId: string): void {
  const notification = storeData.notifications.find(n => n.id === notificationId);
  if (notification) {
    notification.read = true;
  }
}

export function markAllAsRead(): void {
  for (const notification of storeData.notifications) {
    notification.read = true;
  }
}

export function markPRNotificationsAsRead(prId: string): void {
  for (const notification of storeData.notifications) {
    if (notification.prId === prId) {
      notification.read = true;
    }
  }
}

export function deleteNotification(notificationId: string): void {
  const index = storeData.notifications.findIndex(n => n.id === notificationId);
  if (index !== -1) {
    storeData.notifications.splice(index, 1);
  }
}

export function deletePRNotifications(prId: string): void {
  storeData.notifications = storeData.notifications.filter(n => n.prId !== prId);
}

export function getAllNotifications(): InboxNotification[] {
  return storeData.notifications;
}

export function getUnreadNotifications(): InboxNotification[] {
  return storeData.notifications.filter(n => !n.read);
}

export function getPRNotifications(prId: string): InboxNotification[] {
  return storeData.notifications.filter(n => n.prId === prId);
}

export function hasNotificationOfType(prId: string, type: NotificationChangeType): boolean {
  return storeData.notifications.some(n => n.prId === prId && n.type === type && !n.read);
}

export function deleteNotificationsByType(prId: string, type: NotificationChangeType): void {
  storeData.notifications = storeData.notifications.filter(
    n => !(n.prId === prId && n.type === type)
  );
}

export function getNotificationsGroupedByPR(): Map<string, InboxNotification[]> {
  const grouped = new Map<string, InboxNotification[]>();

  for (const notification of storeData.notifications) {
    const existing = grouped.get(notification.prId) || [];
    existing.push(notification);
    grouped.set(notification.prId, existing);
  }

  return grouped;
}

export function getUnreadCount(): number {
  return storeData.notifications.filter(n => !n.read).length;
}

export function clearAllNotifications(): void {
  storeData.notifications = [];
}

/**
 * Convert merge status to human-readable text
 * Works for both GitHub (mergeStateStatus) and GitLab (mapped from detailedMergeStatus)
 */
function getMergeStatusText(status: string): string {
  switch (status) {
    case 'CLEAN':
      return 'Ready';
    case 'BLOCKED':
      return 'Blocked';
    case 'BEHIND':
      return 'Behind base';
    case 'DIRTY':
      return 'Conflicts';
    case 'DRAFT':
      return 'Draft';
    case 'UNSTABLE':
      return 'Checks not passing';
    case 'UNKNOWN':
      return 'Checking...';
    default:
      return status;
  }
}

export function getNotificationTypeText(
  type: NotificationChangeType,
  count?: number,
  newStatus?: string
): string {
  switch (type) {
    case 'new_commits':
      return count === 1 ? '1 new commit' : `${count} new commits`;
    case 'new_comments':
      return count === 1 ? '1 new comment' : `${count} new comments`;
    case 'new_reviews':
      return count === 1 ? '1 new review' : `${count} new reviews`;
    case 'review_approved':
      return count === 1 ? 'Approved' : `${count} approvals`;
    case 'review_changes_requested':
      return count === 1 ? 'Changes requested' : `${count} change requests`;
    case 'status_change':
      return 'Status changed';
    case 'merge_status_change':
      return newStatus ? getMergeStatusText(newStatus) : 'Status changed';
    case 'pr_closed':
      return 'PR closed';
    case 'pr_merged':
      return 'PR merged';
    case 'ready_to_merge':
      return 'Ready to merge';
    default:
      return 'Update';
  }
}

export const unreadCount = computed(() =>
  storeData.notifications.filter(n => !n.read).length
);

export const totalCount = computed(() => storeData.notifications.length);

export const notificationsList = computed(() => storeData.notifications);

export const unreadNotificationsList = computed(() =>
  storeData.notifications.filter(n => !n.read)
);

export const hasNotifications = computed(() => storeData.notifications.length > 0);

export const hasUnread = computed(() => storeData.notifications.some(n => !n.read));

export const notificationInboxStore = storeData;
