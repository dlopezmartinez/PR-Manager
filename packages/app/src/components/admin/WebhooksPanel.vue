<template>
  <div class="panel">
    <header class="panel-header">
      <h2>Webhook Management</h2>
      <p class="panel-description">Monitor webhook events and retry failed webhooks</p>
    </header>

    <div class="filters">
      <select v-model="filterProcessed" class="filter-select" @change="loadWebhooks">
        <option value="">All Events</option>
        <option value="true">Processed</option>
        <option value="false">Pending</option>
      </select>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
    </div>

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
      <button @click="loadWebhooks" class="retry-btn">Retry</button>
    </div>

    <div v-else class="table-wrapper">
      <table class="webhooks-table">
        <thead>
          <tr>
            <th>Event Name</th>
            <th>Event ID</th>
            <th>Status</th>
            <th>Error Count</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="webhook in webhooks" :key="webhook.id">
            <td class="event-name">{{ webhook.eventName }}</td>
            <td class="event-id">{{ webhook.eventId.substring(0, 8) }}...</td>
            <td>
              <span :class="['badge', webhook.processed ? 'processed' : 'pending']">
                {{ webhook.processed ? 'Processed' : 'Pending' }}
              </span>
            </td>
            <td>{{ webhook.errorCount }}</td>
            <td class="date-cell">{{ formatDate(webhook.createdAt) }}</td>
            <td>
              <button
                v-if="!webhook.processed"
                @click="retryWebhook(webhook.id)"
                class="action-btn"
              >
                Retry
              </button>
              <button @click="viewDetails(webhook)" class="action-btn secondary">
                View
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!loading && !error && pagination" class="pagination">
      <button @click="previousPage" :disabled="page === 1" class="paginate-btn">
        ← Previous
      </button>
      <span class="page-info">Page {{ page }} of {{ pagination.pages }}</span>
      <button @click="nextPage" :disabled="page === pagination.pages" class="paginate-btn">
        Next →
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { adminService } from '../../services/adminService.js';
import type { AdminWebhook, PaginationInfo } from '../../types/admin.js';

const page = ref(1);
const filterProcessed = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const webhooks = ref<AdminWebhook[]>([]);
const pagination = ref<PaginationInfo | null>(null);

async function loadWebhooks() {
  loading.value = true;
  error.value = null;
  try {
    const response = await adminService.getWebhooks({
      page: page.value,
      limit: 25,
      processed: filterProcessed.value ? filterProcessed.value === 'true' : undefined,
    });
    webhooks.value = response.webhooks || [];
    pagination.value = response.pagination;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load webhooks';
  } finally {
    loading.value = false;
  }
}

function formatDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString();
  } catch {
    return '—';
  }
}

async function retryWebhook(webhookId: string) {
  if (!confirm('Retry this webhook?')) return;
  try {
    await adminService.retryWebhook(webhookId);
    alert('Webhook queued for retry');
    await loadWebhooks();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to retry webhook';
  }
}

function viewDetails(webhook: AdminWebhook) {
  alert(`Event: ${webhook.eventName}\nID: ${webhook.eventId}\nStatus: ${webhook.processed ? 'Processed' : 'Pending'}`);
}

function previousPage() {
  if (page.value > 1) {
    page.value--;
    loadWebhooks();
  }
}

function nextPage() {
  if (pagination.value && page.value < pagination.value.pages) {
    page.value++;
    loadWebhooks();
  }
}

onMounted(() => {
  loadWebhooks();
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

.filters {
  display: flex;
  gap: var(--spacing-md);
}

.filter-select {
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: 13px;
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

.table-wrapper {
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.webhooks-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.webhooks-table thead {
  position: sticky;
  top: 0;
  background: var(--color-bg-primary);
  border-bottom: 1px solid var(--color-border);
}

.webhooks-table th {
  padding: var(--spacing-sm) var(--spacing-md);
  text-align: left;
  font-weight: 600;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-transform: uppercase;
}

.webhooks-table td {
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
}

.webhooks-table tbody tr:hover {
  background: var(--color-surface-hover);
}

.event-name {
  font-weight: 500;
  color: var(--color-text-primary);
}

.event-id {
  font-family: monospace;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.date-cell {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 600;
}

.badge.processed {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.badge.pending {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.action-btn {
  padding: 4px 8px;
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 11px;
  margin-right: 4px;
}

.action-btn.secondary {
  background: var(--color-info);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border-top: 1px solid var(--color-border);
}

.paginate-btn {
  padding: 6px 12px;
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 13px;
}

.paginate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  color: var(--color-text-secondary);
  font-size: 13px;
  min-width: 120px;
  text-align: center;
}
</style>
