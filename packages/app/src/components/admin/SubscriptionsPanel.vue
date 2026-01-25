<template>
  <div class="panel">
    <header class="panel-header">
      <h2>Subscription Management</h2>
      <p class="panel-description">Monitor and manage user subscriptions</p>
    </header>

    <div class="filters">
      <select v-model="filterStatus" class="filter-select" @change="loadSubscriptions">
        <option value="">All Statuses</option>
        <option value="active">Active</option>
        <option value="on_trial">On Trial</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading subscriptions...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
      <button @click="loadSubscriptions" class="retry-btn">Retry</button>
    </div>

    <div v-else class="table-wrapper">
      <table class="subs-table">
        <thead>
          <tr>
            <th>User Email</th>
            <th>Status</th>
            <th>Period Start</th>
            <th>Period End</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="sub in subscriptions" :key="sub.id">
            <td>{{ sub.user?.email || '—' }}</td>
            <td>
              <span :class="['badge', `status-${sub.status}`]">
                {{ sub.status }}
              </span>
            </td>
            <td class="date-cell">{{ formatDate(sub.currentPeriodStart) }}</td>
            <td class="date-cell">{{ formatDate(sub.currentPeriodEnd) }}</td>
            <td>
              <button
                @click="openStatusDialog(sub)"
                class="action-btn"
                title="Change status"
              >
                Edit
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
import type { AdminSubscription, PaginationInfo } from '../../types/admin.js';

const page = ref(1);
const filterStatus = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const subscriptions = ref<AdminSubscription[]>([]);
const pagination = ref<PaginationInfo | null>(null);

async function loadSubscriptions() {
  loading.value = true;
  error.value = null;
  try {
    const response = await adminService.getSubscriptions({
      page: page.value,
      limit: 25,
      status: filterStatus.value || undefined,
    });
    subscriptions.value = response.subscriptions || [];
    pagination.value = response.pagination;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load subscriptions';
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

function openStatusDialog(sub: AdminSubscription) {
  const statuses = ['on_trial', 'active', 'paused', 'past_due', 'unpaid', 'cancelled', 'expired'];
  const newStatus = prompt(
    `Change status for ${sub.user?.email}\nCurrent: ${sub.status}\nNew status:\n${statuses.join(', ')}`,
    sub.status
  );
  if (newStatus && statuses.includes(newStatus)) {
    updateStatus(sub.id, newStatus);
  } else if (newStatus) {
    alert('Invalid status');
  }
}

async function updateStatus(subId: string, status: string) {
  loading.value = true;
  try {
    await adminService.updateSubscriptionStatus(subId, status as any);
    await loadSubscriptions();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to update subscription';
  } finally {
    loading.value = false;
  }
}

function previousPage() {
  if (page.value > 1) {
    page.value--;
    loadSubscriptions();
  }
}

function nextPage() {
  if (pagination.value && page.value < pagination.value.pages) {
    page.value++;
    loadSubscriptions();
  }
}

onMounted(() => {
  loadSubscriptions();
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

.subs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.subs-table thead {
  position: sticky;
  top: 0;
  background: var(--color-bg-primary);
  border-bottom: 1px solid var(--color-border);
}

.subs-table th {
  padding: var(--spacing-sm) var(--spacing-md);
  text-align: left;
  font-weight: 600;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-transform: uppercase;
}

.subs-table td {
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
}

.subs-table tbody tr:hover {
  background: var(--color-surface-hover);
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

.status-active {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.status-on_trial {
  background: var(--color-info-bg);
  color: var(--color-info);
}

.status-cancelled {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.action-btn {
  padding: 4px 8px;
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 11px;
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
