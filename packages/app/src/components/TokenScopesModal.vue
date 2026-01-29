<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-container">
        <!-- Header -->
        <div class="modal-header">
          <div class="header-icon" :class="hasOnlyMissing ? 'error' : 'warning'">
            <ShieldAlert :size="24" :stroke-width="1.5" />
          </div>
          <div class="header-text">
            <h2>{{ hasOnlyMissing ? 'Invalid Permissions' : 'Missing Permissions' }}</h2>
            <p>{{ providerName }} token needs additional scopes</p>
          </div>
          <button class="close-btn" @click="$emit('close')">
            <X :size="18" :stroke-width="2" />
          </button>
        </div>

        <!-- Content -->
        <div class="modal-content">
          <!-- Missing Scopes -->
          <div v-if="missingScopes.length > 0" class="scopes-group">
            <div class="group-label">
              <XCircle :size="14" :stroke-width="2" class="icon-error" />
              <span>Missing</span>
            </div>
            <div class="scopes-grid">
              <div v-for="scope in missingScopes" :key="scope" class="scope-chip missing">
                <code>{{ scope }}</code>
                <span class="scope-desc">{{ getScopeDescription(scope) }}</span>
              </div>
            </div>
          </div>

          <!-- Current Scopes -->
          <div v-if="currentScopes.length > 0 && !isFineGrained" class="scopes-group">
            <div class="group-label">
              <CheckCircle :size="14" :stroke-width="2" class="icon-success" />
              <span>Current</span>
            </div>
            <div class="scopes-grid">
              <div v-for="scope in currentScopes" :key="scope" class="scope-chip valid">
                <code>{{ scope }}</code>
                <span class="scope-desc">{{ getScopeDescription(scope) }}</span>
              </div>
            </div>
          </div>

          <!-- Fine-grained token notice -->
          <div v-if="isFineGrained" class="info-box">
            <Info :size="14" :stroke-width="2" />
            <span>This appears to be a fine-grained token. Make sure it has access to the repositories you need.</span>
          </div>

          <!-- Instructions -->
          <div class="instructions">
            <div class="instruction-title">
              <Lightbulb :size="14" :stroke-width="2" />
              <span>How to fix</span>
            </div>
            <ol>
              <li>
                <a href="#" @click.prevent="openTokenSettings" class="link">
                  Open {{ providerName }} token settings
                  <ExternalLink :size="12" :stroke-width="2" />
                </a>
              </li>
              <li v-if="providerType === 'github'">
                Create a new <strong>Classic</strong> token with <code v-for="(s, i) in requiredScopes" :key="s">{{ s }}{{ i < requiredScopes.length - 1 ? ', ' : '' }}</code> scopes
              </li>
              <li v-else>
                Create a new token with the <code>api</code> scope
              </li>
              <li>Copy and paste the new token below</li>
            </ol>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <AppButton variant="secondary" @click="$emit('close')">
            Cancel
          </AppButton>
          <AppButton variant="primary" @click="$emit('retry')">
            <RefreshCw :size="14" :stroke-width="2" />
            Try Again
          </AppButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  ShieldAlert,
  X,
  XCircle,
  CheckCircle,
  Info,
  Lightbulb,
  ExternalLink,
  RefreshCw,
} from 'lucide-vue-next';
import { openExternal } from '../utils/electron';
import { AppButton } from './ui';
import {
  getScopeDescription,
  GITHUB_REQUIRED_SCOPES,
  GITLAB_REQUIRED_SCOPES,
} from '../utils/tokenValidation';

const props = defineProps<{
  providerType: 'github' | 'gitlab';
  missingScopes: string[];
  currentScopes: string[];
  gitlabUrl?: string;
}>();

defineEmits<{
  (e: 'close'): void;
  (e: 'retry'): void;
}>();

const providerName = computed(() =>
  props.providerType === 'github' ? 'GitHub' : 'GitLab'
);

const requiredScopes = computed(() =>
  props.providerType === 'github' ? GITHUB_REQUIRED_SCOPES : GITLAB_REQUIRED_SCOPES
);

const hasOnlyMissing = computed(() =>
  props.currentScopes.length === 0 && props.missingScopes.length > 0
);

const isFineGrained = computed(() =>
  props.currentScopes.length === 1 && props.currentScopes[0] === 'fine-grained-token'
);

function openTokenSettings() {
  if (props.providerType === 'github') {
    openExternal('https://github.com/settings/tokens');
  } else {
    const baseUrl = props.gitlabUrl || 'https://gitlab.com';
    openExternal(`${baseUrl}/-/user_settings/personal_access_tokens`);
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--spacing-md);
}

.modal-container {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-xl);
  width: 100%;
  max-width: 400px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-xl-themed);
}

/* Header */
.modal-header {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--color-border-tertiary);
}

.header-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.header-icon.error {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.header-icon.warning {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.header-text {
  flex: 1;
  min-width: 0;
}

.header-text h2 {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 2px 0;
}

.header-text p {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  padding: var(--spacing-xs);
  border-radius: var(--radius-md);
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.close-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

/* Content */
.modal-content {
  padding: var(--spacing-lg);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

/* Scopes Groups */
.scopes-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.group-label {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-tertiary);
}

.icon-error {
  color: var(--color-error);
}

.icon-success {
  color: var(--color-success);
}

.scopes-grid {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.scope-chip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
}

.scope-chip.missing {
  background: var(--color-error-bg);
  border-left: 3px solid var(--color-error);
}

.scope-chip.valid {
  background: var(--color-success-bg);
  border-left: 3px solid var(--color-success);
}

.scope-chip code {
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.scope-desc {
  font-size: 11px;
  color: var(--color-text-secondary);
}

/* Info Box */
.info-box {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-info-bg);
  border-radius: var(--radius-md);
  font-size: 11px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.info-box svg {
  flex-shrink: 0;
  color: var(--color-info);
  margin-top: 1px;
}

/* Instructions */
.instructions {
  background: var(--color-surface-secondary);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
}

.instruction-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-tertiary);
  margin-bottom: var(--spacing-sm);
}

.instruction-title svg {
  color: var(--color-warning);
}

.instructions ol {
  margin: 0;
  padding-left: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.instructions li {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.instructions code {
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 11px;
  background: var(--color-accent-lighter);
  color: var(--color-accent-primary);
  padding: 1px 4px;
  border-radius: var(--radius-xs);
}

.instructions strong {
  color: var(--color-text-primary);
  font-weight: 600;
}

.link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-accent-primary);
  text-decoration: none;
  font-weight: 500;
}

.link:hover {
  text-decoration: underline;
}

/* Footer */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-lg);
  border-top: 1px solid var(--color-border-tertiary);
  background: var(--color-surface-secondary);
}

</style>
