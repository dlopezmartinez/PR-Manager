<template>
  <!-- Keychain Warning Screen (macOS only, first time) -->
  <KeychainAuthScreen
    v-if="currentState === 'warning'"
    @authorized="handleContinueFromWarning"
  />

  <!-- Keychain Verification Screen (shows while verifying access) -->
  <div v-else-if="currentState === 'verifying'" class="loading-container">
    <div class="loading-spinner"></div>
    <p>Verifying Keychain access...</p>
    <p class="hint">macOS may prompt for your password</p>
  </div>

  <!-- Keychain Error Screen -->
  <div v-else-if="currentState === 'error'" class="error-container">
    <div class="error-icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </div>
    <h2>Keychain Access Required</h2>
    <p class="error-message">{{ errorMessage }}</p>

    <div v-if="wasAccessDenied" class="denied-notice">
      <p>macOS remembers your choice. To retry, you need to restart the app.</p>
    </div>

    <div class="error-actions">
      <button v-if="wasAccessDenied" class="btn-primary" @click="quitAndRestart">
        Restart App
      </button>
      <button v-else class="btn-primary" @click="retryKeychainAccess">
        Try Again
      </button>
      <button class="btn-danger" @click="useInsecureStorage">
        Use Insecure Storage
      </button>
    </div>

    <p class="insecure-warning">
      <strong>⚠️ Warning:</strong> Insecure storage saves your API token without encryption.
      Only use this if you understand the security implications.
    </p>

    <button class="btn-link" @click="resetCredentials">
      Reset credentials and start fresh
    </button>
  </div>

  <!-- Main App -->
  <component :is="AppComponent" v-else-if="currentState === 'ready'" />

  <!-- Initial Loading Screen -->
  <div v-else class="loading-container">
    <div class="loading-spinner"></div>
    <p>Loading...</p>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, onMounted, type Component } from 'vue';
import KeychainAuthScreen from './components/KeychainAuthScreen.vue';

type AppState = 'loading' | 'warning' | 'verifying' | 'error' | 'ready';

// Apply system theme immediately (before App.vue loads with full theme support)
function applySystemTheme() {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
}
applySystemTheme();

// Listen for system theme changes
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  // Only update if we're still in pre-app states (App.vue will handle it after)
  if (currentState.value !== 'ready') {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
  }
});

const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
const KEYCHAIN_ACCESS_GRANTED_KEY = 'keychain-access-granted';

const currentState = ref<AppState>('loading');
const errorMessage = ref('');
const wasAccessDenied = ref(false);
const AppComponent = shallowRef<Component | null>(null);

// Verification timeout (30 seconds)
const VERIFICATION_TIMEOUT = 30000;

onMounted(async () => {
  await initializeApp();
});

async function initializeApp() {
  currentState.value = 'loading';

  // Non-macOS: skip all Keychain logic, go directly to app
  if (!isMac) {
    await loadApp();
    return;
  }

  // macOS: Check if user has previously granted Keychain access
  const hasGrantedAccess = localStorage.getItem(KEYCHAIN_ACCESS_GRANTED_KEY) === 'true';

  if (hasGrantedAccess) {
    // User previously granted access - go directly to app
    // (macOS will prompt for password if needed, but we don't show our warning)
    await loadApp();
    return;
  }

  // First time or user never granted access - show warning
  currentState.value = 'warning';
}

async function handleContinueFromWarning() {
  currentState.value = 'verifying';
  await verifyKeychainAccess();
}

async function verifyKeychainAccess() {
  try {
    // Set up a timeout
    const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) => {
      setTimeout(() => {
        resolve({ success: false, error: 'Keychain verification timed out. Please try again.' });
      }, VERIFICATION_TIMEOUT);
    });

    // Race between verification and timeout
    const result = await Promise.race([
      window.electronAPI.keychain.verifyAccess(),
      timeoutPromise,
    ]);

    if (result.success) {
      // Mark that user has granted Keychain access (persistent)
      localStorage.setItem(KEYCHAIN_ACCESS_GRANTED_KEY, 'true');
      wasAccessDenied.value = false;

      // If user was using insecure storage, migrate to Keychain
      await migrateInsecureToKeychain();

      await loadApp();
    } else {
      errorMessage.value = result.error || 'Failed to access Keychain. Please try again.';
      // Check if this was a denial - macOS caches denials per process
      const errorLower = result.error?.toLowerCase() || '';
      wasAccessDenied.value = errorLower.includes('denied') ||
                              errorLower.includes('canceled') ||
                              errorLower.includes('not available') ||
                              errorLower.includes('encryption') ||
                              false;
      currentState.value = 'error';
    }
  } catch (error) {
    console.error('Keychain verification error:', error);
    errorMessage.value = error instanceof Error
      ? error.message
      : 'An unexpected error occurred while accessing Keychain.';
    wasAccessDenied.value = false;
    currentState.value = 'error';
  }
}

async function migrateInsecureToKeychain() {
  try {
    // Check if user was using insecure storage
    const isInsecureMode = await window.electronAPI.keychain.getStorageMode();

    if (isInsecureMode) {
      // Migrate credentials from insecure to Keychain
      const result = await window.electronAPI.keychain.migrateToSecure();

      if (!result.success) {
        console.error('Migration failed:', result.error);
        // Don't block app loading, just log the error
      } else if (result.migrated > 0) {
        console.log(`Migrated ${result.migrated} credentials to Keychain`);
      }
    }
  } catch (error) {
    console.error('Error during migration:', error);
    // Don't block app loading
  }
}

async function retryKeychainAccess() {
  currentState.value = 'verifying';
  await verifyKeychainAccess();
}

async function resetCredentials() {
  try {
    // Clear all stored credentials
    await window.electronAPI.auth.clearToken();

    // Clear the access granted flag
    localStorage.removeItem(KEYCHAIN_ACCESS_GRANTED_KEY);

    // Reload the app to start fresh
    window.location.reload();
  } catch (error) {
    console.error('Error resetting credentials:', error);
    errorMessage.value = 'Failed to reset credentials. Please restart the app.';
  }
}

function quitAndRestart() {
  // Use IPC to relaunch the app
  window.electronAPI.ipc.send('relaunch-app');
}

async function useInsecureStorage() {
  try {
    // Set insecure storage mode
    await window.electronAPI.keychain.setStorageMode(true);

    // Do NOT set the access granted flag - user chose insecure
    // This means they'll see the warning again next time (encouraging Keychain use)

    // Load the app
    await loadApp();
  } catch (error) {
    console.error('Error enabling insecure storage:', error);
    errorMessage.value = 'Failed to enable insecure storage. Please try again.';
  }
}

async function loadApp() {
  try {
    // Dynamically import App.vue - this defers loading all its dependencies (stores, etc.)
    const module = await import('./App.vue');
    AppComponent.value = module.default;
    currentState.value = 'ready';
  } catch (error) {
    console.error('Error loading app:', error);
    errorMessage.value = 'Failed to load the application. Please restart.';
    currentState.value = 'error';
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

.loading-container .hint {
  font-size: 12px;
  color: var(--color-text-tertiary, #9ca3af);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Error Screen Styles */
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  padding: 24px;
  text-align: center;
  background-color: var(--color-bg-primary, #ffffff);
}

:root[data-theme="dark"] .error-container {
  background-color: var(--color-bg-primary, #1a1a1a);
}

.error-icon {
  color: #f59e0b;
  margin-bottom: 16px;
}

.error-container h2 {
  margin: 0 0 12px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary, #1f2937);
}

:root[data-theme="dark"] .error-container h2 {
  color: #f9fafb;
}

.error-message {
  margin: 0 0 24px 0;
  font-size: 14px;
  color: var(--color-text-secondary, #6b7280);
  max-width: 400px;
  line-height: 1.5;
}

.error-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.btn-primary,
.btn-secondary {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-primary {
  background-color: #6366f1;
  color: white;
}

.btn-primary:hover {
  background-color: #4f46e5;
}

.btn-secondary {
  background-color: transparent;
  color: var(--color-text-secondary, #6b7280);
  border: 1px solid var(--color-border, #e5e7eb);
}

:root[data-theme="dark"] .btn-secondary {
  border-color: #374151;
  color: #9ca3af;
}

.btn-secondary:hover {
  background-color: var(--color-surface-hover, #f3f4f6);
}

:root[data-theme="dark"] .btn-secondary:hover {
  background-color: #374151;
}

.btn-danger {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  background-color: #dc2626;
  color: white;
}

.btn-danger:hover {
  background-color: #b91c1c;
}

.btn-link {
  background: none;
  border: none;
  color: var(--color-text-tertiary, #9ca3af);
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
  padding: 8px;
  margin-top: 8px;
}

.btn-link:hover {
  color: var(--color-text-secondary, #6b7280);
}

:root[data-theme="dark"] .btn-link:hover {
  color: #d1d5db;
}

.insecure-warning {
  margin: 0 0 16px 0;
  font-size: 12px;
  color: var(--color-text-tertiary, #9ca3af);
  max-width: 380px;
  line-height: 1.5;
  text-align: center;
}

.insecure-warning strong {
  color: #f59e0b;
}

.error-hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-tertiary, #9ca3af);
  max-width: 350px;
  line-height: 1.5;
}

.denied-notice {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  max-width: 350px;
}

.denied-notice p {
  margin: 0;
  font-size: 13px;
  color: #d97706;
  line-height: 1.4;
}

:root[data-theme="dark"] .denied-notice {
  background: rgba(245, 158, 11, 0.15);
}
</style>
