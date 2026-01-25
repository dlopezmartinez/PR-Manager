<template>
  <div class="view-header">
    <div class="header-info">
      <span v-if="view.icon" class="view-icon">{{ view.icon }}</span>
      <h2 class="view-title">{{ view.name }}</h2>
      <span class="count">
        <template v-if="isFiltering">
          {{ filteredCount }} / {{ prCount }}
        </template>
        <template v-else>
          {{ prCount }} {{ prCount === 1 ? 'item' : 'items' }}
        </template>
        <span v-if="unseenCount > 0" class="unseen-count" title="Unseen PRs">
          ({{ unseenCount }} new)
        </span>
      </span>
    </div>

    <div class="header-actions">
      <SearchBar
        v-if="showSearch"
        v-model="searchQuery"
        placeholder="Filter PRs..."
      />

      <button
        v-if="unseenCount > 0"
        class="mark-seen-btn"
        @click="$emit('mark-all-seen')"
        title="Mark all as seen"
      >
        <Check :size="12" :stroke-width="2.5" />
        <span>All</span>
      </button>

      <button
        class="refresh-btn"
        @click="$emit('refresh')"
        :disabled="loading"
        :class="{ spinning: loading }"
        title="Refresh view"
      >
        <RefreshCw :size="14" :stroke-width="2" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Check, RefreshCw } from 'lucide-vue-next';
import type { ViewConfig } from '../model/view-types';
import SearchBar from './SearchBar.vue';

const props = withDefaults(defineProps<{
  view: ViewConfig;
  prCount: number;
  loading: boolean;
  searchQuery?: string;
  filteredCount?: number;
  unseenCount?: number;
  showSearch?: boolean;
}>(), {
  searchQuery: '',
});

const emit = defineEmits<{
  (e: 'refresh'): void;
  (e: 'update:searchQuery', value: string): void;
  (e: 'mark-all-seen'): void;
}>();

const searchQuery = computed({
  get: () => props.searchQuery || '',
  set: (value: string) => emit('update:searchQuery', value),
});

const isFiltering = computed(() => {
  return (props.searchQuery || '').trim().length > 0 && props.filteredCount !== undefined;
});
</script>

<style scoped>
.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-lg);
  padding: 0 var(--spacing-xs);
}

.header-info {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
}

.view-icon {
  font-size: 20px;
  line-height: 1;
}

.view-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
  line-height: 1.2;
}

.count {
  font-size: 12px;
  color: var(--color-text-tertiary);
  font-weight: 500;
}

.unseen-count {
  color: var(--color-accent-primary);
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.mark-seen-btn {
  background: var(--color-surface-primary);
  border: none;
  border-radius: var(--radius-md);
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.mark-seen-btn:hover {
  background: var(--color-accent-light);
  color: var(--color-accent-primary);
}

.refresh-btn {
  background: var(--color-surface-primary);
  border: none;
  border-radius: var(--radius-full);
  width: 28px;
  height: 28px;
  font-size: 16px;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary);
}

.refresh-btn:hover:not(:disabled) {
  background: var(--color-accent-light);
  color: var(--color-accent-primary);
}

.refresh-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.refresh-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.refresh-btn.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
