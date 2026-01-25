import { httpGet, httpPost, httpPatch, httpDelete } from './http';
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

const API_URL = import.meta.env.VITE_API_URL || 'https://api.prmanager.app';

interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationInfo;
}

function buildQueryString(params: Record<string, any>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      query.append(key, String(value));
    }
  });
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

export const adminService = {
  async getUsers(params: {
    page?: number;
    limit?: number;
    role?: string;
    isActive?: boolean;
    isSuspended?: boolean;
    search?: string;
  } = {}) {
    const query = buildQueryString(params);
    const response = await httpGet(`${API_URL}/admin/users${query}`);
    if (!response.ok) throw new Error('Failed to fetch users');
    return response.json();
  },

  async getUserDetails(userId: string) {
    const response = await httpGet(`${API_URL}/admin/users/${userId}`);
    if (!response.ok) throw new Error('Failed to fetch user details');
    return response.json();
  },

  async changeUserRole(userId: string, role: 'USER' | 'ADMIN' | 'SUPERUSER') {
    const response = await httpPatch(`${API_URL}/admin/users/${userId}/role`, { role });
    if (!response.ok) throw new Error('Failed to change user role');
    return response.json();
  },

  async suspendUser(userId: string, reason: string) {
    const response = await httpPost(`${API_URL}/admin/users/${userId}/suspend`, { reason });
    if (!response.ok) throw new Error('Failed to suspend user');
    return response.json();
  },

  async unsuspendUser(userId: string) {
    const response = await httpPost(`${API_URL}/admin/users/${userId}/unsuspend`, {});
    if (!response.ok) throw new Error('Failed to unsuspend user');
    return response.json();
  },

  async deleteUser(userId: string) {
    const response = await httpDelete(`${API_URL}/admin/users/${userId}`);
    if (!response.ok) throw new Error('Failed to delete user');
    return response.json();
  },

  async getSessions(params: { page?: number; limit?: number } = {}) {
    const query = buildQueryString(params);
    const response = await httpGet(`${API_URL}/admin/sessions${query}`);
    if (!response.ok) throw new Error('Failed to fetch sessions');
    return response.json();
  },

  async getUserSessions(userId: string, params: { page?: number; limit?: number } = {}) {
    const query = buildQueryString(params);
    const response = await httpGet(`${API_URL}/admin/sessions/user/${userId}${query}`);
    if (!response.ok) throw new Error('Failed to fetch user sessions');
    return response.json();
  },

  async revokeSession(sessionId: string) {
    const response = await httpDelete(`${API_URL}/admin/sessions/${sessionId}`);
    if (!response.ok) throw new Error('Failed to revoke session');
    return response.json();
  },

  async revokeAllUserSessions(userId: string) {
    const response = await httpDelete(`${API_URL}/admin/sessions/user/${userId}/all`);
    if (!response.ok) throw new Error('Failed to revoke all sessions');
    return response.json();
  },

  async getSubscriptions(params: { page?: number; limit?: number; status?: string } = {}) {
    const query = buildQueryString(params);
    const response = await httpGet(`${API_URL}/admin/subscriptions${query}`);
    if (!response.ok) throw new Error('Failed to fetch subscriptions');
    return response.json();
  },

  async getSubscriptionDetails(subscriptionId: string) {
    const response = await httpGet(`${API_URL}/admin/subscriptions/${subscriptionId}`);
    if (!response.ok) throw new Error('Failed to fetch subscription details');
    return response.json();
  },

  async updateSubscriptionStatus(
    subscriptionId: string,
    status: 'on_trial' | 'active' | 'paused' | 'past_due' | 'unpaid' | 'cancelled' | 'expired'
  ) {
    const response = await httpPatch(`${API_URL}/admin/subscriptions/${subscriptionId}/status`, {
      status,
    });
    if (!response.ok) throw new Error('Failed to update subscription status');
    return response.json();
  },

  async getWebhooks(params: {
    page?: number;
    limit?: number;
    processed?: boolean;
    eventName?: string;
  } = {}) {
    const query = buildQueryString(params);
    const response = await httpGet(`${API_URL}/admin/webhooks${query}`);
    if (!response.ok) throw new Error('Failed to fetch webhooks');
    return response.json();
  },

  async getWebhookDetails(webhookId: string) {
    const response = await httpGet(`${API_URL}/admin/webhooks/${webhookId}`);
    if (!response.ok) throw new Error('Failed to fetch webhook details');
    return response.json();
  },

  async retryWebhook(webhookId: string) {
    const response = await httpPost(`${API_URL}/admin/webhooks/${webhookId}/retry`, {});
    if (!response.ok) throw new Error('Failed to retry webhook');
    return response.json();
  },

  async getAuditLogs(params: {
    page?: number;
    limit?: number;
    action?: string;
    performedBy?: string;
    targetUserId?: string;
    startDate?: string;
    endDate?: string;
  } = {}) {
    const query = buildQueryString(params);
    const response = await httpGet(`${API_URL}/admin/audit-logs${query}`);
    if (!response.ok) throw new Error('Failed to fetch audit logs');
    return response.json();
  },

  async getConfig() {
    const response = await httpGet(`${API_URL}/admin/config`);
    if (!response.ok) throw new Error('Failed to fetch config');
    return response.json();
  },

  async getConfigValue(key: string) {
    const response = await httpGet(`${API_URL}/admin/config/${key}`);
    if (!response.ok) throw new Error('Failed to fetch config value');
    return response.json();
  },

  async updateConfig(key: string, value: any) {
    const response = await httpPost(`${API_URL}/admin/config`, { key, value });
    if (!response.ok) throw new Error('Failed to update config');
    return response.json();
  },

  async deleteConfig(key: string) {
    const response = await httpDelete(`${API_URL}/admin/config/${key}`);
    if (!response.ok) throw new Error('Failed to delete config');
    return response.json();
  },

  async getHealth(): Promise<SystemHealth> {
    const response = await httpGet(`${API_URL}/admin/health`);
    if (!response.ok) throw new Error('Failed to fetch health status');
    return response.json();
  },
};
