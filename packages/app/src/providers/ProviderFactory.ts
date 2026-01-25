/**
 * ProviderFactory - Creates and manages Git provider instances
 *
 * Supports GitHub and GitLab. Bitbucket provider will be added
 * in future implementations.
 */

import type { IGitProvider } from './interfaces';
import type { ProviderType, ProviderConfig } from '../model/provider-types';
import { GitHubProvider } from './github/GitHubProvider';
import { GitLabProvider } from './gitlab/GitLabProvider';

/**
 * Provider registry type
 */
type ProviderConstructor = {
  getInstance(): IGitProvider;
  resetInstance(): void;
};

/**
 * Registry of available providers
 */
const PROVIDERS: Record<ProviderType, ProviderConstructor | null> = {
  github: GitHubProvider,
  gitlab: GitLabProvider,
  bitbucket: null, // TODO: Implement BitbucketProvider
};

/**
 * ProviderFactory
 *
 * Factory class for creating and managing Git provider instances.
 * Uses singleton pattern for each provider type.
 */
export class ProviderFactory {
  private static currentProvider: IGitProvider | null = null;
  private static currentType: ProviderType | null = null;

  /**
   * Get the current provider instance
   * Defaults to GitHub if no provider is set
   */
  static getProvider(type: ProviderType = 'github'): IGitProvider {
    // Return cached provider if same type
    if (this.currentProvider && this.currentType === type) {
      return this.currentProvider;
    }

    // Create new provider
    const providerConstructor = PROVIDERS[type];

    if (!providerConstructor) {
      throw new Error(
        `Provider '${type}' is not yet implemented. Currently 'github' and 'gitlab' are supported.`
      );
    }

    this.currentProvider = providerConstructor.getInstance();
    this.currentType = type;

    return this.currentProvider;
  }

  /**
   * Get the GitHub provider (convenience method)
   */
  static getGitHubProvider(): GitHubProvider {
    return this.getProvider('github') as GitHubProvider;
  }

  /**
   * Get the GitLab provider (convenience method)
   */
  static getGitLabProvider(): GitLabProvider {
    return this.getProvider('gitlab') as GitLabProvider;
  }

  /**
   * Check if a provider type is available
   */
  static isProviderAvailable(type: ProviderType): boolean {
    return PROVIDERS[type] !== null;
  }

  /**
   * Get list of available provider types
   */
  static getAvailableProviders(): ProviderType[] {
    return (Object.entries(PROVIDERS) as [ProviderType, ProviderConstructor | null][])
      .filter(([, constructor]) => constructor !== null)
      .map(([type]) => type);
  }

  /**
   * Reset the current provider (useful for switching accounts or testing)
   */
  static resetProvider(): void {
    if (this.currentType && PROVIDERS[this.currentType]) {
      PROVIDERS[this.currentType]!.resetInstance();
    }
    this.currentProvider = null;
    this.currentType = null;
  }

  /**
   * Clear all caches for the current provider
   */
  static clearCaches(): void {
    if (this.currentProvider) {
      this.currentProvider.clearAllCaches();
    }
  }

  /**
   * Create a provider from configuration
   */
  static createFromConfig(config: ProviderConfig): IGitProvider {
    return this.getProvider(config.type);
  }

  /**
   * Get the current provider type
   */
  static getCurrentType(): ProviderType | null {
    return this.currentType;
  }
}

export default ProviderFactory;
