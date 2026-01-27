<template>
  <Teleport to="body">
    <div v-if="visible" class="sync-required-overlay">
      <div class="sync-required-modal">
        <div class="modal-icon">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <h2 class="modal-title">
          {{ isSessionReplaced ? 'Sesión Cerrada' : 'Sincronización Requerida' }}
        </h2>

        <p class="modal-message">
          <template v-if="isSessionReplaced">
            Tu sesión fue cerrada porque iniciaste sesión desde otro dispositivo.
            Solo se permite una sesión activa por cuenta.
          </template>
          <template v-else>
            Se requiere sincronizar con los servicios de PR Manager para
            continuar usando la aplicación. Esto ocurre después de 12 horas de uso.
          </template>
        </p>

        <p class="modal-hint">
          Por favor, cierra sesión y vuelve a iniciar para continuar.
        </p>

        <button
          @click="handleLogout"
          class="logout-button"
          :disabled="isLoggingOut"
        >
          <template v-if="isLoggingOut">
            <span class="spinner"></span>
            Cerrando sesión...
          </template>
          <template v-else>
            Cerrar Sesión
          </template>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { sessionManager } from '../services/sessionManager';
import { authStore } from '../stores/authStore';

const isLoggingOut = ref(false);

const visible = computed(() => sessionManager.syncRequired.value);
const isSessionReplaced = computed(() => sessionManager.syncRequiredReason.value === 'session_replaced');

async function handleLogout() {
  isLoggingOut.value = true;
  try {
    await authStore.logout();
  } catch (error) {
    console.error('[SyncRequiredModal] Logout failed:', error);
  } finally {
    isLoggingOut.value = false;
  }
}
</script>

<style scoped>
.sync-required-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
  -webkit-app-region: no-drag;
}

.sync-required-modal {
  background: var(--color-bg-primary, #1a1a2e);
  border: 1px solid var(--color-border, #2a2a4a);
  border-radius: 16px;
  padding: 40px;
  max-width: 420px;
  width: 90%;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.modal-icon {
  color: var(--color-warning, #f59e0b);
  margin-bottom: 20px;
}

.modal-icon svg {
  width: 64px;
  height: 64px;
}

.modal-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary, #ffffff);
  margin: 0 0 16px 0;
}

.modal-message {
  font-size: 0.95rem;
  color: var(--color-text-secondary, #a0a0b0);
  line-height: 1.6;
  margin: 0 0 12px 0;
}

.modal-hint {
  font-size: 0.875rem;
  color: var(--color-text-tertiary, #6b6b7b);
  margin: 0 0 28px 0;
}

.logout-button {
  width: 100%;
  padding: 14px 24px;
  background: var(--color-danger, #ef4444);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.logout-button:hover:not(:disabled) {
  background: var(--color-danger-hover, #dc2626);
  transform: translateY(-1px);
}

.logout-button:active:not(:disabled) {
  transform: translateY(0);
}

.logout-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
