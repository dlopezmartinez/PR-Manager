<template>
  <!-- Login Screen -->
  <AuthView
    v-if="currentView === 'login'"
    @authenticated="handleAuthenticated"
  />

  <!-- Subscription Screen -->
  <SubscriptionScreen
    v-else-if="currentView === 'subscription'"
    @subscribed="handleSubscribed"
    @logout="handleLogout"
  />

  <!-- Token View (Keychain warning + Token input) -->
  <TokenView
    v-else-if="currentView === 'token'"
    @configured="handleConfigured"
  />

  <!-- Main App -->
  <component
    :is="AppComponent"
    v-else-if="currentView === 'app'"
  />

  <!-- Initial Loading Screen -->
  <div v-else class="loading-container">
    <div class="loading-spinner"></div>
    <p>Loading...</p>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, onMounted, type Component } from 'vue';
import AuthView from './components/AuthView.vue';
import SubscriptionScreen from './components/SubscriptionScreen.vue';
import TokenView from './views/TokenView.vue';
import { authStore } from './stores/authStore';
import { initializeConfig, isConfigured as checkIsConfigured, getApiKey } from './stores/configStore';

type ViewState = 'loading' | 'login' | 'subscription' | 'token' | 'app';

const KEYCHAIN_ACCESS_GRANTED_KEY = 'keychain-access-granted';
const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');

// Apply system theme immediately (before App.vue loads with full theme support)
function applySystemTheme() {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
}
applySystemTheme();

// Listen for system theme changes
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (currentView.value !== 'app') {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
  }
});

const currentView = ref<ViewState>('loading');
const AppComponent = shallowRef<Component | null>(null);

onMounted(async () => {
  await initialize();
});

async function initialize() {
  currentView.value = 'loading';

  // Initialize config (loads settings from storage)
  await initializeConfig();

  // Initialize auth
  await authStore.initialize();

  // Check 1: Is user logged in?
  if (!authStore.state.isAuthenticated) {
    currentView.value = 'login';
    return;
  }

  // Check 2: Does user need subscription?
  if (authStore.needsSubscription.value) {
    currentView.value = 'subscription';
    return;
  }

  // Check 3: Can we skip token view? (fast path)
  if (await canSkipTokenView()) {
    await loadApp();
    return;
  }

  // Need to show token view
  currentView.value = 'token';
}

async function canSkipTokenView(): Promise<boolean> {
  // Must be configured (has provider settings)
  if (!checkIsConfigured()) {
    return false;
  }

  // Must have a token
  const token = await getApiKey();
  if (!token) {
    return false;
  }

  // Non-macOS: just need config + token
  if (!isMac) {
    return true;
  }

  // macOS: also need keychain flag
  const hasFlag = localStorage.getItem(KEYCHAIN_ACCESS_GRANTED_KEY) === 'true';
  return hasFlag;
}

async function handleAuthenticated() {
  // Refresh subscription status after login
  await authStore.refreshSubscription();

  // Check subscription
  if (authStore.needsSubscription.value) {
    currentView.value = 'subscription';
    return;
  }

  // Check if can skip token view
  if (await canSkipTokenView()) {
    await loadApp();
    return;
  }

  currentView.value = 'token';
}

async function handleSubscribed() {
  await authStore.refreshSubscription();

  // Check if can skip token view
  if (await canSkipTokenView()) {
    await loadApp();
    return;
  }

  currentView.value = 'token';
}

function handleLogout() {
  currentView.value = 'login';
}

async function handleConfigured() {
  await loadApp();
}

async function loadApp() {
  try {
    // Dynamically import App.vue to defer loading all its dependencies
    const module = await import('./App.vue');
    AppComponent.value = module.default;
    currentView.value = 'app';
  } catch (error) {
    console.error('Error loading app:', error);
    // On error, go back to token view
    currentView.value = 'token';
  }
}
</script>

<style>
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 16px;
  color: var(--color-text-secondary, #6b7280);
  background-color: var(--color-bg-primary, #ffffff);
}

:root[data-theme="dark"] .loading-container {
  background-color: var(--color-bg-primary, #1a1a1a);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border, #e5e7eb);
  border-top-color: var(--color-accent, #6366f1);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

:root[data-theme="dark"] .loading-spinner {
  border-color: #374151;
  border-top-color: #6366f1;
}

.loading-container p {
  margin: 0;
  font-size: 14px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
