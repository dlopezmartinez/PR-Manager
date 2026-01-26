<template>
  <!-- Keychain Warning (macOS only, when no flag) -->
  <div v-if="state === 'keychain-warning'" class="keychain-auth-screen">
    <div class="keychain-content">
      <div class="keychain-icon">
        <KeyRound :size="48" :stroke-width="1.5" />
      </div>

      <h1>Secure Credential Access</h1>

      <p class="keychain-description">
        PR Manager stores your credentials securely using macOS Keychain.
        To access your saved data, macOS will ask for your password.
      </p>

      <div class="keychain-note">
        <Info :size="16" />
        <span>This is a standard macOS security feature to protect your data.</span>
      </div>

      <div v-if="keychainError" class="error-container">
        <div class="error-message">
          <AlertCircle :size="14" />
          {{ keychainError }}
        </div>

        <div v-if="wasAccessDenied" class="denied-notice">
          <p>macOS remembers your choice. To retry, you need to restart the app.</p>
        </div>
      </div>

      <div class="keychain-actions">
        <button
          v-if="wasAccessDenied"
          class="authorize-btn"
          @click="quitAndRestart"
        >
          Restart App
        </button>
        <button
          v-else
          class="authorize-btn"
          @click="handleKeychainAccept"
          :disabled="isVerifying"
        >
          <template v-if="isVerifying">
            <div class="btn-spinner"></div>
            Accessing Keychain...
          </template>
          <template v-else>
            Continue
          </template>
        </button>

        <button
          class="insecure-btn"
          @click="handleUseInsecureStorage"
          :disabled="isVerifying"
        >
          Use Insecure Storage
        </button>
      </div>

      <p class="insecure-warning">
        <strong>Warning:</strong> Insecure storage saves your API token without encryption.
      </p>
    </div>
  </div>

  <!-- Keychain Verifying -->
  <div v-else-if="state === 'verifying'" class="loading-container">
    <div class="loading-spinner"></div>
    <p>Verifying Keychain access...</p>
    <p class="hint">macOS may prompt for your password</p>
  </div>

  <!-- Token Input (WelcomeScreen content) -->
  <div v-else-if="state === 'token-input'" class="welcome-container">
    <TitleBar>
      <template #left>
        <span class="screen-title">Welcome</span>
      </template>
    </TitleBar>

    <div class="welcome-content">
      <div class="welcome-header">
        <div class="logo">
          <img src="../../assets/icon.svg" width="82" height="82" alt="PR Manager" />
        </div>
        <h1>PR Manager</h1>
        <p class="subtitle">Manage your Pull Requests from the menubar</p>
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

          <!-- Required Permissions Info -->
          <div class="permissions-info">
            <button
              type="button"
              class="permissions-toggle"
              @click="showPermissionsInfo = !showPermissionsInfo"
            >
              <Info :size="14" :stroke-width="2" />
              <span>What permissions does PR Manager need?</span>
              <ChevronDown
                :size="14"
                :stroke-width="2"
                class="chevron"
                :class="{ expanded: showPermissionsInfo }"
              />
            </button>

            <div v-if="showPermissionsInfo" class="permissions-details">
              <!-- GitHub Permissions -->
              <template v-if="selectedProvider === 'github'">
                <div class="permission-item required">
                  <div class="permission-header">
                    <code>repo</code>
                    <span class="permission-badge read-only">Read</span>
                    <span class="required-badge">Required</span>
                  </div>
                  <p>Read access to your repositories (including private). Required for viewing PRs, reviews, and checks.</p>
                </div>
                <div class="permission-item optional">
                  <div class="permission-header">
                    <code>repo</code>
                    <span class="permission-badge read-write">Write</span>
                    <span class="optional-badge">Optional</span>
                  </div>
                  <p>Write access enables actions like merging PRs, approving reviews, and adding comments.</p>
                </div>
                <div class="permission-item required">
                  <div class="permission-header">
                    <code>read:org</code>
                    <span class="permission-badge read-only">Read only</span>
                    <span class="required-badge">Required</span>
                  </div>
                  <p>Read which organizations you belong to, so we can show PRs from organization repositories.</p>
                </div>
              </template>

              <!-- GitLab Permissions -->
              <template v-else>
                <div class="permission-item required">
                  <div class="permission-header">
                    <code>read_api</code>
                    <span class="permission-badge read-only">Read</span>
                    <span class="required-badge">Required</span>
                  </div>
                  <p>Read access to GitLab API. Required for viewing merge requests and pipelines.</p>
                </div>
                <div class="permission-item optional">
                  <div class="permission-header">
                    <code>api</code>
                    <span class="permission-badge read-write">Write</span>
                    <span class="optional-badge">Optional</span>
                  </div>
                  <p>Full API access enables actions like merging MRs, approving reviews, and adding comments.</p>
                </div>
              </template>

              <!-- Security Note -->
              <div class="security-note">
                <Shield :size="14" :stroke-width="2" />
                <div>
                  <strong>Your code and organizations are safe</strong>
                  <p>PR Manager can only interact with pull requests. It cannot push code or modify repository settings.</p>
                </div>
              </div>
            </div>
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

        <div v-if="tokenError" class="error-message">
          <AlertCircle :size="14" :stroke-width="2" />
          {{ tokenError }}
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

  <!-- Loading/Checking state -->
  <div v-else class="loading-container">
    <div class="loading-spinner"></div>
    <p>Loading...</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  KeyRound, Info, AlertCircle, Eye, EyeOff, Github,
  GitMerge, ArrowRight, Lock, ChevronDown, Shield
} from 'lucide-vue-next';
import TitleBar from '../components/TitleBar.vue';
import { updateConfig, saveApiKey, isConfigured as checkIsConfigured, getApiKey } from '../stores/configStore';
import { openExternal } from '../utils/electron';
import type { ProviderType } from '../model/provider-types';

type ViewState = 'checking' | 'keychain-warning' | 'verifying' | 'token-input';

const KEYCHAIN_ACCESS_GRANTED_KEY = 'keychain-access-granted';
const VERIFICATION_TIMEOUT = 30000;

const emit = defineEmits<{
  (e: 'configured'): void;
}>();

const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');

// View state
const state = ref<ViewState>('checking');

// Keychain state
const keychainError = ref('');
const wasAccessDenied = ref(false);
const isVerifying = ref(false);

// Token input state
const providers = [
  { type: 'github' as ProviderType, name: 'GitHub', icon: Github },
  { type: 'gitlab' as ProviderType, name: 'GitLab', icon: GitMerge },
];
const selectedProvider = ref<ProviderType>('github');
const gitlabUrl = ref('');
const apiKey = ref('');
const username = ref('');
const showToken = ref(false);
const showPermissionsInfo = ref(false);
const loading = ref(false);
const tokenError = ref('');

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

onMounted(async () => {
  await initialize();
});

async function initialize() {
  state.value = 'checking';

  // Quick check: can we skip to app?
  if (await canSkipToApp()) {
    emit('configured');
    return;
  }

  // macOS without flag: show keychain warning
  if (isMac && !hasKeychainFlag()) {
    state.value = 'keychain-warning';
    return;
  }

  // Show token input
  state.value = 'token-input';
}

function hasKeychainFlag(): boolean {
  return localStorage.getItem(KEYCHAIN_ACCESS_GRANTED_KEY) === 'true';
}

async function canSkipToApp(): Promise<boolean> {
  if (!isMac) {
    // Non-macOS: just check if configured (has token)
    return checkIsConfigured() && !!(await getApiKey());
  }

  // macOS: need flag AND token
  if (!hasKeychainFlag()) {
    return false;
  }

  return checkIsConfigured() && !!(await getApiKey());
}

async function hasToken(): Promise<boolean> {
  try {
    const token = await getApiKey();
    return !!token;
  } catch {
    return false;
  }
}

async function handleKeychainAccept() {
  state.value = 'verifying';
  isVerifying.value = true;
  keychainError.value = '';

  try {
    const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) => {
      setTimeout(() => {
        resolve({ success: false, error: 'Keychain verification timed out. Please try again.' });
      }, VERIFICATION_TIMEOUT);
    });

    const result = await Promise.race([
      window.electronAPI.keychain.verifyAccess(),
      timeoutPromise,
    ]);

    if (result.success) {
      // Set flag
      localStorage.setItem(KEYCHAIN_ACCESS_GRANTED_KEY, 'true');
      wasAccessDenied.value = false;

      // Migrate if using insecure storage
      await migrateInsecureToKeychain();

      // Check if already has token
      if (await hasToken()) {
        emit('configured');
        return;
      }

      // Show token input
      state.value = 'token-input';
    } else {
      keychainError.value = result.error || 'Failed to access Keychain. Please try again.';
      const errorLower = result.error?.toLowerCase() || '';
      wasAccessDenied.value = errorLower.includes('denied') ||
                              errorLower.includes('canceled') ||
                              errorLower.includes('not available') ||
                              errorLower.includes('encryption');
      state.value = 'keychain-warning';
    }
  } catch (error) {
    console.error('Keychain verification error:', error);
    keychainError.value = error instanceof Error
      ? error.message
      : 'An unexpected error occurred while accessing Keychain.';
    wasAccessDenied.value = false;
    state.value = 'keychain-warning';
  } finally {
    isVerifying.value = false;
  }
}

async function migrateInsecureToKeychain() {
  try {
    const isInsecureMode = await window.electronAPI.keychain.getStorageMode();
    if (isInsecureMode) {
      const result = await window.electronAPI.keychain.migrateToSecure();
      if (!result.success) {
        console.error('Migration failed:', result.error);
      } else if (result.migrated > 0) {
        console.log(`Migrated ${result.migrated} credentials to Keychain`);
      }
    }
  } catch (error) {
    console.error('Error during migration:', error);
  }
}

async function handleUseInsecureStorage() {
  try {
    await window.electronAPI.keychain.setStorageMode(true);

    // Check if already has token
    if (await hasToken()) {
      emit('configured');
      return;
    }

    // Show token input
    state.value = 'token-input';
  } catch (error) {
    console.error('Error enabling insecure storage:', error);
    keychainError.value = 'Failed to enable insecure storage. Please try again.';
  }
}

function quitAndRestart() {
  window.electronAPI.ipc.send('relaunch-app');
}

function openTokenPage() {
  if (selectedProvider.value === 'github') {
    openExternal('https://github.com/settings/tokens');
  } else {
    const baseUrl = gitlabUrl.value || 'https://gitlab.com';
    openExternal(`${baseUrl}/-/user_settings/personal_access_tokens`);
  }
}

interface TokenValidationResult {
  valid: boolean;
  hasWritePermissions: boolean;
}

async function validateGitHubToken(token: string): Promise<TokenValidationResult> {
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

    if (!response.ok) return { valid: false, hasWritePermissions: false };

    const data = await response.json();
    const valid = !!data.data?.viewer?.login;

    const scopes = response.headers.get('X-OAuth-Scopes') || '';
    const scopeList = scopes.split(',').map(s => s.trim().toLowerCase());
    const hasWritePermissions = scopeList.some(scope =>
      scope === 'repo' || scope === 'public_repo'
    );

    return { valid, hasWritePermissions };
  } catch {
    return { valid: false, hasWritePermissions: false };
  }
}

async function validateGitLabToken(token: string, baseUrl?: string): Promise<TokenValidationResult> {
  try {
    const apiBase = baseUrl || 'https://gitlab.com';
    const graphqlEndpoint = `${apiBase}/api/graphql`;

    const response = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: '{ currentUser { username } }',
      }),
    });

    if (!response.ok) return { valid: false, hasWritePermissions: false };

    const data = await response.json();
    const valid = !!data.data?.currentUser?.username;

    let hasWritePermissions = false;
    try {
      const tokenInfoResponse = await fetch(`${apiBase}/api/v4/personal_access_tokens/self`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (tokenInfoResponse.ok) {
        const tokenInfo = await tokenInfoResponse.json();
        const scopes: string[] = tokenInfo.scopes || [];
        hasWritePermissions = scopes.some(scope =>
          scope === 'api' || scope === 'write_repository'
        );
      } else {
        hasWritePermissions = true;
      }
    } catch {
      hasWritePermissions = true;
    }

    return { valid, hasWritePermissions };
  } catch {
    return { valid: false, hasWritePermissions: false };
  }
}

async function handleContinue() {
  if (!apiKey.value) return;

  loading.value = true;
  tokenError.value = '';

  let validationResult: TokenValidationResult;

  if (selectedProvider.value === 'github') {
    validationResult = await validateGitHubToken(apiKey.value);
  } else {
    validationResult = await validateGitLabToken(apiKey.value, gitlabUrl.value || undefined);
  }

  if (!validationResult.valid) {
    tokenError.value = 'Invalid token. Please check and try again.';
    loading.value = false;
    return;
  }

  const saved = await saveApiKey(apiKey.value);
  if (!saved) {
    tokenError.value = 'Failed to save token securely. Please try again.';
    loading.value = false;
    return;
  }

  updateConfig({
    providerType: selectedProvider.value,
    gitlabUrl: selectedProvider.value === 'gitlab' ? (gitlabUrl.value || undefined) : undefined,
    username: username.value,
    hasWritePermissions: validationResult.hasWritePermissions,
  });

  loading.value = false;
  emit('configured');
}
</script>

<style scoped>
/* Keychain Warning Styles */
.keychain-auth-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background-color: var(--color-bg-primary);
}

.keychain-content {
  max-width: 400px;
  text-align: center;
}

.keychain-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: 20px;
  background: var(--color-accent-lighter);
  color: var(--color-accent-primary);
  margin-bottom: 24px;
}

.keychain-content h1 {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: var(--color-text-primary);
}

.keychain-description {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  margin: 0 0 20px 0;
}

.keychain-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 16px;
  background: var(--color-surface-secondary);
  border-radius: 8px;
  font-size: 12px;
  color: var(--color-text-tertiary);
  text-align: left;
  margin-bottom: 24px;
}

.keychain-note svg {
  flex-shrink: 0;
  margin-top: 1px;
}

.keychain-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.authorize-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-inverted);
  background-color: var(--color-accent-primary);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.authorize-btn:hover:not(:disabled) {
  background-color: var(--color-accent-hover);
}

.authorize-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.insecure-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-inverted);
  background-color: var(--color-error);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.insecure-btn:hover:not(:disabled) {
  background-color: #b91c1c;
}

.insecure-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.insecure-warning {
  margin-top: 16px;
  font-size: 12px;
  color: var(--color-text-tertiary);
  line-height: 1.5;
}

.insecure-warning strong {
  color: var(--color-warning);
}

.error-container {
  margin-bottom: 16px;
}

.denied-notice {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 8px;
  padding: 12px 16px;
  margin-top: 12px;
}

.denied-notice p {
  margin: 0;
  font-size: 13px;
  color: #d97706;
  line-height: 1.4;
}

/* Loading Styles */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 16px;
  color: var(--color-text-secondary);
  background-color: var(--color-bg-primary);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border-primary);
  border-top-color: var(--color-accent-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loading-container p {
  margin: 0;
  font-size: 14px;
}

.loading-container .hint {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.btn-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Welcome/Token Input Styles */
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
  margin-bottom: 32px;
}

.logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
}

.welcome-content h1 {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 4px 0;
}

.subtitle {
  font-size: 14px;
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

.form-group label {
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
  background: var(--color-accent-lighter);
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
  box-shadow: 0 0 0 2px var(--color-accent-lighter);
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

/* Permissions Info Section */
.permissions-info {
  margin-top: var(--spacing-md);
  margin-bottom: var(--spacing-md);
  border-top: 1px solid var(--color-border-tertiary);
  padding-top: var(--spacing-md);
}

.permissions-toggle {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 12px;
  cursor: pointer;
  padding: var(--spacing-xs) 0;
  width: 100%;
  text-align: left;
  transition: color var(--transition-fast);
}

.permissions-toggle:hover {
  color: var(--color-text-primary);
}

.permissions-toggle .chevron {
  transition: transform var(--transition-fast);
}

.permissions-toggle .chevron.expanded {
  transform: rotate(180deg);
}

.permissions-details {
  margin-top: var(--spacing-sm);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.permission-item {
  background: var(--color-surface-secondary);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm);
}

.permission-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: 4px;
}

.permission-header code {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-accent-primary);
  background: var(--color-accent-lighter);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.permission-badge {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.permission-badge.read-only {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.permission-badge.read-write {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.required-badge,
.optional-badge {
  font-size: 9px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.required-badge {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.optional-badge {
  background: var(--color-info-bg);
  color: var(--color-info);
}

.permission-item.optional {
  border-left: 2px solid var(--color-info);
  padding-left: calc(var(--spacing-sm) - 2px);
}

.permission-item.required {
  border-left: 2px solid var(--color-error);
  padding-left: calc(var(--spacing-sm) - 2px);
}

.permission-item p {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.5;
}

.security-note {
  display: flex;
  gap: var(--spacing-sm);
  background: var(--color-info-bg);
  border: 1px solid var(--color-info);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm);
  margin-top: var(--spacing-xs);
}

.security-note > svg {
  flex-shrink: 0;
  color: var(--color-info);
  margin-top: 2px;
}

.security-note strong {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 2px;
}

.security-note p {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.5;
}
</style>
