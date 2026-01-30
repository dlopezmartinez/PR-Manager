/**
 * GitHubService - GraphQL API client for GitHub
 * Extends BaseGraphQLService with GitHub-specific configuration
 */

import {
  BaseGraphQLService,
  HttpError,
  GraphQLError,
  getErrorMessage,
  isAuthError,
  isRateLimitError,
} from '../base/BaseGraphQLService';

const GITHUB_API_ENDPOINT = 'https://api.github.com/graphql';

// Re-export error utilities for consumers
export { HttpError, GraphQLError, getErrorMessage, isAuthError, isRateLimitError };

export class GitHubService extends BaseGraphQLService {
  constructor(endpoint: string = GITHUB_API_ENDPOINT) {
    super({
      providerName: 'GitHub',
      endpoint,
      authFormat: 'bearer',
      queryRetries: 3,
      timeout: 30000,
    });
  }
}
