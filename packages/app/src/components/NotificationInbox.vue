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
          @click="handleNotificationClick(notification)"
          @dismiss="handleDismiss(notification.id)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Bell, BellOff, Eye, CheckCheck } from 'lucide-vue-next';
import NotificationItem from './NotificationItem.vue';
import {
  unreadNotificationsList,
  unreadCount,
  hasUnread,
  markAsRead,
  markAllAsRead,
  type InboxNotification,
} from '../stores/notificationInboxStore';
import { followedCount } from '../stores/followUpStore';
import { openExternal } from '../utils/electron';

const unreadNotifications = unreadNotificationsList;
const hasUnreadNotifications = hasUnread;

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
</style>
