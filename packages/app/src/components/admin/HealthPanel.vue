<template>
  <div class="panel">
    <header class="panel-header">
      <h2>System Health</h2>
      <p class="panel-description">Monitor system status and metrics</p>
    </header>

    <button @click="refreshHealth" class="refresh-btn" :disabled="loading">
      {{ loading ? 'Refreshing...' : 'Refresh Now' }}
    </button>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
    </div>

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
      <button @click="loadHealth" class="retry-btn">Retry</button>
    </div>

    <div v-else-if="health" class="health-grid">
      <div class="health-card">
        <h3>Status</h3>
        <p :class="['status-badge', health.status]">{{ health.status.toUpperCase() }}</p>
        <p class="timestamp">{{ health.timestamp }}</p>
      </div>

      <div class="health-card">
        <h3>Database</h3>
        <p :class="['status', health.database.connected ? 'connected' : 'disconnected']">
          {{ health.database.connected ? '✓ Connected' : '✗ Disconnected' }}
        </p>
        <p class="metric">Response: {{ health.database.checkTime }}</p>
      </div>

      <div class="health-card">
        <h3>Users</h3>
        <div class="metrics">
          <div class="metric-row">
            <span>Total:</span>
            <span class="value">{{ health.users.total }}</span>
          </div>
          <div class="metric-row">
            <span>Active:</span>
            <span class="value">{{ health.users.active }}</span>
          </div>
          <div class="metric-row">
            <span>Suspended:</span>
            <span class="value">{{ health.users.suspended }}</span>
          </div>
          <div class="metric-row">
            <span>Admin:</span>
            <span class="value">{{ health.users.admin }}</span>
          </div>
        </div>
      </div>

      <div class="health-card">
        <h3>Sessions</h3>
        <p class="metric">Active: {{ health.sessions.active }}</p>
      </div>

      <div class="health-card">
        <h3>Subscriptions</h3>
        <div class="metrics">
          <div class="metric-row">
            <span>Active:</span>
            <span class="value">{{ health.subscriptions.active }}</span>
          </div>
          <div class="metric-row">
            <span>Trial:</span>
            <span class="value">{{ health.subscriptions.trial }}</span>
          </div>
          <div class="metric-row">
            <span>Total:</span>
            <span class="value">{{ health.subscriptions.total }}</span>
          </div>
        </div>
      </div>

      <div class="health-card">
        <h3>Webhooks</h3>
        <div class="metrics">
          <div class="metric-row">
            <span>Processed:</span>
            <span class="value">{{ health.webhooks.processed }}</span>
          </div>
          <div class="metric-row">
            <span>Pending:</span>
            <span class="value">{{ health.webhooks.pending }}</span>
          </div>
          <div class="metric-row">
            <span>Failed:</span>
            <span class="value failed">{{ health.webhooks.failed }}</span>
          </div>
        </div>
      </div>

      <div class="health-card">
        <h3>System</h3>
        <div class="metrics">
          <div class="metric-row">
            <span>Uptime:</span>
            <span class="value">{{ formatUptime(health.uptime) }}</span>
          </div>
          <div class="metric-row">
            <span>Environment:</span>
            <span class="value">{{ health.environment }}</span>
          </div>
          <div class="metric-row">
            <span>Response Time:</span>
            <span class="value">{{ health.responseTime }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { adminService } from '../../services/adminService.js';
import type { SystemHealth } from '../../types/admin.js';

const loading = ref(false);
const error = ref<string | null>(null);
const health = ref<SystemHealth | null>(null);

async function loadHealth() {
  loading.value = true;
  error.value = null;
  try {
    health.value = await adminService.getHealth();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load health status';
  } finally {
    loading.value = false;
  }
}

function refreshHealth() {
  loadHealth();
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${mins}m`;
}

onMounted(() => {
  loadHealth();
});
</script>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  height: 100%;
}

.panel-header {
  flex-shrink: 0;
}

.panel-header h2 {
  margin: 0 0 var(--spacing-xs) 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.panel-description {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.refresh-btn {
  width: 120px;
  padding: 6px 12px;
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.refresh-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.loading-state,
.error-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
  min-height: 200px;
  flex-direction: column;
  color: var(--color-text-secondary);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-state {
  background: var(--color-error-bg);
  color: var(--color-error);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
}

.retry-btn {
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--color-error);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
}

.health-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: var(--spacing-md);
  padding-right: var(--spacing-sm);
}

.health-card {
  padding: var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
}

.health-card h3 {
  margin: 0 0 var(--spacing-sm) 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.status-badge {
  font-size: 18px;
  font-weight: 700;
  margin: var(--spacing-sm) 0;
}

.status-badge.healthy {
  color: var(--color-success);
}

.status-badge.unhealthy {
  color: var(--color-error);
}

.status {
  font-weight: 600;
  margin: var(--spacing-sm) 0;
}

.status.connected {
  color: var(--color-success);
}

.status.disconnected {
  color: var(--color-error);
}

.timestamp {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin: 0;
}

.metric {
  font-size: 13px;
  color: var(--color-text-primary);
  margin: 4px 0;
}

.metrics {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.metric-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--color-text-primary);
}

.metric-row span:first-child {
  color: var(--color-text-secondary);
}

.value {
  font-weight: 600;
  color: var(--color-accent);
}

.value.failed {
  color: var(--color-error);
}
</style>
