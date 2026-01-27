import type { AuthUser } from '../preload';
import { httpPost, httpGet } from './http';
import { API_URL } from '../config/api';

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
  async initialize(): Promise<boolean> {
    try {
      console.log('[AuthService] Getting access token from secure storage...');
      const accessToken = await window.electronAPI.auth.getToken();
      console.log('[AuthService] Access token result:', accessToken ? `${accessToken.substring(0, 20)}... (length: ${accessToken.length})` : 'null/undefined');
      return !!accessToken;
    } catch (error) {
      console.error('[AuthService] Failed to initialize auth service:', error);
      return false;
    }
  }

  async getAccessToken(): Promise<string | null> {
    try {
      return await window.electronAPI.auth.getToken();
    } catch (error) {
      console.error('Failed to get access token:', error);
      return null;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getAccessToken();
    return !!token;
  }

  async signup(email: string, password: string, name?: string): Promise<AuthResponse> {
    // Get device info for session tracking
    const deviceId = await window.electronAPI.session.getDeviceId();
    const deviceName = await window.electronAPI.session.getDeviceName();

    const response = await httpPost(`${API_URL}/auth/signup`, {
      email,
      password,
      name,
      deviceId,
      deviceName,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create account');
    }

    const data: AuthResponse = await response.json();
    await this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    // Get device info for session tracking
    const deviceId = await window.electronAPI.session.getDeviceId();
    const deviceName = await window.electronAPI.session.getDeviceName();

    const response = await httpPost(`${API_URL}/auth/login`, {
      email,
      password,
      deviceId,
      deviceName,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Invalid email or password');
    }

    const data: AuthResponse = await response.json();
    await this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

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

  async checkHealth(): Promise<boolean> {
    const token = await this.getAccessToken();
    if (!token) {
      return false;
    }

    try {
      const response = await httpGet(`${API_URL}/auth/health`);

      if (response.ok) {
        return true;
      }

      if (response.status === 401 || response.status === 403) {
        return false;
      }

      console.warn('[AuthService] Health check failed with status:', response.status);
      return true;
    } catch (error) {
      console.error('[AuthService] Health check network error:', error);
      return true;
    }
  }

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

  async logout(): Promise<void> {
    await this.clearAuth();
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const response = await httpPost(`${API_URL}/auth/forgot-password`, { email });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send reset email');
    }

    return response.json();
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const response = await httpPost(`${API_URL}/auth/reset-password`, {
      token,
      newPassword,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to reset password');
    }

    return response.json();
  }

  async syncSubscription(): Promise<{
    synced: boolean;
    status: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  }> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await httpPost(`${API_URL}/subscription/sync`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to sync subscription');
    }

    return response.json();
  }

  private async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    console.log('[AuthService] Saving access token to secure storage...');
    const tokenSaved = await window.electronAPI.auth.setToken(accessToken);
    console.log('[AuthService] Access token saved:', tokenSaved);
    if (!tokenSaved) {
      throw new Error('Failed to save credentials to Keychain. Access may have been denied.');
    }

    if (window.electronAPI.auth.setRefreshToken) {
      console.log('[AuthService] Saving refresh token to secure storage...');
      const refreshSaved = await window.electronAPI.auth.setRefreshToken(refreshToken);
      console.log('[AuthService] Refresh token saved:', refreshSaved);
      if (!refreshSaved) {
        throw new Error('Failed to save credentials to Keychain. Access may have been denied.');
      }
    }
  }

  private async clearAuth(): Promise<void> {
    await window.electronAPI.auth.clearToken();
    if (window.electronAPI.auth.clearRefreshToken) {
      await window.electronAPI.auth.clearRefreshToken();
    }
  }
}

export const authService = new AuthService();
