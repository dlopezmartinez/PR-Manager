/**
 * Providers barrel export
 *
 * Main entry point for the multi-provider architecture.
 * Re-exports all interfaces, types, and provider implementations.
 */

// Interfaces
export type {
  IGitProvider,
  IPullRequestManager,
  IReviewsManager,
  ICommentsManager,
  IChecksManager,
  IActionsManager,
  ListResult,
  EnrichedPullRequest,
  ReviewStatus,
  CommentsStats,
  ChecksSummary,
  MergeOptions,
  PRNodeIdResult,
} from './interfaces';

// Provider types
export type { ProviderType, ProviderConfig, ProviderCapabilities, ProviderInfo } from '../model/provider-types';
export { PROVIDER_CAPABILITIES, PROVIDER_INFO } from '../model/provider-types';

// Factory
export { ProviderFactory } from './ProviderFactory';

// GitHub Provider
export { GitHubProvider } from './github/GitHubProvider';

// GitLab Provider
export { GitLabProvider } from './gitlab/GitLabProvider';

// Base classes (for implementing new providers)
export { CacheableManager } from './base/CacheableManager';
