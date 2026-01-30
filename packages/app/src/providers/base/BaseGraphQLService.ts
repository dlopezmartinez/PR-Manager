/**
 * BaseGraphQLService - Abstract base class for GraphQL API services
 * Provides common GraphQL query/mutation execution with retry support
 */

import { getApiKey } from '../../stores/configStore';
import {
  executeGraphQL,
  HttpError,
  GraphQLError,
  getErrorMessage,
  isAuthError,
  isRateLimitError,
} from '../../utils/http';

// Re-export error utilities for consumers
export { HttpError, GraphQLError, getErrorMessage, isAuthError, isRateLimitError };

export interface GraphQLServiceConfig {
  /** Name of the provider for error messages (e.g., 'GitHub', 'GitLab') */
  providerName: string;
  /** GraphQL API endpoint URL */
  endpoint: string;
  /** Authorization header format: 'bearer' or 'token' */
  authFormat?: 'bearer' | 'token';
  /** Maximum retries for queries (default: 3) */
  queryRetries?: number;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
}

const DEFAULT_CONFIG = {
  authFormat: 'bearer' as const,
  queryRetries: 3,
  timeout: 30000,
};

export abstract class BaseGraphQLService {
  protected readonly providerName: string;
  protected readonly endpoint: string;
  protected readonly authFormat: 'bearer' | 'token';
  protected readonly queryRetries: number;
  protected readonly timeout: number;

  constructor(config: GraphQLServiceConfig) {
    this.providerName = config.providerName;
    this.endpoint = config.endpoint;
    this.authFormat = config.authFormat ?? DEFAULT_CONFIG.authFormat;
    this.queryRetries = config.queryRetries ?? DEFAULT_CONFIG.queryRetries;
    this.timeout = config.timeout ?? DEFAULT_CONFIG.timeout;
  }

  /**
   * Get the API token from secure storage
   * @throws Error if API key is not configured
   */
  protected getApiToken(): string {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error(`API token not configured. Please set your ${this.providerName} token.`);
    }
    return apiKey;
  }

  /**
   * Get authorization headers based on the configured format
   */
  protected getAuthHeaders(): Record<string, string> {
    const token = this.getApiToken();
    if (this.authFormat === 'bearer') {
      return { 'Authorization': `Bearer ${token}` };
    }
    return { 'PRIVATE-TOKEN': token };
  }

  /**
   * Execute a GraphQL query with automatic retry on transient failures
   *
   * Features:
   * - Automatic retry on 5xx errors, timeouts, and network issues
   * - Exponential backoff with jitter
   * - Proper error typing (HttpError, GraphQLError)
   * - User-friendly error messages
   */
  async executeQuery<T>(
    query: string,
    variables: Record<string, unknown> = {}
  ): Promise<T> {
    try {
      return await executeGraphQL<T>(
        this.endpoint,
        query,
        variables,
        this.getAuthHeaders(),
        {
          maxRetries: this.queryRetries,
          initialDelay: 1000,
          timeout: this.timeout,
        }
      );
    } catch (error) {
      if (error instanceof HttpError || error instanceof GraphQLError) {
        throw error;
      }
      throw new Error(`${this.providerName} API error: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Execute a mutation (no retry to avoid duplicates)
   */
  async executeMutation<T>(
    mutation: string,
    variables: Record<string, unknown> = {}
  ): Promise<T> {
    try {
      return await executeGraphQL<T>(
        this.endpoint,
        mutation,
        variables,
        this.getAuthHeaders(),
        {
          maxRetries: 0,
          timeout: this.timeout,
        }
      );
    } catch (error) {
      if (error instanceof HttpError || error instanceof GraphQLError) {
        throw error;
      }
      throw new Error(`${this.providerName} API error: ${getErrorMessage(error)}`);
    }
  }
}
