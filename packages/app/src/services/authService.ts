/**
 * Authentication Service
 * Handles communication with the PR Manager backend for auth and subscriptions
 * Uses HTTP interceptor for transparent token management and refresh
 */

import type { AuthUser } from '../preload';
import { httpPost, httpGet, httpFetch } from './http';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.prmanager.app';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface SubscriptionStatus {
  active: boolean;
  status: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  trialEndsAt?: string;
  trialDaysLeft?: number;
  isTrialing?: boolean;
  message?: string;
}

export interface CheckoutResponse {
  sessionId: string;
  url: string;
}

export interface PortalResponse {
  url: string;
}

class AuthService {
  /**
   * Initialize the auth service by loading the stored tokens
   */
  async initialize(): Promise<boolean> {
    try {
      const accessToken = await window.electronAPI.auth.getToken();
      return !!accessToken;
    } catch (error) {
      console.error('Failed to initialize auth service:', error);
      return false;
    }
  }

  /**
   * Get the current access token
   */
  async getAccessToken(): Promise<string | null> {
    try {
      return await window.electronAPI.auth.getToken();
    } catch (error) {
      console.error('Failed to get access token:', error);
      return null;
    }
  }

  /**
   * Check if user is authenticated (has valid access token)
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await this.getAccessToken();
    return !!token;
  }

  /**
   * Sign up a new user
   */
  async signup(email: string, password: string, name?: string): Promise<AuthResponse> {
    const response = await httpPost(`${API_URL}/auth/signup`, {
      email,
      password,
      name,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create account');
    }

    const data: AuthResponse = await response.json();
    await this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  /**
   * Log in an existing user
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await httpPost(`${API_URL}/auth/login`, {
      email,
      password,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Invalid email or password');
    }

    const data: AuthResponse = await response.json();
    await this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  /**
   * Verify the current token is still valid
   */
  async verifyToken(): Promise<{ valid: boolean; user?: AuthUser }> {
    const token = await this.getAccessToken();
    if (!token) {
      return { valid: false };
    }

    try {
      const response = await httpPost(`${API_URL}/auth/verify-token`, {
        token,
      });

      if (!response.ok) {
        await this.clearAuth();
        return { valid: false };
      }

      const data = await response.json();
      if (data.valid && data.user) {
        await window.electronAPI.auth.setUser(data.user);
      }
      return data;
    } catch (error) {
      console.error('Token verification failed:', error);
      return { valid: false };
    }
  }

  /**
   * Health check - lightweight token validation
   * Returns true if token is valid, false otherwise
   */
  async checkHealth(): Promise<boolean> {
    if (!this.token) {
      return false;
    }

    try {
      const response = await fetch(`${API_URL}/auth/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      });

      if (response.ok) {
        return true;
      }

      if (response.status === 401 || response.status === 403) {
        // Token is invalid/expired - clear auth
        await this.clearAuth();
        return false;
      }

      // Other errors (5xx, network) - don't clear auth
      console.warn('Auth health check failed with status:', response.status);
      return true; // Assume token is still valid on network errors
    } catch (error) {
      // Network error - don't clear auth, just log
      console.error('Auth health check network error:', error);
      return true; // Assume token is still valid on network errors
    }
  }

  /**
   * Get subscription status for the current user
   */
  async getSubscriptionStatus(): Promise<SubscriptionStatus> {
    const token = await this.getAccessToken();
    if (!token) {
      return { active: false, status: 'none', message: 'Not authenticated' };
    }

    try {
      const response = await httpGet(`${API_URL}/subscription/status`);

      if (!response.ok) {
        if (response.status === 401) {
          await this.clearAuth();
          return { active: false, status: 'unauthorized', message: 'Session expired' };
        }
        return { active: false, status: 'error', message: 'Failed to check subscription' };
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get subscription status:', error);
      return { active: false, status: 'error', message: 'Network error' };
    }
  }

  /**
   * Create a checkout session for subscription
   */
  async createCheckoutSession(priceId: 'monthly' | 'yearly'): Promise<CheckoutResponse> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await httpPost(`${API_URL}/subscription/create-checkout`, {
      priceId,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create checkout session');
    }

    return await response.json();
  }

  /**
   * Open the Stripe customer portal for subscription management
   */
  async openCustomerPortal(): Promise<PortalResponse> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await httpPost(`${API_URL}/subscription/manage`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to open customer portal');
    }

    return await response.json();
  }

  /**
   * Cancel subscription at period end
   */
  async cancelSubscription(): Promise<void> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await httpPost(`${API_URL}/subscription/cancel`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to cancel subscription');
    }
  }

  /**
   * Reactivate a subscription that was set to cancel
   */
  async reactivateSubscription(): Promise<void> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await httpPost(`${API_URL}/subscription/reactivate`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to reactivate subscription');
    }
  }

  /**
   * Log out the current user
   */
  async logout(): Promise<void> {
    await this.clearAuth();
  }

  /**
   * Store tokens securely (using electron safe storage)
   */
  private async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    await window.electronAPI.auth.setToken(accessToken);
    if (window.electronAPI.auth.setRefreshToken) {
      await window.electronAPI.auth.setRefreshToken(refreshToken);
    }
  }

  /**
   * Clear all auth data
   */
  private async clearAuth(): Promise<void> {
    await window.electronAPI.auth.clearToken();
    if (window.electronAPI.auth.clearRefreshToken) {
      await window.electronAPI.auth.clearRefreshToken();
    }
  }
}

// Singleton instance
export const authService = new AuthService();
