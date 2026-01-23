<template>
  <Teleport to="body">
    <TransitionGroup name="toast" tag="div" class="toast-container">
      <div
        v-for="notification in notifications"
        :key="notification.id"
        class="toast"
        @click="handleClick(notification)"
      >
        <div class="toast-icon">
          <Bell :size="16" :stroke-width="2" />
        </div>
        <div class="toast-content">
          <div class="toast-title">{{ notification.title }}</div>
          <div v-if="notification.subtitle" class="toast-subtitle">
            {{ notification.subtitle }}
          </div>
          <div class="toast-body">{{ notification.body }}</div>
        </div>
        <button class="toast-close" @click.stop="dismiss(notification.id)">
          <X :size="14" :stroke-width="2" />
        </button>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Bell, X } from 'lucide-vue-next';
import { openExternal, onIpcEvent, removeIpcListener } from '../utils/electron';

interface ToastNotification {
  id: number;
  title: string;
  body: string;
  subtitle?: string;
  url?: string;
}

const notifications = ref<ToastNotification[]>([]);
let idCounter = 0;

const TOAST_DURATION = 5000; // 5 seconds

function addNotification(options: Omit<ToastNotification, 'id'>) {
  const id = ++idCounter;
  notifications.value.push({ id, ...options });

  // Auto-dismiss after duration
  setTimeout(() => {
    dismiss(id);
  }, TOAST_DURATION);
}

function dismiss(id: number) {
  const index = notifications.value.findIndex(n => n.id === id);
  if (index !== -1) {
    notifications.value.splice(index, 1);
  }
}

function handleClick(notification: ToastNotification) {
  if (notification.url) {
    openExternal(notification.url);
  }
  dismiss(notification.id);
}

onMounted(() => {
  onIpcEvent('notification-fallback', (options: unknown) => {
    const opts = options as { title: string; body: string; subtitle?: string; url?: string };
    addNotification(opts);
  });
});

onUnmounted(() => {
  removeIpcListener('notification-fallback');
});

defineExpose({
  show: addNotification,
});
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 48px; /* Below title bar */
  right: 12px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 320px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg-themed);
  cursor: pointer;
  pointer-events: auto;
  transition: transform 0.2s, opacity 0.2s;
}

.toast:hover {
  transform: translateX(-4px);
}

.toast-icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-accent-light);
  border-radius: var(--radius-md);
  color: var(--color-accent-primary);
}

.toast-content {
  flex: 1;
  min-width: 0;
}

.toast-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 2px;
}

.toast-subtitle {
  font-size: 10px;
  color: var(--color-text-tertiary);
  margin-bottom: 4px;
}

.toast-body {
  font-size: 11px;
  color: var(--color-text-secondary);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.toast-close {
  flex-shrink: 0;
  background: transparent;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: var(--color-text-quaternary);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.toast-close:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.toast-enter-active {
  transition: all 0.3s ease;
}

.toast-leave-active {
  transition: all 0.2s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.toast-move {
  transition: transform 0.3s ease;
}
</style>
