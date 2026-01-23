<template>
  <div class="view-manager">
    <div class="views-list">
      <div
        v-for="(view, index) in sortedViews"
        :key="view.id"
        :class="['view-row', { active: isActive(view.id) }]"
      >
        <div class="view-left">
          <span v-if="view.icon" class="view-icon">{{ view.icon }}</span>
          <span class="view-name">{{ view.name }}</span>
          <span v-if="view.readonly" class="view-badge">Default</span>
        </div>

        <div class="view-actions">
          <button
            class="action-btn"
            @click="moveViewUp(view, index)"
            :disabled="index === 0"
            title="Move up"
          >
            <ChevronUp :size="14" :stroke-width="2" />
          </button>
          <button
            class="action-btn"
            @click="moveViewDown(view, index)"
            :disabled="index === sortedViews.length - 1"
            title="Move down"
          >
            <ChevronDown :size="14" :stroke-width="2" />
          </button>

          <template v-if="!view.readonly">
            <button
              class="action-btn"
              @click="editView(view)"
              title="Edit"
            >
              <Pencil :size="14" :stroke-width="2" />
            </button>
            <button
              class="action-btn action-btn--danger"
              @click="confirmDelete(view)"
              title="Delete"
            >
              <Trash2 :size="14" :stroke-width="2" />
            </button>
          </template>
        </div>
      </div>

      <div v-if="sortedViews.filter(v => !v.readonly).length === 0" class="empty-hint">
        No custom views yet. Click "Create View" to add one.
      </div>
    </div>

    <button class="create-btn" @click="showCreateDialog = true">
      <Plus :size="14" :stroke-width="2" />
      Create View
    </button>

    <ViewEditorDialog
      v-if="showCreateDialog"
      @save="handleCreate"
      @cancel="showCreateDialog = false"
    />

    <ViewEditorDialog
      v-if="showEditDialog && editingView"
      :view="editingView"
      @save="handleUpdate"
      @cancel="showEditDialog = false"
    />

    <div v-if="showDeleteConfirm" class="confirm-overlay" @click.self="showDeleteConfirm = false">
      <div class="confirm-dialog">
        <h3>Delete View</h3>
        <p>Are you sure you want to delete "{{ viewToDelete?.name }}"?</p>
        <p class="confirm-hint">This action cannot be undone.</p>
        <div class="confirm-actions">
          <button class="btn-secondary" @click="showDeleteConfirm = false">Cancel</button>
          <button class="btn-danger" @click="handleDelete">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ChevronUp, ChevronDown, Pencil, Trash2, Plus } from 'lucide-vue-next';
import ViewEditorDialog from './ViewEditorDialog.vue';
import {
  viewStore,
  sortedViews,
  addCustomView,
  updateView,
  deleteView as deleteViewAction,
} from '../stores/viewStore';
import type { ViewConfig, ViewId } from '../model/view-types';

const showCreateDialog = ref(false);
const showEditDialog = ref(false);
const showDeleteConfirm = ref(false);
const editingView = ref<ViewConfig | null>(null);
const viewToDelete = ref<ViewConfig | null>(null);

function isActive(viewId: ViewId): boolean {
  return viewStore.activeViewId === viewId;
}

function moveViewUp(view: ViewConfig, currentIndex: number): void {
  if (currentIndex <= 0) return;

  const views = sortedViews.value;
  const previousView = views[currentIndex - 1];

  updateView(view.id, { order: currentIndex - 1 });
  updateView(previousView.id, { order: currentIndex });
}

function moveViewDown(view: ViewConfig, currentIndex: number): void {
  const views = sortedViews.value;
  if (currentIndex >= views.length - 1) return;

  const nextView = views[currentIndex + 1];

  updateView(view.id, { order: currentIndex + 1 });
  updateView(nextView.id, { order: currentIndex });
}

function editView(view: ViewConfig): void {
  editingView.value = view;
  showEditDialog.value = true;
}

function confirmDelete(view: ViewConfig): void {
  viewToDelete.value = view;
  showDeleteConfirm.value = true;
}

function handleCreate(view: ViewConfig): void {
  addCustomView(view);
  showCreateDialog.value = false;
}

function handleUpdate(view: ViewConfig): void {
  updateView(view.id, view);
  showEditDialog.value = false;
  editingView.value = null;
}

function handleDelete(): void {
  if (!viewToDelete.value) return;
  deleteViewAction(viewToDelete.value.id);
  showDeleteConfirm.value = false;
  viewToDelete.value = null;
}
</script>

<style scoped>
.view-manager {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.views-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.view-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-surface-primary);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  transition: all var(--transition-fast);
}

.view-row:hover {
  background: var(--color-surface-hover);
}

.view-row.active {
  background: var(--color-accent-light);
  border-color: var(--color-accent-primary);
}

.view-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
  flex: 1;
}

.view-icon {
  font-size: 14px;
  line-height: 1;
  flex-shrink: 0;
}

.view-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.view-badge {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding: 2px 6px;
  background: var(--color-surface-secondary);
  color: var(--color-text-tertiary);
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.view-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.action-btn:hover:not(:disabled) {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.action-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.action-btn--danger:hover:not(:disabled) {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.empty-hint {
  padding: var(--spacing-md);
  text-align: center;
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.create-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  width: 100%;
  padding: var(--spacing-sm);
  background: transparent;
  border: 1px dashed var(--color-border-secondary);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.create-btn:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-accent-primary);
  color: var(--color-accent-primary);
}

.confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-bg-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  will-change: opacity;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  isolation: isolate;
}

.confirm-dialog {
  background: var(--color-bg-elevated);
  border-radius: var(--radius-xl);
  padding: var(--spacing-lg);
  width: 90%;
  max-width: 360px;
  box-shadow: var(--shadow-lg-themed);
  border: 1px solid var(--color-border-secondary);
}

.confirm-dialog h3 {
  margin: 0 0 var(--spacing-md) 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.confirm-dialog p {
  margin: 0 0 var(--spacing-xs) 0;
  font-size: 13px;
  color: var(--color-text-primary);
}

.confirm-hint {
  font-size: 11px !important;
  color: var(--color-text-tertiary) !important;
  margin-bottom: var(--spacing-md) !important;
}

.confirm-actions {
  display: flex;
  gap: var(--spacing-sm);
  justify-content: flex-end;
}

.btn-secondary {
  background: var(--color-surface-secondary);
  color: var(--color-text-primary);
  border: none;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-secondary:hover {
  background: var(--color-surface-hover);
}

.btn-danger {
  background: var(--color-error);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-danger:hover {
  opacity: 0.9;
}
</style>
