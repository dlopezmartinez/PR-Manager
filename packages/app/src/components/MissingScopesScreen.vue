<template>
  <div class="missing-scopes-container">
    <TitleBar>
      <template #left>
        <span class="screen-title">Token Permissions</span>
      </template>
    </TitleBar>

    <div class="missing-scopes-content">
      <div class="missing-scopes-card">
        <div class="card-header">
          <div class="icon-wrapper warning">
            <AlertTriangle :size="32" :stroke-width="2" />
          </div>
          <h1>Missing Permissions</h1>
          <p class="subtitle">
            Your {{ providerName }} token is missing some required permissions.
            Please update your token to use all features.
          </p>
        </div>

        <div class="scopes-section">
          <h2>Required Permissions</h2>
          <div class="scopes-list">
            <div
              v-for="scope in missingScopes"
              :key="scope"
              class="scope-item missing"
            >
              <div class="scope-icon">
                <XCircle :size="16" :stroke-width="2" />
              </div>
              <div class="scope-info">
                <span class="scope-name">{{ scope }}</span>
                <span class="scope-description">{{ getScopeDescription(scope) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="currentScopes.length > 0" class="scopes-section">
          <h2>Current Permissions</h2>
          <div class="scopes-list">
            <div
              v-for="scope in currentScopes"
              :key="scope"
              class="scope-item valid"
            >
              <div class="scope-icon">
                <CheckCircle :size="16" :stroke-width="2" />
              </div>
              <div class="scope-info">
                <span class="scope-name">{{ scope }}</span>
                <span class="scope-description">{{ getScopeDescription(scope) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="instructions-section">
          <h2>How to Fix</h2>
          <ol class="instructions-list">
            <li>
              <span>Go to your {{ providerName }} token settings</span>
              <button class="link-btn" @click="openTokenSettings">
                <ExternalLink :size="14" :stroke-width="2" />
                Open {{ providerName }} Settings
              </button>
            </li>
            <li v-if="providerType === 'github'">
              <span>Create a new token or edit your existing one</span>
            </li>
            <li v-else>
              <span>Create a new token with the <code>api</code> scope</span>
            </li>
            <li>
              <span>Make sure to select the following scopes:</span>
              <div class="required-scopes-badges">
                <span v-for="scope in allRequiredScopes" :key="scope" class="scope-badge">
                  {{ scope }}
                </span>
              </div>
            </li>
            <li>
              <span>Copy the new token and update it in the app</span>
            </li>
          </ol>
        </div>

        <div class="actions">
          <button class="btn-secondary" @click="handleChangeToken">
            <Key :size="16" :stroke-width="2" />
            Change Token
          </button>
          <button class="btn-primary" @click="handleRetryValidation" :disabled="isValidating">
            <RefreshCw :size="16" :stroke-width="2" :class="{ spinning: isValidating }" />
            {{ isValidating ? 'Validating...' : 'Retry Validation' }}
          </button>
        </div>

        <div v-if="error" class="error-message">
          <AlertTriangle :size="14" :stroke-width="2" />
          {{ error }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  AlertTriangle,
  XCircle,
  CheckCircle,
  ExternalLink,
  Key,
  RefreshCw,
} from 'lucide-vue-next';
import TitleBar from './TitleBar.vue';
import { openExternal, validateToken } from '../utils/electron';
import { configStore, getApiKey } from '../stores/configStore';
import {
  getScopeDescription,
  GITHUB_REQUIRED_SCOPES,
  GITLAB_REQUIRED_SCOPES,
} from '../utils/tokenValidation';

const props = defineProps<{
  missingScopes: string[];
  currentScopes: string[];
}>();

const emit = defineEmits<{
  (e: 'validated'): void;
  (e: 'change-token'): void;
}>();

const isValidating = ref(false);
const error = ref('');

const providerType = computed(() => configStore.providerType);

const providerName = computed(() => {
  return providerType.value === 'github' ? 'GitHub' : 'GitLab';
});

const allRequiredScopes = computed(() => {
  return providerType.value === 'github'
    ? GITHUB_REQUIRED_SCOPES
    : GITLAB_REQUIRED_SCOPES;
});

function openTokenSettings() {
  if (providerType.value === 'github') {
    openExternal('https://github.com/settings/tokens');
  } else {
    const baseUrl = configStore.gitlabUrl || 'https://gitlab.com';
    openExternal(`${baseUrl}/-/user_settings/personal_access_tokens`);
  }
}

async function handleRetryValidation() {
  isValidating.value = true;
  error.value = '';

  try {
    const token = getApiKey();
    if (!token) {
      error.value = 'No token found. Please configure a new token.';
      return;
    }

    const result = await validateToken(
      providerType.value,
      token,
      configStore.gitlabUrl || undefined
    );

    if (result.valid && result.missingScopes.length === 0) {
      emit('validated');
    } else if (result.missingScopes.length > 0) {
      error.value = `Still missing permissions: ${result.missingScopes.join(', ')}`;
    } else if (result.error) {
      error.value = result.error;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Validation failed';
  } finally {
    isValidating.value = false;
  }
}

function handleChangeToken() {
  emit('change-token');
}
</script>

<style scoped>
.missing-scopes-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-primary);
}

.screen-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.missing-scopes-content {
  flex: 1;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: var(--spacing-lg);
  overflow-y: auto;
  background: var(--color-bg-secondary);
}

.missing-scopes-card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-xl);
  padding: var(--spacing-xl);
  width: 100%;
  max-width: 100%;
  box-shadow: var(--shadow-lg-themed);
}

.card-header {
  text-align: center;
  margin-bottom: var(--spacing-xl);
}

.icon-wrapper {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--spacing-md);
}

.icon-wrapper.warning {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

h1 {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-xs) 0;
}

.subtitle {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.5;
}

.scopes-section {
  margin-bottom: var(--spacing-lg);
}

.scopes-section h2 {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 var(--spacing-sm) 0;
}

.scopes-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.scope-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  background: var(--color-surface-primary);
}

.scope-item.missing {
  background: var(--color-error-bg);
}

.scope-item.missing .scope-icon {
  color: var(--color-error);
}

.scope-item.valid {
  background: var(--color-success-bg);
}

.scope-item.valid .scope-icon {
  color: var(--color-success);
}

.scope-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.scope-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.scope-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
  font-family: monospace;
}

.scope-description {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.instructions-section {
  margin-bottom: var(--spacing-lg);
  padding: var(--spacing-md);
  background: var(--color-surface-secondary);
  border-radius: var(--radius-md);
}

.instructions-section h2 {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 var(--spacing-sm) 0;
}

.instructions-list {
  margin: 0;
  padding-left: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.instructions-list li {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.instructions-list li span {
  display: block;
}

.link-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--color-accent-light);
  color: var(--color-accent-primary);
  border: none;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.link-btn:hover {
  background: var(--color-accent-primary);
  color: var(--color-text-inverted);
}

.required-scopes-badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-xs);
}

.scope-badge {
  padding: 2px 8px;
  background: var(--color-accent-light);
  color: var(--color-accent-primary);
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 600;
  font-family: monospace;
}

code {
  padding: 1px 4px;
  background: var(--color-surface-hover);
  border-radius: var(--radius-xs);
  font-size: 11px;
}

.actions {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-lg);
}

.btn-primary,
.btn-secondary {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-primary {
  background: var(--color-accent-primary);
  color: var(--color-text-inverted);
  border: none;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--color-surface-primary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-secondary);
}

.btn-secondary:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-border-primary);
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.error-message {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-error-bg);
  color: var(--color-error);
  border-radius: var(--radius-md);
  font-size: 11px;
}
</style>
