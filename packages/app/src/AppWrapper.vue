<template>
  <div class="app-wrapper">
    <Transition :name="transitionName" mode="out-in">
      <!-- Loading Screen -->
      <div v-if="currentRoute === 'loading'" key="loading" class="loading-container">
        <div class="loading-spinner"></div>
        <p>Loading...</p>
      </div>

      <!-- Login Screen -->
      <div v-else-if="currentRoute === 'login'" key="login" class="route-container">
        <AuthView
          @authenticated="handleAuthenticated"
          @keychain-denied="handleKeychainDenied"
        />
      </div>

      <!-- Keychain Required (access denied) -->
      <div v-else-if="currentRoute === 'keychain-required'" key="keychain-required" class="route-container">
        <KeychainRequiredView />
      </div>

      <!-- Subscription Screen -->
      <div v-else-if="currentRoute === 'subscription'" key="subscription" class="route-container">
        <SubscriptionScreen
          @subscribed="handleSubscribed"
          @logout="handleLogout"
        />
      </div>

      <!-- Token View -->
      <div v-else-if="currentRoute === 'token'" key="token" class="route-container">
        <TokenView @configured="handleConfigured" />
      </div>

      <!-- Main App -->
      <div v-else-if="currentRoute === 'app'" key="app" class="route-container">
        <component :is="AppComponent" />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { shallowRef, onMounted, computed, type Component } from 'vue';
import AuthView from './components/AuthView.vue';
import KeychainRequiredView from './views/KeychainRequiredView.vue';
import SubscriptionScreen from './components/SubscriptionScreen.vue';
import TokenView from './views/TokenView.vue';
import { authStore } from './stores/authStore';
import { routerStore, type RouteType } from './stores/routerStore';
import { initializeConfig, isConfigured as checkIsConfigured, getApiKey } from './stores/configStore';

const HAS_LOGGED_IN_KEY = 'pr-manager-has-logged-in';
const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');

// Apply system theme immediately (before App.vue loads with full theme support)
function applySystemTheme() {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
}
applySystemTheme();

// Listen for system theme changes
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (routerStore.currentRoute.value !== 'app') {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
  }
});

// Use refs directly from routerStore for proper reactivity
const currentRoute = routerStore.currentRoute;
const transitionName = routerStore.transitionName;
const AppComponent = shallowRef<Component | null>(null);

onMounted(async () => {
  await initialize();
});

async function initialize() {
  routerStore.replace('loading');

  // Check if user has ever logged in FIRST (before any Keychain access)
  const hasLoggedInBefore = localStorage.getItem(HAS_LOGGED_IN_KEY) === 'true';

  if (!hasLoggedInBefore) {
    // First time user - go straight to login without touching Keychain
    routerStore.replace('login');
    return;
  }

  // Only initialize config (which accesses Keychain) for returning users
  await initializeConfig();

  // Returning user - initialize auth (will access Keychain)
  try {
    await authStore.initialize();
  } catch (error) {
    console.error('Auth initialization failed:', error);
    // If Keychain access was denied, show the required view
    if (isMac && isKeychainError(error)) {
      routerStore.replace('keychain-required' as RouteType);
      return;
    }
    // Other errors - go to login
    routerStore.replace('login');
    return;
  }

  // Check 1: Is user logged in?
  if (!authStore.state.isAuthenticated) {
    routerStore.replace('login');
    return;
  }

  // Check 2: Does user need subscription?
  if (authStore.needsSubscription.value) {
    routerStore.replace('subscription');
    return;
  }

  // Check 3: Can we skip token view? (has config + token)
  if (await canSkipTokenView()) {
    await loadApp();
    return;
  }

  // Need to show token view
  routerStore.replace('token');
}

function isKeychainError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('keychain') ||
           msg.includes('denied') ||
           msg.includes('canceled') ||
           msg.includes('encryption');
  }
  return false;
}

async function canSkipTokenView(): Promise<boolean> {
  // Must be configured (has provider settings)
  if (!checkIsConfigured()) {
    return false;
  }

  // Must have a token
  try {
    const token = await getApiKey();
    return !!token;
  } catch {
    return false;
  }
}

async function handleAuthenticated() {
  // Mark that user has logged in (for future app starts)
  localStorage.setItem(HAS_LOGGED_IN_KEY, 'true');

  // Refresh subscription status after login
  await authStore.refreshSubscription();

  // Check subscription
  if (authStore.needsSubscription.value) {
    routerStore.navigate('subscription');
    return;
  }

  // Check if can skip token view
  if (await canSkipTokenView()) {
    await loadApp();
    return;
  }

  routerStore.navigate('token');
}

function handleKeychainDenied() {
  routerStore.replace('keychain-required' as RouteType);
}

async function handleSubscribed() {
  await authStore.refreshSubscription();

  // Check if can skip token view
  if (await canSkipTokenView()) {
    await loadApp();
    return;
  }

  routerStore.navigate('token');
}

function handleLogout() {
  routerStore.navigate('login');
}

async function handleConfigured() {
  await loadApp();
}

async function loadApp() {
  try {
    // Dynamically import App.vue to defer loading all its dependencies
    const module = await import('./App.vue');
    AppComponent.value = module.default;
    routerStore.navigate('app');
  } catch (error) {
    console.error('Error loading app:', error);
    // On error, go back to token view
    routerStore.replace('token');
  }
}
</script>

<style>
.app-wrapper {
  height: 100vh;
  overflow: hidden;
}

.route-container {
  height: 100%;
  width: 100%;
}

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

/* Fade transition (for loading state) */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Slide Left transition (forward navigation) */
.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s ease;
}

.slide-left-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.slide-left-leave-to {
  transform: translateX(-30%);
  opacity: 0;
}

/* Slide Right transition (backward navigation) */
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s ease;
}

.slide-right-enter-from {
  transform: translateX(-30%);
  opacity: 0;
}

.slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
