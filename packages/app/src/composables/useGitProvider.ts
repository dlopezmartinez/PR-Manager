import { ProviderFactory } from '../providers';
import { configStore } from '../stores/configStore';
import type { IGitProvider } from '../providers';

export function useGitProvider(): IGitProvider {
  // Always get the provider based on current configStore.providerType
  // This ensures we get the correct provider even after switching
  const providerType = configStore.providerType || 'github';
  return ProviderFactory.getProvider(providerType);
}

/**
 * @deprecated Use useGitProvider() instead
 */
export function useGitHub(): IGitProvider {
  return useGitProvider();
}
