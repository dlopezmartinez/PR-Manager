import { inject } from 'vue';
import { GitProviderKey } from '../plugins/gitProvider';
import type { IGitProvider } from '../providers';

export function useGitProvider(): IGitProvider {
  const provider = inject<IGitProvider>(GitProviderKey);

  if (!provider) {
    throw new Error('Git provider not available. Did you install the gitProvider plugin?');
  }

  return provider;
}

/**
 * @deprecated Use useGitProvider() instead
 */
export function useGitHub(): IGitProvider {
  return useGitProvider();
}
