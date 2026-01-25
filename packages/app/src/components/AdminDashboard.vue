<template>
  <Teleport to="body">
    <div class="admin-overlay" @click.self="$emit('close')">
      <div class="admin-modal">
        <TitleBar>
          <template #left>
            <h1 class="admin-title">Admin Dashboard</h1>
          </template>
          <template #right>
            <button class="titlebar-btn" @click="$emit('close')" title="Close">
              <X :size="16" :stroke-width="2" />
            </button>
          </template>
        </TitleBar>

        <div class="admin-body">
          <aside class="admin-sidebar">
            <nav class="admin-nav">
              <button
                v-for="tab in tabs"
                :key="tab.id"
                :class="['admin-tab', { active: activeTab === tab.id }]"
                @click="activeTab = tab.id"
                :title="tab.label"
              >
                <component :is="tab.icon" :size="18" :stroke-width="2" />
                <span class="tab-label">{{ tab.label }}</span>
              </button>
            </nav>
          </aside>

          <main class="admin-content">
            <UsersPanel v-if="activeTab === 'users'" />
            <SessionsPanel v-else-if="activeTab === 'sessions'" />
            <SubscriptionsPanel v-else-if="activeTab === 'subscriptions'" />
            <WebhooksPanel v-else-if="activeTab === 'webhooks'" />
            <AuditLogsPanel v-else-if="activeTab === 'audit-logs'" />
            <ConfigPanel v-else-if="activeTab === 'config'" />
            <HealthPanel v-else-if="activeTab === 'health'" />
          </main>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  Users,
  Key,
  CreditCard,
  Webhook,
  FileText,
  Settings,
  Activity,
  X,
} from 'lucide-vue-next';
import TitleBar from './TitleBar.vue';
import UsersPanel from './admin/UsersPanel.vue';
import SessionsPanel from './admin/SessionsPanel.vue';
import SubscriptionsPanel from './admin/SubscriptionsPanel.vue';
import WebhooksPanel from './admin/WebhooksPanel.vue';
import AuditLogsPanel from './admin/AuditLogsPanel.vue';
import ConfigPanel from './admin/ConfigPanel.vue';
import HealthPanel from './admin/HealthPanel.vue';

defineEmits<{
  close: [];
}>();

const activeTab = ref('users');

const tabs = [
  { id: 'users', label: 'Users', icon: Users },
  { id: 'sessions', label: 'Sessions', icon: Key },
  { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook },
  { id: 'audit-logs', label: 'Audit Logs', icon: FileText },
  { id: 'config', label: 'Config', icon: Settings },
  { id: 'health', label: 'Health', icon: Activity },
];
</script>

<style scoped>
.admin-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: var(--spacing-lg);
}

.admin-modal {
  width: 100%;
  max-width: 90vw;
  height: 90vh;
  max-height: 90vh;
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.admin-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.admin-sidebar {
  width: 220px;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
  padding: var(--spacing-md);
}

.admin-nav {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.admin-tab {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 500;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.admin-tab:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.admin-tab.active {
  background: var(--color-accent);
  color: white;
  border-color: var(--color-accent);
}

.tab-label {
  flex: 1;
  text-align: left;
}

.admin-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--spacing-lg);
}

.admin-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}
</style>
