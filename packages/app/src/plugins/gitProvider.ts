/**
 * Git Provider Plugin for Vue
 *
 * Provides the Git provider (GitHub, GitLab, Bitbucket) throughout the Vue application.
 * Uses the provider configured in configStore.
 */

import type { App } from 'vue';
import type { IGitProvider } from '../providers';
import { ProviderFactory, GitHubProvider, GitLabProvider } from '../providers';
import { configStore } from '../stores/configStore';

// Symbol for dependency injection
export const GitProviderKey = Symbol('GitProvider');

// Legacy symbol for backwards compatibility
export const GitHubClientKey = GitProviderKey;

/**
 * Get the provider based on current configuration
 */
function getConfiguredProvider(): IGitProvider {
  const providerType = configStore.providerType || 'github';
  return ProviderFactory.getProvider(providerType);
}

/**
 * Git Provider Plugin
 *
 * Registers the Git provider as a Vue dependency injection.
 * Components can access it via useGitProvider() composable.
 */
export default {
  install(app: App) {
    // Get the configured provider
    const provider = getConfiguredProvider();

    // Provide for injection
    app.provide(GitProviderKey, provider);

    // Also expose globally for backwards compatibility
    app.config.globalProperties.$github = provider;
    app.config.globalProperties.$gitProvider = provider;
  },
};

// Export types for TypeScript
export type { IGitProvider };
export type { GitHubProvider, GitLabProvider };

// Re-export GitHubClient as alias for backwards compatibility
export { GitHubProvider as GitHubClient };

// Export function to switch providers at runtime
export function switchProvider(app: App): void {
  const provider = getConfiguredProvider();
  app.provide(GitProviderKey, provider);
  app.config.globalProperties.$github = provider;
  app.config.globalProperties.$gitProvider = provider;
}
