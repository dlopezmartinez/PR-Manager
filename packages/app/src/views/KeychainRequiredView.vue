<template>
  <div class="keychain-required-screen">
    <div class="keychain-content">
      <div class="keychain-icon error">
        <ShieldX :size="48" :stroke-width="1.5" />
      </div>

      <h1>Keychain Access Required</h1>

      <p class="keychain-description">
        PR Manager needs access to macOS Keychain to securely store your credentials.
        Without this access, the app cannot function.
      </p>

      <div class="keychain-note">
        <Info :size="16" />
        <span>
          macOS remembers your choice. To grant access, you need to restart the app
          and click "Allow" when prompted.
        </span>
      </div>

      <div class="keychain-actions">
        <button class="restart-btn" @click="quitAndRestart">
          <RotateCcw :size="16" :stroke-width="2" />
          Restart App
        </button>
      </div>

      <p class="keychain-help">
        If the prompt doesn't appear after restarting, you may need to reset Keychain
        permissions in System Settings → Privacy & Security → Privacy.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ShieldX, Info, RotateCcw } from 'lucide-vue-next';

function quitAndRestart() {
  window.electronAPI.ipc.send('relaunch-app');
}
</script>

<style scoped>
.keychain-required-screen {
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
  margin-bottom: 24px;
}

.keychain-icon.error {
  background: var(--color-error-bg);
  color: var(--color-error);
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
  background: var(--color-warning-bg);
  border: 1px solid var(--color-warning);
  border-radius: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
  text-align: left;
  margin-bottom: 24px;
}

.keychain-note svg {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--color-warning);
}

.keychain-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.restart-btn {
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

.restart-btn:hover {
  background-color: var(--color-accent-hover);
}

.keychain-help {
  margin-top: 20px;
  font-size: 11px;
  color: var(--color-text-tertiary);
  line-height: 1.5;
}
</style>
