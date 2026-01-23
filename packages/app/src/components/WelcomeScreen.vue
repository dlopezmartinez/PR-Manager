<template>
  <div class="welcome-container">
    <TitleBar>
      <template #left>
        <span class="screen-title">Welcome</span>
      </template>
    </TitleBar>

    <div class="welcome-content">
      <div class="welcome-header">
        <div class="app-icon">
          <GitMerge :size="40" :stroke-width="1.5" />
        </div>
        <h1>PR Manager</h1>
        <p class="subtitle">Review your pull requests with ease</p>
      </div>

      <div class="welcome-form">
        <div class="form-section">
          <h2>Select Provider</h2>
          <div class="provider-selector">
            <button
              v-for="provider in providers"
              :key="provider.type"
              class="provider-btn"
              :class="{ active: selectedProvider === provider.type }"
              @click="selectedProvider = provider.type"
            >
              <component :is="provider.icon" :size="24" :stroke-width="1.5" />
              <span>{{ provider.name }}</span>
            </button>
          </div>
        </div>

        <div v-if="selectedProvider === 'gitlab'" class="form-section">
          <h2>GitLab Instance</h2>
          <div class="form-group">
            <label for="gitlabUrl">GitLab URL <span class="optional">(optional)</span></label>
            <input
              id="gitlabUrl"
              v-model="gitlabUrl"
              type="text"
              placeholder="https://gitlab.com"
              @keyup.enter="handleContinue"
            />
            <p class="hint">Leave empty for gitlab.com, or enter your self-hosted URL</p>
          </div>
        </div>

        <div class="form-section">
          <h2>Authentication</h2>

          <div class="form-group">
            <label for="apiKey">{{ tokenLabel }}</label>
            <div class="input-wrapper">
              <input
                id="apiKey"
                v-model="apiKey"
                :type="showToken ? 'text' : 'password'"
                :placeholder="tokenPlaceholder"
                @keyup.enter="handleContinue"
              />
              <button
                type="button"
                class="toggle-visibility"
                @click="showToken = !showToken"
                :title="showToken ? 'Hide token' : 'Show token'"
              >
                <EyeOff v-if="showToken" :size="16" :stroke-width="2" />
                <Eye v-else :size="16" :stroke-width="2" />
              </button>
            </div>
            <p class="hint">
              Create a token at
              <a href="#" @click.prevent="openTokenPage">{{ tokenPageText }}</a>
            </p>
          </div>

          <div class="form-group">
            <label for="username">Username <span class="optional">(optional)</span></label>
            <input
              id="username"
              v-model="username"
              type="text"
              placeholder="Your username"
              @keyup.enter="handleContinue"
            />
            <p class="hint">Leave empty to use the token owner's username</p>
          </div>
        </div>

        <div v-if="error" class="error-message">
          <AlertCircle :size="14" :stroke-width="2" />
          {{ error }}
        </div>

        <div class="actions">
          <button
            class="continue-btn"
            :disabled="!apiKey || loading"
            @click="handleContinue"
          >
            <span v-if="loading" class="spinner"></span>
            <template v-else>
              <span>Get Started</span>
              <ArrowRight :size="16" :stroke-width="2" />
            </template>
          </button>
        </div>

        <div class="welcome-footer">
          <Lock :size="12" :stroke-width="2" />
          <p>Your token is stored securely and never shared.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { GitMerge, Eye, EyeOff, Github, AlertCircle, ArrowRight, Lock } from 'lucide-vue-next';
import { updateConfig, saveApiKey } from '../stores/configStore';
import TitleBar from './TitleBar.vue';
import type { ProviderType } from '../model/provider-types';

const emit = defineEmits<{
  (e: 'configured'): void;
}>();

const providers = [
  { type: 'github' as ProviderType, name: 'GitHub', icon: Github },
  { type: 'gitlab' as ProviderType, name: 'GitLab', icon: GitMerge },
];

const selectedProvider = ref<ProviderType>('github');
const gitlabUrl = ref('');
const apiKey = ref('');
const username = ref('');
const showToken = ref(false);
const loading = ref(false);
const error = ref('');

import { openExternal } from '../utils/electron';

const tokenLabel = computed(() => {
  return selectedProvider.value === 'github'
    ? 'GitHub Personal Access Token'
    : 'GitLab Personal Access Token';
});

const tokenPlaceholder = computed(() => {
  return selectedProvider.value === 'github'
    ? 'ghp_xxxxxxxxxxxxxxxxxxxx'
    : 'glpat-xxxxxxxxxxxxxxxxxxxx';
});

const tokenPageText = computed(() => {
  return selectedProvider.value === 'github'
    ? 'GitHub Settings → Developer settings → Personal access tokens'
    : 'GitLab → User Settings → Access Tokens';
});

function openTokenPage() {
  if (selectedProvider.value === 'github') {
    openExternal('https://github.com/settings/tokens');
  } else {
    const baseUrl = gitlabUrl.value || 'https://gitlab.com';
    openExternal(`${baseUrl}/-/user_settings/personal_access_tokens`);
  }
}

async function validateGitHubToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: '{ viewer { login } }',
      }),
    });

    if (!response.ok) return false;

    const data = await response.json();
    return !!data.data?.viewer?.login;
  } catch {
    return false;
  }
}

async function validateGitLabToken(token: string, baseUrl?: string): Promise<boolean> {
  try {
    const endpoint = baseUrl
      ? `${baseUrl}/api/graphql`
      : 'https://gitlab.com/api/graphql';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: '{ currentUser { username } }',
      }),
    });

    if (!response.ok) return false;

    const data = await response.json();
    return !!data.data?.currentUser?.username;
  } catch {
    return false;
  }
}

async function handleContinue() {
  if (!apiKey.value) return;

  loading.value = true;
  error.value = '';

  let isValid = false;

  if (selectedProvider.value === 'github') {
    isValid = await validateGitHubToken(apiKey.value);
  } else {
    isValid = await validateGitLabToken(apiKey.value, gitlabUrl.value || undefined);
  }

  if (!isValid) {
    error.value = 'Invalid token. Please check and try again.';
    loading.value = false;
    return;
  }

  // Save API key to secure storage
  const saved = await saveApiKey(apiKey.value);
  if (!saved) {
    error.value = 'Failed to save token securely. Please try again.';
    loading.value = false;
    return;
  }

  // Save other config (non-sensitive)
  updateConfig({
    providerType: selectedProvider.value,
    gitlabUrl: selectedProvider.value === 'gitlab' ? (gitlabUrl.value || undefined) : undefined,
    username: username.value,
  });

  loading.value = false;
  emit('configured');
}
</script>

<style scoped>
.welcome-container {
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

.welcome-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--spacing-lg);
  overflow-y: auto;
  background: var(--color-bg-secondary);
}

.welcome-header {
  text-align: center;
  padding: var(--spacing-lg) 0;
}

.app-icon {
  width: 72px;
  height: 72px;
  margin: 0 auto var(--spacing-md);
  background: var(--color-accent-light);
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-accent-primary);
}

h1 {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-xs) 0;
  letter-spacing: -0.3px;
}

.subtitle {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 0;
}

.welcome-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  flex: 1;
}

.form-section {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
}

.form-section h2 {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 var(--spacing-sm) 0;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.form-group + .form-group {
  margin-top: var(--spacing-md);
}

label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.optional {
  font-weight: 400;
  color: var(--color-text-tertiary);
}

.provider-selector {
  display: flex;
  gap: var(--spacing-sm);
}

.provider-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-md) var(--spacing-sm);
  border: 2px solid var(--color-border-secondary);
  border-radius: var(--radius-md);
  background: var(--color-surface-primary);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.provider-btn:hover {
  border-color: var(--color-border-primary);
  color: var(--color-text-primary);
  background: var(--color-surface-hover);
}

.provider-btn.active {
  border-color: var(--color-accent-primary);
  background: var(--color-accent-light);
  color: var(--color-accent-primary);
}

.provider-btn span {
  font-size: 12px;
  font-weight: 600;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

input {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--color-text-primary);
  background: var(--color-surface-primary);
  transition: all var(--transition-fast);
  outline: none;
}

input:focus {
  border-color: var(--color-accent-primary);
  box-shadow: 0 0 0 2px var(--color-accent-light);
}

input::placeholder {
  color: var(--color-text-quaternary);
}

.input-wrapper input {
  padding-right: 40px;
}

.toggle-visibility {
  position: absolute;
  right: var(--spacing-sm);
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--spacing-xs);
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
}

.toggle-visibility:hover {
  color: var(--color-text-primary);
  background: var(--color-surface-hover);
}

.hint {
  font-size: 11px;
  color: var(--color-text-tertiary);
  margin: 0;
  line-height: 1.4;
}

.hint a {
  color: var(--color-accent-primary);
  text-decoration: none;
}

.hint a:hover {
  text-decoration: underline;
}

.error-message {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  background: var(--color-error-bg);
  color: var(--color-error);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  font-size: 12px;
}

.actions {
  margin-top: auto;
  padding-top: var(--spacing-md);
}

.continue-btn {
  width: 100%;
  background: var(--color-accent-primary);
  color: var(--color-text-inverted);
  border: none;
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-lg);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
}

.continue-btn:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.continue-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.continue-btn:disabled {
  background: var(--color-surface-secondary);
  color: var(--color-text-quaternary);
  cursor: not-allowed;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.welcome-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-md) 0 0;
  color: var(--color-text-tertiary);
}

.welcome-footer p {
  font-size: 11px;
  margin: 0;
}
</style>
