<template>
  <div
    class="notification-item"
    :class="{ unread: !notification.read }"
    @click="$emit('click')"
    role="button"
    tabindex="0"
    @keydown.enter="$emit('click')"
  >
    <div v-if="!notification.read" class="unread-dot" />

    <div class="notification-content">
      <div class="notification-header">
        <div class="type-badge" :class="notification.type">
          <component :is="typeIcon" :size="12" :stroke-width="2" />
          <span>{{ typeText }}</span>
        </div>
        <span class="notification-time">{{ timeAgo }}</span>
      </div>

      <div class="pr-info">
        <span class="pr-title">{{ notification.prTitle }}</span>
        <span class="pr-meta">
          {{ notification.repoNameWithOwner }} #{{ notification.prNumber }}
        </span>
      </div>
    </div>

    <div class="notification-actions" @click.stop>
      <button
        class="action-btn dismiss-btn"
        @click="$emit('dismiss')"
        title="Dismiss"
      >
        <X :size="14" :stroke-width="2" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { GitCommit, MessageSquare, UserCheck, AlertCircle, GitMerge, XCircle, X } from 'lucide-vue-next';
import type { InboxNotification, NotificationChangeType } from '../stores/notificationInboxStore';
import { getNotificationTypeText } from '../stores/notificationInboxStore';

const props = defineProps<{
  notification: InboxNotification;
}>();

defineEmits<{
  (e: 'click'): void;
  (e: 'dismiss'): void;
}>();

const typeIcon = computed(() => {
  switch (props.notification.type) {
    case 'new_commits':
      return GitCommit;
    case 'new_comments':
      return MessageSquare;
    case 'new_reviews':
      return UserCheck;
    case 'status_change':
      return AlertCircle;
    case 'pr_merged':
      return GitMerge;
    case 'pr_closed':
      return XCircle;
    default:
      return AlertCircle;
  }
});

const typeText = computed(() => {
  return getNotificationTypeText(
    props.notification.type,
    props.notification.changeDetails.count
  );
});

const timeAgo = computed(() => {
  const created = new Date(props.notification.createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return created.toLocaleDateString();
});
</script>

<style scoped>
.notification-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
}

.notification-item:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-border-primary);
}

.notification-item:focus-visible {
  outline: none;
  border-color: var(--color-accent-primary);
  box-shadow: 0 0 0 2px var(--color-accent-light);
}

.notification-item.unread {
  background: var(--color-surface-primary);
  border-color: var(--color-accent-light);
}

.unread-dot {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  background: var(--color-accent-primary);
  border-radius: 50%;
}

.notification-content {
  flex: 1;
  min-width: 0;
  padding-left: var(--spacing-sm);
}

.notification-item.unread .notification-content {
  padding-left: var(--spacing-md);
}

.notification-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-xs);
}

.type-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 500;
}

.type-badge.new_commits {
  background: var(--color-accent-light);
  color: var(--color-accent-primary);
}

.type-badge.new_comments {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.type-badge.new_reviews {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.type-badge.status_change,
.type-badge.pr_closed {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.type-badge.pr_merged {
  background: rgba(191, 90, 242, 0.15);
  color: var(--color-pr-merged);
}

.notification-time {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.pr-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pr-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pr-meta {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.notification-actions {
  display: flex;
  gap: var(--spacing-xs);
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.notification-item:hover .notification-actions {
  opacity: 1;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: var(--color-surface-secondary);
  border-radius: var(--radius-md);
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.action-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}
</style>
