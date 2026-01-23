<template>
  <div class="panel">
    <header class="panel-header">
      <h2>User Management</h2>
      <p class="panel-description">Manage user accounts, roles, and access</p>
    </header>

    <!-- Filters -->
    <div class="filters">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search by email or name..."
        class="search-input"
        @input="handleSearch"
      />
      <select v-model="filterRole" class="filter-select" @change="loadUsers">
        <option value="">All Roles</option>
        <option value="USER">User</option>
        <option value="ADMIN">Admin</option>
        <option value="SUPERUSER">Superuser</option>
      </select>
      <select v-model="filterStatus" class="filter-select" @change="loadUsers">
        <option value="">All Statuses</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="suspended">Suspended</option>
      </select>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading users...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
      <button @click="loadUsers" class="retry-btn">Retry</button>
    </div>

    <div v-else class="table-wrapper">
      <table class="users-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Role</th>
            <th>Status</th>
            <th>Last Login</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in filteredUsers" :key="user.id">
            <td class="email-cell">{{ user.email }}</td>
            <td>{{ user.name || '—' }}</td>
            <td>
              <span :class="['badge', `role-${user.role.toLowerCase()}`]">
                {{ user.role }}
              </span>
            </td>
            <td>
              <span :class="['badge', getStatusClass(user)]">
                {{ getStatusLabel(user) }}
              </span>
            </td>
            <td class="date-cell">{{ formatDate(user.lastLoginAt) }}</td>
            <td class="date-cell">{{ formatDate(user.createdAt) }}</td>
            <td class="actions-cell">
              <button
                @click="openChangeRoleDialog(user)"
                class="action-btn"
                title="Change role"
              >
                Change Role
              </button>
              <button
                v-if="!user.isSuspended"
                @click="openSuspendDialog(user)"
                class="action-btn warning"
                title="Suspend user"
              >
                Suspend
              </button>
              <button
                v-else
                @click="unsuspendUser(user.id)"
                class="action-btn success"
                title="Unsuspend user"
              >
                Unsuspend
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
import { ref, computed, onMounted } from 'vue';
import { adminService } from '../../services/adminService.js';
import { adminStore } from '../../stores/adminStore.js';
import type { AdminUser, PaginationInfo } from '../../types/admin.js';

const searchQuery = ref('');
const filterRole = ref('');
const filterStatus = ref('');
const page = ref(1);
const loading = ref(false);
const error = ref<string | null>(null);
const users = ref<AdminUser[]>([]);
const pagination = ref<PaginationInfo | null>(null);

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

const filteredUsers = computed(() => {
  let filtered = [...users.value];

  if (filterStatus.value === 'active') {
    filtered = filtered.filter((u) => u.isActive && !u.isSuspended);
  } else if (filterStatus.value === 'inactive') {
    filtered = filtered.filter((u) => !u.isActive);
  } else if (filterStatus.value === 'suspended') {
    filtered = filtered.filter((u) => u.isSuspended);
  }

  return filtered;
});

function handleSearch() {
  if (searchTimeout) clearTimeout(searchTimeout);
  page.value = 1;
  searchTimeout = setTimeout(() => {
    loadUsers();
  }, 300);
}

async function loadUsers() {
  loading.value = true;
  error.value = null;
  try {
    const response = await adminService.getUsers({
      page: page.value,
      limit: 25,
      role: filterRole.value || undefined,
      search: searchQuery.value || undefined,
    });
    users.value = response.users || [];
    pagination.value = response.pagination;
    adminStore.setUsers(users.value, pagination.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load users';
    console.error('Error loading users:', err);
  } finally {
    loading.value = false;
  }
}

function getStatusClass(user: AdminUser): string {
  if (user.isSuspended) return 'suspended';
  if (!user.isActive) return 'inactive';
  return 'active';
}

function getStatusLabel(user: AdminUser): string {
  if (user.isSuspended) return 'Suspended';
  if (!user.isActive) return 'Inactive';
  return 'Active';
}

function formatDate(date: string | null): string {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

function openChangeRoleDialog(user: AdminUser) {
  const newRole = prompt(
    `Change role for ${user.email}\nCurrent: ${user.role}\nNew role (USER/ADMIN/SUPERUSER):`,
    user.role
  );
  if (newRole && ['USER', 'ADMIN', 'SUPERUSER'].includes(newRole.toUpperCase())) {
    changeUserRole(user.id, newRole.toUpperCase());
  } else if (newRole) {
    alert('Invalid role. Must be USER, ADMIN, or SUPERUSER.');
  }
}

async function changeUserRole(userId: string, role: string) {
  loading.value = true;
  try {
    await adminService.changeUserRole(userId, role as any);
    await loadUsers();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to change role';
  } finally {
    loading.value = false;
  }
}

function openSuspendDialog(user: AdminUser) {
  const reason = prompt(
    `Suspend ${user.email}\n\nEnter suspension reason:`,
    'Account suspended by admin'
  );
  if (reason) {
    suspendUser(user.id, reason);
  }
}

async function suspendUser(userId: string, reason: string) {
  loading.value = true;
  try {
    await adminService.suspendUser(userId, reason);
    await loadUsers();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to suspend user';
  } finally {
    loading.value = false;
  }
}

async function unsuspendUser(userId: string) {
  if (!confirm('Unsuspend this user?')) return;
  loading.value = true;
  try {
    await adminService.unsuspendUser(userId);
    await loadUsers();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to unsuspend user';
  } finally {
    loading.value = false;
  }
}

function previousPage() {
  if (page.value > 1) {
    page.value--;
    loadUsers();
  }
}

function nextPage() {
  if (pagination.value && page.value < pagination.value.pages) {
    page.value++;
    loadUsers();
  }
}

onMounted(() => {
  loadUsers();
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
  flex-wrap: wrap;
}

.search-input,
.filter-select {
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: 13px;
  transition: all var(--transition-fast);
}

.search-input {
  flex: 1;
  min-width: 200px;
}

.search-input:focus,
.filter-select:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.1);
}

.filter-select {
  min-width: 120px;
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

.users-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.users-table thead {
  position: sticky;
  top: 0;
  background: var(--color-bg-primary);
  border-bottom: 1px solid var(--color-border);
}

.users-table th {
  padding: var(--spacing-sm) var(--spacing-md);
  text-align: left;
  font-weight: 600;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.users-table td {
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-primary);
}

.users-table tbody tr:hover {
  background: var(--color-surface-hover);
}

.email-cell {
  font-family: monospace;
  font-size: 12px;
  color: var(--color-accent);
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
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.role-user {
  background: var(--color-info-bg);
  color: var(--color-info);
}

.role-admin {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.role-superuser {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.active {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.inactive {
  background: var(--color-border);
  color: var(--color-text-secondary);
}

.suspended {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.actions-cell {
  display: flex;
  gap: var(--spacing-xs);
}

.action-btn {
  padding: 4px 8px;
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.action-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.action-btn.warning {
  background: var(--color-warning);
}

.action-btn.success {
  background: var(--color-success);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.paginate-btn {
  padding: 6px 12px;
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all var(--transition-fast);
}

.paginate-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
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
