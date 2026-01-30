<template>
  <div class="app-wrapper">
    <Transition :name="transitionName" mode="out-in">
      <div v-if="currentRoute === 'loading'" key="loading" class="loading-container">
        <div class="loading-spinner"></div>
        <p>Loading...</p>
      </div>

      <div v-else-if="currentRoute === 'login'" key="login" class="route-container">
        <AuthView
          @authenticated="handleAuthenticated"
          @keychain-denied="handleKeychainDenied"
        />
      </div>

      <div v-else-if="currentRoute === 'keychain-required'" key="keychain-required" class="route-container">
        <KeychainRequiredView />
      </div>

      <div v-else-if="currentRoute === 'subscription'" key="subscription" class="route-container">
        <SubscriptionScreen
          @subscribed="handleSubscribed"
          @logout="handleLogout"
        />
      </div>

      <div v-else-if="currentRoute === 'token'" key="token" class="route-container">
        <TokenView @configured="handleConfigured" />
      </div>

      <div v-else-if="currentRoute === 'app'" key="app" class="route-container">
        <component :is="AppComponent" />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { shallowRef, onMounted, type Component } from 'vue';
import AuthView from './components/AuthView.vue';
import KeychainRequiredView from './views/KeychainRequiredView.vue';
import SubscriptionScreen from './components/SubscriptionScreen.vue';
import TokenView from './views/TokenView.vue';
import { authStore } from './stores/authStore';
import { routerStore, type RouteType } from './stores/routerStore';
import { initializeConfig, isConfigured as checkIsConfigured, getApiKey, loadApiKey } from './stores/configStore';
import { uiLogger } from './utils/logger';

const HAS_LOGGED_IN_KEY = 'pr-manager-has-logged-in';
const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');

function applySystemTheme() {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
}
applySystemTheme();

window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (routerStore.currentRoute.value !== 'app') {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
  }
});

const currentRoute = routerStore.currentRoute;
const transitionName = routerStore.transitionName;
const AppComponent = shallowRef<Component | null>(null);

onMounted(async () => {
  await initialize();
});

async function initialize() {
  routerStore.replace('loading');

  const hasLoggedInBefore = localStorage.getItem(HAS_LOGGED_IN_KEY) === 'true';
  uiLogger.debug('hasLoggedInBefore', { value: hasLoggedInBefore });

  if (!hasLoggedInBefore) {
    uiLogger.debug('First time user, showing login');
    routerStore.replace('login');
    return;
  }

  uiLogger.debug('Returning user, initializing config');
  await initializeConfig();

  try {
    uiLogger.debug('Initializing auth store');
    await authStore.initialize();
    uiLogger.debug('Auth initialized', { isAuthenticated: authStore.state.isAuthenticated });
  } catch (error) {
    uiLogger.error('Auth initialization failed', { error: (error as Error).message });
    if (isMac && isKeychainError(error)) {
      routerStore.replace('keychain-required' as RouteType);
      return;
    }
    routerStore.replace('login');
    return;
  }

  if (!authStore.state.isAuthenticated) {
    uiLogger.debug('User not authenticated after init, showing login');
    routerStore.replace('login');
    return;
  }

  if (authStore.needsSubscription.value) {
    routerStore.replace('subscription');
    return;
  }

  if (await canSkipTokenView()) {
    await loadApp();
    return;
  }

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
  if (!checkIsConfigured()) {
    return false;
  }

  try {
    const token = await getApiKey();
    return !!token;
  } catch {
    return false;
  }
}

async function handleAuthenticated() {
  localStorage.setItem(HAS_LOGGED_IN_KEY, 'true');
  await authStore.refreshSubscription();

  if (authStore.needsSubscription.value) {
    routerStore.navigate('subscription');
    return;
  }

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
  await loadApiKey();
  await loadApp();
}

async function loadApp() {
  try {
    const module = await import('./App.vue');
    AppComponent.value = module.default;
    routerStore.navigate('app');
  } catch (error) {
    uiLogger.error('Error loading app', { error: (error as Error).message });
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

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
