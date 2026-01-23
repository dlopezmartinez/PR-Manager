<template>
  <div class="panel">
    <header class="panel-header">
      <h2>Audit Logs</h2>
      <p class="panel-description">View system activity and admin actions</p>
    </header>

    <div class="filters">
      <select v-model="filterAction" class="filter-select" @change="loadLogs">
        <option value="">All Actions</option>
        <option value="USER_CREATED">User Created</option>
        <option value="USER_UPDATED">User Updated</option>
        <option value="USER_SUSPENDED">User Suspended</option>
        <option value="USER_ROLE_CHANGED">Role Changed</option>
        <option value="SESSION_REVOKED">Session Revoked</option>
      </select>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
    </div>

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
      <button @click="loadLogs" class="retry-btn">Retry</button>
    </div>

    <div v-else class="table-wrapper">
      <table class="audit-table">
        <thead>
          <tr>
            <th>Action</th>
            <th>Admin</th>
            <th>Target User</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in logs" :key="log.id">
            <td>
              <code class="action-code">{{ log.action }}</code>
            </td>
            <td class="user-email">{{ log.performedBy }}</td>
            <td class="user-email">{{ log.targetUser?.email || '—' }}</td>
            <td class="date-cell">{{ formatDate(log.createdAt) }}</td>
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
import type { AuditLog, PaginationInfo } from '../../types/admin.js';

const page = ref(1);
const filterAction = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const logs = ref<AuditLog[]>([]);
const pagination = ref<PaginationInfo | null>(null);

async function loadLogs() {
  loading.value = true;
  error.value = null;
  try {
    const response = await adminService.getAuditLogs({
      page: page.value,
      limit: 25,
      action: filterAction.value || undefined,
    });
    logs.value = response.logs || [];
    pagination.value = response.pagination;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load audit logs';
  } finally {
    loading.value = false;
  }
}

function formatDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function previousPage() {
  if (page.value > 1) {
    page.value--;
    loadLogs();
  }
}

function nextPage() {
  if (pagination.value && page.value < pagination.value.pages) {
    page.value++;
    loadLogs();
  }
}

onMounted(() => {
  loadLogs();
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

.audit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.audit-table thead {
  position: sticky;
  top: 0;
  background: var(--color-bg-primary);
  border-bottom: 1px solid var(--color-border);
}

.audit-table th {
  padding: var(--spacing-sm) var(--spacing-md);
  text-align: left;
  font-weight: 600;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-transform: uppercase;
}

.audit-table td {
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
}

.audit-table tbody tr:hover {
  background: var(--color-surface-hover);
}

.action-code {
  background: var(--color-bg-secondary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-family: monospace;
  color: var(--color-accent);
}

.user-email {
  font-family: monospace;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.date-cell {
  color: var(--color-text-secondary);
  font-size: 12px;
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
