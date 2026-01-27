<template>
  <Teleport to="body">
    <div class="settings-overlay" @click.self="$emit('close')">
      <div class="settings-modal" :class="{ 'settings-modal--macos': isMac }">
        <TitleBar>
          <template #left>
            <h1 class="settings-title">Settings</h1>
          </template>
          <template #right>
            <button class="titlebar-btn" @click="$emit('close')" title="Close">
              <X :size="16" :stroke-width="2" />
            </button>
          </template>
        </TitleBar>

        <div class="settings-content">
          <section class="settings-section">
            <h3>Account</h3>

            <div class="setting-row">
              <div class="setting-info">
                <label>Provider</label>
                <p class="setting-description">Your Git hosting service</p>
              </div>
              <div class="setting-control">
                <span class="provider-badge">
                  <Github v-if="config.providerType === 'github'" :size="14" :stroke-width="2" />
                  <GitMerge v-else :size="14" :stroke-width="2" />
                  {{ config.providerType === 'github' ? 'GitHub' : 'GitLab' }}
                  <span v-if="config.providerType === 'gitlab' && config.gitlabUrl" class="gitlab-url-hint">
                    ({{ config.gitlabUrl }})
                  </span>
                </span>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <label>{{ providerTokenLabel }}</label>
                <p class="setting-description">Your personal access token</p>
              </div>
              <div class="setting-control">
                <span class="token-masked">{{ maskedToken }}</span>
                <button class="text-btn" @click="showTokenModal = true">Change</button>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <label>Username</label>
                <p class="setting-description">Your {{ config.providerType === 'github' ? 'GitHub' : 'GitLab' }} username (optional)</p>
              </div>
              <div class="setting-control">
                <input
                  v-model="localUsername"
                  type="text"
                  placeholder="Auto-detect"
                  @blur="saveUsername"
                />
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <label>Token Permissions</label>
                <p class="setting-description">Your token's access level</p>
              </div>
              <div class="setting-control">
                <span v-if="config.hasWritePermissions" class="permission-status permission-write">
                  <Check :size="12" :stroke-width="2" />
                  Read & Write
                </span>
                <span v-else class="permission-status permission-read">
                  <Eye :size="12" :stroke-width="2" />
                  Read Only
                </span>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <label>Reset Configuration</label>
                <p class="setting-description">Clear token and provider to start fresh</p>
              </div>
              <div class="setting-control">
                <button class="reset-token-btn" @click="handleResetToken">
                  Reset Token
                </button>
              </div>
            </div>
          </section>

          <section class="settings-section">
            <h3>Display</h3>
            
            <div class="setting-row">
              <div class="setting-info">
                <label>Show Comments</label>
                <p class="setting-description">Display comment counts on PR cards</p>
              </div>
              <div class="setting-control">
                <label class="toggle">
                  <input type="checkbox" v-model="config.showComments" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <label>Show Pipeline Checks</label>
                <p class="setting-description">Display CI/CD status on PR cards</p>
              </div>
              <div class="setting-control">
                <label class="toggle">
                  <input type="checkbox" v-model="config.showChecks" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <label>Expandable Comments</label>
                <p class="setting-description">Allow expanding comments section</p>
              </div>
              <div class="setting-control">
                <label class="toggle">
                  <input type="checkbox" v-model="config.allowCommentsExpansion" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <label>Expandable Checks</label>
                <p class="setting-description">Allow expanding checks section</p>
              </div>
              <div class="setting-control">
                <label class="toggle">
                  <input type="checkbox" v-model="config.allowChecksExpansion" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <label>Theme</label>
                <p class="setting-description">Choose your preferred color theme</p>
              </div>
              <div class="setting-control">
                <select v-model="config.theme" class="theme-select">
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <label>Zoom Level</label>
                <p class="setting-description">Adjust the interface size</p>
              </div>
              <div class="setting-control zoom-controls">
                <button class="zoom-btn" @click="decreaseZoom" :disabled="currentZoom <= minZoom">
                  -
                </button>
                <span class="zoom-level">{{ zoomPercentage }}%</span>
                <button class="zoom-btn" @click="increaseZoom" :disabled="currentZoom >= maxZoom">
                  +
                </button>
                <button v-if="currentZoom !== 0" class="zoom-reset-btn" @click="resetZoom">
                  Reset
                </button>
              </div>
            </div>
          </section>

          <section class="settings-section">
            <h3>Notifications – Auto refresh</h3>
            
            <div class="setting-row">
              <div class="setting-info">
                <label>Enable Polling</label>
                <p class="setting-description">Automatically refresh PR list</p>
              </div>
              <div class="setting-control">
                <label class="toggle">
                  <input type="checkbox" v-model="config.pollingEnabled" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-row" v-if="config.pollingEnabled">
              <div class="setting-info">
                <label>Refresh Interval</label>
                <p class="setting-description">How often to check for updates</p>
              </div>
              <div class="setting-control">
                <select v-model="config.pollingInterval">
                  <option :value="30">30 seconds</option>
                  <option :value="60">1 minute</option>
                  <option :value="120">2 minutes</option>
                  <option :value="300">5 minutes</option>
                  <option :value="600">10 minutes</option>
                </select>
              </div>
            </div>

            <div class="setting-row" v-if="config.pollingEnabled">
              <div class="setting-info">
                <label>Background Polling</label>
                <p class="setting-description">Continue refreshing when window is hidden</p>
              </div>
              <div class="setting-control">
                <label class="toggle">
                  <input type="checkbox" v-model="config.backgroundPolling" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </section>

          <section class="settings-section">
            <h3>Notifications</h3>
            
            <div class="setting-row">
              <div class="setting-info">
                <label>Enable Notifications</label>
                <p class="setting-description">Show native OS notifications</p>
              </div>
              <div class="setting-control">
                <label class="toggle">
                  <input type="checkbox" v-model="config.notificationsEnabled" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-row" v-if="config.notificationsEnabled">
              <div class="setting-info">
                <label>New Pull Requests</label>
                <p class="setting-description">Notify when new PRs need your review</p>
              </div>
              <div class="setting-control">
                <label class="toggle">
                  <input type="checkbox" v-model="config.notifyOnNewPR" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-row" v-if="config.notificationsEnabled">
              <div class="setting-info">
                <label>New Comments</label>
                <p class="setting-description">Notify when PRs receive new comments</p>
              </div>
              <div class="setting-control">
                <label class="toggle">
                  <input type="checkbox" v-model="config.notifyOnNewComments" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-row" v-if="config.notificationsEnabled">
              <div class="setting-info">
                <label>Test Notifications</label>
                <p class="setting-description">Send a test notification to verify setup</p>
              </div>
              <div class="setting-control test-buttons">
                <button
                  class="test-btn"
                  :class="{ 'test-sent': testNotificationSent && testNotificationType === 'pr' }"
                  @click="testNewPRNotification"
                >
                  <Check v-if="testNotificationSent && testNotificationType === 'pr'" :size="14" :stroke-width="2" />
                  <Bell v-else :size="14" :stroke-width="2" />
                  <span>{{ testNotificationSent && testNotificationType === 'pr' ? 'Sent!' : 'New PR' }}</span>
                </button>
                <button
                  class="test-btn"
                  :class="{ 'test-sent': testNotificationSent && testNotificationType === 'comment' }"
                  @click="testNewCommentNotification"
                >
                  <Check v-if="testNotificationSent && testNotificationType === 'comment'" :size="14" :stroke-width="2" />
                  <MessageSquare v-else :size="14" :stroke-width="2" />
                  <span>{{ testNotificationSent && testNotificationType === 'comment' ? 'Sent!' : 'New Comment' }}</span>
                </button>
              </div>
            </div>
          </section>

          <section class="settings-section">
            <h3>Follow-up</h3>

            <div class="setting-row">
              <div class="setting-info">
                <label>Enable Follow-up</label>
                <p class="setting-description">Track changes on PRs you're following</p>
              </div>
              <div class="setting-control">
                <label class="toggle">
                  <input type="checkbox" v-model="config.followUpEnabled" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-row" v-if="config.followUpEnabled">
              <div class="setting-info">
                <label>Notify on New Commits</label>
                <p class="setting-description">Get notified when followed PRs have new commits</p>
              </div>
              <div class="setting-control">
                <label class="toggle">
                  <input type="checkbox" v-model="config.followUpNotifyOnCommits" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-row" v-if="config.followUpEnabled">
              <div class="setting-info">
                <label>Notify on New Comments</label>
                <p class="setting-description">Get notified when followed PRs have new comments</p>
              </div>
              <div class="setting-control">
                <label class="toggle">
                  <input type="checkbox" v-model="config.followUpNotifyOnComments" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-row" v-if="config.followUpEnabled">
              <div class="setting-info">
                <label>Notify on New Reviews</label>
                <p class="setting-description">Get notified when followed PRs have new reviews</p>
              </div>
              <div class="setting-control">
                <label class="toggle">
                  <input type="checkbox" v-model="config.followUpNotifyOnReviews" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-row" v-if="config.followUpEnabled">
              <div class="setting-info">
                <label>Following</label>
                <p class="setting-description">PRs you're currently tracking</p>
              </div>
              <div class="setting-control">
                <span class="follow-count-badge">{{ followedPRsCount }} PR{{ followedPRsCount !== 1 ? 's' : '' }}</span>
                <button v-if="followedPRsCount > 0" class="text-btn danger" @click="handleClearFollowed">Clear all</button>
              </div>
            </div>
          </section>

          <section class="settings-section">
            <h3>Performance</h3>

            <div class="setting-row">
              <div class="setting-info">
                <label>Prefetch on Hover</label>
                <p class="setting-description">Load details when hovering over cards</p>
              </div>
              <div class="setting-control">
                <label class="toggle">
                  <input type="checkbox" v-model="config.prefetchOnHover" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </section>

          <section class="settings-section">
            <h3>Filtering</h3>
            
            <div class="setting-row">
              <div class="setting-info">
                <label>Explicit Reviewer Only</label>
                <p class="setting-description">Only show PRs where you're directly requested as reviewer (not via team)</p>
              </div>
              <div class="setting-control">
                <label class="toggle">
                  <input type="checkbox" v-model="config.explicitReviewerOnly" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </section>

          <section v-if="$slots.views" class="settings-section">
            <h3>Custom Views</h3>
            <slot name="views"></slot>
          </section>

          <section class="settings-section about-section">
            <h3>About</h3>
            <div class="setting-row">
              <div class="setting-info">
                <label>Version</label>
                <p class="setting-description">PR Manager</p>
              </div>
              <div class="setting-control">
                <span class="version-badge">v{{ appVersion }}</span>
              </div>
            </div>
          </section>
        </div>

        <div class="settings-footer">
          <button class="logout-btn" @click="handleLogout">
            Sign Out
          </button>
        </div>
      </div>
    </div>

    <div v-if="showTokenModal" class="settings-overlay" @click.self="closeTokenModal">
      <div class="token-modal">
        <h3>Change {{ config.providerType === 'github' ? 'GitHub' : 'GitLab' }} Token</h3>

        <div v-if="tokenValidationResult && !tokenValidationResult.valid" class="token-validation-error">
          <div class="validation-header">
            <AlertCircle :size="20" :stroke-width="2" />
            <span>Token validation failed</span>
          </div>

          <div v-if="tokenValidationResult.error && tokenValidationResult.scopes.length === 0" class="validation-detail">
            <p class="validation-message">{{ tokenValidationResult.error }}</p>
          </div>

          <div v-else-if="tokenValidationResult.missingScopes.length > 0" class="validation-detail">
            <div class="scopes-comparison">
              <div class="scopes-column">
                <span class="scopes-label">Your token has:</span>
                <div class="scopes-list">
                  <span v-if="tokenValidationResult.scopes.length === 0" class="scope-badge empty">No scopes</span>
                  <span v-for="scope in tokenValidationResult.scopes" :key="scope" class="scope-badge current">
                    {{ scope }}
                  </span>
                </div>
              </div>
              <div class="scopes-arrow">
                <ArrowRight :size="16" :stroke-width="2" />
              </div>
              <div class="scopes-column">
                <span class="scopes-label">Required:</span>
                <div class="scopes-list">
                  <span v-for="scope in tokenValidationResult.missingScopes" :key="scope" class="scope-badge required">
                    {{ scope }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <button class="create-token-btn" @click="openTokenCreationPage">
            <ExternalLink :size="14" :stroke-width="2" />
            Create new token with correct permissions
          </button>
        </div>

        <div v-else class="token-help-detailed">
          <div class="required-scopes-info">
            <span class="scopes-title">Required scopes:</span>
            <div class="scopes-list-inline">
              <span
                v-for="scope in (config.providerType === 'github' ? GITHUB_REQUIRED_SCOPES_INFO.scopes : GITLAB_REQUIRED_SCOPES_INFO.scopes)"
                :key="scope"
                class="scope-badge-inline"
                :title="config.providerType === 'github' ? GITHUB_REQUIRED_SCOPES_INFO.descriptions[scope] : GITLAB_REQUIRED_SCOPES_INFO.descriptions[scope]"
              >
                {{ scope }}
              </span>
            </div>
          </div>
          <a
            href="#"
            class="create-token-link"
            @click.prevent="openTokenCreationPage"
          >
            Create new token
          </a>
        </div>

        <div class="form-group">
          <label for="newToken">New {{ providerTokenLabel }}</label>
          <input
            id="newToken"
            v-model="newToken"
            :type="showNewToken ? 'text' : 'password'"
            :placeholder="tokenPlaceholder"
            @input="clearValidationResult"
          />
        </div>
        <div class="modal-actions">
          <button class="cancel-btn" @click="closeTokenModal">Cancel</button>
          <button class="save-btn" :disabled="!newToken || validatingToken" @click="changeToken">
            <span v-if="validatingToken" class="spinner"></span>
            <span v-else>Save</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { X, Bell, MessageSquare, Github, GitMerge, AlertCircle, ArrowRight, ExternalLink, Check, Eye } from 'lucide-vue-next';
import TitleBar from './TitleBar.vue';
import type { TokenValidationResult } from '../utils/electron';
import { configStore, updateConfig, saveApiKey, clearApiKey, getApiKey } from '../stores/configStore';
import { authStore } from '../stores/authStore';
import { showNotification, isElectron, setZoomLevel, getZoomLevel, validateToken as validateTokenAPI, openExternal, getAppVersion, getPlatform } from '../utils/electron';
import { followedCount, clearAllFollowed } from '../stores/followUpStore';
import { ProviderFactory } from '../providers';

const GITHUB_REQUIRED_SCOPES_INFO = {
  scopes: ['repo', 'read:org'],
  descriptions: {
    'repo': 'Full access to repositories (PRs, reviews, merges)',
    'read:org': 'List organization repositories',
  },
  createUrl: 'https://github.com/settings/tokens/new?scopes=repo,read:org&description=PR%20Manager',
};

const GITLAB_REQUIRED_SCOPES_INFO = {
  scopes: ['api'],
  descriptions: {
    'api': 'Full API access (read/write)',
  },
  createUrl: 'https://gitlab.com/-/profile/personal_access_tokens',
};

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'logout'): void;
  (e: 'refresh-needed'): void;
  (e: 'provider-changed'): void;
}>();

const config = configStore;
const isMac = computed(() => getPlatform() === 'darwin');
const localUsername = ref(config.username);

const providerTokenLabel = computed(() => {
  return config.providerType === 'github'
    ? 'GitHub Token'
    : 'GitLab Token';
});

const tokenPlaceholder = computed(() => {
  return config.providerType === 'github'
    ? 'ghp_xxxxxxxxxxxxxxxxxxxx'
    : 'glpat-xxxxxxxxxxxxxxxxxxxx';
});

const showTokenModal = ref(false);
const showNewToken = ref(false);
const newToken = ref('');
const validatingToken = ref(false);
const tokenValidationResult = ref<TokenValidationResult | null>(null);

const appVersion = ref('');

const ZOOM_STEP = 0.5;
const minZoom = -3; // ~50%
const maxZoom = 3;  // ~150%
const currentZoom = ref(0);

const zoomPercentage = computed(() => {
  const factor = Math.pow(1.2, currentZoom.value);
  return Math.round(factor * 100);
});

function increaseZoom() {
  if (currentZoom.value < maxZoom && isElectron()) {
    currentZoom.value = Math.round((currentZoom.value + ZOOM_STEP) * 10) / 10;
    setZoomLevel(currentZoom.value);
    saveZoomLevel();
  }
}

function decreaseZoom() {
  if (currentZoom.value > minZoom && isElectron()) {
    currentZoom.value = Math.round((currentZoom.value - ZOOM_STEP) * 10) / 10;
    setZoomLevel(currentZoom.value);
    saveZoomLevel();
  }
}

function resetZoom() {
  if (isElectron()) {
    currentZoom.value = 0;
    setZoomLevel(0);
    saveZoomLevel();
  }
}

function saveZoomLevel() {
  localStorage.setItem('app-zoom-level', currentZoom.value.toString());
}

function loadZoomLevel() {
  const saved = localStorage.getItem('app-zoom-level');
  if (saved !== null) {
    currentZoom.value = parseFloat(saved);
    if (isElectron()) {
      setZoomLevel(currentZoom.value);
    }
  } else if (isElectron()) {
    currentZoom.value = getZoomLevel();
  }
}

onMounted(async () => {
  loadZoomLevel();
  appVersion.value = await getAppVersion();
});

watch(() => config.explicitReviewerOnly, () => {
  emit('refresh-needed');
});

const maskedToken = computed(() => {
  const token = getApiKey();
  if (!token) return '(not set)';
  return `${token.slice(0, 4)}••••••••${token.slice(-4)}`;
});

function saveUsername() {
  updateConfig({ username: localUsername.value });
}

async function handleResetToken() {
  // Clear API key from secure storage
  await clearApiKey();

  // Reset provider type to default
  updateConfig({
    providerType: 'github',
    username: '',
    gitlabUrl: undefined,
  });

  // Reset provider instance so a new one is created with the correct type
  ProviderFactory.resetProvider();

  // Notify parent to redirect to TokenView
  emit('provider-changed');
}

async function changeToken() {
  if (!newToken.value) return;

  validatingToken.value = true;
  tokenValidationResult.value = null;

  // Validate token with scope checking
  const result = await validateTokenAPI(
    config.providerType as 'github' | 'gitlab',
    newToken.value,
    config.providerType === 'gitlab' ? config.gitlabUrl : undefined
  );

  if (!result.valid) {
    tokenValidationResult.value = result;
    validatingToken.value = false;
    return;
  }

  const saved = await saveApiKey(newToken.value);
  if (!saved) {
    tokenValidationResult.value = {
      valid: false,
      scopes: [],
      missingScopes: [],
      error: 'Failed to save token securely. Please try again.',
    };
    validatingToken.value = false;
    return;
  }

  // If validation returned a username, auto-fill it
  if (result.username && !localUsername.value) {
    localUsername.value = result.username;
    saveUsername();
  }

  closeTokenModal();
}

function clearValidationResult() {
  tokenValidationResult.value = null;
}

function closeTokenModal() {
  showTokenModal.value = false;
  newToken.value = '';
  validatingToken.value = false;
  tokenValidationResult.value = null;
}

async function handleLogout() {
  await authStore.logout();
  emit('logout');
}

function openTokenCreationPage() {
  const url = config.providerType === 'github'
    ? GITHUB_REQUIRED_SCOPES_INFO.createUrl
    : GITLAB_REQUIRED_SCOPES_INFO.createUrl;
  openExternal(url);
}

const testNotificationSent = ref(false);
const testNotificationType = ref<'pr' | 'comment' | null>(null);

function testNewPRNotification() {
  console.log('[Settings] Testing New PR notification...');
  showNotification({
    title: 'Test: New Pull Request',
    body: 'octocat: Add amazing new feature',
    subtitle: 'octocat/hello-world',
    url: 'https://github.com',
  });
  showTestFeedback('pr');
}

function testNewCommentNotification() {
  console.log('[Settings] Testing New Comment notification...');
  showNotification({
    title: 'Test: 3 new comments',
    body: 'Fix critical bug in authentication',
    subtitle: 'myorg/myrepo #42',
    url: 'https://github.com',
  });
  showTestFeedback('comment');
}

function showTestFeedback(type: 'pr' | 'comment') {
  testNotificationType.value = type;
  testNotificationSent.value = true;
  setTimeout(() => {
    testNotificationSent.value = false;
    testNotificationType.value = null;
  }, 2000);
}

const followedPRsCount = computed(() => followedCount.value);

function handleClearFollowed() {
  clearAllFollowed();
}
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: var(--color-bg-overlay);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
  will-change: opacity;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  isolation: isolate;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.settings-modal {
  background: var(--color-bg-secondary);
  width: 100%;
  max-width: 100%;
  max-height: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.2s ease;
  will-change: transform, opacity;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  contain: layout paint;
}

.settings-modal--macos {
  border-radius: var(--radius-xl);
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

.settings-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.2px;
  margin: 0;
  color: var(--color-text-primary);
}

.titlebar-btn {
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  width: 32px;
  height: 32px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
}

.titlebar-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md);
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.settings-section {
  background: var(--color-bg-elevated);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-md);
  border: 1px solid var(--color-border-tertiary);
}

.settings-section h3 {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin: 0 0 var(--spacing-sm) 2px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) 2px;
  border-bottom: 1px solid var(--color-border-tertiary);
}

.setting-row:last-child {
  border-bottom: none;
}

.setting-info {
  flex: 1;
}

.setting-info label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-primary);
  display: block;
}

.setting-description {
  font-size: 10px;
  color: var(--color-text-tertiary);
  margin: 1px 0 0 0;
}

.setting-control {
  display: flex;
  align-items: center;
  gap: 6px;
}

.provider-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--color-surface-secondary);
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.gitlab-url-hint {
  font-size: 10px;
  color: var(--color-text-tertiary);
  font-weight: 400;
}

.reset-token-btn {
  padding: 6px 12px;
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-md);
  background: var(--color-surface-primary);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.reset-token-btn:hover {
  border-color: var(--color-error);
  background: var(--color-error-bg);
  color: var(--color-error);
}

.token-masked {
  font-family: var(--font-family-mono);
  font-size: 10px;
  color: var(--color-text-tertiary);
}

.text-btn {
  background: none;
  border: none;
  color: var(--color-accent-primary);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 6px;
}

.text-btn:hover {
  text-decoration: underline;
}

.setting-control input[type="text"] {
  width: 100px;
  padding: 6px var(--spacing-sm);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-sm);
  font-size: 12px;
  background: var(--color-surface-primary);
  color: var(--color-text-primary);
  text-align: right;
}

.setting-control input[type="text"]:focus {
  outline: none;
  border-color: var(--color-accent-primary);
  box-shadow: 0 0 0 2px var(--color-accent-light);
}

.setting-control select {
  padding: 6px var(--spacing-sm);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-sm);
  font-size: 12px;
  background: var(--color-surface-primary);
  color: var(--color-text-primary);
  cursor: pointer;
}

.permission-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 500;
}

.permission-status.permission-write {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.permission-status.permission-read {
  background: var(--color-warning-bg, rgba(245, 158, 11, 0.1));
  color: var(--color-warning, #f59e0b);
}

.test-buttons {
  gap: 8px;
}

.test-btn {
  padding: 6px 10px;
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-sm);
  font-size: 11px;
  background: var(--color-surface-primary);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}

.test-btn:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-border-primary);
}

.test-btn:active {
  transform: scale(0.97);
  background: var(--color-surface-active);
}

.test-btn.test-sent {
  background: var(--color-success-bg);
  border-color: var(--color-success);
  color: var(--color-success);
}

.toggle {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 24px;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--color-surface-secondary);
  transition: 0.3s;
  border-radius: 24px;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 2px;
  bottom: 2px;
  background: var(--color-bg-elevated);
  transition: 0.3s;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.toggle input:checked + .toggle-slider {
  background: var(--color-success);
}

.toggle input:checked + .toggle-slider:before {
  transform: translateX(16px);
}

.settings-footer {
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--color-bg-elevated);
  border-top: 1px solid var(--color-border-primary);
  display: flex;
  justify-content: center;
  flex-shrink: 0;
}

.logout-btn {
  background: none;
  border: none;
  color: var(--color-error);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 6px 12px;
  transition: all var(--transition-fast);
}

.logout-btn:hover {
  background: var(--color-error-bg);
  border-radius: var(--radius-sm);
}

.token-modal {
  background: var(--color-bg-elevated);
  border-radius: var(--radius-xl);
  padding: var(--spacing-lg);
  width: 100%;
  max-width: 400px;
  box-shadow: var(--shadow-lg-themed);
  border: 1px solid var(--color-border-secondary);
}

.token-modal h3 {
  margin: 0 0 var(--spacing-sm) 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.token-help-detailed {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  background: var(--color-surface-primary);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-lg);
  border: 1px solid var(--color-border-tertiary);
}

.required-scopes-info {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.scopes-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.scopes-list-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.scope-badge-inline {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  background: var(--color-accent-light);
  color: var(--color-accent-primary);
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-family-mono);
  cursor: help;
}

.create-token-link {
  font-size: 12px;
  color: var(--color-accent-primary);
  text-decoration: none;
  font-weight: 500;
}

.create-token-link:hover {
  text-decoration: underline;
}

.token-validation-error {
  background: var(--color-error-bg);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.validation-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  color: var(--color-error);
  font-weight: 600;
  font-size: 14px;
  margin-bottom: var(--spacing-md);
}

.validation-detail {
  margin-bottom: var(--spacing-md);
}

.validation-message {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-primary);
}

.scopes-comparison {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
}

.scopes-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.scopes-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.scopes-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.scope-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 500;
  font-family: var(--font-family-mono);
}

.scope-badge.current {
  background: var(--color-surface-secondary);
  color: var(--color-text-secondary);
}

.scope-badge.required {
  background: var(--color-success-bg);
  color: var(--color-success);
  border: 1px solid var(--color-success);
}

.scope-badge.empty {
  background: var(--color-surface-secondary);
  color: var(--color-text-quaternary);
  font-style: italic;
  font-family: var(--font-family);
}

.scopes-arrow {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.create-token-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-accent-primary);
  color: var(--color-text-inverted);
  border: none;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.create-token-btn:hover {
  background: var(--color-accent-hover);
}

.form-group {
  margin-bottom: var(--spacing-lg);
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: var(--spacing-sm);
  color: var(--color-text-primary);
}

.form-group input {
  width: 100%;
  padding: var(--spacing-md) var(--spacing-md);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-md);
  font-size: 14px;
  background: var(--color-surface-primary);
  color: var(--color-text-primary);
}

.form-group input:focus {
  outline: none;
  border-color: var(--color-accent-primary);
  box-shadow: 0 0 0 3px var(--color-accent-light);
}

.error-message {
  background: var(--color-error-bg);
  color: var(--color-error);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  font-size: 13px;
  margin-bottom: var(--spacing-lg);
}

.modal-actions {
  display: flex;
  gap: var(--spacing-md);
  justify-content: flex-end;
}

.cancel-btn {
  background: var(--color-surface-secondary);
  color: var(--color-text-primary);
  border: none;
  border-radius: var(--radius-md);
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.cancel-btn:hover {
  background: var(--color-surface-hover);
}

.save-btn {
  background: var(--color-accent-primary);
  color: var(--color-text-inverted);
  border: none;
  border-radius: var(--radius-md);
  padding: 10px 24px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  gap: 8px;
}

.save-btn:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.save-btn:disabled {
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

.zoom-controls {
  gap: 8px !important;
}

.zoom-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-border-secondary);
  background: var(--color-surface-primary);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.zoom-btn:hover:not(:disabled) {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
  border-color: var(--color-border-primary);
}

.zoom-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.zoom-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.zoom-level {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
  min-width: 45px;
  text-align: center;
  user-select: none;
}

.zoom-reset-btn {
  padding: 4px 10px;
  border: 1px solid var(--color-border-secondary);
  background: var(--color-surface-primary);
  border-radius: var(--radius-md);
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.zoom-reset-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
  border-color: var(--color-border-primary);
}

.version-badge {
  display: inline-block;
  padding: 4px 10px;
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);
  border-radius: 6px;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace;
}

.about-section {
  border-top: 1px solid var(--color-border-secondary);
  margin-top: 8px;
  padding-top: 8px;
}

.follow-count-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  background: var(--color-accent-light);
  color: var(--color-accent-primary);
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
}

.text-btn.danger {
  color: var(--color-error);
}

.text-btn.danger:hover {
  background: var(--color-error-bg);
  border-radius: var(--radius-sm);
}
</style>
