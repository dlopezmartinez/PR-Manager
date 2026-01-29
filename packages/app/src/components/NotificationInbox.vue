<template>
  <div class="notification-inbox">
    <div v-if="!hasUnreadNotifications" class="empty-state">
      <div class="empty-icon">
        <Bell :size="48" :stroke-width="1.5" />
      </div>
      <h3>No notifications yet</h3>
      <p class="empty-description">
        Follow PRs to get notified when they have new commits, comments, or reviews.
      </p>
      <div class="how-to">
        <h4>How to follow a PR:</h4>
        <ol>
          <li>Go to any view with PRs</li>
          <li>Click the <BellOff :size="14" :stroke-width="2" class="inline-icon" /> icon on a PR card</li>
          <li>The icon will change to <Bell :size="14" :stroke-width="2" class="inline-icon active" /> when following</li>
        </ol>
      </div>
      <div v-if="followedCount > 0" class="following-info">
        <Eye :size="14" :stroke-width="2" />
        <span>You're following {{ followedCount }} PR{{ followedCount !== 1 ? 's' : '' }}</span>
      </div>
    </div>

    <div v-else class="notifications-container">
      <div class="notifications-header">
        <span class="notifications-count">
          {{ unreadCount }} notification{{ unreadCount !== 1 ? 's' : '' }}
        </span>
        <div class="header-actions">
          <button
            class="action-btn"
            @click="handleDismissAll"
            title="Dismiss all notifications"
          >
            <CheckCheck :size="14" :stroke-width="2" />
            Dismiss all
          </button>
        </div>
      </div>

      <div class="notifications-list">
        <NotificationItem
          v-for="notification in unreadNotifications"
          :key="notification.id"
          :notification="notification"
          :is-merging="mergingPrId === notification.prId"
          :can-merge="hasWritePermissions()"
          :allowed-merge-methods="allowedMethodsMap.get(notification.prId) || ['MERGE']"
          @click="handleNotificationClick(notification)"
          @dismiss="handleDismiss(notification.id)"
          @merge="(method) => handleMerge(notification, method)"
        />
      </div>
    </div>

    <!-- Status Changed Modal -->
    <Transition name="fade">
      <div v-if="statusChangedModal.visible" class="status-modal-overlay" @click="closeStatusModal">
        <div class="status-modal" @click.stop>
          <div class="status-modal-icon">
            <AlertCircle :size="32" :stroke-width="1.5" />
          </div>
          <h3>Cannot Merge</h3>
          <p>{{ statusChangedModal.message }}</p>
          <div class="status-modal-actions">
            <button class="modal-btn secondary" @click="openInBrowser">
              <ExternalLink :size="14" :stroke-width="2" />
              Open in Browser
            </button>
            <button class="modal-btn primary" @click="closeStatusModal">
              Dismiss
            </button>
          </div>
          <div class="auto-close-indicator">
            <div class="auto-close-bar" :style="{ width: `${autoCloseProgress}%` }" />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, onUnmounted, watch } from 'vue';
import { Bell, BellOff, Eye, CheckCheck, AlertCircle, ExternalLink } from 'lucide-vue-next';
import NotificationItem from './NotificationItem.vue';
import {
  notificationInboxStore,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  type InboxNotification,
} from '../stores/notificationInboxStore';
import { followedCount, removeClosedPR } from '../stores/followUpStore';
import { openExternal } from '../utils/electron';
import { useGitProvider } from '../composables/useGitProvider';
import { useQuickActions } from '../composables/useQuickActions';
import type { MergeMethod } from '../model/mutation-types';

const provider = useGitProvider();
const { hasWritePermissions } = useQuickActions();
const mergingPrId = ref<string | null>(null);

// Store allowed merge methods per PR ID
const allowedMethodsMap = ref<Map<string, MergeMethod[]>>(new Map());
const fetchingMethodsFor = ref<Set<string>>(new Set());

// Status changed modal state
const statusChangedModal = reactive({
  visible: false,
  message: '',
  notificationId: '',
  url: '',
});
const autoCloseProgress = ref(100);
let autoCloseTimer: ReturnType<typeof setInterval> | null = null;
let autoCloseTimeout: ReturnType<typeof setTimeout> | null = null;

const AUTO_CLOSE_DURATION = 5000; // 5 seconds
const PROGRESS_UPDATE_INTERVAL = 50; // Update progress every 50ms

// Use local computeds that directly access the reactive store
// This ensures proper reactivity tracking within the component
const unreadNotifications = computed(() =>
  notificationInboxStore.notifications.filter(n => !n.read)
);
const hasUnreadNotifications = computed(() =>
  notificationInboxStore.notifications.some(n => !n.read)
);
const unreadCount = computed(() =>
  notificationInboxStore.notifications.filter(n => !n.read).length
);

// Fetch allowed merge methods for ready_to_merge notifications
async function fetchAllowedMergeMethods(notification: InboxNotification) {
  if (notification.type !== 'ready_to_merge') return;
  if (allowedMethodsMap.value.has(notification.prId)) return;
  if (fetchingMethodsFor.value.has(notification.prId)) return;

  fetchingMethodsFor.value.add(notification.prId);

  try {
    const [owner, repo] = notification.repoNameWithOwner.split('/');
    const prStatus = await provider.actions.getPRNodeId(owner, repo, notification.prNumber);

    if (prStatus.allowedMergeMethods && prStatus.allowedMergeMethods.length > 0) {
      allowedMethodsMap.value.set(notification.prId, prStatus.allowedMergeMethods);
    } else {
      // Fallback to MERGE if no methods returned
      allowedMethodsMap.value.set(notification.prId, ['MERGE']);
    }
  } catch (error) {
    console.error('Failed to fetch allowed merge methods:', error);
    // Fallback to MERGE on error
    allowedMethodsMap.value.set(notification.prId, ['MERGE']);
  } finally {
    fetchingMethodsFor.value.delete(notification.prId);
  }
}

// Watch for ready_to_merge notifications and fetch their allowed methods
watch(
  unreadNotifications,
  (notifications) => {
    for (const notification of notifications) {
      if (notification.type === 'ready_to_merge') {
        fetchAllowedMergeMethods(notification);
      }
    }
  },
  { immediate: true }
);

function handleNotificationClick(notification: InboxNotification) {
  markAsRead(notification.id);
  openExternal(notification.url).catch(console.error);
}

function handleDismiss(notificationId: string) {
  markAsRead(notificationId);
}

function handleDismissAll() {
  markAllAsRead();
}

function getMergeStatusMessage(mergeStatus: string): string {
  switch (mergeStatus) {
    case 'BLOCKED':
      return 'The PR is blocked by branch protection rules. Required checks may have failed or reviews are still needed.';
    case 'BEHIND':
      return 'The branch is behind the base branch and needs to be updated.';
    case 'DIRTY':
      return 'The PR has merge conflicts that need to be resolved.';
    case 'DRAFT':
      return 'The PR is still a draft and cannot be merged.';
    case 'UNSTABLE':
      return 'Some checks are not passing (failed or skipped). The PR may still be mergeable depending on repository settings.';
    case 'UNKNOWN':
      return 'The merge status is being calculated. Please try again in a moment.';
    default:
      return `The PR status has changed (${mergeStatus}) and it can no longer be merged.`;
  }
}

function showStatusChangedModal(notification: InboxNotification, message: string) {
  statusChangedModal.visible = true;
  statusChangedModal.message = message;
  statusChangedModal.notificationId = notification.id;
  statusChangedModal.url = notification.url;
  autoCloseProgress.value = 100;

  // Start auto-close countdown
  const startTime = Date.now();
  autoCloseTimer = setInterval(() => {
    const elapsed = Date.now() - startTime;
    autoCloseProgress.value = Math.max(0, 100 - (elapsed / AUTO_CLOSE_DURATION) * 100);
  }, PROGRESS_UPDATE_INTERVAL);

  autoCloseTimeout = setTimeout(() => {
    closeStatusModal();
  }, AUTO_CLOSE_DURATION);
}

function closeStatusModal() {
  // Clear timers
  if (autoCloseTimer) {
    clearInterval(autoCloseTimer);
    autoCloseTimer = null;
  }
  if (autoCloseTimeout) {
    clearTimeout(autoCloseTimeout);
    autoCloseTimeout = null;
  }

  // Delete the notification since the status has changed
  if (statusChangedModal.notificationId) {
    deleteNotification(statusChangedModal.notificationId);
  }

  // Reset modal state
  statusChangedModal.visible = false;
  statusChangedModal.message = '';
  statusChangedModal.notificationId = '';
  statusChangedModal.url = '';
  autoCloseProgress.value = 100;
}

function openInBrowser() {
  if (statusChangedModal.url) {
    openExternal(statusChangedModal.url).catch(console.error);
  }
  closeStatusModal();
}

async function handleMerge(notification: InboxNotification, method: MergeMethod) {
  if (mergingPrId.value) return; // Prevent double-click

  mergingPrId.value = notification.prId;

  try {
    // First, verify the PR can still be merged
    const [owner, repo] = notification.repoNameWithOwner.split('/');
    const prStatus = await provider.actions.getPRNodeId(owner, repo, notification.prNumber);

    console.log('Pre-merge status check:', prStatus);

    if (!prStatus.canMerge) {
      // Status has changed, show modal and don't attempt merge
      console.log('PR cannot be merged, status:', prStatus.mergeable);
      const message = getMergeStatusMessage(prStatus.mergeable);
      showStatusChangedModal(notification, message);
      return;
    }

    // Verify the selected method is still allowed
    if (!prStatus.allowedMergeMethods.includes(method)) {
      console.warn(`Method ${method} no longer allowed, using first available: ${prStatus.allowedMergeMethods[0]}`);
      method = prStatus.allowedMergeMethods[0] || 'MERGE';
    }

    // Status is good, proceed with merge using the selected method
    const result = await provider.actions.mergePullRequest(notification.prId, {
      mergeMethod: method,
    });

    if (result.success) {
      console.log('PR merged successfully:', result.data);
      // Remove the notification and unfollow the PR since it's now merged
      deleteNotification(notification.id);
      removeClosedPR(notification.prId);
    } else {
      console.error('Failed to merge PR:', result.error);
      // Check if it's a status-related error
      if (result.error?.includes('not mergeable') || result.error?.includes('status')) {
        showStatusChangedModal(notification, result.error);
      } else {
        // Generic error, show alert and open in browser
        alert(`Failed to merge: ${result.error}\n\nOpening PR in browser...`);
        openExternal(notification.url).catch(console.error);
      }
    }
  } catch (error) {
    console.error('Error merging PR:', error);
    alert(`Error merging PR: ${error instanceof Error ? error.message : 'Unknown error'}\n\nOpening PR in browser...`);
    openExternal(notification.url).catch(console.error);
  } finally {
    mergingPrId.value = null;
  }
}

// Cleanup timers on unmount
onUnmounted(() => {
  if (autoCloseTimer) {
    clearInterval(autoCloseTimer);
  }
  if (autoCloseTimeout) {
    clearTimeout(autoCloseTimeout);
  }
});
</script>

<style scoped>
.notification-inbox {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: var(--spacing-md);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--spacing-xl) var(--spacing-lg);
  color: var(--color-text-secondary);
  flex: 1;
}

.empty-icon {
  color: var(--color-text-tertiary);
  margin-bottom: var(--spacing-lg);
  opacity: 0.5;
}

.empty-state h3 {
  margin: 0 0 var(--spacing-sm) 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.empty-description {
  margin: 0 0 var(--spacing-lg) 0;
  font-size: 13px;
  max-width: 280px;
  line-height: 1.5;
}

.how-to {
  background: var(--color-surface-primary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
  text-align: left;
  width: 100%;
  max-width: 300px;
}

.how-to h4 {
  margin: 0 0 var(--spacing-sm) 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.how-to ol {
  margin: 0;
  padding-left: var(--spacing-lg);
  font-size: 12px;
  line-height: 1.8;
}

.how-to li {
  color: var(--color-text-secondary);
}

.inline-icon {
  display: inline-block;
  vertical-align: middle;
  margin: 0 2px;
  color: var(--color-text-tertiary);
}

.inline-icon.active {
  color: var(--color-accent-primary);
}

.following-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-lg);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-accent-light);
  border-radius: var(--radius-md);
  font-size: 12px;
  color: var(--color-accent-primary);
}

.notifications-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.notifications-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: var(--spacing-md);
  border-bottom: 1px solid var(--color-border-tertiary);
  margin-bottom: var(--spacing-md);
}

.notifications-count {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.header-actions {
  display: flex;
  gap: var(--spacing-sm);
}

.action-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  border: none;
  background: var(--color-surface-primary);
  border-radius: var(--radius-md);
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.action-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.action-btn.danger:hover {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.notifications-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

/* Status Changed Modal */
.status-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--spacing-lg);
}

.status-modal {
  background: var(--color-bg-elevated);
  border-radius: var(--radius-xl);
  padding: var(--spacing-xl);
  max-width: 400px;
  width: 100%;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  position: relative;
  overflow: hidden;
}

.status-modal-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin: 0 auto var(--spacing-md);
  background: var(--color-warning-bg);
  border-radius: 50%;
  color: var(--color-warning);
}

.status-modal h3 {
  margin: 0 0 var(--spacing-sm);
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.status-modal p {
  margin: 0 0 var(--spacing-lg);
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}

.status-modal-actions {
  display: flex;
  gap: var(--spacing-sm);
  justify-content: center;
}

.modal-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  border: none;
}

.modal-btn.primary {
  background: var(--color-accent-primary);
  color: white;
}

.modal-btn.primary:hover {
  background: var(--color-accent-hover);
}

.modal-btn.secondary {
  background: var(--color-surface-primary);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border-secondary);
}

.modal-btn.secondary:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.auto-close-indicator {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--color-border-tertiary);
}

.auto-close-bar {
  height: 100%;
  background: var(--color-accent-primary);
  transition: width 50ms linear;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-active .status-modal,
.fade-leave-active .status-modal {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.fade-enter-from .status-modal,
.fade-leave-to .status-modal {
  transform: scale(0.95);
  opacity: 0;
}
</style>
