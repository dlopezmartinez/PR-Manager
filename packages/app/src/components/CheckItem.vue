<template>
  <div class="check-item" :class="statusClass">
    <span class="check-icon">
      <component :is="icon" :size="14" :stroke-width="2" />
    </span>
    <span class="check-name" :title="name">{{ name }}</span>
    <span class="check-status-badge">{{ statusLabel }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CheckCircle2, XCircle, Clock, Timer, HelpCircle } from 'lucide-vue-next';
import type { CheckRun, StatusContext } from '../model/types';

const props = defineProps<{
  check: CheckRun | StatusContext;
}>();

const icon = computed(() => {
  const check = props.check;
  if (check.__typename === 'CheckRun') {
    switch (check.conclusion) {
      case 'SUCCESS': return CheckCircle2;
      case 'FAILURE': return XCircle;
      case 'TIMED_OUT': return Timer;
      default: return Clock;
    }
  } else {
    switch (check.state) {
      case 'SUCCESS': return CheckCircle2;
      case 'FAILURE': return XCircle;
      case 'PENDING': return Clock;
      default: return HelpCircle;
    }
  }
});

const name = computed(() => {
  const check = props.check;
  if (check.__typename === 'CheckRun') {
    return check.name;
  } else {
    return check.context;
  }
});

const statusClass = computed(() => {
  const check = props.check;
  if (check.__typename === 'CheckRun') {
    switch (check.conclusion) {
      case 'SUCCESS': return 'status-success';
      case 'FAILURE': return 'status-failure';
      case 'TIMED_OUT': return 'status-failure';
      case 'CANCELLED': return 'status-cancelled';
      case 'SKIPPED': return 'status-skipped';
      default: return 'status-pending';
    }
  } else {
    switch (check.state) {
      case 'SUCCESS': return 'status-success';
      case 'FAILURE': return 'status-failure';
      case 'ERROR': return 'status-failure';
      case 'PENDING': return 'status-pending';
      default: return 'status-pending';
    }
  }
});

const statusLabel = computed(() => {
  const check = props.check;
  if (check.__typename === 'CheckRun') {
    switch (check.conclusion) {
      case 'SUCCESS': return 'Passed';
      case 'FAILURE': return 'Failed';
      case 'TIMED_OUT': return 'Timed out';
      case 'CANCELLED': return 'Cancelled';
      case 'SKIPPED': return 'Skipped';
      case 'NEUTRAL': return 'Neutral';
      default: return check.status === 'IN_PROGRESS' ? 'Running' : 'Pending';
    }
  } else {
    switch (check.state) {
      case 'SUCCESS': return 'Passed';
      case 'FAILURE': return 'Failed';
      case 'ERROR': return 'Error';
      case 'PENDING': return 'Pending';
      default: return 'Unknown';
    }
  }
});
</script>

<style scoped>
.check-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  min-width: 0;
  border-radius: var(--radius-md);
  transition: background-color var(--transition-fast);
}

.check-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.check-name {
  flex: 1;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  font-weight: 500;
}

.check-status-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.check-item.status-success {
  background: var(--color-success-bg);
}

.check-item.status-success .check-icon {
  color: var(--color-success);
}

.check-item.status-success .check-status-badge {
  background: var(--color-success);
  color: var(--color-text-inverted);
}

.check-item.status-failure {
  background: var(--color-error-bg);
}

.check-item.status-failure .check-icon {
  color: var(--color-error);
}

.check-item.status-failure .check-status-badge {
  background: var(--color-error);
  color: var(--color-text-inverted);
}

.check-item.status-pending {
  background: var(--color-warning-bg);
}

.check-item.status-pending .check-icon {
  color: var(--color-warning);
}

.check-item.status-pending .check-status-badge {
  background: var(--color-warning);
  color: var(--color-text-inverted);
}

.check-item.status-cancelled {
  background: var(--color-surface-secondary);
}

.check-item.status-cancelled .check-icon {
  color: var(--color-text-tertiary);
}

.check-item.status-cancelled .check-status-badge {
  background: var(--color-text-quaternary);
  color: var(--color-text-inverted);
}

.check-item.status-skipped {
  background: var(--color-surface-secondary);
}

.check-item.status-skipped .check-icon {
  color: var(--color-text-tertiary);
}

.check-item.status-skipped .check-status-badge {
  background: var(--color-text-quaternary);
  color: var(--color-text-inverted);
}
</style>
