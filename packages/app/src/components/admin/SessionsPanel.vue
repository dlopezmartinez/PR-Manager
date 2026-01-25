<template>
  <div class="panel">
    <header class="panel-header">
      <h2>Session Management</h2>
      <p class="panel-description">Monitor and revoke active sessions</p>
    </header>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading sessions...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
      <button @click="loadSessions" class="retry-btn">Retry</button>
    </div>

    <div v-else class="table-wrapper">
      <table class="sessions-table">
        <thead>
          <tr>
            <th>User Email</th>
            <th>Created</th>
            <th>Expires At</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="session in sessions" :key="session.id">
            <td>{{ session.user?.email || '—' }}</td>
            <td class="date-cell">{{ formatDate(session.createdAt) }}</td>
            <td class="date-cell">{{ formatDate(session.expiresAt) }}</td>
            <td>
              <span :class="['badge', isExpired(session) ? 'expired' : 'active']">
                {{ isExpired(session) ? 'Expired' : 'Active' }}
              </span>
            </td>
            <td>
              <button @click="revokeSession(session.id)" class="action-btn">Revoke</button>
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
import type { AdminSession, PaginationInfo } from '../../types/admin.js';

const page = ref(1);
const loading = ref(false);
const error = ref<string | null>(null);
const sessions = ref<AdminSession[]>([]);
const pagination = ref<PaginationInfo | null>(null);

async function loadSessions() {
  loading.value = true;
  error.value = null;
  try {
    const response = await adminService.getSessions({
      page: page.value,
      limit: 25,
    });
    sessions.value = response.sessions || [];
    pagination.value = response.pagination;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load sessions';
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

function isExpired(session: AdminSession): boolean {
  return new Date(session.expiresAt) < new Date();
}

async function revokeSession(sessionId: string) {
  if (!confirm('Revoke this session?')) return;
  try {
    await adminService.revokeSession(sessionId);
    await loadSessions();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to revoke session';
  }
}

function previousPage() {
  if (page.value > 1) {
    page.value--;
    loadSessions();
  }
}

function nextPage() {
  if (pagination.value && page.value < pagination.value.pages) {
    page.value++;
    loadSessions();
  }
}

onMounted(() => {
  loadSessions();
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
  font-size: 13px;
}

.table-wrapper {
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
}

.sessions-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.sessions-table thead {
  position: sticky;
  top: 0;
  background: var(--color-bg-primary);
  border-bottom: 1px solid var(--color-border);
}

.sessions-table th {
  padding: var(--spacing-sm) var(--spacing-md);
  text-align: left;
  font-weight: 600;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-transform: uppercase;
}

.sessions-table td {
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
}

.sessions-table tbody tr:hover {
  background: var(--color-surface-hover);
}

.date-cell {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-family: monospace;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 600;
}

.badge.active {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.badge.expired {
  background: var(--color-border);
  color: var(--color-text-secondary);
}

.action-btn {
  padding: 4px 8px;
  background: var(--color-error);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
}

.action-btn:hover {
  opacity: 0.9;
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
