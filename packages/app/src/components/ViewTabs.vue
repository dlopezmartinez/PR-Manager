<template>
  <div class="view-tabs">
    <div class="tabs-container" @wheel="handleWheel" ref="tabsContainer">
      <button
        v-for="view in sortedViews"
        :key="view.id"
        :class="['tab', { active: isActive(view.id) }]"
        @click="handleTabClick(view.id)"
        :title="view.name"
      >
        <span v-if="view.icon" class="tab-icon">{{ view.icon }}</span>
        <span class="tab-name">{{ view.name }}</span>
        <span v-if="getPRCount(view.id) > 0" class="tab-badge">
          {{ getPRCount(view.id) }}
        </span>
      </button>
    </div>

    <button
      class="add-view-btn"
      @click="$emit('add-view')"
      title="Create custom view"
    >
      +
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { viewStore, sortedViews, setActiveView } from '../stores/viewStore';
import type { ViewId } from '../model/view-types';

const emit = defineEmits<{
  (e: 'add-view'): void;
}>();

const props = defineProps<{
  prCounts: Record<ViewId, number>;
}>();

const tabsContainer = ref<HTMLDivElement | null>(null);

function isActive(viewId: ViewId): boolean {
  return viewStore.activeViewId === viewId;
}

function getPRCount(viewId: ViewId): number {
  return props.prCounts[viewId] || 0;
}

function handleTabClick(viewId: ViewId): void {
  setActiveView(viewId);
}

function handleWheel(event: WheelEvent): void {
  if (!tabsContainer.value) return;
  event.preventDefault();
  tabsContainer.value.scrollLeft += event.deltaY;
}
</script>

<style scoped>
.view-tabs {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
  margin-top: var(--spacing-md);
  width: 100%;
  max-width: 100%;
  overflow: visible;
}

.tabs-container {
  display: flex;
  gap: var(--spacing-sm);
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: var(--spacing-xs) 0;
  scrollbar-width: thin;
  scrollbar-color: var(--color-surface-secondary) transparent;
}

.tabs-container::-webkit-scrollbar {
  height: 6px;
}

.tabs-container::-webkit-scrollbar-track {
  background: transparent;
}

.tabs-container::-webkit-scrollbar-thumb {
  background: var(--color-surface-secondary);
  border-radius: var(--radius-sm);
}

.tabs-container::-webkit-scrollbar-thumb:hover {
  background: var(--color-surface-hover);
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: var(--spacing-sm) var(--spacing-md);
  height: 32px;
  background: var(--color-surface-primary);
  border: 1px solid var(--color-border-tertiary);
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
  flex-shrink: 0;
}

.tab:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-border-secondary);
  color: var(--color-text-primary);
}

.tab.active {
  background: var(--color-accent-primary);
  color: var(--color-text-inverted);
  border-color: transparent;
}

.tab-icon {
  font-size: 13px;
  line-height: 1;
  flex-shrink: 0;
}

.tab-name {
  font-weight: 500;
  letter-spacing: -0.01em;
}

.tab-badge {
  background: var(--color-surface-active);
  padding: 2px 5px;
  border-radius: var(--radius-sm);
  font-size: 10px;
  font-weight: 600;
  min-width: 16px;
  text-align: center;
  flex-shrink: 0;
  letter-spacing: -0.02em;
}

.tab.active .tab-badge {
  background: rgba(255, 255, 255, 0.25);
  font-weight: 700;
}

.add-view-btn {
  background: var(--color-surface-primary);
  border: 1px solid var(--color-border-tertiary);
  border-radius: var(--radius-md);
  width: 32px;
  height: 32px;
  font-size: 18px;
  font-weight: 300;
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.add-view-btn:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-border-secondary);
  color: var(--color-accent-primary);
}

.add-view-btn:active {
  background: var(--color-surface-active);
}
</style>
