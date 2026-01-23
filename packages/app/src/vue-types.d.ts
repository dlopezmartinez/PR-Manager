// Type augmentation for Vue global properties
import type { IGitProvider } from './providers';

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $github: IGitProvider;
    $gitProvider: IGitProvider;
  }
}

export {};
