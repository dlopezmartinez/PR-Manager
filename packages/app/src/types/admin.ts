export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN' | 'SUPERUSER';
  isActive: boolean;
  isSuspended: boolean;
  suspendedReason: string | null;
  suspendedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSession {
  id: string;
  userId: string;
  user?: {
    email: string;
    name: string | null;
  };
  createdAt: string;
  expiresAt: string;
}

export interface AdminSubscription {
  id: string;
  userId: string;
  user?: {
    email: string;
    name: string | null;
  };
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  lemonSqueezySubscriptionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminWebhook {
  id: string;
  eventId: string;
  eventName: string;
  processed: boolean;
  processedAt: string | null;
  error: string | null;
  errorCount: number;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  performedBy: string;
  targetUserId: string | null;
  targetUser?: {
    id: string;
    email: string;
    name: string | null;
  };
  changes: any;
  metadata: any;
  createdAt: string;
}

export interface SystemConfig {
  id: string;
  key: string;
  value: any;
  updatedAt: string;
}

export interface SystemHealth {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  responseTime: string;
  database: {
    connected: boolean;
    checkTime: string;
  };
  users: {
    total: number;
    active: number;
    suspended: number;
    admin: number;
    superuser: number;
  };
  sessions: {
    active: number;
  };
  subscriptions: {
    active: number;
    trial: number;
    cancelled: number;
    total: number;
  };
  webhooks: {
    processed: number;
    pending: number;
    failed: number;
    total: number;
  };
  auditLogs: {
    total: number;
  };
  uptime: number;
  memory: NodeJS.MemoryUsage;
  environment: string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}
