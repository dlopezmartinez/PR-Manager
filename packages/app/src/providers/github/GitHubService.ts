/**
 * GitHubService - Low-level GraphQL API client for GitHub
 * Handles authentication and query execution with retry support
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

const GITHUB_API_ENDPOINT = 'https://api.github.com/graphql';

// Re-export error utilities for consumers
export { HttpError, GraphQLError, getErrorMessage, isAuthError, isRateLimitError };

export class GitHubService {
  private endpoint: string;

  constructor(endpoint: string = GITHUB_API_ENDPOINT) {
    this.endpoint = endpoint;
  }

  /**
   * Get API key from secure storage
   * @throws Error if API key is not configured
   */
  private getAuthToken(): string {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('API key not configured. Please set your GitHub token.');
    }
    return apiKey;
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
        {
          'Authorization': `Bearer ${this.getAuthToken()}`,
        },
        {
          maxRetries: 3,
          initialDelay: 1000,
          timeout: 30000,
        }
      );
    } catch (error) {
      // Re-throw with better context if needed
      if (error instanceof HttpError || error instanceof GraphQLError) {
        throw error;
      }

      // Wrap unknown errors
      throw new Error(`GitHub API error: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Execute a mutation (typically no retry for mutations to avoid duplicates)
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
        {
          'Authorization': `Bearer ${this.getAuthToken()}`,
        },
        {
          maxRetries: 0, // No retry for mutations
          timeout: 30000,
        }
      );
    } catch (error) {
      if (error instanceof HttpError || error instanceof GraphQLError) {
        throw error;
      }
      throw new Error(`GitHub API error: ${getErrorMessage(error)}`);
    }
  }
}
