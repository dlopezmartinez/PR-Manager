<template>
  <div class="pr-list-container">
    <div v-if="loading && prs.length === 0" class="loading-state">
      <div class="spinner"></div>
      <p>Loading pull requests...</p>
    </div>

    <div v-else-if="prs.length > 0" class="pr-list">
      <div class="list-header">
        <h2>Dashboard</h2>
        <span class="count">{{ prs.length }} items</span>
      </div>
      
      <PullRequestCard 
        v-for="pr in prs" 
        :key="pr.id" 
        :pr="pr"
        :show-comments="showComments"
        :show-checks="showChecks"
        :allow-comments-expansion="allowCommentsExpansion"
        :allow-checks-expansion="allowChecksExpansion"
        @click="$emit('select', pr)"
        @toggle-expand="$emit('toggle-expand', $event)"
        @toggle-expand-comments="$emit('toggle-expand-comments', $event)"
        @prefetch="$emit('prefetch', $event)"
        @prefetch-cancel="$emit('prefetch-cancel')"
      />
      
      <div v-if="pageInfo.hasNextPage" class="pagination">
        <button @click="$emit('load-more')" :disabled="loading" class="load-more-btn">
          {{ loading ? 'Loading...' : 'Show More' }}
        </button>
      </div>
    </div>

    <div v-else class="empty-state">
      <div class="empty-icon">📭</div>
      <h3>No Pull Requests</h3>
      <p>You're all caught up! No pull requests found.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import PullRequestCard from './PullRequestCard.vue';
import type { PullRequestBasic, PageInfo } from '../model/types';

defineProps<{
  prs: PullRequestBasic[];
  pageInfo: PageInfo;
  loading: boolean;
  showComments?: boolean;
  showChecks?: boolean;
  allowCommentsExpansion?: boolean;
  allowChecksExpansion?: boolean;
}>();

defineEmits<{
  (e: 'select', pr: PullRequestBasic): void;
  (e: 'load-more'): void;
  (e: 'toggle-expand', pr: PullRequestBasic): void;
  (e: 'toggle-expand-comments', pr: PullRequestBasic): void;
  (e: 'prefetch', pr: PullRequestBasic): void;
  (e: 'prefetch-cancel'): void;
}>();
</script>

<style scoped>
.pr-list-container {
  width: 100%;
}

.list-header {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
  padding: 0 var(--spacing-xs);
}

h2 {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.count {
  font-size: 12px;
  color: var(--color-text-tertiary);
  font-weight: 500;
}

.loading-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: var(--color-text-tertiary);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--color-surface-secondary);
  border-radius: 50%;
  border-top-color: var(--color-accent-primary);
  animation: spin 1s linear infinite;
  margin-bottom: var(--spacing-lg);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-icon {
  font-size: 48px;
  margin-bottom: var(--spacing-lg);
  opacity: 0.5;
}

.empty-state h3 {
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-sm) 0;
}

.empty-state p {
  font-size: 14px;
  margin: 0;
}

.pagination {
  display: flex;
  justify-content: center;
  margin-top: var(--spacing-xl);
  padding-bottom: var(--spacing-xl);
}

.load-more-btn {
  background: var(--color-accent-light);
  color: var(--color-accent-primary);
  border: none;
  padding: 10px 24px;
  border-radius: var(--radius-xl);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.load-more-btn:hover:not(:disabled) {
  background: var(--color-accent-lighter);
}

.load-more-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
