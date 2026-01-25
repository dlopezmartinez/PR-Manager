<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('cancel')">
      <div class="modal">
        <div class="modal-header">
          <h3>Follow PR #{{ pr.number }}</h3>
          <button class="close-btn" @click="$emit('cancel')" title="Cancel">
            <X :size="16" :stroke-width="2" />
          </button>
        </div>

        <div class="modal-body">
          <p class="modal-subtitle">{{ pr.title }}</p>
          <p class="modal-repo">{{ pr.repository.nameWithOwner }}</p>

          <div class="prefs-section">
            <h4>Notify me when:</h4>

            <label class="pref-option">
              <input type="checkbox" v-model="prefs.notifyOnCommits" />
              <div class="pref-content">
                <GitCommit :size="16" :stroke-width="2" class="pref-icon" />
                <span class="pref-label">New commits</span>
              </div>
            </label>

            <label class="pref-option">
              <input type="checkbox" v-model="prefs.notifyOnComments" />
              <div class="pref-content">
                <MessageSquare :size="16" :stroke-width="2" class="pref-icon" />
                <span class="pref-label">New comments</span>
              </div>
            </label>

            <label class="pref-option">
              <input type="checkbox" v-model="prefs.notifyOnReviews" />
              <div class="pref-content">
                <Eye :size="16" :stroke-width="2" class="pref-icon" />
                <span class="pref-label">New reviews</span>
              </div>
            </label>

            <label class="pref-option">
              <input type="checkbox" v-model="prefs.notifyOnWorkflows" />
              <div class="pref-content">
                <Play :size="16" :stroke-width="2" class="pref-icon" />
                <span class="pref-label">Workflow status changes</span>
              </div>
            </label>

            <label class="pref-option highlight">
              <input type="checkbox" v-model="prefs.notifyOnReadyToMerge" />
              <div class="pref-content">
                <GitMerge :size="16" :stroke-width="2" class="pref-icon" />
                <span class="pref-label">Ready to merge</span>
                <span class="pref-hint">All checks pass + approved</span>
              </div>
            </label>
          </div>
        </div>

        <div class="modal-footer">
          <button class="cancel-btn" @click="$emit('cancel')">Cancel</button>
          <button class="follow-btn" @click="handleFollow">
            <Bell :size="14" :stroke-width="2" />
            Follow
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { X, GitCommit, MessageSquare, Eye, Play, GitMerge, Bell } from 'lucide-vue-next';
import type { PullRequestBasic } from '../model/types';
import { DEFAULT_NOTIFICATION_PREFS, type FollowedPRNotificationPrefs } from '../stores/followUpStore';

const props = defineProps<{
  pr: PullRequestBasic;
}>();

const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'follow', prefs: FollowedPRNotificationPrefs): void;
}>();

const prefs = reactive<FollowedPRNotificationPrefs>({ ...DEFAULT_NOTIFICATION_PREFS });

function handleFollow() {
  emit('follow', { ...prefs });
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--color-bg-overlay);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-xl);
  width: 100%;
  max-width: 400px;
  box-shadow: var(--shadow-lg-themed);
  animation: slideUp 0.2s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border-tertiary);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.close-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.modal-body {
  padding: 16px 20px;
}

.modal-subtitle {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  line-height: 1.4;
}

.modal-repo {
  margin: 0 0 16px;
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.prefs-section h4 {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.pref-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: var(--color-surface-primary);
  border: 1px solid var(--color-border-tertiary);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.pref-option:hover {
  border-color: var(--color-border-secondary);
  background: var(--color-surface-hover);
}

.pref-option:has(input:checked) {
  border-color: var(--color-accent-primary);
  background: var(--color-accent-light);
}

.pref-option.highlight {
  background: var(--color-success-bg);
  border-color: var(--color-success);
}

.pref-option.highlight:has(input:checked) {
  background: var(--color-success-bg);
  border-color: var(--color-success);
}

.pref-option input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--color-accent-primary);
  cursor: pointer;
}

.pref-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.pref-icon {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.pref-option:has(input:checked) .pref-icon {
  color: var(--color-accent-primary);
}

.pref-option.highlight .pref-icon {
  color: var(--color-success);
}

.pref-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.pref-hint {
  font-size: 11px;
  color: var(--color-text-tertiary);
  margin-left: auto;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border-tertiary);
}

.cancel-btn {
  padding: 8px 16px;
  background: var(--color-surface-secondary);
  border: none;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.cancel-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.follow-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  background: var(--color-accent-primary);
  border: none;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-inverted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.follow-btn:hover {
  background: var(--color-accent-hover);
}
</style>
