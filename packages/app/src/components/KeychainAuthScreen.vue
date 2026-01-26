<template>
  <div class="keychain-auth-screen">
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

      <button class="authorize-btn" @click="handleAuthorize" :disabled="isLoading">
        <template v-if="isLoading">
          <div class="btn-spinner"></div>
          Accessing Keychain...
        </template>
        <template v-else>
          Continue
        </template>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { KeyRound, Info } from 'lucide-vue-next';

const emit = defineEmits<{
  (e: 'authorized'): void;
}>();

const isLoading = ref(false);

function handleAuthorize() {
  isLoading.value = true;
  // Small delay to show loading state before Keychain prompt appears
  setTimeout(() => {
    emit('authorized');
  }, 100);
}
</script>

<style scoped>
.keychain-auth-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background-color: var(--color-bg-primary, #ffffff);
}

:root[data-theme="dark"] .keychain-auth-screen {
  background-color: var(--color-bg-primary, #1a1a1a);
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
  background: var(--color-accent-subtle, rgba(99, 102, 241, 0.1));
  color: var(--color-accent, #6366f1);
  margin-bottom: 24px;
}

h1 {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: var(--color-text-primary, #1a1a1a);
}

:root[data-theme="dark"] h1 {
  color: var(--color-text-primary, #ffffff);
}

.keychain-description {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-secondary, #6b7280);
  margin: 0 0 20px 0;
}

.keychain-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 16px;
  background: var(--color-surface-secondary, #f3f4f6);
  border-radius: 8px;
  font-size: 12px;
  color: var(--color-text-tertiary, #9ca3af);
  text-align: left;
  margin-bottom: 24px;
}

:root[data-theme="dark"] .keychain-note {
  background: var(--color-surface-secondary, #2a2a2a);
}

.keychain-note svg {
  flex-shrink: 0;
  margin-top: 1px;
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
  color: #ffffff;
  background-color: #6366f1;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.authorize-btn:hover:not(:disabled) {
  background-color: #4f46e5;
}

.authorize-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
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
</style>
