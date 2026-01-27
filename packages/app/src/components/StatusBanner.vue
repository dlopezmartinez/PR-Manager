<template>
  <div v-if="showBanner" class="status-banner" :class="bannerClass">
    <div class="banner-content">
      <component :is="bannerIcon" :size="16" :stroke-width="2" class="banner-icon" />
      <span class="banner-text">{{ bannerText }}</span>
    </div>
    <div class="banner-actions">
      <button
        v-if="showRetryButton"
        class="banner-btn banner-btn-secondary"
        @click="handleRetry"
        :disabled="isRetrying"
      >
        {{ isRetrying ? 'Retrying...' : 'Retry' }}
      </button>
      <button
        v-if="showBillingButton"
        class="banner-btn banner-btn-primary"
        @click="$emit('openBilling')"
      >
        Renew
      </button>
      <button
        v-if="showLogoutButton"
        class="banner-btn banner-btn-primary"
        @click="$emit('logout')"
      >
        Sign In
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Wifi, WifiOff, AlertCircle, RefreshCw, LogIn } from 'lucide-vue-next';
import { subscriptionSyncStore } from '../stores/subscriptionSyncStore';

const emit = defineEmits<{
  (e: 'logout'): void;
  (e: 'openBilling'): void;
}>();

const isRetrying = ref(false);

const showBanner = computed(() => {
  const status = subscriptionSyncStore.syncStatus.value;
  return status === 'network_error' ||
    status === 'subscription_expired' ||
    status === 'session_expired';
});

const bannerClass = computed(() => {
  const status = subscriptionSyncStore.syncStatus.value;

  switch (status) {
    case 'syncing':
      return 'info';
    case 'network_error':
      return 'warning';
    case 'subscription_expired':
    case 'session_expired':
      return 'error';
    default:
      return '';
  }
});

const bannerIcon = computed(() => {
  const status = subscriptionSyncStore.syncStatus.value;

  switch (status) {
    case 'syncing':
      return RefreshCw;
    case 'network_error':
      return WifiOff;
    case 'subscription_expired':
      return AlertCircle;
    case 'session_expired':
      return LogIn;
    default:
      return Wifi;
  }
});

const bannerText = computed(() => {
  const status = subscriptionSyncStore.syncStatus.value;

  switch (status) {
    case 'syncing':
      return 'Syncing with server...';
    case 'network_error': {
      const hours = subscriptionSyncStore.gracePeriodRemainingHours.value;
      if (hours > 0) {
        return `Offline mode - ${hours}h remaining`;
      }
      return 'Unable to connect to server';
    }
    case 'subscription_expired':
      return 'Your subscription has expired';
    case 'session_expired':
      return 'Your session has expired';
    default:
      return '';
  }
});

const showRetryButton = computed(() => {
  return subscriptionSyncStore.syncStatus.value === 'network_error';
});

const showBillingButton = computed(() => {
  return subscriptionSyncStore.syncStatus.value === 'subscription_expired';
});

const showLogoutButton = computed(() => {
  return subscriptionSyncStore.syncStatus.value === 'session_expired';
});

async function handleRetry() {
  isRetrying.value = true;
  try {
    await subscriptionSyncStore.retrySyncManually();
  } finally {
    isRetrying.value = false;
  }
}
</script>

<style scoped>
.status-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  gap: 12px;
  font-size: 12px;
  border-bottom: 1px solid var(--color-border-primary);
}

.status-banner.info {
  background: var(--color-accent-lighter);
  color: var(--color-accent-primary);
}

.status-banner.warning {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.status-banner.error {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.banner-content {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.banner-icon {
  flex-shrink: 0;
}

.banner-text {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.banner-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.banner-btn {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: opacity var(--transition-fast);
}

.banner-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.banner-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.banner-btn-secondary {
  background: transparent;
  border: 1px solid currentColor;
  color: inherit;
}

.banner-btn-primary {
  color: var(--color-text-inverted);
}

.status-banner.info .banner-btn-primary {
  background: var(--color-accent-primary);
}

.status-banner.warning .banner-btn-primary {
  background: var(--color-warning);
}

.status-banner.error .banner-btn-primary {
  background: var(--color-error);
}
</style>
