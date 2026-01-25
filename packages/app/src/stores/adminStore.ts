import { reactive, readonly } from 'vue';
import type {
  AdminUser,
  AdminSession,
  AdminSubscription,
  AdminWebhook,
  AuditLog,
  SystemConfig,
  SystemHealth,
  PaginationInfo,
} from '../types/admin.js';

interface AdminState {
  users: AdminUser[];
  sessions: AdminSession[];
  subscriptions: AdminSubscription[];
  webhooks: AdminWebhook[];
  auditLogs: AuditLog[];
  configs: SystemConfig[];
  systemHealth: SystemHealth | null;

  usersPagination: PaginationInfo | null;
  sessionsPagination: PaginationInfo | null;
  subscriptionsPagination: PaginationInfo | null;
  webhooksPagination: PaginationInfo | null;
  auditLogsPagination: PaginationInfo | null;

  loading: boolean;
  error: string | null;
  selectedUser: AdminUser | null;
  selectedSession: AdminSession | null;
  selectedSubscription: AdminSubscription | null;
  selectedWebhook: AdminWebhook | null;
}

const state = reactive<AdminState>({
  users: [],
  sessions: [],
  subscriptions: [],
  webhooks: [],
  auditLogs: [],
  configs: [],
  systemHealth: null,

  usersPagination: null,
  sessionsPagination: null,
  subscriptionsPagination: null,
  webhooksPagination: null,
  auditLogsPagination: null,

  loading: false,
  error: null,
  selectedUser: null,
  selectedSession: null,
  selectedSubscription: null,
  selectedWebhook: null,
});

export const adminStore = {
  state: readonly(state),

  setUsers(users: AdminUser[], pagination?: PaginationInfo) {
    state.users = users;
    if (pagination) state.usersPagination = pagination;
  },

  setSelectedUser(user: AdminUser | null) {
    state.selectedUser = user;
  },

  setSessions(sessions: AdminSession[], pagination?: PaginationInfo) {
    state.sessions = sessions;
    if (pagination) state.sessionsPagination = pagination;
  },

  setSelectedSession(session: AdminSession | null) {
    state.selectedSession = session;
  },

  setSubscriptions(subscriptions: AdminSubscription[], pagination?: PaginationInfo) {
    state.subscriptions = subscriptions;
    if (pagination) state.subscriptionsPagination = pagination;
  },

  setSelectedSubscription(subscription: AdminSubscription | null) {
    state.selectedSubscription = subscription;
  },

  setWebhooks(webhooks: AdminWebhook[], pagination?: PaginationInfo) {
    state.webhooks = webhooks;
    if (pagination) state.webhooksPagination = pagination;
  },

  setSelectedWebhook(webhook: AdminWebhook | null) {
    state.selectedWebhook = webhook;
  },

  setAuditLogs(logs: AuditLog[], pagination?: PaginationInfo) {
    state.auditLogs = logs;
    if (pagination) state.auditLogsPagination = pagination;
  },

  setConfigs(configs: SystemConfig[]) {
    state.configs = configs;
  },

  setSystemHealth(health: SystemHealth) {
    state.systemHealth = health;
  },

  setLoading(loading: boolean) {
    state.loading = loading;
  },

  setError(error: string | null) {
    state.error = error;
  },

  clearError() {
    state.error = null;
  },

  clearAll() {
    state.users = [];
    state.sessions = [];
    state.subscriptions = [];
    state.webhooks = [];
    state.auditLogs = [];
    state.configs = [];
    state.systemHealth = null;
    state.selectedUser = null;
    state.selectedSession = null;
    state.selectedSubscription = null;
    state.selectedWebhook = null;
    state.error = null;
    state.loading = false;
  },
};
